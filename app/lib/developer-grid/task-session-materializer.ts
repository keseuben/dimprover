"server-only";

import { randomUUID } from "node:crypto";
import { getDeveloperConsoleGridBridge } from "./console-bridge";
import { resolveDevelopmentContext } from "./development-context";
import { DEVELOPER_GRID_PROJECT_ID, DEVELOPER_GRID_TASK_ID, getDeveloperGridFoundation } from "./foundation";
import { materializeGridTaskSession } from "./state-store";
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

  const bridgeTask = row(bridge.task);
  const bridgeSession = row(bridge.session);
  const explicit = contextCandidate(DEVELOPER_GRID_TASK_ID, bridgeTask, bridgeSession);
  const developmentContext: DevelopmentContext = resolveDevelopmentContext({
    activeSession: bridge.session ? explicit : null,
    explicitTask: explicit,
    sourceProvenance: foundation.sourceProvenance,
  }) || { ...explicit, source: "EXPLICIT_TASK", resolvedAt: new Date().toISOString() };

  const task: DeveloperGridTask = { ...foundation.task, status: "RUNNING" };
  const sourceSessionId = text(bridgeSession.id);
  const startedAt = text(bridgeSession.started_at || bridgeSession.startedAt) || new Date().toISOString();
  const session: WorkerSession = {
    id: sourceSessionId ? `console-${sourceSessionId}` : `outmin-${DEVELOPER_GRID_TASK_ID}-${randomUUID()}`,
    workerCode: "OUTMINAI",
    taskId: DEVELOPER_GRID_TASK_ID,
    developmentContext,
    sourceProvenance: { ...foundation.sourceProvenance, sessionId: sourceSessionId || foundation.sourceProvenance.sessionId },
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
