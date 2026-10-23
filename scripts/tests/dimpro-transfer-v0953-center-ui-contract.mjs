import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarizeTransferSecurity, TRANSFER_CORE_VERSION } from "../../app/lib/transfer-core/transferModel.ts";

assert.ok(["0.9.53", "0.9.54", "0.9.55", "0.9.56"].includes(TRANSFER_CORE_VERSION));
const phases = [
  "AWAITING_REVIEW", "SCANNING", "SCAN_PENDING", "INFECTED",
  "SCAN_FAILED", "STATUS_UNAVAILABLE", "CONFIRMATION_UNKNOWN", "QUEUED", "ERROR",
];
const tasks = phases.map((phase, index) => ({
  id: String(index), fileName: "test", folderName: "test",
  sizeBytes: 1, uploadedBytes: 0, phase, speedBps: null, error: null, updatedAt: 0,
}));
assert.deepEqual(summarizeTransferSecurity(tasks), {
  count: 9, clean: 1, available: 0, scanning: 1, pending: 1,
  infected: 1, scanFailed: 1, unknown: 2, notAssessed: 2,
});
assert.equal(summarizeTransferSecurity([]).notAssessed, 0);
assert.equal(summarizeTransferSecurity(tasks.filter(t => t.phase === "ERROR")).clean, 0);

const ui = readFileSync("components/drive/DriveTransferCenter.tsx", "utf8");
const css = readFileSync("components/drive/DriveTransferCenter.module.css", "utf8");
const workspace = readFileSync("components/drive/DriveWorkspace.tsx", "utf8");
const build = readFileSync("components/drive/driveBuildInfo.ts", "utf8");
assert.match(build, /DRIVE_DEVELOPMENT_VERSION = "0\.9\.(53|54|55|56)"/);
assert.match(ui, /summarizeTransferSecurity\(tasks\)/);
assert.match(ui, /aria-pressed=\{viewFilter === key\}/);
assert.match(ui, /role="group" aria-label="Átvitelek szűrése"/);
assert.match(ui, /aria-label="Vírusellenőrzési státuszok"/);
assert.match(ui, /Hálózati 100%|hálózati 100%/);
assert.match(ui, /projectName \|\| "Projekt Drive"/);
assert.match(workspace, /projectName=\{projectName\}/);
assert.match(css, /\.filters button\[aria-pressed="true"\]/);
assert.match(css, /\.securityCounts/);
console.log("DIMPRO Transfer Center V0.9.53 UI status/filter contract PASS");
