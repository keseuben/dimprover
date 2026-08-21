import { resolveTaskDevelopmentContext, type DevelopmentTaskContextInput } from "./development-context";

export type DevelopmentMapNode = {
  id: string;
  groupName: string;
  projectName: string;
  moduleName: string;
  contextModuleName: string;
  contextMainModule: string;
  keywords: string[];
};

export type DevelopmentMapPlacement = {
  nodeId: string;
  groupName: string;
  projectName: string;
  moduleName: string;
  contextModuleName: string;
  workItem: string;
  source: string;
  updatedAt: string | null;
};

export const DEVELOPMENT_MAP_NODES: DevelopmentMapNode[] = [
  { id: "benjadmin-console-chat", groupName: "Belső fejlesztési platform", projectName: "BENJADMIN Fejlesztői Konzol", moduleName: "Fejlesztői Konzol", contextModuleName: "Közös fejlesztői csevegés", contextMainModule: "BENJADMIN", keywords: ["közös fejlesztői", "csevegés", "chat", "worker context", "kártya", "archív"] },
  { id: "benjadmin-chatgrid", groupName: "Belső fejlesztési platform", projectName: "BENJADMIN Fejlesztői Konzol", moduleName: "ChatGrid Desktop", contextModuleName: "Worker Grid / Daily Start / Desktop control", contextMainModule: "BENJADMIN", keywords: ["chatgrid", "worker grid", "daily start", "desktop", "windows chatgrid", "pairing", "ctrl+alt+9", "avatar", "vízjel"] },
  { id: "benjadmin-external-review-room", groupName: "Belső fejlesztési platform", projectName: "BENJADMIN Fejlesztői Konzol", moduleName: "ChatGrid External Review Room", contextModuleName: "BenAI / M.Forge / V.Guard review thread", contextMainModule: "BENJADMIN", keywords: ["external review room", "m.forge", "mforge", "v.guard", "vguard", "review thread", "external ai", "külső ai", "review room"] },
  { id: "benjadmin-ai-space", groupName: "Belső fejlesztési platform", projectName: "BENJADMIN Fejlesztői Konzol", moduleName: "AI Fejlesztői Tér", contextModuleName: "Worker Inbox / routing", contextMainModule: "BENJADMIN", keywords: ["worker inbox", "routing", "plus pull", "ai fejlesztői", "ai worker"] },
  { id: "benjadmin-live-workspace", groupName: "Belső fejlesztési platform", projectName: "BENJADMIN Fejlesztői Konzol", moduleName: "Live Workspace", contextModuleName: "Live / Diff / History", contextMainModule: "BENJADMIN", keywords: ["live workspace", "monaco", "diff", "history"] },
  { id: "benjadmin-terminal-hub", groupName: "Belső fejlesztési platform", projectName: "BENJADMIN Fejlesztői Konzol", moduleName: "Terminal Hub", contextModuleName: "Parancstár / approval", contextMainModule: "BENJADMIN", keywords: ["terminal", "parancstár", "approval", "parancs"] },
  { id: "benjadmin-windows-bridge", groupName: "Belső fejlesztési platform", projectName: "BENJADMIN Fejlesztői Konzol", moduleName: "Windows Bridge", contextModuleName: "Desktop / PowerShell bridge", contextMainModule: "BENJADMIN", keywords: ["windows bridge", "powershell", "desktop bridge"] },
  { id: "benjadmin-scheduler", groupName: "Belső fejlesztési platform", projectName: "BENJADMIN Fejlesztői Konzol", moduleName: "Fejlesztési ütemező", contextModuleName: "Overnight Scheduler", contextMainModule: "BENJADMIN", keywords: ["scheduler", "éjszak", "órás", "ébreszt", "wake"] },
  { id: "benjadmin-runtime-release", groupName: "Belső fejlesztési platform", projectName: "BENJADMIN Fejlesztői Konzol", moduleName: "Runtime / Release", contextModuleName: "Build / cutover / rollback", contextMainModule: "BENJADMIN", keywords: ["build", "release", "runtime", "rollback", "cutover", "pm2", "prod readiness"] },

  { id: "drop-gyorssend", groupName: "DIMPRO", projectName: "DIMPRO Drop", moduleName: "GyorsSend / Gyorskép", contextModuleName: "Mobil / PWA küldés", contextMainModule: "DIMPRO Drop", keywords: ["gyorssend", "gyorskép", "quick send", "v1212", "v1213", "voice", "retention"] },
  { id: "drop-core", groupName: "DIMPRO", projectName: "DIMPRO Drop", moduleName: "Drop Core", contextModuleName: "Fájlátadás / staging", contextMainModule: "DIMPRO Drop", keywords: ["drop", "staging", "package", "küldemény"] },

  { id: "drive-web", groupName: "DIMPRO", projectName: "DIMPRO Drive", moduleName: "Drive Web / munkatér", contextModuleName: "Commander / fájltér", contextMainModule: "DIMPRO Drive", keywords: ["drive web", "commander", "drive munkatér"] },
  { id: "drive-provision", groupName: "DIMPRO", projectName: "DIMPRO Drive", moduleName: "Projekt provisioning", contextModuleName: "Projektmappák / feltöltés", contextMainModule: "DIMPRO Drive", keywords: ["provision", "project upload", "projektmappa"] },
  { id: "drive-security", groupName: "DIMPRO", projectName: "DIMPRO Drive", moduleName: "Biztonság", contextModuleName: "Security / backfill", contextMainModule: "DIMPRO Drive", keywords: ["drive security", "backfill", "vault"] },
  { id: "drive-vector", groupName: "DIMPRO", projectName: "DIMPRO Drive", moduleName: "Vector / fájlszegmens", contextModuleName: "Nagy fájl / vektor", contextMainModule: "DIMPRO Drive", keywords: ["vector", "segment", "szegmens"] },
  { id: "drive-compare", groupName: "DIMPRO", projectName: "DIMPRO Drive", moduleName: "Összehasonlítás", contextModuleName: "Compare / findings", contextMainModule: "DIMPRO Drive", keywords: ["compare", "findings", "összehasonl"] },

  { id: "fajlmuhely-core", groupName: "DIMPRO", projectName: "DIMPRO Fájlműhely", moduleName: "Fájlműhely Core", contextModuleName: "Fájlrendező / képkezelés", contextMainModule: "DIMPRO Fájlműhely", keywords: ["fájlműhely", "fajlmuhely", "fájlnév", "képoptimal"] },
  { id: "fajlmuhely-dokubox", groupName: "DIMPRO", projectName: "DIMPRO Fájlműhely", moduleName: "DokuBOX", contextModuleName: "Dokumentumcsomag", contextMainModule: "DIMPRO Fájlműhely", keywords: ["dokubox", "doku box"] },

  { id: "dimprover-project-gate", groupName: "DIMPROVER", projectName: "DIMPROVER enterprise platform", moduleName: "Projektkapu", contextModuleName: "Projektközpont", contextMainModule: "DIMPROVER Projektkapu", keywords: ["projektkapu", "project gate"] },
  { id: "dimprover-issue", groupName: "DIMPROVER", projectName: "DIMPROVER enterprise platform", moduleName: "Hibajegyzék / Issue Engine", contextModuleName: "Központi hibajegyzék", contextMainModule: "DIMPROVER", keywords: ["central issue", "issue register", "issue engine", "hibajegyz"] },
  { id: "dimprover-field-issue", groupName: "DIMPROVER", projectName: "DIMPROVER enterprise platform", moduleName: "Terepi hibajegyzék", contextModuleName: "Field Issue", contextMainModule: "DIMPROVER", keywords: ["field issue", "tere pi", "terepi"] },
  { id: "dimprover-project-identity", groupName: "DIMPROVER", projectName: "DIMPROVER enterprise platform", moduleName: "Project Identity", contextModuleName: "Kontextusmotor", contextMainModule: "DIMPROVER", keywords: ["project identity", "context propagation", "kontextus"] },
  { id: "dimprover-schedule", groupName: "DIMPROVER", projectName: "DIMPROVER enterprise platform", moduleName: "Ütemterv", contextModuleName: "Timeline engine", contextMainModule: "DIMPROVER", keywords: ["ütemterv", "schedule", "timeline", "gantt"] },
  { id: "dimprover-document-viewer", groupName: "DIMPROVER", projectName: "DIMPROVER enterprise platform", moduleName: "DocumentViewer", contextModuleName: "PDF / DXF viewer", contextMainModule: "DIMPROVER", keywords: ["documentviewer", "dxf", "pdf viewer", "cad"] },

  { id: "infra-storage", groupName: "Belső infrastruktúra", projectName: "DIMPRO Szerverüzemeltetés és Infrastruktúra", moduleName: "Tárhely / retention", contextModuleName: "DEV storage", contextMainModule: "DIMPRO infrastruktúra", keywords: ["storage", "retention", "tárhely", "disk"] },
  { id: "infra-auth", groupName: "Belső infrastruktúra", projectName: "DIMPRO Szerverüzemeltetés és Infrastruktúra", moduleName: "Auth / licenc", contextModuleName: "Központi beléptetés", contextMainModule: "DIMPRO infrastruktúra", keywords: ["auth", "license", "licenc", "webauthn", "passkey"] },
];

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export function developmentMapNodeById(nodeId: string) {
  return DEVELOPMENT_MAP_NODES.find((node) => node.id === nodeId) || null;
}

