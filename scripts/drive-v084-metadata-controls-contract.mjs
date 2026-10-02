import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const sql = read("supabase/migrations/20261002_drive_metadata_controls_v084.sql");
const gate = read("scripts/drive-metadata-controls-v084-migration-gate.mjs");
const schema = read("app/lib/drive-core/schema.ts");
const types = read("app/lib/drive-core/types.ts");
const options = read("app/lib/drive-core/metadataOptions.ts");
const repo = read("app/lib/drive-core/databaseRepository.ts");
const settingsRoute = read("app/api/projects/[projectId]/drive/settings/route.ts");
const numberingRoute = read("app/api/projects/[projectId]/drive/documents/[documentId]/versions/[versionId]/numbering/route.ts");
const grid = read("components/drive/FileGridPanel.tsx");
const details = read("components/drive/DetailsPanel.tsx");
const workspace = read("components/drive/DriveWorkspace.tsx");
const css = read("components/drive/DriveWorkspace.module.css");

let pass = 0;
const check = (label, fn) => {
  fn();
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2, "0")} ${label}`);
};

check("Current Drive Core schema retains V084 and has advanced to 0.8.6", () => assert.match(schema, /DRIVE_CORE_SCHEMA_VERSION = "0\.8\.6"/));
check("Current Drive Core migration count is 7", () => assert.match(schema, /DRIVE_CORE_MIGRATION_COUNT = 7/));
check("V084 migration preserves its metadata-controls bootstrap marker", () => assert.match(sql, /drive-core-v084-metadata-controls-20261002/));
check("schema readiness includes project settings and numbering audit columns", () => {
  assert.match(schema, /drive_core_project_settings/);
  for (const field of ["numbering_origin","numbering_correction_reason","numbering_corrected_by","numbering_corrected_at"]) assert.match(schema, new RegExp(field));
});
check("V084 migration requires V080 predecessor", () => assert.match(sql, /0\.8\.0[\s\S]*?migration_count\s*=\s*5[\s\S]*?drive-core-v080-revision-model-20261002/));
check("numbering origin has SYSTEM IMPORTED CORRECTED constraint", () => assert.match(sql, /numbering_origin in \('SYSTEM','IMPORTED','CORRECTED'\)/));
check("project settings table stores JSON option lists", () => {
  assert.match(sql, /create table if not exists public\.drive_core_project_settings/);
  assert.match(sql, /metadata_options jsonb/);
});
check("project settings enable RLS", () => assert.match(sql, /alter table public\.drive_core_project_settings enable row level security/));
check("numbering correction RPC supports IMPORT and CORRECT", () => assert.match(sql, /v_mode not in \('IMPORT','CORRECT'\)/));
check("CORRECT requires a reason", () => assert.match(sql, /v_mode = 'CORRECT' and v_reason = ''[\s\S]*?DRIVE_NUMBERING_CORRECTION_REASON_REQUIRED/));
check("IMPORT is limited to a single INITIAL version", () => assert.match(sql, /v_mode = 'IMPORT'[\s\S]*?v_version_count <> 1 or v_version\.version_kind <> 'INITIAL'/));
check("issued version numbering is locked", () => assert.match(sql, /issue_status=''ISSUED''[\s\S]*?DRIVE_NUMBERING_ISSUED_VERSION_LOCKED/));
check("active upload conflicts block numbering changes", () => assert.match(sql, /status = 'INITIATED'[\s\S]*?DRIVE_NUMBERING_ACTIVE_UPLOAD_CONFLICT/));
check("numbering updates document current version number atomically", () => assert.match(sql, /update public\.drive_core_documents[\s\S]*?current_version_number = p_version_number/));
check("numbering operations write project audit events", () => {
  assert.match(sql, /DRIVE_DOCUMENT_NUMBERING_IMPORTED/);
  assert.match(sql, /DRIVE_DOCUMENT_NUMBERING_CORRECTED/);
});
check("settings updates write an audit event", () => assert.match(sql, /DRIVE_PROJECT_METADATA_OPTIONS_UPDATED/));
check("core types expose numbering origin and audit fields", () => {
  assert.match(types, /DriveNumberingOrigin = "SYSTEM" \| "IMPORTED" \| "CORRECTED"/);
  for (const field of ["numberingOrigin","numberingCorrectionReason","numberingCorrectedBy","numberingCorrectedAt"]) assert.match(types, new RegExp(field));
});
check("default metadata options include required configurable lists", () => {
  for (const key of ["discipline","documentType","issueStatus","approvalStatus","building","level","zone","topic"]) assert.match(options, new RegExp(key + ":"));
});
check("metadata option normalization bounds and deduplicates lists", () => {
  assert.match(options, /slice\(0, 50\)/);
  assert.match(options, /slice\(0, 120\)/);
  assert.match(options, /seen\.has/);
});
check("settings GET requires project read", () => assert.match(settingsRoute, /requireProjectPermission\(request, projectId, "project\.read"\)/));
check("settings PATCH requires project update", () => assert.match(settingsRoute, /requireProjectPermission\(request, projectId, "project\.update"\)/));
check("numbering PATCH requires document write", () => assert.match(numberingRoute, /requireProjectPermission\(request, projectId, "document\.write"\)/));
check("numbering CORRECT additionally requires document approve", () => assert.match(numberingRoute, /mode === "CORRECT"[\s\S]*?requireProjectPermission\(request, projectId, "document\.approve"\)/));
check("numbering route rechecks document ACL", () => assert.match(numberingRoute, /requireDriveDocumentAccess\(projectId, documentId, writeAccess\.access\)/));
check("repository uses audited numbering RPC", () => assert.match(repo, /rpc\("drive_core_update_version_numbering_atomic"/));
check("repository uses project settings RPC", () => assert.match(repo, /rpc\("drive_core_upsert_project_settings_atomic"/));
check("simple view has no full-row file-state coloring", () => {
  assert.doesNotMatch(grid, /simpleRowStatusClass/);
  for (const className of ["rowSimpleAvailable","rowSimpleQuarantine","rowSimpleRejected","rowSimpleProcessing"]) {
    assert.doesNotMatch(grid, new RegExp(`styles\\.${className}`));
    assert.doesNotMatch(css, new RegExp(`\\.${className} td`));
  }
});
check("simple view keeps color in the status badge", () => {
  assert.match(grid, /styles\.statusBadge/);
  assert.match(grid, /styles\.statusAvailable/);
  assert.match(grid, /styles\.statusQuarantine/);
});
check("engineering revision and version cells are clickable", () => {
  const matches = grid.match(/openDetail\(document, "numbering"\)/g) || [];
  assert.ok(matches.length >= 3);
  assert.match(grid, /SortableResizableHeader label="Revízió"/);
  assert.match(grid, /SortableResizableHeader label="Verzió"/);
});
check("engineering display uses Rxx and Vxx helpers", () => {
  assert.match(grid, /function revisionLabel/);
  assert.match(grid, /function versionLabel/);
  assert.match(grid, /padStart\(2, "0"\)/);
});
check("numbering text distinguishes SYSTEM IMPORTED CORRECTED", () => {
  assert.match(grid, /numberingSystem/);
  assert.match(grid, /numberingImported/);
  assert.match(grid, /numberingCorrected/);
  assert.match(css, /\.numberingSystem/);
  assert.match(css, /\.numberingImported/);
  assert.match(css, /\.numberingCorrected/);
});
check("details panel has dedicated version and revision editor", () => {
  assert.match(details, /id="drive-numbering-editor"/);
  assert.match(details, /Verzió és revízió/);
  assert.match(details, /Hozott számozás beállítása/);
  assert.match(details, /Számozás korrekciója/);
});
check("system generated V and R selectors are bounded", () => {
  assert.match(details, /length: 99/);
  assert.match(details, /length: 100/);
});
check("correction reason is mandatory in UI", () => assert.match(details, /numberingMode === "CORRECT" && !numberingReason\.trim\(\)/));
check("legacy free-text revision field is not rendered in metadata list", () => assert.doesNotMatch(details, /\["revision", "Revízió"\]/));
check("configurable metadata fields render as select controls", () => {
  assert.match(details, /metadataOptionKeys\.map/);
  assert.match(details, /<select[\s\S]*?drive-meta-/);
});
check("details panel has Listák configuration tab", () => {
  assert.match(details, />Listák<\/button>/);
  assert.match(details, /Projekt metaadat-listák/);
  assert.match(details, /Alaplista visszaállítása/);
});
check("workspace loads project settings with Drive data", () => assert.match(workspace, /\/drive\/settings/));
check("workspace persists numbering through numbering API", () => assert.match(workspace, /\/numbering`/));
check("workspace focuses numbering editor from table cell", () => assert.match(workspace, /field === "numbering"/));
check("migration gate locks the exact migration sha", () => assert.match(gate, /e6be6ad1c9f80e1230d50694995b2f9f248ed839d1180d89a19d7df90b86ee80/));
check("migration gate requires explicit DEV approval", () => assert.match(gate, /DEV_ONLY_DRIVE_METADATA_CONTROLS_V084_APPLY_APPROVED/));
check("migration gate creates and verifies backup before apply", () => {
  assert.match(gate, /pg_dump/);
  assert.match(gate, /pg_restore/);
  assert.match(gate, /BACKUP_VERIFY_FAILED/);
});
check("migration remains DEV-only and fail-closed", () => {
  assert.match(gate, /productionAccess: "DENY"/);
  assert.match(gate, /PROD_TARGET_BLOCKED/);
});
console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive V0.8.4 metadata controls and numbering origin",
  pass,
  fail: 0,
  productionAccess: "DENY",
}, null, 2));
