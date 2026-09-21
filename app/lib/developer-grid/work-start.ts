"server-only";

import { createHash } from "node:crypto";
import { advanceDevEngineSession, advanceDevEngineTaskManualBridge, assertDevEngineOperation, autoRouteDevEngineTaskByAvailability, createDevEngineTask, ensureDeveloperGridCodingWorkerRegistry, getDevCenterEngineState, recoverClosedDevEngineTaskManualBridgeSession, startDevEngineTaskManualBridge } from "@/app/lib/dev-center/engine-repository";
import { estimateDevelopmentMinutes } from "@/app/lib/dev-center/benai-dispatch";
import { acquireScopeBundleAtomic } from "@/app/lib/dev-center/orchestration-repository";
import { resolveDeveloperConsoleRepositoryId } from "@/app/lib/dev-center/developer-console";
import { listDevelopmentHandoffs } from "@/app/lib/dev-center/handoff-store";
import { DEVELOPER_GRID_PROJECT_ID, getDeveloperGridFoundation } from "./foundation";
import { findLatestContinuationContext } from "./conversation-memory";
import { verifyCurrentSourceExecutionState, verifySourceProvenance } from "./source-provenance";
import { ensureDeveloperWorkerWorkspace } from "./worker-workspace";
import { appendGridEvent, materializeGridTaskSession, readGridState, upsertGridTask, upsertWorkerSession } from "./state-store";
import type { ChatLaunchMode, CoreWorkerCode, DevelopmentContext, DeveloperGridTask, RoutableWorkerCode, SourceExecutionProof, WorkerSession, WorkerSurfaceType } from "./types";

export const WORK_START_MIN_LENGTH = 12;
export const WORK_START_MAX_LENGTH = 12000;
export const WORK_START_IDEMPOTENCY_MAX = 160;

const text = (value: unknown, max = WORK_START_MAX_LENGTH) => String(value ?? "").trim().slice(0, max);

function derivedVerifiedSourceProvenanceProofSha256(session: WorkerSession) {
  const p = session.sourceProvenance;
  if (String(p?.sourceState || "").toUpperCase() !== "VERIFIED") return "";
  const payload = {
    repository:String(p.repository || ""),
    worktree:String(p.worktree || ""),
    branch:String(p.branch || ""),
    head:String(p.head || "").toLowerCase(),
    worker:String(p.worker || "").toUpperCase(),
    taskId:String(p.taskId || ""),
    sessionId:String(p.sessionId || ""),
    verifiedAt:String(p.verifiedAt || ""),
    sourceState:"VERIFIED",
  };
  if (!payload.repository || !payload.worktree || !payload.branch || !/^[0-9a-f]{40}$/.test(payload.head)
      || !payload.worker || !payload.taskId || !payload.sessionId || !payload.verifiedAt) return "";
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function normalizeWorkStartInput(input: Record<string, unknown>) {
  const sourcePrompt = text(input.sourcePrompt);
  const projectId = text(input.projectId, 180) || DEVELOPER_GRID_PROJECT_ID;
  const moduleName = text(input.moduleName, 180) || "Developer Grid V1";
  const submoduleName = text(input.submoduleName, 180) || null;
  const idempotencyKey = text(input.idempotencyKey, WORK_START_IDEMPOTENCY_MAX);
  const rawChatLaunchMode = text(input.chatLaunchMode, 40).toUpperCase();
  const chatLaunchMode: ChatLaunchMode = rawChatLaunchMode === "NEW_PROJECT_CHAT" ? "NEW_PROJECT_CHAT" : "EXISTING_CHAT";
  const rawSurfaceType = text(input.surfaceType, 40).toUpperCase();
  if (rawSurfaceType && !["CHATGPT", "CODEX", "WORK"].includes(rawSurfaceType)) {
    const error = new Error("Ismeretlen Developer Grid worker surface. A munkaindítás fail-closed.");
    Object.assign(error, { code: "DEVELOPER_GRID_SURFACE_INVALID", status: 400 });
    throw error;
  }
  const surfaceType: WorkerSurfaceType = rawSurfaceType === "CODEX" ? "CODEX" : rawSurfaceType === "WORK" ? "WORK" : "CHATGPT";
  if (surfaceType !== "CHATGPT") {
    const error = new Error(surfaceType === "CODEX"
      ? "A Codex OpenAI first-party surface Task Bridge végrehajtást használ. A ChatGPT work-start/BOOT ACK útvonalon Codex task nem hozható létre; használd a /api/dev/grid/task-bridge kaput."
      : "A Work OpenAI first-party surface v0.1.65-re van előkészítve. Task létrehozása a v0.1.64 Rollover Hotfix fejlesztésben továbbra is tiltott.");
    Object.assign(error, { code: surfaceType === "CODEX" ? "CODEX_TASK_BRIDGE_REQUIRED" : "WORK_SURFACE_PLANNED_V0159", status: 409 });
    throw error;
  }
  const rawPreferredWorkerCode = text(input.preferredWorkerCode, 40).toUpperCase();
  if (!rawPreferredWorkerCode || rawPreferredWorkerCode === "AUTO") {
    const error = new Error("A munka indításához explicit kódmérnök kiválasztása kötelező. Automatikus vagy rejtett worker-fallback tiltott.");
    Object.assign(error, { code: "DEVELOPER_GRID_WORKER_REQUIRED", status: 400 });
    throw error;
  }
  const preferredWorkerCode: RoutableWorkerCode | null = ["ARMINAI", "OUTMINAI", "BENJAMINAI", "JAZMINAI"].includes(rawPreferredWorkerCode)
    ? rawPreferredWorkerCode as RoutableWorkerCode
    : null;
  if (!preferredWorkerCode) {
    const error = new Error("A kiválasztott Developer Grid worker nem routolható.");
    Object.assign(error, { code: "DEVELOPER_GRID_WORKER_PREFERENCE_INVALID", status: 400 });
    throw error;
  }
  if (sourcePrompt.length < WORK_START_MIN_LENGTH) {
    const error = new Error(`A fejlesztési utasítás legalább ${WORK_START_MIN_LENGTH} karakter legyen.`);
    Object.assign(error, { code: "DEVELOPER_GRID_WORK_PROMPT_TOO_SHORT", status: 400 });
    throw error;
  }
  if (!idempotencyKey || idempotencyKey.length < 8) {
    const error = new Error("A munkaindításhoz érvényes idempotencyKey szükséges.");
    Object.assign(error, { code: "DEVELOPER_GRID_WORK_IDEMPOTENCY_REQUIRED", status: 400 });
    throw error;
  }
  return { sourcePrompt, projectId, moduleName, submoduleName, idempotencyKey, chatLaunchMode, surfaceType, preferredWorkerCode };
}

export function workStartTaskId(idempotencyKey: string) {
  return `dev-task-grid-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 20)}`;
}

export function workStartTitle(sourcePrompt: string) {
  return sourcePrompt.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 180) || "Új fejlesztési feladat";
}

function routableWorkerCode(value: unknown): RoutableWorkerCode | null {
  const code = String(value || "").trim().toUpperCase();
  if (code === "ARMINAI" || code === "OUTMINAI" || code === "BENJAMINAI" || code === "JAZMINAI") return code;
  return null;
}

function routedWorkerCodeFromTask(task: Record<string, unknown>, metadata: Record<string, unknown>): RoutableWorkerCode | null {
  const selection = metadata.coordinatorSelection && typeof metadata.coordinatorSelection === "object" ? metadata.coordinatorSelection as Record<string, unknown> : {};
  const selectedLegacy = metadata.coordinatorSelectedWorker && typeof metadata.coordinatorSelectedWorker === "object" ? metadata.coordinatorSelectedWorker as Record<string, unknown> : {};
  const byMetadata = routableWorkerCode(selection.workerCode || selectedLegacy.workerCode || metadata.coordinatorSelectedWorkerCode || metadata.coordinatorChainWorkerCode);
  if (byMetadata) return byMetadata;
  const requestedWorkerId = String(task.requestedWorkerId || "").trim().toLowerCase();
  if (requestedWorkerId === "worker_arminai") return "ARMINAI";
  if (requestedWorkerId === "worker_outminai") return "OUTMINAI";
  if (requestedWorkerId === "worker_benjaminai") return "BENJAMINAI";
  if (requestedWorkerId === "worker_jazminai") return "JAZMINAI";
  return null;
}

function workerCodeFromWorkerId(value: unknown): RoutableWorkerCode | null {
  const id = String(value || "").trim().toLowerCase();
  if (id === "worker_arminai") return "ARMINAI";
  if (id === "worker_outminai") return "OUTMINAI";
  if (id === "worker_benjaminai") return "BENJAMINAI";
  if (id === "worker_jazminai") return "JAZMINAI";
  return null;
}

