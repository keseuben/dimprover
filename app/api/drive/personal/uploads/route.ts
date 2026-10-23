import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { type NextRequest, NextResponse } from "next/server";
import { resolvePersonalDriveContentActor } from "@/app/lib/content-core/personalAuth";
import {
  ensureReusablePersonalContentObject, ensureUserContentRef, findContentObjectByHash,
  findUserContentRef, getContentCoreReadiness, getPersonalDriveStorageQuota,
  getPersonalFolderCoreReadiness, getUserContentFolder, moveUserContentRef,
  registerVerifiedPersonalContentObject,
} from "@/app/lib/content-core/repository";
import {
  isPersonalUploadSafeToParse, normalizePersonalUploadFileName, PERSONAL_UPLOAD_BUFFERED_FORM_MAX_BYTES,
  personalUploadEffectiveMaxBytes, personalUploadFeatureEnabled, validPersonalUploadRequestId,
} from "@/app/lib/content-core/personalUploadPolicy";
import { getDriveObjectStorageConfig, getDriveObjectStorageSafeStatus } from "@/app/lib/drive-core/storageConfig";
import { getDriveSecurityScannerHealth, scanPersonalDriveBufferWithClamd, getDriveScannerUploadLimitBytes } from "@/app/lib/drive-core/securityScanService";
import { buildPersonalDriveStorageKey, calculateDriveObjectSha256, deleteDriveObject, putDriveObjectStream } from "@/app/lib/drive-core/s3ObjectStorage";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_CACHE = { "cache-control": "no-store" };
function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_CACHE });
}
function failure(error: unknown) {
  const known = error instanceof DimproIdentityError;
  return reply({
    ok: false,
    error: known ? error.message : "A Saját Drive fájlfeltöltése nem sikerült. Ellenőrizd a fájllistát az ismétlés előtt.",
    code: known ? error.code : "PERSONAL_UPLOAD_FAILED",
  }, known ? error.status : 502);
}
async function availability() {
  if (!personalUploadFeatureEnabled(process.env)) return { enabled: false, maxBytes: 0 };
  const storage = getDriveObjectStorageConfig();
  const [content, folders, scanner] = await Promise.all([
    getContentCoreReadiness(), getPersonalFolderCoreReadiness(), getDriveSecurityScannerHealth(),
  ]);
  const storageStatus = getDriveObjectStorageSafeStatus(storage);
  const maxBytes = personalUploadEffectiveMaxBytes(getDriveScannerUploadLimitBytes(), storage.maxUploadBytes);
  return {
    enabled: personalUploadFeatureEnabled(process.env)
      && content.ready && folders.ready && scanner.ready
      && storageStatus.objectWriteEnabled && storageStatus.objectDownloadEnabled
      && maxBytes > 0,
    maxBytes,
  };
}
export async function GET(request: NextRequest) {
  const access = await resolvePersonalDriveContentActor(request);
  if (!access.ok) return access.response;
  try {
    const status = await availability();
    return reply({ ok: true, enabled: status.enabled, maxBytes: status.maxBytes,
      protocol: "PERSONAL_STREAM_POST", bufferedFormMaxBytes: PERSONAL_UPLOAD_BUFFERED_FORM_MAX_BYTES, multipartResumable: false });
  } catch {
    return reply({ ok: true, enabled: false, maxBytes: 0, protocol: "PERSONAL_SINGLE_SERVER_POST" });
  }
}

