import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { createClient } from "@supabase/supabase-js";
import { createDropPackage } from "../app/lib/drop/dropRepository";
import {
  acceptDropSpaceInvitation,
  createDropSpace,
  inviteDropSpaceMember,
  resolveDropSpaceSession,
} from "../app/lib/drop/dropSpaceRepository";
import {
  completeDropUpload,
  getDropUploadResumeState,
  initializeDropSpaceUpload,
  receiveDropUploadPart,
} from "../app/lib/drop/storage/dropUploadService";
import { getDropUploadBundle } from "../app/lib/drop/storage/dropStorageRepository";
import { removeDropStoredFile, statDropQuarantineFile } from "../app/lib/drop/storage/dropLocalStorage";

const RULES_VERSION = "DIMPRO-DROP-UPLOAD-HU-1.0";
const CHUNK_BYTES = 64 * 1024 * 1024;
const FILE_BYTES = CHUNK_BYTES + 1024 * 1024;

function toWebFileStream(path: string, start: number, endInclusive: number) {
  return Readable.toWeb(createReadStream(path, { start, end: endInclusive })) as ReadableStream<Uint8Array>;
}

async function createDeterministicFile(path: string) {
  const file = await open(path, "w", 0o600);
  const block = Buffer.alloc(1024 * 1024);
  for (let index = 0; index < block.length; index += 1) block[index] = 65 + (index % 26);
  const hash = createHash("sha256");
  try {
    for (let part = 0; part < 65; part += 1) {
      await file.write(block, 0, block.length, part * block.length);
      hash.update(block);
    }
    await file.sync();
  } finally {
    await file.close();
  }
  return hash.digest("hex");
}

