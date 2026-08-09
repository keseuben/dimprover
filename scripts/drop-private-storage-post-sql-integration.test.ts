import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
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
  cancelDropUpload,
  completeDropUpload,
  initializeDropSpaceUpload,
  receiveDropUploadContent,
} from "../app/lib/drop/storage/dropUploadService";
import { getDropUploadBundle } from "../app/lib/drop/storage/dropStorageRepository";
import { statDropQuarantineFile, removeDropStoredFile } from "../app/lib/drop/storage/dropLocalStorage";

function toWebStream(buffer: Buffer): ReadableStream<Uint8Array> {
  return Readable.toWeb(Readable.from(buffer)) as ReadableStream<Uint8Array>;
}

async function main() {
  if (process.env.DROP_ALLOW_STORAGE_POST_SQL_TEST !== "DROP-STORAGE-POST-SQL-TEST") {
    throw new Error("Hiányzó DROP 0.3.3 utóaktiválási tesztengedély.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert.ok(url && key, "A Supabase szerveroldali környezet nincs beállítva.");
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const unique = Date.now().toString(36);
  let spaceId: string | null = null;
  let packageId: string | null = null;
  const createdSessionIds: string[] = [];
  const storageKeys: string[] = [];
  let cleanupCompleted = false;

  try {
    const createdSpace = await createDropSpace({
      name: `DROP 0.3.3 storage integráció ${unique}`,
      ownerLicenseId: `drop-v033-license-${unique}`,
      ownerUserId: `drop-v033-owner-${unique}`,
      ownerName: "DIMPRO DROP 0.3.3 tesztgazda",
      ownerEmail: `owner-${unique}@example.hu`,
      licenseEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      accessExpiryMode: "license",
      maxMembers: 10,
      maxPackages: 10,
      storageQuotaBytes: 50 * 1024 * 1024,
      allowGuestPackageCreation: true,
      allowGuestInvites: false,
    });
    spaceId = createdSpace.space.id;

    const invitation = await inviteDropSpaceMember(spaceId, {
      displayName: "Storage közreműködő",
      email: `contributor-${unique}@example.hu`,
      role: "contributor",
    });
    const accepted = await acceptDropSpaceInvitation(invitation.rawInvitationToken);
    const session = await resolveDropSpaceSession(accepted.sessionToken);
    assert.ok(session.permissions.includes("file.upload"));

    const created = await createDropPackage({
      mode: "file",
      title: `Storage integráció ${unique}`,
      description: "Automatikus DROP 0.3.3 privát tárhely integráció.",
      uploaderName: session.membership.displayName,
      uploaderEmail: session.membership.email,
      retentionDays: 7,
      recipients: [],
      groups: [],
      maxFileCount: 10,
      maxFileSizeBytes: 10 * 1024 * 1024,
      maxTotalSizeBytes: 25 * 1024 * 1024,
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

    const safeContent = Buffer.from("DIMPRO DROP 0.3.3 privát karanténfeltöltés integrációs teszt.\n", "utf8");
    const upload = await initializeDropSpaceUpload({
      session,
      packageId,
      body: {
        fileName: "biztonsagos-teszt.txt",
        sizeBytes: safeContent.length,
        mimeType: "text/plain",
        clientUploadId: `safe-${unique}`,
        rulesAccepted: true,
        rulesVersion: "DIMPRO-DROP-UPLOAD-HU-1.0",
        rulesAcceptedAt: new Date().toISOString(),
      },
    });
    createdSessionIds.push(upload.session.id);
    const bundleBefore = await getDropUploadBundle(upload.session.id);
    assert.ok(bundleBefore);
    storageKeys.push(bundleBefore.file.storage_key);
    assert.equal(bundleBefore.file.upload_status, "uploading");
    assert.equal(bundleBefore.session.status, "initialized");

    const afterReservation = await client.from("drop_packages")
      .select("current_file_count,current_total_size_bytes")
      .eq("id", packageId).single();
    assert.equal(afterReservation.error, null, afterReservation.error?.message);
    assert.equal(Number(afterReservation.data?.current_file_count), 1);
    assert.equal(Number(afterReservation.data?.current_total_size_bytes), safeContent.length);

    const received = await receiveDropUploadContent({
      uploadId: upload.session.id,
      rawToken: upload.uploadToken,
      body: toWebStream(safeContent),
      contentLength: safeContent.length,
    });
    assert.equal(received.receivedBytes, safeContent.length);
    assert.match(received.sha256, /^[a-f0-9]{64}$/);

    const completed = await completeDropUpload({ uploadId: upload.session.id, rawToken: upload.uploadToken });
    assert.equal(completed.quarantineOnly, true);
    assert.equal(completed.downloadable, false);
    assert.equal(completed.file.uploadStatus, "processing");
    assert.equal(completed.file.securityStatus, "scanner_required");
    assert.equal(completed.file.virusScanStatus, "scanner_required");
    assert.equal(completed.inspection.detectedMimeType.startsWith("text/plain"), true);

    const quarantineStat = await statDropQuarantineFile(bundleBefore.file.storage_key);
    assert.equal(quarantineStat.sizeBytes, safeContent.length);

    const dbFile = await client.from("drop_files")
      .select("upload_status,processing_status,virus_scan_status,security_status,size_stored_bytes,sha256,storage_key")
      .eq("id", upload.file.id).single();
    assert.equal(dbFile.error, null, dbFile.error?.message);
    assert.equal(dbFile.data?.upload_status, "processing");
    assert.equal(dbFile.data?.processing_status, "quarantined");
    assert.equal(dbFile.data?.virus_scan_status, "scanner_required");
    assert.equal(dbFile.data?.security_status, "scanner_required");
    assert.equal(Number(dbFile.data?.size_stored_bytes), safeContent.length);
    assert.match(String(dbFile.data?.sha256 || ""), /^[a-f0-9]{64}$/);

    const cancelledContent = Buffer.from("megszakitando", "utf8");
    const cancelled = await initializeDropSpaceUpload({
      session,
      packageId,
      body: {
        fileName: "megszakitando.txt",
        sizeBytes: cancelledContent.length,
        mimeType: "text/plain",
        clientUploadId: `cancel-${unique}`,
        rulesAccepted: true,
        rulesVersion: "DIMPRO-DROP-UPLOAD-HU-1.0",
        rulesAcceptedAt: new Date().toISOString(),
      },
    });
    createdSessionIds.push(cancelled.session.id);
    const cancelledBundle = await getDropUploadBundle(cancelled.session.id);
    assert.ok(cancelledBundle);
    storageKeys.push(cancelledBundle.file.storage_key);
    const cancelResult = await cancelDropUpload({
      uploadId: cancelled.session.id,
      rawToken: cancelled.uploadToken,
      reason: "Automatikus kvóta-visszaengedési teszt.",
    });
    assert.equal(Boolean(cancelResult?.reservationReleased), true);

    const afterCancel = await client.from("drop_packages")
      .select("current_file_count,current_total_size_bytes")
      .eq("id", packageId).single();
    assert.equal(afterCancel.error, null, afterCancel.error?.message);
    assert.equal(Number(afterCancel.data?.current_file_count), 1);
    assert.equal(Number(afterCancel.data?.current_total_size_bytes), safeContent.length);

    const spaceAfter = await client.from("drop_spaces").select("current_storage_bytes").eq("id", spaceId).single();
    assert.equal(spaceAfter.error, null, spaceAfter.error?.message);
    assert.equal(Number(spaceAfter.data?.current_storage_bytes), safeContent.length);

    const sessions = await client.from("drop_upload_sessions")
      .select("status,reservation_released,received_sha256,finalized_at")
      .in("id", createdSessionIds);
    assert.equal(sessions.error, null, sessions.error?.message);
    assert.equal(sessions.data?.some((row) => row.status === "completed" && row.reservation_released === false), true);
    assert.equal(sessions.data?.some((row) => row.status === "failed" && row.reservation_released === true), true);

    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.3.3",
      atomicQuotaReservation: true,
      streamingUpload: true,
      sha256Persisted: true,
      mimeDetected: completed.inspection.detectedMimeType,
      quarantinePersisted: true,
      scannerRequired: true,
      downloadable: false,
      abortReleasedQuota: true,
      packageReservedBytes: Number(afterCancel.data?.current_total_size_bytes),
      spaceReservedBytes: Number(spaceAfter.data?.current_storage_bytes),
      completedSessionCount: 1,
      abortedSessionCount: 1,
      emailDisabledForTest: true,
    }, null, 2));
  } finally {
    for (let i = 0; i < createdSessionIds.length; i += 1) {
      await removeDropStoredFile({ sessionId: createdSessionIds[i], storageKey: storageKeys[i] }).catch(() => undefined);
    }
    if (packageId) {
      const deleted = await client.from("drop_packages").delete().eq("id", packageId);
      if (deleted.error) throw new Error(`DROP 0.3.3 csomagtakarítási hiba: ${deleted.error.message}`);
    }
    if (spaceId) {
      const deleted = await client.from("drop_spaces").delete().eq("id", spaceId);
      if (deleted.error) throw new Error(`DROP 0.3.3 tértakarítási hiba: ${deleted.error.message}`);
    }
    await rm(process.env.DROP_STORAGE_LOCAL_ROOT || "/var/lib/dimpro/drop-v033-integration", { recursive: true, force: true });
    const [remainingSpaces, remainingPackages] = await Promise.all([
      client.from("drop_spaces").select("id", { count: "exact", head: true }).ilike("name", "DROP 0.3.3 storage integráció%"),
      client.from("drop_packages").select("id", { count: "exact", head: true }).ilike("title", "Storage integráció%"),
    ]);
    if (remainingSpaces.error || remainingPackages.error) throw remainingSpaces.error || remainingPackages.error;
    assert.equal(remainingSpaces.count || 0, 0);
    assert.equal(remainingPackages.count || 0, 0);
    cleanupCompleted = true;
    console.log(JSON.stringify({ cleanupCompleted, testStorageRetained: false, testSpaceRetained: false, testPackageRetained: false }, null, 2));
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
