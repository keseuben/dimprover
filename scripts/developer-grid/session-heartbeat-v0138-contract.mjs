import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const pkg = JSON.parse(read("desktop/benjadmin-developer-grid/package.json"));
const types = read("app/lib/developer-grid/types.ts");
const heartbeat = read("app/lib/developer-grid/session-heartbeat.ts");
const route = read("app/api/dev/grid/session-heartbeat/route.ts");
const client = read("desktop/benjadmin-developer-grid/src/context-workspace/context-workspace-client.cjs");
const main = read("desktop/benjadmin-developer-grid/src/main.cjs");
const live = read("desktop/benjadmin-developer-grid/src/live/benjadmin-live-client.cjs");
const work = read("app/lib/developer-grid/work-start.ts");
const ui = read("desktop/benjadmin-developer-grid/src/renderer/context-workspace.js");

let n = 0;
function check(label, fn) { fn(); n += 1; console.log(`PASS ${String(n).padStart(2,"0")} ${label}`); }

check("package version v0.1.38", () => assert.equal(pkg.version, "0.1.38"));
check("backend version v0.1.38-dev", () => assert.match(types, /DEVELOPER_GRID_VERSION = "0\.1\.38-dev"/));
check("heartbeat route is paired-device protected", () => assert.match(route, /isChatGridDeviceAuthorized\(request\.headers\)/));
check("heartbeat route remains DEV only and PROD DENY", () => {
  assert.match(route, /"x-dimpro-environment": "DEV"/);
  assert.match(route, /"x-dimpro-production-access": "DENY"/);
});
check("heartbeat accepts only RUNNING or REVIEW grid task", () => assert.match(heartbeat, /\["RUNNING", "REVIEW"\]\.includes\(state\.task\.status\)/));
check("heartbeat requires exact active grid session identity", () => assert.match(heartbeat, /item\.id === sessionId && item\.taskId === taskId && item\.workerCode === worker && item\.endedAt === null/));
check("heartbeat requires VALIDATED BOOT ACK and codingAllowed", () => {
  assert.match(heartbeat, /bootAckState !== "VALIDATED"/);
  assert.match(heartbeat, /bootAckCodingAllowed !== true/);
});
check("heartbeat revalidates source provenance", () => assert.match(heartbeat, /verifyCurrentSourceExecutionState\(session\.sourceProvenance, \{ requireClean: false \}\)/));
check("heartbeat derives engine session id from authoritative grid context", () => assert.match(heartbeat, /session\.developmentContext\.engineSessionId/));
check("heartbeat cross-validates DevCenter engine worker session task", () => {
  assert.match(heartbeat, /getDevCenterEngineState\(\)/);
  assert.match(heartbeat, /engineSession\.workerId !== engineWorker\.id/);
  assert.match(heartbeat, /engineSession\.taskId !== taskId/);
  assert.match(heartbeat, /engineTask\.claimedBySessionId !== engineSessionId/);
});
check("heartbeat refuses closed engine session", () => assert.match(heartbeat, /engineSession\.status === "closed"/));
check("heartbeat only refreshes claimed in_progress or testing engine task", () => assert.match(heartbeat, /\["claimed", "in_progress", "testing"\]\.includes\(engineTask\.status\)/));
check("heartbeat uses canonical default 900 second lease", () => {
  assert.match(heartbeat, /DEV_ENGINE_DEFAULT_LEASE_SECONDS/);
  assert.match(heartbeat, /heartbeatSessionAtomic\(engineSessionId, DEV_ENGINE_DEFAULT_LEASE_SECONDS\)/);
});
check("desktop client calls dedicated heartbeat route", () => {
  assert.match(client, /async function heartbeatDeveloperGridSession/);
  assert.match(client, /\/api\/dev\/grid\/session-heartbeat/);
});
check("desktop heartbeat interval is five minutes", () => assert.match(main, /ENGINE_SESSION_HEARTBEAT_INTERVAL_MS = 5 \* 60_000/));
check("desktop heartbeat retry is sixty seconds", () => assert.match(main, /ENGINE_SESSION_HEARTBEAT_RETRY_MS = 60_000/));
check("validated BOOT ACK triggers immediate engine heartbeat", () => {
  const start = main.indexOf("async function processCapturedBootAck(");
  const end = main.indexOf("\nasync function monitorWorkerBootAck", start);
  assert.match(main.slice(start, end), /sendEngineSessionHeartbeatOnce\(\{ taskId, sessionId, workerCode \}\)/);
});
check("periodic heartbeat discovers current authoritative active work", () => {
  const start = main.indexOf("async function sendEngineSessionHeartbeatOnce(");
  const end = main.indexOf("\nfunction startEngineSessionHeartbeat", start);
  const block = main.slice(start, end);
  assert.match(block, /fetchDeveloperGridActiveWork/);
  assert.match(block, /\["RUNNING", "REVIEW"\]\.includes\(status\)/);
  assert.match(block, /bootAckState/);
  assert.match(block, /bootAckCodingAllowed/);
});
check("heartbeat lifecycle has explicit enabled guard", () => {
  assert.match(main, /let engineSessionHeartbeatEnabled = false/);
  assert.match(main, /engineSessionHeartbeatEnabled = true/);
  assert.match(main, /engineSessionHeartbeatEnabled = false/);
  assert.match(main, /if \(engineSessionHeartbeatEnabled\) scheduleEngineSessionHeartbeat\(nextDelay\)/);
});
check("live client starts and stops engine heartbeat with device mode", () => {
  assert.match(main, /stopEngineSessionHeartbeat\(\)/);
  assert.match(main, /startDeviceHeartbeat\(\); startEngineSessionHeartbeat\(\)/);
});
check("cancelled engine task maps to CANCELLED grid status", () => {
  assert.match(work, /rawStatus === "cancelled" \? "CANCELLED"/);
  assert.match(types, /"CANCELLED"/);
});
check("terminal cancelled task does not require an active grid session", () => assert.match(work, /\["COMPLETED", "BLOCKED", "CANCELLED"\]\.includes\(task\.status\)/));
check("desktop live status maps CANCELLED terminally", () => {
  assert.match(live, /CANCELLED: "cancelled"/);
  assert.match(live, /\["COMPLETED", "CANCELLED", "BLOCKED"\]\.includes\(taskStatus\)/);
  assert.match(live, /"completed", "failed", "blocked", "cancelled"/);
});
check("Central Core work card treats CANCELLED as terminal", () => assert.match(ui, /\["COMPLETED","BLOCKED","CANCELLED"\]/));

console.log(`Developer Grid session heartbeat v0.1.38 contract PASS · ${n}/${n}`);
