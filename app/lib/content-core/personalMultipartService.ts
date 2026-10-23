import { DimproIdentityError } from "@/app/lib/identity-core/types";
import { getDriveObjectStorageConfig, getDriveObjectStorageSafeStatus } from "@/app/lib/drive-core/storageConfig";
import { getDriveSecurityScannerHealth, getDriveScannerUploadLimitBytes } from "@/app/lib/drive-core/securityScanService";
import {
  buildPersonalMultipartStorageKey, createDriveS3Multipart, abortDriveS3Multipart,
  createDriveS3PartUrl, listDriveS3MultipartParts, inspectDriveS3MultipartPart,
  completeDriveS3Multipart, headDriveObject,
} from "@/app/lib/drive-core/s3ObjectStorage";
import {
  getPersonalMultipartSchemaReadiness, getOwnedPersonalMultipartSession,
  reservePersonalMultipartSession, transitionPersonalMultipartSession,
  type PersonalMultipartSessionRow,
} from "./personalMultipartRepository";
import {
  personalMultipartFeatureEnabled, PERSONAL_MULTIPART_SERVER_RELEASED, PERSONAL_MULTIPART_MAX_BYTES,
  PERSONAL_MULTIPART_SESSION_TTL_MS,
  planPersonalMultipart, personalMultipartExpectedPartSize,
  validatePersonalMultipartParts, canAbortPersonalMultipart,
  type PersonalMultipartPart,
} from "./personalMultipartPolicy";
import {
  normalizePersonalUploadFileName, normalizePersonalStreamMimeType, validPersonalUploadRequestId,
} from "./personalUploadPolicy";

const error = (code: string, status = 409) => new DimproIdentityError(code, code, status);
const SHA = /^[a-f0-9]{64}$/i;
const ETAG = /^[a-f0-9-]{16,128}$/i;
const isExpired = (session: PersonalMultipartSessionRow) =>
  !Number.isFinite(Date.parse(session.expires_at)) || Date.parse(session.expires_at) <= Date.now();

/**
 * Run-time safety gate. No INIT or part/complete APIs can create or modify S3
 * until schema, storage AND a full-size, independently validated AV worker pass.
 * Present DEV scanner max is below 5 GiB, so this deliberately fails closed.
 */
export async function requirePersonalMultipartServerReady() {
  if (!PERSONAL_MULTIPART_SERVER_RELEASED) throw error("PERSONAL_MULTIPART_SOURCE_ONLY", 503);
  if (!personalMultipartFeatureEnabled(process.env)) throw error("PERSONAL_MULTIPART_FEATURE_OFF", 403);
  if (process.env.DIMPRO_DRIVE_PERSONAL_LARGE_SCAN_VERIFIED !== "true") {
    throw error("PERSONAL_MULTIPART_FULL_SCAN_NOT_VERIFIED", 503);
  }
  const config = getDriveObjectStorageConfig();
  const status = getDriveObjectStorageSafeStatus(config);
  const [schema, scanner] = await Promise.all([
    getPersonalMultipartSchemaReadiness(), getDriveSecurityScannerHealth(),
  ]);
  if (!schema.ready || !scanner.ready || !status.objectWriteEnabled || !status.objectDownloadEnabled
    || config.maxUploadBytes < PERSONAL_MULTIPART_MAX_BYTES
    || getDriveScannerUploadLimitBytes() < PERSONAL_MULTIPART_MAX_BYTES) {
    throw error("PERSONAL_MULTIPART_RELEASE_GATE_NOT_MET", 503);
  }
  return config;
}

export async function requireOwnedActiveSession(userId: string, sessionId: string) {
  if (!validPersonalUploadRequestId(sessionId)) throw error("PERSONAL_MULTIPART_SESSION_INVALID", 400);
  const session = await getOwnedPersonalMultipartSession({ ownerUserId: userId, sessionId });
  if (!session) throw error("PERSONAL_MULTIPART_SESSION_NOT_FOUND", 404);
  if (isExpired(session) && ["INITIATED", "UPLOADING"].includes(session.status)) {
    throw error("PERSONAL_MULTIPART_EXPIRED", 410);
  }
  return session;
}

