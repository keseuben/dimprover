import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const metadata = read("app/api/projects/[projectId]/drive/metadata/route.ts");
const flow = read("app/api/projects/[projectId]/drive/document-flow/route.ts");
let pass = 0;
const check = (label, fn) => { fn(); pass += 1; console.log(`PASS ${String(pass).padStart(2, "0")} ${label}`); };

check("metadata retains Project Core document.read gate", () => assert.match(metadata, /requireProjectPermission\(request, projectId, "document\.read"\)/));
check("metadata uses ACL-filtered Drive tree", () => assert.match(metadata, /listDriveTreeForAccess\(projectId, access\.access\)/));
check("metadata derives visible document id set", () => assert.match(metadata, /new Set\(tree\.documents\.map\(\(document\) => document\.id\)\)/));
check("metadata filters by documentId before response", () => {
  const filter = metadata.indexOf("metadata.filter((item) => visibleDocumentIds.has(item.documentId))");
  const response = metadata.indexOf("NextResponse.json", filter);
  assert.ok(filter >= 0 && response > filter);
});
check("document flow retains Project Core document.read gate", () => assert.match(flow, /requireProjectPermission\(request, projectId, "document\.read"\)/));
check("document flow uses ACL-filtered Drive tree", () => assert.match(flow, /listDriveTreeForAccess\(projectId, access\.access\)/));
check("document flow derives visible document id set", () => assert.match(flow, /new Set\(tree\.documents\.map\(\(document\) => document\.id\)\)/));
check("governance is filtered by visible documentId", () => assert.match(flow, /flow\.governance\.filter\(\(item\) => visibleDocumentIds\.has\(item\.documentId\)\)/));
check("issues are filtered by visible documentId", () => assert.match(flow, /flow\.issues\.filter\(\(item\) => visibleDocumentIds\.has\(item\.documentId\)\)/));
check("document flow serializes only filtered collections", () => {
  assert.match(flow, /NextResponse\.json\(\{ ok: true, governance, issues \}/);
  assert.doesNotMatch(flow, /NextResponse\.json\(\{ ok: true, \.\.\.flow \}/);
});
check("enumeration routes do not add password PIN or GROUP ACL", () => assert.doesNotMatch(metadata + flow, /acl[^\n]*(password|\bpin\b)|principal_type[^\n]*GROUP/i));

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive V0.7.9 Folder ACL enumeration filters",
  pass,
  fail: 0,
  productionAccess: "DENY",
}, null, 2));
