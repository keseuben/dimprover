import { randomUUID } from "node:crypto";
import type { ProjectAccessContext } from "@/app/lib/project-core/types";
import { DriveCoreRepositoryError } from "./errors";
import { normalizeDriveFileName, normalizeDriveRelativePath } from "./nameNormalizer";
import { normalizeDriveExportAlias } from "./exportNaming";
import {
  buildDriveStorageKey,
  calculateDriveObjectSha256,
  createDriveSignedGetUrl,
  createDriveSignedPutUrl,
  deleteDriveObject,
  getDriveObjectStream,
  headDriveObject,
  putDriveObjectStream,
} from "./s3ObjectStorage";
import { getDriveObjectStorageConfig, getDriveObjectStorageSafeStatus } from "./storageConfig";
import { requireDriveCleanSecurityScan } from "./securityScanRepository";
import { requireDriveDocumentAccess, requireDriveFolderAccess } from "./folderAccess";
import {
  abortDriveUploadSessionRecord,
  createDriveUploadSessionRecord,
  finalizeDriveUploadSessionRecord,
  getDriveDownloadVersionRecord,
  getDriveObjectStorageDatabaseHealth,
  getDriveProjectStorageUsageRecord,
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

async function requireDriveUploadSessionAccess(
  projectId: string,
  session: Pick<DriveUploadSession, "uploadKind" | "documentId" | "folderId" | "finalizedDocumentId" | "status">,
  access: ProjectAccessContext,
) {
  if (session.status === "FINALIZED" && session.finalizedDocumentId) {
    await requireDriveDocumentAccess(projectId, session.finalizedDocumentId, access);
    return;
  }
  if (session.uploadKind === "NEW_VERSION" && session.documentId) {
    await requireDriveDocumentAccess(projectId, session.documentId, access);
    return;
  }
  if (session.folderId) {
    await requireDriveFolderAccess(projectId, session.folderId, access);
    return;
  }
  throw new DriveCoreRepositoryError(
    "A feltöltési munkamenet célmappája vagy dokumentuma nem azonosítható.",
    "DRIVE_UPLOAD_ACCESS_TARGET_MISSING",
    409,
  );
}

export async function getDriveObjectStorageHealth() {
  const [database, safeStatus] = await Promise.all([
    getDriveObjectStorageDatabaseHealth(),
    Promise.resolve(getDriveObjectStorageSafeStatus()),
  ]);
  return {
    component: "drive-object-storage",
    version: database.expectedSchemaVersion,
    database,
    ...safeStatus,
    ready: database.ready && safeStatus.storageConfigured,
    uploadReady: database.ready && safeStatus.objectWriteEnabled,
    downloadReady: database.ready && safeStatus.objectDownloadEnabled,
  };
}

export async function getDriveProjectStorageQuota(projectId: string) {
  const config = getDriveObjectStorageConfig();
  const usage = await getDriveProjectStorageUsageRecord(projectId);
  const quotaBytes = config.projectDefaultQuotaBytes;
  const usedBytes = Math.max(0, usage.usedBytes);
  const reservedBytes = Math.max(0, usage.reservedBytes);
  const occupiedBytes = usedBytes + reservedBytes;
  const remainingBytes = Math.max(0, quotaBytes - occupiedBytes);
  const usagePercent = quotaBytes > 0 ? Math.min(100, (occupiedBytes / quotaBytes) * 100) : 0;
  return {
    projectId,
    quotaBytes,
    usedBytes,
    reservedBytes,
    occupiedBytes,
    remainingBytes,
    usagePercent,
    warningPercent: 80,
    criticalPercent: 95,
    hardLimit: true,
    source: "PROJECT_DEFAULT" as const,
  };
}

export async function initDriveObjectUpload(input: {
  projectId: string;
  body: Record<string, unknown>;
  actorUserId: string;
  access: ProjectAccessContext;
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
  if (uploadKind === "NEW_VERSION" && documentId) {
    await requireDriveDocumentAccess(input.projectId, documentId, input.access);
  } else if (folderId) {
    await requireDriveFolderAccess(input.projectId, folderId, input.access);
  }
  const rawOriginalName = typeof (input.body.originalName || input.body.fileName || input.body.name) === "string"
    ? String(input.body.originalName || input.body.fileName || input.body.name).slice(0, 2000)
    : "";
  if (!rawOriginalName.trim()) {
    throw new DriveCoreRepositoryError("A feltöltendő fájl eredeti neve kötelező.", "DRIVE_UPLOAD_NAME_REQUIRED", 400);
  }
  const normalizedFileName = normalizeDriveFileName(rawOriginalName);
  const requestedRelativePath = typeof input.body.originalRelativePath === "string" && input.body.originalRelativePath.trim()
    ? input.body.originalRelativePath.slice(0, 4000)
    : rawOriginalName;
  const normalizedRelativePath = normalizeDriveRelativePath(requestedRelativePath);
  const originalName = normalizeFileName(rawOriginalName);
  const requestedDocumentName = normalizeFileName(input.body.documentName || input.body.name || "");
  const documentName = uploadKind === "NEW_DOCUMENT"
    ? normalizedFileName.safeFileName
    : requestedDocumentName || normalizedFileName.safeFileName;
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

  const quota = await getDriveProjectStorageQuota(input.projectId);
  if (quota.hardLimit && quota.occupiedBytes + sizeBytes > quota.quotaBytes) {
    throw new DriveCoreRepositoryError(
      "A projekt " + Math.round(quota.quotaBytes / 1024 ** 3) + " GB-os tárhelykerete megtelt vagy a feltöltéssel túllépésre kerülne.",
      "DRIVE_PROJECT_QUOTA_EXCEEDED",
      507,
      quota,
    );
  }

  const versionKind = uploadKind === "NEW_DOCUMENT" ? "INITIAL" : input.body.versionKind === "REVISION" ? "REVISION" : "VERSION";
  const revisionReason = normalizeText(input.body.revisionReason).slice(0, 1000);
  const revisionDate = /^\d{4}-\d{2}-\d{2}$/.test(normalizeText(input.body.revisionDate)) ? normalizeText(input.body.revisionDate) : "";
  if (versionKind === "REVISION" && !revisionReason) {
    throw new DriveCoreRepositoryError("Új hivatalos revízióhoz a revízió oka kötelező.", "DRIVE_REVISION_REASON_REQUIRED", 400);
  }

  const now = new Date();
  const uploadId = `drive-upload-${randomUUID().slice(0, 16)}`;
  const expiresAt = new Date(now.getTime() + Math.max(config.signedUrlTtlSeconds + 300, 1_200) * 1000).toISOString();
  // WEB/DESKTOP feltöltés mindig karanténba kerül. AVAILABLE csak sikeres vírusvizsgálat + jóváhagyás után lehet.
  const finalVersionStatus = "QUARANTINED" as const;
  const storageKey = buildDriveStorageKey({ projectId: input.projectId, uploadId, fileName: normalizedFileName.safeFileName });
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
      versionKind,
      revisionReason,
      revisionDate,
      exportAlias: uploadKind === "NEW_DOCUMENT" ? normalizeDriveExportAlias(input.body.exportAlias || documentName) : "",
      changeNote: normalizeText(input.body.changeNote).slice(0, 1000),
      originalFileName: normalizedFileName.originalFileName,
      safeFileName: normalizedFileName.safeFileName,
      displayName: normalizedFileName.displayName,
      nameNormalizationVersion: normalizedFileName.normalizationVersion,
      nameWasSanitized: normalizedFileName.nameWasSanitized,
      nameWasShortened: normalizedFileName.nameWasShortened,
      originalRelativePath: normalizedRelativePath.originalRelativePath,
      safeRelativePath: normalizedRelativePath.safeRelativePath,
      pathWasCompacted: Boolean(normalizedRelativePath.pathWasCompacted),
      checksumVerified: false,
      signedUploadVersion: "0.4.2",
    },
  };

  const storedSession = await createDriveUploadSessionRecord(session, input.actorUserId, quota.quotaBytes);
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
      browserUpload: {
        method: "PUT" as const,
        url: `/api/projects/${encodeURIComponent(input.projectId)}/drive/uploads/${encodeURIComponent(storedSession.id)}/object`,
        headers: { "content-type": storedSession.mimeType },
        expiresAt: storedSession.expiresAt,
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

export async function uploadDriveObjectThroughServer(input: {
  projectId: string;
  uploadId: string;
  actorUserId: string;
  access: ProjectAccessContext;
  contentLength: number;
  contentType?: string | null;
  body: AsyncIterable<Uint8Array>;
}) {
  const config = getDriveObjectStorageConfig();
  const status = getDriveObjectStorageSafeStatus(config);
  if (!status.objectWriteEnabled) {
    throw new DriveCoreRepositoryError(status.warning, "DRIVE_OBJECT_WRITE_DISABLED", 503);
  }

  const session = await getDriveUploadSessionRecord(input.projectId, input.uploadId);
  if (!session) {
    throw new DriveCoreRepositoryError("A feltöltési munkamenet nem található.", "DRIVE_UPLOAD_NOT_FOUND", 404);
  }
  if (session.createdBy !== input.actorUserId) {
    throw new DriveCoreRepositoryError("A feltöltési munkamenet más felhasználóhoz tartozik.", "DRIVE_UPLOAD_ACTOR_MISMATCH", 403);
  }
  await requireDriveUploadSessionAccess(input.projectId, session, input.access);
  if (session.status !== "INITIATED") {
    throw new DriveCoreRepositoryError("A feltöltési munkamenet már nem fogad fájlt.", "DRIVE_UPLOAD_INVALID_STATE", 409);
  }
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    throw new DriveCoreRepositoryError("A feltöltési munkamenet lejárt.", "DRIVE_UPLOAD_EXPIRED", 410);
  }
  if (session.storageBucket !== config.bucket) {
    throw new DriveCoreRepositoryError("A feltöltési munkamenet tárhelye eltér az aktív DRIVE buckettől.", "DRIVE_OBJECT_BUCKET_MISMATCH", 409);
  }
  if (!Number.isSafeInteger(input.contentLength) || input.contentLength <= 0) {
    throw new DriveCoreRepositoryError("A böngészős feltöltés Content-Length értéke hiányzik vagy érvénytelen.", "DRIVE_UPLOAD_CONTENT_LENGTH_REQUIRED", 411);
  }
  if (input.contentLength !== session.sizeBytes) {
    throw new DriveCoreRepositoryError(
      `A böngészős feltöltés mérete eltér az előkészített fájlmérettől (várt ${session.sizeBytes}, kapott ${input.contentLength}).`,
      "DRIVE_UPLOAD_SIZE_MISMATCH",
      409,
    );
  }

  const object = await putDriveObjectStream({
    storageKey: session.storageKey,
    body: input.body,
    contentType: session.mimeType,
    contentLength: session.sizeBytes,
    metadata: {
      "dimpro-source": "web-proxy-upload",
      "dimpro-upload-id": session.id,
    },
  });

  return {
    ok: true as const,
    upload: {
      id: session.id,
      projectId: session.projectId,
      sizeBytes: session.sizeBytes,
      mimeType: session.mimeType,
      status: session.status,
      storageProvider: session.storageProvider,
      etag: object.etag,
    },
  };
}

export async function completeDriveObjectUpload(input: {
  projectId: string;
  uploadId: string;
  actorUserId: string;
  access: ProjectAccessContext;
}) {
  const session = await getDriveUploadSessionRecord(input.projectId, input.uploadId);
  if (!session) throw new DriveCoreRepositoryError("A feltöltési munkamenet nem található.", "DRIVE_UPLOAD_NOT_FOUND", 404);
  if (session.createdBy !== input.actorUserId) {
    throw new DriveCoreRepositoryError("A feltöltési munkamenet más felhasználóhoz tartozik.", "DRIVE_UPLOAD_ACTOR_MISMATCH", 403);
  }
  await requireDriveUploadSessionAccess(input.projectId, session, input.access);
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

  // Az ACL a feltöltés közben megváltozhatott; közvetlenül a finalizálás előtt újraellenőrizzük.
  await requireDriveUploadSessionAccess(input.projectId, session, input.access);

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
  access: ProjectAccessContext;
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
    access: input.access,
  });
  if (!record) throw new DriveCoreRepositoryError("A dokumentumverzió nem található.", "DRIVE_DOWNLOAD_NOT_FOUND", 404);
  const trustedDropArchive = record.documentSource === "DROP"
    && record.version.status === "AVAILABLE"
    && record.version.storageProvider === "S3"
    && Boolean(record.version.storageKey);
  if (!status.objectDownloadEnabled && !trustedDropArchive) {
    throw new DriveCoreRepositoryError(status.warning, "DRIVE_OBJECT_DOWNLOAD_DISABLED", 503);
  }
  const downloadableStatus = record.version.status === "AVAILABLE" || record.version.status === "QUARANTINED";
  if (!downloadableStatus || record.version.storageProvider !== "S3" || !record.version.storageKey) {
    throw new DriveCoreRepositoryError(
      "Ez a dokumentumverzió még nem tölthető le a privát DRIVE tárhelyről.",
      "DRIVE_DOWNLOAD_NOT_AVAILABLE",
      409,
    );
  }
  if (!trustedDropArchive) {
    await requireDriveCleanSecurityScan({
      projectId: input.projectId,
      documentId: input.documentId,
      versionId: record.version.id,
    });
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

async function resolveDrivePreviewRecord(input: {
  projectId: string;
  documentId: string;
  versionId?: string | null;
  access: ProjectAccessContext;
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
    access: input.access,
  });
  if (!record) throw new DriveCoreRepositoryError("A dokumentumverzió nem található.", "DRIVE_PREVIEW_NOT_FOUND", 404);
  const trustedDropArchive = record.documentSource === "DROP"
    && record.version.status === "AVAILABLE"
    && record.version.storageProvider === "S3"
    && Boolean(record.version.storageKey);
  if (!status.objectDownloadEnabled && !trustedDropArchive) {
    throw new DriveCoreRepositoryError(status.warning, "DRIVE_OBJECT_PREVIEW_DISABLED", 503);
  }
  const previewableStatus = record.version.status === "AVAILABLE" || record.version.status === "QUARANTINED";
  if (!previewableStatus || record.version.storageProvider !== "S3" || !record.version.storageKey) {
    throw new DriveCoreRepositoryError(
      "Ez a dokumentumverzió még nem jeleníthető meg a privát DRIVE tárhelyről.",
      "DRIVE_PREVIEW_NOT_AVAILABLE",
      409,
    );
  }
  if (record.version.status === "QUARANTINED" || !trustedDropArchive) {
    await requireDriveCleanSecurityScan({
      projectId: input.projectId,
      documentId: input.documentId,
      versionId: record.version.id,
    });
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
  return { config, record, kind, trustedDropArchive };
}

export async function initDriveObjectPreview(input: {
  projectId: string;
  documentId: string;
  versionId?: string | null;
  access: ProjectAccessContext;
}) {
  const resolved = await resolveDrivePreviewRecord(input);
  const versionId = resolved.record.version.id;
  const url = `/api/projects/${encodeURIComponent(input.projectId)}/drive/documents/${encodeURIComponent(input.documentId)}/preview/content?versionId=${encodeURIComponent(versionId)}`;
  return {
    ok: true as const,
    preview: {
      documentId: input.documentId,
      versionId,
      versionNumber: resolved.record.version.versionNumber,
      fileName: resolved.record.version.originalName || resolved.record.documentName,
      mimeType: resolved.record.version.mimeType,
      sizeBytes: resolved.record.version.sizeBytes,
      kind: resolved.kind,
      method: "GET" as const,
      url,
      expiresAt: new Date(Date.now() + resolved.config.signedUrlTtlSeconds * 1000).toISOString(),
      source: resolved.record.documentSource,
      trustedDropArchive: resolved.trustedDropArchive,
      transport: "same-origin-proxy" as const,
    },
  };
}

export async function openDriveObjectPreviewContent(input: {
  projectId: string;
  documentId: string;
  versionId?: string | null;
  range?: string | null;
  access: ProjectAccessContext;
}) {
  const resolved = await resolveDrivePreviewRecord(input);
  const object = await getDriveObjectStream({
    storageKey: resolved.record.version.storageKey!,
    bucket: resolved.record.version.storageBucket,
    range: input.range,
  });
  return {
    ok: true as const,
    kind: resolved.kind,
    fileName: resolved.record.version.originalName || resolved.record.documentName,
    mimeType: resolved.record.version.mimeType,
    object,
  };
}
