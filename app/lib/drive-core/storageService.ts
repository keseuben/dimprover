import { randomUUID } from "node:crypto";
import { DriveCoreRepositoryError } from "./errors";
import {
  buildDriveStorageKey,
  calculateDriveObjectSha256,
  createDriveSignedGetUrl,
  createDriveSignedPutUrl,
  deleteDriveObject,
  headDriveObject,
} from "./s3ObjectStorage";
import { getDriveObjectStorageConfig, getDriveObjectStorageSafeStatus } from "./storageConfig";
import {
  abortDriveUploadSessionRecord,
  createDriveUploadSessionRecord,
  finalizeDriveUploadSessionRecord,
  getDriveDownloadVersionRecord,
  getDriveObjectStorageDatabaseHealth,
  getDriveUploadSessionRecord,
  logDriveDownloadRecord,
} from "./storageRepository";
import type { DriveDocumentSource, DriveUploadSession } from "./types";

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeFileName(value: unknown) {
  return normalizeText(value).replace(/[\\/\u0000-\u001f]/g, "_").replace(/\s+/g, " ").slice(0, 240);
}

function normalizeMimeType(value: unknown) {
  const mimeType = normalizeText(value, "application/octet-stream").toLowerCase();
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mimeType)
    ? mimeType.slice(0, 160)
    : "application/octet-stream";
}

