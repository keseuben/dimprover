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
import {
  getDropUploadBundle,
  queueDropObjectCleanup,
} from "../app/lib/drop/storage/dropStorageRepository";
import { processDropObjectCleanup } from "../app/lib/drop/storage/dropUploadService";
import {
  abortDropS3Multipart,
  deleteDropS3Object,
  headDropS3Object,
  inspectDropS3Part,
} from "../app/lib/drop/storage/dropS3Storage";

const RULES_VERSION = "DIMPRO-DROP-UPLOAD-HU-1.0";
const CHUNK_BYTES = 64 * 1024 * 1024;
const SECOND_PART_BYTES = 1024 * 1024;
const FILE_BYTES = CHUNK_BYTES + SECOND_PART_BYTES;

type RequestInput = {
  method?: string;
  json?: unknown;
  cookie?: string;
  authorization?: string;
};

function request(path: string, input: RequestInput = {}) {
  return new Promise<{ status: number; json: unknown; raw: string }>((resolve, reject) => {
    const payload = input.json === undefined ? null : Buffer.from(JSON.stringify(input.json), "utf8");
    const req = https.request({
      hostname: "drop.dimpro.hu",
      port: 443,
      path,
      method: input.method || "GET",
      timeout: 3_600_000,
      headers: {
        Accept: "application/json",
        ...(payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}),
        ...(input.cookie ? { Cookie: input.cookie } : {}),
        ...(input.authorization ? { Authorization: input.authorization } : {}),
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json: unknown = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { /* raw response retained */ }
        resolve({ status: response.statusCode || 0, json, raw });
      });
    });
    req.on("timeout", () => req.destroy(new Error("DROP S3 E2E HTTPS időtúllépés.")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function assertNoSecrets(raw: string) {
  for (const forbidden of [
    "secretAccessKey",
    "DIMPRO_DROP_S3_SECRET_ACCESS_KEY",
    "DIMPRO_DROP_S3_ACCESS_KEY_ID",
    "storage_key",
    "storageKey",
    "storage_multipart_id",
  ]) {
    assert.equal(raw.includes(forbidden), false, `Tiltott belső adat az API-válaszban: ${forbidden}`);
  }
}

async function signAndUploadPart(input: {
  template: string;
  partNumber: number;
  token: string;
  body: Buffer;
}) {
  const apiPath = input.template.replace("{partNumber}", String(input.partNumber));
  const signedResponse = await request(apiPath, {
    method: "POST",
    authorization: `Bearer ${input.token}`,
  });
  assert.equal(signedResponse.status, 200, signedResponse.raw);
  assertNoSecrets(signedResponse.raw);
  const signed = (signedResponse.json as {
    signed?: { alreadyCompleted?: boolean; method?: string; url?: string; sizeBytes?: number };
  }).signed;
  assert.ok(signed);
  assert.equal(signed.alreadyCompleted, false);
  assert.equal(signed.method, "PUT");
  assert.equal(Number(signed.sizeBytes), input.body.length);
  assert.ok(signed.url);
  const signedUrl = new URL(signed.url);
  assert.equal(signedUrl.protocol, "https:");
  assert.ok(signedUrl.hostname.endsWith("your-objectstorage.com"));

  const put = await fetch(signed.url, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream" },
    body: new Uint8Array(input.body),
  });
  assert.ok(put.ok, `Signed PUT HTTP ${put.status}`);
  const etag = put.headers.get("etag")?.replace(/^\"|\"$/g, "") || "";
  assert.ok(etag.length >= 3);
  const checksum = createHash("sha256").update(input.body).digest("hex");

  const confirm = await request(apiPath, {
    method: "PATCH",
    authorization: `Bearer ${input.token}`,
    json: { checksum, etag, receivedBytes: input.body.length },
  });
  assert.equal(confirm.status, 200, confirm.raw);
  assertNoSecrets(confirm.raw);
  const result = (confirm.json as {
    result?: { partNumber?: number; receivedBytes?: number; etag?: string; completedParts?: number; allPartsReceived?: boolean };
  }).result;
  assert.equal(result?.partNumber, input.partNumber);
  assert.equal(result?.receivedBytes, input.body.length);
  assert.equal(result?.etag, etag);
  return { checksum, etag, confirmation: result };
}

async function objectMissing(storageKey: string, bucket: string) {
  try {
    await headDropS3Object({ storageKey, bucket });
    return false;
  } catch {
    return true;
  }
}

async function main() {
  if (process.env.DROP_ALLOW_V040_LIVE_S3_E2E !== "DROP-V040-LIVE-S3-E2E") {
    throw new Error("Hiányzó DROP 0.4.0 valós S3 E2E tesztengedély.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert.ok(url && key);
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const unique = Date.now().toString(36);
  let spaceId: string | null = null;
  let packageId: string | null = null;
  let successSessionId: string | null = null;
  let successStorageKey: string | null = null;
  let successBucket: string | null = null;
  let abortSessionId: string | null = null;
  let abortStorageKey: string | null = null;
  let abortBucket: string | null = null;
  let abortMultipartId: string | null = null;
  const cleanupTaskIds: string[] = [];

  try {
    const space = await createDropSpace({
      name: `DROP 0.4.0 S3 E2E ${unique}`,
      ownerLicenseId: `drop-v040-s3-license-${unique}`,
      ownerUserId: `drop-v040-s3-owner-${unique}`,
      ownerName: "DROP S3 E2E gazda",
      ownerEmail: `owner-${unique}@example.hu`,
      licenseEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      accessExpiryMode: "license",
      maxMembers: 5,
      maxPackages: 5,
      storageQuotaBytes: 2 * 1024 * 1024 * 1024,
      allowGuestPackageCreation: true,
      allowGuestInvites: false,
    });
    spaceId = space.space.id;
    const invitation = await inviteDropSpaceMember(spaceId, {
      displayName: "S3 E2E közreműködő",
      email: `contributor-${unique}@example.hu`,
      role: "contributor",
    });
    const accepted = await acceptDropSpaceInvitation(invitation.rawInvitationToken);
    const created = await createDropPackage({
      mode: "file",
      title: `DROP 0.4.0 S3 E2E csomag ${unique}`,
      description: "Valós Hetzner signed multipart, resume, quarantine, abort és cleanup teszt.",
      uploaderName: accepted.membership.displayName,
      uploaderEmail: accepted.membership.email,
      retentionDays: 3,
      recipients: [],
      groups: [],
      maxFileCount: 5,
      maxFileSizeBytes: 500 * 1024 * 1024,
      maxTotalSizeBytes: 1024 * 1024 * 1024,
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

    const firstPart = Buffer.alloc(CHUNK_BYTES, 65);
    const secondPart = Buffer.alloc(SECOND_PART_BYTES, 66);
    secondPart[secondPart.length - 1] = 10;
    const clientUploadId = `s3-success-${unique}`;
    const init = await request(`/api/drop/spaces/packages/${activePackageId}/uploads/init`, {
      method: "POST",
      cookie,
      json: {
        fileName: "drop-s3-e2e-65mb.txt",
        sizeBytes: FILE_BYTES,
        mimeType: "text/plain",
        clientUploadId,
        rulesAccepted: true,
        rulesVersion: RULES_VERSION,
        rulesAcceptedAt: new Date().toISOString(),
      },
    });
    assert.equal(init.status, 201, init.raw);
    assertNoSecrets(init.raw);
    const initialized = (init.json as {
      initialized?: {
        protocol: string;
        storageProvider: string;
        session: { id: string; totalParts: number; chunkSizeBytes: number };
        uploadToken: string;
        partSignUrlTemplate: string;
        partConfirmUrlTemplate: string;
        completeUrl: string;
        completedPartNumbers: number[];
      };
    }).initialized;
    assert.ok(initialized);
    assert.equal(initialized.protocol, "multipart");
    assert.equal(initialized.storageProvider, "s3-compatible");
    assert.equal(initialized.session.totalParts, 2);
    assert.equal(initialized.session.chunkSizeBytes, CHUNK_BYTES);
    successSessionId = initialized.session.id;
    const successBundle = await getDropUploadBundle(successSessionId);
    assert.ok(successBundle);
    successStorageKey = successBundle.file.storage_key;
    successBucket = successBundle.file.storage_bucket;

    const uploadedPart1 = await signAndUploadPart({
      template: initialized.partSignUrlTemplate,
      partNumber: 1,
      token: initialized.uploadToken,
      body: firstPart,
    });
    assert.equal(uploadedPart1.confirmation?.completedParts, 1);
    assert.equal(uploadedPart1.confirmation?.allPartsReceived, false);

    const resumedResponse = await request(`/api/drop/spaces/packages/${activePackageId}/uploads/init`, {
      method: "POST",
      cookie,
      json: {
        fileName: "drop-s3-e2e-65mb.txt",
        sizeBytes: FILE_BYTES,
        mimeType: "text/plain",
        clientUploadId,
        rulesAccepted: true,
        rulesVersion: RULES_VERSION,
        rulesAcceptedAt: new Date().toISOString(),
      },
    });
    assert.equal(resumedResponse.status, 201, resumedResponse.raw);
    const resumed = (resumedResponse.json as {
      initialized?: {
        session: { id: string };
        uploadToken: string;
        partSignUrlTemplate: string;
        completeUrl: string;
        completedPartNumbers: number[];
      };
    }).initialized;
    assert.ok(resumed);
    assert.equal(resumed.session.id, successSessionId);
    assert.deepEqual(resumed.completedPartNumbers, [1]);

    const uploadedPart2 = await signAndUploadPart({
      template: resumed.partSignUrlTemplate,
      partNumber: 2,
      token: resumed.uploadToken,
      body: secondPart,
    });
    assert.equal(uploadedPart2.confirmation?.completedParts, 2);
    assert.equal(uploadedPart2.confirmation?.allPartsReceived, true);

    const complete = await request(resumed.completeUrl, {
      method: "POST",
      authorization: `Bearer ${resumed.uploadToken}`,
    });
    assert.equal(complete.status, 200, complete.raw);
    assertNoSecrets(complete.raw);
    const completed = (complete.json as {
      result?: {
        file?: {
          sizeBytes?: number;
          processingStatus?: string;
          virusScanStatus?: string;
          securityStatus?: string;
          integrityType?: string;
          integrityManifestSha256?: string;
          objectEtag?: string;
        };
        session?: { status?: string };
        downloadable?: boolean;
        quarantineOnly?: boolean;
      };
    }).result;
    assert.equal(completed?.file?.sizeBytes, FILE_BYTES);
    assert.equal(completed?.file?.processingStatus, "quarantined");
    assert.equal(completed?.file?.virusScanStatus, "scanner_required");
    assert.equal(completed?.file?.securityStatus, "scanner_required");
    assert.equal(completed?.file?.integrityType, "PART_MANIFEST_SHA256");
    assert.match(completed?.file?.integrityManifestSha256 || "", /^[0-9a-f]{64}$/);
    assert.ok((completed?.file?.objectEtag || "").length >= 3);
    assert.equal(completed?.session?.status, "completed");
    assert.equal(completed?.downloadable, false);
    assert.equal(completed?.quarantineOnly, true);

    const object = await headDropS3Object({ storageKey: successStorageKey, bucket: successBucket });
    assert.equal(object.sizeBytes, FILE_BYTES);
    assert.equal(object.metadata["dimpro-component"], "drop");
    assert.equal(object.metadata["dimpro-state"], "quarantine");

    const [dbFile, dbSession, dbParts, audit] = await Promise.all([
      client.from("drop_files").select("sha256,integrity_type,integrity_manifest_sha256,object_etag,object_verified_at,size_stored_bytes,processing_status,security_status").eq("id", successBundle.file.id).single(),
      client.from("drop_upload_sessions").select("status,integrity_type,integrity_manifest_sha256,object_etag,object_verified_at,completed_parts,total_parts,uploaded_bytes").eq("id", successSessionId).single(),
      client.from("drop_upload_parts").select("part_number,size_bytes,etag,checksum,status").eq("session_id", successSessionId).order("part_number"),
      client.from("drop_events").select("event_type,payload").eq("package_id", activePackageId).eq("file_id", successBundle.file.id).eq("event_type", "upload.s3_quarantined").maybeSingle(),
    ]);
    for (const result of [dbFile, dbSession, dbParts, audit]) assert.equal(result.error, null, result.error?.message);
    assert.equal(dbFile.data?.sha256, null);
    assert.equal(dbFile.data?.integrity_type, "PART_MANIFEST_SHA256");
    assert.equal(dbFile.data?.processing_status, "quarantined");
    assert.equal(dbFile.data?.security_status, "scanner_required");
    assert.equal(Number(dbFile.data?.size_stored_bytes), FILE_BYTES);
    assert.equal(dbSession.data?.status, "completed");
    assert.equal(Number(dbSession.data?.completed_parts), 2);
    assert.equal(Number(dbSession.data?.total_parts), 2);
    assert.equal(Number(dbSession.data?.uploaded_bytes), FILE_BYTES);
    assert.equal(dbParts.data?.length, 2);
    assert.deepEqual(dbParts.data?.map((part) => part.status), ["completed", "completed"]);
    assert.ok(dbParts.data?.every((part) => /^[0-9a-f]{64}$/.test(String(part.checksum)) && String(part.etag).length >= 3));
    assert.equal(audit.data?.event_type, "upload.s3_quarantined");

    const cleanupTask = await queueDropObjectCleanup({
      packageId: activePackageId,
      fileId: successBundle.file.id,
      sessionId: successSessionId,
      storageBucket: successBucket,
      storageKey: successStorageKey,
      operation: "DELETE_OBJECT",
      reason: "DROP 0.4.0 valós S3 E2E tesztobjektum törlése.",
    });
    cleanupTaskIds.push(cleanupTask.id);
    const cleanup = await processDropObjectCleanup(50);
    assert.ok(cleanup.completed >= 1);
    const cleanupRow = await client.from("drop_object_cleanup_tasks").select("status,attempts,last_error").eq("id", cleanupTask.id).single();
    assert.equal(cleanupRow.error, null, cleanupRow.error?.message);
    assert.equal(cleanupRow.data?.status, "completed");
    assert.equal(Number(cleanupRow.data?.attempts), 1);
    assert.equal(cleanupRow.data?.last_error, null);
    assert.equal(await objectMissing(successStorageKey, successBucket), true);

    const abortInit = await request(`/api/drop/spaces/packages/${activePackageId}/uploads/init`, {
      method: "POST",
      cookie,
      json: {
        fileName: "drop-s3-abort-6mb.txt",
        sizeBytes: 6 * 1024 * 1024,
        mimeType: "text/plain",
        clientUploadId: `s3-abort-${unique}`,
        rulesAccepted: true,
        rulesVersion: RULES_VERSION,
        rulesAcceptedAt: new Date().toISOString(),
      },
    });
    assert.equal(abortInit.status, 201, abortInit.raw);
    const abortUpload = (abortInit.json as {
      initialized?: {
        storageProvider: string;
        session: { id: string; totalParts: number };
        uploadToken: string;
        partSignUrlTemplate: string;
        abortUrl: string;
      };
    }).initialized;
    assert.ok(abortUpload);
    assert.equal(abortUpload.storageProvider, "s3-compatible");
    assert.equal(abortUpload.session.totalParts, 1);
    abortSessionId = abortUpload.session.id;
    const abortBundle = await getDropUploadBundle(abortSessionId);
    assert.ok(abortBundle);
    abortStorageKey = abortBundle.file.storage_key;
    abortBucket = abortBundle.file.storage_bucket;
    abortMultipartId = abortBundle.session.storage_multipart_id || null;
    assert.ok(abortMultipartId);

    const abortBody = Buffer.alloc(6 * 1024 * 1024, 67);
    await signAndUploadPart({
      template: abortUpload.partSignUrlTemplate,
      partNumber: 1,
      token: abortUpload.uploadToken,
      body: abortBody,
    });
    const cancel = await request(abortUpload.abortUrl, {
      method: "DELETE",
      authorization: `Bearer ${abortUpload.uploadToken}`,
      json: { reason: "DROP 0.4.0 valós multipart abort teszt." },
    });
    assert.equal(cancel.status, 200, cancel.raw);
    assertNoSecrets(cancel.raw);
    const cancelled = cancel.json as { status?: string; reservationReleased?: boolean };
    assert.equal(cancelled.status, "failed");
    assert.equal(cancelled.reservationReleased, true);
    let multipartMissing = false;
    try {
      await inspectDropS3Part({ storageKey: abortStorageKey, uploadId: abortMultipartId, partNumber: 1 });
    } catch {
      multipartMissing = true;
    }
    assert.equal(multipartMissing, true);
    assert.equal(await objectMissing(abortStorageKey, abortBucket), true);

    const abortDb = await client.from("drop_upload_sessions").select("status,reservation_released,failure_code").eq("id", abortSessionId).single();
    assert.equal(abortDb.error, null, abortDb.error?.message);
    assert.equal(abortDb.data?.status, "failed");
    assert.equal(abortDb.data?.reservation_released, true);
    assert.equal(abortDb.data?.failure_code, "DROP_UPLOAD_CANCELLED");

    console.log(JSON.stringify({
      ok: true,
      version: "DROP 0.4.0",
      provider: "s3-compatible",
      mode: "quarantine",
      signedMultipartParts: 2,
      fileBytes: FILE_BYTES,
      interruptionAfterPart: 1,
      resumedCompletedParts: [1],
      partSha256Verified: true,
      partEtagsVerified: true,
      headSizeVerified: true,
      integrityType: "PART_MANIFEST_SHA256",
      fullFileSha256Claimed: false,
      quarantined: true,
      downloadable: false,
      deleteCleanupCompleted: true,
      abortMultipartCompleted: true,
      quotaReservationReleased: true,
      credentialIsolation: true,
      secretsExposed: false,
    }, null, 2));
  } finally {
    if (successStorageKey && successBucket) {
      await deleteDropS3Object({ storageKey: successStorageKey, bucket: successBucket }).catch(() => undefined);
    }
    if (abortStorageKey && abortMultipartId) {
      await abortDropS3Multipart({ storageKey: abortStorageKey, uploadId: abortMultipartId }).catch(() => undefined);
    }
    if (abortStorageKey && abortBucket) {
      await deleteDropS3Object({ storageKey: abortStorageKey, bucket: abortBucket }).catch(() => undefined);
    }
    if (packageId) {
      const deleted = await client.from("drop_packages").delete().eq("id", packageId);
      if (deleted.error) throw deleted.error;
    }
    if (spaceId) {
      const deleted = await client.from("drop_spaces").delete().eq("id", spaceId);
      if (deleted.error) throw deleted.error;
    }
    if (cleanupTaskIds.length) {
      const deleted = await client.from("drop_object_cleanup_tasks").delete().in("id", cleanupTaskIds);
      if (deleted.error) throw deleted.error;
    }
    const [spaces, packages, files, sessions, tasks] = await Promise.all([
      client.from("drop_spaces").select("id", { count: "exact", head: true }).ilike("name", "DROP 0.4.0 S3 E2E%"),
      client.from("drop_packages").select("id", { count: "exact", head: true }).ilike("title", "DROP 0.4.0 S3 E2E csomag%"),
      client.from("drop_files").select("id", { count: "exact", head: true }).in("display_name", ["drop-s3-e2e-65mb.txt", "drop-s3-abort-6mb.txt"]),
      client.from("drop_upload_sessions").select("id", { count: "exact", head: true }).in("id", [successSessionId, abortSessionId].filter(Boolean) as string[]),
      client.from("drop_object_cleanup_tasks").select("id", { count: "exact", head: true }).in("id", cleanupTaskIds.length ? cleanupTaskIds : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    for (const result of [spaces, packages, files, sessions, tasks]) if (result.error) throw result.error;
    assert.equal(spaces.count || 0, 0);
    assert.equal(packages.count || 0, 0);
    assert.equal(files.count || 0, 0);
    assert.equal(sessions.count || 0, 0);
    assert.equal(tasks.count || 0, 0);
    if (successStorageKey && successBucket) assert.equal(await objectMissing(successStorageKey, successBucket), true);
    if (abortStorageKey && abortBucket) assert.equal(await objectMissing(abortStorageKey, abortBucket), true);
    console.log(JSON.stringify({
      cleanupCompleted: true,
      testStorageRetained: false,
      testPackagesRetained: false,
      testFilesRetained: false,
      testSessionsRetained: false,
      cleanupTasksRetained: false,
    }, null, 2));
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