function normalizedHandoffWorkerCode(value: unknown): RoutableWorkerCode | null {
  const code = String(value || "").trim().toUpperCase();
  if (code === "BENAI") return "BENJAMINAI";
  return routableWorkerCode(code);
}

async function syncEngineBridgeTarget(taskId: string, target: "HANDED_OFF" | "RUNNING") {
  const engineState = await getDevCenterEngineState();
  const task = engineState.tasks.find((item) => item.id === taskId) || null;
  if (!task) {
    const error = new Error("A Central Core engine task nem található.");
    Object.assign(error, { code: "DEVELOPER_GRID_ENGINE_TASK_MISSING", status: 409 });
    throw error;
  }
  const metadata = task.metadata && typeof task.metadata === "object" ? task.metadata as Record<string, unknown> : {};
  const current = text(metadata.bridgeState, 40).toUpperCase();
  if (target === "HANDED_OFF") {
    if (current === "WAITING_HANDOFF") return advanceDevEngineTaskManualBridge({ taskId, target: "HANDED_OFF" });
    if (["HANDED_OFF", "RUNNING", "RESULT_PENDING"].includes(current)) return { ok: true as const, task, bridgeState: current };
  }
  if (target === "RUNNING") {
    if (current === "WAITING_HANDOFF") await advanceDevEngineTaskManualBridge({ taskId, target: "HANDED_OFF" });
    const refreshedState = await getDevCenterEngineState();
    const refreshedTask = refreshedState.tasks.find((item) => item.id === taskId) || null;
    const refreshedMeta = refreshedTask?.metadata && typeof refreshedTask.metadata === "object" ? refreshedTask.metadata as Record<string, unknown> : {};
    const refreshed = text(refreshedMeta.bridgeState, 40).toUpperCase();
    if (refreshed === "HANDED_OFF") return advanceDevEngineTaskManualBridge({ taskId, target: "RUNNING" });
    if (["RUNNING", "RESULT_PENDING"].includes(refreshed)) return { ok: true as const, task: refreshedTask, bridgeState: refreshed };
  }
  const error = new Error(`A Central Core engine bridge nem vihető ${target} állapotba: ${current || "NINCS"}.`);
  Object.assign(error, { code: "DEVELOPER_GRID_ENGINE_BRIDGE_STATE_MISMATCH", status: 409 });
  throw error;
}

async function resolveContinuityContext(engineState: Awaited<ReturnType<typeof getDevCenterEngineState>>, input: ReturnType<typeof normalizeWorkStartInput>, currentTaskId: string) {
  const candidates = engineState.tasks
    .filter((task) => task.id !== currentTaskId && task.projectId === input.projectId)
    .filter((task) => !["queued", "ready"].includes(String(task.status || "").toLowerCase()))
    .filter((task) => {
      const meta = task.metadata && typeof task.metadata === "object" ? task.metadata as Record<string, unknown> : {};
      const sameModule = String(meta.moduleName || "").trim().toLowerCase() === input.moduleName.trim().toLowerCase();
      const expectedSub = String(input.submoduleName || "").trim().toLowerCase();
      const actualSub = String(meta.submoduleName || "").trim().toLowerCase();
      return sameModule && (!expectedSub || !actualSub || actualSub === expectedSub);
    })
    .sort((a, b) => Date.parse(String(b.updatedAt || b.completedAt || b.createdAt || "")) - Date.parse(String(a.updatedAt || a.completedAt || a.createdAt || "")));
  const previousTask = candidates[0] || null;
  const previousWorkerCode = previousTask ? workerCodeFromWorkerId(previousTask.assignedWorkerId || previousTask.requestedWorkerId) : null;
  let handoff = null as Awaited<ReturnType<typeof listDevelopmentHandoffs>>[number] | null;
  try {
    const handoffs = await listDevelopmentHandoffs();
    handoff = (previousTask ? handoffs.find((item) => item.taskId === previousTask.id) : null)
      || handoffs.find((item) => item.project.trim().toLowerCase() === input.projectId.trim().toLowerCase()
        && item.module.trim().toLowerCase() === input.moduleName.trim().toLowerCase()
        && (!input.submoduleName || !item.contextModule || item.contextModule.trim().toLowerCase() === input.submoduleName.trim().toLowerCase()))
      || null;
  } catch { handoff = null; }
  const handoffWorkerCode = handoff ? normalizedHandoffWorkerCode(handoff.workerCode) : null;
  let contextSnapshot = null as Awaited<ReturnType<typeof findLatestContinuationContext>>;
  try {
    contextSnapshot = await findLatestContinuationContext({ projectId: input.projectId, moduleName: input.moduleName, submoduleName: input.submoduleName, excludeTaskId: currentTaskId });
  } catch { contextSnapshot = null; }
  return {
    previousTaskId: handoff?.taskId || contextSnapshot?.taskId || previousTask?.id || null,
    previousWorkerCode: handoffWorkerCode || contextSnapshot?.workerCode || previousWorkerCode,
    handoffId: handoff?.id || null,
    handoffSummary: handoff?.summary || null,
    contextSnapshotId: contextSnapshot?.id || null,
    contextRevision: contextSnapshot?.revision || null,
    contextSummary: contextSnapshot?.summary || null,
  };
}

function sourceExecutionProofSha256(input: Omit<SourceExecutionProof, "sha256">) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
function reusableSourceExecutionProof(existing: SourceExecutionProof | null | undefined, fresh: SourceExecutionProof) {
  if (!existing) return null;
  const { sha256, ...base } = existing;
  if (!/^[0-9a-f]{64}$/.test(String(sha256 || "").toLowerCase())) return null;
  if (sourceExecutionProofSha256(base) !== String(sha256).toLowerCase()) return null;
  if (existing.state !== "VERIFIED" || existing.authority !== "CENTRAL_CORE" || existing.handshakeStage !== "READY" || existing.productionAccess !== "DENY") return null;
  if (existing.repository !== fresh.repository || existing.worktree !== fresh.worktree || existing.branch !== fresh.branch || existing.head !== fresh.head || existing.engineSessionId !== fresh.engineSessionId) return null;
  if (Number(fresh.activeScopeLockCount || 0) < 1 || Number(fresh.activeWorktreeLeaseCount || 0) < 1) return null;
  return existing;
}