export function isTechnicalDevelopmentTask(task: Pick<DevelopmentTaskContextInput, "title" | "description">) {
  const value = `${text(task.title)} ${text(task.description)}`.toLowerCase();
  return /\b(m2|m3|p9|p10|p101|p102)\b/.test(value) || value.includes("acceptance") || value.includes("e2e transient") || value.includes("atomic claim race") || value.includes("stale recovery");
}

export function resolveDevelopmentMapNode(task: DevelopmentTaskContextInput): DevelopmentMapNode | null {
  const metadata = record(task.metadata);
  const stored = record(metadata.developmentMap);
  const explicit = developmentMapNodeById(text(stored.nodeId));
  if (explicit) return explicit;

  const context = resolveTaskDevelopmentContext(task);
  const haystack = `${text(task.title)} ${text(task.description)} ${context.mainModule} ${context.moduleName} ${context.submoduleName}`.toLowerCase();
  let best: { node: DevelopmentMapNode; score: number } | null = null;
  for (const node of DEVELOPMENT_MAP_NODES) {
    let score = 0;
    if (context.mainModule.toLowerCase() === node.contextMainModule.toLowerCase()) score += 5;
    if (context.moduleName.toLowerCase() === node.moduleName.toLowerCase()) score += 7;
    if (context.submoduleName.toLowerCase() === node.contextModuleName.toLowerCase()) score += 8;
    for (const keyword of node.keywords) if (haystack.includes(keyword.toLowerCase())) score += 3;
    if (!best || score > best.score) best = { node, score };
  }
  return best && best.score >= 5 ? best.node : null;
}

export function resolveDevelopmentMapPlacement(task: DevelopmentTaskContextInput): DevelopmentMapPlacement | null {
  const node = resolveDevelopmentMapNode(task);
  if (!node) return null;
  const metadata = record(task.metadata);
  const stored = record(metadata.developmentMap);
  const context = resolveTaskDevelopmentContext(task);
  return {
    nodeId: node.id,
    groupName: text(stored.groupName) || node.groupName,
    projectName: text(stored.projectName) || node.projectName,
    moduleName: text(stored.moduleName) || node.moduleName,
    contextModuleName: text(stored.contextModuleName) || node.contextModuleName,
    workItem: text(stored.workItem) || context.workItem,
    source: text(stored.source) || "TASK_INFERENCE",
    updatedAt: text(stored.updatedAt) || null,
  };
}
