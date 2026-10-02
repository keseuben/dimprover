import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const read = (file) => fs.readFileSync(file, "utf8");
const routes = {
  folders: read("app/api/projects/[projectId]/drive/folders/route.ts"),
  documents: read("app/api/projects/[projectId]/drive/documents/route.ts"),
  move: read("app/api/projects/[projectId]/drive/documents/[documentId]/move/route.ts"),
  uploadInit: read("app/api/projects/[projectId]/drive/uploads/init/route.ts"),
  uploadObject: read("app/api/projects/[projectId]/drive/uploads/[uploadId]/object/route.ts"),
  uploadComplete: read("app/api/projects/[projectId]/drive/uploads/[uploadId]/complete/route.ts"),
};
const storage = read("app/lib/drive-core/storageService.ts");
const baseline = "c9aed9d5d9b930335251565b9caa5d3064aa969d";
let pass = 0;
const check = (label, fn) => { fn(); pass += 1; console.log(`PASS ${String(pass).padStart(2, "0")} ${label}`); };

check("folder create retains Project Core document.write gate", () => assert.match(routes.folders, /requireProjectPermission\(request, projectId, "document\.write"\)/));
check("child folder create rechecks parent folder ACL", () => assert.match(routes.folders, /requireDriveFolderAccess\(projectId, parentId, access\.access\)/));
check("document create retains Project Core document.write gate", () => assert.match(routes.documents, /requireProjectPermission\(request, projectId, "document\.write"\)/));
check("document create rechecks target folder ACL", () => assert.match(routes.documents, /requireDriveFolderAccess\(projectId, folderId, access\.access\)/));
check("document move checks source document visibility", () => assert.match(routes.move, /requireDriveDocumentAccess\(projectId, documentId, access\.access\)/));
check("document move checks target folder visibility", () => assert.match(routes.move, /requireDriveFolderAccess\(projectId, targetFolderId, access\.access\)/));
check("upload init passes Project Access context", () => assert.match(routes.uploadInit, /access: access\.access/));
check("browser upload passes Project Access context", () => assert.match(routes.uploadObject, /access: access\.access/));
check("upload complete passes Project Access context", () => assert.match(routes.uploadComplete, /access: access\.access/));
check("storage service requires ProjectAccessContext on upload init", () => assert.match(storage, /initDriveObjectUpload[\s\S]*?access: ProjectAccessContext/));
check("new document upload checks target folder before session creation", () => assert.match(storage, /uploadKind === "NEW_VERSION"[\s\S]*?requireDriveDocumentAccess\(input\.projectId, documentId, input\.access\)[\s\S]*?requireDriveFolderAccess\(input\.projectId, folderId, input\.access\)/));
check("upload proxy rechecks session ACL before object write", () => {
  const fn = storage.slice(storage.indexOf("export async function uploadDriveObjectThroughServer"), storage.indexOf("export async function completeDriveObjectUpload"));
  assert.ok(fn.indexOf("requireDriveUploadSessionAccess") >= 0);
  assert.ok(fn.indexOf("requireDriveUploadSessionAccess") < fn.indexOf("putDriveObjectStream"));
});
check("upload complete binds session to initiating actor", () => {
  const fn = storage.slice(storage.indexOf("export async function completeDriveObjectUpload"), storage.indexOf("export async function abortDriveObjectUpload"));
  assert.match(fn, /session\.createdBy !== input\.actorUserId/);
  assert.match(fn, /DRIVE_UPLOAD_ACTOR_MISMATCH/);
});
check("upload complete checks ACL before idempotent finalized response", () => {
  const fn = storage.slice(storage.indexOf("export async function completeDriveObjectUpload"), storage.indexOf("export async function abortDriveObjectUpload"));
  assert.ok(fn.indexOf("requireDriveUploadSessionAccess") >= 0);
  assert.ok(fn.indexOf("requireDriveUploadSessionAccess") < fn.indexOf("session.status === \"FINALIZED\""));
});
check("upload complete rechecks ACL immediately before finalize", () => {
  const fn = storage.slice(storage.indexOf("export async function completeDriveObjectUpload"), storage.indexOf("export async function abortDriveObjectUpload"));
  const first = fn.indexOf("requireDriveUploadSessionAccess");
  const second = fn.indexOf("requireDriveUploadSessionAccess", first + 1);
  const finalize = fn.indexOf("finalizeDriveUploadSessionRecord");
  assert.ok(first >= 0 && second > first && finalize > second);
});
check("upload access helper resolves NEW_VERSION by document server-side", () => assert.match(storage, /session\.uploadKind === "NEW_VERSION" && session\.documentId[\s\S]*?requireDriveDocumentAccess\(projectId, session\.documentId, access\)/));
check("upload access helper resolves NEW_DOCUMENT by folder", () => assert.match(storage, /if \(session\.folderId\)[\s\S]*?requireDriveFolderAccess\(projectId, session\.folderId, access\)/));
check("Phase 1B does not introduce password PIN or GROUP ACL", () => {
  const combined = Object.values(routes).join("\n") + storage;
  assert.doesNotMatch(combined, /principal_type[^\n]*GROUP|acl[^\n]*(password|\bpin\b)/i);
});
check("Developer Grid and Projectkapu sources remain untouched", () => {
  const output = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  const changed = output.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3));
  assert.equal(changed.some((file) => file.includes("developer-grid")), false);
  assert.equal(changed.some((file) => file.startsWith("components/project-gate/")), false);
});
check("Phase 1B continues from exact V0.7.7 baseline ancestry", () => {
  execFileSync("git", ["merge-base", "--is-ancestor", baseline, "HEAD"], { stdio: "ignore" });
});

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive V0.7.8 Folder ACL Mutation Recheck Phase 1B",
  pass,
  fail: 0,
  productionAccess: "DENY",
}, null, 2));
