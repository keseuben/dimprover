import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import JSZip from "jszip";
import type { ProjectAccessContext } from "@/app/lib/project-core/types";
import { listDriveTreeForAccess, requireDriveFolderAccess } from "./folderAccess";
import { DriveCoreRepositoryError } from "./errors";
import { buildDriveExportFileName } from "./exportNaming";
import { DIGITAL_DOCUMENTATION_REGISTER_FILE_NAME, buildDigitalDocumentationRegister } from "./documentationRegister";
import { getDriveBoxPackageSource, listDriveEngineeringMetadata, setDriveBoxLifecycle, type DriveBoxFolder, type DriveEngineeringMetadata } from "./workspaceRepository";
import {
  DRIVE_SAFE_PATH_TARGET_MAX,
  buildDriveSafeArchiveFolderPath,
  buildDriveSafeArchivePath,
  compactDriveSafeFileName,
  ensureDriveSafeFolderName,
  ensureDriveSafeFileName,
} from "./nameNormalizer";
import { requireDriveCleanSecurityScan } from "./securityScanRepository";
import { getDriveObjectStream } from "./s3ObjectStorage";
import { logDriveDownloadPackageAudit, logDriveDownloadRecord } from "./storageRepository";
import type { DriveDocument, DriveDocumentVersion, DriveFolder } from "./types";

export const DRIVE_FOLDER_ZIP_MAX_FILES = 500;
export const DRIVE_FOLDER_ZIP_MAX_BYTES = 2 * 1024 * 1024 * 1024;

function downloadPackageId(now = new Date()) {
  const day = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `DLP-${day}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function splitSafeFileName(value: string) {
  const dot = value.lastIndexOf(".");
  if (dot <= 0 || dot === value.length - 1) return { stem: value || "file", extension: "" };
  return { stem: value.slice(0, dot), extension: value.slice(dot) };
}

function folderLineage(folder: DriveFolder, byId: Map<string, DriveFolder>, rootId: string) {
  const segments: string[] = [];
  const seen = new Set<string>();
  let current: DriveFolder | undefined = folder;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    segments.push(current.name);
    if (current.id === rootId) break;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return segments.reverse();
}

function buildFolderPaths(root: DriveFolder, folders: DriveFolder[]) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  byId.set(root.id, root);
  const relative = new Map<string, string>();
  for (const folder of byId.values()) {
    const lineage = folderLineage(folder, byId, root.id);
    if (!lineage.length || lineage[0] !== root.name) continue;
    const safe = buildDriveSafeArchiveFolderPath(lineage, DRIVE_SAFE_PATH_TARGET_MAX);
    relative.set(folder.id, safe.relativePath);
  }
  if (!relative.has(root.id)) {
    relative.set(root.id, ensureDriveSafeFolderName(root.name));
  }
  return relative;
}

function uniqueZipEntryName(folderPath: string, fileName: string, used: Set<string>) {
  const folderSegments = folderPath.split("/").filter(Boolean);
  const safeFile = ensureDriveSafeFileName(fileName);
  const first = buildDriveSafeArchivePath(folderSegments, safeFile, DRIVE_SAFE_PATH_TARGET_MAX);
  let candidate = first.relativePath;
  let counter = 2;
  while (used.has(candidate.toLocaleLowerCase("hu-HU"))) {
    const { stem, extension } = splitSafeFileName(safeFile);
    const suffix = "_" + counter;
    const renamed = compactDriveSafeFileName(
      stem + suffix + extension,
      Math.max(10, DRIVE_SAFE_PATH_TARGET_MAX - folderPath.length - 1),
    );
    candidate = buildDriveSafeArchivePath(folderSegments, renamed, DRIVE_SAFE_PATH_TARGET_MAX).relativePath;
    counter += 1;
  }
  used.add(candidate.toLocaleLowerCase("hu-HU"));
  return candidate;
}

function lazyDriveStream(version: DriveDocumentVersion) {
  return Readable.from((async function* () {
    if (!version.storageKey) throw new Error("A DRIVE objektum storage key értéke hiányzik.");
    const object = await getDriveObjectStream({ storageKey: version.storageKey, bucket: version.storageBucket });
    for await (const chunk of object.body) yield chunk;
  })());
}

function buildManifest(input: {
  folder: DriveFolder;
  packageId: string;
  projectName?: string;
  projectCode?: string;
  files: Array<{ document: DriveDocument; version: DriveDocumentVersion; zipName: string }>;
  skipped: Array<{ name: string; reason: string }>;
}) {
  const lines = [
    "DIMPRO – DIGITÁLIS MŰSZAKI DOKUMENTÁCIÓ ÁTADÁSI JEGYZÉKE",
    "",
    `Csomagazonosító: ${input.packageId}`,
    `Projekt: ${input.projectName || "—"}`,
    `Projektkód: ${input.projectCode || "—"}`,
    `Mappa: ${input.folder.displayPath || input.folder.displayName || input.folder.path || input.folder.name}`,
    `Létrehozva: ${new Date().toLocaleString("hu-HU")}`,
    `Letöltött fájlok: ${input.files.length}`,
    `Kihagyott fájlok: ${input.skipped.length}`,
    `Összes eredeti méret: ${input.files.reduce((sum, item) => sum + item.version.sizeBytes, 0)} byte`,
    "",
    "A ZIP csak olyan fájlokat tartalmaz, amelyek a DIMPRO biztonsági ellenőrzésén megfeleltek.",
    "",
  ];
  input.files.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.zipName}`);
    lines.push(`   Eredeti fájlnév: ${item.version.originalName || item.document.name}`);
    lines.push(`   Méret: ${item.version.sizeBytes} byte`);
    lines.push(`   MIME: ${item.version.mimeType || "application/octet-stream"}`);
    if (item.version.sha256) lines.push(`   SHA-256: ${item.version.sha256}`);
    lines.push("");
  });
  if (input.skipped.length) {
    lines.push("Kihagyott tételek:");
    input.skipped.forEach((item, index) => lines.push(`${index + 1}. ${item.name} – ${item.reason}`));
    lines.push("");
  }
  return lines.join("\r\n");
}