async function ensureDeveloperGridReadyExecution(input: {
  taskId: string;
  workerCode: RoutableWorkerCode;
  engineSessionId: string;
  baseHead: string;
  scope: Array<{ type: "module"; key: string }>;
  gridSessionId: string;
}) {
  if (!input.engineSessionId) throw Object.assign(new Error("A Developer Grid READY preflighthoz Dev Center engine session szükséges."), { code:"DEVELOPER_GRID_ENGINE_SESSION_REQUIRED", status:409 });

  let state = await getDevCenterEngineState();
  let engineSession = state.sessions.find((item) => item.id === input.engineSessionId) || null;
  if (!engineSession) throw Object.assign(new Error("A Developer Grid Dev Center session nem található."), { code:"DEVELOPER_GRID_ENGINE_SESSION_MISSING", status:409 });
  if (engineSession.taskId !== input.taskId) throw Object.assign(new Error("A Dev Center session más taskhoz tartozik."), { code:"DEVELOPER_GRID_ENGINE_SESSION_TASK_MISMATCH", status:409 });

  const workspace = await ensureDeveloperWorkerWorkspace({ workerCode:input.workerCode, taskId:input.taskId, baseCommit:input.baseHead });
  if (engineSession.handshakeStage === "READY") {
    const boundWorktree = String(engineSession.worktreePath || "").replace(/\\/g,"/").replace(/\/+$/g,"");
    const expectedWorktree = String(workspace.worktreePath || "").replace(/\\/g,"/").replace(/\/+$/g,"");
    if (engineSession.branchName !== workspace.branchName || boundWorktree !== expectedWorktree) {
      throw Object.assign(new Error("A READY Dev Center session branch/worktree bindingje eltér a task-specifikus workspace-től."), {
        code:"DEVELOPER_GRID_READY_BINDING_MISMATCH", status:409,
        details:{ expectedBranch:workspace.branchName, actualBranch:engineSession.branchName, expectedWorktree, actualWorktree:boundWorktree },
      });
    }
  }

  if (engineSession.handshakeStage === "TASK_BOUND") {
    const branch = await advanceDevEngineSession(input.engineSessionId, "bind_branch", { branchName:workspace.branchName });
    if (!branch.ok) throw Object.assign(new Error(branch.error || "A task branch binding sikertelen."), { code:"DEVELOPER_GRID_BRANCH_BIND_FAILED", status:409 });
    engineSession = branch.session || engineSession;
  }
  if (engineSession.handshakeStage === "BRANCH_BOUND") {
    const worktree = await advanceDevEngineSession(input.engineSessionId, "bind_worktree", { worktreePath:workspace.worktreePath });
    if (!worktree.ok) throw Object.assign(new Error(worktree.error || "A task worktree binding sikertelen."), { code:"DEVELOPER_GRID_WORKTREE_BIND_FAILED", status:409 });
    engineSession = worktree.session || engineSession;
  }
  if (engineSession.handshakeStage === "WORKTREE_BOUND") {
    await acquireScopeBundleAtomic({ sessionId:input.engineSessionId, scope:input.scope, leaseSeconds:900 });
    state = await getDevCenterEngineState();
    engineSession = state.sessions.find((item) => item.id === input.engineSessionId) || null;
  }
  if (!engineSession || engineSession.handshakeStage !== "READY" || engineSession.status !== "active") {
    throw Object.assign(new Error(`A Developer Grid worker session nem READY (${engineSession?.handshakeStage || "MISSING"}). Launch Packet nem küldhető.`), { code:"DEVELOPER_GRID_ENGINE_NOT_READY", status:409 });
  }

  const operation = await assertDevEngineOperation(input.engineSessionId, "write");
  const provenance = await verifySourceProvenance({
    repository: workspace.repository,
    worktree: workspace.worktreePath,
    branch: workspace.branchName,
    expectedHead: input.baseHead,
    worker: input.workerCode,
    taskId: input.taskId,
    sessionId: input.gridSessionId,
  });
  if (provenance.sourceState !== "VERIFIED" || provenance.blockCode) {
    const code = provenance.blockCode || "SOURCE_BASELINE_MISMATCH";
    throw Object.assign(new Error(`BLOCKED · ${code} · ${provenance.reasons.join("; ")}`), { code, status:409, provenance });
  }

  state = await getDevCenterEngineState();
  const freshTask = state.tasks.find((item) => item.id === input.taskId) || null;
  const freshSession = state.sessions.find((item) => item.id === input.engineSessionId) || null;
  if (!freshTask || !freshSession || freshSession.handshakeStage !== "READY") {
    throw Object.assign(new Error("A READY handshake utáni authoritative task/session nem olvasható."), { code:"DEVELOPER_GRID_READY_STATE_MISSING", status:409 });
  }
  if (freshTask.claimedBySessionId !== input.engineSessionId || freshTask.assignedWorkerId !== freshSession.workerId) {
    throw Object.assign(new Error("A READY task ownership eltér a session/worker kötéstől."), { code:"DEVELOPER_GRID_READY_OWNERSHIP_MISMATCH", status:409 });
  }

  const proofBase: Omit<SourceExecutionProof, "sha256"> = {
    schemaVersion:1,
    state:"VERIFIED",
    authority:"CENTRAL_CORE",
    verifiedAt:new Date().toISOString(),
    repository:provenance.repository,
    worktree:provenance.worktree,
    branch:provenance.branch,
    head:provenance.head,
    engineSessionId:input.engineSessionId,
    handshakeStage:"READY",
    activeScopeLockCount:Number(operation.activeLockCount || 0),
    activeWorktreeLeaseCount:Number(operation.activeWorktreeLeaseCount || 0),
    productionAccess:"DENY",
  };
  const proof: SourceExecutionProof = { ...proofBase, sha256:sourceExecutionProofSha256(proofBase) };
  return { workspace, provenance, proof, engineTask:freshTask, engineSession:freshSession };
}

function strictCoreWorkerCode(value: unknown): CoreWorkerCode {
  const code = String(value || "").trim().toUpperCase();
  if (code === "ARMINAI" || code === "OUTMINAI" || code === "JAZMINAI" || code === "BENJAMINAI") return code;
  if (code === "BENAI") return "BENJAMINAI";
  const error = new Error("Ismeretlen Developer Grid worker; conversation binding tiltva.");
  Object.assign(error, { code: "DEVELOPER_GRID_CHAT_WORKER_INVALID", status: 400 });
  throw error;
}

export function gridTaskStatusFromEngine(rawStatusValue: unknown, bridgeStateValue: unknown): DeveloperGridTask["status"] {
  const rawStatus = String(rawStatusValue || "").toLowerCase();
  const bridgeState = text(bridgeStateValue, 40).toUpperCase();
  const claimedAwaitingBootAck = rawStatus === "claimed" && !["RUNNING", "RESULT_PENDING"].includes(bridgeState);
  return rawStatus === "completed" ? "COMPLETED"
    : rawStatus === "cancelled" ? "CANCELLED"
      : rawStatus === "blocked" || rawStatus === "failed" ? "BLOCKED"
      : rawStatus === "testing" ? "REVIEW"
        : rawStatus === "queued" || rawStatus === "ready" || claimedAwaitingBootAck ? "READY" : "RUNNING";
}

function gridTaskFromEngine(task: Record<string, unknown>): DeveloperGridTask {
  const metadata = task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata) ? task.metadata as Record<string, unknown> : {};
  const status = gridTaskStatusFromEngine(task.status, metadata.bridgeState);
  return {
    id: String(task.id || ""),
    projectId: String(task.projectId || DEVELOPER_GRID_PROJECT_ID),
    title: String(task.title || "Új fejlesztési feladat").slice(0, 500),
    priority: Number.isFinite(Number(task.priority)) ? Number(task.priority) : 80,
    environment: "DEV",
    productionAccess: "DENY",
    status,
    acceptance: Array.isArray(task.acceptance) ? task.acceptance.map(String).filter(Boolean).slice(0, 100) : [],
  };
}

export async function getDeveloperGridActiveWork() {
  let state = await readGridState();
  let task = state.task;
  const allActiveSessions = state.sessions.filter((session) => session.endedAt === null);
  let sessions = task ? allActiveSessions.filter((session) => session.taskId === task?.id) : [];
  const reasons: string[] = [];
  let reconciledFromActiveSession = false;

  // A várólistás task nem írhatja felül a ténylegesen futó/BOOT ACK-ra váró session taskját.
  // Ha a persistent task pointer elszakadt az aktív sessiontől, az engine authoritative task rekordjából visszaállítjuk.
  if ((!task || sessions.length === 0) && allActiveSessions.length > 0) {
    const activeSession = [...allActiveSessions].sort((a, b) => Date.parse(b.startedAt || "") - Date.parse(a.startedAt || ""))[0];
    try {
      const engineState = await getDevCenterEngineState();
      const engineTask = engineState.tasks.find((item) => item.id === activeSession.taskId) || null;
      if (engineTask && !["completed", "blocked", "failed", "cancelled"].includes(String(engineTask.status || "").toLowerCase())) {
        task = gridTaskFromEngine(engineTask as unknown as Record<string, unknown>);
        state = await upsertGridTask(task);
        sessions = state.sessions.filter((session) => session.endedAt === null && session.taskId === task?.id);
        reconciledFromActiveSession = sessions.length > 0;
        if (reconciledFromActiveSession) reasons.push("AUTHORITATIVE_TASK_RESTORED_FROM_ACTIVE_SESSION");
      }
    } catch {
      // Fail-closed: ha az engine nem ellenőrizhető, a lenti ACTIVE_SESSION_MISSING/BLOCKED állapot marad.
    }
  }

  const activeSession = sessions[0] || null;
  let executionState = "CURRENT" as "CURRENT" | "STALE" | "BLOCKED" | "EMPTY";
  let actualHead: string | null = null;
  const ageSource = activeSession?.developmentContext?.resolvedAt || activeSession?.startedAt || state.updatedAt;
  const ageHours = ageSource && Number.isFinite(Date.parse(ageSource)) ? Math.max(0, (Date.now() - Date.parse(ageSource)) / 3_600_000) : null;
  const terminalTask = Boolean(task && ["COMPLETED", "BLOCKED", "CANCELLED"].includes(task.status));
  if (!task) executionState = "EMPTY";
  else if (!activeSession && terminalTask) executionState = "CURRENT";
  else if (!activeSession) { executionState = "BLOCKED"; reasons.push("ACTIVE_SESSION_MISSING"); }
  else {
    try {
      const current = await verifyCurrentSourceExecutionState(activeSession.sourceProvenance, { requireClean: false });
      actualHead = current.head;
    } catch (error) {
      executionState = "STALE";
      reasons.push(error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "SOURCE_EXECUTION_STALE") : "SOURCE_EXECUTION_STALE");
    }
    if (ageHours !== null && ageHours > 72) { executionState = "STALE"; reasons.push("AUTHORITATIVE_STATE_OLDER_THAN_72H"); }
  }
  return { task, sessions, revision: state.revision, updatedAt: state.updatedAt, reconciliation: { state: executionState, reasons: [...new Set(reasons)], ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10, authoritativeHead: activeSession?.sourceProvenance.head || null, actualHead, reconciledFromActiveSession } };
}