function normalizeInteger(value: unknown, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeSha256(value: unknown) {
  const text = normalizeText(value).toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : null;
}

function normalizeSource(value: unknown): DriveDocumentSource {
  if (value === "DESKTOP" || value === "DROP" || value === "SYSTEM") return value;
  return "WEB";
}

export async function getDriveObjectStorageHealth() {
  const [database, safeStatus] = await Promise.all([
    getDriveObjectStorageDatabaseHealth(),
    Promise.resolve(getDriveObjectStorageSafeStatus()),
  ]);
  return {
    component: "drive-object-storage",
    version: "0.4.0",
    database,
    ...safeStatus,
    ready: database.ready && safeStatus.storageConfigured,
    uploadReady: database.ready && safeStatus.objectWriteEnabled,
    downloadReady: database.ready && safeStatus.objectDownloadEnabled,
  };
}

export async function initDriveObjectUpload(input: {
  projectId: string;
  body: Record<string, unknown>;
  actorUserId: string;
  clientId?: string | null;
}) {
  const config = getDriveObjectStorageConfig();
  const status = getDriveObjectStorageSafeStatus(config);
  const database = await getDriveObjectStorageDatabaseHealth();
  if (!database.ready) {
    throw new DriveCoreRepositoryError(
      "A DRIVE Object Storage adatbázissémája még nincs aktiválva.",
      "DRIVE_OBJECT_SCHEMA_NOT_READY",
      503,
    );
  }
  if (!status.objectWriteEnabled) {
    throw new DriveCoreRepositoryError(status.warning, "DRIVE_OBJECT_WRITE_DISABLED", 503);
  }

  const documentId = normalizeText(input.body.documentId) || null;
  const folderId = normalizeText(input.body.folderId) || null;
  const uploadKind = documentId ? "NEW_VERSION" as const : "NEW_DOCUMENT" as const;
  if (uploadKind === "NEW_DOCUMENT" && !folderId) {
    throw new DriveCoreRepositoryError("Új dokumentum feltöltéséhez célmappa szükséges.", "DRIVE_UPLOAD_FOLDER_REQUIRED", 400);
  }
  const originalName = normalizeFileName(input.body.originalName || input.body.fileName || input.body.name);
  const documentName = normalizeFileName(input.body.documentName || input.body.name || originalName);
  if (!originalName || !documentName) {
    throw new DriveCoreRepositoryError("A feltöltendő fájl és a dokumentum neve kötelező.", "DRIVE_UPLOAD_NAME_REQUIRED", 400);
  }
  const sizeBytes = normalizeInteger(input.body.sizeBytes ?? input.body.fileSizeBytes, 0, 0, config.maxUploadBytes + 1);
  if (sizeBytes <= 0) {
    throw new DriveCoreRepositoryError("Üres vagy ismeretlen méretű fájl nem tölthető fel.", "DRIVE_UPLOAD_SIZE_REQUIRED", 400);
  }
  if (sizeBytes > config.maxUploadBytes) {
    throw new DriveCoreRepositoryError(
      `A fájl meghaladja a ${status.maxUploadMb} MB-os DRIVE feltöltési korlátot.`,
      "DRIVE_UPLOAD_TOO_LARGE",
      413,
    );
  }

  const now = new Date();
  const uploadId = `drive-upload-${randomUUID().slice(0, 16)}`;
  const expiresAt = new Date(now.getTime() + Math.max(config.signedUrlTtlSeconds + 300, 1_200) * 1000).toISOString();
  const finalVersionStatus = config.mode === "active" ? "AVAILABLE" as const : "QUARANTINED" as const;
  const storageKey = buildDriveStorageKey({ projectId: input.projectId, uploadId, fileName: originalName });
  const session: DriveUploadSession = {
    id: uploadId,
    projectId: input.projectId,
    folderId,
    documentId,
    uploadKind,
    documentName,
    originalName,
    mimeType: normalizeMimeType(input.body.mimeType),
    sizeBytes,
    sha256: normalizeSha256(input.body.sha256),
    expectedCurrentVersion: normalizeInteger(input.body.expectedCurrentVersion, 0),
    source: normalizeSource(input.body.source),
    clientId: normalizeText(input.clientId || input.body.clientId).slice(0, 160) || null,
    storageProvider: "S3",
    storageBucket: config.bucket,
    storageKey,
    finalVersionStatus,
    status: "INITIATED",
    expiresAt,
    finalizedDocumentId: null,
    finalizedVersionId: null,
    createdBy: input.actorUserId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    completedAt: null,
    metadata: {
      description: normalizeText(input.body.description).slice(0, 2000),
      revisionCode: normalizeText(input.body.revisionCode).slice(0, 40),
      changeNote: normalizeText(input.body.changeNote).slice(0, 1000),
      checksumVerified: false,
      signedUploadVersion: "0.4.0",
    },
  };

  const storedSession = await createDriveUploadSessionRecord(session, input.actorUserId);
  try {
    const signed = await createDriveSignedPutUrl({
      storageKey: storedSession.storageKey,
      mimeType: storedSession.mimeType,
      sizeBytes: storedSession.sizeBytes,
    });
    return {
      ok: true as const,
      mode: config.mode,
      upload: {
        id: storedSession.id,
        projectId: storedSession.projectId,
        uploadKind: storedSession.uploadKind,
        documentId: storedSession.documentId,
        folderId: storedSession.folderId,
        documentName: storedSession.documentName,
        originalName: storedSession.originalName,
        mimeType: storedSession.mimeType,
        sizeBytes: storedSession.sizeBytes,
        status: storedSession.status,
        expiresAt: storedSession.expiresAt,
        finalVersionStatus: storedSession.finalVersionStatus,
      },
      signedUpload: {
        method: signed.method,
        url: signed.url,
        headers: { "content-type": storedSession.mimeType },
        expiresAt: signed.expiresAt,
      },
      completeUrl: `/api/projects/${encodeURIComponent(input.projectId)}/drive/uploads/${encodeURIComponent(storedSession.id)}/complete`,
      abortUrl: `/api/projects/${encodeURIComponent(input.projectId)}/drive/uploads/${encodeURIComponent(storedSession.id)}/abort`,
    };
  } catch (error) {
    await abortDriveUploadSessionRecord({
      projectId: input.projectId,
      uploadId: storedSession.id,
      actorUserId: input.actorUserId,
      reason: "A signed feltöltési URL létrehozása sikertelen.",
    }).catch(() => undefined);
    throw error;
  }
}

export async function completeDriveObjectUpload(input: {
  projectId: string;
  uploadId: string;
  actorUserId: string;
}) {
  const session = await getDriveUploadSessionRecord(input.projectId, input.uploadId);
  if (!session) throw new DriveCoreRepositoryError("A feltöltési munkamenet nem található.", "DRIVE_UPLOAD_NOT_FOUND", 404);
  if (session.status === "FINALIZED") {
    return { ok: true as const, alreadyFinalized: true, session };
  }
  if (session.status !== "INITIATED") {
    throw new DriveCoreRepositoryError("A feltöltési munkamenet már nem véglegesíthető.", "DRIVE_UPLOAD_INVALID_STATE", 409);
  }
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    throw new DriveCoreRepositoryError("A feltöltési munkamenet lejárt.", "DRIVE_UPLOAD_EXPIRED", 410);
  }

  let object;
  try {
    object = await headDriveObject({ storageKey: session.storageKey, bucket: session.storageBucket });
  } catch (error) {
    throw new DriveCoreRepositoryError(
      "A feltöltött objektum még nem található a privát tárhelyen.",
      "DRIVE_UPLOAD_OBJECT_NOT_FOUND",
      409,
      error instanceof Error ? error.message : undefined,
    );
  }
  if (object.contentLength !== session.sizeBytes) {
    await deleteDriveObject({ storageKey: session.storageKey, bucket: session.storageBucket }).catch(() => undefined);
    await abortDriveUploadSessionRecord({
      projectId: input.projectId,
      uploadId: input.uploadId,
      actorUserId: input.actorUserId,
      reason: `Méreteltérés: várt ${session.sizeBytes}, kapott ${object.contentLength}.`,
    }).catch(() => undefined);
    throw new DriveCoreRepositoryError(
      "A feltöltött objektum mérete nem egyezik az előkészített fájlmérettel.",
      "DRIVE_UPLOAD_SIZE_MISMATCH",
      409,
    );
  }

  let checksum;
  try {
    checksum = await calculateDriveObjectSha256({ storageKey: session.storageKey, bucket: session.storageBucket });
  } catch (error) {
    await deleteDriveObject({ storageKey: session.storageKey, bucket: session.storageBucket }).catch(() => undefined);
    await abortDriveUploadSessionRecord({
      projectId: input.projectId,
      uploadId: input.uploadId,
      actorUserId: input.actorUserId,
      reason: "A szerveroldali SHA-256 ellenőrzés sikertelen.",
    }).catch(() => undefined);
    throw new DriveCoreRepositoryError(
      "A feltöltött fájl SHA-256 ellenőrzése sikertelen, ezért a verzió nem aktiválható.",
      "DRIVE_UPLOAD_CHECKSUM_FAILED",
      409,
      error instanceof Error ? error.message : undefined,
    );
  }
  if (checksum.sizeBytes !== session.sizeBytes) {
    await deleteDriveObject({ storageKey: session.storageKey, bucket: session.storageBucket }).catch(() => undefined);
    await abortDriveUploadSessionRecord({
      projectId: input.projectId,
      uploadId: input.uploadId,
      actorUserId: input.actorUserId,
      reason: `SHA-256 visszaolvasási méreteltérés: várt ${session.sizeBytes}, kapott ${checksum.sizeBytes}.`,
    }).catch(() => undefined);
    throw new DriveCoreRepositoryError(
      "A hash-ellenőrzés közben visszaolvasott objektumméret eltér a feltöltési munkamenettől.",
      "DRIVE_UPLOAD_CHECKSUM_SIZE_MISMATCH",
      409,
    );
  }
  if (session.sha256 && session.sha256.toLowerCase() !== checksum.sha256) {
    await deleteDriveObject({ storageKey: session.storageKey, bucket: session.storageBucket }).catch(() => undefined);
    await abortDriveUploadSessionRecord({
      projectId: input.projectId,
      uploadId: input.uploadId,
      actorUserId: input.actorUserId,
      reason: "SHA-256 eltérés az előre megadott és a szerveren visszaolvasott fájl között.",
    }).catch(() => undefined);
    throw new DriveCoreRepositoryError(
      "A feltöltött fájl SHA-256 lenyomata nem egyezik az előre megadott értékkel.",
      "DRIVE_UPLOAD_CHECKSUM_MISMATCH",
      409,
    );
  }

  let result;
  try {
    result = await finalizeDriveUploadSessionRecord({
      projectId: input.projectId,
      uploadId: input.uploadId,
      receivedSizeBytes: object.contentLength,
      storageEtag: object.etag,
      verifiedSha256: checksum.sha256,
      actorUserId: input.actorUserId,
    });
  } catch (error) {
    if (error instanceof DriveCoreRepositoryError
      && [
        "DRIVE_CORE_VERSION_CONFLICT",
        "DRIVE_UPLOAD_EXPIRED",
        "DRIVE_UPLOAD_SIZE_MISMATCH",
        "DRIVE_UPLOAD_CHECKSUM_REQUIRED",
        "DRIVE_UPLOAD_CHECKSUM_MISMATCH",
      ].includes(error.code)) {
      await deleteDriveObject({ storageKey: session.storageKey, bucket: session.storageBucket }).catch(() => undefined);
      await abortDriveUploadSessionRecord({
        projectId: input.projectId,
        uploadId: input.uploadId,
        actorUserId: input.actorUserId,
        reason: error.message,
      }).catch(() => undefined);
    }
    throw error;
  }
  return {
    ok: true as const,
    alreadyFinalized: false,
    session: result.session,
    document: result.document,
    version: result.version,
    object: {
      sizeBytes: object.contentLength,
      contentType: object.contentType,
      etag: object.etag,
      sha256: checksum.sha256,
      checksumAlgorithm: "SHA-256",
      checksumVerified: true,
    },
  };
}

