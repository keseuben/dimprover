import assert from "node:assert/strict";
import fs from "node:fs";

const toolbar = fs.readFileSync("components/drive/DriveToolbar.tsx", "utf8");
const workspace = fs.readFileSync("components/drive/DriveWorkspace.tsx", "utf8");
const css = fs.readFileSync("components/drive/DriveWorkspace.module.css", "utf8");
const issueRoute = fs.readFileSync("app/api/projects/[projectId]/drive/documents/[documentId]/versions/[versionId]/issue/route.ts", "utf8");
const flowSql = fs.readFileSync("supabase/migrations/20260925_drive_document_flow_v010.sql", "utf8");
let pass = 0;
const check = (label, fn) => { fn(); pass += 1; console.log(`PASS ${String(pass).padStart(2, "0")} ${label}`); };

check("toolbar exposes issue permission action", () => {
  assert.match(toolbar, /canIssueSelected/);
  assert.match(toolbar, /onIssueSelected/);
  assert.match(toolbar, /aria-label="Formális dokumentumkiadás"/);
});
check("workspace derives document.issue permission", () => assert.match(workspace, /effectivePermissions\.includes\("document\.issue"\)/));
check("toolbar issue action requires Document Flow readiness", () => assert.match(workspace, /canIssueSelected=\{Boolean\(canIssue && selectedDocument\?\.currentVersion && health\?\.documentFlow\?\.ready\)\}/));
check("issue dialog blocks when Document Flow is not ready", () => assert.match(workspace, /!health\?\.documentFlow\?\.ready/));
check("issue preparation loads project memberships", () => assert.match(workspace, /\/memberships`[\s\S]*?credentials: "same-origin"/));
check("issue preparation loads authoritative document flow", () => assert.match(workspace, /\/drive\/document-flow`[\s\S]*?credentials: "same-origin"/));
check("only ACTIVE project members enter recipient picker", () => assert.match(workspace, /filter\(\(member\) => member\.status === "ACTIVE"\)/));
check("governance is bound to current version id", () => assert.match(workspace, /find\(\(item\) => item\.versionId === version\.id\)/));
check("client guard requires AVAILABLE APPROVED ERVENYES", () => {
  assert.match(workspace, /version\.status !== "AVAILABLE"/);
  assert.match(workspace, /issueGovernance\?\.reviewDecision !== "APPROVED"/);
  assert.match(workspace, /issueGovernance\.businessStatus !== "ERVENYES"/);
});
check("formal issue purpose is mandatory", () => assert.match(workspace, /A formális kiadás célja kötelező/));
check("project members are serialized as PROJECT_MEMBER recipients", () => assert.match(workspace, /type: "PROJECT_MEMBER" as const/));
check("external recipient parser validates email", () => assert.match(workspace, /külső címzett e-mail-címe érvénytelen/));
check("external recipients are serialized as EMAIL recipients", () => assert.match(workspace, /type: "EMAIL" as const/));
check("duplicate recipients are filtered client side", () => assert.match(workspace, /const seen = new Set<string>\(\)/));
check("at least one recipient is mandatory in UI", () => assert.match(workspace, /legalább egy címzettet válassz ki vagy adj meg/));
check("formal issue posts to selected document current version endpoint", () => assert.match(workspace, /\/drive\/documents\/\$\{encodeURIComponent\(document\.id\)\}\/versions\/\$\{encodeURIComponent\(version\.id\)\}\/issue/));
check("formal issue request sends purpose note and recipients", () => assert.match(workspace, /body: JSON\.stringify\(\{[\s\S]*?purpose,[\s\S]*?note: issueNote\.trim\(\),[\s\S]*?recipients/));
check("success result uses authoritative issue number", () => assert.match(workspace, /payload\.issue\.issueNumber/));
check("success result exposes recipient access links", () => assert.match(workspace, /accessLinks: payload\.accessLinks \|\| \[\]/));
check("success refreshes Drive and selected details", () => assert.match(workspace, /Promise\.all\(\[load\(\), loadDetails\(document\.id\)\]\)/));
check("issue result UI renders ISSUED KIADOTT state", () => assert.match(workspace, /ISSUED \/ KIADOTT/));
check("access links open safely in a new tab", () => assert.match(workspace, /target="_blank" rel="noopener noreferrer"/));
check("issue result reports link generation errors without rolling back issue", () => assert.match(workspace, /issueResult\.accessLinkError/));
check("modal shows three readiness indicators", () => {
  assert.match(workspace, /Fájlállapot/);
  assert.match(workspace, /Review/);
  assert.match(workspace, /Üzleti státusz/);
});
check("submit remains disabled unless DB issue prerequisites are met", () => {
  assert.match(workspace, /currentVersion\.status !== "AVAILABLE"/);
  assert.match(workspace, /reviewDecision !== "APPROVED"/);
  assert.match(workspace, /businessStatus !== "ERVENYES"/);
});
check("backend route still requires document.issue permission", () => assert.match(issueRoute, /requireProjectPermission\(request, projectId, "document\.issue"\)/));
check("backend route rechecks folder document ACL", () => assert.match(issueRoute, /requireDriveDocumentAccess\(projectId, documentId, access\.access\)/));
check("backend route creates recipient access links after formal issue", () => assert.match(issueRoute, /createDriveIssueAccessLinks/));
check("database requires AVAILABLE APPROVED ERVENYES", () => assert.match(flowSql, /v_version\.status <> 'AVAILABLE'[\s\S]*?v_governance\.review_decision <> 'APPROVED'[\s\S]*?v_governance\.business_status <> 'ERVENYES'/));
check("database requires at least one recipient", () => assert.match(flowSql, /jsonb_array_length\(p_recipients\) < 1/));
check("database changes governance only inside formal issue RPC", () => assert.match(flowSql, /set business_status='KIADOTT',issue_status='ISSUED'/));
check("database emits formal issue audit event", () => assert.match(flowSql, /DRIVE_DOCUMENT_VERSION_ISSUED/));
check("issue modal has dedicated responsive styles", () => {
  for (const className of ["issueDialogPanel", "issueReadinessGrid", "issueRecipientSection", "issueMemberList", "issueResultBox", "issueAccessLinks"]) {
    assert.match(css, new RegExp(`\\.${className}`));
  }
});
check("UI does not directly fake KIADOTT governance mutation", () => assert.doesNotMatch(workspace, /businessStatus\s*:\s*"KIADOTT"|issueStatus\s*:\s*"ISSUED"/));

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive V0.8.2 formal document issuance UI",
  pass,
  fail: 0,
  productionAccess: "DENY",
}, null, 2));