export async function startDeveloperGridWork(rawInput: Record<string, unknown>) {
  const input = normalizeWorkStartInput(rawInput);
  const foundation = await getDeveloperGridFoundation();
  if (foundation.sourceProvenance.sourceState !== "VERIFIED") {
    const code = foundation.sourceProvenance.blockCode || "SOURCE_BASELINE_MISMATCH";
    const error = new Error(`BLOCKED · ${code} · ${foundation.sourceProvenance.reasons.join("; ")}`);
    Object.assign(error, { code, status: 409, provenance: foundation.sourceProvenance });
    throw error;
  }

  const taskId = workStartTaskId(input.idempotencyKey);
  await ensureDeveloperGridCodingWorkerRegistry();
  const engineState = await getDevCenterEngineState();
  const continuity = await resolveContinuityContext(engineState, input, taskId);
  // Handoff/continuity kizárólag kontextust adhat. Worker-választást nem írhat felül.
  const routingPreference = input.preferredWorkerCode;
  const routingPreferenceSource = "BENJADMIN_EXPLICIT";
  const estimate = estimateDevelopmentMinutes(input.sourcePrompt);
  let engineTask = engineState.tasks.find((task) => task.id === taskId) || null;
  let reused = Boolean(engineTask);
  if (engineTask) {
    const metadata = engineTask.metadata && typeof engineTask.metadata === "object" ? engineTask.metadata as Record<string, unknown> : {};
    if (String(metadata.sourcePrompt || "") !== input.sourcePrompt
      || String(metadata.chatLaunchMode || "EXISTING_CHAT") !== input.chatLaunchMode
      || String(metadata.preferredWorkerCode || "") !== String(input.preferredWorkerCode || "")) {
      const error = new Error("Az idempotencyKey már más tartalmú munkaindításhoz tartozik.");
      Object.assign(error, { code: "DEVELOPER_GRID_WORK_IDEMPOTENCY_CONFLICT", status: 409 });
      throw error;
    }
  } else {
    const repositoryId = await resolveDeveloperConsoleRepositoryId(input.projectId);
    if (!repositoryId) {
      const error = new Error("A kiválasztott projekthez nincs aktív repository-kötés; a munka nem indítható biztonságosan.");
      Object.assign(error, { code: "DEVELOPER_GRID_REPOSITORY_BINDING_REQUIRED", status: 409 });
      throw error;
    }
    let created = null;
    try {
      created = await createDevEngineTask({
        id: taskId,
        projectId: input.projectId,
        repositoryId,
        title: workStartTitle(input.sourcePrompt),
        description: input.sourcePrompt,
        priority: 90,
        createdBy: "BenjAdmin",
        scope: [{ type: "module", key: input.moduleName }],
        metadata: {
          origin: "BENJADMIN_DEVELOPER_GRID_WORK_START",
          sourcePrompt: input.sourcePrompt,
          sourcePromptPreserved: true,
          chatLaunchMode: input.chatLaunchMode,
          preferredWorkerCode: input.preferredWorkerCode,
          routingPreferenceSource,
          continuityPreviousTaskId: continuity.previousTaskId,
          continuityPreviousWorkerCode: continuity.previousWorkerCode,
          continuityHandoffId: continuity.handoffId,
          continuityHandoffSummary: continuity.handoffSummary,
          idempotencyKey: input.idempotencyKey,
          mainModule: "BENJADMIN",
          moduleName: input.moduleName,
          submoduleName: input.submoduleName,
          estimateMinutes: estimate.minutes,
          estimateMinMinutes: estimate.minMinutes,
          estimateMaxMinutes: estimate.maxMinutes,
          estimateSource: estimate.source,
          productionAccess: "DENY",
        },
        acceptance: [
          "DEV ONLY · PROD DENY.",
          "Az eredeti sourcePrompt változtatás nélkül megőrzendő.",
          "Source provenance fail-closed.",
          "Authoritative task/context state delta csatornán terjed.",
        ],
      });
    } catch (createError) {
      const afterConflict = await getDevCenterEngineState();
      const existing = afterConflict.tasks.find((task) => task.id === taskId) || null;
      const existingMeta = existing?.metadata && typeof existing.metadata === "object" ? existing.metadata as Record<string, unknown> : {};
      if (!existing || String(existingMeta.sourcePrompt || "") !== input.sourcePrompt
        || String(existingMeta.chatLaunchMode || "EXISTING_CHAT") !== input.chatLaunchMode
        || String(existingMeta.preferredWorkerCode || "") !== String(input.preferredWorkerCode || "")) throw createError;
      engineTask = existing;
      reused = true;
    }
    if (!engineTask) {
      if (!created?.ok) throw Object.assign(new Error(created?.error || "A Developer Grid task nem hozható létre."), { code: "DEVELOPER_GRID_WORK_CREATE_FAILED", status: 400 });
      engineTask = created.task;
    }
  }

  let preRoutingMetadata = engineTask.metadata && typeof engineTask.metadata === "object" ? engineTask.metadata as Record<string, unknown> : {};
  let preRoutedCode = routedWorkerCodeFromTask(engineTask as unknown as Record<string, unknown>, preRoutingMetadata);
  if (!preRoutedCode && ["queued", "ready"].includes(String(engineTask.status || "").toLowerCase())) {
    const routed = await autoRouteDevEngineTaskByAvailability({
      taskId,
      estimateMinutes: estimate.minutes,
      preferredWorkerCode: routingPreference,
      preferencePolicy: "STRICT",
      orchestrationSource: "CENTRAL_CORE",
      note: `Developer Grid Vezérlőpult · BenjAdmin explicit worker: ${input.preferredWorkerCode} · automatic fallback DENY`,
      prepareForPlusPull: true,
      chainSource: reused ? "DEVELOPER_GRID_WORK_START_RETRY" : "DEVELOPER_GRID_WORK_START",
    });
    engineTask = routed.task;
    preRoutingMetadata = engineTask.metadata && typeof engineTask.metadata === "object" ? engineTask.metadata as Record<string, unknown> : {};
    preRoutedCode = routedWorkerCodeFromTask(engineTask as unknown as Record<string, unknown>, preRoutingMetadata);
  }

  const metadata = engineTask.metadata && typeof engineTask.metadata === "object" ? engineTask.metadata as Record<string, unknown> : {};
  const routedCode = routedWorkerCodeFromTask(engineTask as unknown as Record<string, unknown>, metadata);
  if (routedCode && routedCode !== input.preferredWorkerCode) {
    const error = new Error(`A Central Core eltérő workert adott vissza (${routedCode}) a BenjAdmin által kijelölt ${input.preferredWorkerCode} helyett. Indítás fail-closed.`);
    Object.assign(error, { code: "DEVELOPER_GRID_WORKER_ROUTE_MISMATCH", status: 409 });
    throw error;
  }
  let engineSessionId: string | null = null;
  const gridSessionId = routedCode ? `grid-work-${taskId}-${routedCode.toLowerCase()}` : "";
  let readyExecution: Awaited<ReturnType<typeof ensureDeveloperGridReadyExecution>> | null = null;
  if (routedCode) {
    const currentStatus = String(engineTask.status || "").toLowerCase();
    if (["queued", "ready"].includes(currentStatus)) {
      const started = await startDevEngineTaskManualBridge(taskId);
      engineTask = started.task;
      engineSessionId = started.session?.id || null;
    } else {
      const currentMetadata = engineTask.metadata && typeof engineTask.metadata === "object" ? engineTask.metadata as Record<string, unknown> : {};
      engineSessionId = text(currentMetadata.activeSessionId, 240) || null;
    }
    if (!engineSessionId) {
      throw Object.assign(new Error("A routolt Developer Grid taskhoz nincs Dev Center engine session."), { code:"DEVELOPER_GRID_ENGINE_SESSION_REQUIRED", status:409 });
    }
    readyExecution = await ensureDeveloperGridReadyExecution({
      taskId,
      workerCode:routedCode,
      engineSessionId,
      baseHead:String(foundation.sourceProvenance.head || "").toLowerCase(),
      scope:[{ type:"module", key:input.moduleName }],
      gridSessionId,
    });
    engineTask = readyExecution.engineTask;
  }
  const developmentContext: DevelopmentContext = {
    projectId: input.projectId,
    mainModule: "BENJADMIN",
    moduleName: input.moduleName,
    submoduleName: input.submoduleName,
    workItem: engineTask.title || workStartTitle(input.sourcePrompt),
    workStageIndex: 1,
    taskId,
    sourcePrompt: input.sourcePrompt,
    chatLaunchMode: input.chatLaunchMode,
    surfaceType: input.surfaceType,
    preferredWorkerCode: input.preferredWorkerCode,
    engineSessionId,
    sourceExecutionProof: readyExecution?.proof || null,
    continuityPreviousTaskId: continuity.previousTaskId,
    continuityPreviousWorkerCode: continuity.previousWorkerCode,
    continuityHandoffId: continuity.handoffId,
    continuityHandoffSummary: continuity.handoffSummary,
    continuityContextSnapshotId: continuity.contextSnapshotId,
    continuityContextRevision: continuity.contextRevision,
    continuityContextSummary: continuity.contextSummary,
    continuityRouting: routedCode && continuity.previousWorkerCode ? (routedCode === continuity.previousWorkerCode ? "SAME_WORKER" : "FALLBACK_WORKER") : "NO_HISTORY",
    rawTranscriptState: "WAITING",
    handoffPackState: "DRAFT",
    source: "EXPLICIT_TASK",
    resolvedAt: new Date().toISOString(),
  };
  const engineGridTask = gridTaskFromEngine(engineTask as unknown as Record<string, unknown>);
  const task: DeveloperGridTask = routedCode ? { ...engineGridTask, status:"READY" } : engineGridTask;
  if (!routedCode) {
    const beforeWaiting = await readGridState();
    const preservedActiveSession = beforeWaiting.sessions.find((item) => item.endedAt === null && item.taskId !== task.id) || null;
    const waitingState = preservedActiveSession ? beforeWaiting : await upsertGridTask(task);
    await appendGridEvent({
      kind: "analysis",
      origin: "LIVE",
      workerCode: input.preferredWorkerCode,
      taskId,
      projectId: input.projectId,
      developmentContext,
      productionAccess: "DENY",
      delta: {
        summary: `${input.preferredWorkerCode} explicit worker jelenleg nem routolható; task várakozik, automatikus fallback és hamis session tiltva.`,
        preferredWorkerCode: input.preferredWorkerCode,
        routingState: "WAITING_FOR_WORKER",
      },
    });
    return {
      task,
      session: null,
      queuedTask: task,
      preservedActiveTaskId: preservedActiveSession?.taskId || null,
      stateRevision: waitingState.revision,
      reused,
      sourcePrompt: input.sourcePrompt,
      chatLaunchMode: input.chatLaunchMode,
      surfaceType: input.surfaceType,
      preferredWorkerCode: input.preferredWorkerCode,
      routingState: "WAITING_FOR_WORKER" as const,
      productionAccess: "DENY" as const,
    };
  }
  if (!readyExecution) throw Object.assign(new Error("A routolt task READY execution proof nélkül nem materializálható."), { code:"DEVELOPER_GRID_READY_PROOF_REQUIRED", status:409 });
  const session: WorkerSession = {
    id: gridSessionId,
    workerCode: routedCode,
    taskId,
    developmentContext,
    sourceProvenance: {
      ...readyExecution.provenance,
      worker: routedCode,
      taskId,
      sessionId: gridSessionId,
    },
    startedAt: new Date().toISOString(),
    endedAt: null,
  };
  const materialized = await materializeGridTaskSession({ task, session });
  return {
    task: materialized.state.task,
    session: materialized.session,
    stateRevision: materialized.state.revision,
    reused,
    sourcePrompt: input.sourcePrompt,
    chatLaunchMode: input.chatLaunchMode,
    surfaceType: input.surfaceType,
    preferredWorkerCode: input.preferredWorkerCode,
    routingState: "ROUTED" as const,
    productionAccess: "DENY" as const,
  };
}


