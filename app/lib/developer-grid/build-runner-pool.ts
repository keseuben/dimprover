import type { BuildNodeSnapshot } from "./build-nodes";
import type { BuildNodeDefinition, GridBuildRun, WorkerCode } from "./types";

export const BUILD_RUNNER_POOL_SCHEMA_VERSION = 1 as const;
export const BUILD_RUNNER_LOCAL_LOCK_FILE = "/srv/dimpro-build/state/full-build.lock" as const;
export const BUILD_RUNNER_LOCAL_LOCK_MECHANISM = "flock" as const;

export type BuildRunnerDeniedOperation = "DEPLOY" | "MIGRATION" | "RESTART" | "CUTOVER" | "CANDIDATE";
export type BuildRunnerAllowedOperation = "FULL_BUILD" | "TYPECHECK" | "LINT" | "SMOKE" | "ARTIFACT_CREATE";

export type BuildRunnerRegistryEntry = {
  id: BuildNodeDefinition["id"];
  hostname: BuildNodeDefinition["hostname"];
  priority: 1 | 2;
  maxConcurrentFullBuilds: 1;
  localLock: {
    mechanism: typeof BUILD_RUNNER_LOCAL_LOCK_MECHANISM;
    file: typeof BUILD_RUNNER_LOCAL_LOCK_FILE;
    nonBlocking: true;
  };
  allowedOperations: BuildRunnerAllowedOperation[];
  deniedOperations: BuildRunnerDeniedOperation[];
  productionAccess: "DENY";
};

const RUNNER_REGISTRY: readonly BuildRunnerRegistryEntry[] = [
  {
    id: "build01",
    hostname: "build01.dimpro.hu",
    priority: 1,
    maxConcurrentFullBuilds: 1,
    localLock: { mechanism: BUILD_RUNNER_LOCAL_LOCK_MECHANISM, file: BUILD_RUNNER_LOCAL_LOCK_FILE, nonBlocking: true },
    allowedOperations: ["FULL_BUILD", "TYPECHECK", "LINT", "SMOKE", "ARTIFACT_CREATE"],
    deniedOperations: ["DEPLOY", "MIGRATION", "RESTART", "CUTOVER", "CANDIDATE"],
    productionAccess: "DENY",
  },
  {
    id: "build02",
    hostname: "build02.dimpro.hu",
    priority: 2,
    maxConcurrentFullBuilds: 1,
    localLock: { mechanism: BUILD_RUNNER_LOCAL_LOCK_MECHANISM, file: BUILD_RUNNER_LOCAL_LOCK_FILE, nonBlocking: true },
    allowedOperations: ["FULL_BUILD", "TYPECHECK", "LINT", "SMOKE", "ARTIFACT_CREATE"],
    deniedOperations: ["DEPLOY", "MIGRATION", "RESTART", "CUTOVER", "CANDIDATE"],
    productionAccess: "DENY",
  },
] as const;

export const GLOBAL_DEV_SERIAL_OPERATIONS = ["CANDIDATE", "MIGRATION", "RELEASE", "RESTART", "CUTOVER"] as const;

function cloneRunner(entry: BuildRunnerRegistryEntry): BuildRunnerRegistryEntry {
  return {
    ...entry,
    localLock: { ...entry.localLock },
    allowedOperations: [...entry.allowedOperations],
    deniedOperations: [...entry.deniedOperations],
  };
}

export function listBuildRunnerRegistry(): BuildRunnerRegistryEntry[] {
  return RUNNER_REGISTRY.map(cloneRunner).sort((a, b) => a.priority - b.priority);
}

export function getBuildRunnerRegistryEntry(nodeId: BuildNodeDefinition["id"]) {
  const entry = RUNNER_REGISTRY.find((item) => item.id === nodeId) || null;
  return entry ? cloneRunner(entry) : null;
}

export type BuildRunIdentity = {
  runId: string;
  taskId: string;
  sessionId: string;
  workerCode: WorkerCode;
  sourceCommit: string;
  sourceBranch: string;
};

export type BuildFailureProof = {
  schemaVersion: 1;
  runId: string;
  nodeId: BuildNodeDefinition["id"];
  status: "FAIL";
  finishedAt: string;
  exitCode: number;
  evidenceSource: "RUNNER_RESULT";
  verified: true;
};

export type BuildArtifactMetadata = {
  schemaVersion: 1;
  environment: "DEV";
  productionAccess: "DENY";
  buildId: string;
  runId: string;
  taskId: string;
  sessionId: string;
  workerCode: WorkerCode;
  sourceCommit: string;
  sourceBranch: string;
  artifactSha256: string;
  runner: {
    id: BuildNodeDefinition["id"];
    hostname: BuildNodeDefinition["hostname"];
  };
  createdAt: string;
};

function text(value: unknown, max = 220) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null;
}

function timestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? value : null;
}

