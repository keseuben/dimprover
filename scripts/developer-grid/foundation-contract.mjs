import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "app/admin/developer-grid/page.tsx",
  "app/api/dev/grid/foundation/route.ts",
  "app/api/dev/grid/events/route.ts",
  "app/api/dev/grid/work-start/route.ts",
  "app/lib/developer-grid/work-start.ts",
  "scripts/developer-grid/work-start-contract.mjs",
  "app/lib/developer-grid/types.ts",
  "app/lib/developer-grid/source-provenance.ts",
  "app/lib/developer-grid/development-context.ts",
  "app/lib/developer-grid/events.ts",
  "app/lib/developer-grid/release-provenance.ts",
  "app/lib/developer-grid/runtime-provenance.ts",
  "app/lib/developer-grid/build-nodes.ts",
  "app/lib/developer-grid/exclusive-lock.ts",
  "app/lib/developer-grid/handoff.ts",
  "app/lib/developer-grid/read-auth.ts",
  "components/admin/developer-grid/DeveloperGridShell.tsx",
  "scripts/developer-grid/candidate-smoke.mjs",
  "scripts/developer-grid/build-candidate.sh",
  "scripts/developer-grid/build-candidate-contract.mjs",
  "scripts/developer-grid/release-artifact-engine.mjs",
  "scripts/developer-grid/release-artifact-contract.mjs",
  "scripts/developer-grid/release-artifacts.sh",
  "scripts/developer-grid/operation-reconcile.mjs",
  "scripts/developer-grid/operation-reconcile-contract.mjs",
  "scripts/developer-grid/package-windows.sh",
  "scripts/developer-grid/package-windows-contract.mjs",
  "scripts/developer-grid/write-windows-artifact-marker.mjs",
  "scripts/developer-grid/write-package-session-marker.mjs",
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
const readAuth = fs.readFileSync(path.join(root, "app/lib/developer-grid/read-auth.ts"), "utf8");
const candidateBuild = fs.readFileSync(path.join(root, "scripts/developer-grid/build-candidate.sh"), "utf8");
const releaseArtifactEngine = fs.readFileSync(path.join(root, "scripts/developer-grid/release-artifact-engine.mjs"), "utf8");
const releaseArtifactWrapper = fs.readFileSync(path.join(root, "scripts/developer-grid/release-artifacts.sh"), "utf8");
const operationReconcile = fs.readFileSync(path.join(root, "scripts/developer-grid/operation-reconcile.mjs"), "utf8");
const windowsPackage = fs.readFileSync(path.join(root, "scripts/developer-grid/package-windows.sh"), "utf8");
const windowsMarker = fs.readFileSync(path.join(root, "scripts/developer-grid/write-windows-artifact-marker.mjs"), "utf8");
const packageSessionMarker = fs.readFileSync(path.join(root, "scripts/developer-grid/write-package-session-marker.mjs"), "utf8");
const devZipPackage = fs.readFileSync(path.join(root, "desktop/benjadmin-developer-grid/scripts/package-dev-release.sh"), "utf8");
const workStart = fs.readFileSync(path.join(root, "app/lib/developer-grid/work-start.ts"), "utf8");
const workStartRoute = fs.readFileSync(path.join(root, "app/api/dev/grid/work-start/route.ts"), "utf8");

