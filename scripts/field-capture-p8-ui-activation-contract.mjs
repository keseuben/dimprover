import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const targets = read("components/field-capture/CaptureSaveTargets.tsx");
const router = read("app/lib/field-capture/destinationRouter.ts");
const sync = read("app/lib/field-capture/clientSyncService.ts");
const health = read("app/api/field-capture/health/route.ts");
const flags = read("app/lib/field-capture/featureFlags.ts");
const types = read("app/lib/field-capture/types.ts");
const finalize = read("app/lib/field-capture/captureFinalizeService.ts");

const userStart = targets.indexOf('title="Saját DIMPRO Drive"');
const projectStart = targets.indexOf('title="Projektkapu Drive"');
assert.ok(userStart >= 0 && projectStart > userStart, "Drive cél sorok hiányoznak");
const userRow = targets.slice(userStart, projectStart);
const projectRow = targets.slice(projectStart);

const tests = [
  ["P8 Saját Drive toggle enabled", () => { assert.doesNotMatch(userRow, /disabled/); assert.match(userRow, /badge="P8 aktív"/); }],
  ["P8 Saját Drive remains explicit opt-in", () => { assert.match(types, /saveToUserDrive: false/); assert.match(userRow, /checked=\{value\.saveToUserDrive\}/); }],
  ["P8 UI explains USER ownership and server-side safety gate", () => { assert.match(userRow, /USER ownership/); assert.match(userRow, /biztonsági ellenőrzés/); }],
  ["P8 destination router is ready", () => { assert.match(router, /target: "USER_DRIVE"[\s\S]*?ready: true[\s\S]*?P8 aktív/); }],
  ["P8 client sync calls user-drive only after reconcile", () => { const reconcile=sync.indexOf('/upload/reconcile'); const user=sync.indexOf('/user-drive'); assert.ok(reconcile >= 0 && user > reconcile); }],
  ["P8 scan-pending state remains retryable", () => { assert.match(sync, /FIELD_CAPTURE_USER_DRIVE_SCAN_PENDING/); assert.match(sync, /status: "DESTINATION_PENDING"/); }],
  ["P8 finalize requires Drive completion when requested", () => { assert.match(finalize, /if \(item\.options\.saveToUserDrive\) return item\.status !== "SYNCED"/); }],
  ["P8 health remains backend-readiness gated", () => { assert.match(health, /userDriveBinding: schema\.ready && upload\.ready && userDrive\.ready/); }],
  ["Projectkapu P9 stays disabled", () => { assert.match(projectRow, /disabled badge="P9"/); assert.match(health, /projectDriveBinding: false/); assert.doesNotMatch(sync, /\/project-drive/); }],
  ["Terep health phase reports P0-P8", () => { assert.match(flags, /phase: "P0-P8"/); }],
  ["F3 increments client version", () => { assert.match(types, /FIELD_CAPTURE_VERSION = "0\.4\.1-dev"/); }],
  ["Drive lifecycle text is no longer future tense", () => { assert.doesNotMatch(targets, /külön referenciát kapnak majd/); assert.match(targets, /független megőrzést kap/); }],
];

let passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed += 1; console.log(`PASS ${passed}: ${name}`); }
  catch (error) { console.error(`FAIL: ${name}`); throw error; }
}
console.log(`FIELD_CAPTURE_P8_UI_ACTIVATION_CONTRACT ${passed}/${tests.length} PASS`);