export function validateBuildRunIdentity(identity: BuildRunIdentity): string[] {
  const errors: string[] = [];
  if (!text(identity.runId, 160)) errors.push("RUN_ID_REQUIRED");
  if (!text(identity.taskId, 220)) errors.push("TASK_ID_REQUIRED");
  if (!text(identity.sessionId, 220)) errors.push("SESSION_ID_REQUIRED");
  if (!["ARMINAI", "OUTMINAI", "BENJAMINAI", "JAZMINAI", "DEVMINAI"].includes(identity.workerCode)) errors.push("WORKER_ID_INVALID");
  if (!/^[0-9a-f]{40}$/i.test(identity.sourceCommit)) errors.push("SOURCE_COMMIT_INVALID");
  if (!text(identity.sourceBranch, 220)) errors.push("SOURCE_BRANCH_REQUIRED");
  return errors;
}

export type RunnerSnapshotUsability = {
  usable: boolean;
  busy: boolean;
  reason: string;
};

export function runnerSnapshotUsability(node: BuildNodeSnapshot): RunnerSnapshotUsability {
  if (node.quality !== "LIVE" || !node.snapshotSampledAt || !node.lastVerifiedAt) {
    return { usable: false, busy: false, reason: "RUNNER_HEALTH_NOT_LIVE" };
  }
  if (node.state === "BUSY" || node.healthState === "BUSY") {
    return { usable: false, busy: true, reason: "RUNNER_HEALTH_BUSY" };
  }
  if (node.state !== "READY" || node.healthState !== "READY") {
    return { usable: false, busy: false, reason: "RUNNER_NOT_READY" };
  }
  if (!node.metrics) return { usable: false, busy: false, reason: "RUNNER_METRICS_REQUIRED" };
  if (!node.metrics.toolchainReady) return { usable: false, busy: false, reason: "RUNNER_TOOLCHAIN_NOT_READY" };
  if (!["SAFE", "WATCH"].includes(node.metrics.storageGovernor.toUpperCase())) {
    return { usable: false, busy: false, reason: "RUNNER_STORAGE_GOVERNOR_DENY" };
  }
  if (node.metrics.swapTotalBytes < node.metrics.swapMinimumBytes) {
    return { usable: false, busy: false, reason: "RUNNER_SWAP_BELOW_MINIMUM" };
  }
  if (node.metrics.buildLockHeld || node.metrics.currentRunId) {
    return { usable: false, busy: true, reason: "RUNNER_LOCAL_LOCK_BUSY" };
  }
  return { usable: true, busy: false, reason: "RUNNER_READY_FREE" };
}

export function validateBuildFailureProof(proof: BuildFailureProof | null | undefined, previousRun: GridBuildRun | null | undefined) {
  const errors: string[] = [];
  if (!proof) return ["REQUEUE_FAILURE_PROOF_REQUIRED"];
  if (!previousRun) return ["REQUEUE_PREVIOUS_RUN_REQUIRED"];
  if (proof.schemaVersion !== 1 || proof.status !== "FAIL" || proof.verified !== true || proof.evidenceSource !== "RUNNER_RESULT") errors.push("REQUEUE_FAILURE_PROOF_INVALID");
  if (proof.runId !== previousRun.id) errors.push("REQUEUE_RUN_ID_MISMATCH");
  if (proof.nodeId !== previousRun.nodeId) errors.push("REQUEUE_NODE_ID_MISMATCH");
  if (previousRun.status !== "FAIL") errors.push("REQUEUE_PREVIOUS_RUN_NOT_FAILED");
  if (!Number.isInteger(proof.exitCode) || proof.exitCode === 0) errors.push("REQUEUE_EXIT_CODE_INVALID");
  if (!timestamp(proof.finishedAt)) errors.push("REQUEUE_FINISHED_AT_INVALID");
  return errors;
}

export function validateBuildArtifactMetadata(metadata: BuildArtifactMetadata, run: GridBuildRun, runner: BuildRunnerRegistryEntry) {
  const errors: string[] = [];
  if (metadata.schemaVersion !== 1 || metadata.environment !== "DEV" || metadata.productionAccess !== "DENY") errors.push("ARTIFACT_ENVIRONMENT_INVALID");
  if (!text(metadata.buildId, 180)) errors.push("BUILD_ID_REQUIRED");
  if (metadata.runId !== run.id || metadata.taskId !== run.taskId || metadata.sessionId !== run.sessionId || metadata.workerCode !== run.workerCode) errors.push("ARTIFACT_RUN_IDENTITY_MISMATCH");
  if (metadata.sourceCommit !== run.sourceCommit || metadata.sourceBranch !== run.sourceBranch) errors.push("ARTIFACT_SOURCE_MISMATCH");
  if (!/^[0-9a-f]{64}$/i.test(metadata.artifactSha256)) errors.push("ARTIFACT_SHA256_INVALID");
  if (metadata.runner.id !== runner.id || metadata.runner.hostname !== runner.hostname || run.nodeId !== runner.id) errors.push("ARTIFACT_RUNNER_MISMATCH");
  if (!timestamp(metadata.createdAt)) errors.push("ARTIFACT_CREATED_AT_INVALID");
  return errors;
}