async function main() {
  if (process.env.DROP_ALLOW_V034_POST_SQL_TEST !== "DROP-V034-POST-SQL-TEST") {
    throw new Error("Hiányzó DROP 0.3.4 utóaktiválási tesztengedély.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert.ok(url && key, "A Supabase szerveroldali környezet nincs beállítva.");
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const unique = Date.now().toString(36);
  const sourcePath = `/root/dimprover/.data/drop-v034-source-${unique}.txt`;
  let spaceId: string | null = null;
  let packageId: string | null = null;
  let sessionId: string | null = null;
  let storageKey: string | null = null;

  try {
    const expectedSha256 = await createDeterministicFile(sourcePath);
    assert.equal((await stat(sourcePath)).size, FILE_BYTES);

    const createdSpace = await createDropSpace({
      name: `DROP 0.3.4 multipart integráció ${unique}`,
      ownerLicenseId: `drop-v034-license-${unique}`,
      ownerUserId: `drop-v034-owner-${unique}`,
      ownerName: "DIMPRO DROP 0.3.4 tesztgazda",
      ownerEmail: `owner-${unique}@example.hu`,
      licenseEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      accessExpiryMode: "license",
      maxMembers: 10,
      maxPackages: 10,
      storageQuotaBytes: 1024 * 1024 * 1024,
      allowGuestPackageCreation: true,
      allowGuestInvites: false,
    });
    spaceId = createdSpace.space.id;
    const invitation = await inviteDropSpaceMember(spaceId, {
      displayName: "Multipart közreműködő",
      email: `contributor-${unique}@example.hu`,
      role: "contributor",
    });
    const accepted = await acceptDropSpaceInvitation(invitation.rawInvitationToken);
    const session = await resolveDropSpaceSession(accepted.sessionToken);

    const created = await createDropPackage({
      mode: "file",
      title: `DROP 0.3.4 multipart csomag ${unique}`,
      description: "Automatikus megszakítás–folytatás és szabályelfogadás teszt.",
      uploaderName: session.membership.displayName,
      uploaderEmail: session.membership.email,
      retentionDays: 7,
      recipients: [],
      groups: [],
      maxFileCount: 5,
      maxFileSizeBytes: 500 * 1024 * 1024,
      maxTotalSizeBytes: 800 * 1024 * 1024,
      spaceContext: {
        spaceId,
        createdByMembershipId: session.membership.id,
        visibility: "private",
        selectedMembershipIds: [],
      },
    }, {
      userId: `space-member:${session.membership.id}`,
      name: session.membership.displayName,
      email: session.membership.email,
    });
    packageId = created.package.id;
    const activePackageId = created.package.id;
    const notifyOff = await client.from("drop_packages").update({ notify_on_upload_complete: false }).eq("id", activePackageId);
    assert.equal(notifyOff.error, null, notifyOff.error?.message);

    await assert.rejects(
      () => initializeDropSpaceUpload({
        session,
        packageId: activePackageId,
        body: {
          fileName: "multipart-65mb.txt",
          sizeBytes: FILE_BYTES,
          mimeType: "text/plain",
          clientUploadId: `multipart-${unique}`,
        },
      }),
      (error: unknown) => (error as { code?: string }).code === "DROP_UPLOAD_RULES_NOT_ACCEPTED",
    );
    const noAcceptanceRecords = await Promise.all([
      client.from("drop_files").select("id", { count: "exact", head: true }).eq("package_id", packageId),
      client.from("drop_upload_sessions").select("id", { count: "exact", head: true }).eq("package_id", packageId),
    ]);
    for (const result of noAcceptanceRecords) assert.equal(result.error, null, result.error?.message);
    assert.equal(noAcceptanceRecords[0].count || 0, 0);
    assert.equal(noAcceptanceRecords[1].count || 0, 0);

    const acceptedAt = new Date().toISOString();
    const initialized = await initializeDropSpaceUpload({
      session,
      packageId,
      body: {
        fileName: "multipart-65mb.txt",
        sizeBytes: FILE_BYTES,
        mimeType: "text/plain",
        clientUploadId: `multipart-${unique}`,
        rulesAccepted: true,
        rulesVersion: RULES_VERSION,
        rulesAcceptedAt: acceptedAt,
      },
    });
    assert.equal(initialized.protocol, "multipart");
    assert.equal(initialized.session.chunkSizeBytes, CHUNK_BYTES);
    assert.equal(initialized.session.totalParts, 2);
    assert.deepEqual(initialized.completedPartNumbers, []);
    sessionId = initialized.session.id;
    const bundle = await getDropUploadBundle(sessionId);
    assert.ok(bundle);
    storageKey = bundle.file.storage_key;

    const firstPart = await receiveDropUploadPart({
      uploadId: sessionId,
      partNumber: 1,
      rawToken: initialized.uploadToken,
      body: toWebFileStream(sourcePath, 0, CHUNK_BYTES - 1),
      contentLength: CHUNK_BYTES,
    });
    assert.equal(firstPart.receivedBytes, CHUNK_BYTES);
    assert.equal(firstPart.completedParts, 1);
    assert.equal(firstPart.totalParts, 2);
    assert.equal(firstPart.allPartsReceived, false);

    const interruptedState = await getDropUploadResumeState({ uploadId: sessionId, rawToken: initialized.uploadToken });
    assert.equal(interruptedState.session.completedParts, 1);
    assert.deepEqual(interruptedState.parts.filter((part) => part.completed).map((part) => part.partNumber), [1]);

    const resumed = await initializeDropSpaceUpload({
      session,
      packageId,
      body: {
        fileName: "multipart-65mb.txt",
        sizeBytes: FILE_BYTES,
        mimeType: "text/plain",
        clientUploadId: `multipart-${unique}`,
        rulesAccepted: true,
        rulesVersion: RULES_VERSION,
        rulesAcceptedAt: new Date().toISOString(),
      },
    });
    assert.equal(resumed.session.id, sessionId);
    assert.equal(resumed.protocol, "multipart");
    assert.deepEqual(resumed.completedPartNumbers, [1]);

    const secondPart = await receiveDropUploadPart({
      uploadId: sessionId,
      partNumber: 2,
      rawToken: resumed.uploadToken,
      body: toWebFileStream(sourcePath, CHUNK_BYTES, FILE_BYTES - 1),
      contentLength: FILE_BYTES - CHUNK_BYTES,
    });
    assert.equal(secondPart.receivedBytes, FILE_BYTES - CHUNK_BYTES);
    assert.equal(secondPart.completedParts, 2);
    assert.equal(secondPart.allPartsReceived, true);

    const completed = await completeDropUpload({ uploadId: sessionId, rawToken: resumed.uploadToken });
    assert.equal(completed.quarantineOnly, true);
    assert.equal(completed.downloadable, false);
    assert.equal(completed.file.securityStatus, "scanner_required");
    assert.equal(completed.file.sizeBytes, FILE_BYTES);
    assert.equal(completed.inspection.detectedMimeType.startsWith("text/plain"), true);
    assert.equal((await statDropQuarantineFile(storageKey)).sizeBytes, FILE_BYTES);

    const [dbFile, dbSession, dbParts, auditEvents, packageAfter, spaceAfter] = await Promise.all([
      client.from("drop_files").select("upload_status,processing_status,security_status,sha256,size_stored_bytes").eq("id", initialized.file.id).single(),
      client.from("drop_upload_sessions").select("status,total_parts,completed_parts,uploaded_bytes,received_sha256,expires_at").eq("id", sessionId).single(),
      client.from("drop_upload_parts").select("part_number,size_bytes,checksum,status").eq("session_id", sessionId).order("part_number"),
      client.from("drop_events").select("event_type,payload,actor_name,actor_email").eq("package_id", packageId).in("event_type", ["upload.rules_accepted", "upload.rules_reconfirmed"]).order("created_at"),
      client.from("drop_packages").select("current_file_count,current_total_size_bytes,max_file_size_bytes").eq("id", packageId).single(),
      client.from("drop_spaces").select("current_storage_bytes").eq("id", spaceId).single(),
    ]);
    for (const result of [dbFile, dbSession, dbParts, auditEvents, packageAfter, spaceAfter]) assert.equal(result.error, null, result.error?.message);
    assert.equal(dbFile.data?.upload_status, "processing");
    assert.equal(dbFile.data?.processing_status, "quarantined");
    assert.equal(dbFile.data?.security_status, "scanner_required");
    assert.equal(dbFile.data?.sha256, expectedSha256);
    assert.equal(Number(dbFile.data?.size_stored_bytes), FILE_BYTES);
    assert.equal(dbSession.data?.status, "completed");
    assert.equal(Number(dbSession.data?.total_parts), 2);
    assert.equal(Number(dbSession.data?.completed_parts), 2);
    assert.equal(Number(dbSession.data?.uploaded_bytes), FILE_BYTES);
    assert.equal(dbSession.data?.received_sha256, expectedSha256);
    assert.ok(new Date(String(dbSession.data?.expires_at)).getTime() - Date.now() > 23 * 60 * 60_000);
    assert.equal(dbParts.data?.length, 2);
    assert.deepEqual(dbParts.data?.map((part) => part.status), ["completed", "completed"]);
    assert.equal(dbParts.data?.every((part) => /^[a-f0-9]{64}$/.test(String(part.checksum || ""))), true);
    assert.deepEqual(auditEvents.data?.map((event) => event.event_type), ["upload.rules_accepted", "upload.rules_reconfirmed"]);
    assert.equal(auditEvents.data?.every((event) => (event.payload as { rulesVersion?: string })?.rulesVersion === RULES_VERSION), true);
    assert.equal(Number(packageAfter.data?.current_file_count), 1);
    assert.equal(Number(packageAfter.data?.current_total_size_bytes), FILE_BYTES);
    assert.equal(Number(packageAfter.data?.max_file_size_bytes), 500 * 1024 * 1024);
    assert.equal(Number(spaceAfter.data?.current_storage_bytes), FILE_BYTES);

    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.3.4",
      fileBytes: FILE_BYTES,
      chunkBytes: CHUNK_BYTES,
      totalParts: 2,
      interruptionAfterPart: 1,
      resumedCompletedParts: resumed.completedPartNumbers,
      missingPartsUploadedAfterResume: [2],
      finalSha256Matches: dbFile.data?.sha256 === expectedSha256,
      quarantined: true,
      scannerRequired: true,
      downloadable: false,
      rulesWithoutAcceptanceBlocked: true,
      rulesAcceptedAudit: true,
      rulesReconfirmedAudit: true,
      resumeWindowHours: 24,
    }, null, 2));
  } finally {
    if (sessionId || storageKey) {
      await removeDropStoredFile({ sessionId: sessionId || undefined, storageKey: storageKey || undefined }).catch(() => undefined);
    }
    if (packageId) {
      const deleted = await client.from("drop_packages").delete().eq("id", packageId);
      if (deleted.error) throw deleted.error;
    }
    if (spaceId) {
      const deleted = await client.from("drop_spaces").delete().eq("id", spaceId);
      if (deleted.error) throw deleted.error;
    }
    await rm(sourcePath, { force: true });
    const [spaces, packages, files, sessions] = await Promise.all([
      client.from("drop_spaces").select("id", { count: "exact", head: true }).ilike("name", "DROP 0.3.4 multipart integráció%"),
      client.from("drop_packages").select("id", { count: "exact", head: true }).ilike("title", "DROP 0.3.4 multipart csomag%"),
      client.from("drop_files").select("id", { count: "exact", head: true }).eq("display_name", "multipart-65mb.txt"),
      client.from("drop_upload_sessions").select("id", { count: "exact", head: true }).eq("client_upload_id", `multipart-${unique}`),
    ]);
    for (const result of [spaces, packages, files, sessions]) if (result.error) throw result.error;
    assert.equal(spaces.count || 0, 0);
    assert.equal(packages.count || 0, 0);
    assert.equal(files.count || 0, 0);
    assert.equal(sessions.count || 0, 0);
    console.log(JSON.stringify({ cleanupCompleted: true, testSourceRetained: false, testStorageRetained: false, testSpaceRetained: false, testPackageRetained: false }, null, 2));
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
