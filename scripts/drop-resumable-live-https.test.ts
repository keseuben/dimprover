import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import https from "node:https";
import { createClient } from "@supabase/supabase-js";
import { createDropPackage } from "../app/lib/drop/dropRepository";
import {
  acceptDropSpaceInvitation,
  createDropSpace,
  inviteDropSpaceMember,
} from "../app/lib/drop/dropSpaceRepository";
import { DROP_SPACE_SESSION_COOKIE } from "../app/lib/drop/dropSpaceSecurity";
import { getDropUploadBundle } from "../app/lib/drop/storage/dropStorageRepository";
import { removeDropStoredFile, statDropQuarantineFile } from "../app/lib/drop/storage/dropLocalStorage";

const RULES_VERSION = "DIMPRO-DROP-UPLOAD-HU-1.0";
const CHUNK_BYTES = 64 * 1024 * 1024;
const FILE_BYTES = CHUNK_BYTES + 1024 * 1024;

type RequestInput = {
  method?: string;
  json?: unknown;
  buffer?: Buffer;
  cookie?: string;
  authorization?: string;
};

function request(path: string, input: RequestInput = {}) {
  return new Promise<{ status: number; json: unknown; raw: string }>((resolve, reject) => {
    const payload = input.buffer ?? (input.json === undefined ? null : Buffer.from(JSON.stringify(input.json), "utf8"));
    const req = https.request({
      hostname: "drop.dimpro.hu",
      port: 443,
      path,
      method: input.method || "GET",
      timeout: 3_600_000,
      headers: {
        Accept: "application/json",
        ...(payload ? {
          "Content-Type": input.buffer ? "application/octet-stream" : "application/json",
          "Content-Length": payload.length,
        } : {}),
        ...(input.cookie ? { Cookie: input.cookie } : {}),
        ...(input.authorization ? { Authorization: input.authorization } : {}),
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json: unknown = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { /* raw retained */ }
        resolve({ status: response.statusCode || 0, json, raw });
      });
    });
    req.on("timeout", () => req.destroy(new Error("HTTPS feltöltési időtúllépés.")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function assertNoStorageSecrets(raw: string) {
  for (const forbidden of ["storage_key", "storageKey", "storage_bucket", "storageBucket", "received_sha256", '"sha256"', "DROP_UPLOAD_SESSION_SECRET"]) {
    assert.equal(raw.includes(forbidden), false, `Tiltott belső mező az API-válaszban: ${forbidden}`);
  }
}

async function main() {
  if (process.env.DROP_ALLOW_V034_LIVE_HTTPS_TEST !== "DROP-V034-LIVE-HTTPS-TEST") {
    throw new Error("Hiányzó DROP 0.3.4 éles HTTPS tesztengedély.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert.ok(url && key);
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const unique = Date.now().toString(36);
  let spaceId: string | null = null;
  let packageId: string | null = null;
  let uploadSessionId: string | null = null;
  let storageKey: string | null = null;

  try {
    const createdSpace = await createDropSpace({
      name: `DROP 0.3.4 éles HTTPS ${unique}`,
      ownerLicenseId: `drop-v034-live-license-${unique}`,
      ownerUserId: `drop-v034-live-owner-${unique}`,
      ownerName: "DROP 0.3.4 éles tesztgazda",
      ownerEmail: `owner-${unique}@example.hu`,
      licenseEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      accessExpiryMode: "license",
      maxMembers: 5,
      maxPackages: 5,
      storageQuotaBytes: 1024 * 1024 * 1024,
      allowGuestPackageCreation: true,
      allowGuestInvites: false,
    });
    spaceId = createdSpace.space.id;
    const invitation = await inviteDropSpaceMember(spaceId, {
      displayName: "Éles HTTPS közreműködő",
      email: `contributor-${unique}@example.hu`,
      role: "contributor",
    });
    const accepted = await acceptDropSpaceInvitation(invitation.rawInvitationToken);
    const created = await createDropPackage({
      mode: "file",
      title: `DROP 0.3.4 éles HTTPS csomag ${unique}`,
      description: "Valós TLS, Nginx és 64 MB-os streaming teszt.",
      uploaderName: accepted.membership.displayName,
      uploaderEmail: accepted.membership.email,
      retentionDays: 3,
      recipients: [],
      groups: [],
      maxFileCount: 3,
      maxFileSizeBytes: 500 * 1024 * 1024,
      maxTotalSizeBytes: 800 * 1024 * 1024,
      spaceContext: {
        spaceId,
        createdByMembershipId: accepted.membership.id,
        visibility: "private",
        selectedMembershipIds: [],
      },
    }, {
      userId: `space-member:${accepted.membership.id}`,
      name: accepted.membership.displayName,
      email: accepted.membership.email,
    });
    packageId = created.package.id;
    const activePackageId = created.package.id;
    const disableMail = await client.from("drop_packages").update({ notify_on_upload_complete: false }).eq("id", activePackageId);
    assert.equal(disableMail.error, null, disableMail.error?.message);
    const cookie = `${DROP_SPACE_SESSION_COOKIE}=${accepted.sessionToken}`;

    const content = Buffer.alloc(FILE_BYTES, 66);
    content[content.length - 1] = 10;
    const expectedSha256 = createHash("sha256").update(content).digest("hex");

    const initResponse = await request(`/api/drop/spaces/packages/${activePackageId}/uploads/init`, {
      method: "POST",
      cookie,
      json: {
        fileName: "live-https-65mb.txt",
        sizeBytes: content.length,
        mimeType: "text/plain",
        clientUploadId: `live-https-${unique}`,
        rulesAccepted: true,
        rulesVersion: RULES_VERSION,
        rulesAcceptedAt: new Date().toISOString(),
      },
    });
    assert.equal(initResponse.status, 201, initResponse.raw);
    assertNoStorageSecrets(initResponse.raw);
    const initialized = (initResponse.json as {
      initialized?: {
        protocol: string;
        session: { id: string; totalParts: number; chunkSizeBytes: number };
        uploadToken: string;
        partUrlTemplate: string;
        completeUrl: string;
      };
    }).initialized;
    assert.ok(initialized);
    assert.equal(initialized.protocol, "multipart");
    assert.equal(initialized.session.totalParts, 2);
    assert.equal(initialized.session.chunkSizeBytes, CHUNK_BYTES);
    uploadSessionId = initialized.session.id;
    const bundle = await getDropUploadBundle(uploadSessionId);
    assert.ok(bundle);
    storageKey = bundle.file.storage_key;

    const firstPart = await request(initialized.partUrlTemplate.replace("{partNumber}", "1"), {
      method: "PUT",
      buffer: content.subarray(0, CHUNK_BYTES),
      authorization: `Bearer ${initialized.uploadToken}`,
    });
    assert.equal(firstPart.status, 200, firstPart.raw);
    assertNoStorageSecrets(firstPart.raw);
    assert.equal((firstPart.json as { result?: { receivedBytes?: number; completedParts?: number } }).result?.receivedBytes, CHUNK_BYTES);
    assert.equal((firstPart.json as { result?: { completedParts?: number } }).result?.completedParts, 1);

    const resumedResponse = await request(`/api/drop/spaces/packages/${activePackageId}/uploads/init`, {
      method: "POST",
      cookie,
      json: {
        fileName: "live-https-65mb.txt",
        sizeBytes: content.length,
        mimeType: "text/plain",
        clientUploadId: `live-https-${unique}`,
        rulesAccepted: true,
        rulesVersion: RULES_VERSION,
        rulesAcceptedAt: new Date().toISOString(),
      },
    });
    assert.equal(resumedResponse.status, 201, resumedResponse.raw);
    const resumed = (resumedResponse.json as {
      initialized?: { session: { id: string }; uploadToken: string; partUrlTemplate: string; completeUrl: string; completedPartNumbers: number[] };
    }).initialized;
    assert.ok(resumed);
    assert.equal(resumed.session.id, uploadSessionId);
    assert.deepEqual(resumed.completedPartNumbers, [1]);

    const secondPart = await request(resumed.partUrlTemplate.replace("{partNumber}", "2"), {
      method: "PUT",
      buffer: content.subarray(CHUNK_BYTES),
      authorization: `Bearer ${resumed.uploadToken}`,
    });
    assert.equal(secondPart.status, 200, secondPart.raw);
    assertNoStorageSecrets(secondPart.raw);
    assert.equal((secondPart.json as { result?: { receivedBytes?: number; completedParts?: number } }).result?.receivedBytes, FILE_BYTES - CHUNK_BYTES);
    assert.equal((secondPart.json as { result?: { completedParts?: number } }).result?.completedParts, 2);

    const completeResponse = await request(resumed.completeUrl, {
      method: "POST",
      authorization: `Bearer ${resumed.uploadToken}`,
    });
    assert.equal(completeResponse.status, 200, completeResponse.raw);
    assertNoStorageSecrets(completeResponse.raw);
    const completed = (completeResponse.json as {
      result?: { file?: { securityStatus?: string; sizeBytes?: number }; downloadable?: boolean; quarantineOnly?: boolean };
    }).result;
    assert.equal(completed?.file?.securityStatus, "scanner_required");
    assert.equal(completed?.file?.sizeBytes, FILE_BYTES);
    assert.equal(completed?.downloadable, false);
    assert.equal(completed?.quarantineOnly, true);
    assert.equal((await statDropQuarantineFile(storageKey)).sizeBytes, FILE_BYTES);

    const [dbFile, dbSession, audits] = await Promise.all([
      client.from("drop_files").select("sha256,size_stored_bytes,security_status,processing_status").eq("package_id", activePackageId).single(),
      client.from("drop_upload_sessions").select("status,total_parts,completed_parts,uploaded_bytes,received_sha256").eq("id", uploadSessionId).single(),
      client.from("drop_events").select("event_type,payload").eq("package_id", activePackageId).in("event_type", ["upload.rules_accepted", "upload.rules_reconfirmed"]).order("created_at"),
    ]);
    for (const result of [dbFile, dbSession, audits]) assert.equal(result.error, null, result.error?.message);
    assert.equal(dbFile.data?.sha256, expectedSha256);
    assert.equal(Number(dbFile.data?.size_stored_bytes), FILE_BYTES);
    assert.equal(dbFile.data?.security_status, "scanner_required");
    assert.equal(dbFile.data?.processing_status, "quarantined");
    assert.equal(dbSession.data?.status, "completed");
    assert.equal(Number(dbSession.data?.total_parts), 2);
    assert.equal(Number(dbSession.data?.completed_parts), 2);
    assert.equal(Number(dbSession.data?.uploaded_bytes), FILE_BYTES);
    assert.equal(dbSession.data?.received_sha256, expectedSha256);
    assert.deepEqual(audits.data?.map((event) => event.event_type), ["upload.rules_accepted", "upload.rules_reconfirmed"]);

    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.3.4",
      transport: "HTTPS + TLS + Nginx + Next.js route",
      fileBytes: FILE_BYTES,
      firstPartBytes: CHUNK_BYTES,
      secondPartBytes: FILE_BYTES - CHUNK_BYTES,
      interruptionAfterPart: 1,
      resumedCompletedParts: resumed.completedPartNumbers,
      finalSha256Matches: dbFile.data?.sha256 === expectedSha256,
      rulesAuditEvents: audits.data?.map((event) => event.event_type),
      quarantined: true,
      scannerRequired: true,
      downloadable: false,
    }, null, 2));
  } finally {
    if (uploadSessionId || storageKey) {
      await removeDropStoredFile({ sessionId: uploadSessionId || undefined, storageKey: storageKey || undefined }).catch(() => undefined);
    }
    if (packageId) {
      const deleted = await client.from("drop_packages").delete().eq("id", packageId);
      if (deleted.error) throw deleted.error;
    }
    if (spaceId) {
      const deleted = await client.from("drop_spaces").delete().eq("id", spaceId);
      if (deleted.error) throw deleted.error;
    }
    const [spaces, packages, files] = await Promise.all([
      client.from("drop_spaces").select("id", { count: "exact", head: true }).ilike("name", "DROP 0.3.4 éles HTTPS%"),
      client.from("drop_packages").select("id", { count: "exact", head: true }).ilike("title", "DROP 0.3.4 éles HTTPS csomag%"),
      client.from("drop_files").select("id", { count: "exact", head: true }).eq("display_name", "live-https-65mb.txt"),
    ]);
    for (const result of [spaces, packages, files]) if (result.error) throw result.error;
    assert.equal(spaces.count || 0, 0);
    assert.equal(packages.count || 0, 0);
    assert.equal(files.count || 0, 0);
    console.log(JSON.stringify({ cleanupCompleted: true, testStorageRetained: false, testPackageRetained: false, testSpaceRetained: false }, null, 2));
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
