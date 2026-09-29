import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const repo = read("app/lib/drive-core/workspaceRepository.ts");
const service = read("app/lib/drive-core/folderDownloadService.ts");
const storage = read("app/lib/drive-core/storageRepository.ts");
const store = read("app/lib/drive-core/store.ts");
const route = read("app/api/projects/[projectId]/drive/boxes/[boxId]/download/route.ts");
const shelf = read("components/drive/BoxShelf.tsx");
const drive = read("components/drive/DriveWorkspace.tsx");
const gate = read("components/project-gate/DriveWorkspace.tsx");
const types = read("app/lib/drive-core/types.ts");

let pass = 0;
let fail = 0;
function check(name, ok) {
  const index = String(pass + fail + 1).padStart(2, "0");
  if (ok) { pass += 1; console.log(`PASS ${index} ${name}`); }
  else { fail += 1; console.error(`FAIL ${index} ${name}`); }
}

check("server-only BOX package source exists", repo.includes("export async function getDriveBoxPackageSource"));
check("BOX package source resolves pinned versionId first", repo.includes("item.versionId") && repo.includes("versionsById.get(item.versionId)"));
check("BOX package source falls back to current version number", repo.includes("versionsByDocumentNumber") && repo.includes("current_version_number"));
check("storage keys stay in server-side package source", repo.includes("mapPackageVersion") && repo.includes("storageKey: row.storage_key"));
check("store exports BOX ZIP engine", store.includes("openDriveBoxZip") && store.includes("getDriveBoxPackageSource"));
check("Drive change type recognizes box_folder", types.includes('| "box_folder"'));

check("BOX ZIP reuses existing folder download service", service.includes("export async function openDriveBoxZip"));
check("BOX ZIP applies path-safe archive name", service.includes("normalizeBoxArchiveBase") && service.includes("ensureDriveSafeFolderName"));
check("BOX ZIP builds virtual internal folder hierarchy", service.includes("buildBoxVirtualFolders") && service.includes("entry.item.folderId"));
check("BOX ZIP does not mutate original document folder", service.includes("const virtualDocument: DriveDocument = {") && service.includes("folderId: virtualFolderId"));
check("BOX ZIP applies file-count pilot limit", service.includes("DRIVE_BOX_ZIP_FILE_LIMIT") && service.includes("DRIVE_FOLDER_ZIP_MAX_FILES"));
check("BOX ZIP applies 2 GB pilot limit", service.includes("DRIVE_BOX_ZIP_SIZE_LIMIT") && service.includes("DRIVE_FOLDER_ZIP_MAX_BYTES"));
check("BOX ZIP enforces security scan", service.includes("requireDriveCleanSecurityScan") && service.includes("trustedDropArchive"));
check("BOX ZIP streams S3 objects lazily", service.includes("lazyDriveStream(item.version)") && service.includes('compression: "STORE"'));
check("BOX ZIP builds digital documentation register", service.includes("buildDigitalDocumentationRegister") && service.includes("DIGITAL_DOCUMENTATION_REGISTER_FILE_NAME"));
check("BOX ZIP keeps package manifest", service.includes("DIMPRO_fajllista.txt") && service.includes("buildManifest"));
check("BOX ZIP logs every downloaded pinned version", service.includes("logDriveDownloadRecord") && service.includes("versionId: item.version.id"));
check("BOX ZIP logs package against BOX entity", service.includes('entityType: "box"') && service.includes("entityId: box.id"));

check("package audit supports folder and box without breaking folder default", storage.includes('entityType?: "folder" | "box"') && storage.includes('const entityType = input.entityType || "folder"'));
check("package audit records custom package name", storage.includes("packageName: input.packageName || null"));

check("BOX ZIP route requires document.write", route.includes('requireProjectPermission(request, projectId, "document.write")'));
check("BOX ZIP route accepts custom name query", route.includes('searchParams.get("name")') && route.includes("archiveName"));
check("BOX ZIP route streams application/zip", route.includes('"content-type": "application/zip"') && route.includes("Readable.toWeb"));
check("BOX ZIP route exposes package audit headers", route.includes("x-dimpro-drive-download-package-id") && route.includes("x-dimpro-drive-package-source"));

check("CsomagBOX asks for ZIP name", shelf.includes('window.prompt("ZIP fájl neve:"') && shelf.includes("onDownloadBox"));
check("CsomagBOX exposes ZIP action only for writable non-empty box", shelf.includes("box.items.length > 0 && canWrite && onDownloadBox"));
check("main Drive uses direct browser download instead of Blob buffering", drive.includes("document.createElement(\"a\")") && !drive.includes("await response.blob()"));
check("Projectkapu uses direct browser download instead of Blob buffering", gate.includes("document.createElement(\"a\")") && !gate.includes("await response.blob()"));
check("main Drive wires ZIP in shelf and fullscreen panel", (drive.match(/onDownloadBox=\{downloadBoxArchive\}/g) || []).length >= 2);
check("Projectkapu wires ZIP in shelf and fullscreen panel", (gate.match(/onDownloadBox=\{downloadBoxArchive\}/g) || []).length >= 2);
check("existing folder ZIP engine remains exported", store.includes("openDriveFolderZip"));

const result = { ok: fail === 0, contract: "DIMPRO Drive V0.6.7 CsomagBOX ZIP package", pass, fail };
console.log(JSON.stringify(result, null, 2));
if (fail) process.exit(1);
