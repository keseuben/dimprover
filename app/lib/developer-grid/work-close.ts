"server-only";

import { finalizeDevEngineTask } from "@/app/lib/dev-center/engine-repository";
import { refreshDerivedConversationMemory } from "./conversation-memory";
import { evaluateDeveloperGridReviewGate } from "./review-gate";
import { appendGridEvent, readGridState, upsertGridTask, upsertWorkerSession } from "./state-store";

function fail(code: string, message: string, status = 409): never {
  throw Object.assign(new Error(message), { code, status });
}

export async function closeDeveloperGridWork(rawInput: Record<string, unknown>) {
  const taskId = String(rawInput.taskId || "").trim().slice(0, 220);
  const sessionId = String(rawInput.sessionId || "").trim().slice(0, 240);
  const state = await readGridState();
  if (!taskId || !state.task || state.task.id !== taskId) fail("DEVELOPER_GRID_CLOSE_TASK_MISMATCH", "Csak az authoritative aktuális task zárható le.");
  const session = state.sessions.find((item) => item.taskId === taskId && item.endedAt === null && (!sessionId || item.id === sessionId)) || null;
  if (!session) fail("DEVELOPER_GRID_CLOSE_SESSION_REQUIRED", "A lezáráshoz aktív worker session szükséges.");
  if (Number(session.developmentContext.workStageIndex || 1) !== 6) fail("DEVELOPER_GRID_CLOSE_STAGE_REQUIRED", "A lezárás csak a 6/6 LEZÁRÁS fázisban engedélyezett.");
  if (session.developmentContext.bootAckState !== "VALIDATED") fail("DEVELOPER_GRID_CLOSE_BOOT_ACK_REQUIRED", "A lezáráshoz VALIDATED BOOT ACK szükséges.");

  const memory = await refreshDerivedConversationMemory(taskId, session.id).catch(() => null);
  const gate = await evaluateDeveloperGridReviewGate({ taskId, target: "CLOSURE" });
  if (!gate.ready) {
    const missing = gate.checks.filter((item) => item.required && !item.pass).map((item) => item.label).join(" · ");
    fail("DEVELOPER_GRID_CLOSURE_GATE_BLOCKED", `A lezárási kapu BLOCKED: ${missing || "ismeretlen hiány"}.`);
  }

  const summary = memory?.handoff?.summary || memory?.context?.summary || session.developmentContext.contextSnapshotSummary || state.task.title;
  const engine = await finalizeDevEngineTask({ taskId, outcome: "completed", note: String(summary || "").slice(0, 1000) });
  const closedAt = new Date().toISOString();
  const completedTask = { ...state.task, status: "COMPLETED" as const };
  await upsertGridTask(completedTask);
  const latestState = await readGridState();
  const latestSession = latestState.sessions.find((item) => item.id === session.id) || session;
  const closedSession = {
    ...latestSession,
    developmentContext: {
      ...latestSession.developmentContext,
      handoffPackState: "COMPLETED" as const,
      resolvedAt: closedAt,
    },
    endedAt: closedAt,
  };
  await upsertWorkerSession(closedSession);
  await appendGridEvent({
    kind: "analysis",
    origin: "LIVE",
    workerCode: closedSession.workerCode,
    taskId,
    projectId: completedTask.projectId,
    developmentContext: closedSession.developmentContext,
    branch: closedSession.sourceProvenance.branch,
    worktree: closedSession.sourceProvenance.worktree,
    head: closedSession.sourceProvenance.head,
    productionAccess: "DENY",
    delta: {
      eventType: "TASK_COMPLETED",
      summary: "6/6 lezárási kapu PASS; Central Core task és worker session lezárva.",
      status: "PASS",
      severity: "INFO",
      sessionId: closedSession.id,
      workStageIndex: 6,
      handoffId: memory?.handoff?.canonicalHandoffId || null,
      sanitized: true,
    },
  });
  return {
    task: completedTask,
    session: closedSession,
    gate,
    memory,
    engine: { alreadyFinalized: engine.alreadyFinalized === true, taskStatus: engine.task.status },
    closedAt,
    productionAccess: "DENY" as const,
  };
}
