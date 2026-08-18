export type DevelopmentTaskContextInput = {
  projectId?: string | null;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  scope?: unknown;
  metadata?: Record<string, unknown> | null;
};

export type DevelopmentContextView = {
  projectId: string;
  projectName: string;
  mainModule: string;
  moduleName: string;
  submoduleName: string;
  workItem: string;
  activityAction: string;
  activityNarrative: string;
  workStageIndex: number;
  workStageLabel: string;
  updatedAt: string | null;
  source: string;
};

export const DEVELOPMENT_STAGE_LABELS = [
  "",
  "ELEMZÉS / ELŐKÉSZÍTÉS",
  "FEJLESZTÉS",
  "TESZTELÉS",
  "ELLENŐRZÉS / JAVÍTÁS",
  "BUILD / KIADÁS",
  "LEZÁRÁS / ÁTADÁS",
] as const;

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function scopeEntries(value: unknown) {
  if (!Array.isArray(value)) return [] as Array<{ type: string; key: string }>;
  return value.map((item) => record(item)).map((item) => ({ type: text(item.type), key: text(item.key) })).filter((item) => item.type && item.key);
}
export function safeDevelopmentStage(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(6, Math.round(n))) : 0;
}

export function buildDevelopmentContextKey(input: {
  projectId?: unknown;
  mainModule?: unknown;
  moduleName?: unknown;
  submoduleName?: unknown;
  workItem?: unknown;
}) {
  const projectId = text(input.projectId) || "global";
  const hierarchy = [text(input.mainModule), text(input.moduleName), text(input.submoduleName), text(input.workItem)];
  if (!hierarchy.some(Boolean)) return "";
  return [projectId, ...hierarchy].map((value) => value.toLocaleLowerCase("hu-HU").replace(/\s+/g, " " ).trim()).join("|");
}

function inferHierarchy(task: DevelopmentTaskContextInput) {
  const meta = record(task.metadata);
  const stored = record(meta.developmentContext);
  const haystack = `${text(task.title)} ${text(task.description)}`.toLowerCase();
  let mainModule = text(stored.mainModule || meta.mainModule || meta.main_module || meta.productArea || meta.product);
  let moduleName = text(stored.moduleName || meta.moduleName || meta.module || meta.module_name || meta.moduleHint);
  let submoduleName = text(stored.submoduleName || meta.submoduleName || meta.submodule || meta.sub_module || meta.featureArea);
  const workItem = text(stored.workItem || meta.workItem || meta.work_item || meta.currentWorkItem) || text(task.title) || "Aktuális munkarész";
  if (!mainModule) {
    if (haystack.includes("benjadmin")) mainModule = "BENJADMIN";
    else if (haystack.includes("gyorssend") || haystack.includes("gyorskép") || haystack.includes("drop")) mainModule = "DIMPRO Drop";
    else if (haystack.includes("drive")) mainModule = "DIMPRO Drive";
    else if (haystack.includes("fájlműhely") || haystack.includes("fajlmuhely")) mainModule = "DIMPRO Fájlműhely";
    else if (haystack.includes("projektkapu")) mainModule = "DIMPROVER Projektkapu";
    else if (haystack.includes("értekez") || haystack.includes("teams")) mainModule = "DIMPRO Értekezleti Asszisztens";
    else mainModule = text(task.projectId) === "project_dimprover" ? "DIMPROVER" : text(task.projectId) || "DIMPRO";
  }
  if (!moduleName) {
    if (mainModule === "BENJADMIN") {
      if (haystack.includes("scheduler") || haystack.includes("éjszak") || haystack.includes("ébreszt")) moduleName = "Fejlesztési ütemező";
      else if (haystack.includes("worker") || haystack.includes("live workspace")) moduleName = "AI Fejlesztői Tér";
      else moduleName = "Fejlesztői Konzol";
    } else if (mainModule === "DIMPRO Drop") moduleName = haystack.includes("gyors") ? "GyorsSend / Gyorskép" : "Drop Core";
    else if (mainModule === "DIMPRO Drive") moduleName = "Drive munkatér";
    else moduleName = "Fejlesztési munkarész";
  }
  if (!submoduleName) {
    if (haystack.includes("közös fejlesztői") || haystack.includes("worker context") || haystack.includes("kárty")) submoduleName = "Közös fejlesztői csevegés";
    else if (haystack.includes("worker inbox")) submoduleName = "Worker Inbox";
    else if (haystack.includes("live workspace")) submoduleName = "Live Workspace";
    else if (haystack.includes("voice") || haystack.includes("diktál")) submoduleName = "Hang / diktálás";
    else if (haystack.includes("multipart") || haystack.includes("upload") || haystack.includes("feltölt")) submoduleName = "Feltöltési folyamat";
    else if (haystack.includes("scheduler") || haystack.includes("éjszak")) submoduleName = "Éjszakai / órás futási lánc";
    else if (haystack.includes("pwa")) submoduleName = "PWA";
    else if (haystack.includes("chat") || haystack.includes("cseveg")) submoduleName = "Csevegés és aktivitás";
    else {
      const scopes = scopeEntries(task.scope);
      submoduleName = scopes.find((item) => item.type === "module")?.key || scopes.find((item) => item.type === "path")?.key || "Aktuális funkció";
    }
  }
  return { mainModule, moduleName, submoduleName, workItem };
}

