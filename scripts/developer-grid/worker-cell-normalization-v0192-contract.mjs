import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const main = fs.readFileSync(path.join(root, "desktop/benjadmin-developer-grid/src/main.cjs"), "utf8");
const live = fs.readFileSync(path.join(root, "desktop/benjadmin-developer-grid/src/live/benjadmin-live-client.cjs"), "utf8");
let n = 0;
function check(name, fn) { fn(); n += 1; console.log("PASS", name); }

check("desktop canonicalizes BENJAMINAI to BENAI", () => {
  assert.ok(main.includes('return code === "BENJAMINAI" ? "BENAI" : code;'));
  assert.ok(live.includes('BENJAMINAI: "BENAI"'));
});
check("worker cell lookup uses one normalization helper", () => {
  assert.ok(main.includes("function workerCellForCode(workerCode)"));
  assert.ok(main.includes("normalizeDesktopWorkerCode(item?.workerCode) === normalized"));
});
check("manual central launch resolves cell through normalized helper", () => {
  const start = main.indexOf("async function sendPreparedWorkerTaskLaunch");
  const end = main.indexOf("async function", start + 20);
  const body = main.slice(start, end > start ? end : start + 12000);
  assert.ok(body.includes("const cell = workerCellForCode(code);"));
});
check("active-task resume resolves cell through normalized helper", () => {
  assert.ok(main.includes("const preRecoveryCell = workerCellForCode(preRecoveryCode);"));
});
check("no raw BENAI/BENJAMINAI worker-to-cell equality remains", () => {
  assert.ok(!main.includes("config?.cells?.find((item) => item.workerCode === code && item.enabled !== false)"));
  assert.ok(!main.includes("config?.cells?.find((item)=>item.workerCode===code && item.enabled!==false)"));
  assert.ok(!main.includes("config.cells.find((item) => item.workerCode === workerCode)"));
});

console.log("Developer Grid v0.1.99 worker-cell normalization contract PASS · " + n + "/" + n);
