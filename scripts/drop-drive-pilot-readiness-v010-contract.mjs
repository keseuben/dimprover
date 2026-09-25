#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const health = readFileSync("app/api/projects/[projectId]/drive/health/route.ts", "utf8");
const ui = readFileSync("components/project-gate/DriveWorkspace.tsx", "utf8");
let pass = 0;
const check = (name, fn) => { fn(); pass += 1; console.log(`PASS ${name}`); };

check("health includes DROP runtime", () => assert.match(health, /getDropRuntimeHealth/));
check("pilot readiness is fail-closed", () => {
  for (const marker of [
    "DROP_RUNTIME_UNAVAILABLE",
    "DROP_RELEASE_GATE_DISABLED",
    "DROP_DRIVE_INCOMING_FEATURE_DISABLED",
    "DROP_SUBMISSION_GATE_NOT_READY",
    "DROP_PUBLIC_UPLOAD_NOT_READY",
    "DROP_VIRUS_SCANNER_NOT_READY",
    "DROP_OBJECT_STORAGE_NOT_READY",
    "DRIVE_DOCUMENT_FLOW_SCHEMA_NOT_READY",
    "DRIVE_REVIEW_NOT_READY",
    "DRIVE_OBJECT_STORAGE_NOT_READY",
  ]) assert.match(health, new RegExp(marker));
});
check("pilot readiness requires zero blockers", () => assert.match(health, /dropDriveBlockers\.length === 0/));
check("feature flag is not mutated by health", () => assert.doesNotMatch(health, /process\.env\.DROP_DRIVE_INCOMING_ENABLED\s*=/));
check("API exposes pilot readiness object", () => assert.match(health, /dropDriveIncoming:\s*\{/));
check("API exposes blockers and next step", () => assert.match(health, /blockers:\s*dropDriveBlockers/) && assert.match(health, /nextStep:\s*dropDriveNextStep/));
check("Document Flow SQL remains first blocker guidance", () => assert.match(health, /!documentFlow\.ready[\s\S]*Document Flow 0\.1\.0 DEV SQL/));
check("UI models pilot readiness", () => assert.match(ui, /dropDriveIncoming\?:\s*\{/));
check("UI renders dedicated pilot card", () => assert.match(ui, /data-drop-drive-pilot-readiness="0\.1\.0"/));
check("UI shows blocker count", () => assert.match(ui, /blockers\?\.length/));
check("UI shows feature flag state", () => assert.match(ui, /featureEnabled \? "Feature aktív" : "Feature zárva"/));

console.log(JSON.stringify({ total: pass, pass, fail: 0 }, null, 2));
