import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { type NextRequest, NextResponse } from "next/server";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";
import {
  ensureReusablePersonalContentObject, ensureUserContentRef, findContentObjectByHash,
  findUserContentRef, getContentCoreReadiness, getPersonalDriveStorageQuota,
  getPersonalFolderCoreReadiness, getUserContentFolder, moveUserContentRef,
  registerVerifiedPersonalContentObject,
} from "@/app/lib/content-core/repository";
import {
  decodePersonalStreamFileName, normalizePersonalStreamMimeType,
  personalUploadEffectiveMaxBytes, personalUploadFeatureEnabled, validPersonalStreamSize,
  validPersonalUploadRequestId,
} from "@/app/lib/content-core/personalUploadPolicy";
import { getDriveObjectStorageConfig, getDriveObjectStorageSafeStatus } from "@/app/lib/drive-core/storageConfig";
import {
  getDriveSecurityScannerHealth, scanPersonalDriveStreamWithClamd, getDriveScannerUploadLimitBytes,
} from "@/app/lib/drive-core/securityScanService";
import {
  buildPersonalDriveStorageKey, calculateDriveObjectSha256, deleteDriveObject,
  putDriveObjectStream,
} from "@/app/lib/drive-core/s3ObjectStorage";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import { checkedPersonalStreamChunks, PersonalStreamBodyError } from "@/app/lib/content-core/personalStreamGuard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_CACHE = { "cache-control": "no-store" };
const reply = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: NO_CACHE });
const fail = (error: unknown) => {
  const known = error instanceof DimproIdentityError || error instanceof PersonalStreamBodyError;
  return reply({
    ok: false, error: known ? error.message : "A nagyméretű fájl véglegesítése nem igazolható. Ellenőrizd a Saját Drive fájllistáját.",
    code: known ? error.code : "PERSONAL_STREAM_UPLOAD_FAILED",
  }, known ? error.status : 502);
};

