import { randomUUID } from "node:crypto";
import { buildDriveStorageKey, calculateDriveObjectSha256, deleteDriveObject, headDriveObject } from "@/app/lib/drive-core/s3ObjectStorage";
import { getDriveObjectStorageConfig, getDriveObjectStorageSafeStatus } from "@/app/lib/drive-core/storageConfig";
import {
  abortDriveUploadSessionRecord,
  createDriveUploadSessionRecord,
  finalizeDriveUploadSessionRecord,
  findDriveUploadSessionByIncomingKey,
  getDriveDropIncomingSourceDatabaseHealth,
} from "@/app/lib/drive-core/storageRepository";
import { provisionProjectDrive } from "@/app/lib/drive-core/projectProvisioning";
import {
  getDriveDocumentFlowHealth,
  getDriveDocumentGovernance,
  recordDriveStorageVersionReference,
  registerDriveIncomingDocument,
} from "@/app/lib/drive-core/documentFlowRepository";
import type { DriveUploadSession } from "@/app/lib/drive-core/types";
import { copyDropObjectToDriveVerified } from "./dropDriveObjectCopy";
import { loadDropFinalReportBundle } from "../report/dropReportRepository";
import { getDropPackageWorkflow } from "../public/dropPublicRepository";
import type { DropFileRecord } from "../dropTypes";

const ACTOR = "drop-drive-incoming-worker";