function sessionUrls(sessionId: string) {
  const path = "/api/drive/personal/uploads/multipart/" + encodeURIComponent(sessionId);
  return {
    checkpointUrl: path + "/checkpoint",
    partUrlTemplate: path + "/parts/{partNumber}",
    completeUrl: path + "/complete",
    abortUrl: path + "/abort",
  };
}

export async function initPersonalMultipartSession(input: {
  ownerUserId: string; data: Record<string, unknown>;
}) {
  const config = await requirePersonalMultipartServerReady();
  const requestId = input.data.requestId;
  if (!validPersonalUploadRequestId(requestId)) throw error("PERSONAL_MULTIPART_REQUEST_ID_INVALID", 400);
  let fileName: string;
  let mimeType: string;
  try {
    fileName = normalizePersonalUploadFileName(input.data.fileName);
    mimeType = normalizePersonalStreamMimeType(
      typeof input.data.mimeType === "string" ? input.data.mimeType : null);
  } catch { throw error("PERSONAL_MULTIPART_FILE_METADATA_INVALID",400); }
  const expectedSha256 = typeof input.data.sha256 === "string" ? input.data.sha256.toLowerCase() : "";
  if (!SHA.test(expectedSha256)) throw error("PERSONAL_MULTIPART_SHA256_REQUIRED", 400);
  const folderId = input.data.folderId == null || input.data.folderId === ""
    ? null : String(input.data.folderId);
  if (folderId && !validPersonalUploadRequestId(folderId)) throw error("PERSONAL_MULTIPART_FOLDER_INVALID", 400);
  const sizeBytes = input.data.sizeBytes;
  if (typeof sizeBytes !== "number") throw error("PERSONAL_MULTIPART_SIZE_INVALID", 400);
  let plan: ReturnType<typeof planPersonalMultipart>;
  try { plan = planPersonalMultipart(sizeBytes, config.multipartChunkSizeBytes); }
  catch { throw error("PERSONAL_MULTIPART_SIZE_INVALID", 413); }
  const sessionId = requestId; // deterministic key allows idempotent INIT retry.
  const storageKey = buildPersonalMultipartStorageKey({
    userId: input.ownerUserId, sessionId, fileName,
  });
  const expiresAt = new Date(Date.now() + PERSONAL_MULTIPART_SESSION_TTL_MS).toISOString();
  const session = await reservePersonalMultipartSession({
    ownerUserId: input.ownerUserId, requestId,
    session: {
      id: sessionId, folder_id: folderId, file_name: fileName, mime_type: mimeType,
      size_bytes: plan.sizeBytes, expected_sha256: expectedSha256,
      chunk_size_bytes: plan.chunkSizeBytes, total_parts: plan.totalParts,
      storage_bucket: config.bucket, storage_key: storageKey, expires_at: expiresAt,
    },
  });
  if (isExpired(session)) throw error("PERSONAL_MULTIPART_EXPIRED", 410);
  if (session.status !== "INITIATED") {
    if (!["UPLOADING","COMPLETING","QUARANTINED"].includes(session.status)) {
      throw error("PERSONAL_MULTIPART_INIT_TERMINAL_STATE");
    }
    return { ok: true, resumed: true, session: publicSession(session), ...sessionUrls(session.id) };
  }
  if (session.storage_upload_id) throw error("PERSONAL_MULTIPART_INIT_INCONSISTENT");
  const created = await createDriveS3Multipart({ storageKey: session.storage_key, mimeType });
  try {
    const active = await transitionPersonalMultipartSession({
      ownerUserId: input.ownerUserId, sessionId: session.id,
      expectedStatus: "INITIATED", expectedVersion: session.state_version,
      nextStatus: "UPLOADING", updates: { storage_upload_id: created.uploadId },
    });
    return { ok: true, resumed: false, session: publicSession(active), ...sessionUrls(active.id) };
  } catch (cause) {
    await abortDriveS3Multipart({ storageKey: session.storage_key, uploadId: created.uploadId }).catch(() => undefined);
    throw cause;
  }
}

