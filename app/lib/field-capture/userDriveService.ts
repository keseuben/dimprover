import { getContentCoreReadiness, findContentObjectByHash, ensureUserContentRef, upsertContentObject } from "@/app/lib/content-core/repository";
import { getDriveObjectStorageConfig, getDriveObjectStorageSafeStatus } from "@/app/lib/drive-core/storageConfig";
import { headDriveObject } from "@/app/lib/drive-core/s3ObjectStorage";
import { copyDropObjectToDriveVerified } from "@/app/lib/drop/archive/dropDriveObjectCopy";
import { findDropFileById } from "@/app/lib/drop/dropRepository";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import {
  getFieldCaptureDropUploadBinding,
  getFieldCaptureItemUploadContext,
  getFieldCaptureUserDriveDestination,
  markFieldCaptureUserDriveStored,
  type FieldCaptureServerSession,
} from "./serverRepository";

const SHA256_RE = /^[a-f0-9]{64}$/i;

function buildUserDriveContentKey(sha256: string, sizeBytes: number) {
  const hash = sha256.toLowerCase();
  return `content/sha256/${hash.slice(0, 2)}/${hash}-${sizeBytes}`;
}

export async function getFieldCaptureUserDriveReadiness() {
  const [content, config] = await Promise.all([
    getContentCoreReadiness(),
    Promise.resolve(getDriveObjectStorageConfig()),
  ]);
  const storage = getDriveObjectStorageSafeStatus(config);
  return {
    ready: content.ready && storage.objectWriteEnabled && storage.objectDownloadEnabled,
    contentCoreReady: content.ready,
    storageReady: storage.storageConfigured,
    storageMode: storage.mode,
    userDriveWriteEnabled: storage.objectWriteEnabled && storage.objectDownloadEnabled,
    bucketConfigured: storage.bucketConfigured,
    ownership: "USER" as const,
    scope: "USER_ROOT" as const,
    independentRetention: true,
    requiresCleanDropObject: true,
  };
}

