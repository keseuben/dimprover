import { randomUUID } from "node:crypto";
import { createDriveFolder, listDriveTree } from "@/app/lib/drive-core/databaseRepository";
import {
  buildDriveStorageKey,
  calculateDriveObjectSha256,
  deleteDriveObject,
  headDriveObject,
  putDriveObjectStream,
} from "@/app/lib/drive-core/s3ObjectStorage";
import { getDriveObjectStorageConfig, getDriveObjectStorageSafeStatus } from "@/app/lib/drive-core/storageConfig";
import {
  abortDriveUploadSessionRecord,
  createDriveUploadSessionRecord,
  finalizeDriveUploadSessionRecord,
  findDriveUploadSessionByArchiveKey,
  markDriveDocumentAsDropArchive,
} from "@/app/lib/drive-core/storageRepository";
import type { DriveUploadSession } from "@/app/lib/drive-core/types";
import { getDropFeatureFlags } from "../dropFeatureFlags";
import { getDropSupabaseClient } from "../dropRepository";
import {
  getLatestDropFinalReport,
  isDropReportFresh,
  loadDropFinalReportBundle,
  type DropFinalReportBundle,
  type DropReportRecord,
} from "../report/dropReportRepository";
import { headDropS3Object, openDropS3Object } from "../storage/dropS3Storage";
import { getDropStorageConfig } from "../storage/dropStorageConfig";
import type { DropFileRecord } from "../dropTypes";
import { getDropPackageWorkflow } from "../public/dropPublicRepository";
import type { DropPackageWorkflowRecord } from "../public/dropPublicTypes";

const ARCHIVE_ACTOR = "drop-drive-archive-worker";
const ROOT_ARCHIVE_FOLDER = "DIMPRO Drop archívum";

export class DropDriveArchiveError extends Error {
  code: string;
  status: number;
  retryable: boolean;

  constructor(message: string, code: string, status = 500, retryable = true) {
    super(message);
    this.name = "DropDriveArchiveError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

type DropDriveProjectLink = {
  id: string;
  space_id: string;
  project_id: string;
  project_name_snapshot: string;
  archive_to_drive: boolean;
  drive_target_folder_id: string | null;
};

type ArchiveSource = {
  archiveKey: string;
  sourceType: "file" | "report";
  sourceId: string;
  sourceBucket: string;
  sourceStorageKey: string;
  documentName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  description: string;
};

type ArchiveContext = {
  bundle: DropFinalReportBundle;
  report: DropReportRecord | null;
  link: DropDriveProjectLink | null;
  required: boolean;
  workflow: DropPackageWorkflowRecord | null;
};

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : "Ismeretlen DROP → DRIVE archiválási hiba.").slice(0, 2000);
}

