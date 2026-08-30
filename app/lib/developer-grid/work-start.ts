"server-only";

import { createHash } from "node:crypto";
import { autoRouteDevEngineTaskByAvailability, createDevEngineTask, getDevCenterEngineState } from "@/app/lib/dev-center/engine-repository";
import { estimateDevelopmentMinutes } from "@/app/lib/dev-center/benai-dispatch";
import { resolveDeveloperConsoleRepositoryId } from "@/app/lib/dev-center/developer-console";
import { DEVELOPER_GRID_PROJECT_ID, getDeveloperGridFoundation } from "./foundation";
import { appendGridEvent, materializeGridTaskSession, readGridState, upsertWorkerSession } from "./state-store";
import type { ChatLaunchMode, CoreWorkerCode, DevelopmentContext, DeveloperGridTask, WorkerSession } from "./types";

export const WORK_START_MIN_LENGTH = 12;
export const WORK_START_MAX_LENGTH = 12000;
export const WORK_START_IDEMPOTENCY_MAX = 160;

const text = (value: unknown, max = WORK_START_MAX_LENGTH) => String(value ?? "").trim().slice(0, max);

export function normalizeWorkStartInput(input: Record<string, unknown>) {
  const sourcePrompt = text(input.sourcePrompt);
  const projectId = text(input.projectId, 180) || DEVELOPER_GRID_PROJECT_ID;
  const moduleName = text(input.moduleName, 180) || "Developer Grid V1";
  const submoduleName = text(input.submoduleName, 180) || null;
  const idempotencyKey = text(input.idempotencyKey, WORK_START_IDEMPOTENCY_MAX);
  const rawChatLaunchMode = text(input.chatLaunchMode, 40).toUpperCase();
  const chatLaunchMode: ChatLaunchMode = rawChatLaunchMode === "NEW_PROJECT_CHAT" ? "NEW_PROJECT_CHAT" : "EXISTING_CHAT";
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
  return { sourcePrompt, projectId, moduleName, submoduleName, idempotencyKey, chatLaunchMode };
}

export function workStartTaskId(idempotencyKey: string) {
  return `dev-task-grid-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 20)}`;
}

export function workStartTitle(sourcePrompt: string) {
  return sourcePrompt.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 180) || "Új fejlesztési feladat";
}

function coreWorkerCode(value: unknown): CoreWorkerCode {
  const code = String(value || "").trim().toUpperCase();
  if (code === "ARMINAI" || code === "OUTMINAI" || code === "JAZMINAI" || code === "BENJAMINAI") return code;
  if (code === "BENAI") return "BENJAMINAI";
  return "BENJAMINAI";
}

function strictCoreWorkerCode(value: unknown): CoreWorkerCode {
  const code = String(value || "").trim().toUpperCase();
  if (code === "ARMINAI" || code === "OUTMINAI" || code === "JAZMINAI" || code === "BENJAMINAI") return code;
  if (code === "BENAI") return "BENJAMINAI";
  const error = new Error("Ismeretlen Developer Grid worker; conversation binding tiltva.");
  Object.assign(error, { code: "DEVELOPER_GRID_CHAT_WORKER_INVALID", status: 400 });
  throw error;
}

function gridTaskFromEngine(task: Record<string, unknown>): DeveloperGridTask {
  const rawStatus = String(task.status || "").toLowerCase();
  const status: DeveloperGridTask["status"] = rawStatus === "completed" ? "COMPLETED"
    : rawStatus === "blocked" || rawStatus === "failed" ? "BLOCKED"
      : rawStatus === "testing" ? "REVIEW"
        : rawStatus === "queued" || rawStatus === "ready" ? "READY" : "RUNNING";
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
  const state = await readGridState();
  return { task: state.task, sessions: state.sessions.filter((session) => session.endedAt === null), revision: state.revision, updatedAt: state.updatedAt };
}

