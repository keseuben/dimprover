"server-only";

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { probeBuildNodes } from "./build-nodes";
import { scheduleBuildRun } from "./build-runner-scheduler";
import { appendGridEvent, readGridState } from "./state-store";
import { claimBuildRunDispatch, claimQueuedBuildRun, createBuildRunIfTaskIdle, patchBuildRun, readBuildJobEvidence, readBuildRunStore } from "./build-run-store";
import type { GridBuildRun, WorkerSession } from "./types";

const TERMINAL = new Set<GridBuildRun["status"]>(["PASS", "FAIL", "BLOCKED"]);

function activeRuns(runs: GridBuildRun[], exceptRunId = "") {
  return runs.filter((run) => run.id !== exceptRunId && (run.status === "ASSIGNED" || run.status === "RUNNING"));
}

function activeSessionForTask(sessions: WorkerSession[], taskId: string, sessionId = "") {
  return sessions.find((session) => session.taskId === taskId && session.endedAt === null && (!sessionId || session.id === sessionId)) || null;
}

function errorWith(code: string, message: string, status = 409): never {
  throw Object.assign(new Error(message), { code, status });
}

function runId() {
  return `grid-build-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

async function buildEvent(run: GridBuildRun, eventType: string, summary: string, extra: Record<string, unknown> = {}) {
  const state = await readGridState();
  const session = state.sessions.find((item) => item.id === run.sessionId) || null;
  await appendGridEvent({
    kind: "build", origin: "LIVE", workerCode: run.workerCode, taskId: run.taskId,
    projectId: state.task?.projectId || "project_dimprover", productionAccess: "DENY",
    developmentContext: session?.developmentContext,
    branch: run.sourceBranch, worktree: session?.sourceProvenance.worktree, head: run.sourceCommit,
    delta: { eventType, summary, runId: run.id, sessionId: run.sessionId, nodeId: run.nodeId, sourceCommit: run.sourceCommit, ...extra },
  });
}

async function spawnAssignedRun(run: GridBuildRun) {
  if (!run.nodeId) return false;
  const claim = await claimBuildRunDispatch(run.id);
  if (!claim.claimed || !claim.run) return false;
  const source = claim.run;
  const nodeId = source.nodeId;
  if (!nodeId) return false;
  const state = await readGridState();
  const session = state.sessions.find((item) => item.id === source.sessionId) || null;
  const candidates = [process.env.DIMPRO_DEVELOPER_GRID_SOURCE_WORKTREE, session?.sourceProvenance.worktree, process.cwd()].filter(Boolean).map((root) => path.join(String(root), "scripts/developer-grid/build-run-job.mjs"));
  const script = candidates.find((candidate) => existsSync(candidate)) || candidates[0] || path.join(process.cwd(), "scripts/developer-grid/build-run-job.mjs");
  if (!existsSync(script)) {
    await patchBuildRun(source.id, { status: "BLOCKED", finishedAt: new Date().toISOString(), failureCode: "BUILD_JOB_SCRIPT_MISSING", exitCode: 1 });
    await buildEvent(source, "BUILD_RESULT", "Build BLOCKED · a központi build-run job script nem található.", { status: "BLOCKED", failureCode: "BUILD_JOB_SCRIPT_MISSING" });
    return false;
  }
  const child = spawn(process.execPath, [script, source.id, source.taskId, source.sessionId, source.workerCode, source.sourceCommit, source.sourceBranch, nodeId], {
    cwd: path.resolve(script, "../../.."), detached: true, stdio: ["ignore", "ignore", "ignore"] as const, env: { ...process.env, DIMPRO_BUILD_RUN_ID: source.id, DIMPRO_PRODUCTION_ACCESS: "DENY" },
  });
  child.unref();
  await buildEvent(source, "BUILD_STARTED", `FULL BUILD átadva a ${nodeId.toUpperCase()} runnernek.`, { status: "ASSIGNED", pid: child.pid || null });
  return true;
}

async function applyEvidence(run: GridBuildRun) {
  const evidence = await readBuildJobEvidence(run.id);
  if (!evidence) return run;
  if (evidence.status === "RUNNING") {
    if (run.status !== "RUNNING" || run.startedAt !== evidence.startedAt) {
      return (await patchBuildRun(run.id, { status: "RUNNING", startedAt: evidence.startedAt, evidenceRef: evidence.evidenceRef })).run;
    }
    return run;
  }
  if (TERMINAL.has(run.status)) return run;
  const patch: Partial<GridBuildRun> = {
    status: evidence.status, nodeId: evidence.nodeId, startedAt: evidence.startedAt, finishedAt: evidence.finishedAt,
    buildId: evidence.buildId, artifactSha256: evidence.artifactSha256, evidenceRef: evidence.evidenceRef,
    resultSha256: evidence.outputSha256, failureCode: evidence.code, exitCode: evidence.exitCode,
  };
  const updated = (await patchBuildRun(run.id, patch)).run;
  await buildEvent(updated, "BUILD_RESULT", evidence.status === "PASS" ? `FULL BUILD PASS · ${evidence.nodeId.toUpperCase()} · BUILD_ID ${evidence.buildId || "—"}.` : `FULL BUILD ${evidence.status} · ${evidence.nodeId.toUpperCase()} · ${evidence.code || "ismeretlen hiba"}.`, {
    status: evidence.status, buildId: evidence.buildId, artifactSha256: evidence.artifactSha256, evidenceRef: evidence.evidenceRef,
    resultSha256: evidence.outputSha256, failureCode: evidence.code, exitCode: evidence.exitCode,
  });
  return updated;
}

async function scheduleQueuedRun(run: GridBuildRun, allRuns: GridBuildRun[]) {
  const nodes = await probeBuildNodes();
  const decision = scheduleBuildRun({
    request: { runId: run.id, taskId: run.taskId, sessionId: run.sessionId, workerCode: run.workerCode, sourceCommit: run.sourceCommit, sourceBranch: run.sourceBranch, requestedAt: run.queuedAt },
    nodes, activeRuns: activeRuns(allRuns, run.id), runHistory: allRuns.filter((item) => TERMINAL.has(item.status)),
  });
  if (decision.decision !== "ASSIGNED" || !decision.run.nodeId) return run;
  const claimed = await claimQueuedBuildRun(run.id, decision.run.nodeId, new Date().toISOString());
  if (!claimed.claimed || !claimed.run || !claimed.run.nodeId) return run;
  await buildEvent(claimed.run, "BUILD_ASSIGNED", `Build queue kiosztva: ${claimed.run.nodeId.toUpperCase()}.`, { status: "ASSIGNED" });
  await spawnAssignedRun(claimed.run);
  return claimed.run;
}

export async function reconcileDeveloperGridBuildRuns() {
  let store = await readBuildRunStore();
  for (const run of [...store.runs]) {
    if (run.status === "ASSIGNED" || run.status === "RUNNING") await applyEvidence(run);
  }
  store = await readBuildRunStore();
  for (const run of store.runs.filter((item) => item.status === "ASSIGNED" && !item.dispatchStartedAt)) await spawnAssignedRun(run);
  store = await readBuildRunStore();
  const queued = store.runs.filter((item) => item.status === "QUEUED").sort((a,b) => Date.parse(a.queuedAt)-Date.parse(b.queuedAt));
  for (const run of queued) {
    store = await readBuildRunStore();
    await scheduleQueuedRun(run, store.runs);
  }
  store = await readBuildRunStore();
  return { ...store, runs: [...store.runs].sort((a,b) => Date.parse(b.queuedAt)-Date.parse(a.queuedAt)) };
}

export async function requestDeveloperGridFullBuild(input: Record<string, unknown>) {
  const taskId = String(input.taskId || "").trim();
  const sessionId = String(input.sessionId || "").trim();
  const state = await readGridState();
  if (!state.task || state.task.id !== taskId) errorWith("BUILD_TASK_MISMATCH", "A FULL BUILD csak az authoritative aktív taskhoz kérhető.");
  const session = activeSessionForTask(state.sessions, taskId, sessionId);
  if (!session) errorWith("BUILD_SESSION_REQUIRED", "A FULL BUILD-hez aktív worker session szükséges.");
  if (session.developmentContext.bootAckState !== "VALIDATED" || !session.developmentContext.bootAckValidatedAt) errorWith("BUILD_BOOT_ACK_REQUIRED", "FULL BUILD csak validált BOOT ACK után indítható.");
  if (session.sourceProvenance.sourceState !== "VERIFIED" || session.sourceProvenance.blockCode) errorWith("SOURCE_BASELINE_MISMATCH", "A source provenance nem VERIFIED; build fail-closed.");
  if (!/^[0-9a-f]{40}$/i.test(session.sourceProvenance.head)) errorWith("BUILD_SOURCE_HEAD_INVALID", "A buildhez teljes 40 karakteres source HEAD szükséges.");
  const store = await reconcileDeveloperGridBuildRuns();
  const duplicateActive = store.runs.find((run) => run.taskId === taskId && !TERMINAL.has(run.status));
  if (duplicateActive) return { reused: true, run: duplicateActive, revision: store.revision, productionAccess: "DENY" as const };
  const requestedAt = new Date().toISOString();
  const request = { runId: runId(), taskId, sessionId: session.id, workerCode: session.workerCode, sourceCommit: session.sourceProvenance.head, sourceBranch: session.sourceProvenance.branch, requestedAt };
  const nodes = await probeBuildNodes();
  const decision = scheduleBuildRun({ request, nodes, activeRuns: activeRuns(store.runs), runHistory: store.runs.filter((run) => TERMINAL.has(run.status)) });
  if (decision.decision === "BLOCKED" || !decision.run) errorWith(decision.code, decision.reason);
  const saved = await createBuildRunIfTaskIdle(decision.run);
  if (!saved.created) return { reused:true, run:saved.run, revision:saved.revision, productionAccess:"DENY" as const };
  await buildEvent(saved.run, decision.decision === "QUEUED" ? "BUILD_QUEUED" : "BUILD_ASSIGNED", decision.reason, { status: decision.run.status });
  if (decision.decision === "ASSIGNED") await spawnAssignedRun(saved.run);
  return { reused: false, run: saved.run, decision: decision.decision, revision: saved.revision, productionAccess: "DENY" as const };
}