export async function recoverDeveloperGridLaunchExecution() {
  const state = await readGridState();
  const task = state.task;
  if (!task) throw Object.assign(new Error("Nincs helyreállítható authoritative Developer Grid task."), { code:"DEVELOPER_GRID_RECOVERY_TASK_MISSING", status:409 });
  const session = state.sessions.find((item) => item.taskId === task.id && item.endedAt === null) || null;
  if (!session) throw Object.assign(new Error("A helyreállításhoz aktív Developer Grid worker session szükséges."), { code:"DEVELOPER_GRID_RECOVERY_SESSION_MISSING", status:409 });
  if (session.developmentContext.bootAckState === "VALIDATED") {
    throw Object.assign(new Error("A task BOOT ACK-ja már validált; execution recovery nem szükséges."), { code:"DEVELOPER_GRID_RECOVERY_ACK_ALREADY_VALIDATED", status:409 });
  }
  const workerCode = routableWorkerCode(session.workerCode);
  if (!workerCode) throw Object.assign(new Error("A recovery worker nem routolható."), { code:"DEVELOPER_GRID_RECOVERY_WORKER_INVALID", status:409 });
  let engineSessionId = text(session.developmentContext.engineSessionId, 240);
  if (!engineSessionId) throw Object.assign(new Error("A recoveryhez hiányzik a Dev Center engine session."), { code:"DEVELOPER_GRID_RECOVERY_ENGINE_SESSION_MISSING", status:409 });
  let recoveredFromEngineSessionId: string | null = null;
  const engineStateBeforeRecovery = await getDevCenterEngineState();
  const engineSessionBeforeRecovery = engineStateBeforeRecovery.sessions.find((item) => item.id === engineSessionId) || null;
  if (!engineSessionBeforeRecovery) throw Object.assign(new Error("A recoveryhez tartozó Dev Center engine session nem található."), { code:"DEVELOPER_GRID_RECOVERY_ENGINE_SESSION_NOT_FOUND", status:409 });
  if (engineSessionBeforeRecovery.taskId !== task.id) throw Object.assign(new Error("A recovery Dev Center session más taskhoz tartozik."), { code:"DEVELOPER_GRID_RECOVERY_ENGINE_TASK_MISMATCH", status:409 });
  if (engineSessionBeforeRecovery.status === "closed") {
    const previousEngineSessionId = engineSessionId;
    const fresh = await recoverClosedDevEngineTaskManualBridgeSession({ taskId:task.id, closedSessionId:previousEngineSessionId, expectedWorkerCode:workerCode });
    engineSessionId = text(fresh.session?.id, 240);
    if (!engineSessionId) throw Object.assign(new Error("A fresh recovery Dev Center session nem jött létre."), { code:"DEVELOPER_GRID_RECOVERY_FRESH_SESSION_MISSING", status:409 });
    recoveredFromEngineSessionId = previousEngineSessionId;
  }
  const moduleName = text(session.developmentContext.moduleName, 180);
  if (!moduleName) throw Object.assign(new Error("A recovery scope modulja hiányzik."), { code:"DEVELOPER_GRID_RECOVERY_SCOPE_MISSING", status:409 });
  const baseHead = String(session.sourceProvenance.head || "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(baseHead)) throw Object.assign(new Error("A recovery source HEAD érvénytelen."), { code:"DEVELOPER_GRID_RECOVERY_HEAD_INVALID", status:409 });

  const ready = await ensureDeveloperGridReadyExecution({
    taskId:task.id,
    workerCode,
    engineSessionId,
    baseHead,
    scope:[{ type:"module", key:moduleName }],
    gridSessionId:session.id,
  });
  const now = new Date().toISOString();
  const sourceExecutionProof = reusableSourceExecutionProof(session.developmentContext.sourceExecutionProof, ready.proof) || ready.proof;
  const recoveredSession: WorkerSession = {
    ...session,
    sourceProvenance:{ ...ready.provenance, worker:workerCode, taskId:task.id, sessionId:session.id },
    developmentContext:{
      ...session.developmentContext,
      engineSessionId,
      sourceExecutionProof,
      bootAckState:"WAITING",
      bootAckValidatedAt:null,
      bootAckSha256:null,
      bootAckCodingAllowed:null,
      bootAckMismatches:[],
      resolvedAt:now,
    },
  };
  const next = await upsertWorkerSession(recoveredSession);
  await appendGridEvent({
    kind:"analysis", origin:"LIVE", workerCode, taskId:task.id, projectId:task.projectId, productionAccess:"DENY",
    developmentContext:recoveredSession.developmentContext,
    branch:recoveredSession.sourceProvenance.branch,
    worktree:recoveredSession.sourceProvenance.worktree,
    head:recoveredSession.sourceProvenance.head,
    delta:{
      eventType:"LAUNCH_EXECUTION_RECOVERED",
      summary:"A meglévő task Dev Center handshake-je READY állapotig helyreállt; task-specifikus worktree + scope lock + worktree lease + Central Core source proof aktív.",
      status:"PASS", severity:"INFO", sessionId:session.id, engineSessionId, recoveredFromEngineSessionId, sourceProofSha256:sourceExecutionProof.sha256,
      activeScopeLockCount:sourceExecutionProof.activeScopeLockCount, activeWorktreeLeaseCount:sourceExecutionProof.activeWorktreeLeaseCount,
    },
  });
  return { task:next.task, session:recoveredSession, sourceExecutionProof, revision:next.revision, productionAccess:"DENY" as const };
}

export async function recordDeveloperGridBootAck(rawInput: Record<string, unknown>) {
  const taskId = text(rawInput.taskId, 240);
  const workerCode = strictCoreWorkerCode(rawInput.workerCode);
  const sessionId = text(rawInput.sessionId, 260);
  const responseSha256 = text(rawInput.responseSha256, 64).toLowerCase();
  const sourceProofSha256 = text(rawInput.sourceProofSha256, 64).toLowerCase();
  const codingAllowed = rawInput.codingAllowed === true;
  const mismatches = Array.isArray(rawInput.mismatches)
    ? rawInput.mismatches.map((item) => text(item, 120)).filter(Boolean).slice(0, 20)
    : [];
  if (!taskId || !sessionId || !/^[0-9a-f]{64}$/.test(responseSha256)) {
    const error = new Error("A BOOT ACK rögzítéséhez taskId, sessionId és SHA-256 szükséges.");
    Object.assign(error, { code: "DEVELOPER_GRID_BOOT_ACK_INVALID", status: 400 });
    throw error;
  }
  const state = await readGridState();
  if (!state.task || state.task.id !== taskId) {
    const error = new Error("A BOOT ACK nem az authoritative aktuális taskhoz tartozik.");
    Object.assign(error, { code: "DEVELOPER_GRID_BOOT_ACK_TASK_MISMATCH", status: 409 });
    throw error;
  }
  const session = state.sessions.find((item) => item.id === sessionId && item.taskId === taskId && item.workerCode === workerCode && item.endedAt === null);
  if (!session) {
    const error = new Error("A BOOT ACK-hoz tartozó aktív worker session nem található.");
    Object.assign(error, { code: "DEVELOPER_GRID_BOOT_ACK_SESSION_MISMATCH", status: 409 });
    throw error;
  }
  const expected = session.sourceProvenance;
  const reportedBranch = text(rawInput.branch, 600);
  const reportedWorktree = text(rawInput.worktree, 1200).replace(/\\/g, "/").replace(/\/+$/g, "");
  const reportedHead = text(rawInput.baseHead, 80).toLowerCase();
  const expectedWorktree = String(expected.worktree || "").replace(/\\/g, "/").replace(/\/+$/g, "");
  const serverMismatches = [...mismatches];
  if (reportedBranch !== expected.branch) serverMismatches.push("branch");
  if (reportedWorktree !== expectedWorktree) serverMismatches.push("worktree");
  if (reportedHead !== String(expected.head || "").toLowerCase()) serverMismatches.push("baseHead");
  if (!codingAllowed) serverMismatches.push("codingAllowed");

  const proof = session.developmentContext.sourceExecutionProof || null;
  if (!proof) serverMismatches.push("sourceProofRequired");
  if (proof) {
    const { sha256: storedProofSha256, ...proofBase } = proof;
    const computedProofSha256 = sourceExecutionProofSha256(proofBase);
    if (!/^[0-9a-f]{64}$/.test(String(storedProofSha256 || "")) || computedProofSha256 !== String(storedProofSha256 || "").toLowerCase()) serverMismatches.push("sourceProofIntegrity");
    if (sourceProofSha256 !== String(storedProofSha256 || "").toLowerCase()) serverMismatches.push("sourceProof");
    if (proof.state !== "VERIFIED" || proof.authority !== "CENTRAL_CORE" || proof.handshakeStage !== "READY" || proof.productionAccess !== "DENY") serverMismatches.push("sourceProofState");
    if (proof.repository !== expected.repository || proof.worktree !== expected.worktree || proof.branch !== expected.branch || proof.head !== expected.head) serverMismatches.push("sourceProofProvenance");
    if (!session.developmentContext.engineSessionId || proof.engineSessionId !== session.developmentContext.engineSessionId) serverMismatches.push("sourceProofSession");
    if (Number(proof.activeScopeLockCount || 0) < 1 || Number(proof.activeWorktreeLeaseCount || 0) < 1) serverMismatches.push("sourceProofLocks");
  }
  try {
    await verifyCurrentSourceExecutionState(expected, { requireClean: false });
  } catch {
    serverMismatches.push("sourceProvenance");
  }
  if (proof) {
    try {
      const engineSessionId = String(session.developmentContext.engineSessionId || "");
      if (!engineSessionId) serverMismatches.push("engineSessionId");
      else {
        const operation = await assertDevEngineOperation(engineSessionId, "write");
        if (Number(operation.activeLockCount || 0) < 1) serverMismatches.push("scopeLock");
        if (Number(operation.activeWorktreeLeaseCount || 0) < 1) serverMismatches.push("worktreeLease");
      }
    } catch {
      serverMismatches.push("engineExecutionGate");
    }
  }
  const uniqueMismatches = [...new Set(serverMismatches)].slice(0, 20);
  const validated = uniqueMismatches.length === 0;
  const now = new Date().toISOString();
  const updated: WorkerSession = {
    ...session,
    developmentContext: {
      ...session.developmentContext,
      bootAckState: validated ? "VALIDATED" : "BLOCKED",
      bootAckValidatedAt: validated ? now : null,
      bootAckSha256: responseSha256,
      bootAckCodingAllowed: codingAllowed,
      bootAckMismatches: uniqueMismatches,
      resolvedAt: now,
    },
  };
  let next = await upsertWorkerSession(updated);
  if (validated) {
    await syncEngineBridgeTarget(taskId, "RUNNING");
    if (state.task) next = await upsertGridTask({ ...state.task, status: "RUNNING" });
  }
  await appendGridEvent({
    kind: "analysis", origin: "LIVE", workerCode, taskId, projectId: state.task.projectId, productionAccess: "DENY",
    developmentContext: updated.developmentContext,
    branch: expected.branch, worktree: expected.worktree, head: expected.head,
    delta: {
      eventType: validated ? "BOOT_ACK_VALIDATED" : "BOOT_ACK_BLOCKED",
      summary: validated ? "BOOT ACK validálva; a worker fejlesztési futása engedélyezhető." : `BOOT ACK blokkolva: ${uniqueMismatches.join(", ") || "ismeretlen eltérés"}`,
      status: validated ? "PASS" : "BLOCKED", severity: validated ? "INFO" : "HIGH", sessionId,
      responseSha256, sourceProofSha256: sourceProofSha256 || null, codingAllowed, mismatches: uniqueMismatches, workStageIndex: 1,
    },
  });
  return {
    taskId, workerCode, sessionId, state: validated ? "VALIDATED" as const : "BLOCKED" as const,
    validated, codingAllowed, mismatches: uniqueMismatches, responseSha256, sourceProofSha256:sourceProofSha256 || null, revision: next.revision, productionAccess: "DENY" as const,
  };
}

function normalizeSurfaceType(value: unknown, fallback: WorkerSurfaceType = "CHATGPT"): WorkerSurfaceType {
  const raw = text(value, 40).toUpperCase();
  return raw === "CODEX" ? "CODEX" : raw === "WORK" ? "WORK" : raw === "CHATGPT" ? "CHATGPT" : fallback;
}

function surfaceConversationIdFromUrl(surfaceType: WorkerSurfaceType, value: unknown) {
  const raw = text(value, 1000);
  try {
    const url = new URL(raw);
    if (surfaceType === "CHATGPT" || surfaceType === "WORK") {
      if (url.protocol !== "https:" || !["chatgpt.com", "www.chatgpt.com"].includes(url.hostname)) return "";
      return url.pathname.match(/(?:^|\/)c\/([A-Za-z0-9_-]+)/)?.[1] || "";
    }
    if (surfaceType === "CODEX" && url.protocol === "codex:") {
      if (url.hostname === "threads") return url.pathname.split("/").filter(Boolean)[0] || "";
      return url.pathname.match(/(?:^|\/)threads\/([A-Za-z0-9._:-]+)/)?.[1] || "";
    }
  } catch { /* invalid surface URL */ }
  return "";
}


function chatProjectKeyFromConversationUrl(value: unknown) {
  const raw = text(value, 1000);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !["chatgpt.com", "www.chatgpt.com"].includes(url.hostname)) return "";
    return url.pathname.match(/^\/g\/(g-p-[^/]+)\/c\/[A-Za-z0-9_-]+(?:\/.*)?$/)?.[1] || "";
  } catch {
    return "";
  }
}


