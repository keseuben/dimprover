#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const schema = read("app/lib/drive-core/schema.ts");
const projectTypes = read("app/lib/project-core/types.ts");
const projectPermissions = read("app/lib/project-core/permissions.ts");
const route = read("app/api/projects/[projectId]/drive/folders/[folderId]/route.ts");
const repo = read("app/lib/drive-core/databaseRepository.ts");
const sql = read("supabase/migrations/20261003_drive_folder_trash_v091.sql");
const gate = read("scripts/drive-folder-trash-v091-migration-gate.mjs");
const grid = read("components/drive/FileGridPanel.tsx");
const workspace = read("components/drive/DriveWorkspace.tsx");
const css = read("components/drive/DriveWorkspace.module.css");

let pass = 0;
const check = (label, fn) => {
  fn();
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2, "0")} ${label}`);
};

check("schema is Drive Core 0.9.1 migration 8", () => {
  assert.match(schema, /DRIVE_CORE_SCHEMA_VERSION = "0\.9\.1"/);
  assert.match(schema, /DRIVE_CORE_MIGRATION_COUNT = 8/);
  assert.match(schema, /drive-core-v091-folder-trash-20261003/);
});
check("folder delete restore purge permissions exist", () => {
  for (const value of ["folder.delete","folder.restore","folder.purge"]) assert.match(projectTypes, new RegExp(value.replace(".", "\\.")));
});
check("OWNER and PROJECT_MANAGER receive folder trash permissions", () => {
  assert.ok((projectPermissions.match(/"folder\.delete"/g) || []).length >= 2);
  assert.ok((projectPermissions.match(/"folder\.restore"/g) || []).length >= 2);
  assert.ok((projectPermissions.match(/"folder\.purge"/g) || []).length >= 2);
});
check("folder delete route requires folder.delete", () => assert.match(route, /requireProjectPermission\(request, projectId, "folder\.delete"\)/));
check("folder delete route rechecks folder ACL", () => assert.match(route, /requireDriveFolderAccess\(projectId, folderId, access\.access\)/));
check("repository uses atomic folder trash RPC", () => assert.match(repo, /rpc\("drive_core_soft_delete_folder_tree_atomic"/));
check("folder trash RPC recursively resolves subtree", () => assert.match(sql, /with recursive subtree/));
check("folder trash blocks formal ISSUED documents", () => assert.match(sql, /DRIVE_FOLDER_DELETE_ISSUED_BLOCKED/));
check("folder trash soft deletes documents and archives folders", () => {
  assert.match(sql, /set status = 'DELETED'/);
  assert.match(sql, /set status = 'ARCHIVED'/);
});
check("folder trash produces audit and change events", () => {
  assert.match(sql, /DRIVE_FOLDER_TRASHED/);
  assert.match(sql, /FOLDER_ARCHIVED/);
  assert.match(sql, /DOCUMENT_DELETED/);
});
check("migration gate locks exact V091 migration and DEV target", () => {
  assert.match(gate, /a8b8ae1803243edbfe69e69a1c32d4c0f7b3d82f44a602d909cca170ca18fac8/);
  assert.match(gate, /db\.\$\{expectedRef\}\.supabase\.co/);
  assert.match(gate, /pbgyuznivqvestuksvif/);
});
check("migration gate is backup first and explicit-approval only", () => {
  assert.match(gate, /DEV_ONLY_DRIVE_FOLDER_TRASH_V091_APPLY_APPROVED/);
  assert.match(gate, /BACKUP_FAILED/);
  assert.match(gate, /pg_restore/);
  assert.match(gate, /ROW_COUNT_CHANGED/);
  assert.match(gate, /productionAccess:"DENY"/);
});
check("separate BOX headers are removed from simple and engineering views", () => {
  assert.doesNotMatch(grid, /label="BOX"/);
});
check("BOX presence is rendered inline in icon strips", () => {
  assert.match(grid, /BoxInlineMarker/);
  assert.match(grid, /boxCountMarker/);
});
check("simple and engineering status headers have no text", () => {
  assert.ok((grid.match(/label="" className=\{styles\.versionStatusHeader\}/g) || []).length === 2);
});
check("file state is represented by compact colored dots", () => {
  for (const cls of ["versionStatusAvailable","versionStatusQuarantine","versionStatusRejected","versionStatusStaged","versionStatusMetadata"]) assert.match(css, new RegExp(cls));
});
check("row hover actions expose browser windows box download trash more", () => {
  for (const token of ["ExternalLink","MonitorUp","PackagePlus","Download","Trash2","EllipsisVertical"]) assert.match(grid, new RegExp(token));
});
check("trash action remains visible but disabled without permission", () => {
  assert.match(grid, /disabled=\{!canDelete \|\| busy\}/);
  assert.match(grid, /Nincs jogosultságod a törléshez/);
  assert.match(grid, /canDeleteFolder=\{canDeleteFolder\}/);
  assert.match(grid, /disabled=\{!canDelete \|\| busy\}/);
});
check("review rows receive BOX marker but no hover action component", () => {
  const reviewIndex = grid.indexOf("{sortedReviewRows.map((row) => (");
  const reviewEnd = grid.indexOf("                ))}", reviewIndex);
  assert.ok(reviewIndex >= 0 && reviewEnd > reviewIndex);
  const reviewRowsSource = grid.slice(reviewIndex, reviewEnd);
  assert.match(reviewRowsSource, /BoxInlineMarker/);
  assert.doesNotMatch(reviewRowsSource, /FileRowActions|FolderRowActions|rowActionsCell/);
});
check("browser and Windows open are separate workspace functions", () => {
  assert.match(workspace, /async function openDocumentInBrowser/);
  assert.match(workspace, /async function openDocumentInWindows/);
});
check("PDF Windows action has explicit desktop bridge fallback", () => {
  assert.match(workspace, /extension === "pdf"/);
  assert.match(workspace, /Drive Desktop\/Bridge protokoll/);
});
check("trash confirmation uses DIMPRO modal instead of window confirm", () => {
  assert.match(workspace, /TrashDialogState/);
  assert.match(workspace, /trashDialogPanel/);
  assert.doesNotMatch(workspace, /documentum lomtárba helyezése\?\\n\\n/);
});
check("folder and document trash callbacks are wired into FileGridPanel", () => {
  assert.match(workspace, /onDeleteFolder=\{deleteFolder\}/);
  assert.match(workspace, /onDeleteSelected=\{deleteDocuments\}/);
});
check("production access remains denied by design", () => {
  assert.doesNotMatch(route + repo + grid + workspace, /PROD ALLOW/);
});

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive V0.9.1 Row Actions + Folder Trash",
  pass,
  fail: 0,
  productionAccess: "DENY",
}, null, 2));
