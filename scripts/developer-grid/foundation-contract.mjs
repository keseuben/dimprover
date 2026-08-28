import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "app/admin/developer-grid/page.tsx",
  "app/api/dev/grid/foundation/route.ts",
  "app/api/dev/grid/events/route.ts",
  "app/lib/developer-grid/types.ts",
  "app/lib/developer-grid/source-provenance.ts",
  "app/lib/developer-grid/development-context.ts",
  "app/lib/developer-grid/events.ts",
  "app/lib/developer-grid/release-provenance.ts",
  "app/lib/developer-grid/runtime-provenance.ts",
  "app/lib/developer-grid/build-nodes.ts",
  "app/lib/developer-grid/exclusive-lock.ts",
  "app/lib/developer-grid/handoff.ts",
  "components/admin/developer-grid/DeveloperGridShell.tsx",
  "scripts/developer-grid/candidate-smoke.mjs",
];

const failures = [];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`MISSING ${file}`);
}

const types = fs.readFileSync(path.join(root, "app/lib/developer-grid/types.ts"), "utf8");
const source = fs.readFileSync(path.join(root, "app/lib/developer-grid/source-provenance.ts"), "utf8");
const context = fs.readFileSync(path.join(root, "app/lib/developer-grid/development-context.ts"), "utf8");
const events = fs.readFileSync(path.join(root, "app/lib/developer-grid/events.ts"), "utf8");
const release = fs.readFileSync(path.join(root, "app/lib/developer-grid/release-provenance.ts"), "utf8");
const runtime = fs.readFileSync(path.join(root, "app/lib/developer-grid/runtime-provenance.ts"), "utf8");
const foundation = fs.readFileSync(path.join(root, "app/lib/developer-grid/foundation.ts"), "utf8");
const foundationRoute = fs.readFileSync(path.join(root, "app/api/dev/grid/foundation/route.ts"), "utf8");
const build = fs.readFileSync(path.join(root, "app/lib/developer-grid/build-nodes.ts"), "utf8");
const orchestrator = fs.readFileSync(path.join(root, "app/lib/developer-grid/build-orchestrator.ts"), "utf8");
const stateStore = fs.readFileSync(path.join(root, "app/lib/developer-grid/state-store.ts"), "utf8");
const bridge = fs.readFileSync(path.join(root, "app/lib/developer-grid/console-bridge.ts"), "utf8");
const shell = fs.readFileSync(path.join(root, "components/admin/developer-grid/DeveloperGridShell.tsx"), "utf8");

const checks = [
  [types.includes('"ARMINAI" | "OUTMINAI" | "BENJAMINAI" | "JAZMINAI" | "DEVMINAI"'), "worker registry contract"],
  [types.includes("export type GridWorkflow =") && types.includes("export type WorkerSession ="), "task/workflow/session contracts"],
  [types.includes("export type DevelopmentDocumentRef =") && types.includes("export type GridHandoff ="), "handoff/document contracts"],
  [types.includes("export type GridBuildRun =") && types.includes("export type GridReview =") && types.includes("export type GridTelemetry ="), "build/review/telemetry contracts"],
  [source.includes("SOURCE_BASELINE_MISMATCH"), "source fail-closed"],
  [context.includes("PRESENCE_IS_AUTHORITATIVE_CONTEXT = false"), "presence non-authoritative"],
  [events.includes('DEVELOPER_GRID_REALTIME_MODE = "DELTA_EVENT"'), "delta/event realtime"],
  [events.includes("FULL_SNAPSHOT_POLLING_ALLOWED = false"), "full snapshot polling forbidden"],
  [release.includes("RELEASE_STATE_MISMATCH"), "release fail-closed"],
  [runtime.includes(".dimpro-release.json") && runtime.includes(".dimpro-assets-build-id"), "immutable runtime release metadata adapter"],
  [runtime.includes("active-next-release") && runtime.includes("NEXT_DIST_DIR"), "runtime release identity resolution"],
  [foundation.includes("resolveDeveloperGridRuntimeProvenance") && foundation.includes("expectedSourceCommit"), "foundation binds runtime to source provenance"],
  [foundationRoute.includes('releaseRuntimeProvenance.state !== "BLOCKED"'), "foundation API blocks release/runtime mismatch"],
  [build.includes("build01.dimpro.hu") && build.includes("build02.dimpro.hu"), "build node abstraction"],
  [build.includes("Veszélyes kerülő build tilos"), "dangerous fallback build forbidden"],
  [orchestrator.includes("CANONICAL_DEV_SERVER") && orchestrator.includes("exclusiveLockHeld"), "canonical DEV build executor"],
  [stateStore.includes("events.jsonl") && stateStore.includes("atomic"), "persistent state/event store"],
  [stateStore.includes("mutation.lock") && stateStore.includes("DEVELOPER_GRID_STATE_LOCK_TIMEOUT"), "cross-process state mutation lock"],
  [stateStore.includes("materializeGridTaskSession") && fs.existsSync(path.join(root, "app/lib/developer-grid/task-session-materializer.ts")), "idempotent task/session materialization"],
  [stateStore.includes("getGridStateDelta") && types.includes("export type GridStateDelta ="), "revision based state delta"],
  [bridge.includes("presenceAuthoritative: false") && bridge.includes("TASK_SESSION_PROVENANCE"), "Developer Console bridge context policy"],
  [shell.includes("05 DevminAI") && shell.includes("01 ÁrminAI") === false, "shell uses registry-driven fixed cells"],
  [shell.includes("/api/dev/grid/state?after=") && shell.includes("eventCursorRef.current"), "UI consumes state/activity deltas"],
  [shell.includes("DELTA_LIVE") && shell.includes("Full snapshot polling: TILTVA"), "UI exposes delta live status"],
  [!fs.existsSync(path.join(root, "app/lib/dev-center/developer-grid")) && !fs.existsSync(path.join(root, "app/api/dev/console/developer-grid")), "single canonical Developer Grid core path"],
];

for (const [ok, label] of checks) if (!ok) failures.push(`FAIL ${label}`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Developer Grid V1 foundation contract PASS · ${required.length} required files · ${checks.length} invariants`);