export async function abortDriveObjectUpload(input: {
  projectId: string;
  uploadId: string;
  actorUserId: string;
  reason?: string;
}) {
  const session = await getDriveUploadSessionRecord(input.projectId, input.uploadId);
  if (!session) throw new DriveCoreRepositoryError("A feltöltési munkamenet nem található.", "DRIVE_UPLOAD_NOT_FOUND", 404);
  if (session.status === "FINALIZED") {
    throw new DriveCoreRepositoryError("A véglegesített dokumentumfeltöltés nem szakítható meg.", "DRIVE_UPLOAD_ALREADY_FINALIZED", 409);
  }
  await deleteDriveObject({ storageKey: session.storageKey, bucket: session.storageBucket }).catch(() => undefined);
  const aborted = await abortDriveUploadSessionRecord({
    projectId: input.projectId,
    uploadId: input.uploadId,
    actorUserId: input.actorUserId,
    reason: input.reason,
  });
  return { ok: true as const, session: aborted };
}

export async function initDriveObjectDownload(input: {
  projectId: string;
  documentId: string;
  versionId?: string | null;
  actorUserId: string;
  clientId?: string | null;
}) {
  const config = getDriveObjectStorageConfig();
  const status = getDriveObjectStorageSafeStatus(config);
  const database = await getDriveObjectStorageDatabaseHealth();
  if (!database.ready) {
    throw new DriveCoreRepositoryError("A DRIVE Object Storage adatbázissémája még nincs aktiválva.", "DRIVE_OBJECT_SCHEMA_NOT_READY", 503);
  }
  const record = await getDriveDownloadVersionRecord({
    projectId: input.projectId,
    documentId: input.documentId,
    versionId: input.versionId,
  });
  if (!record) throw new DriveCoreRepositoryError("A dokumentumverzió nem található.", "DRIVE_DOWNLOAD_NOT_FOUND", 404);
  const trustedDropArchive = record.documentSource === "DROP"
    && record.version.status === "AVAILABLE"
    && record.version.storageProvider === "S3"
    && Boolean(record.version.storageKey);
  if (!status.objectDownloadEnabled && !trustedDropArchive) {
    throw new DriveCoreRepositoryError(status.warning, "DRIVE_OBJECT_DOWNLOAD_DISABLED", 503);
  }
  if (record.version.status !== "AVAILABLE" || record.version.storageProvider !== "S3" || !record.version.storageKey) {
    throw new DriveCoreRepositoryError(
      "Ez a dokumentumverzió még nem tölthető le a privát DRIVE tárhelyről.",
      "DRIVE_DOWNLOAD_NOT_AVAILABLE",
      409,
    );
  }
  const signed = await createDriveSignedGetUrl({
    storageKey: record.version.storageKey,
    bucket: record.version.storageBucket,
    fileName: record.version.originalName || record.documentName,
    mimeType: record.version.mimeType,
  });
  await logDriveDownloadRecord({
    projectId: input.projectId,
    documentId: input.documentId,
    versionId: record.version.id,
    actorUserId: input.actorUserId,
    clientId: input.clientId,
  });
  return {
    ok: true as const,
    download: {
      documentId: input.documentId,
      versionId: record.version.id,
      versionNumber: record.version.versionNumber,
      fileName: record.version.originalName || record.documentName,
      mimeType: record.version.mimeType,
      sizeBytes: record.version.sizeBytes,
      method: signed.method,
      url: signed.url,
      expiresAt: signed.expiresAt,
      source: record.documentSource,
      trustedDropArchive,
    },
  };
}