export function publicSession(session: PersonalMultipartSessionRow) {
  return {
    id: session.id, fileName: session.file_name, sizeBytes: session.size_bytes,
    status: session.status, chunkSizeBytes: session.chunk_size_bytes,
    totalParts: session.total_parts, expiresAt: session.expires_at,
    completedPartNumbers: session.part_manifest.map(p => p.partNumber).sort((a,b) => a-b),
    downloadable: false, scanStatus: "NOT_SCANNED",
  };
}

function requireUploading(session: PersonalMultipartSessionRow) {
  if (session.status !== "UPLOADING" || !session.storage_upload_id) {
    throw error("PERSONAL_MULTIPART_NOT_UPLOADING");
  }
}

export async function personalMultipartCheckpoint(ownerUserId: string, sessionId: string) {
  await requirePersonalMultipartServerReady();
  const session = await requireOwnedActiveSession(ownerUserId, sessionId);
  if (session.status !== "UPLOADING") {
    return { ok: true, session: publicSession(session), confirmedParts: [] };
  }
  requireUploading(session);
  const actual = await listDriveS3MultipartParts({
    storageKey: session.storage_key, uploadId: session.storage_upload_id!,
  });
  const byNumber = new Map(actual.map(p => [p.partNumber, p]));
  const confirmed = session.part_manifest.filter(part => {
    const objectPart = byNumber.get(part.partNumber);
    return !!objectPart && objectPart.sizeBytes === part.sizeBytes
      && objectPart.etag.toLowerCase() === part.etag.toLowerCase();
  });
  return { ok: true, session: publicSession(session),
    confirmedParts: confirmed.map(p => p.partNumber).sort((a,b) => a-b),
    unconfirmedParts: actual.filter(p => !confirmed.some(c => c.partNumber === p.partNumber))
      .map(p => p.partNumber) };
}

export async function personalMultipartPartUrl(ownerUserId: string, sessionId: string, partNumber: number) {
  await requirePersonalMultipartServerReady();
  const session = await requireOwnedActiveSession(ownerUserId, sessionId);
  requireUploading(session);
  const expectedSizeBytes = personalMultipartExpectedPartSize({
    sizeBytes: session.size_bytes, chunkSizeBytes: session.chunk_size_bytes,
    totalParts: session.total_parts,
  }, partNumber);
  const signed = await createDriveS3PartUrl({
    storageKey: session.storage_key, uploadId: session.storage_upload_id!, partNumber,
  });
  return { ok: true, partNumber, expectedSizeBytes,
    upload: { method: signed.method, url: signed.url, expiresAt: signed.expiresAt } };
}

export async function personalMultipartConfirmPart(input: {
  ownerUserId: string; sessionId: string; partNumber: number;
  etag: unknown; sha256: unknown;
}) {
  await requirePersonalMultipartServerReady();
  const session = await requireOwnedActiveSession(input.ownerUserId, input.sessionId);
  requireUploading(session);
  const etag = typeof input.etag === "string" ? input.etag.trim().replace(/^"|"$/g, "").toLowerCase() : "";
  const sha256 = typeof input.sha256 === "string" ? input.sha256.toLowerCase() : "";
  if (!ETAG.test(etag) || !SHA.test(sha256)) throw error("PERSONAL_MULTIPART_PART_AUDIT_INVALID", 400);
  const expectedSize = personalMultipartExpectedPartSize({
    sizeBytes: session.size_bytes, chunkSizeBytes: session.chunk_size_bytes,
    totalParts: session.total_parts,
  }, input.partNumber);
  const actual = await inspectDriveS3MultipartPart({
    storageKey: session.storage_key, uploadId: session.storage_upload_id!,
    partNumber: input.partNumber,
  });
  if (actual.sizeBytes !== expectedSize || actual.etag.toLowerCase() !== etag) {
    throw error("PERSONAL_MULTIPART_PART_S3_MISMATCH");
  }
  const existing = session.part_manifest.find(p => p.partNumber === input.partNumber);
  if (existing) {
    if (existing.etag !== etag || existing.sha256 !== sha256 || existing.sizeBytes !== expectedSize) {
      throw error("PERSONAL_MULTIPART_PART_CONFLICT");
    }
    return { ok: true, alreadyConfirmed: true, partNumber: input.partNumber };
  }
  // Client-provided part SHA is audit metadata, not proof; the eventual full
  // S3 object digest and independent full-file malware scan remain mandatory.
  const nextPart: PersonalMultipartPart = {
    partNumber: input.partNumber, sizeBytes: expectedSize, etag, sha256,
  };
  const manifest = [...session.part_manifest, nextPart].sort((a,b) => a.partNumber - b.partNumber);
  await transitionPersonalMultipartSession({
    ownerUserId: input.ownerUserId, sessionId: session.id, expectedStatus: "UPLOADING",
    expectedVersion: session.state_version, nextStatus: "UPLOADING",
    updates: { part_manifest: manifest },
  });
  return { ok: true, partNumber: input.partNumber, confirmedParts: manifest.length };
}

