import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const pkg = JSON.parse(read("desktop/benjadmin-developer-grid/package.json"));
const types = read("app/lib/developer-grid/types.ts");
const materializer = read("app/lib/developer-grid/task-session-materializer.ts");
const smoke = read("scripts/developer-grid/candidate-smoke.mjs");

let n = 0;
function check(label, fn) { fn(); n += 1; console.log(`PASS ${String(n).padStart(2, "0")} ${label}`); }

check("package version v0.1.59", () => assert.equal(pkg.version, "0.1.59"));
check("backend version v0.1.59-dev", () => assert.match(types, /DEVELOPER_GRID_VERSION = "0\.1\.59-dev"/));
check("materializer active task statuses are exact", () => {
  assert.match(materializer, /\["claimed", "in_progress", "testing"\]\.includes\(taskStatus\)/);
});
check("materializer active session statuses are exact", () => {
  assert.match(materializer, /\["open", "active"\]\.includes\(sessionStatus\)/);
});
check("terminal or inactive bridge is no-op", () => {
  assert.match(materializer, /if \(!activeTask \|\| !activeSession\)/);
  assert.match(materializer, /materialized:\s*false as const/);
  assert.match(materializer, /session:\s*null/);
  assert.match(materializer, /reason:\s*"BRIDGE_TASK_SESSION_NOT_ACTIVE"/);
});
check("terminal no-op reports sanitized statuses", () => {
  assert.match(materializer, /taskStatus:\s*taskStatus \|\| null/);
  assert.match(materializer, /sessionStatus:\s*sessionStatus \|\| null/);
});
check("RUNNING materialization occurs only after active gate", () => {
  const gate = materializer.indexOf("if (!activeTask || !activeSession)");
  const running = materializer.indexOf("status: \"RUNNING\"");
  assert.ok(gate >= 0 && running > gate);
});
check("candidate smoke evaluates bridge task and session status", () => {
  assert.match(smoke, /bridgeTaskStatus/);
  assert.match(smoke, /bridgeSessionStatus/);
  assert.match(smoke, /bridgeIsActive/);
});
check("candidate smoke expects no-op for terminal bridge", () => {
  assert.match(smoke, /materialized\?\.materialized === false/);
  assert.match(smoke, /materialized\?\.session === null/);
  assert.match(smoke, /Terminal or inactive bridge is materialization no-op/);
});
check("candidate smoke still validates active materialized source", () => {
  assert.match(smoke, /Materialized active session source VERIFIED/);
});

console.log(`Developer Grid materializer v0.1.58 contract PASS · ${n}/${n}`);
