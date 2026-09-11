"server-only";

import { heartbeatSessionAtomic, DEV_ENGINE_DEFAULT_LEASE_SECONDS } from "@/app/lib/dev-center/orchestration-repository";
import { getDevCenterEngineState } from "@/app/lib/dev-center/engine-repository";
import { readGridState } from "./state-store";
import { verifyCurrentSourceExecutionState } from "./source-provenance";
import type { RoutableWorkerCode } from "./types";

function text(value: unknown, max = 240) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function fail(code: string, message: string, status = 409): never {
  const error = new Error(message);
  Object.assign(error, { code, status });
  throw error;
}
function workerCode(value: unknown): RoutableWorkerCode {
  const code = text(value, 32).toUpperCase();
  if (code === "BENAI") return "BENJAMINAI";
  if (["ARMINAI", "OUTMINAI", "BENJAMINAI", "JAZMINAI"].includes(code)) return code as RoutableWorkerCode;
  return fail("DEVELOPER_GRID_ENGINE_HEARTBEAT_WORKER_INVALID", "Érvénytelen Developer Grid worker.", 400);
}

export async function heartbeatDeveloperGridEngineSession(rawInput: Record<string, unknown>) {
  const taskId = text(rawInput.taskId, 180);
  const sessionId = text(rawInput.sessionId, 220);
  const worker = workerCode(rawInput.workerCode);
  if (!taskId || !sessionId) fail("DEVELOPER_GRID_ENGINE_HEARTBEAT_ID_REQUIRED", "A taskId és sessionId kötelező.", 400);

  const state = await readGridState();
  if (!state.task || state.task.id !== taskId) fail("DEVELOPER_GRID_ENGINE_HEARTBEAT_TASK_MISMATCH", "Az authoritative Developer Grid task megváltozott.");
  if (!["RUNNING", "REVIEW"].includes(state.task.status)) fail("DEVELOPER_GRID_ENGINE_HEARTBEAT_TASK_NOT_ACTIVE", "Engine heartbeat csak futó vagy review Developer Grid tasknál engedélyezett.");
  const session = state.sessions.find((item) => item.id === sessionId && item.taskId === taskId && item.workerCode === worker && item.endedAt === null) || null;
  if (!session) fail("DEVELOPER_GRID_ENGINE_HEARTBEAT_SESSION_MISMATCH", "Az authoritative Developer Grid session nem található.");
  if (session.developmentContext.bootAckState !== "VALIDATED" || session.developmentContext.bootAckCodingAllowed !== true) {
    fail("DEVELOPER_GRID_ENGINE_HEARTBEAT_BOOT_ACK_REQUIRED", "Engine heartbeat csak VALIDATED BOOT ACK után engedélyezett.");
  }
  const engineSessionId = text(session.developmentContext.engineSessionId, 220);
  if (!engineSessionId) fail("DEVELOPER_GRID_ENGINE_SESSION_ID_MISSING", "A DevCenter engine session azonosító hiányzik.");

  await verifyCurrentSourceExecutionState(session.sourceProvenance, { requireClean: false });
  const engineState = await getDevCenterEngineState();
  const engineWorker = engineState.workers.find((item) => item.code === worker) || null;
  const engineSession = engineState.sessions.find((item) => item.id === engineSessionId) || null;
  const engineTask = engineState.tasks.find((item) => item.id === taskId) || null;
  if (!engineWorker || !engineSession || !engineTask) {
    fail("DEVELOPER_GRID_ENGINE_HEARTBEAT_ENGINE_BINDING_MISSING", "A DevCenter engine task/session/worker binding hiányzik.");
  }
  if (engineSession.workerId !== engineWorker.id || engineSession.taskId !== taskId || engineSession.status === "closed") {
    fail("DEVELOPER_GRID_ENGINE_HEARTBEAT_ENGINE_SESSION_MISMATCH", "A DevCenter engine session nem egyezik az authoritative Developer Grid sessionnel.");
  }
  if (!engineTask.assignedWorkerId || engineTask.assignedWorkerId !== engineWorker.id || engineTask.claimedBySessionId !== engineSessionId) {
    fail("DEVELOPER_GRID_ENGINE_HEARTBEAT_ENGINE_TASK_MISMATCH", "A DevCenter engine task ownership nem egyezik az authoritative Developer Grid worker/session párossal.");
  }
  if (!["claimed", "in_progress", "testing"].includes(engineTask.status)) {
    fail("DEVELOPER_GRID_ENGINE_HEARTBEAT_ENGINE_TASK_NOT_ACTIVE", "A DevCenter engine task nem aktív heartbeat-kompatibilis állapotban van.");
  }
  const result = await heartbeatSessionAtomic(engineSessionId, DEV_ENGINE_DEFAULT_LEASE_SECONDS);
  return {
    taskId,
    sessionId,
    engineSessionId,
    workerCode: worker,
    state: "ALIVE" as const,
    leaseSeconds: result.leaseSeconds || DEV_ENGINE_DEFAULT_LEASE_SECONDS,
    heartbeatAt: new Date().toISOString(),
    productionAccess: "DENY" as const,
  };
}
