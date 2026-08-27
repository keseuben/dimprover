import type {
  DeveloperGridActivityLike,
  DeveloperGridContext,
  DeveloperGridPresenceLike,
  DeveloperGridSourceProvenance,
  DeveloperGridSourceProvenanceInput,
  DeveloperGridTaskLike,
} from "./types";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function stage(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(6, Math.round(n))) : 1;
}
function dateMs(value: unknown) {
  const raw = text(value);
  if (!raw) return 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}
function normalizePath(value: string) { return value.replace(/\\/g, "/").replace(/\/+$/, ""); }

function explicitTaskContext(task: DeveloperGridTaskLike): DeveloperGridContext | null {
  const metadata = record(task.metadata);
  const stored = record(metadata.developmentContext);
  const mainModule = text(stored.mainModule);
  const moduleName = text(stored.moduleName);
  const submoduleName = text(stored.submoduleName);
  const workItem = text(stored.workItem);
  if (![mainModule, moduleName, submoduleName, workItem].some(Boolean)) return null;
  return {
    projectId: text(stored.projectId) || text(task.projectId),
    mainModule: mainModule || "BENJADMIN",
    moduleName: moduleName || "Developer Grid V1",
    submoduleName: submoduleName || "Foundation",
    workItem: workItem || text(task.title) || "Aktuális fejlesztési feladat",
    workStageIndex: stage(stored.workStageIndex),
    source: "TASK_EXPLICIT",
    updatedAt: text(stored.updatedAt) || null,
  };
}

function contextFromActivity(activity: DeveloperGridActivityLike): DeveloperGridContext | null {
  if (![activity.mainModule, activity.moduleName, activity.submoduleName, activity.workItem].some((value) => text(value))) return null;
  return {
    projectId: text(activity.projectId),
    mainModule: text(activity.mainModule) || "BENJADMIN",
    moduleName: text(activity.moduleName) || "Developer Grid V1",
    submoduleName: text(activity.submoduleName) || "Foundation",
    workItem: text(activity.workItem) || "Aktuális fejlesztési feladat",
    workStageIndex: stage(activity.workStageIndex),
    source: "ACTIVITY",
    updatedAt: text(activity.createdAt) || null,
  };
}

export function resolveAuthoritativeDeveloperContext(input: {
  task: DeveloperGridTaskLike;
  activity?: DeveloperGridActivityLike[];
  presence?: DeveloperGridPresenceLike | null;
}): DeveloperGridContext {
  const explicit = explicitTaskContext(input.task);
  if (explicit) return explicit;

  const matchingActivity = [...(input.activity || [])]
    .filter((item) => !text(item.taskId) || text(item.taskId) === input.task.id)
    .sort((a, b) => dateMs(b.createdAt) - dateMs(a.createdAt))
    .map(contextFromActivity)
    .find(Boolean);
  if (matchingActivity) return matchingActivity;

  const metadata = record(input.task.metadata);
  const inferredMain = /benjadmin/i.test(text(input.task.title)) ? "BENJADMIN" : text(metadata.mainModule) || "DIMPRO";
  if (text(input.task.title) || text(input.task.projectId)) {
    return {
      projectId: text(input.task.projectId),
      mainModule: inferredMain,
      moduleName: /developer grid/i.test(text(input.task.title)) ? "Developer Grid V1" : text(metadata.moduleName) || "Fejlesztői Konzol",
      submoduleName: text(metadata.submoduleName) || "Aktuális funkció",
      workItem: text(input.task.title) || "Aktuális fejlesztési feladat",
      workStageIndex: stage(record(metadata.developmentContext).workStageIndex || metadata.workStageIndex),
      source: "TASK_INFERENCE",
      updatedAt: null,
    };
  }

  const fallback = contextFromActivity(input.presence || {});
  if (fallback) return { ...fallback, source: "PRESENCE_FALLBACK", updatedAt: text(input.presence?.heartbeatAt) || fallback.updatedAt };
  return { projectId: "", mainModule: "", moduleName: "", submoduleName: "", workItem: "", workStageIndex: 1, source: "UNKNOWN", updatedAt: null };
}

export function verifyDeveloperGridSourceProvenance(input: DeveloperGridSourceProvenanceInput): DeveloperGridSourceProvenance {
  const reasons: string[] = [];
  if (input.expectedBranch !== input.actualBranch) reasons.push("BRANCH_MISMATCH");
  if (normalizePath(input.expectedWorktree) !== normalizePath(input.actualWorktree)) reasons.push("WORKTREE_MISMATCH");
  if (input.expectedHead !== input.actualHead) reasons.push("HEAD_MISMATCH");
  if (input.canonicalHead !== input.actualHead) reasons.push("CANONICAL_HEAD_MISMATCH");
  if (!input.clean) reasons.push("DIRTY_WORKTREE");
  return {
    ...input,
    state: reasons.length ? "BLOCKED" : "VERIFIED",
    blocker: reasons.length ? "SOURCE_BASELINE_MISMATCH" : null,
    reasons,
  };
}
