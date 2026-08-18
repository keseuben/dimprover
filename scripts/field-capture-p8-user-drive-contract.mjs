import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");
const service = read("app/lib/field-capture/userDriveService.ts");
const repo = read("app/lib/content-core/repository.ts");
const fieldRepo = read("app/lib/field-capture/serverRepository.ts");
const route = read("app/api/field-capture/sessions/[sessionId]/items/[itemId]/user-drive/route.ts");
const helper = read("app/lib/drop/archive/dropDriveObjectCopy.ts");
const archive = read("app/lib/drop/archive/dropDriveArchiveService.ts");
const health = read("app/api/field-capture/health/route.ts");
const migration = read("supabase/migrations/20260818183500_dimpro_content_core_user_drive_v010.sql");

const tests = [
  ["shared copy helper used by project archive and user drive", () => { assert.match(archive,/copyDropObjectToDriveVerified/); assert.match(service,/copyDropObjectToDriveVerified/); }],
  ["copy verifies size and optional SHA256", () => { assert.match(helper,/DROP_DRIVE_COPY_SIZE_MISMATCH/); assert.match(helper,/calculateDriveObjectSha256/); assert.match(helper,/DROP_DRIVE_COPY_SHA256_MISMATCH/); }],
  ["user drive requires server stored capture first", () => { assert.match(service,/context\.itemStatus !== "SERVER_STORED"/); assert.match(service,/context\.asset\.storageStatus !== "STORED"/); }],
  ["user drive requires clean Drop object", () => { assert.match(service,/dropFile\.security_status !== "clean"/); assert.match(service,/dropFile\.virus_scan_status !== "clean"/); assert.match(service,/FIELD_CAPTURE_USER_DRIVE_SCAN_PENDING/); }],
  ["content object key is content addressed", () => { assert.match(service,/content\/sha256\/\$\{hash\.slice\(0, 2\)\}\/\$\{hash\}-\$\{sizeBytes\}/); }],
  ["USER ownership is independent from PROJECT", () => { assert.match(migration,/owner_type text not null check/); assert.match(migration,/owner_user_id is not null and owner_project_id is null/); assert.match(migration,/owner_user_id is null and owner_project_id is not null/); assert.match(repo,/owner_type: "USER"/); assert.match(repo,/owner_project_id: null/); }],
  ["P8 user root has no fake project or folder", () => { assert.match(service,/scope: "USER_ROOT"/); assert.match(fieldRepo,/folder_id: null/); assert.doesNotMatch(service,/createDriveFolder/); assert.doesNotMatch(service,/projectId:/); }],
  ["independent retention is explicit", () => { assert.match(fieldRepo,/retained_independently: true/); assert.match(service,/retainedIndependently: true/); }],
  ["raw upload tokens are absent from user drive state", () => { assert.match(fieldRepo,/rawTokenPersisted: false/); assert.doesNotMatch(service,/uploadToken/); assert.doesNotMatch(repo,/uploadToken/); }],
  ["route is bearer-authenticated and session-owned", () => { assert.match(route,/authorizeFieldCaptureRequest/); assert.match(route,/assertFieldCaptureSessionOwner/); assert.match(route,/authorized\.context\.user\.id/); }],
  ["user drive destination must have USER ownership", () => { assert.match(fieldRepo,/FIELD_CAPTURE_USER_DRIVE_OWNERSHIP_INVALID/); assert.match(fieldRepo,/target", "USER_DRIVE"/); }],
  ["user drive sync state is explicit", () => { assert.match(fieldRepo,/operation: "SYNC_USER_DRIVE"/); assert.match(fieldRepo,/event_type: "USER_DRIVE_STORED"/); assert.match(fieldRepo,/driveSynced: true/); }],
  ["health reports P8 readiness without enabling project drive", () => { assert.match(health,/getFieldCaptureUserDriveReadiness/); assert.match(health,/userDriveBinding: schema\.ready && upload\.ready && userDrive\.ready/); assert.match(health,/projectDriveBinding: false/); }],
  ["content tables remain service-role only", () => { assert.match(migration,/revoke all on table public\.dimpro_content_objects from authenticated/); assert.match(migration,/grant all on table public\.dimpro_content_objects to service_role/); }],
];
let passed=0;
for (const [name,fn] of tests) { try { fn(); passed++; console.log(`PASS ${passed}: ${name}`); } catch (e) { console.error(`FAIL: ${name}`); throw e; } }
console.log(`FIELD_CAPTURE_P8_USER_DRIVE_CONTRACT ${passed}/${tests.length} PASS`);
