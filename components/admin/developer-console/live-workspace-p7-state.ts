export type LiveWorkspacePanelCount = 1 | 2 | 4;
export type LiveWorkspacePanelMode = "live" | "diff" | "history";

export type LiveWorkspacePanelDescriptor = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  relativePath: string;
  fileName: string;
  mode: LiveWorkspacePanelMode;
};

export type LiveWorkspacePanelState = {
  version: 1;
  layout: LiveWorkspacePanelCount;
  activePanelId: string;
  panels: LiveWorkspacePanelDescriptor[];
  updatedAt: string;
};

export const LIVE_WORKSPACE_P7_STORAGE_KEY = "benjadmin-live-workspace-p7-state";
export const LIVE_WORKSPACE_P7_CHANNEL = "benjadmin-live-workspace-p7-sync";

const PANEL_IDS = ["panel-1", "panel-2", "panel-3", "panel-4"] as const;

function emptyPanel(index: number): LiveWorkspacePanelDescriptor {
  return {
    id: PANEL_IDS[index] || `panel-${index + 1}`,
    workspaceId: "",
    workspaceName: "",
    relativePath: "",
    fileName: "",
    mode: "live",
  };
}

export function createLiveWorkspacePanelState(layout: LiveWorkspacePanelCount = 1): LiveWorkspacePanelState {
  return {
    version: 1,
    layout,
    activePanelId: "panel-1",
    panels: Array.from({ length: layout }, (_, index) => emptyPanel(index)),
    updatedAt: new Date().toISOString(),
  };
}

function isPanelCount(value: unknown): value is LiveWorkspacePanelCount {
  return value === 1 || value === 2 || value === 4;
}

function isMode(value: unknown): value is LiveWorkspacePanelMode {
  return value === "live" || value === "diff" || value === "history";
}

export function normalizeLiveWorkspacePanelState(value: unknown): LiveWorkspacePanelState {
  const fallback = createLiveWorkspacePanelState();
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<LiveWorkspacePanelState>;
  const layout = isPanelCount(raw.layout) ? raw.layout : 1;
  const sourcePanels = Array.isArray(raw.panels) ? raw.panels : [];
  const panels = Array.from({ length: layout }, (_, index) => {
    const candidate = sourcePanels[index] as Partial<LiveWorkspacePanelDescriptor> | undefined;
    const empty = emptyPanel(index);
    return {
      id: empty.id,
      workspaceId: typeof candidate?.workspaceId === "string" ? candidate.workspaceId.slice(0, 128) : "",
      workspaceName: typeof candidate?.workspaceName === "string" ? candidate.workspaceName.slice(0, 160) : "",
      relativePath: typeof candidate?.relativePath === "string" ? candidate.relativePath.slice(0, 1024) : "",
      fileName: typeof candidate?.fileName === "string" ? candidate.fileName.slice(0, 255) : "",
      mode: isMode(candidate?.mode) ? candidate.mode : "live",
    } satisfies LiveWorkspacePanelDescriptor;
  });
  const activePanelId = panels.some((panel) => panel.id === raw.activePanelId) ? String(raw.activePanelId) : panels[0]?.id || "panel-1";
  return {
    version: 1,
    layout,
    activePanelId,
    panels,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

export function resizeLiveWorkspacePanelState(current: LiveWorkspacePanelState, layout: LiveWorkspacePanelCount) {
  const nextPanels = Array.from({ length: layout }, (_, index) => current.panels[index] || emptyPanel(index));
  return {
    ...current,
    layout,
    activePanelId: nextPanels.some((panel) => panel.id === current.activePanelId) ? current.activePanelId : nextPanels[0]?.id || "panel-1",
    panels: nextPanels,
    updatedAt: new Date().toISOString(),
  } satisfies LiveWorkspacePanelState;
}
