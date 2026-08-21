import {
  ensureProjectContentRef,
  findContentObjectByHash,
  getContentCoreReadiness,
  upsertContentObject,
} from "@/app/lib/content-core/repository";
import { getDriveObjectStorageConfig, getDriveObjectStorageSafeStatus } from "@/app/lib/drive-core/storageConfig";
import { headDriveObject } from "@/app/lib/drive-core/s3ObjectStorage";
import { copyDropObjectToDriveVerified } from "@/app/lib/drop/archive/dropDriveObjectCopy";
import { findDropFileById } from "@/app/lib/drop/dropRepository";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import { getConfiguredProjectCoreProvider } from "@/app/lib/project-core/repository";
import { getProjectAccess } from "@/app/lib/project-core/store";
import {
  getFieldCaptureDropUploadBinding,
  getFieldCaptureItemUploadContext,
  getFieldCaptureProjectDriveDestination,
  markFieldCaptureProjectDriveContentStored,
  type FieldCaptureServerSession,
} from "./serverRepository";

const SHA256_RE = /^[a-f0-9]{64}$/i;
const WRITABLE_PROJECT_STATUSES = new Set(["DRAFT", "ACTIVE", "CLOSING"]);

function buildProjectDriveContentKey(sha256: string, sizeBytes: number) {
  const hash = sha256.toLowerCase();
  return `content/sha256/${hash.slice(0, 2)}/${hash}-${sizeBytes}`;
}

export async function getFieldCaptureProjectDriveContentReadiness() {
  const [content, config] = await Promise.all([
    getContentCoreReadiness(),
    Promise.resolve(getDriveObjectStorageConfig()),
  ]);
  const storage = getDriveObjectStorageSafeStatus(config);
  const projectCoreProvider = getConfiguredProjectCoreProvider();
  const canonicalProjectCore = projectCoreProvider === "supabase";
  return {
    ready: content.ready && storage.objectWriteEnabled && storage.objectDownloadEnabled && canonicalProjectCore,
    contentCoreReady: content.ready,
    canonicalProjectCore,
    projectCoreProvider,
    storageReady: storage.storageConfigured,
    storageMode: storage.mode,
    projectContentWriteEnabled: storage.objectWriteEnabled && storage.objectDownloadEnabled,
    bucketConfigured: storage.bucketConfigured,
    ownership: "PROJECT" as const,
    scope: "PROJECT_ROOT" as const,
    independentRetention: true,
    requiresCleanDropObject: true,
    requiresProjectMembership: true,
    requiresDocumentWrite: true,
    projectDriveTreeBound: false,
    uiEnabled: false,
    stage: "P9.1" as const,
  };
}

export async function requireFieldCaptureProjectDriveWriteAccess(input: {
  session: FieldCaptureServerSession;
  userId: string;
  userEmail: string;
}) {
  if (!input.session.projectId) {
    throw new DimproIdentityError(
      "A Projektkapu Drive mentéshez a terepi munkamenetet projekthez kell kapcsolni.",
      "FIELD_CAPTURE_PROJECT_DRIVE_PROJECT_REQUIRED",
      409,
    );
  }
  const access = await getProjectAccess(input.session.projectId, [input.userId, input.userEmail]);
  if (!access) {
    throw new DimproIdentityError(
      "A felhasználónak nincs aktív Project Core tagsága ehhez a projekthez.",
      "FIELD_CAPTURE_PROJECT_DRIVE_MEMBERSHIP_REQUIRED",
      403,
    );
  }
  if (!access.permissions.includes("document.write")) {
    throw new DimproIdentityError(
      "A projekttagság nem jogosít dokumentum írására a Projektkapu Drive-ban.",
      "FIELD_CAPTURE_PROJECT_DRIVE_WRITE_DENIED",
      403,
    );
  }
  if (!WRITABLE_PROJECT_STATUSES.has(access.project.status)) {
    throw new DimproIdentityError(
      "A projekt aktuális életciklus-állapotában nem írható új Projektkapu Drive tartalom.",
      "FIELD_CAPTURE_PROJECT_DRIVE_PROJECT_NOT_WRITABLE",
      409,
    );
  }
  return access;
}

