#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync('components/drive/DriveWorkspace.tsx', 'utf8');
const toolbar = readFileSync('components/drive/DriveToolbar.tsx', 'utf8');
const grid = readFileSync('components/drive/FileGridPanel.tsx', 'utf8');
const commander = readFileSync('components/drive/CommanderPanel.tsx', 'utf8');
const details = readFileSync('components/drive/DetailsPanel.tsx', 'utf8');
const viewer = readFileSync('components/drive/DriveDocumentViewer.tsx', 'utf8');
const projectGate = readFileSync('components/project-gate/DriveWorkspace.tsx', 'utf8');
const storage = readFileSync('app/lib/drive-core/storageService.ts', 'utf8');
const storageRepository = readFileSync('app/lib/drive-core/storageRepository.ts', 'utf8');
const securityRepo = readFileSync('app/lib/drive-core/securityScanRepository.ts', 'utf8');
const zipService = readFileSync('app/lib/drive-core/folderDownloadService.ts', 'utf8');
const zipRoute = readFileSync('app/api/projects/[projectId]/drive/folders/[folderId]/download/route.ts', 'utf8');
const store = readFileSync('app/lib/drive-core/store.ts', 'utf8');

let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log(`PASS ${name}`); };

check('toolbar exposes file open', () => { assert.match(toolbar, /onClick=\{onOpenSelected\}/); assert.match(toolbar, /aria-label="Megnyitás"/); });
check('toolbar exposes file download', () => { assert.match(toolbar, /onClick=\{onDownloadSelected\}/); assert.match(toolbar, /aria-label="Letöltés"/); });
check('toolbar exposes folder ZIP download', () => { assert.match(toolbar, /onClick=\{onDownloadFolder\}/); assert.match(toolbar, /aria-label="Mappa ZIP"/); });
check('PDF and raster files use browser preview path', () => assert.match(workspace, /browserPreviewExtensions/));
check('Word native protocol is supported', () => assert.match(workspace, /return "ms-word"/));
check('Excel native protocol is supported', () => assert.match(workspace, /return "ms-excel"/));
check('PowerPoint native protocol is supported', () => assert.match(workspace, /return "ms-powerpoint"/));
check('unsupported desktop file types fall back to download', () => assert.match(workspace, /nincs böngészős előnézet; letöltés indítva/));
check('file grid double click opens document', () => assert.match(grid, /onDoubleClick=\{\(\) => onOpenDocument\?\.\(document\)\}/));
check('review grid double click opens document', () => assert.match(grid, /onDoubleClick=\{\(\) => onOpenDocument\?\.\(row\.document\)\}/));
check('Commander double click opens document', () => assert.match(commander, /onDoubleClick=\{\(\) => onOpenDocument\(document\)\}/));
check('folder download route requires document.read', () => assert.match(zipRoute, /requireProjectPermission\(request, projectId, "document\.read"\)/));
check('folder download route streams application zip', () => assert.match(zipRoute, /"content-type": "application\/zip"/));
check('folder ZIP recursively resolves descendants', () => assert.match(zipService, /buildFolderPaths\(root, tree\.folders\)/));
check('folder ZIP uses streaming JSZip', () => assert.match(zipService, /generateNodeStream\(\{ streamFiles: true/));
check('folder ZIP preserves folder hierarchy', () => assert.match(zipService, /zip\.folder\(folderPath\)/));
check('folder ZIP security-gates non-DROP files', () => assert.match(zipService, /requireDriveCleanSecurityScan/));
check('folder ZIP is size and count bounded', () => { assert.match(zipService, /DRIVE_FOLDER_ZIP_MAX_FILES = 500/); assert.match(zipService, /DRIVE_FOLDER_ZIP_MAX_BYTES = 2 \* 1024 \* 1024 \* 1024/); });
check('folder ZIP writes a manifest', () => assert.match(zipService, /DIMPRO_fajllista\.txt/));
check('folder ZIP service is exported from store', () => assert.match(store, /openDriveFolderZip/));
check('CLEAN quarantined file can reach signed download path', () => assert.match(storage, /status === "AVAILABLE" \|\| record\.version\.status === "QUARANTINED"/));
check('individual download still requires a clean security scan', () => assert.match(storage, /await requireDriveCleanSecurityScan/));
check('CLEAN quarantined download has audited fallback path', () => { assert.match(storageRepository, /logCleanQuarantinedDriveDownload/); assert.match(storageRepository, /scan\.status !== "CLEAN"/); assert.match(storageRepository, /quarantinedClean: true/); });
check('details allows non-rejected quarantined download attempt', () => assert.match(details, /\["REJECTED", "STAGED", "METADATA_ONLY"\]\.includes/));
check('ordinary Drive UI hides ClamAV branding', () => {
  for (const [name, source] of [['workspace',workspace],['details',details],['viewer',viewer],['projectGate',projectGate]]) {
    assert.doesNotMatch(source, /ClamAV|vírusellenőrz|Vírusellenőrz|vírusvédelem/, `${name} still exposes scanner branding`);
  }
});
check('backend clean requirement wording is generic', () => assert.doesNotMatch(securityRepo, /ClamAV/));

console.log(JSON.stringify({ total: pass, pass, fail: 0 }, null, 2));