export async function openDriveFolderZip(input: {
  projectId: string;
  folderId: string;
  actorUserId: string;
  actorDisplayName?: string;
  projectCode?: string;
  projectName?: string;
  clientId?: string | null;
  access: ProjectAccessContext;
}) {
  await requireDriveFolderAccess(input.projectId, input.folderId, input.access);
  const tree = await listDriveTreeForAccess(input.projectId, input.access);
  const root = tree.folders.find((folder) => folder.id === input.folderId);
  if (!root) throw new DriveCoreRepositoryError("A letöltendő DRIVE mappa nem található.", "DRIVE_FOLDER_DOWNLOAD_NOT_FOUND", 404);

  const generatedAt = new Date().toISOString();
  const packageId = downloadPackageId(new Date(generatedAt));
  const engineeringMetadata = await listDriveEngineeringMetadata(input.projectId);
  const metadataByDocument = new Map(engineeringMetadata.map((metadata) => [metadata.documentId, metadata]));

  const folderPaths = buildFolderPaths(root, tree.folders);
  const folderIds = new Set(folderPaths.keys());
  const sourceDocuments = tree.documents.filter((document) => folderIds.has(document.folderId));
  if (sourceDocuments.length > DRIVE_FOLDER_ZIP_MAX_FILES) {
    throw new DriveCoreRepositoryError(
      `A mappaletöltés legfeljebb ${DRIVE_FOLDER_ZIP_MAX_FILES} fájlt tartalmazhat ebben a pilot verzióban.`,
      "DRIVE_FOLDER_ZIP_FILE_LIMIT",
      413,
    );
  }

  const accepted: Array<{ document: DriveDocument; version: DriveDocumentVersion; zipName: string; metadata: DriveEngineeringMetadata | null }> = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  const usedNames = new Set<string>();
  let totalBytes = 0;

  for (const document of sourceDocuments) {
    const version = document.currentVersion;
    if (!version || version.storageProvider !== "S3" || !version.storageKey) {
      skipped.push({ name: document.name, reason: "nincs letölthető tárhelyobjektum" });
      continue;
    }
    if (version.status !== "AVAILABLE" && version.status !== "QUARANTINED") {
      skipped.push({ name: document.name, reason: `nem letölthető állapot: ${version.status}` });
      continue;
    }

    const trustedDropArchive = document.source === "DROP" && version.status === "AVAILABLE";
    if (!trustedDropArchive) {
      try {
        await requireDriveCleanSecurityScan({ projectId: input.projectId, documentId: document.id, versionId: version.id });
      } catch {
        skipped.push({ name: document.name, reason: "a biztonsági ellenőrzés még nem megfelelő" });
        continue;
      }
    }

    totalBytes += version.sizeBytes;
    if (totalBytes > DRIVE_FOLDER_ZIP_MAX_BYTES) {
      throw new DriveCoreRepositoryError(
        "A mappaletöltés összesített mérete meghaladja a 2 GB-os pilot biztonsági korlátot.",
        "DRIVE_FOLDER_ZIP_SIZE_LIMIT",
        413,
      );
    }
    const folderPath = folderPaths.get(document.folderId) || ensureDriveSafeFolderName(root.name);
    const metadata = metadataByDocument.get(document.id) || null;
    const exportFileName = buildDriveExportFileName({
      planNo: metadata?.planNo,
      exportAlias: document.exportAlias,
      documentName: document.name,
      versionNumber: version.versionNumber,
      revisionNumber: version.revisionNumber,
      statusCode: metadata?.issueStatus,
      extension: document.extension,
    });
    accepted.push({
      document,
      version,
      zipName: uniqueZipEntryName(folderPath, exportFileName, usedNames),
      metadata,
    });
  }

  const zip = new JSZip();
  for (const folderPath of folderPaths.values()) zip.folder(folderPath);
  for (const item of accepted) {
    zip.file(item.zipName, lazyDriveStream(item.version), {
      binary: true,
      compression: "STORE",
      date: new Date(item.version.createdAt),
      createFolders: true,
    });
  }

  const manifestFolder = folderPaths.get(root.id) || ensureDriveSafeFolderName(root.name);
  const registerBuffer = await buildDigitalDocumentationRegister({
    projectId: input.projectId,
    projectCode: input.projectCode,
    projectName: input.projectName,
    packageId,
    generatedAt,
    actorUserId: input.actorUserId,
    actorDisplayName: input.actorDisplayName,
    rootFolder: root,
    folders: tree.folders,
    files: accepted,
    skipped,
    totalBytes,
  });
  zip.file(`${manifestFolder}/${DIGITAL_DOCUMENTATION_REGISTER_FILE_NAME}`, registerBuffer, {
    binary: true,
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  zip.file(
    `${manifestFolder}/DIMPRO_fajllista.txt`,
    buildManifest({
      folder: root,
      packageId,
      projectName: input.projectName,
      projectCode: input.projectCode,
      files: accepted,
      skipped,
    }),
    {
    binary: false,
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  await Promise.all(accepted.map((item) => logDriveDownloadRecord({
    projectId: input.projectId,
    documentId: item.document.id,
    versionId: item.version.id,
    actorUserId: input.actorUserId,
    clientId: input.clientId || "drive-folder-zip",
  })));

  await logDriveDownloadPackageAudit({
    projectId: input.projectId,
    folderId: root.id,
    packageId,
    actorUserId: input.actorUserId,
    clientId: input.clientId || "drive-folder-zip",
    fileCount: accepted.length,
    skippedFileCount: skipped.length,
    totalBytes,
    registerFileName: DIGITAL_DOCUMENTATION_REGISTER_FILE_NAME,
    files: accepted.map((item) => ({
      documentId: item.document.id,
      versionId: item.version.id,
      zipName: item.zipName,
    })),
  });

  return {
    ok: true as const,
    folder: root,
    packageId,
    registerFileName: DIGITAL_DOCUMENTATION_REGISTER_FILE_NAME,
    fileName: `${ensureDriveSafeFolderName(root.name)}.zip`,
    sourceFileCount: accepted.length,
    skippedFileCount: skipped.length,
    totalBytes,
    stream: zip.generateNodeStream({ streamFiles: true, compression: "STORE", platform: "UNIX" }),
  };
}

function normalizeBoxArchiveBase(value: string | undefined, fallback: string) {
  const raw = (value || fallback || "DIMPRO_CsomagBOX").trim().replace(/\.zip$/i, "").trim();
  return ensureDriveSafeFolderName(raw || "DIMPRO_CsomagBOX");
}

function buildBoxVirtualFolders(input: {
  projectId: string;
  boxId: string;
  rootName: string;
  displayName: string;
  actorUserId: string;
  folders: DriveBoxFolder[];
  generatedAt: string;
}) {
  const root: DriveFolder = {
    id: `drive-box-root-${input.boxId}`,
    projectId: input.projectId,
    parentId: null,
    name: input.rootName,
    path: input.rootName,
    originalName: input.displayName,
    displayName: input.displayName,
    safeName: input.rootName,
    displayPath: input.displayName,
    sortOrder: 0,
    discipline: "",
    topic: "",
    status: "ACTIVE",
    createdBy: input.actorUserId,
    createdAt: input.generatedAt,
    updatedAt: input.generatedAt,
  };

  const sourceById = new Map(input.folders.map((folder) => [folder.id, folder]));
  const lineage = (folder: DriveBoxFolder) => {
    const chain: DriveBoxFolder[] = [];
    const seen = new Set<string>();
    let current: DriveBoxFolder | undefined = folder;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      chain.push(current);
      current = current.parentId ? sourceById.get(current.parentId) : undefined;
    }
    return chain.reverse();
  };

  const folders = input.folders.map((folder): DriveFolder => {
    const chain = lineage(folder);
    const safeSegments = [input.rootName, ...chain.map((item) => ensureDriveSafeFolderName(item.name))];
    const displaySegments = [input.displayName, ...chain.map((item) => item.name)];
    return {
      id: folder.id,
      projectId: input.projectId,
      parentId: folder.parentId && sourceById.has(folder.parentId) ? folder.parentId : root.id,
      name: ensureDriveSafeFolderName(folder.name),
      path: safeSegments.join("/"),
      originalName: folder.name,
      displayName: folder.name,
      safeName: ensureDriveSafeFolderName(folder.name),
      displayPath: displaySegments.join("/"),
      sortOrder: folder.sortOrder,
      discipline: "",
      topic: "",
      status: "ACTIVE",
      createdBy: folder.createdBy,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
  });

  return { root, folders: [root, ...folders], folderIds: new Set(folders.map((folder) => folder.id)) };
}

export async function openDriveBoxZip(input: {
  projectId: string;
  boxId: string;
  archiveName?: string;
  actorUserId: string;
  actorDisplayName?: string;
  projectCode?: string;
  projectName?: string;
  clientId?: string | null;
  access: ProjectAccessContext;
}) {
  const source = await getDriveBoxPackageSource(input.projectId, input.boxId, input.access);
  const box = source.box;
  if (source.entries.length > DRIVE_FOLDER_ZIP_MAX_FILES) {
    throw new DriveCoreRepositoryError(
      `A CsomagBOX export legfeljebb ${DRIVE_FOLDER_ZIP_MAX_FILES} fájlt tartalmazhat ebben a pilot verzióban.`,
      "DRIVE_BOX_ZIP_FILE_LIMIT",
      413,
    );
  }

  const generatedAt = new Date().toISOString();
  const packageId = downloadPackageId(new Date(generatedAt));
  const rootName = normalizeBoxArchiveBase(input.archiveName, box.name);
  const displayName = (input.archiveName || box.name || rootName).trim().replace(/\.zip$/i, "") || rootName;
  const virtual = buildBoxVirtualFolders({
    projectId: input.projectId,
    boxId: box.id,
    rootName,
    displayName,
    actorUserId: input.actorUserId,
    folders: box.folders || [],
    generatedAt,
  });
  const folderPaths = buildFolderPaths(virtual.root, virtual.folders);
  const engineeringMetadata = await listDriveEngineeringMetadata(input.projectId);
  const metadataByDocument = new Map(engineeringMetadata.map((metadata) => [metadata.documentId, metadata]));

  const accepted: Array<{ document: DriveDocument; version: DriveDocumentVersion; zipName: string; metadata: DriveEngineeringMetadata | null }> = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  const usedNames = new Set<string>();
  let totalBytes = 0;

  for (const entry of source.entries) {
    const document = entry.document;
    const version = entry.version;
    if (!document) {
      skipped.push({ name: entry.item.documentId, reason: "a CsomagBOX dokumentum nem található" });
      continue;
    }
    if (!version || version.storageProvider !== "S3" || !version.storageKey) {
      skipped.push({ name: document.name, reason: "a rögzített dokumentumverzióhoz nincs letölthető tárhelyobjektum" });
      continue;
    }
    if (version.status !== "AVAILABLE" && version.status !== "QUARANTINED") {
      skipped.push({ name: document.name, reason: `nem letölthető verzióállapot: ${version.status}` });
      continue;
    }

    const trustedDropArchive = document.source === "DROP" && version.status === "AVAILABLE";
    if (!trustedDropArchive) {
      try {
        await requireDriveCleanSecurityScan({
          projectId: input.projectId,
          documentId: document.id,
          versionId: version.id,
        });
      } catch {
        skipped.push({ name: document.name, reason: "a biztonsági ellenőrzés még nem megfelelő" });
        continue;
      }
    }

    totalBytes += version.sizeBytes;
    if (totalBytes > DRIVE_FOLDER_ZIP_MAX_BYTES) {
      throw new DriveCoreRepositoryError(
        "A CsomagBOX export összesített mérete meghaladja a 2 GB-os pilot biztonsági korlátot.",
        "DRIVE_BOX_ZIP_SIZE_LIMIT",
        413,
      );
    }

    const virtualFolderId = entry.item.folderId && virtual.folderIds.has(entry.item.folderId)
      ? entry.item.folderId
      : virtual.root.id;
    const virtualDocument: DriveDocument = {
      ...document,
      folderId: virtualFolderId,
      currentVersion: version,
      currentVersionNumber: version.versionNumber,
    };
    const folderPath = folderPaths.get(virtualFolderId) || rootName;
    const metadata = metadataByDocument.get(document.id) || null;
    const exportFileName = buildDriveExportFileName({
      planNo: metadata?.planNo,
      exportAlias: document.exportAlias,
      documentName: document.name,
      versionNumber: version.versionNumber,
      revisionNumber: version.revisionNumber,
      statusCode: metadata?.issueStatus,
      extension: document.extension,
    });
    accepted.push({
      document: virtualDocument,
      version,
      zipName: uniqueZipEntryName(folderPath, exportFileName, usedNames),
      metadata,
    });
  }

  const zip = new JSZip();
  for (const folderPath of folderPaths.values()) zip.folder(folderPath);
  for (const item of accepted) {
    zip.file(item.zipName, lazyDriveStream(item.version), {
      binary: true,
      compression: "STORE",
      date: new Date(item.version.createdAt),
      createFolders: true,
    });
  }

  const registerBuffer = await buildDigitalDocumentationRegister({
    projectId: input.projectId,
    projectCode: input.projectCode,
    projectName: input.projectName,
    packageId,
    generatedAt,
    actorUserId: input.actorUserId,
    actorDisplayName: input.actorDisplayName,
    rootFolder: virtual.root,
    folders: virtual.folders,
    files: accepted,
    skipped,
    totalBytes,
  });
  zip.file(`${rootName}/${DIGITAL_DOCUMENTATION_REGISTER_FILE_NAME}`, registerBuffer, {
    binary: true,
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  zip.file(
    `${rootName}/DIMPRO_fajllista.txt`,
    buildManifest({
      folder: virtual.root,
      packageId,
      projectName: input.projectName,
      projectCode: input.projectCode,
      files: accepted,
      skipped,
    }),
    { binary: false, compression: "DEFLATE", compressionOptions: { level: 6 } },
  );

  if (box.lifecycleFeatureReady && box.lifecycleStatus === "DRAFT") {
    await setDriveBoxLifecycle(input.projectId, box.id, "READY", input.actorUserId);
  }

  await Promise.all(accepted.map((item) => logDriveDownloadRecord({
    projectId: input.projectId,
    documentId: item.document.id,
    versionId: item.version.id,
    actorUserId: input.actorUserId,
    clientId: input.clientId || "drive-box-zip",
  })));

  await logDriveDownloadPackageAudit({
    projectId: input.projectId,
    entityType: "box",
    entityId: box.id,
    packageId,
    packageName: displayName,
    actorUserId: input.actorUserId,
    clientId: input.clientId || "drive-box-zip",
    fileCount: accepted.length,
    skippedFileCount: skipped.length,
    totalBytes,
    registerFileName: DIGITAL_DOCUMENTATION_REGISTER_FILE_NAME,
    files: accepted.map((item) => ({
      documentId: item.document.id,
      versionId: item.version.id,
      zipName: item.zipName,
    })),
  });

  return {
    ok: true as const,
    box,
    packageId,
    registerFileName: DIGITAL_DOCUMENTATION_REGISTER_FILE_NAME,
    fileName: `${rootName}.zip`,
    sourceFileCount: accepted.length,
    skippedFileCount: skipped.length,
    totalBytes,
    stream: zip.generateNodeStream({ streamFiles: true, compression: "STORE", platform: "UNIX" }),
  };
}