function stageForTask(task: DevelopmentTaskContextInput, stored: Record<string, unknown>, meta: Record<string, unknown>) {
  const explicit = safeDevelopmentStage(stored.workStageIndex || meta.workStageIndex);
  if (explicit) return explicit;
  const status = text(task.status).toLowerCase();
  if (["completed", "cancelled"].includes(status)) return 6;
  if (status === "testing") return 3;
  if (status === "blocked" || status === "failed") return 4;
  if (["claimed", "in_progress"].includes(status)) return 2;
  return 1;
}

function actionForStage(stage: number) {
  if (stage === 1) return "Elemzi és előkészíti a kijelölt fejlesztési munkarészt.";
  if (stage === 2) return "A kijelölt funkció kódját fejleszti és a kapcsolódó fájlokat módosítja.";
  if (stage === 3) return "Célzott teszteket és regressziós ellenőrzéseket futtat az elkészült módosításon.";
  if (stage === 4) return "A teszteredményeket ellenőrzi, hibát javít vagy minőségi felülvizsgálatot végez.";
  if (stage === 5) return "Build és kiadás-előkészítési kapukat futtat a DEV release előtt.";
  return "Lezárja a munkarészt, dokumentálja az eredményt és átadja a következő láncszemnek.";
}

export function resolveTaskDevelopmentContext(task: DevelopmentTaskContextInput): DevelopmentContextView {
  const meta = record(task.metadata);
  const stored = record(meta.developmentContext);
  const hierarchy = inferHierarchy(task);
  const projectId = text(stored.projectId || meta.projectId || task.projectId);
  const projectName = text(stored.projectName || meta.projectName || meta.project_name) || (projectId === "project_dimprover" ? "DIMPROVER" : projectId || "DIMPRO");
  const workStageIndex = stageForTask(task, stored, meta);
  const description = text(task.description).replace(/\s+/g, " ");
  const activityAction = text(stored.activityAction || meta.activityAction) || actionForStage(workStageIndex);
  const activityNarrative = text(stored.activityNarrative || meta.activityNarrative) || (description ? `${activityAction} Feladatcél: ${description.slice(0, 360)}${description.length > 360 ? "…" : ""}` : activityAction);
  return {
    projectId,
    projectName,
    ...hierarchy,
    activityAction,
    activityNarrative,
    workStageIndex,
    workStageLabel: text(stored.workStageLabel || meta.workStageLabel) || DEVELOPMENT_STAGE_LABELS[workStageIndex],
    updatedAt: text(stored.updatedAt) || null,
    source: text(stored.source) || "TASK_INFERENCE",
  };
}