export async function startDeveloperGridWork(rawInput: Record<string, unknown>) {
  const input = normalizeWorkStartInput(rawInput);
  const foundation = await getDeveloperGridFoundation();
  if (foundation.sourceProvenance.sourceState !== "VERIFIED") {
    const error = new Error(`BLOCKED · SOURCE_BASELINE_MISMATCH · ${foundation.sourceProvenance.reasons.join("; ")}`);
    Object.assign(error, { code: "SOURCE_BASELINE_MISMATCH", status: 409 });
    throw error;
  }

  const taskId = workStartTaskId(input.idempotencyKey);
  const engineState = await getDevCenterEngineState();
  let engineTask = engineState.tasks.find((task) => task.id === taskId) || null;
  let reused = Boolean(engineTask);
  if (engineTask) {
    const metadata = engineTask.metadata && typeof engineTask.metadata === "object" ? engineTask.metadata as Record<string, unknown> : {};
    if (String(metadata.sourcePrompt || "") !== input.sourcePrompt || String(metadata.chatLaunchMode || "EXISTING_CHAT") !== input.chatLaunchMode) {
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
    const estimate = estimateDevelopmentMinutes(input.sourcePrompt);
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
        metadata: {
          origin: "BENJADMIN_DEVELOPER_GRID_WORK_START",
          sourcePrompt: input.sourcePrompt,
          sourcePromptPreserved: true,
          chatLaunchMode: input.chatLaunchMode,
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
      if (!existing || String(existingMeta.sourcePrompt || "") !== input.sourcePrompt || String(existingMeta.chatLaunchMode || "EXISTING_CHAT") !== input.chatLaunchMode) throw createError;
      engineTask = existing;
      reused = true;
    }
    if (!engineTask) {
      if (!created?.ok) throw Object.assign(new Error(created?.error || "A Developer Grid task nem hozható létre."), { code: "DEVELOPER_GRID_WORK_CREATE_FAILED", status: 400 });
      engineTask = created.task;
    }
    if (!reused) {
      const routed = await autoRouteDevEngineTaskByAvailability({
      taskId,
      estimateMinutes: estimate.minutes,
      note: "Developer Grid Vezérlőpult · BenAI automatikus kapacitásalapú kiosztás",
      prepareForPlusPull: true,
      chainSource: "DEVELOPER_GRID_WORK_START",
    });
      engineTask = routed.task;
      reused = false;
    }
  }

  const metadata = engineTask.metadata && typeof engineTask.metadata === "object" ? engineTask.metadata as Record<string, unknown> : {};
  const routedCode = coreWorkerCode((metadata.coordinatorSelectedWorker as Record<string, unknown> | undefined)?.workerCode || metadata.coordinatorSelectedWorkerCode || "BENJAMINAI");
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
    source: "EXPLICIT_TASK",
    resolvedAt: new Date().toISOString(),
  };
  const task = gridTaskFromEngine(engineTask as unknown as Record<string, unknown>);
  const session: WorkerSession = {
    id: `grid-work-${taskId}-${routedCode.toLowerCase()}`,
    workerCode: routedCode,
    taskId,
    developmentContext,
    sourceProvenance: {
      ...foundation.sourceProvenance,
      worker: routedCode,
      taskId,
      sessionId: `grid-work-${taskId}-${routedCode.toLowerCase()}`,
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
    productionAccess: "DENY" as const,
  };
}

function conversationIdFromUrl(value: unknown) {
  const raw = text(value, 1000);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !["chatgpt.com", "www.chatgpt.com"].includes(url.hostname)) return "";
    const match = url.pathname.match(/(?:^|\/)c\/([A-Za-z0-9_-]+)/);
    return match?.[1] || "";
  } catch { return ""; }
}

