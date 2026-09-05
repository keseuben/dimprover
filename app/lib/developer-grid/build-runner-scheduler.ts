import type { BuildNodeSnapshot } from "./build-nodes";
import {
  getBuildRunnerRegistryEntry,
  listBuildRunnerRegistry,
  runnerSnapshotUsability,
  validateBuildFailureProof,
  validateBuildRunIdentity,
  type BuildFailureProof,
  type BuildRunIdentity,
} from "./build-runner-pool";
import type { GridBuildRun } from "./types";

export type BuildRunRequest = BuildRunIdentity & {
  requestedAt: string;
  retryOfRunId?: string | null;
  failureProof?: BuildFailureProof | null;
};

export type BuildScheduleDecision =
  | { decision: "ASSIGNED"; run: GridBuildRun; reason: string; runnerLocalLock: { mechanism: "flock"; file: string; nonBlocking: true } }
  | { decision: "QUEUED"; run: GridBuildRun; reason: string; runnerLocalLock: null }
  | { decision: "BLOCKED"; run: null; reason: string; code: string; runnerLocalLock: null };

function activeStatus(status: GridBuildRun["status"]) {
  return status === "ASSIGNED" || status === "RUNNING";
}

function terminalStatus(status: GridBuildRun["status"]) {
  return status === "PASS" || status === "FAIL" || status === "BLOCKED";
}

function validTimestamp(value: string) {
  return Number.isFinite(Date.parse(value));
}

function buildRunFromRequest(request: BuildRunRequest, nodeId: GridBuildRun["nodeId"], status: GridBuildRun["status"]): GridBuildRun {
  return {
    id: request.runId,
    taskId: request.taskId,
    sessionId: request.sessionId,
    workerCode: request.workerCode,
    nodeId,
    sourceCommit: request.sourceCommit,
    sourceBranch: request.sourceBranch,
    status,
    retryOfRunId: request.retryOfRunId || null,
    runnerLocalLockRequired: true,
    productionAccess: "DENY",
    buildId: null,
    artifactSha256: null,
    queuedAt: request.requestedAt,
    assignedAt: status === "ASSIGNED" ? request.requestedAt : null,
    startedAt: null,
    finishedAt: null,
  };
}

export function scheduleBuildRun(input: {
  request: BuildRunRequest;
  nodes: BuildNodeSnapshot[];
  activeRuns?: GridBuildRun[];
  runHistory?: GridBuildRun[];
}): BuildScheduleDecision {
  const activeRuns = input.activeRuns || [];
  const runHistory = input.runHistory || [];
  const identityErrors = validateBuildRunIdentity(input.request);
  if (!validTimestamp(input.request.requestedAt)) identityErrors.push("REQUESTED_AT_INVALID");
  if (identityErrors.length) {
    return { decision: "BLOCKED", run: null, reason: identityErrors.join(" · "), code: "BUILD_RUN_IDENTITY_INVALID", runnerLocalLock: null };
  }

  const duplicate = [...activeRuns, ...runHistory].find((run) => run.id === input.request.runId);
  if (duplicate) {
    return { decision: "BLOCKED", run: null, reason: `A runId már létezik: ${input.request.runId}`, code: "BUILD_RUN_ID_ALREADY_EXISTS", runnerLocalLock: null };
  }

  if (input.request.retryOfRunId) {
    const previous = runHistory.find((run) => run.id === input.request.retryOfRunId) || null;
    const proofErrors = validateBuildFailureProof(input.request.failureProof, previous);
    if (previous && (previous.taskId !== input.request.taskId || previous.sourceCommit !== input.request.sourceCommit)) proofErrors.push("REQUEUE_SOURCE_IDENTITY_MISMATCH");
    if (proofErrors.length) {
      return { decision: "BLOCKED", run: null, reason: proofErrors.join(" · "), code: "BUILD_REQUEUE_NOT_PROVEN", runnerLocalLock: null };
    }
  } else if (input.request.failureProof) {
    return { decision: "BLOCKED", run: null, reason: "Failure proof csak explicit retryOfRunId mellett adható meg.", code: "BUILD_REQUEUE_CONTEXT_INVALID", runnerLocalLock: null };
  }

  const nodeMap = new Map(input.nodes.map((node) => [node.id, node]));
  for (const runner of listBuildRunnerRegistry()) {
    const node = nodeMap.get(runner.id);
    if (!node) continue;
    const usability = runnerSnapshotUsability(node);
    if (!usability.usable) continue;
    const reserved = activeRuns.some((run) => run.nodeId === runner.id && activeStatus(run.status));
    if (reserved) continue;
    const run = buildRunFromRequest(input.request, runner.id, "ASSIGNED");
    return {
      decision: "ASSIGNED",
      run,
      reason: `${runner.hostname} READY és FREE; priority=${runner.priority}.`,
      runnerLocalLock: { ...runner.localLock },
    };
  }

  const terminalDuplicate = activeRuns.find((run) => run.id === input.request.runId && terminalStatus(run.status));
  if (terminalDuplicate) {
    return { decision: "BLOCKED", run: null, reason: "Lezárt runId nem ütemezhető újra új runId nélkül.", code: "BUILD_RUN_TERMINAL_DUPLICATE", runnerLocalLock: null };
  }

  return {
    decision: "QUEUED",
    run: buildRunFromRequest(input.request, null, "QUEUED"),
    reason: "Nincs egyszerre READY és FREE build runner; a FULL BUILD várólistára kerül.",
    runnerLocalLock: null,
  };
}

export function assertRunnerAssignmentCanStart(input: { run: GridBuildRun; node: BuildNodeSnapshot }) {
  const runner = input.run.nodeId ? getBuildRunnerRegistryEntry(input.run.nodeId) : null;
  if (!runner || input.run.status !== "ASSIGNED" || input.node.id !== runner.id) {
    const error = new Error("A build run nincs érvényes runnerhez rendelve.");
    Object.assign(error, { code: "BUILD_RUN_ASSIGNMENT_INVALID" });
    throw error;
  }
  const usability = runnerSnapshotUsability(input.node);
  if (!usability.usable) {
    const error = new Error(`A kijelölt runner már nem indítható: ${usability.reason}`);
    Object.assign(error, { code: "BUILD_RUNNER_REVALIDATION_FAILED", reason: usability.reason });
    throw error;
  }
  return { runner, localLock: { ...runner.localLock }, productionAccess: "DENY" as const };
}