const checks = [
  [types.includes('DEVELOPER_GRID_VERSION = "0.1.9-dev"'), "versioned DEV candidate contract"],
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
  [foundation.includes("DIMPRO_DEVELOPER_GRID_SOURCE_WORKTREE") && foundation.includes("DIMPRO_DEVELOPER_GRID_SOURCE_BRANCH") && foundation.includes("DIMPRO_DEVELOPER_GRID_SOURCE_REPOSITORY"), "immutable runtime provenance expectations are explicit and scopeable"],
  [foundationRoute.includes('releaseRuntimeProvenance.state !== "BLOCKED"'), "foundation API blocks release/runtime mismatch"],
  [build.includes("build01.dimpro.hu") && build.includes("build02.dimpro.hu"), "build node abstraction"],
  [build.includes("probeBuildNodes") && build.includes("BatchMode=yes") && build.includes("StrictHostKeyChecking=yes"), "build node SSH readiness probe"],
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
  [shell.includes("Build ID:") && shell.includes("foundation?.version"), "UI exposes version/build identity"],
  [readAuth.includes("isChatGridDeviceAuthorized") && readAuth.includes("isDevCenterAuthorized"), "desktop device read-only grid auth bridge"],
  [candidateBuild.includes("next build --webpack") && candidateBuild.includes("dimpro-coordinated-operation.sh") && candidateBuild.includes("PROD_DENY"), "canonical low-memory Developer Grid candidate build"],
  [candidateBuild.includes("BUILD_ENV_FILE") && candidateBuild.includes("umask 077") && !candidateBuild.includes('"$NEXT_PUBLIC_SUPABASE_URL" "$NEXT_PUBLIC_SUPABASE_ANON_KEY"'), "canonical build keeps DEV public env values out of operation command history"],
  [releaseArtifactWrapper.includes("dimpro-coordinated-operation.sh\" release") && releaseArtifactWrapper.includes("DIMPRO_RELEASE_COORDINATED=1"), "release artifact engine runs under exclusive release lock"],
  [releaseArtifactEngine.includes("ARTIFACT_IMMUTABILITY_VIOLATION") && releaseArtifactEngine.includes("DEV_ZIP_FORBIDDEN_CONTENT"), "release artifact immutability and ZIP safety fail closed"],
  [releaseArtifactEngine.includes("WINDOWS_ARTIFACT_MARKER_MISSING") && releaseArtifactEngine.includes('windowsArtifactProvenance: "VERIFIED"') , "release artifact requires exact Windows package marker"],
  [releaseArtifactEngine.includes("PACKAGE_SESSION_MARKER_MISSING") && releaseArtifactEngine.includes('packageSessionProvenance: "VERIFIED"'), "release artifact requires exact EXE + DEV ZIP package session marker"],
  [packageSessionMarker.includes("PACKAGE_SESSION_BUILD_PROVENANCE_MISMATCH") && devZipPackage.includes("write-package-session-marker.mjs"), "DEV ZIP packaging binds exact source/build to Windows EXE package session"],
  [releaseArtifactEngine.includes("PUBLIC_ARTIFACT_HASH_MISMATCH") && releaseArtifactEngine.includes("PUBLIC_PRODUCTION_ACCESS_MISMATCH"), "public staging verifies full artifact hash and PROD DENY"],
  [operationReconcile.includes("MATCHING_OPERATION_ACTIVE") && operationReconcile.includes("DO_NOT_REPEAT") && operationReconcile.includes("SAFE_TO_START_AFTER_PREFLIGHT"), "timeout reconciliation prevents duplicate long operations"],
  [operationReconcile.includes("SAFE_OPERATION_FIELDS") && !operationReconcile.includes("SAFE_OPERATION_FIELDS = [\"command\""), "operation reconciliation output excludes stored command secrets"],
  [windowsPackage.includes("dimpro-coordinated-operation.sh\" build") && windowsPackage.includes("write-windows-artifact-marker.mjs"), "Windows packaging uses coordinated build lock and exact artifact marker"],
  [windowsMarker.includes("WINDOWS_MARKER_BUILD_PROVENANCE_MISMATCH") && operationReconcile.includes("WINDOWS_ARTIFACT_MARKER_VERIFIED"), "Windows artifact marker is provenance-verified and consumed by reconciliation"],
  [workStart.includes("createDevEngineTask") && workStart.includes("materializeGridTaskSession") && workStart.includes("sourcePromptPreserved: true"), "daily work-start uses authoritative task engine and preserves source prompt"],
  [workStartRoute.includes("isChatGridDeviceAuthorized") && workStartRoute.includes("x-dimpro-production-access") && workStart.includes("SOURCE_BASELINE_MISMATCH"), "daily work-start is paired-device DEV-only and source fail-closed"],
  [!fs.existsSync(path.join(root, "app/lib/dev-center/developer-grid")) && !fs.existsSync(path.join(root, "app/api/dev/console/developer-grid")), "single canonical Developer Grid core path"],
];

for (const [ok, label] of checks) if (!ok) failures.push(`FAIL ${label}`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Developer Grid V1 foundation contract PASS · ${required.length} required files · ${checks.length} invariants`);