export async function bindDeveloperGridConversation(rawInput: Record<string, unknown>) {
  const taskId = text(rawInput.taskId, 220);
  const workerCode = strictCoreWorkerCode(rawInput.workerCode);
  const chatConversationUrl = text(rawInput.chatConversationUrl, 1000);
  const chatConversationId = text(rawInput.chatConversationId, 180) || conversationIdFromUrl(chatConversationUrl);
  const chatConversationTitle = text(rawInput.chatConversationTitle, 500);
  const chatPreviousConversationId = text(rawInput.chatPreviousConversationId, 180) || null;
  const requestedMode = text(rawInput.chatLaunchMode, 40).toUpperCase();
  const chatLaunchMode: ChatLaunchMode = requestedMode === "NEW_PROJECT_CHAT" ? "NEW_PROJECT_CHAT" : "EXISTING_CHAT";
  const confirmedBy = chatLaunchMode === "NEW_PROJECT_CHAT" ? "USER_CURRENT_CHAT" as const : "EXISTING_CHAT_SELECTION" as const;
  if (!taskId || !chatConversationId || conversationIdFromUrl(chatConversationUrl) !== chatConversationId) {
    const error = new Error("A taskhoz csak igazolt ChatGPT /c/... csevegés rögzíthető.");
    Object.assign(error, { code: "DEVELOPER_GRID_CHAT_CONVERSATION_INVALID", status: 400 });
    throw error;
  }
  if (chatLaunchMode === "NEW_PROJECT_CHAT" && chatPreviousConversationId && chatPreviousConversationId === chatConversationId) {
    const error = new Error("Az új projektcsevegés nem egyezhet a korábbi csevegéssel.");
    Object.assign(error, { code: "DEVELOPER_GRID_NEW_CHAT_REQUIRED", status: 409 });
    throw error;
  }
  const state = await readGridState();
  if (!state.task || String(state.task.id) !== taskId) {
    const error = new Error("A conversation binding task nem authoritative aktuális task.");
    Object.assign(error, { code: "DEVELOPER_GRID_CHAT_TASK_MISMATCH", status: 409 });
    throw error;
  }
  const session = state.sessions.find((item) => item.taskId === taskId && item.workerCode === workerCode && item.endedAt === null);
  if (!session) {
    const error = new Error("A taskhoz tartozó aktív worker session nem található.");
    Object.assign(error, { code: "DEVELOPER_GRID_CHAT_SESSION_MISSING", status: 409 });
    throw error;
  }
  const existingMode = session.developmentContext.chatLaunchMode || chatLaunchMode;
  if (existingMode !== chatLaunchMode) {
    const error = new Error("A csevegési mód eltér a munkaindításkor rögzített módtól.");
    Object.assign(error, { code: "DEVELOPER_GRID_CHAT_MODE_MISMATCH", status: 409 });
    throw error;
  }
  const confirmedAt = new Date().toISOString();
  const updated: WorkerSession = {
    ...session,
    developmentContext: {
      ...session.developmentContext,
      chatLaunchMode,
      chatPreviousConversationId,
      chatConversationId,
      chatConversationUrl,
      chatConversationTitle,
      chatConversationConfirmedAt: confirmedAt,
      chatConversationConfirmedBy: confirmedBy,
      resolvedAt: confirmedAt,
    },
  };
  const next = await upsertWorkerSession(updated);
  await appendGridEvent({
    kind: "analysis", origin: "LIVE", workerCode, taskId, projectId: state.task.projectId, productionAccess: "DENY",
    delta: { summary: `ChatGPT csevegés rögzítve · ${chatLaunchMode}`, workItem: updated.developmentContext.workItem, workStageIndex: updated.developmentContext.workStageIndex || 1 },
  });
  return {
    taskId, workerCode, chatLaunchMode, chatConversationId, chatConversationUrl, chatConversationTitle,
    chatConversationConfirmedAt: confirmedAt, chatConversationConfirmedBy: confirmedBy, revision: next.revision, productionAccess: "DENY" as const,
  };
}
