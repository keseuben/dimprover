import path from "node:path";
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import JSZip from "jszip";
import { listDriveTree } from "./databaseRepository";
import { DriveCoreRepositoryError } from "./errors";
import { DIGITAL_DOCUMENTATION_REGISTER_FILE_NAME, buildDigitalDocumentationRegister } from "./documentationRegister";
import { listDriveEngineeringMetadata, type DriveEngineeringMetadata } from "./workspaceRepository";
import { normalizeDriveFileName } from "./nameNormalizer";
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

function safeArchiveSegment(value: string, fallback = "mappa") {
  const safe = (value || "")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return safe && safe !== "." ? safe : fallback;
}

function safeArchiveFileName(value: string) {
  const base = path.basename(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return base && base !== "." ? base : "dimpro-drive-file";
}

function splitName(value: string) {
  const extension = path.extname(value).slice(0, 32);
  const stem = extension ? value.slice(0, -extension.length) : value;
  return { stem: stem || "dimpro-drive-file", extension };
}

function buildFolderPaths(root: DriveFolder, folders: DriveFolder[]) {
  const relative = new Map<string, string>([[root.id, safeArchiveSegment(root.name, "DIMPRO_Drive")]]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (relative.has(folder.id) || !folder.parentId) continue;
      const parent = relative.get(folder.parentId);
      if (!parent) continue;
      relative.set(folder.id, `${parent}/${safeArchiveSegment(folder.name)}`);
      changed = true;
    }
  }
  return relative;
}

function uniqueZipEntryName(folderPath: string, fileName: string, used: Set<string>) {
  const safe = safeArchiveFileName(fileName);
  const { stem, extension } = splitName(safe);
  let leaf = safe;
  let candidate = `${folderPath}/${leaf}`;
  let counter = 2;
  while (used.has(candidate.toLocaleLowerCase("hu-HU"))) {
    const suffix = ` (${counter})`;
    leaf = `${stem.slice(0, Math.max(1, 180 - extension.length - suffix.length))}${suffix}${extension}`;
    candidate = `${folderPath}/${leaf}`;
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
}) {
  const tree = await listDriveTree(input.projectId);
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
    const folderPath = folderPaths.get(document.folderId) || safeArchiveSegment(root.name, "DIMPRO_Drive");
    const technicalFileName = normalizeDriveFileName(document.name || version.originalName).safeFileName;
    accepted.push({
      document,
      version,
      zipName: uniqueZipEntryName(folderPath, technicalFileName, usedNames),
      metadata: metadataByDocument.get(document.id) || null,
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

  const manifestFolder = safeArchiveSegment(root.name, "DIMPRO_Drive");
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
    fileName: `${safeArchiveSegment(root.name, "DIMPRO_Drive")}.zip`,
    sourceFileCount: accepted.length,
    skippedFileCount: skipped.length,
    totalBytes,
    stream: zip.generateNodeStream({ streamFiles: true, compression: "STORE", platform: "UNIX" }),
  };
}
