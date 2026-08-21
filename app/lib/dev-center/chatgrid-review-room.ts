import { EXTERNAL_AI_WORKERS, listExternalAiWorkerTasks } from "./ai-worker/v1";
import { probeWorkerModelAdapters } from "./ai-worker/model-adapter";
import { listDeveloperConsoleMessages } from "./developer-console";

function text(value: unknown, max = 1200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function list(value: unknown, limit = 24) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}
function safeFinding(value: unknown) {
  const row = record(value);
  return {
    severity: text(row.severity, 40) || "INFO",
    category: text(row.category, 80) || "OTHER",
    message: text(row.message, 1200),
    path: text(row.path, 500) || null,
  };
}
function safeMessageMetadata(value: unknown) {
  const meta = record(value);
  return {
    action: text(meta.action, 120),
    mainModule: text(meta.mainModule, 160),
    moduleName: text(meta.moduleName, 160),
    submoduleName: text(meta.submoduleName, 160),
    workItem: text(meta.workItem, 300),
    taskTitle: text(meta.taskTitle, 500),
    taskStatus: text(meta.taskStatus, 80),
    workStageIndex: Number.isFinite(Number(meta.workStageIndex)) ? Number(meta.workStageIndex) : null,
    workStageLabel: text(meta.workStageLabel, 120),
  };
}

export async function getChatGridReviewRoomSnapshot() {
  const [tasks, adapters, messages] = await Promise.all([
    listExternalAiWorkerTasks(),
    probeWorkerModelAdapters(),
    listDeveloperConsoleMessages(240),
  ]);
  const taskIds = new Set(tasks.map((task) => task.id));
  const externalActors = new Set(["BENJADMIN", "BENAI", "MFORGE", "VGUARD"]);
  const reviewThread = messages
    .filter((message) => taskIds.has(message.taskId || "") || externalActors.has(message.author) && (message.target === "MFORGE" || message.target === "VGUARD") || message.author === "MFORGE" || message.author === "VGUARD")
    .slice(-120)
    .map((message) => ({
      id: message.id,
      author: message.author,
      target: message.target,
      kind: message.kind,
      level: message.level,
      summary: text(message.summary, 1800),
      detail: text(message.detail, 2400),
      taskId: message.taskId,
      projectId: message.projectId,
      createdAt: message.createdAt,
      metadata: safeMessageMetadata(message.metadata),
    }));

  return {
    generatedAt: new Date().toISOString(),
    mode: "READ_ONLY_REVIEW" as const,
    productionAccess: "DENY" as const,
    workers: EXTERNAL_AI_WORKERS.map((worker) => ({
      code: worker.code,
      displayName: worker.displayName,
      personName: worker.personName,
      role: worker.role,
      avatar: worker.avatar,
      capabilities: worker.capabilities,
    })),
    adapters: adapters.map((adapter) => ({
      provider: adapter.provider,
      label: adapter.label,
      ready: adapter.ready,
      modelId: adapter.modelId,
      roles: adapter.roles,
      executionGateEnabled: adapter.executionGateEnabled,
      detail: text(adapter.detail, 600),
    })),
    tasks: tasks.map((task) => {
      const forge = record(task.mforgeResult);
      const run = record(task.runCoordinator);
      const output = record(task.providerOutputArtifact);
      const guard = record(task.vguardReview);
      return {
        id: task.id,
        projectId: task.projectId,
        title: text(task.title, 500),
        goal: text(task.goal, 1200),
        engineStatus: task.engineStatus,
        workflowState: task.workflowState,
        modelPreference: task.modelPreference,
        moduleHint: text(task.moduleHint, 240) || null,
        updatedAt: task.updatedAt,
        mforge: {
          state: text(forge.state, 80) || text(run.state, 80) || null,
          provider: text(run.provider, 80) || text(output.provider, 80) || null,
          modelId: text(run.modelId, 200) || text(output.modelId, 200) || null,
          baselineCommit: text(forge.baselineCommit, 64) || null,
          commit: text(forge.commit, 64) || null,
          changedFileCount: Number.isFinite(Number(forge.changedFileCount)) ? Number(forge.changedFileCount) : Number.isFinite(Number(output.changedFileCount)) ? Number(output.changedFileCount) : 0,
          changedPaths: list(forge.changedPaths, 24).map((item) => text(item, 500)).filter(Boolean),
          integrated: forge.integrated === true,
        },
        vguard: {
          state: text(guard.state, 80) || null,
          provider: text(guard.provider, 80) || null,
          modelId: text(guard.modelId, 200) || null,
          result: text(guard.result, 80) || null,
          summary: text(guard.summary, 1800),
          findings: list(guard.findings, 16).map(safeFinding),
          reviewedAt: text(guard.reviewedAt, 80) || null,
          reviewOnly: guard.reviewOnly !== false,
        },
      };
    }),
    thread: reviewThread,
  };
}
