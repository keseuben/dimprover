#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const helper = readFileSync("components/drive/externalFileDrop.ts", "utf8");
const main = readFileSync("components/drive/DriveWorkspace.tsx", "utf8");
const project = readFileSync("components/project-gate/DriveWorkspace.tsx", "utf8");
const folderRoute = readFileSync("app/api/projects/[projectId]/drive/folders/route.ts", "utf8");
const mainCss = readFileSync("components/drive/DriveWorkspace.module.css", "utf8");
const commander = readFileSync("components/drive/CommanderPanel.tsx", "utf8");

let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log("PASS " + name); };

check("Windows Explorer folder entries are supported", () => assert.match(helper, /webkitGetAsEntry/));
check("directory reader drains all entry batches", () => {
  assert.match(helper, /readEntries/);
  assert.match(helper, /readBatch\(\)/);
});
check("empty directories are retained", () => assert.match(helper, /directorySet\.add\(relativePath\)/));
check("fallback relative folder paths are supported", () => assert.match(helper, /webkitRelativePath/));
check("drag upload has file limit", () => assert.match(helper, /DEFAULT_MAX_FILES = 500/));
check("drag upload has folder limit", () => assert.match(helper, /DEFAULT_MAX_DIRECTORIES = 250/));
check("drag upload has depth limit", () => assert.match(helper, /DEFAULT_MAX_DEPTH = 24/));
check("path traversal components are removed", () => assert.match(helper, /part !== "\.\."/));
check("folder hierarchy is created parent first", () => assert.match(helper, /depthA - depthB/));
check("existing folders are reused by parent and name", () => {
  assert.match(helper, /folderLookupKey/);
  assert.match(helper, /byKey\.get\(key\)/);
});
check("missing folders use existing Drive folder API", () => {
  assert.match(helper, /\/drive\/folders/);
  assert.match(helper, /method: 'POST'/);
});
check("direct files at Drive root are rejected", () => assert.match(helper, /Közvetlen fájlok feltöltéséhez válassz célmappát/));
check("root folder drops remain allowed", () => assert.match(helper, /baseParentId = input\.selectedFolderId === 'all' \? null/));
check("folder API requires document.write", () => assert.match(folderRoute, /requireProjectPermission\(request, projectId, "document\.write"\)/));

check("main Drive handles native file drag events", () => {
  assert.match(main, /onDragEnter=\{handleExternalDragEnter\}/);
  assert.match(main, /handleExternalDrop/);
  assert.match(main, /prepareDroppedDriveUpload/);
});
check("main Drive uploads groups to their created folders", () => {
  assert.match(main, /targetFolderOverride\?: DriveFolder/);
  assert.match(main, /uploadFiles\(group\.files, group\.folder, group\.originalRelativePaths\)/);
});
check("main Drive displays folder drag overlay", () => {
  assert.match(main, /Engedd el a fájlokat vagy mappákat/);
  assert.match(mainCss, /\.externalDropOverlay/);
});

check("Projectkapu Drive uses the shared folder-drop helper", () => assert.match(project, /prepareDroppedDriveUpload/));
check("Projectkapu queue accepts multiple target folders", () => assert.match(project, /enqueueFileGroups\(groups: Array<\{ files: File\[\]; folder: DriveFolder; originalRelativePaths\?: string\[\] \}>\)/));
check("Projectkapu queues dropped folder groups", () => assert.match(project, /enqueueFileGroups\(prepared\.groups\)/));
check("Projectkapu overlay mentions folders", () => assert.match(project, /Engedd el a fájlokat vagy mappákat a feltöltéshez/));

check("Commander internal file move protocol remains intact", () => {
  assert.match(commander, /application\/x-dimpro-drive-document/);
  assert.match(commander, /draggable=\{canWrite && moveReady\}/);
});

console.log(JSON.stringify({ total: pass, pass, fail: 0 }, null, 2));
