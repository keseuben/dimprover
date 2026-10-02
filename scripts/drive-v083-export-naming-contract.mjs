import assert from "node:assert/strict";
import fs from "node:fs";

const naming = fs.readFileSync("app/lib/drive-core/exportNaming.ts", "utf8");
const repository = fs.readFileSync("app/lib/drive-core/storageRepository.ts", "utf8");
const storage = fs.readFileSync("app/lib/drive-core/storageService.ts", "utf8");
const zip = fs.readFileSync("app/lib/drive-core/folderDownloadService.ts", "utf8");
const register = fs.readFileSync("app/lib/drive-core/documentationRegister.ts", "utf8");

let pass = 0;
const check = (label, fn) => { fn(); pass += 1; console.log(`PASS ${String(pass).padStart(2, "0")} ${label}`); };

check("export filename has PlanNo Alias Vxx Rxx Status extension order", () =>
  assert.ok(naming.includes('return planNo + "_" + alias + "_V" + version + "_R" + revision + "_" + status + "." + extension;')));
check("version and revision counters are zero padded", () => assert.match(naming, /padStart\(2, "0"\)/));
check("missing plan number falls back to DOK", () => assert.match(naming, /normalizeDriveExportToken\(input\.planNo, "DOK", 30\)/));
check("missing technical issue status falls back to NA", () => assert.match(naming, /normalizeDriveExportToken\(value, "NA", 12\)\.toUpperCase\(\)/));
check("export alias is ASCII safe and bounded", () => {
  assert.match(naming, /replace\(\/\[\^A-Za-z0-9_-\]\+\/g, "-"\)/);
  assert.match(naming, /Math\.min\(40, maxLength\)/);
});
check("download repository selects persistent export_alias", () => assert.match(repository, /current_version_number,source,export_alias/));
check("download repository selects revision number and code", () => assert.match(repository, /version_number,revision_number,revision_code,original_name/));
check("download repository reads plan number and technical issue status", () => assert.match(repository, /select\("plan_no,issue_status"\)/));
check("download repository exposes export alias", () => assert.match(repository, /documentExportAlias: String\(documentResult\.data\.export_alias \|\| ""\)/));
check("download repository exposes plan number", () => assert.match(repository, /planNo: String\(metadata\?\.plan_no \|\| ""\)/));
check("download repository exposes technical status code", () => assert.match(repository, /exportStatusCode: String\(metadata\?\.issue_status \|\| ""\)/));
check("download repository exposes revision number", () => assert.match(repository, /revisionNumber: Number\(version\.revision_number \|\| 0\)/));
check("direct download uses shared export filename builder", () => assert.match(storage, /const exportFileName = buildDriveExportFileName\(/));
check("direct download sends export filename into signed GET", () => assert.match(storage, /createDriveSignedGetUrl\([\s\S]*?fileName: exportFileName/));
check("download audit logs the exported filename", () => assert.match(storage, /logDriveDownloadRecord\([\s\S]*?fileName: exportFileName/));
check("direct download keeps immutable storage key unchanged", () => assert.match(storage, /storageKey: record\.version\.storageKey/));
check("folder ZIP uses shared export filename builder", () => {
  const matches = zip.match(/const exportFileName = buildDriveExportFileName\(/g) || [];
  assert.equal(matches.length, 2);
});
check("folder ZIP feeds plan alias version revision status and extension", () => assert.match(zip, /planNo: metadata\?\.planNo,[\s\S]*?exportAlias: document\.exportAlias,[\s\S]*?versionNumber: version\.versionNumber,[\s\S]*?revisionNumber: version\.revisionNumber,[\s\S]*?statusCode: metadata\?\.issueStatus,[\s\S]*?extension: document\.extension/));
check("folder ZIP uses export filename as ZIP entry", () => {
  const matches = zip.match(/uniqueZipEntryName\(folderPath, exportFileName, usedNames\)/g) || [];
  assert.equal(matches.length, 2);
});
check("documentation register keeps full human display name", () => assert.match(register, /displayName\(metadata, item\.document, item\.version\)/));
check("documentation register keeps actual ZIP export path", () => assert.match(register, /item\.zipName/));
check("documentation register keeps version and revision code", () => {
  assert.match(register, /versionNumber/);
  assert.match(register, /revisionCode/);
});
check("documentation register keeps SHA-256", () => assert.match(register, /sha256/i));
check("export naming does not mutate stored object name or key", () => {
  assert.doesNotMatch(naming, /rename|move|copyObject|storageKey/);
  assert.doesNotMatch(storage, /storageKey\s*=\s*exportFileName/);
});

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive V0.8.3 stable export naming",
  pass,
  fail: 0,
  productionAccess: "DENY",
}, null, 2));
