import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const ui = fs.readFileSync(path.join(root, "desktop/benjadmin-developer-grid/src/renderer/context-workspace.js"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "desktop/benjadmin-developer-grid/package.json"), "utf8"));
const types = fs.readFileSync(path.join(root, "app/lib/developer-grid/types.ts"), "utf8");
let n = 0;
function check(name, fn) { fn(); n += 1; console.log("PASS", name); }

check("desktop v0.1.91", () => assert.equal(pkg.version, "0.1.91"));
check("backend v0.1.91-dev", () => assert.ok(types.includes('DEVELOPER_GRID_VERSION = "0.1.91-dev"')));
check("resume is available for READY and RUNNING pre-ACK tasks", () => assert.ok(ui.includes('["READY","RUNNING"].includes(String(task.status||"").toUpperCase())&&bootAckState!=="VALIDATED"')));
check("resume control still routes through existing-task recovery", () => { assert.ok(ui.includes('id="workResumeButton"')); assert.ok(ui.includes("resumeWorkLaunch")); });

console.log("Developer Grid v0.1.91 RUNNING BOOT ACK resume contract PASS · " + n + "/" + n);
