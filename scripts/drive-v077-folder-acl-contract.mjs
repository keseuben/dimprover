#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const baseline = "0b27451764db0ec7106ed5b0142394662ab03f75";
const read = (file) => readFileSync(file, "utf8");
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

const migration = read("supabase/migrations/20261001_drive_folder_acl_v070.sql");
const schema = read("app/lib/drive-core/schema.ts");
const access = read("app/lib/drive-core/folderAccess.ts");
const repo = read("app/lib/drive-core/databaseRepository.ts");
const workspace = read("app/lib/drive-core/workspaceRepository.ts");
const storageRepo = read("app/lib/drive-core/storageRepository.ts");
const storageService = read("app/lib/drive-core/storageService.ts");
const store = read("app/lib/drive-core/store.ts");
const folderZip = read("app/lib/drive-core/folderDownloadService.ts");

const routes = {
  tree: read("app/api/projects/[projectId]/drive/tree/route.ts"),
  details: read("app/api/projects/[projectId]/drive/documents/[documentId]/details/route.ts"),
  preview: read("app/api/projects/[projectId]/drive/documents/[documentId]/preview/route.ts"),
  previewContent: read("app/api/projects/[projectId]/drive/documents/[documentId]/preview/content/route.ts"),
  download: read("app/api/projects/[projectId]/drive/documents/[documentId]/download/route.ts"),
  folderDownload: read("app/api/projects/[projectId]/drive/folders/[folderId]/download/route.ts"),
};

let pass = 0;
const check = (name, fn) => {
  fn();
  pass += 1;
  console.log("PASS " + name);
};