export async function personalMultipartAbort(ownerUserId: string, sessionId: string) {
  await requirePersonalMultipartServerReady();
  const session = await requireOwnedActiveSession(ownerUserId, sessionId);
  if (!canAbortPersonalMultipart(session.status)) throw error("PERSONAL_MULTIPART_ABORT_BLOCKED");
  const aborted = await transitionPersonalMultipartSession({
    ownerUserId, sessionId, expectedStatus: session.status,
    expectedVersion: session.state_version, nextStatus: "ABORTED",
  });
  if (session.storage_upload_id) {
    await abortDriveS3Multipart({
      storageKey: session.storage_key, uploadId: session.storage_upload_id,
    });
  }
  return { ok: true, session: publicSession(aborted) };
}

export async function personalMultipartComplete(ownerUserId: string, sessionId: string) {
  await requirePersonalMultipartServerReady();
  const session = await requireOwnedActiveSession(ownerUserId, sessionId);
  requireUploading(session);
  const manifest = validatePersonalMultipartParts({
    sizeBytes: session.size_bytes, chunkSizeBytes: session.chunk_size_bytes,
    totalParts: session.total_parts,
  }, session.part_manifest);
  const actual = await listDriveS3MultipartParts({
    storageKey: session.storage_key, uploadId: session.storage_upload_id!,
  });
  const s3ByNumber = new Map(actual.map(part => [part.partNumber,part]));
  if (actual.length !== manifest.length || manifest.some(part => {
    const found = s3ByNumber.get(part.partNumber);
    return !found || found.sizeBytes !== part.sizeBytes
      || found.etag.toLowerCase() !== part.etag.toLowerCase();
  })) {
    throw error("PERSONAL_MULTIPART_INCOMPLETE_S3");
  }
  // Freeze session before S3 complete. On network loss after CompleteMultipart
  // the state remains COMPLETING for a reconciler; never re-run blindly.
  const completing = await transitionPersonalMultipartSession({
    ownerUserId, sessionId, expectedStatus: "UPLOADING",
    expectedVersion: session.state_version, nextStatus: "COMPLETING",
  });
  await completeDriveS3Multipart({
    storageKey: completing.storage_key, uploadId: completing.storage_upload_id!,
    parts: manifest.map(p => ({ partNumber: p.partNumber, etag: p.etag })),
  });
  const head = await headDriveObject({ storageKey: completing.storage_key, bucket: completing.storage_bucket });
  if (head.contentLength !== completing.size_bytes) {
    throw error("PERSONAL_MULTIPART_WHOLE_SIZE_MISMATCH");
  }
  const quarantined = await transitionPersonalMultipartSession({
    ownerUserId, sessionId, expectedStatus: "COMPLETING",
    expectedVersion: completing.state_version, nextStatus: "QUARANTINED",
  });
  return { ok: true, session: publicSession(quarantined),
    message: "Feltöltve és karanténba helyezve. Teljes fájlvizsgálatra vár.",
    downloadable: false };
}

export function validatePersonalMultipartInitBody(body: unknown): Record<string, unknown> {
  if (!body || Array.isArray(body) || typeof body !== "object") {
    throw error("PERSONAL_MULTIPART_INPUT_INVALID", 400);
  }
  return body as Record<string, unknown>;
}
