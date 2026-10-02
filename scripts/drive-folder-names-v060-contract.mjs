#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync("app/lib/drive-core/schema.ts", "utf8");
const types = readFileSync("app/lib/drive-core/types.ts", "utf8");
const clientTypes = readFileSync("components/drive/driveTypes.ts", "utf8");
const repo = readFileSync("app/lib/drive-core/databaseRepository.ts", "utf8");
const store = readFileSync("app/lib/drive-core/store.ts", "utf8");
const route = readFileSync("app/api/projects/[projectId]/drive/folders/[folderId]/display-name/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260928_drive_folder_display_name_v060.sql", "utf8");
const rollback = readFileSync("supabase/rollback/DRIVE_FOLDER_DISPLAY_NAME_V060_ROLLBACK.sql", "utf8");
const tree = readFileSync("components/drive/FolderTreePanel.tsx", "utf8");
const commander = readFileSync("components/drive/CommanderPanel.tsx", "utf8");
const grid = readFileSync("components/drive/FileGridPanel.tsx", "utf8");
const main = readFileSync("components/drive/DriveWorkspace.tsx", "utf8");
const project = readFileSync("components/project-gate/DriveWorkspace.tsx", "utf8");
const drop = readFileSync("components/drive/externalFileDrop.ts", "utf8");
const zip = readFileSync("app/lib/drive-core/folderDownloadService.ts", "utf8");

let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log("PASS " + name); };

check("Drive Core runtime marker follows current V070 ACL baseline", () => {
  assert.match(schema, /DRIVE_CORE_SCHEMA_VERSION = "0\.7\.0"/);
  assert.match(schema, /DRIVE_CORE_MIGRATION_COUNT = 4/);
  assert.match(schema, /DRIVE_CORE_BOOTSTRAP_ID = "drive-core-v070-folder-acl-20261001"/);
});
check("folder API model separates original display and technical names", () => {
  for (const source of [types, clientTypes]) {
    assert.match(source, /originalName/);
    assert.match(source, /displayName/);
    assert.match(source, /safeName/);
    assert.match(source, /displayPath/);
  }
});
check("new folder creation derives safe technical name server side", () => {
  assert.match(repo, /normalizeDriveFolderName\(originalName\)/);
  assert.match(repo, /name: normalizedName\.safeFolderName/);
  assert.match(repo, /original_name: originalName/);
  assert.match(repo, /display_name: displayName/);
});
check("tree computes human display path independently of technical path", () => {
  assert.match(repo, /resolveDisplayPath/);
  assert.match(repo, /displayPath: resolveDisplayPath\(folder\)/);
});
check("folder display rename is server-authorized and audited", () => {
  assert.match(route, /requireProjectPermission\(request, projectId, "document\.write"\)/);
  assert.match(route, /updateDriveFolderDisplayName/);
  assert.match(repo, /drive_core_update_folder_display_name/);
  assert.match(store, /updateDriveFolderDisplayName/);
  assert.match(migration, /DRIVE_FOLDER_DISPLAY_NAME_UPDATED/);
});
check("migration adds original and display folder names", () => {
  assert.match(migration, /add column if not exists original_name/);
  assert.match(migration, /add column if not exists display_name/);
  assert.match(migration, /set original_name = case/);
});
check("migration keeps technical name and path unchanged on display rename", () => {
  const renameStart = migration.indexOf("drive_core_update_folder_display_name");
  const renameSql = migration.slice(renameStart);
  assert.match(renameSql, /set display_name = v_display_name/);
  assert.doesNotMatch(renameSql, /set name =/);
  assert.doesNotMatch(renameSql, /set path =/);
});
check("rollback returns runtime marker without destroying captured columns", () => {
  assert.match(rollback, /schema_version = '0\.5\.0'/);
  assert.match(rollback, /additive original_name\/display_name columns intentionally remain/);
  assert.doesNotMatch(rollback, /drop column/i);
});
check("folder tree and Commander show display names", () => {
  assert.match(tree, /folder\.displayName \|\| folder\.name/);
  assert.match(tree, /folder\.displayPath \|\| folder\.path/);
  assert.match(commander, /folder\.displayPath \|\| folder\.path/);
  assert.match(commander, /child\.displayName \|\| child\.name/);
});
check("engineering folder selector uses display path", () => {
  assert.match(grid, /folder\.displayPath \|\| folder\.path/);
  assert.match(grid, /currentFolder\?\.displayPath/);
});
check("both workspace surfaces support display-only folder rename", () => {
  assert.match(main, /async function renameSelectedFolder/);
  assert.match(main, /\/display-name/);
  assert.match(project, /async function renameSelectedFolder/);
  assert.match(project, /\/display-name/);
});
check("folder drag-drop reuses folders by human display name", () => {
  assert.match(drop, /folder\.displayName \|\| folder\.name/);
});
check("ZIP uses technical folder and file names", () => {
  assert.match(zip, /ensureDriveSafeFolderName\(root\.name\)/);
  assert.match(zip, /ensureDriveSafeFileName\(document\.name \|\| version\.originalName\)/);
});
check("ZIP manifest still records original filenames", () => {
  assert.match(zip, /Eredeti fájlnév:/);
  assert.match(zip, /version\.originalName \|\| item\.document\.name/);
});

console.log(JSON.stringify({ total: pass, pass, fail: 0 }, null, 2));