export class DropDriveIncomingError extends Error {
  code: string;
  status: number;
  retryable: boolean;
  constructor(message: string, code: string, status = 500, retryable = true) {
    super(message);
    this.name = "DropDriveIncomingError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function isIncomingFile(file: DropFileRecord) {
  return Boolean(
    !file.deleted_at
      && file.upload_status === "ready"
      && file.processing_status === "ready"
      && file.security_status === "clean"
      && file.virus_scan_status === "clean"
      && file.storage_provider === "s3-compatible"
      && file.storage_bucket
      && file.storage_key
      && Number(file.size_stored_bytes || file.size_original_bytes || 0) > 0,
  );
}

function cleanDocumentName(file: DropFileRecord) {
  return (file.display_name || file.original_name || `drop-${file.id}`)
    .normalize("NFKC")
    .replace(/[\\/\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220) || `drop-${file.id}`;
}

async function ensureGovernance(input: {
  projectId: string;
  documentId: string;
  versionId: string;
  packageId: string;
  fileId: string;
}) {
  const existing = await getDriveDocumentGovernance({
    projectId: input.projectId,
    documentId: input.documentId,
    versionId: input.versionId,
  });
  if (existing?.sourceChannel === "DROP" && existing.dropPackageId === input.packageId && existing.dropFileId === input.fileId) {
    return { governance: existing, idempotent: true };
  }
  const governance = await registerDriveIncomingDocument({
    projectId: input.projectId,
    documentId: input.documentId,
    versionId: input.versionId,
    sourceChannel: "DROP",
    dropPackageId: input.packageId,
    dropFileId: input.fileId,
    actorUserId: ACTOR,
  });
  return { governance, idempotent: false };
}

async function importFile(input: {
  projectId: string;
  folderId: string;
  packageId: string;
  file: DropFileRecord;
}) {
  const incomingKey = `drop-incoming:${input.packageId}:file:${input.file.id}`;
  const existing = await findDriveUploadSessionByIncomingKey({ projectId: input.projectId, incomingKey });
  if (existing?.status === "FINALIZED" && existing.finalizedDocumentId && existing.finalizedVersionId) {
    const governance = await ensureGovernance({
      projectId: input.projectId,
      documentId: existing.finalizedDocumentId,
      versionId: existing.finalizedVersionId,
      packageId: input.packageId,
      fileId: input.file.id,
    });
    return { session: existing, governance: governance.governance, idempotent: true, restored: false };
  }

  const config = getDriveObjectStorageConfig();
  const now = new Date();
  let session = existing;
  if (session?.status === "INITIATED" && new Date(session.expiresAt).getTime() <= now.getTime()) {
    await abortDriveUploadSessionRecord({
      projectId: input.projectId,
      uploadId: session.id,
      actorUserId: ACTOR,
      reason: "Lejárt DROP → DRIVE beérkező munkamenet újraindítása.",
    }).catch(() => undefined);
    session = null;
  }
  if (!session) {
    const id = `drive-upload-incoming-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const storageKey = buildDriveStorageKey({
      projectId: input.projectId,
      uploadId: id,
      fileName: input.file.original_name || input.file.display_name,
    });
    const record: DriveUploadSession = {
      id,
      projectId: input.projectId,
      folderId: input.folderId,
      documentId: null,
      uploadKind: "NEW_DOCUMENT",
      documentName: cleanDocumentName(input.file),
      originalName: input.file.original_name || input.file.display_name,
      mimeType: input.file.detected_mime_type || input.file.mime_type || "application/octet-stream",
      sizeBytes: Number(input.file.size_stored_bytes || input.file.size_original_bytes || 0),
      sha256: input.file.sha256,
      expectedCurrentVersion: 0,
      source: "DROP",
      clientId: "drop-drive-incoming",
      storageProvider: "S3",
      storageBucket: config.bucket,
      storageKey,
      finalVersionStatus: "QUARANTINED",
      status: "INITIATED",
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      finalizedDocumentId: null,
      finalizedVersionId: null,
      createdBy: ACTOR,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      completedAt: null,
      metadata: {
        description: `DIMPRO Drop beküldés · ${input.file.uploaded_by_name || input.file.uploaded_by_email || "ismeretlen feltöltő"}`,
        revisionCode: "DROP-IN",
        changeNote: `Beérkező fájl a ${input.packageId} Drop csomagból.`,
        dropIncomingKey: incomingKey,
        dropPackageId: input.packageId,
        dropFileId: input.file.id,
        sourceStorageKey: input.file.storage_key,
        sourceSha256: input.file.sha256,
        documentFlowVersion: "0.1.0",
      },
    };
    session = await createDriveUploadSessionRecord(record, ACTOR);
  }

  let finalized = false;
  try {
    let object = await headDriveObject({ storageKey: session.storageKey, bucket: session.storageBucket }).catch(() => null);
    const expectedSize = Number(input.file.size_stored_bytes || input.file.size_original_bytes || 0);
    if (!object || object.contentLength !== expectedSize) {
      if (object) await deleteDriveObject({ storageKey: session.storageKey, bucket: session.storageBucket }).catch(() => undefined);
      object = await copyDropObjectToDriveVerified({
        sourceBucket: input.file.storage_bucket,
        sourceStorageKey: input.file.storage_key,
        driveStorageKey: session.storageKey,
        expectedDriveBucket: session.storageBucket,
        mimeType: input.file.detected_mime_type || input.file.mime_type || "application/octet-stream",
        sizeBytes: expectedSize,
        expectedSha256: input.file.sha256,
        metadata: {
          "dimpro-source": "drop-incoming",
          "drop-package-id": input.packageId,
          "drop-file-id": input.file.id,
        },
      });
    }

    const checksum = await calculateDriveObjectSha256({
      storageKey: session.storageKey,
      bucket: session.storageBucket,
    });
    const result = await finalizeDriveUploadSessionRecord({
      projectId: input.projectId,
      uploadId: session.id,
      receivedSizeBytes: object.contentLength,
      storageEtag: object.etag,
      verifiedSha256: checksum.sha256,
      actorUserId: ACTOR,
    });
    finalized = true;
    const documentId = result.session.finalizedDocumentId || String((result.document as { id?: unknown }).id || "");
    const versionId = result.session.finalizedVersionId || String((result.version as { id?: unknown }).id || "");
    if (!documentId || !versionId) throw new DropDriveIncomingError("A DRIVE beérkező dokumentumazonosító hiányzik.", "DROP_DRIVE_INCOMING_FINALIZED_ID_MISSING", 500);

    await recordDriveStorageVersionReference({
      projectId: input.projectId,
      uploadId: result.session.id,
      versionId,
      storageVersionId: object.versionId || null,
    });

    const governance = await ensureGovernance({
      projectId: input.projectId,
      documentId,
      versionId,
      packageId: input.packageId,
      fileId: input.file.id,
    });
    return { session: result.session, governance: governance.governance, idempotent: false, restored: false };
  } catch (error) {
    if (!finalized) {
      await deleteDriveObject({ storageKey: session.storageKey, bucket: session.storageBucket }).catch(() => undefined);
      await abortDriveUploadSessionRecord({
        projectId: input.projectId,
        uploadId: session.id,
        actorUserId: ACTOR,
        reason: error instanceof Error ? error.message.slice(0, 1000) : "DROP → DRIVE beérkező import hiba.",
      }).catch(() => undefined);
    }
    throw error;
  }
}

export async function processDropDriveIncomingPackage(packageId: string) {
  const [bundle, workflow] = await Promise.all([
    loadDropFinalReportBundle(packageId),
    getDropPackageWorkflow(packageId),
  ]);
  if (!workflow || workflow.workflowType !== "submission_gate") {
    return { ok: true as const, packageId, required: false, status: "not-submission-gate", imported: 0, idempotent: true };
  }
  const projectId = bundle.packageRow.project_id || workflow.projectId || null;
  if (!projectId) {
    return { ok: true as const, packageId, required: false, status: "no-project", imported: 0, idempotent: true };
  }
  if (!workflow.finalizedAt) {
    throw new DropDriveIncomingError("A Beküldőkapu csomag még nincs véglegesítve.", "DROP_DRIVE_INCOMING_NOT_FINALIZED", 409, true);
  }
  const files = bundle.files.filter(isIncomingFile);
  if (files.length !== bundle.files.filter((file) => !file.deleted_at).length || files.length === 0) {
    throw new DropDriveIncomingError("A Beküldőkapu fájljai még nem állnak biztonságosan importálható állapotban.", "DROP_DRIVE_INCOMING_FILES_NOT_READY", 425, true);
  }

  const [flowHealth, sourceSchema, storage] = await Promise.all([
    getDriveDocumentFlowHealth(),
    getDriveDropIncomingSourceDatabaseHealth(),
    Promise.resolve(getDriveObjectStorageSafeStatus()),
  ]);
  if (!flowHealth.ready) {
    throw new DropDriveIncomingError("A DRIVE Document Flow adatbázisséma még nincs alkalmazva.", "DROP_DRIVE_INCOMING_SCHEMA_NOT_READY", 503, false);
  }
  if (!sourceSchema.ready) {
    throw new DropDriveIncomingError("A DRIVE DROP-forrású feltöltési séma még nincs alkalmazva.", "DROP_DRIVE_INCOMING_SOURCE_SCHEMA_NOT_READY", 503, false);
  }
  if (!storage.storageConfigured || !storage.objectWriteEnabled) {
    throw new DropDriveIncomingError("A DRIVE Object Storage írási kapcsolata nem áll készen.", "DROP_DRIVE_INCOMING_STORAGE_NOT_READY", 503, true);
  }

  const provisioning = await provisionProjectDrive(projectId, ACTOR);
  if (!provisioning.incomingDropFolder) {
    throw new DropDriveIncomingError("A projekt Beérkező Drop mappája nem hozható létre.", "DROP_DRIVE_INCOMING_FOLDER_NOT_READY", 503, true);
  }

  const results = [];
  for (const file of files) {
    results.push(await importFile({
      projectId,
      folderId: provisioning.incomingDropFolder.id,
      packageId,
      file,
    }));
  }

  return {
    ok: true as const,
    packageId,
    required: true,
    status: "completed",
    projectId,
    folderId: provisioning.incomingDropFolder.id,
    imported: results.length,
    idempotent: results.every((item) => item.idempotent),
    results: results.map((item) => ({
      uploadId: item.session.id,
      documentId: item.session.finalizedDocumentId,
      versionId: item.session.finalizedVersionId,
      businessStatus: item.governance.businessStatus,
      reviewDecision: item.governance.reviewDecision,
      idempotent: item.idempotent,
    })),
  };
}
