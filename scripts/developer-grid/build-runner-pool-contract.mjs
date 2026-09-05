import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "developer-grid-runner-pool-contract-"));
const out = path.join(tmp, "out");
await fs.mkdir(out, { recursive: true });
await execFileAsync("npx", [
  "tsc",
  "app/lib/developer-grid/types.ts",
  "app/lib/developer-grid/build-nodes.ts",
  "app/lib/developer-grid/build-runner-pool.ts",
  "app/lib/developer-grid/build-runner-scheduler.ts",
  "app/lib/developer-grid/build-orchestrator.ts",
  "--outDir", out,
  "--module", "commonjs",
  "--moduleResolution", "node",
  "--target", "ES2022",
  "--esModuleInterop",
  "--skipLibCheck",
  "--noEmit", "false",
], { cwd: root, maxBuffer: 8_000_000 });

const pool = await import(`file://${path.join(out, "build-runner-pool.js")}?v=${Date.now()}`);
const scheduler = await import(`file://${path.join(out, "build-runner-scheduler.js")}?v=${Date.now()}`);
const orchestrator = await import(`file://${path.join(out, "build-orchestrator.js")}?v=${Date.now()}`);
let n = 0;
function check(ok, name) {
  if (!ok) throw new Error(`FAIL ${name}`);
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${name}`);
}
function throwsCode(fn, code) {
  try { fn(); return false; } catch (error) { return error?.code === code; }
}

const now = new Date().toISOString();
const commit = "c0a85d17b93c4ef04f57c83711ab4e31f04452be";
const branch = "feature/benjadmin-build-runner-pool-v1-20260905";
const baseMetrics = {
  cpuPercent: 1.2, load1: 0.02, cores: 6,
  memoryTotalBytes: 16_769_310_720, memoryUsedBytes: 500_000_000, memoryAvailableBytes: 16_269_310_720, memoryPercent: 3,
  swapTotalBytes: 4_831_838_208, swapUsedBytes: 0, swapMinimumBytes: 4_294_967_296, swapPercent: 0,
  diskTotalBytes: 251_987_718_144, diskUsedBytes: 4_000_000_000, diskAvailableBytes: 247_987_718_144, diskPercent: 2,
  uptimeSeconds: 3600, buildLockHeld: false, currentRunId: null, queueDepth: null,
  storageGovernor: "SAFE", toolchainReady: true, nodeVersion: "v22.23.2", npmVersion: "10.9.8", gitVersion: "2.43.0",
  architecture: "x86_64", kernel: "6.8.0-139-generic",
};
function node(id, overrides = {}) {
  const hostname = id === "build01" ? "build01.dimpro.hu" : "build02.dimpro.hu";
  const metrics = { ...baseMetrics, ...(overrides.metrics || {}) };
  return {
    id, hostname,
    state: overrides.state || "READY",
    healthState: overrides.healthState || overrides.state || "READY",
    capabilities: ["NEXT_BUILD", "TYPECHECK", "LINT", "SMOKE"],
    lastVerifiedAt: overrides.lastVerifiedAt === undefined ? now : overrides.lastVerifiedAt,
    reason: overrides.reason || "ready",
    source: "DIMPRO_MCP_SSH_GATEWAY",
    quality: overrides.quality || "LIVE",
    snapshotSampledAt: overrides.snapshotSampledAt === undefined ? now : overrides.snapshotSampledAt,
    metrics: overrides.metrics === null ? null : metrics,
  };
}
function request(runId = "run-001", extra = {}) {
  return {
    runId,
    taskId: "dev-task-benjadmin-build-runner-pool-v1-20260905",
    sessionId: "grid-work-build-runner-pool-v1-20260905-benjaminai",
    workerCode: "BENJAMINAI",
    sourceCommit: commit,
    sourceBranch: branch,
    requestedAt: now,
    ...extra,
  };
}
function run(id, nodeId, status, extra = {}) {
  return {
    id,
    taskId: "dev-task-benjadmin-build-runner-pool-v1-20260905",
    sessionId: "grid-work-build-runner-pool-v1-20260905-benjaminai",
    workerCode: "BENJAMINAI",
    nodeId,
    sourceCommit: commit,
    sourceBranch: branch,
    status,
    retryOfRunId: null,
    runnerLocalLockRequired: true,
    productionAccess: "DENY",
    buildId: null,
    artifactSha256: null,
    queuedAt: now,
    assignedAt: nodeId ? now : null,
    startedAt: status === "RUNNING" ? now : null,
    finishedAt: status === "PASS" || status === "FAIL" || status === "BLOCKED" ? now : null,
    ...extra,
  };
}

const registry = pool.listBuildRunnerRegistry();
check(registry.length === 2 && registry[0].id === "build01" && registry[1].id === "build02", "registry order is BUILD-01 then BUILD-02");
check(registry[0].priority === 1 && registry[1].priority === 2, "BUILD-01 has primary scheduler priority");
check(registry.every((item) => item.maxConcurrentFullBuilds === 1), "one FULL BUILD slot per runner");
check(registry.every((item) => item.localLock.mechanism === "flock" && item.localLock.nonBlocking === true), "runner lock mechanism is local non-blocking flock");
check(registry.every((item) => item.localLock.file === "/srv/dimpro-build/state/full-build.lock"), "runner lock path matches hardened BUILD node state lock");
check(registry.every((item) => ["DEPLOY","MIGRATION","RESTART","CUTOVER","CANDIDATE"].every((op) => item.deniedOperations.includes(op))), "build runners deny deploy migration restart cutover candidate");
check(pool.GLOBAL_DEV_SERIAL_OPERATIONS.join(",") === "CANDIDATE,MIGRATION,RELEASE,RESTART,CUTOVER", "candidate migration release restart cutover remain global DEV serial operations");
check(pool.validateBuildRunIdentity(request()).length === 0, "commit task session worker run identity accepted");
check(pool.validateBuildRunIdentity(request("run-bad", { sourceCommit: "bad" })).includes("SOURCE_COMMIT_INVALID"), "invalid source commit fails closed");
check(pool.runnerSnapshotUsability(node("build01")).usable === true, "fresh READY FREE runner is usable");
check(pool.runnerSnapshotUsability(node("build01", { metrics: { buildLockHeld: true } })).busy === true, "local runner lock marks node busy");
check(pool.runnerSnapshotUsability(node("build01", { quality: "STALE" })).usable === false, "stale health snapshot fails closed");
check(pool.runnerSnapshotUsability(node("build01", { metrics: null })).usable === false, "missing metrics fail closed");
check(pool.runnerSnapshotUsability(node("build01", { metrics: { storageGovernor: "DENY" } })).usable === false, "storage governor DENY fails closed");
check(pool.runnerSnapshotUsability(node("build01", { metrics: { swapTotalBytes: 1 } })).usable === false, "swap below minimum fails closed");

const bothFree = [node("build01"), node("build02")];
const primary = scheduler.scheduleBuildRun({ request: request("run-primary"), nodes: bothFree });
check(primary.decision === "ASSIGNED" && primary.run.nodeId === "build01", "scheduler chooses BUILD-01 when READY and FREE");
check(primary.decision === "ASSIGNED" && primary.runnerLocalLock?.mechanism === "flock", "assignment carries required local flock contract");
const build01Locked = scheduler.scheduleBuildRun({ request: request("run-fallback-lock"), nodes: [node("build01", { metrics: { buildLockHeld: true } }), node("build02")] });
check(build01Locked.decision === "ASSIGNED" && build01Locked.run.nodeId === "build02", "BUILD-02 selected when BUILD-01 local lock is held");
const build01Reserved = scheduler.scheduleBuildRun({ request: request("run-fallback-active"), nodes: bothFree, activeRuns: [run("run-other", "build01", "RUNNING")] });
check(build01Reserved.decision === "ASSIGNED" && build01Reserved.run.nodeId === "build02", "BUILD-02 selected when BUILD-01 already has active FULL BUILD");
const queued = scheduler.scheduleBuildRun({ request: request("run-queued"), nodes: bothFree, activeRuns: [run("run-a", "build01", "RUNNING"), run("run-b", "build02", "ASSIGNED")] });
check(queued.decision === "QUEUED" && queued.run.nodeId === null && queued.run.status === "QUEUED", "job is QUEUED when both runners are occupied");
const duplicate = scheduler.scheduleBuildRun({ request: request("run-a"), nodes: bothFree, activeRuns: [run("run-a", "build01", "RUNNING")] });
check(duplicate.decision === "BLOCKED" && duplicate.code === "BUILD_RUN_ID_ALREADY_EXISTS", "same runId cannot be scheduled on a second node");
const unprovenRetry = scheduler.scheduleBuildRun({ request: request("run-retry-unproven", { retryOfRunId: "run-failed" }), nodes: bothFree, runHistory: [run("run-failed", "build01", "FAIL")] });
check(unprovenRetry.decision === "BLOCKED" && unprovenRetry.code === "BUILD_REQUEUE_NOT_PROVEN", "requeue without verified failure proof is blocked");
const failureProof = { schemaVersion: 1, runId: "run-failed", nodeId: "build01", status: "FAIL", finishedAt: now, exitCode: 1, evidenceSource: "RUNNER_RESULT", verified: true };
const provenRetry = scheduler.scheduleBuildRun({ request: request("run-retry-proven", { retryOfRunId: "run-failed", failureProof }), nodes: bothFree, runHistory: [run("run-failed", "build01", "FAIL")] });
check(provenRetry.decision === "ASSIGNED" && provenRetry.run.retryOfRunId === "run-failed", "verified failed run may be requeued as a new runId");
const passedHistory = scheduler.scheduleBuildRun({ request: request("run-retry-pass", { retryOfRunId: "run-pass", failureProof: { ...failureProof, runId: "run-pass" } }), nodes: bothFree, runHistory: [run("run-pass", "build01", "PASS")] });
check(passedHistory.decision === "BLOCKED", "successful prior run cannot be requeued as failure");

const assignedRun = primary.run;
const runner = pool.getBuildRunnerRegistryEntry("build01");
const artifact = {
  schemaVersion: 1, environment: "DEV", productionAccess: "DENY", buildId: "BUILD_ABC123",
  runId: assignedRun.id, taskId: assignedRun.taskId, sessionId: assignedRun.sessionId, workerCode: assignedRun.workerCode,
  sourceCommit: assignedRun.sourceCommit, sourceBranch: assignedRun.sourceBranch,
  artifactSha256: "a".repeat(64), runner: { id: runner.id, hostname: runner.hostname }, createdAt: now,
};
check(pool.validateBuildArtifactMetadata(artifact, assignedRun, runner).length === 0, "artifact metadata requires BUILD_ID source commit SHA-256 and runner identity");
check(pool.validateBuildArtifactMetadata({ ...artifact, artifactSha256: "bad" }, assignedRun, runner).includes("ARTIFACT_SHA256_INVALID"), "invalid artifact SHA-256 fails closed");
check(pool.validateBuildArtifactMetadata({ ...artifact, runner: { id: "build02", hostname: "build02.dimpro.hu" } }, assignedRun, runner).includes("ARTIFACT_RUNNER_MISMATCH"), "artifact runner mismatch fails closed");

const execPrimary = orchestrator.resolveBuildExecutor(bothFree);
check(execPrimary.kind === "REMOTE_BUILD_NODE" && execPrimary.node.id === "build01", "orchestrator resolves BUILD-01 first");
const noRunner = orchestrator.resolveBuildExecutor([node("build01", { metrics: { buildLockHeld: true } }), node("build02", { state: "DISABLED", healthState: "BLOCKED" })]);
check(noRunner.kind === "BUILD_QUEUE" && noRunner.node === null, "orchestrator queues instead of falling back to DEV FULL BUILD");
check(throwsCode(() => orchestrator.assertBuildExecutionAllowed(execPrimary, { runnerLocalLockHeld: false, storagePreflightPassed: true, memoryPreflightPassed: true, productionAccess: "DENY" }), "BUILD_EXECUTION_BLOCKED"), "execution requires acquired runner-local flock");
check(orchestrator.assertBuildExecutionAllowed(execPrimary, { runnerLocalLockHeld: true, storagePreflightPassed: true, memoryPreflightPassed: true, productionAccess: "DENY" }).kind === "REMOTE_BUILD_NODE", "remote execution gate accepts local lock plus resource preflights");
check(scheduler.assertRunnerAssignmentCanStart({ run: assignedRun, node: node("build01") }).localLock.mechanism === "flock", "assigned run is revalidated immediately before runner start");
check(throwsCode(() => scheduler.assertRunnerAssignmentCanStart({ run: assignedRun, node: node("build01", { quality: "STALE" }) }), "BUILD_RUNNER_REVALIDATION_FAILED"), "runner start revalidation fails closed on stale snapshot");

await fs.rm(tmp, { recursive: true, force: true });
console.log(`Developer Grid Build Runner Pool foundation contract PASS · ${n}/${n}`);