export async function storeFieldCaptureItemInProjectContent(input: {
  session: FieldCaptureServerSession;
  itemId: string;
  userId: string;
  userEmail: string;
}) {
  const readiness = await getFieldCaptureProjectDriveContentReadiness();
  if (!readiness.ready) {
    throw new DimproIdentityError(
      "A Projektkapu Drive PROJECT content binding szerveres alapja jelenleg nem kész.",
      "FIELD_CAPTURE_PROJECT_DRIVE_CONTENT_NOT_READY",
      503,
    );
  }
  const access = await requireFieldCaptureProjectDriveWriteAccess(input);
  const projectId = access.project.id;

  const [context, destination] = await Promise.all([
    getFieldCaptureItemUploadContext({ sessionId: input.session.id, itemId: input.itemId }),
    getFieldCaptureProjectDriveDestination({ itemId: input.itemId }),
  ]);
  if (context.itemStatus !== "SERVER_STORED" || context.asset.storageStatus !== "STORED") {
    throw new DimproIdentityError(
      "A képet előbb a DIMPRO szerveres tárhelyére kell menteni.",
      "FIELD_CAPTURE_PROJECT_DRIVE_SERVER_STORAGE_REQUIRED",
      409,
    );
  }
  if (destination.folderId) {
    throw new DimproIdentityError(
      "A P9.1 csak PROJECT_ROOT Content Core bindinget enged; a Drive mappafa P9.2 feladat.",
      "FIELD_CAPTURE_PROJECT_DRIVE_TREE_NOT_READY",
      409,
    );
  }

  const binding = await getFieldCaptureDropUploadBinding({
    sessionId: input.session.id,
    itemId: context.itemId,
    clientItemId: context.clientItemId,
  });
  const dropFileId = String(binding.payload.dropFileId || "");
  const dropPackageId = String(binding.payload.dropPackageId || "");
  if (!dropFileId || !dropPackageId) {
    throw new DimproIdentityError(
      "A Projektkapu Drive mentéshez hiányzik a Drop fájlkapcsolat.",
      "FIELD_CAPTURE_PROJECT_DRIVE_DROP_BINDING_MISSING",
      409,
    );
  }
  const dropFile = await findDropFileById(dropFileId);
  if (!dropFile || dropFile.package_id !== dropPackageId || dropFile.deleted_at) {
    throw new DimproIdentityError(
      "A Projektkapu Drive forrásfájl nem található vagy már törölt.",
      "FIELD_CAPTURE_PROJECT_DRIVE_DROP_FILE_MISSING",
      409,
    );
  }
  if (
    dropFile.upload_status !== "ready"
    || dropFile.processing_status !== "ready"
    || dropFile.security_status !== "clean"
    || dropFile.virus_scan_status !== "clean"
  ) {
    throw new DimproIdentityError(
      "A Projektkapu Drive mentés a vírus- és biztonsági ellenőrzés befejezésére vár.",
      "FIELD_CAPTURE_PROJECT_DRIVE_SCAN_PENDING",
      409,
    );
  }
  if (dropFile.storage_provider !== "s3-compatible" || !dropFile.storage_bucket || !dropFile.storage_key) {
    throw new DimproIdentityError(
      "A Projektkapu Drive forrásfájl nem S3-kompatibilis Drop tárhelyen található.",
      "FIELD_CAPTURE_PROJECT_DRIVE_SOURCE_STORAGE_INVALID",
      409,
    );
  }
  const sha256 = String(dropFile.sha256 || "").toLowerCase();
  const sizeBytes = Number(dropFile.size_stored_bytes || dropFile.size_original_bytes || 0);
  if (!SHA256_RE.test(sha256) || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new DimproIdentityError(
      "A Projektkapu Drive forrásfájl ellenőrzött SHA-256 vagy méret adata hiányzik.",
      "FIELD_CAPTURE_PROJECT_DRIVE_SOURCE_INTEGRITY_MISSING",
      409,
    );
  }

  const driveConfig = getDriveObjectStorageConfig();
  let contentObject = await findContentObjectByHash({ sha256, sizeBytes });
  let copied = false;
  if (contentObject) {
    if (contentObject.storage_bucket !== driveConfig.bucket) {
      throw new DimproIdentityError(
        "A Content Core objektum másik Drive buckethez tartozik.",
        "CONTENT_CORE_DRIVE_BUCKET_MISMATCH",
        409,
      );
    }
    const head = await headDriveObject({
      storageKey: contentObject.storage_key,
      bucket: contentObject.storage_bucket,
    }).catch(() => null);
    if (!head || head.contentLength !== sizeBytes) {
      await copyDropObjectToDriveVerified({
        sourceBucket: dropFile.storage_bucket,
        sourceStorageKey: dropFile.storage_key,
        driveStorageKey: contentObject.storage_key,
        expectedDriveBucket: driveConfig.bucket,
        mimeType: dropFile.detected_mime_type || dropFile.mime_type || "application/octet-stream",
        sizeBytes,
        expectedSha256: sha256,
        metadata: {
          "dimpro-content-sha256": sha256,
          "dimpro-source": "field-capture-project",
          "dimpro-project-id": projectId,
        },
      });
      copied = true;
    }
  } else {
    const storageKey = buildProjectDriveContentKey(sha256, sizeBytes);
    await copyDropObjectToDriveVerified({
      sourceBucket: dropFile.storage_bucket,
      sourceStorageKey: dropFile.storage_key,
      driveStorageKey: storageKey,
      expectedDriveBucket: driveConfig.bucket,
      mimeType: dropFile.detected_mime_type || dropFile.mime_type || "application/octet-stream",
      sizeBytes,
      expectedSha256: sha256,
      metadata: {
        "dimpro-content-sha256": sha256,
        "dimpro-source": "field-capture-project",
        "field-capture-item-id": context.itemId,
        "dimpro-project-id": projectId,
      },
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
  const projectRef = await ensureProjectContentRef({
    contentObjectId: contentObject.id,
    projectId,
    folderId: null,
    actorUserId: input.userId,
    sourceSystem: "FIELD_CAPTURE",
    sourceRef,
    displayName: dropFile.display_name,
  });

  await markFieldCaptureProjectDriveContentStored({
    sessionId: input.session.id,
    itemId: context.itemId,
    clientItemId: context.clientItemId,
    assetId: context.asset.id,
    projectId,
    contentObjectId: contentObject.id,
    contentRefId: projectRef.id,
    driveBucket: contentObject.storage_bucket,
    driveStorageKey: contentObject.storage_key,
    sha256,
    sizeBytes,
  });

  return {
    stored: true,
    projectContentBound: true,
    projectDriveTreeBound: false,
    copied,
    ownership: "PROJECT" as const,
    scope: "PROJECT_ROOT" as const,
    retainedIndependently: true,
    projectId,
    projectRole: access.membership.role,
    contentObjectId: contentObject.id,
    contentRefId: projectRef.id,
    sha256,
    sizeBytes,
  };
}
