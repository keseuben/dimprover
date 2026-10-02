import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const repo = read("app/lib/drive-core/workspaceRepository.ts");
const reviewRoute = read("app/api/projects/[projectId]/drive/review/bulk/route.ts");
const deleteRoute = read("app/api/projects/[projectId]/drive/documents/bulk-delete/route.ts");
const boxItemRoute = read("app/api/projects/[projectId]/drive/boxes/[boxId]/items/route.ts");
let pass = 0;
const check = (label, fn) => { fn(); pass += 1; console.log(`PASS ${String(pass).padStart(2, "0")} ${label}`); };

check("bulk review route passes Project Access context", () => assert.match(reviewRoute, /}, access\.access\);/));
check("bulk review repository accepts ProjectAccessContext", () => assert.match(repo, /bulkUpdateDriveReviewMetadata[\s\S]*?access: ProjectAccessContext/));
check("bulk review builds scope from ACL-filtered tree", () => assert.match(repo, /const tree = await listDriveTreeForAccess\(projectId, access\)/));
check("bulk review rejects hidden explicit document ids", () => assert.match(repo, /hiddenExplicitId[\s\S]*?requireDriveDocumentAccess\(projectId, hiddenExplicitId, access\)/));
check("bulk review rejects hidden folder scope", () => assert.match(repo, /visibleFolderIds[\s\S]*?requireDriveFolderAccess\(projectId, folderId, access\)/));
check("recursive bulk review walks only ACL-visible folders", () => {
  const fn = repo.slice(repo.indexOf("export async function bulkUpdateDriveReviewMetadata"), repo.indexOf("export async function upsertDriveEngineeringMetadata"));
  assert.match(fn, /for \(const folder of tree\.folders\)/);
  assert.doesNotMatch(fn, /client\.from\("drive_core_folders"\)/);
  assert.doesNotMatch(fn, /client\.from\("drive_core_documents"\)/);
});
check("bulk review selects documents only from ACL-visible tree", () => assert.match(repo, /for \(const document of tree\.documents\)[\s\S]*?targetIds\.add\(document\.id\)/));
check("bulk delete retains document.delete project permission", () => assert.match(deleteRoute, /requireProjectPermission\(request, projectId, "document\.delete"\)/));
check("bulk delete validates ids against ACL-filtered tree", () => assert.match(deleteRoute, /listDriveTreeForAccess\(projectId, access\.access\)/));
check("bulk delete denied id resolves through document access guard", () => assert.match(deleteRoute, /requireDriveDocumentAccess\(projectId, hiddenDocumentId, access\.access\)/));
check("Box item repository requires ProjectAccessContext", () => assert.match(repo, /addDriveBoxItem[\s\S]*?access: ProjectAccessContext/));
check("Box item checks document access before atomic insert", () => {
  const fn = repo.slice(repo.indexOf("export async function addDriveBoxItem"), repo.indexOf("export async function setDriveBoxLifecycle"));
  const guard = fn.indexOf("requireDriveDocumentAccess(projectId, documentId, access)");
  const rpc = fn.indexOf("drive_workspace_add_box_item_atomic");
  assert.ok(guard >= 0 && rpc > guard);
});
check("Box item route forwards Project Access context", () => assert.match(boxItemRoute, /addDriveBoxItem\(projectId, boxId, input, access\.actor\.userId, access\.access\)/));
check("no password PIN or GROUP ACL introduced", () => assert.doesNotMatch(repo + reviewRoute + deleteRoute + boxItemRoute, /acl[^\n]*(password|\bpin\b)|principal_type[^\n]*GROUP/i));

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive V0.7.10 Folder ACL bulk and Box mutation guards",
  pass,
  fail: 0,
  productionAccess: "DENY",
}, null, 2));
