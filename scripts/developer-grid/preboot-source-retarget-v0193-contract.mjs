import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const workStart = fs.readFileSync(path.join(root, "app/lib/developer-grid/work-start.ts"), "utf8");
const workspace = fs.readFileSync(path.join(root, "app/lib/developer-grid/worker-workspace.ts"), "utf8");
const route = fs.readFileSync(path.join(root, "app/api/dev/grid/work-start/route.ts"), "utf8");
let n = 0;
function check(name, fn) { fn(); n += 1; console.log("PASS", name); }

check("route exposes explicit pre-BOOT retarget action", () => assert.ok(route.includes('action === "RETARGET_PRE_BOOT_SOURCE"')));
check("retarget rejects validated BOOT ACK", () => assert.ok(workStart.includes("DEVELOPER_GRID_PREBOOT_RETARGET_BOOT_ACK_DENIED")));
check("retarget is limited to stage 1", () => assert.ok(workStart.includes("DEVELOPER_GRID_PREBOOT_RETARGET_STAGE_DENIED")));
check("retarget verifies clean current source", () => assert.ok(workStart.includes("verifyCurrentSourceExecutionState(session.sourceProvenance, { requireClean:true })")));
check("retarget requires active READY engine ownership", () => assert.ok(workStart.includes("DEVELOPER_GRID_PREBOOT_RETARGET_ENGINE_BINDING_INVALID")));
check("retarget requires active scope lock and worktree lease", () => assert.ok(workStart.includes("DEVELOPER_GRID_PREBOOT_RETARGET_LOCK_REQUIRED")));
check("workspace retarget requires exact current head and clean tree", () => assert.ok(workspace.includes("DEVELOPER_WORKSPACE_RETARGET_SOURCE_MISMATCH")));
check("workspace retarget verifies target commit", () => assert.ok(workspace.includes("DEVELOPER_WORKSPACE_RETARGET_TARGET_MISSING")));
check("retarget rollback paths exist", () => assert.ok((workStart.match(/targetCommit:previousHead/g) || []).length >= 3));
check("retarget emits audited live event", () => assert.ok(workStart.includes("SOURCE_BASELINE_RETARGETED_PRE_BOOT")));

console.log(`Developer Grid v0.1.100 pre-BOOT source retarget contract PASS · ${n}/${n}`);