/** Disabled by default; no persistent signed URL or client-side assumption of scan completion. */
export async function POST(request: NextRequest) {
  const access = await resolvePersonalDriveContentActor(request);
  if (!access.ok) return access.response;
  if (!personalUploadFeatureEnabled(process.env)) return reply({ ok: false, error: "PERSONAL_UPLOAD_NOT_ENABLED" }, 403);
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  try {
    if (!origin || !host || new URL(origin).host !== host || !origin.startsWith("https://")) {
      return reply({ ok: false, error: "PERSONAL_UPLOAD_ORIGIN_INVALID" }, 403);
    }
  } catch { return reply({ ok: false, error: "PERSONAL_UPLOAD_ORIGIN_INVALID" }, 403); }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    return reply({ ok: false, error: "PERSONAL_UPLOAD_FORM_REQUIRED" }, 415);
  }
  try {
    const status = await availability();
    if (!status.enabled) return reply({ ok: false, error: "PERSONAL_UPLOAD_SAFETY_NOT_READY" }, 503);
    const rawLength = request.headers.get("content-length");
    const bodyLength = rawLength && /^\d+$/.test(rawLength) ? Number(rawLength) : null;
    if (!isPersonalUploadSafeToParse(bodyLength, Math.min(status.maxBytes, PERSONAL_UPLOAD_BUFFERED_FORM_MAX_BYTES))) {
      return reply({ ok: false, error: "PERSONAL_UPLOAD_REQUEST_SIZE_INVALID" }, 413);
    }
    // Content-Length checked BEFORE request.formData() to cap server-side buffering.
    const form = await request.formData();
    const inputFile = form.get("file");
    const folderField = form.get("folderId");
    const requestId = form.get("requestId");
    const folderId = typeof folderField === "string" && folderField !== "all" ? folderField.trim() : "";
    if (!(inputFile instanceof File) || !validPersonalUploadRequestId(requestId)) {
      return reply({ ok: false, error: "PERSONAL_UPLOAD_INPUT_INVALID" }, 400);
    }
    let fileName: string;
    try { fileName = normalizePersonalUploadFileName(inputFile.name); }
    catch { return reply({ ok: false, error: "PERSONAL_UPLOAD_FILENAME_INVALID" }, 400); }
    if (inputFile.size < 1 || inputFile.size > Math.min(status.maxBytes, PERSONAL_UPLOAD_BUFFERED_FORM_MAX_BYTES)) {
      return reply({ ok: false, error: "PERSONAL_UPLOAD_FILE_TOO_LARGE" }, 413);
    }
    if (folderId && !(await getUserContentFolder({ userId: access.contentUserId, folderId }))) {
      return reply({ ok: false, error: "PERSONAL_UPLOAD_FOLDER_NOT_FOUND" }, 404);
    }
    const quota = await getPersonalDriveStorageQuota({ userId: access.contentUserId });
    if (quota.hardLimit && inputFile.size > quota.remainingBytes) {
      return reply({ ok: false, error: "PERSONAL_DRIVE_QUOTA_EXCEEDED" }, 507);
    }

    const bytes = Buffer.from(await inputFile.arrayBuffer());
    if (bytes.byteLength !== inputFile.size) return reply({ ok: false, error: "PERSONAL_UPLOAD_SIZE_CHANGED" }, 409);
    const scanned = await scanPersonalDriveBufferWithClamd(bytes);
    if (scanned.status !== "clean") {
      return reply({ ok: false, error: "PERSONAL_UPLOAD_INFECTED", securityStatus: "INFECTED" }, 422);
    }
    const storage = getDriveObjectStorageConfig();
    const sourceRef = `personal-web:${requestId}`;
    const prior = await findUserContentRef({ userId: access.contentUserId, sourceSystem: "DRIVE", sourceRef });
    if (prior) {
      const priorObject = await findContentObjectByHash({ sha256: scanned.sha256, sizeBytes: bytes.byteLength });
      if (!priorObject || prior.content_object_id !== priorObject.id) {
        return reply({ ok: false, error: "PERSONAL_UPLOAD_IDEMPOTENCY_CONFLICT" }, 409);
      }
      ensureReusablePersonalContentObject(priorObject, storage.bucket);
      return reply({ ok: true, saved: true, alreadyCompleted: true, contentRefId: prior.id, scanStatus: "CLEAN" });
    }

    let contentObject = await findContentObjectByHash({ sha256: scanned.sha256, sizeBytes: bytes.byteLength });
    if (contentObject) {
      ensureReusablePersonalContentObject(contentObject, storage.bucket);
      const reused = await calculateDriveObjectSha256({
        storageKey: contentObject.storage_key, bucket: contentObject.storage_bucket,
      });
      if (reused.sizeBytes !== bytes.byteLength || reused.sha256 !== scanned.sha256) {
        return reply({ ok: false, error: "PERSONAL_UPLOAD_DEDUP_OBJECT_INVALID" }, 409);
      }
    } else {
      const uploadId = randomUUID();
      const storageKey = buildPersonalDriveStorageKey({ userId: access.contentUserId, uploadId, fileName });
      const mimeType = inputFile.type || "application/octet-stream";
      // A unique S3 key is not shared with existing database records.
      const stored = await putDriveObjectStream({
        storageKey, body: Readable.from([bytes]), contentType: mimeType, contentLength: bytes.length,
        metadata: { "dimpro-source": "personal-web", "dimpro-scope": "personal", "dimpro-sha256": scanned.sha256 },
      });
      let passedIntegrity = false;
      try {
        const checked = await calculateDriveObjectSha256({ storageKey, bucket: stored.bucket });
        passedIntegrity = checked.sha256 === scanned.sha256 && checked.sizeBytes === bytes.byteLength;
      } finally {
        if (!passedIntegrity) await deleteDriveObject({ storageKey, bucket: stored.bucket }).catch(() => undefined);
      }
      if (!passedIntegrity) return reply({ ok: false, error: "PERSONAL_UPLOAD_STORAGE_INTEGRITY_FAILED" }, 502);
      const registered = await registerVerifiedPersonalContentObject({
        sha256: scanned.sha256, sizeBytes: bytes.byteLength, mimeType, fileName,
        storageBucket: stored.bucket, storageKey, uploadId,
      });
      contentObject = registered.object;
      // Dedup uniqueness race: do not retain an additional unreferenced S3 copy.
      if (!registered.inserted && registered.object.storage_key !== storageKey) {
        const winner = await calculateDriveObjectSha256({
          storageKey: registered.object.storage_key, bucket: registered.object.storage_bucket,
        }).catch(() => null);
        await deleteDriveObject({ storageKey, bucket: stored.bucket }).catch(() => undefined);
        if (!winner || winner.sha256 !== scanned.sha256 || winner.sizeBytes !== bytes.byteLength) {
          return reply({ ok: false, error: "PERSONAL_UPLOAD_DEDUP_OBJECT_INVALID" }, 409);
        }
      }
    }
    // Atomic DB RPC validates USER ownership and applies quota at commit time.
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
        // The object was already committed: report saved-to-root, not upload failed.
        placedInFolder = false;
      }
    }
    return reply({ ok: true, saved: true, scanStatus: "CLEAN",
      contentRefId: ref.id, placedInFolder, targetFolderId: placedInFolder ? folderId || null : null }, 201);
  } catch (error) { return failure(error); }
}