function cleanName(value: string, fallback: string, max = 120) {
  const result = value
    .normalize("NFKC")
    .replace(/[\\/\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (result || fallback).slice(0, max);
}

function uniqueDocumentName(name: string, used: Set<string>, fallbackId: string) {
  const normalized = cleanName(name, `drop-${fallbackId}`, 220);
  const key = normalized.toLocaleLowerCase("hu-HU");
  if (!used.has(key)) {
    used.add(key);
    return normalized;
  }
  const dot = normalized.lastIndexOf(".");
  const suffix = fallbackId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || randomUUID().slice(0, 8);
  const candidate = dot > 0
    ? `${normalized.slice(0, dot).slice(0, 205)}__${suffix}${normalized.slice(dot)}`
    : `${normalized.slice(0, 210)}__${suffix}`;
  used.add(candidate.toLocaleLowerCase("hu-HU"));
  return candidate;
}

function isArchivableFile(file: DropFileRecord) {
  return Boolean(
    !file.deleted_at
      && file.upload_status === "ready"
      && file.processing_status === "ready"
      && file.security_status === "clean"
      && file.virus_scan_status === "clean"
      && file.storage_provider === "s3-compatible"
      && file.storage_key,
  );
}

async function writeArchiveEvent(input: {
  packageId: string;
  fileId?: string | null;
  eventType: string;
  severity?: "info" | "warning" | "error" | "critical";
  payload?: Record<string, unknown>;
}) {
  const client = getDropSupabaseClient();
  const { error } = await client.from("drop_events").insert({
    package_id: input.packageId,
    file_id: input.fileId || null,
    event_type: input.eventType,
    severity: input.severity || "info",
    actor_name: "DIMPRO Drop → Drive archiváló",
    payload: input.payload || {},
  });
  if (error) {
    throw new DropDriveArchiveError("A DROP → DRIVE archiválási audit nem menthető.", error.code || "DROP_DRIVE_ARCHIVE_EVENT_FAILED");
  }
}

async function loadArchiveContext(packageId: string): Promise<ArchiveContext> {
  const [bundle, report, workflow] = await Promise.all([loadDropFinalReportBundle(packageId), getLatestDropFinalReport(packageId), getDropPackageWorkflow(packageId)]);
  const packageRow = bundle.packageRow;
  if (!packageRow.project_id || !packageRow.space_id) {
    return { bundle, report, link: null, required: false, workflow };
  }
  const client = getDropSupabaseClient();
  const { data, error } = await client
    .from("drop_space_projects")
    .select("id,space_id,project_id,project_name_snapshot,archive_to_drive,drive_target_folder_id")
    .eq("space_id", packageRow.space_id)
    .eq("project_id", packageRow.project_id)
    .maybeSingle();
  if (error) {
    throw new DropDriveArchiveError("A Drop tér projektarchiválási kapcsolata nem tölthető be.", error.code || "DROP_DRIVE_PROJECT_LINK_LOAD_FAILED");
  }
  const link = (data || null) as DropDriveProjectLink | null;
  return { bundle, report, link, required: Boolean(link?.archive_to_drive), workflow };
}

async function ensureFolder(input: { projectId: string; parentId: string | null; name: string; sortOrder?: number }) {
  const expectedName = cleanName(input.name, "Drop archívum");
  let tree = await listDriveTree(input.projectId);
  const existing = tree.folders.find((folder) => (
    folder.parentId === input.parentId
      && folder.name.toLocaleLowerCase("hu-HU") === expectedName.toLocaleLowerCase("hu-HU")
      && folder.status === "ACTIVE"
  ));
  if (existing) return existing;
  const created = await createDriveFolder(input.projectId, {
    name: expectedName,
    parentId: input.parentId,
    sortOrder: input.sortOrder ?? 900,
  }, ARCHIVE_ACTOR);
  if (created.ok) return created.folder;
  tree = await listDriveTree(input.projectId);
  const raced = tree.folders.find((folder) => (
    folder.parentId === input.parentId
      && folder.name.toLocaleLowerCase("hu-HU") === expectedName.toLocaleLowerCase("hu-HU")
      && folder.status === "ACTIVE"
  ));
  if (raced) return raced;
  throw new DropDriveArchiveError(created.error || "A DRIVE archívummappa nem hozható létre.", "DROP_DRIVE_ARCHIVE_FOLDER_CREATE_FAILED", 409, false);
}

async function resolveArchiveFolder(context: ArchiveContext) {
  const projectId = context.bundle.packageRow.project_id;
  if (!projectId || !context.link) {
    throw new DropDriveArchiveError("A csomaghoz nincs archiválható Projektkapu-kapcsolat.", "DROP_DRIVE_ARCHIVE_PROJECT_REQUIRED", 409, false);
  }
  const tree = await listDriveTree(projectId);
  let parentId = context.link.drive_target_folder_id;
  if (parentId) {
    const target = tree.folders.find((folder) => folder.id === parentId && folder.status === "ACTIVE");
    if (!target) {
      throw new DropDriveArchiveError("A beállított DRIVE célmappa nem található vagy archivált.", "DROP_DRIVE_TARGET_FOLDER_NOT_FOUND", 409, false);
    }
  } else {
    const root = await ensureFolder({ projectId, parentId: null, name: ROOT_ARCHIVE_FOLDER });
    parentId = root.id;
  }
  const packageFolder = await ensureFolder({
    projectId,
    parentId,
    name: `${context.bundle.packageRow.public_code} - ${context.bundle.packageRow.title}`,
  });
  return packageFolder;
}


async function resolveFileArchiveFolders(context: ArchiveContext, packageFolderId: string) {
  const projectId = context.bundle.packageRow.project_id;
  if (!projectId) throw new DropDriveArchiveError("A csoportmappákhoz hiányzik a projektazonosító.", "DROP_DRIVE_ARCHIVE_PROJECT_REQUIRED", 409, false);
  const folderByGroupKey = new Map<string, Awaited<ReturnType<typeof ensureFolder>>>();
  const groupById = new Map(context.bundle.groups.map((group) => [group.id, group]));
  if (context.workflow?.exportGroupsAsFolders !== true) {
    for (const file of context.bundle.files.filter(isArchivableFile)) folderByGroupKey.set(file.group_id || "__ungrouped__", { id: packageFolderId } as Awaited<ReturnType<typeof ensureFolder>>);
    return { folderByGroupKey, groupById };
  }
  for (const file of context.bundle.files.filter(isArchivableFile)) {
    const group = file.group_id ? groupById.get(file.group_id) || null : null;
    const groupKey = group?.id || "__ungrouped__";
    if (folderByGroupKey.has(groupKey)) continue;
    const folder = await ensureFolder({
      projectId,
      parentId: packageFolderId,
      name: group?.name || "Csoport nélkül",
      sortOrder: group ? Math.max(100, Number(group.sort_order || 0) + 100) : 899,
    });
    folderByGroupKey.set(groupKey, folder);
  }
  return { folderByGroupKey, groupById };
}

async function copySourceToDrive(input: {
  source: ArchiveSource;
  driveStorageKey: string;
  expectedDriveBucket: string;
}) {
  const opened = await openDropS3Object({
    storageKey: input.source.sourceStorageKey,
    bucket: input.source.sourceBucket,
  });
  if (opened.contentLength !== input.source.sizeBytes) {
    throw new DropDriveArchiveError(
      `A forrásobjektum mérete eltér a rögzített mérettől: ${input.source.documentName}.`,
      "DROP_DRIVE_ARCHIVE_SOURCE_SIZE_MISMATCH",
      409,
      false,
    );
  }
  const body = opened.body as unknown as AsyncIterable<Uint8Array>;
  if (!body || typeof body[Symbol.asyncIterator] !== "function") {
    throw new DropDriveArchiveError("A Drop forrásobjektum nem streamelhető.", "DROP_DRIVE_ARCHIVE_STREAM_UNAVAILABLE");
  }
  const copied = await putDriveObjectStream({
    storageKey: input.driveStorageKey,
    body,
    contentType: input.source.mimeType || opened.contentType,
    contentLength: opened.contentLength,
    metadata: {
      "drop-package-id": input.source.archiveKey.split(":")[1] || "package",
      "drop-source-type": input.source.sourceType,
      "drop-source-id": input.source.sourceId,
      ...(input.source.sha256 ? { "drop-sha256": input.source.sha256 } : {}),
    },
  });
  if (copied.bucket !== input.expectedDriveBucket) {
    throw new DropDriveArchiveError("A DRIVE célbucket eltér az archiválási konfigurációtól.", "DROP_DRIVE_ARCHIVE_BUCKET_MISMATCH", 409, false);
  }
  const verified = await headDriveObject({ storageKey: input.driveStorageKey, bucket: copied.bucket });
  if (verified.contentLength !== input.source.sizeBytes) {
    await deleteDriveObject({ storageKey: input.driveStorageKey, bucket: copied.bucket }).catch(() => undefined);
    throw new DropDriveArchiveError("A DRIVE archívummásolat méretellenőrzése sikertelen.", "DROP_DRIVE_ARCHIVE_COPY_SIZE_MISMATCH");
  }
  return verified;
}

async function archiveSource(input: {
  projectId: string;
  folderId: string;
  packageId: string;
  source: ArchiveSource;
}) {
  const driveConfig = getDriveObjectStorageConfig();
  const existing = await findDriveUploadSessionByArchiveKey({
    projectId: input.projectId,
    archiveKey: input.source.archiveKey,
  });
  if (existing?.status === "FINALIZED") {
    try {
      const object = await headDriveObject({ storageKey: existing.storageKey, bucket: existing.storageBucket });
      if (object.contentLength !== input.source.sizeBytes) throw new Error("Méreteltérés");
      const classification = existing.finalizedDocumentId
        ? await markDriveDocumentAsDropArchive({
            projectId: input.projectId,
            documentId: existing.finalizedDocumentId,
            actorUserId: ARCHIVE_ACTOR,
            dropPackageId: input.packageId,
            dropSourceType: input.source.sourceType,
            dropSourceId: input.source.sourceId,
            folderId: input.folderId,
          })
        : null;
      return { session: existing, idempotent: classification?.idempotent !== false, restored: false, moved: classification?.moved === true };
    } catch {
      await copySourceToDrive({
        source: input.source,
        driveStorageKey: existing.storageKey,
        expectedDriveBucket: existing.storageBucket,
      });
      const classification = existing.finalizedDocumentId
        ? await markDriveDocumentAsDropArchive({
            projectId: input.projectId,
            documentId: existing.finalizedDocumentId,
            actorUserId: ARCHIVE_ACTOR,
            dropPackageId: input.packageId,
            dropSourceType: input.source.sourceType,
            dropSourceId: input.source.sourceId,
            folderId: input.folderId,
          })
        : null;
      return { session: existing, idempotent: classification?.idempotent !== false, restored: true, moved: classification?.moved === true };
    }
  }

  let session = existing;
  if (session && new Date(session.expiresAt).getTime() <= Date.now()) {
    await abortDriveUploadSessionRecord({
      projectId: input.projectId,
      uploadId: session.id,
      actorUserId: ARCHIVE_ACTOR,
      reason: "Lejárt DROP → DRIVE archiválási munkamenet újraindítása.",
    }).catch(() => undefined);
    session = null;
  }

  if (!session) {
    const now = new Date();
    const uploadId = `drive-upload-drop-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const storageKey = buildDriveStorageKey({
      projectId: input.projectId,
      uploadId,
      fileName: input.source.originalName,
    });
    const record: DriveUploadSession = {
      id: uploadId,
      projectId: input.projectId,
      folderId: input.folderId,
      documentId: null,
      uploadKind: "NEW_DOCUMENT",
      documentName: input.source.documentName,
      originalName: input.source.originalName,
      mimeType: input.source.mimeType,
      sizeBytes: input.source.sizeBytes,
      sha256: input.source.sha256,
      expectedCurrentVersion: 0,
      source: "WEB",
      clientId: "drop-drive-archive",
      storageProvider: "S3",
      storageBucket: driveConfig.bucket,
      storageKey,
      finalVersionStatus: "AVAILABLE",
      status: "INITIATED",
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      finalizedDocumentId: null,
      finalizedVersionId: null,
      createdBy: ARCHIVE_ACTOR,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      completedAt: null,
      metadata: {
        description: input.source.description,
        revisionCode: "DROP",
        changeNote: `Automatikus archiválás a ${input.packageId} Drop csomagból.`,
        checksumVerified: Boolean(input.source.sha256),
        dropArchiveKey: input.source.archiveKey,
        dropPackageId: input.packageId,
        dropSourceType: input.source.sourceType,
        dropSourceId: input.source.sourceId,
        sourceStorageKey: input.source.sourceStorageKey,
        sourceSha256: input.source.sha256,
        archiveVersion: "DROP 1.2.11",
      },
    };
    session = await createDriveUploadSessionRecord(record, ARCHIVE_ACTOR);
  }

  let driveFinalized = false;
  try {
    let object = await headDriveObject({ storageKey: session.storageKey, bucket: session.storageBucket }).catch(() => null);
    if (!object || object.contentLength !== input.source.sizeBytes) {
      if (object) await deleteDriveObject({ storageKey: session.storageKey, bucket: session.storageBucket }).catch(() => undefined);
      object = await copySourceToDrive({
        source: input.source,
        driveStorageKey: session.storageKey,
        expectedDriveBucket: session.storageBucket,
      });
    }
    const checksum = await calculateDriveObjectSha256({
      storageKey: session.storageKey,
      bucket: session.storageBucket,
    });
    if (checksum.sizeBytes !== input.source.sizeBytes) {
      throw new DropDriveArchiveError(
        "A DROP → DRIVE archívum SHA-256 visszaolvasási mérete eltér a forrástól.",
        "DROP_DRIVE_ARCHIVE_CHECKSUM_SIZE_MISMATCH",
        409,
        false,
      );
    }
    if (input.source.sha256 && input.source.sha256.toLowerCase() !== checksum.sha256) {
      throw new DropDriveArchiveError(
        "A DROP → DRIVE archívum SHA-256 lenyomata eltér a forrásfájltól.",
        "DROP_DRIVE_ARCHIVE_CHECKSUM_MISMATCH",
        409,
        false,
      );
    }
    const finalized = await finalizeDriveUploadSessionRecord({
      projectId: input.projectId,
      uploadId: session.id,
      receivedSizeBytes: object.contentLength,
      storageEtag: object.etag,
      verifiedSha256: checksum.sha256,
      actorUserId: ARCHIVE_ACTOR,
    });
    driveFinalized = true;
    const finalizedDocumentId = finalized.session.finalizedDocumentId || String((finalized.document as { id?: unknown }).id || "");
    if (!finalizedDocumentId) {
      throw new DropDriveArchiveError("A DRIVE archiválás végleges dokumentumazonosítója hiányzik.", "DROP_DRIVE_ARCHIVE_DOCUMENT_ID_MISSING");
    }
    await markDriveDocumentAsDropArchive({
      projectId: input.projectId,
      documentId: finalizedDocumentId,
      actorUserId: ARCHIVE_ACTOR,
      dropPackageId: input.packageId,
      dropSourceType: input.source.sourceType,
      dropSourceId: input.source.sourceId,
      folderId: input.folderId,
    });
    return { session: finalized.session, document: finalized.document, version: finalized.version, idempotent: false, restored: false };
  } catch (error) {
    if (!driveFinalized) {
      await deleteDriveObject({ storageKey: session.storageKey, bucket: session.storageBucket }).catch(() => undefined);
      await abortDriveUploadSessionRecord({
        projectId: input.projectId,
        uploadId: session.id,
        actorUserId: ARCHIVE_ACTOR,
        reason: errorMessage(error),
      }).catch(() => undefined);
    }
    throw error;
  }
}

function fileArchiveSource(packageId: string, file: DropFileRecord, documentName: string): ArchiveSource {
  return {
    archiveKey: `drop:${packageId}:file:${file.id}`,
    sourceType: "file",
    sourceId: file.id,
    sourceBucket: file.storage_bucket,
    sourceStorageKey: file.storage_key,
    documentName,
    originalName: file.original_name || file.display_name,
    mimeType: file.detected_mime_type || file.mime_type || "application/octet-stream",
    sizeBytes: Number(file.size_stored_bytes || file.size_original_bytes || 0),
    sha256: file.sha256,
    description: `DIMPRO Drop fájl · ${file.uploaded_by_name || file.uploaded_by_email || "ismeretlen feltöltő"} · ${file.created_at}`,
  };
}

async function reportArchiveSource(context: ArchiveContext, documentName: string): Promise<ArchiveSource | null> {
  const report = context.report;
  if (!report?.storage_key || !report.generated_at || !isDropReportFresh(report, context.bundle)) return null;
  if (!["sent", "completed"].includes(report.status)) return null;
  const sourceBucket = getDropStorageConfig().bucket;
  const head = await headDropS3Object({ storageKey: report.storage_key, bucket: sourceBucket });
  return {
    archiveKey: `drop:${context.bundle.packageRow.id}:report:${report.id}`,
    sourceType: "report",
    sourceId: report.id,
    sourceBucket,
    sourceStorageKey: report.storage_key,
    documentName,
    originalName: documentName,
    mimeType: "application/pdf",
    sizeBytes: head.sizeBytes,
    sha256: head.metadata["dimpro-sha256"] || null,
    description: `DIMPRO Drop végleges PDF-riport · ${context.bundle.packageRow.public_code}`,
  };
}

export async function getDropDriveArchiveState(packageId: string) {
  const context = await loadArchiveContext(packageId);
  const enabled = getDropFeatureFlags().driveArchiveEnabled;
  const projectId = context.bundle.packageRow.project_id;
  const files = context.bundle.files.filter(isArchivableFile);
  const reportReady = Boolean(
    context.report?.storage_key
      && context.report.generated_at
      && isDropReportFresh(context.report, context.bundle)
      && ["sent", "completed"].includes(context.report.status),
  );
  const expectedKeys = [
    ...files.map((file) => `drop:${packageId}:file:${file.id}`),
    ...(context.report && reportReady ? [`drop:${packageId}:report:${context.report.id}`] : []),
  ];
  const sessions = projectId && context.required
    ? await Promise.all(expectedKeys.map((archiveKey) => findDriveUploadSessionByArchiveKey({ projectId, archiveKey })))
    : [];
  const completed = sessions.filter((session) => session?.status === "FINALIZED").length;
  const failedOrPending = Math.max(0, expectedKeys.length - completed);
  return {
    version: "DROP 1.2.11",
    enabled,
    required: context.required,
    ready: !context.required || (enabled && reportReady && expectedKeys.length > 0 && failedOrPending === 0),
    projectId,
    projectName: context.link?.project_name_snapshot || context.bundle.packageRow.project_name_snapshot || null,
    targetFolderId: context.link?.drive_target_folder_id || null,
    expectedItems: expectedKeys.length,
    archivedItems: completed,
    pendingItems: failedOrPending,
    fileCount: files.length,
    groupCount: new Set(files.map((file) => file.group_id || "__ungrouped__")).size,
    reportRequired: context.required,
    reportReady,
    note: !context.required
      ? "Ehhez a csomaghoz nincs bekapcsolva a tartós DIMPRO Drive archiválás."
      : !enabled
        ? "A projektkapcsolat kéri a Drive archiválást, de a központi funkció még nincs aktiválva."
        : failedOrPending > 0
          ? "A tartós Drive-másolat készítése folyamatban van."
          : "A fájlok és a végleges PDF-riport tartósan a DIMPRO Drive tárhelyére kerültek.",
  };
}

export async function processDropDriveArchive(packageId: string) {
  const context = await loadArchiveContext(packageId);
  if (!context.required) {
    return { ok: true as const, packageId, required: false, status: "not-required", archived: 0, idempotent: true };
  }
  if (!getDropFeatureFlags().driveArchiveEnabled) {
    throw new DropDriveArchiveError("A DROP → DRIVE archiválás feature flagje nincs aktiválva.", "DROP_DRIVE_ARCHIVE_DISABLED", 503, false);
  }
  if (!context.link || !context.bundle.packageRow.project_id) {
    throw new DropDriveArchiveError("A csomaghoz hiányzik az archiválható projektkapcsolat.", "DROP_DRIVE_ARCHIVE_PROJECT_REQUIRED", 409, false);
  }
  if (!context.report || !context.report.storage_key || !isDropReportFresh(context.report, context.bundle) || !["sent", "completed"].includes(context.report.status)) {
    throw new DropDriveArchiveError("A Drive archiválás előtt friss és lezárt végleges PDF-riport szükséges.", "DROP_DRIVE_ARCHIVE_REPORT_REQUIRED", 409, true);
  }
  const driveStatus = getDriveObjectStorageSafeStatus();
  if (!driveStatus.storageConfigured || !driveStatus.objectWriteEnabled) {
    throw new DropDriveArchiveError("A DIMPRO Drive Hetzner Object Storage írási kapcsolata nem áll készen.", "DROP_DRIVE_STORAGE_NOT_READY", 503, true);
  }

  const packageFolder = await resolveArchiveFolder(context);
  const { folderByGroupKey, groupById } = await resolveFileArchiveFolders(context, packageFolder.id);
  const tree = await listDriveTree(context.bundle.packageRow.project_id);
  const usedNamesByFolder = new Map<string, Set<string>>();
  for (const folder of [packageFolder, ...folderByGroupKey.values()]) {
    usedNamesByFolder.set(folder.id, new Set(
      tree.documents
        .filter((document) => document.folderId === folder.id && document.status === "ACTIVE")
        .map((document) => document.name.toLocaleLowerCase("hu-HU")),
    ));
  }
  const results: Array<Record<string, unknown>> = [];
  for (const file of context.bundle.files.filter(isArchivableFile)) {
    const group = file.group_id ? groupById.get(file.group_id) || null : null;
    const groupKey = group?.id || "__ungrouped__";
    const targetFolder = folderByGroupKey.get(groupKey);
    if (!targetFolder) {
      throw new DropDriveArchiveError("A fájl Drive célmappája nem határozható meg.", "DROP_DRIVE_GROUP_FOLDER_MISSING", 409, true);
    }
    const usedNames = usedNamesByFolder.get(targetFolder.id) || new Set<string>();
    usedNamesByFolder.set(targetFolder.id, usedNames);
    const existing = await findDriveUploadSessionByArchiveKey({
      projectId: context.bundle.packageRow.project_id,
      archiveKey: `drop:${packageId}:file:${file.id}`,
    });
    const documentName = existing?.documentName || uniqueDocumentName(file.display_name || file.original_name, usedNames, file.id);
    const result = await archiveSource({
      projectId: context.bundle.packageRow.project_id,
      folderId: targetFolder.id,
      packageId,
      source: fileArchiveSource(packageId, file, documentName),
    });
    results.push({ type: "file", sourceId: file.id, documentName, ...result });
    await writeArchiveEvent({
      packageId,
      fileId: file.id,
      eventType: "drive.archive_file_completed",
      payload: {
        projectId: context.bundle.packageRow.project_id,
        folderId: targetFolder.id,
        packageFolderId: packageFolder.id,
        groupId: group?.id || null,
        groupName: group?.name || "Csoport nélkül",
        archiveKey: `drop:${packageId}:file:${file.id}`,
        driveUploadId: result.session.id,
        driveDocumentId: result.session.finalizedDocumentId,
        driveVersionId: result.session.finalizedVersionId,
        idempotent: result.idempotent,
        restored: result.restored,
      },
    });
  }

  const reportUsedNames = usedNamesByFolder.get(packageFolder.id) || new Set<string>();
  const reportName = uniqueDocumentName(`${context.bundle.packageRow.public_code}_vegleges_riport.pdf`, reportUsedNames, context.report.id);
  const reportSource = await reportArchiveSource(context, reportName);
  if (!reportSource) {
    throw new DropDriveArchiveError("A végleges PDF-riport forrásobjektuma nem archiválható.", "DROP_DRIVE_ARCHIVE_REPORT_SOURCE_MISSING", 409, true);
  }
  const reportResult = await archiveSource({
    projectId: context.bundle.packageRow.project_id,
    folderId: packageFolder.id,
    packageId,
    source: reportSource,
  });
  results.push({ type: "report", sourceId: context.report.id, documentName: reportName, ...reportResult });

  const state = await getDropDriveArchiveState(packageId);
  if (!state.ready) {
    throw new DropDriveArchiveError("A Drive archiválás nem zárult le minden kötelező objektumra.", "DROP_DRIVE_ARCHIVE_INCOMPLETE", 409, true);
  }
  await writeArchiveEvent({
    packageId,
    eventType: "drive.archive_completed",
    payload: {
      projectId: context.bundle.packageRow.project_id,
      projectName: context.link.project_name_snapshot,
      folderId: packageFolder.id,
      groupFolderCount: folderByGroupKey.size,
      groupFolders: [...folderByGroupKey.entries()].map(([groupKey, folder]) => ({
        groupId: groupKey === "__ungrouped__" ? null : groupKey,
        folderId: folder.id,
        name: folder.name,
      })),
      expectedItems: state.expectedItems,
      archivedItems: state.archivedItems,
      results: results.map((item) => ({
        type: item.type,
        sourceId: item.sourceId,
        documentName: item.documentName,
      })),
    },
  });
  return {
    ok: true as const,
    packageId,
    required: true,
    status: "completed",
    projectId: context.bundle.packageRow.project_id,
    folderId: packageFolder.id,
    groupFolderCount: folderByGroupKey.size,
    archived: state.archivedItems,
    expected: state.expectedItems,
    idempotent: results.every((result) => result.idempotent === true),
  };
}
