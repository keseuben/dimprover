"server-only";

import { getDeveloperConsoleGridBridge } from "./console-bridge";
import { resolveDevelopmentContext } from "./development-context";
import { DEVELOPER_GRID_PROJECT_ID, DEVELOPER_GRID_TASK_ID, getDeveloperGridFoundation } from "./foundation";
import { materializeGridTaskSession, readGridState } from "./state-store";
import type { DevelopmentContext, DeveloperGridTask, WorkerSession } from "./types";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const row = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function contextCandidate(taskId: string, bridgeTask: Record<string, unknown>, bridgeSession: Record<string, unknown>) {
  return {
    projectId: text(bridgeTask.project_id || bridgeSession.project_id) || DEVELOPER_GRID_PROJECT_ID,
    mainModule: "BENJADMIN",
    moduleName: "Developer Grid V1",
    submoduleName: text(bridgeTask.submodule_name || bridgeSession.submodule_name) || "foundation",
    workItem: text(bridgeTask.work_item || bridgeSession.work_item || bridgeTask.title) || "éjszakai foundation",
    workStageIndex: Number(bridgeTask.work_stage_index || bridgeSession.work_stage_index) || 2,
    taskId,
  };
}

export async function materializeCurrentDeveloperGridTaskSession() {
  const [foundation, bridge] = await Promise.all([getDeveloperGridFoundation(), getDeveloperConsoleGridBridge()]);
  if (foundation.sourceProvenance.sourceState !== "VERIFIED") {
    const error = new Error(`BLOCKED · SOURCE_BASELINE_MISMATCH · ${foundation.sourceProvenance.reasons.join("; ")}`);
    Object.assign(error, { code: "SOURCE_BASELINE_MISMATCH", provenance: foundation.sourceProvenance });
    throw error;
  }

  if (!bridge.task || !bridge.session) {
    return {
      materialized: false as const,
      state: await readGridState(),
      session: null,
      reusedActiveSession: false,
      bridge: {
        connected: bridge.connected,
        taskResolved: Boolean(bridge.task),
        sessionResolved: Boolean(bridge.session),
        workerResolved: Boolean(bridge.worker),
        presenceAuthoritative: bridge.presenceAuthoritative,
        authoritativeContextSource: bridge.authoritativeContextSource,
        checkedAt: bridge.checkedAt,
        reason: "NO_ACTIVE_BRIDGE_SESSION",
      },
    };
  }

  const bridgeTask = row(bridge.task);
  const bridgeSession = row(bridge.session);
  const sourceTaskId = text(bridgeTask.id) || DEVELOPER_GRID_TASK_ID;
  const explicit = contextCandidate(sourceTaskId, bridgeTask, bridgeSession);
  const developmentContext: DevelopmentContext = resolveDevelopmentContext({
    activeSession: bridge.session ? explicit : null,
    explicitTask: explicit,
    sourceProvenance: foundation.sourceProvenance,
  }) || { ...explicit, source: "EXPLICIT_TASK", resolvedAt: new Date().toISOString() };

  const task: DeveloperGridTask = {
    ...foundation.task,
    id: sourceTaskId,
    title: text(bridgeTask.title) || foundation.task.title,
    projectId: text(bridgeTask.project_id) || foundation.task.projectId,
    status: "RUNNING",
  };
  const sourceSessionId = text(bridgeSession.id);
  if (!sourceSessionId) {
    const error = new Error("A Developer Console bridge session azonosítója hiányzik; synthetic Grid session tiltva.");
    Object.assign(error, { code: "DEVELOPER_GRID_BRIDGE_SESSION_ID_REQUIRED" });
    throw error;
  }
  const startedAt = text(bridgeSession.started_at || bridgeSession.startedAt || bridgeSession.opened_at || bridgeSession.openedAt) || new Date().toISOString();
  const session: WorkerSession = {
    id: `console-${sourceSessionId}`,
    workerCode: "OUTMINAI",
    taskId: sourceTaskId,
    developmentContext,
    sourceProvenance: {
      ...foundation.sourceProvenance,
      taskId: sourceTaskId,
      sessionId: `console-${sourceSessionId}`,
    },
    startedAt,
    endedAt: null,
  };

  const materialized = await materializeGridTaskSession({ task, session });
  return {
    ...materialized,
    bridge: {
      connected: bridge.connected,
      taskResolved: Boolean(bridge.task),
      sessionResolved: Boolean(bridge.session),
      workerResolved: Boolean(bridge.worker),
      presenceAuthoritative: bridge.presenceAuthoritative,
      authoritativeContextSource: bridge.authoritativeContextSource,
      checkedAt: bridge.checkedAt,
    },
  };
}
