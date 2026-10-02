import assert from "node:assert/strict";
import fs from "node:fs";

const toolbar = fs.readFileSync("components/drive/DriveToolbar.tsx", "utf8");
const workspace = fs.readFileSync("components/drive/DriveWorkspace.tsx", "utf8");
const css = fs.readFileSync("components/drive/DriveWorkspace.module.css", "utf8");
let pass = 0;
const check = (label, fn) => { fn(); pass += 1; console.log(`PASS ${String(pass).padStart(2, "0")} ${label}`); };

check("toolbar exposes dedicated new version action", () => {
  assert.match(toolbar, /canUploadSelectedVersion/);
  assert.match(toolbar, /onUploadSelectedVersion/);
  assert.match(toolbar, />Új verzió</);
});
check("toolbar exposes dedicated new revision action", () => {
  assert.match(toolbar, /canUploadSelectedRevision/);
  assert.match(toolbar, /onUploadSelectedRevision/);
  assert.match(toolbar, />Új revízió</);
});
check("new version requires selected current document and writable storage", () => assert.match(workspace, /canUploadSelectedVersion=\{Boolean\(canWrite && selectedDocument\?\.currentVersion && health\?\.storage\?\.realObjectWriteEnabled\)\}/));
check("new revision requires selected current document and writable storage", () => assert.match(workspace, /canUploadSelectedRevision=\{Boolean\(canWrite && selectedDocument\?\.currentVersion && health\?\.storage\?\.realObjectWriteEnabled\)\}/));
check("new version uses selected document upload endpoint", () => assert.match(workspace, /documentId: document\.id[\s\S]*?expectedCurrentVersion: currentVersion\.versionNumber[\s\S]*?versionKind/));
check("normal version is explicitly VERSION", () => assert.match(workspace, /uploadSelectedDocumentFile\(file, "VERSION"\)/));
check("official revision is explicitly REVISION", () => assert.match(workspace, /uploadSelectedDocumentFile\(revisionFile, "REVISION"/));
check("revision requires reason", () => assert.match(workspace, /versionKind === "REVISION" && !reason/));
check("revision requires ISO date", () => assert.match(workspace, /versionKind === "REVISION" && !\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//));
check("revision request sends revision reason and date", () => {
  assert.match(workspace, /revisionReason: versionKind === "REVISION" \? reason : ""/);
  assert.match(workspace, /revisionDate: versionKind === "REVISION" \? date : ""/);
});
check("version and revision require same extension as stable document", () => assert.match(workspace, /extension !== document\.extension\.toLowerCase\(\)/));
check("upload uses optimistic expectedCurrentVersion guard", () => assert.match(workspace, /expectedCurrentVersion: currentVersion\.versionNumber/));
check("failed client upload aborts upload session", () => assert.match(workspace, /Web Drive verzió\/revízió feltöltés megszakadt/));
check("revision modal shows current V and R", () => assert.match(workspace, /Jelenlegi állapot[\s\S]*?currentVersion\.versionNumber[\s\S]*?currentVersion\.revisionCode/));
check("revision modal previews incremented V and R", () => assert.match(workspace, /Létrejövő állapot[\s\S]*?currentVersion\.versionNumber \+ 1[\s\S]*?currentVersion\.revisionNumber \+ 1/));
check("revision modal has required reason textarea", () => assert.match(workspace, /Revízió oka[\s\S]*?<textarea[\s\S]*?required[\s\S]*?maxLength=\{1000\}/));
check("revision modal has required date input", () => assert.match(workspace, /Revízió dátuma[\s\S]*?<input type="date" required/));
check("revision modal has file picker constrained to document extension", () => assert.match(workspace, /Új revízió fájlja[\s\S]*?accept=\{selectedDocument\.extension/));
check("revision modal keeps formal issue status NOT_ISSUED", () => assert.match(workspace, /Kiadási státusz: NOT_ISSUED/));
check("revision modal explains formal issue is separate Document Flow action", () => assert.match(workspace, /ISSUED \/ KIADOTT[\s\S]*?Document Flow kiadási művelet/));
check("revision upload UI does not fake business status mutation", () => assert.doesNotMatch(workspace, /businessStatus\s*:\s*"KIADOTT"|issueStatus\s*:\s*"ISSUED"/));
check("revision modal has dedicated summary styling", () => assert.match(css, /\.revisionUploadSummary/));
check("revision modal has dedicated issue-status hint styling", () => assert.match(css, /\.revisionIssueHint/));

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive V0.8.1 version and revision upload UI",
  pass,
  fail: 0,
  productionAccess: "DENY",
}, null, 2));