const DRIVE_INLINE_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/avif",
]);

export async function initDriveObjectPreview(input: {
  projectId: string;
  documentId: string;
  versionId?: string | null;
}) {
  const config = getDriveObjectStorageConfig();
  const status = getDriveObjectStorageSafeStatus(config);
  const database = await getDriveObjectStorageDatabaseHealth();
  if (!database.ready) {
    throw new DriveCoreRepositoryError("A DRIVE Object Storage adatbázissémája még nincs aktiválva.", "DRIVE_OBJECT_SCHEMA_NOT_READY", 503);
  }
  const record = await getDriveDownloadVersionRecord({
    projectId: input.projectId,
    documentId: input.documentId,
    versionId: input.versionId,
  });
  if (!record) throw new DriveCoreRepositoryError("A dokumentumverzió nem található.", "DRIVE_PREVIEW_NOT_FOUND", 404);
  const trustedDropArchive = record.documentSource === "DROP"
    && record.version.status === "AVAILABLE"
    && record.version.storageProvider === "S3"
    && Boolean(record.version.storageKey);
  if (!status.objectDownloadEnabled && !trustedDropArchive) {
    throw new DriveCoreRepositoryError(status.warning, "DRIVE_OBJECT_PREVIEW_DISABLED", 503);
  }
  if (record.version.status !== "AVAILABLE" || record.version.storageProvider !== "S3" || !record.version.storageKey) {
    throw new DriveCoreRepositoryError(
      "Ez a dokumentumverzió még nem jeleníthető meg a privát DRIVE tárhelyről.",
      "DRIVE_PREVIEW_NOT_AVAILABLE",
      409,
    );
  }
  const normalizedMime = (record.version.mimeType || "").toLowerCase();
  const kind = normalizedMime === "application/pdf"
    ? "PDF" as const
    : DRIVE_INLINE_IMAGE_MIME_TYPES.has(normalizedMime)
      ? "IMAGE" as const
      : null;
  if (!kind) {
    throw new DriveCoreRepositoryError(
      "Ehhez a fájltípushoz nincs biztonságos inline DRIVE előnézet.",
      "DRIVE_PREVIEW_UNSUPPORTED_TYPE",
      415,
    );
  }
  const signed = await createDriveSignedGetUrl({
    storageKey: record.version.storageKey,
    bucket: record.version.storageBucket,
    fileName: record.version.originalName || record.documentName,
    mimeType: record.version.mimeType,
    disposition: "inline",
  });
  return {
    ok: true as const,
    preview: {
      documentId: input.documentId,
      versionId: record.version.id,
      versionNumber: record.version.versionNumber,
      fileName: record.version.originalName || record.documentName,
      mimeType: record.version.mimeType,
      sizeBytes: record.version.sizeBytes,
      kind,
      method: signed.method,
      url: signed.url,
      expiresAt: signed.expiresAt,
      source: record.documentSource,
      trustedDropArchive,
    },
  };
}