export async function storeFieldCaptureItemInUserDrive(input: {
  session: FieldCaptureServerSession;
  itemId: string;
  userId: string;
}) {
  const readiness = await getFieldCaptureUserDriveReadiness();
  if (!readiness.ready) {
    throw new DimproIdentityError("A Saját DIMPRO Drive szerveres mentése jelenleg nem kész.", "FIELD_CAPTURE_USER_DRIVE_NOT_READY", 503);
  }

  const [context, destination] = await Promise.all([
    getFieldCaptureItemUploadContext({ sessionId: input.session.id, itemId: input.itemId }),
    getFieldCaptureUserDriveDestination({ itemId: input.itemId }),
  ]);
  if (context.itemStatus !== "SERVER_STORED" || context.asset.storageStatus !== "STORED") {
    throw new DimproIdentityError("A képet előbb a DIMPRO szerveres tárhelyére kell menteni.", "FIELD_CAPTURE_USER_DRIVE_SERVER_STORAGE_REQUIRED", 409);
  }
  if (destination.folderId) {
    throw new DimproIdentityError("A személyes Drive mappakezelés még nincs aktiválva; P8 csak a Saját Drive gyökerét használja.", "FIELD_CAPTURE_USER_DRIVE_FOLDER_NOT_READY", 409);
  }

  const binding = await getFieldCaptureDropUploadBinding({
    sessionId: input.session.id,
    itemId: context.itemId,
    clientItemId: context.clientItemId,
  });
  const dropFileId = String(binding.payload.dropFileId || "");
  const dropPackageId = String(binding.payload.dropPackageId || "");
  if (!dropFileId || !dropPackageId) {
    throw new DimproIdentityError("A Saját Drive mentéshez hiányzik a Drop fájlkapcsolat.", "FIELD_CAPTURE_USER_DRIVE_DROP_BINDING_MISSING", 409);
  }
  const dropFile = await findDropFileById(dropFileId);
  if (!dropFile || dropFile.package_id !== dropPackageId || dropFile.deleted_at) {
    throw new DimproIdentityError("A Saját Drive forrásfájl nem található vagy már törölt.", "FIELD_CAPTURE_USER_DRIVE_DROP_FILE_MISSING", 409);
  }
  if (
    dropFile.upload_status !== "ready"
    || dropFile.processing_status !== "ready"
    || dropFile.security_status !== "clean"
    || dropFile.virus_scan_status !== "clean"
  ) {
    throw new DimproIdentityError("A Saját Drive mentés a vírus- és biztonsági ellenőrzés befejezésére vár.", "FIELD_CAPTURE_USER_DRIVE_SCAN_PENDING", 409);
  }
  if (dropFile.storage_provider !== "s3-compatible" || !dropFile.storage_bucket || !dropFile.storage_key) {
    throw new DimproIdentityError("A Saját Drive forrásfájl nem S3-kompatibilis Drop tárhelyen található.", "FIELD_CAPTURE_USER_DRIVE_SOURCE_STORAGE_INVALID", 409);
  }
  const sha256 = String(dropFile.sha256 || "").toLowerCase();
  const sizeBytes = Number(dropFile.size_stored_bytes || dropFile.size_original_bytes || 0);
  if (!SHA256_RE.test(sha256) || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new DimproIdentityError("A Saját Drive forrásfájl ellenőrzött SHA-256 vagy méret adata hiányzik.", "FIELD_CAPTURE_USER_DRIVE_SOURCE_INTEGRITY_MISSING", 409);
  }

  const driveConfig = getDriveObjectStorageConfig();
  let contentObject = await findContentObjectByHash({ sha256, sizeBytes });
  let copied = false;
  if (contentObject) {
    if (contentObject.storage_bucket !== driveConfig.bucket) {
      throw new DimproIdentityError("A Content Core objektum másik Drive buckethez tartozik.", "CONTENT_CORE_DRIVE_BUCKET_MISMATCH", 409);
    }
    const head = await headDriveObject({ storageKey: contentObject.storage_key, bucket: contentObject.storage_bucket }).catch(() => null);
    if (!head || head.contentLength !== sizeBytes) {
      await copyDropObjectToDriveVerified({
        sourceBucket: dropFile.storage_bucket,
        sourceStorageKey: dropFile.storage_key,
        driveStorageKey: contentObject.storage_key,
        expectedDriveBucket: driveConfig.bucket,
        mimeType: dropFile.detected_mime_type || dropFile.mime_type || "application/octet-stream",
        sizeBytes,
        expectedSha256: sha256,
        metadata: { "dimpro-content-sha256": sha256, "dimpro-source": "field-capture" },
      });
      copied = true;
    }
  } else {
    const storageKey = buildUserDriveContentKey(sha256, sizeBytes);
    await copyDropObjectToDriveVerified({
      sourceBucket: dropFile.storage_bucket,
      sourceStorageKey: dropFile.storage_key,
      driveStorageKey: storageKey,
      expectedDriveBucket: driveConfig.bucket,
      mimeType: dropFile.detected_mime_type || dropFile.mime_type || "application/octet-stream",
      sizeBytes,
      expectedSha256: sha256,
      metadata: { "dimpro-content-sha256": sha256, "dimpro-source": "field-capture", "field-capture-item-id": context.itemId },
    });
    copied = true;
    contentObject = await upsertContentObject({
      sha256,
      sizeBytes,
      mimeType: dropFile.detected_mime_type || dropFile.mime_type || "application/octet-stream",
      originalName: dropFile.original_name || null,
      displayName: dropFile.display_name,
      storageBucket: driveConfig.bucket,
      storageKey,
      sourceSystem: "FIELD_CAPTURE",
      sourceObjectId: context.itemId,
    });
  }

  const sourceRef = `field-capture:${input.session.id}:${context.itemId}:${context.asset.variant}`;
  const existingRef = await ensureUserContentRef({
    contentObjectId: contentObject.id,
    userId: input.userId,
    sourceSystem: "FIELD_CAPTURE",
    sourceRef,
    displayName: dropFile.display_name,
  });

  await markFieldCaptureUserDriveStored({
    sessionId: input.session.id,
    itemId: context.itemId,
    clientItemId: context.clientItemId,
    assetId: context.asset.id,
    contentObjectId: contentObject.id,
    contentRefId: existingRef.id,
    driveBucket: contentObject.storage_bucket,
    driveStorageKey: contentObject.storage_key,
    sha256,
    sizeBytes,
  });

  return {
    stored: true,
    driveSynced: true,
    copied,
    ownership: "USER" as const,
    scope: "USER_ROOT" as const,
    retainedIndependently: true,
    contentObjectId: contentObject.id,
    contentRefId: existingRef.id,
    sha256,
    sizeBytes,
  };
}
