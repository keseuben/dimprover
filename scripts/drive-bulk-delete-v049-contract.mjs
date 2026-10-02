#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const permissions = readFileSync("app/lib/project-core/permissions.ts", "utf8");
const permissionTypes = readFileSync("app/lib/project-core/types.ts", "utf8");
const coreSchema = readFileSync("app/lib/drive-core/schema.ts", "utf8");
const driveTypes = readFileSync("components/drive/driveTypes.ts", "utf8");
const repository = readFileSync("app/lib/drive-core/databaseRepository.ts", "utf8");
const store = readFileSync("app/lib/drive-core/store.ts", "utf8");
const route = readFileSync("app/api/projects/[projectId]/drive/documents/bulk-delete/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260928_drive_document_soft_delete_v050.sql", "utf8");
const grid = readFileSync("components/drive/FileGridPanel.tsx", "utf8");
const commander = readFileSync("components/drive/CommanderPanel.tsx", "utf8");
const details = readFileSync("components/drive/DetailsPanel.tsx", "utf8");
const main = readFileSync("components/drive/DriveWorkspace.tsx", "utf8");
const project = readFileSync("components/project-gate/DriveWorkspace.tsx", "utf8");
const css = readFileSync("components/drive/DriveWorkspace.module.css", "utf8");

let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log(`PASS ${name}`); };
const roleBase = permissions.indexOf("const ROLE_PERMISSIONS");

check("Drive Core runtime expects current V0.8.0 marker", () => {
  assert.match(coreSchema, /DRIVE_CORE_SCHEMA_VERSION = "0\.8\.0"/);
  assert.match(coreSchema, /DRIVE_CORE_MIGRATION_COUNT = 5/);
  assert.match(coreSchema, /DRIVE_CORE_BOOTSTRAP_ID = "drive-core-v080-revision-model-20261002"/);
});

check("document.delete exists in project permission type", () => assert.match(permissionTypes, /"document\.delete"/));
check("document.delete exists in Drive permission type", () => assert.match(driveTypes, /"document\.delete"/));
check("OWNER receives document.delete", () => {
  const owner = permissions.slice(permissions.indexOf("OWNER:", roleBase), permissions.indexOf("PROJECT_MANAGER:", roleBase));
  assert.match(owner, /"document\.delete"/);
});
check("PROJECT_MANAGER receives document.delete", () => {
  const pm = permissions.slice(permissions.indexOf("PROJECT_MANAGER:", roleBase), permissions.indexOf("CONTRIBUTOR:", roleBase));
  assert.match(pm, /"document\.delete"/);
});
check("CONTRIBUTOR does not receive document.delete", () => {
  const contributor = permissions.slice(permissions.indexOf("CONTRIBUTOR:", roleBase), permissions.indexOf("REVIEWER:", roleBase));
  assert.doesNotMatch(contributor, /"document\.delete"/);
});
check("REVIEWER and VIEWER do not receive document.delete", () => {
  const lower = permissions.slice(permissions.indexOf("REVIEWER:", roleBase));
  assert.doesNotMatch(lower, /"document\.delete"/);
});
check("bulk delete API requires document.delete", () => assert.match(route, /requireProjectPermission\(request, projectId, "document\.delete"\)/));
check("repository uses atomic soft delete RPC", () => assert.match(repository, /drive_core_soft_delete_documents_atomic/));
check("store exports soft delete", () => assert.match(store, /softDeleteDriveDocuments/));
check("migration performs soft delete, not physical delete", () => {
  assert.match(migration, /set status = 'DELETED'/);
  assert.doesNotMatch(migration, /delete from public\.drive_core_documents/);
});
check("migration audits document deletion", () => assert.match(migration, /DRIVE_DOCUMENT_DELETED/));
check("migration emits Drive change event", () => assert.match(migration, /DOCUMENT_DELETED/));
check("formally issued documents are protected", () => {
  assert.match(migration, /drive_core_document_issues/);
  assert.match(migration, /status = ''ISSUED''/);
  assert.match(migration, /blockedIds/);
});
check("grid supports externally shared selection", () => {
  assert.match(grid, /selectedDocumentIds\?: string\[\]/);
  assert.match(grid, /onSelectionChange/);
});
check("simple and engineering tables have selection checkboxes", () => {
  assert.ok((grid.match(/aria-label="Látható fájlok kijelölése"/g) || []).length >= 3);
  assert.ok((grid.match(/toggleDocumentSelection\(document\.id\)/g) || []).length >= 2);
});
check("review table keeps selection checkbox", () => assert.match(grid, /toggleDocumentSelection\(row\.document\.id\)/));
check("selection bar exposes delete action", () => {
  assert.match(grid, /fileSelectionBar/);
  assert.match(grid, /fileDeleteSelected/);
});
check("Commander supports selection without removing row drag", () => {
  assert.match(commander, /commanderSelect/);
  assert.match(commander, /draggable=\{canWrite && moveReady\}/);
  assert.match(commander, /onDragStart/);
});
check("Commander exposes bulk delete action", () => assert.match(commander, /commanderDeleteButton/));
check("main Drive shares selection across grid and Commander", () => {
  assert.match(main, /const \[selectedDocumentIds, setSelectedDocumentIds\]/);
  assert.ok((main.match(/selectedDocumentIds=\{selectedDocumentIds\}/g) || []).length >= 3);
});
check("Projectkapu Drive shares selection across grid and Commander", () => {
  assert.match(project, /const \[selectedDocumentIds, setSelectedDocumentIds\]/);
  assert.ok((project.match(/selectedDocumentIds=\{selectedDocumentIds\}/g) || []).length >= 3);
});
check("main Drive confirms soft delete", () => assert.match(main, /dokumentum lomtárba helyezése/));
check("Projectkapu Drive confirms soft delete", () => assert.match(project, /dokumentum lomtárba helyezése/));
check("details exposes generic display-name label", () => assert.match(details, /Egyedi megjelenítési név \/ tervlap neve/));
check("details stores displayName metadata", () => assert.match(details, /displayName: metadata\.planTitle/));
check("grid prefers displayName metadata", () => assert.match(grid, /extra\.displayName/));
check("selection and delete controls have dedicated CSS", () => {
  assert.match(css, /\.fileSelectionBar/);
  assert.match(css, /\.fileDeleteSelected/);
  assert.match(css, /\.commanderFileChecked/);
});
console.log(JSON.stringify({ total: pass, pass, fail: 0 }, null, 2));