export async function bindDeveloperGridConversation(rawInput: Record<string, unknown>) {
  const taskId = text(rawInput.taskId, 220);
  const workerCode = strictCoreWorkerCode(rawInput.workerCode);
  const surfaceType = normalizeSurfaceType(rawInput.surfaceType);
  const surfaceConversationUrl = text(rawInput.surfaceConversationUrl ?? rawInput.chatConversationUrl, 1000);
  const surfaceConversationId = text(rawInput.surfaceConversationId ?? rawInput.chatConversationId, 180) || surfaceConversationIdFromUrl(surfaceType, surfaceConversationUrl);
  const surfaceConversationTitle = text(rawInput.surfaceConversationTitle ?? rawInput.chatConversationTitle, 500);
  const surfacePreviousConversationId = text(rawInput.surfacePreviousConversationId ?? rawInput.chatPreviousConversationId, 180) || null;
  const conversationRollover = rawInput.conversationRollover === true;
  const manualRebind = rawInput.manualRebind === true;
  const requestedRolloverReason = text(rawInput.conversationRolloverReason, 40).toUpperCase();
  const conversationRolloverReason = requestedRolloverReason === "MANUAL_CONTINUATION" ? "MANUAL_CONTINUATION" as const : "CONTEXT_LIMIT" as const;
  const requestedRolloverState = text(rawInput.conversationRolloverState, 40).toUpperCase();
  const conversationRolloverState = ["ACK_WAIT", "READY", "BLOCKED"].includes(requestedRolloverState) ? requestedRolloverState : "ACK_WAIT";
  const rolloverContextSnapshotId = text(rawInput.conversationRolloverContextSnapshotId, 260);
  const rolloverContextRevision = Number(rawInput.conversationRolloverContextRevision || 0);
  const rolloverHandoffPackId = text(rawInput.conversationRolloverHandoffPackId, 260);
  const rolloverSourceHead = text(rawInput.conversationRolloverSourceHead, 64).toLowerCase();
  const rolloverSourceProofSha256 = text(rawInput.conversationRolloverSourceProofSha256, 64).toLowerCase();
  const rolloverPromptMessageId = text(rawInput.conversationRolloverPromptMessageId, 220) || null;
  const rolloverAckSha256 = text(rawInput.conversationRolloverAckSha256, 64).toLowerCase() || null;
  const chatConversationUrl = surfaceType === "CHATGPT" ? surfaceConversationUrl : "";
  const chatConversationId = surfaceType === "CHATGPT" ? surfaceConversationId : "";
  const chatConversationTitle = surfaceType === "CHATGPT" ? surfaceConversationTitle : "";
  const chatPreviousConversationId = surfaceType === "CHATGPT" ? surfacePreviousConversationId : null;
  const requestedMode = text(rawInput.chatLaunchMode, 40).toUpperCase();
  const chatLaunchMode: ChatLaunchMode = requestedMode === "NEW_PROJECT_CHAT" ? "NEW_PROJECT_CHAT" : "EXISTING_CHAT";
  const confirmedBy = conversationRollover
    ? "CONVERSATION_ROLLOVER" as const
    : manualRebind
      ? "USER_MANUAL_REBIND" as const
      : chatLaunchMode === "NEW_PROJECT_CHAT" ? "USER_CURRENT_CHAT" as const : "EXISTING_CHAT_SELECTION" as const;
  const urlDerivedSurfaceId = surfaceConversationIdFromUrl(surfaceType, surfaceConversationUrl);
  const codexUrlValid = !surfaceConversationUrl || (surfaceConversationUrl.toLowerCase().startsWith("codex:") && urlDerivedSurfaceId === surfaceConversationId);
  const surfaceIdentityValid = surfaceType === "CODEX"
    ? Boolean(taskId && surfaceConversationId && codexUrlValid)
    : Boolean(taskId && surfaceConversationId && urlDerivedSurfaceId === surfaceConversationId);
  if (!surfaceIdentityValid) {
    const error = new Error(surfaceType === "CODEX"
      ? "A Codex taskhoz hiteles thread/session azonosító szükséges."
      : "A taskhoz csak igazolt ChatGPT /c/... csevegés rögzíthető.");
    Object.assign(error, { code: "DEVELOPER_GRID_SURFACE_CONVERSATION_INVALID", status: 400 });
    throw error;
  }
  if (chatLaunchMode === "NEW_PROJECT_CHAT" && surfacePreviousConversationId && surfacePreviousConversationId === surfaceConversationId) {
    const error = new Error("Az új projektcsevegés nem egyezhet a korábbi csevegéssel.");
    Object.assign(error, { code: "DEVELOPER_GRID_NEW_CHAT_REQUIRED", status: 409 });
    throw error;
  }
  const state = await readGridState();
  const session = state.sessions.find((item) =>
    item.taskId === taskId
    && item.workerCode === workerCode
    && item.endedAt === null
    && String(item.developmentContext?.taskId || item.taskId) === taskId
  );
  if (!session) {
    const error = new Error("A taskhoz tartozó exact aktív worker session nem található.");
    Object.assign(error, { code: "DEVELOPER_GRID_CHAT_SESSION_MISSING", status: 409 });
    throw error;
  }
  const authoritativeProjectId = state.task?.id === taskId
    ? state.task.projectId
    : text(session.developmentContext.projectId, 180) || DEVELOPER_GRID_PROJECT_ID;
  const existingSurfaceType = normalizeSurfaceType(session.developmentContext.surfaceType || "CHATGPT");
  if (existingSurfaceType !== surfaceType) {
    const error = new Error("A worker surface eltér a munkaindításkor rögzített felülettől.");
    Object.assign(error, { code: "DEVELOPER_GRID_SURFACE_MISMATCH", status: 409 });
    throw error;
  }
  const existingMode = session.developmentContext.chatLaunchMode || chatLaunchMode;
  if (existingMode !== chatLaunchMode) {
    const error = new Error("A csevegési mód eltér a munkaindításkor rögzített módtól.");
    Object.assign(error, { code: "DEVELOPER_GRID_CHAT_MODE_MISMATCH", status: 409 });
    throw error;
  }
  if (manualRebind) {
    if (conversationRollover || surfaceType !== "CHATGPT") {
      const error = new Error("Kézi conversation rebind csak normál ChatGPT surface-en engedélyezett.");
      Object.assign(error, { code: "DEVELOPER_GRID_MANUAL_REBIND_SURFACE_INVALID", status: 409 });
      throw error;
    }
    const ctx = session.developmentContext;
    const authoritativeConversationId = text(ctx.surfaceConversationId ?? ctx.chatConversationId, 180);
    const authoritativeConversationUrl = text(ctx.surfaceConversationUrl ?? ctx.chatConversationUrl, 1000);
    if (!surfacePreviousConversationId || !authoritativeConversationId || surfacePreviousConversationId !== authoritativeConversationId) {
      const error = new Error("A kézi rebind előző conversation azonosítója nem egyezik az authoritative sessionnel.");
      Object.assign(error, { code: "DEVELOPER_GRID_MANUAL_REBIND_PREVIOUS_MISMATCH", status: 409 });
      throw error;
    }
    if (!surfaceConversationId || surfaceConversationId === authoritativeConversationId) {
      const error = new Error("A kézi rebindhez új ChatGPT conversation szükséges.");
      Object.assign(error, { code: "DEVELOPER_GRID_MANUAL_REBIND_NEW_CONVERSATION_REQUIRED", status: 409 });
      throw error;
    }
    const previousProjectKey = chatProjectKeyFromConversationUrl(authoritativeConversationUrl);
    const nextProjectKey = chatProjectKeyFromConversationUrl(surfaceConversationUrl);
    if (!previousProjectKey || !nextProjectKey || previousProjectKey !== nextProjectKey) {
      const error = new Error("Kézi rebind csak ugyanazon ChatGPT Project két csevegése között engedélyezett.");
      Object.assign(error, { code: "DEVELOPER_GRID_MANUAL_REBIND_PROJECT_MISMATCH", status: 409 });
      throw error;
    }
    if (ctx.bootAckState !== "VALIDATED" || ctx.bootAckCodingAllowed !== true) {
      const error = new Error("Kézi rebind csak validált BOOT ACK és engedélyezett coding állapot mellett végezhető.");
      Object.assign(error, { code: "DEVELOPER_GRID_MANUAL_REBIND_BOOT_ACK_REQUIRED", status: 409 });
      throw error;
    }
    if (!ctx.contextSnapshotId || !ctx.handoffPackId) {
      const error = new Error("Kézi rebindhez Context Snapshot és Handoff Pack continuity szükséges.");
      Object.assign(error, { code: "DEVELOPER_GRID_MANUAL_REBIND_CONTINUITY_REQUIRED", status: 409 });
      throw error;
    }
    if (String(rawInput.productionAccess || "DENY").toUpperCase() !== "DENY") {
      const error = new Error("Kézi conversation rebind PROD hozzáféréssel tiltott.");
      Object.assign(error, { code: "PROD_DENY", status: 409 });
      throw error;
    }
  }
  if (conversationRollover) {
    if (surfaceType !== "CHATGPT") {
      const error = new Error("Conversation rollover jelenleg kizárólag ChatGPT surface-en engedélyezett.");
      Object.assign(error, { code: "DEVELOPER_GRID_ROLLOVER_SURFACE_INVALID", status: 409 });
      throw error;
    }
    const ctx = session.developmentContext;
    const authoritativeConversationId = text(ctx.surfaceConversationId ?? ctx.chatConversationId, 180);
    const frozenPreviousConversationId = text(ctx.conversationRolloverPreviousConversationId, 180);
    const idempotentRollover = authoritativeConversationId === surfaceConversationId
      && frozenPreviousConversationId === surfacePreviousConversationId;
    const firstRolloverBinding = authoritativeConversationId === surfacePreviousConversationId
      && surfaceConversationId !== surfacePreviousConversationId;
    if (!surfacePreviousConversationId || (!firstRolloverBinding && !idempotentRollover)) {
      const error = new Error("A rollover előző csevegésazonosítója nem egyezik az authoritative aktuális csevegéssel.");
      Object.assign(error, { code: "DEVELOPER_GRID_ROLLOVER_PREVIOUS_CONVERSATION_MISMATCH", status: 409 });
      throw error;
    }
    if (!surfaceConversationId || surfaceConversationId === surfacePreviousConversationId) {
      const error = new Error("A rollover új csevegésazonosítója hiányzik vagy megegyezik a régivel.");
      Object.assign(error, { code: "DEVELOPER_GRID_ROLLOVER_NEW_CONVERSATION_REQUIRED", status: 409 });
      throw error;
    }
    if (ctx.bootAckState !== "VALIDATED" || ctx.bootAckCodingAllowed !== true) {
      const error = new Error("Conversation rollover csak validált BOOT ACK és engedélyezett coding állapot mellett köthető.");
      Object.assign(error, { code: "DEVELOPER_GRID_ROLLOVER_BOOT_ACK_REQUIRED", status: 409 });
      throw error;
    }
    const frozenContextSnapshotId = text(ctx.conversationRolloverContextSnapshotId ?? ctx.contextSnapshotId, 260);
    const frozenContextRevision = Number(ctx.conversationRolloverContextRevision ?? ctx.contextRevision ?? 0);
    const frozenHandoffPackId = text(ctx.conversationRolloverHandoffPackId ?? ctx.handoffPackId, 260);
    const expectedProofSha256 = text(ctx.sourceExecutionProof?.sha256, 64).toLowerCase() || derivedVerifiedSourceProvenanceProofSha256(session);
    const expectedHead = text(session.sourceProvenance.head, 64).toLowerCase();
    const rolloverIdentityMismatch = !frozenContextSnapshotId
      || rolloverContextSnapshotId !== frozenContextSnapshotId
      || rolloverContextRevision !== frozenContextRevision
      || !frozenHandoffPackId
      || rolloverHandoffPackId !== frozenHandoffPackId
      || !/^[0-9a-f]{40}$/.test(rolloverSourceHead)
      || rolloverSourceHead !== expectedHead
      || !/^[0-9a-f]{64}$/.test(rolloverSourceProofSha256)
      || rolloverSourceProofSha256 !== expectedProofSha256;
    if (rolloverIdentityMismatch) {
      const error = new Error("A conversation rollover Context/Handoff/source identity eltér az authoritative aktív session állapotától.");
      Object.assign(error, { code: "DEVELOPER_GRID_ROLLOVER_IDENTITY_MISMATCH", status: 409 });
      throw error;
    }
    if (String(rawInput.productionAccess || "DENY").toUpperCase() !== "DENY") {
      const error = new Error("Conversation rollover PROD hozzáféréssel tiltott.");
      Object.assign(error, { code: "PROD_DENY", status: 409 });
      throw error;
    }
  }
  const confirmedAt = new Date().toISOString();
  const updated: WorkerSession = {
    ...session,
    developmentContext: {
      ...session.developmentContext,
      chatLaunchMode,
      surfaceType,
      surfacePreviousConversationId,
      surfaceConversationId,
      surfaceConversationUrl,
      surfaceConversationTitle,
      surfaceConversationConfirmedAt: confirmedAt,
      chatPreviousConversationId,
      chatConversationId: chatConversationId || null,
      chatConversationUrl: chatConversationUrl || null,
      chatConversationTitle: chatConversationTitle || null,
      chatConversationConfirmedAt: surfaceType === "CHATGPT" ? confirmedAt : null,
      chatConversationConfirmedBy: confirmedBy,
      ...(manualRebind ? {
        conversationRolloverState: null,
        conversationRolloverReason: null,
        conversationRolloverPreviousConversationId: null,
        conversationRolloverContextSnapshotId: null,
        conversationRolloverContextRevision: null,
        conversationRolloverHandoffPackId: null,
        conversationRolloverSourceHead: null,
        conversationRolloverSourceProofSha256: null,
        conversationRolloverPromptMessageId: null,
        conversationRolloverAckSha256: null,
        conversationRolloverStartedAt: null,
        conversationRolloverCompletedAt: null,
      } : {}),
      ...(conversationRollover ? {
        conversationRolloverState: conversationRolloverState as "ACK_WAIT" | "READY" | "BLOCKED",
        conversationRolloverReason,
        conversationRolloverPreviousConversationId: surfacePreviousConversationId,
        conversationRolloverContextSnapshotId: rolloverContextSnapshotId,
        conversationRolloverContextRevision: rolloverContextRevision,
        conversationRolloverHandoffPackId: rolloverHandoffPackId,
        conversationRolloverSourceHead: rolloverSourceHead,
        conversationRolloverSourceProofSha256: rolloverSourceProofSha256,
        conversationRolloverPromptMessageId: rolloverPromptMessageId,
        conversationRolloverAckSha256: rolloverAckSha256,
        conversationRolloverStartedAt: session.developmentContext.conversationRolloverStartedAt || confirmedAt,
        conversationRolloverCompletedAt: conversationRolloverState === "READY" ? confirmedAt : null,
      } : {}),
      resolvedAt: confirmedAt,
    },
  };
  const next = await upsertWorkerSession(updated);
  await syncEngineBridgeTarget(taskId, (conversationRollover || manualRebind) ? "RUNNING" : "HANDED_OFF");
  await appendGridEvent({
    kind: "analysis", origin: "LIVE", workerCode, taskId, projectId: authoritativeProjectId, productionAccess: "DENY",
    delta: {
      eventType: conversationRollover
        ? "CONVERSATION_ROLLOVER_" + conversationRolloverState
        : manualRebind ? "CONVERSATION_MANUAL_REBIND" : "SURFACE_BOUND",
      summary: conversationRollover
        ? "ChatGPT conversation rollover · " + surfacePreviousConversationId + " → " + surfaceConversationId + " · " + conversationRolloverState
        : manualRebind
          ? "ChatGPT kézi conversation rebind · " + surfacePreviousConversationId + " → " + surfaceConversationId
          : surfaceType + " surface rögzítve · " + chatLaunchMode,
      workItem: updated.developmentContext.workItem,
      workStageIndex: updated.developmentContext.workStageIndex || 1,
      previousConversationId: (conversationRollover || manualRebind) ? surfacePreviousConversationId : null,
      conversationId: surfaceConversationId,
      contextSnapshotId: conversationRollover ? rolloverContextSnapshotId : null,
      handoffPackId: conversationRollover ? rolloverHandoffPackId : null,
    },
  });
  return {
    taskId, workerCode, chatLaunchMode, surfaceType, surfaceConversationId, surfaceConversationUrl, surfaceConversationTitle,
    surfaceConversationConfirmedAt: confirmedAt, chatConversationId: chatConversationId || null, chatConversationUrl: chatConversationUrl || null, chatConversationTitle: chatConversationTitle || null,
    chatConversationConfirmedAt: surfaceType === "CHATGPT" ? confirmedAt : null, chatConversationConfirmedBy: confirmedBy,
    manualRebind,
    previousConversationId: manualRebind ? surfacePreviousConversationId : null,
    conversationRollover: conversationRollover ? {
      state: conversationRolloverState,
      previousConversationId: surfacePreviousConversationId,
      contextSnapshotId: rolloverContextSnapshotId,
      contextRevision: rolloverContextRevision,
      handoffPackId: rolloverHandoffPackId,
      sourceHead: rolloverSourceHead,
      sourceProofSha256: rolloverSourceProofSha256,
    } : null,
    revision: next.revision, productionAccess: "DENY" as const,
  };
}