export async function POST(request: NextRequest) {
  const access = await resolvePersonalDriveContentActor(request);
  if (!access.ok) return access.response;
  // This operation is DEV-only and unavailable even if someone guesses its URL.
  if (!personalUploadFeatureEnabled(process.env)) return reply({ ok: false, code: "PERSONAL_UPLOAD_NOT_ENABLED" }, 403);
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  try {
    if (!origin || !host || new URL(origin).host !== host || new URL(origin).protocol !== "https:") {
      return reply({ ok: false, code: "PERSONAL_UPLOAD_ORIGIN_INVALID" }, 403);
    }
  } catch { return reply({ ok: false, code: "PERSONAL_UPLOAD_ORIGIN_INVALID" }, 403); }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/octet-stream") {
    return reply({ ok: false, code: "PERSONAL_UPLOAD_STREAM_CONTENT_TYPE_INVALID" }, 415);
  }
  const id = request.headers.get("x-dimpro-request-id");
  if (!validPersonalUploadRequestId(id)) return reply({ ok: false, code: "PERSONAL_UPLOAD_REQUEST_ID_INVALID" }, 400);
  let fileName: string;
  let mimeType: string;
  try {
    fileName = decodePersonalStreamFileName(request.headers.get("x-dimpro-file-name"));
    mimeType = normalizePersonalStreamMimeType(request.headers.get("x-dimpro-mime-type"));
  } catch { return reply({ ok: false, code: "PERSONAL_UPLOAD_METADATA_INVALID" }, 400); }
  const folderId = (request.headers.get("x-dimpro-folder-id") || "").trim();
  if (folderId && !validPersonalUploadRequestId(folderId)) {
    return reply({ ok: false, code: "PERSONAL_UPLOAD_FOLDER_ID_INVALID" }, 400);
  }
  const rawLength = request.headers.get("content-length") || "";
  const sizeBytes = /^\d{1,12}$/.test(rawLength) ? Number(rawLength) : null;

  let temporaryDirectory: string | null = null;
  try {
    const config = getDriveObjectStorageConfig();
    const [content, folders, scanner] = await Promise.all([
      getContentCoreReadiness(), getPersonalFolderCoreReadiness(), getDriveSecurityScannerHealth(),
    ]);
    const storage = getDriveObjectStorageSafeStatus(config);
    const maxBytes = personalUploadEffectiveMaxBytes(getDriveScannerUploadLimitBytes(), config.maxUploadBytes);
    if (!content.ready || !folders.ready || !scanner.ready
      || !storage.objectWriteEnabled || !storage.objectDownloadEnabled) {
      return reply({ ok: false, code: "PERSONAL_UPLOAD_SAFETY_NOT_READY" }, 503);
    }
    if (sizeBytes === null || !validPersonalStreamSize(sizeBytes, maxBytes)) {
      return reply({ ok: false, code: "PERSONAL_UPLOAD_FILE_TOO_LARGE_OR_LENGTH_MISSING" }, 413);
    }
    if (!request.body) return reply({ ok: false, code: "PERSONAL_UPLOAD_BODY_MISSING" }, 400);
    if (folderId && !(await getUserContentFolder({ userId: access.contentUserId, folderId }))) {
      return reply({ ok: false, code: "PERSONAL_UPLOAD_FOLDER_NOT_FOUND" }, 404);
    }
    const quota = await getPersonalDriveStorageQuota({ userId: access.contentUserId });
    if (quota.hardLimit && sizeBytes > quota.remainingBytes) {
      return reply({ ok: false, code: "PERSONAL_DRIVE_QUOTA_EXCEEDED" }, 507);
    }

    // Read no more than the explicitly verified Content-Length and write to a
    // private temporary file. Large uploads never use buffered multipart
    // parsing or whole-file RAM allocations, so memory usage stays bounded.
    temporaryDirectory = await mkdtemp(join(tmpdir(), "dimpro-personal-stream-"));
    const stagingFile = join(temporaryDirectory, "upload.bin");
    const reader = request.body.getReader();
    const rawBody = (async function* () {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          yield value;
        }
      } finally { reader.releaseLock(); }
    })();
    const limitedBody = Readable.from(checkedPersonalStreamChunks(rawBody, sizeBytes, maxBytes));
    await pipeline(limitedBody, createWriteStream(stagingFile, { flags: "wx", mode: 0o600 }));
    const staged = await stat(stagingFile);
    if (staged.size !== sizeBytes) return reply({ ok: false, code: "PERSONAL_UPLOAD_STAGING_SIZE_MISMATCH" }, 409);

    const scanned = await scanPersonalDriveStreamWithClamd(createReadStream(stagingFile), sizeBytes);
    if (scanned.status !== "clean") {
      return reply({ ok: false, code: "PERSONAL_UPLOAD_INFECTED", securityStatus: "INFECTED" }, 422);
    }
    const sourceRef = `personal-web:${id}`;
    const prior = await findUserContentRef({ userId: access.contentUserId, sourceSystem: "DRIVE", sourceRef });
    if (prior) {
      const known = await findContentObjectByHash({ sha256: scanned.sha256, sizeBytes });
      if (!known || known.id !== prior.content_object_id) {
        return reply({ ok: false, code: "PERSONAL_UPLOAD_IDEMPOTENCY_CONFLICT" }, 409);
      }
      ensureReusablePersonalContentObject(known, config.bucket);
      // An idempotent replay must verify the physical immutable object too:
      // a stale CLEAN database ref is not proof that S3 still holds the bytes.
      const persisted = await calculateDriveObjectSha256({
        storageKey: known.storage_key, bucket: known.storage_bucket,
      });
      if (persisted.sha256 !== scanned.sha256 || persisted.sizeBytes !== sizeBytes) {
        return reply({ ok: false, code: "PERSONAL_UPLOAD_PRIOR_OBJECT_INVALID" }, 409);
      }
      return reply({ ok: true, saved: true, alreadyCompleted: true, contentRefId: prior.id, scanStatus: "CLEAN" });
    }

    let contentObject = await findContentObjectByHash({ sha256: scanned.sha256, sizeBytes });
    if (contentObject) {
      ensureReusablePersonalContentObject(contentObject, config.bucket);
      const reused = await calculateDriveObjectSha256({
        storageKey: contentObject.storage_key, bucket: contentObject.storage_bucket,
      });
      if (reused.sizeBytes !== sizeBytes || reused.sha256 !== scanned.sha256) {
        return reply({ ok: false, code: "PERSONAL_UPLOAD_DEDUP_OBJECT_INVALID" }, 409);
      }
    } else {
      const uploadId = randomUUID();
      const storageKey = buildPersonalDriveStorageKey({ userId: access.contentUserId, uploadId, fileName });
      const stored = await putDriveObjectStream({
        storageKey, body: createReadStream(stagingFile), contentType: mimeType, contentLength: sizeBytes,
        metadata: { "dimpro-source": "personal-stream", "dimpro-scope": "personal", "dimpro-sha256": scanned.sha256 },
      });
      let verified = false;
      try {
        const checked = await calculateDriveObjectSha256({ storageKey, bucket: stored.bucket });
        verified = checked.sha256 === scanned.sha256 && checked.sizeBytes === sizeBytes;
      } finally {
        if (!verified) await deleteDriveObject({ storageKey, bucket: stored.bucket }).catch(() => undefined);
      }
      if (!verified) return reply({ ok: false, code: "PERSONAL_UPLOAD_STORAGE_INTEGRITY_FAILED" }, 502);
      const registered = await registerVerifiedPersonalContentObject({
        sha256: scanned.sha256, sizeBytes, mimeType, fileName,
        storageBucket: stored.bucket, storageKey, uploadId,
      });
      contentObject = registered.object;
      if (!registered.inserted && registered.object.storage_key !== storageKey) {
        const winner = await calculateDriveObjectSha256({
          storageKey: registered.object.storage_key, bucket: registered.object.storage_bucket,
        }).catch(() => null);
        await deleteDriveObject({ storageKey, bucket: stored.bucket }).catch(() => undefined);
        if (!winner || winner.sha256 !== scanned.sha256 || winner.sizeBytes !== sizeBytes) {
          return reply({ ok: false, code: "PERSONAL_UPLOAD_DEDUP_OBJECT_INVALID" }, 409);
        }
      }
    }
    // Underlying RPC rechecks USER quota atomically at commit time.
    const ref = await ensureUserContentRef({
      contentObjectId: contentObject.id, userId: access.contentUserId,
      sourceSystem: "DRIVE", sourceRef, displayName: fileName,
    });
    let placedInFolder = !folderId;
    if (folderId) {
      try {
        await moveUserContentRef({ userId: access.contentUserId, refId: ref.id, folderId });
        placedInFolder = true;
      } catch {
        placedInFolder = false; // Already saved to personal root: do not report upload failure.
      }
    }
    return reply({ ok: true, saved: true, scanStatus: "CLEAN", contentRefId: ref.id,
      placedInFolder, targetFolderId: placedInFolder ? folderId || null : null }, 201);
  } catch (error) { return fail(error); }
  finally {
    // Only the newly allocated, unshared temp directory is eligible for cleanup.
    // Crash recovery for process-killed temp artifacts is a separate retention gate.
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