check("migration adds acl_inherit default true", () => {
  assert.match(migration, /add column if not exists acl_inherit boolean not null default true/i);
});
check("migration creates folder ACL table", () => {
  assert.match(migration, /create table if not exists public\.drive_core_folder_acl_entries/i);
});
check("Phase 1A principals are USER and ROLE only", () => {
  assert.match(migration, /principal_type in \('USER','ROLE'\)/);
  assert.doesNotMatch(migration, /principal_type[^\n]*GROUP/i);
});
check("USER principal uses project membership FK", () => {
  assert.match(migration, /membership_id text null references public\.project_core_memberships\(id\) on delete cascade/i);
  assert.match(access, /entry\.membershipId === access\.membership\.id/);
});
check("ROLE principal reuses ProjectMembershipRole", () => {
  assert.match(access, /ProjectMembershipRole/);
  for (const role of ["OWNER", "PROJECT_MANAGER", "CONTRIBUTOR", "REVIEWER", "VIEWER"]) {
    assert.match(migration, new RegExp(role));
  }
});
check("Phase 1A permission is folder.view only", () => {
  assert.match(migration, /permission text not null default 'folder\.view'/i);
  assert.match(migration, /permission = 'folder\.view'/i);
  assert.match(access, /DriveFolderAclPermission = "folder\.view"/);
});
check("Phase 1A has no password PIN or GROUP ACL layer", () => {
  assert.doesNotMatch(migration, /password|\bpin\b|principal_type[^\n]*GROUP/i);
  assert.doesNotMatch(access, /password|\bpin\b|"GROUP"/i);
});
check("ACL table is RLS protected and direct user roles revoked", () => {
  assert.match(migration, /alter table public\.drive_core_folder_acl_entries enable row level security/i);
  assert.match(migration, /revoke all on public\.drive_core_folder_acl_entries from anon, authenticated/i);
});
check("principal shape and unique effective principal indexes exist", () => {
  assert.match(migration, /drive_core_folder_acl_principal_shape_check/);
  assert.match(migration, /drive_core_folder_acl_user_permission_unique/);
  assert.match(migration, /drive_core_folder_acl_role_permission_unique/);
});
check("Drive Core schema marker current marker is 0.8.0 migration 5 while V070 migration remains historical", () => {
  assert.match(schema, /DRIVE_CORE_SCHEMA_VERSION = "0\.8\.0"/);
  assert.match(schema, /DRIVE_CORE_MIGRATION_COUNT = 5/);
  assert.match(schema, /drive-core-v080-revision-model-20261002/);
  assert.match(schema, /"drive_core_folder_acl_entries"/);
});
check("ACL only refines active project document.read access", () => {
  assert.match(access, /access\.membership\.status === "ACTIVE"/);
  assert.match(access, /access\.permissions\.includes\("document\.read"\)/);
  assert.match(access, /access\.project\.id === projectId/);
  assert.match(access, /access\.membership\.projectId === projectId/);
});
check("explicit override defaults DENY without matching ALLOW", () => {
  assert.match(access, /return matching\.some\(\(entry\) => entry\.effect === "ALLOW"\)/);
});
check("matching DENY takes precedence", () => {
  const deny = access.indexOf('matching.some((entry) => entry.effect === "DENY")');
  const allow = access.indexOf('matching.some((entry) => entry.effect === "ALLOW")');
  assert.ok(deny >= 0 && allow > deny);
});
check("parent hidden short-circuits child visibility", () => {
  assert.match(access, /parentVisible = evaluate\(parent\.id, visiting\)/);
  assert.match(access, /if \(!parentVisible\)[\s\S]*?memo\.set\(folderId, false\)[\s\S]*?return false/);
});
check("malformed hierarchy and cycles fail closed", () => {
  assert.match(access, /!folder \|\| visiting\.has\(folderId\)/);
  assert.match(access, /!parent \|\| parent\.projectId !== projectId/);
});
check("malformed acl_inherit does not widen access", () => {
  assert.match(repo, /aclInherit: row\.acl_inherit === true/);
});
check("direct folder denial maps to 404 not-found", () => {
  assert.match(access, /DRIVE_FOLDER_NOT_FOUND/);
  assert.match(access, /"A DRIVE mappa nem található\."/);
  assert.match(access, /DRIVE_FOLDER_NOT_FOUND",\s*404/);
});
check("direct document denial maps to 404 not-found", () => {
  assert.match(access, /DRIVE_DOCUMENT_NOT_FOUND/);
  assert.match(access, /"A DRIVE dokumentum nem található\."/);
  assert.match(access, /DRIVE_DOCUMENT_NOT_FOUND",\s*404/);
});
check("document access resolves containing folder server-side", () => {
  assert.match(access, /getDriveDocumentFolderAccessRecord\(projectId, documentId\)/);
  assert.match(repo, /select\("id,project_id,folder_id,status"\)/);
});
check("tree access path filters folders before serialization", () => {
  assert.match(repo, /folderRows[\s\S]*accessibleFolderIds\.has\(row\.id\)/);
});
check("tree filters documents by visible folder IDs", () => {
  assert.match(repo, /documentRows[\s\S]*visibleFolderIds\.has\(row\.folder_id\)/);
});
check("tree filters versions by visible document IDs", () => {
  assert.match(repo, /visibleDocumentIds\.has\(version\.documentId\)/);
});
check("tree summary uses visible-only values", () => {
  assert.match(repo, /folderCount: folders\.length/);
  assert.match(repo, /documentCount: documents\.length/);
  assert.match(repo, /versionCount: versions\.length/);
  assert.match(repo, /totalSizeBytes: versions\.reduce/);
});
check("tree route retains Project Core document.read gate", () => {
  assert.match(routes.tree, /requireProjectPermission\(request, projectId, "document\.read"\)/);
  assert.match(routes.tree, /listDriveTreeForAccess\(projectId, access\.access\)/);
});
check("details direct read is access-aware", () => {
  assert.match(routes.details, /requireProjectPermission\(request, projectId, "document\.read"\)/);
  assert.match(routes.details, /getDriveDocumentWorkspaceDetails\(projectId, documentId, access\.access\)/);
  assert.match(workspace, /requireDriveDocumentAccess\(projectId, documentId, access\)/);
});
check("preview URL minting is access-aware", () => {
  assert.match(routes.preview, /requireProjectPermission\(request, projectId, "document\.read"\)/);
  assert.match(routes.preview, /access: access\.access/);
  assert.match(storageService, /initDriveObjectPreview[\s\S]*access: ProjectAccessContext/);
});
check("preview content rechecks current access", () => {
  assert.match(routes.previewContent, /requireProjectPermission\(request, projectId, "document\.read"\)/);
  assert.match(routes.previewContent, /access: access\.access/);
  assert.match(storageService, /openDriveObjectPreviewContent[\s\S]*access: ProjectAccessContext/);
});
check("download signed access is access-aware", () => {
  assert.match(routes.download, /requireProjectPermission\(request, projectId, "document\.read"\)/);
  assert.match(routes.download, /access: access\.access/);
  assert.match(storageRepo, /requireDriveDocumentAccess\(input\.projectId, input\.documentId, input\.access\)/);
});
check("folder download requires root ACL and filtered tree", () => {
  assert.match(routes.folderDownload, /requireProjectPermission\(request, projectId, "document\.read"\)/);
  assert.match(routes.folderDownload, /access: access\.access/);
  assert.match(folderZip, /requireDriveFolderAccess\(input\.projectId, input\.folderId, input\.access\)/);
  assert.match(folderZip, /listDriveTreeForAccess\(input\.projectId, input\.access\)/);
});
check("folder ZIP register receives filtered tree only", () => {
  assert.match(folderZip, /folders: tree\.folders/);
  assert.match(folderZip, /const sourceDocuments = tree\.documents\.filter/);
  assert.doesNotMatch(folderZip.slice(folderZip.indexOf("export async function openDriveFolderZip"), folderZip.indexOf("function normalizeBoxArchiveBase")), /listDriveTree\(/);
});
check("secure ACL helpers are exported through Drive store", () => {
  for (const name of ["listDriveTreeForAccess", "requireDriveDocumentAccess", "requireDriveFolderAccess", "resolveAccessibleDriveFolderIds"]) {
    assert.match(store, new RegExp(name));
  }
});
check("migration gate exists with preflight apply verify and DEV guard", () => {
  assert.ok(existsSync("scripts/drive-folder-acl-v070-migration-gate.mjs"));
  const gate = read("scripts/drive-folder-acl-v070-migration-gate.mjs");
  assert.match(gate, /"preflight", "apply", "verify"/);
  assert.match(gate, /pbgyuznivqvestuksvif/);
  assert.match(gate, /PROD_TARGET_BLOCKED/);
  assert.match(gate, /DRIVE_FOLDER_ACL_V070_MIGRATION_APPROVED/);
  const migrationSha = sha256(migration);
  assert.match(gate, new RegExp('const expectedSha = "' + migrationSha + '";'));
});
check("Projectkapu and Developer Grid sources are untouched", () => {
  const committed = execFileSync("git", ["diff", "--name-only", baseline + "..HEAD"], { encoding: "utf8" });
  const working = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  const changed = [
    ...committed.split(/\r?\n/).filter(Boolean),
    ...working.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3)),
  ];
  assert.ok(changed.length > 0);
  assert.equal(changed.some((file) => file.startsWith("components/project-gate/")), false);
  assert.equal(changed.some((file) => file.includes("developer-grid")), false);
});
check("baseline is an ancestor of the current implementation HEAD", () => {
  execFileSync("git", ["merge-base", "--is-ancestor", baseline, "HEAD"], { stdio: "ignore" });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  assert.notEqual(head, baseline);
});

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive V0.7.7 Folder ACL Core Phase 1A",
  pass,
  fail: 0,
  productionAccess: "DENY",
}, null, 2));
