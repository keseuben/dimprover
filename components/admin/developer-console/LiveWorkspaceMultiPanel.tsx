"use client";

import { Columns2, ExternalLink, LayoutGrid, MonitorUp, PanelTopClose, Rows2, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LiveWorkspaceFilePreview } from "@/app/lib/dev-center/terminal-hub/live-workspace";
import LiveWorkspaceMonaco, { type MonacoMode } from "./LiveWorkspaceMonaco";
import {
  LIVE_WORKSPACE_P7_CHANNEL,
  LIVE_WORKSPACE_P7_STORAGE_KEY,
  createLiveWorkspacePanelState,
  normalizeLiveWorkspacePanelState,
  resizeLiveWorkspacePanelState,
  type LiveWorkspacePanelCount,
  type LiveWorkspacePanelState,
} from "./live-workspace-p7-state";
import type { ConsoleTheme } from "./types";
import styles from "./DeveloperConsole.module.css";

type PanelFile = { workspaceId: string; file: LiveWorkspaceFilePreview };

type PanelAssignment = {
  serial: number;
  workspaceId: string;
  workspaceName: string;
  file: LiveWorkspaceFilePreview;
};

function adminHeaders() {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { "x-dimpro-license-admin-key": key };
}

function readStoredState() {
  try {
    const raw = localStorage.getItem(LIVE_WORKSPACE_P7_STORAGE_KEY);
    return normalizeLiveWorkspacePanelState(raw ? JSON.parse(raw) : null);
  } catch {
    return createLiveWorkspacePanelState();
  }
}

function writeStoredState(state: LiveWorkspacePanelState) {
  localStorage.setItem(LIVE_WORKSPACE_P7_STORAGE_KEY, JSON.stringify(state));
}

export default function LiveWorkspaceMultiPanel({ enabled, theme, assignment = null, detached = false }: { enabled: boolean; theme: ConsoleTheme; assignment?: PanelAssignment | null; detached?: boolean }) {
  const [state, setState] = useState<LiveWorkspacePanelState>(() => createLiveWorkspacePanelState());
  const [files, setFiles] = useState<Record<string, PanelFile>>({});
  const [message, setMessage] = useState("");
  const [syncState, setSyncState] = useState<"LOCAL" | "SYNC">("LOCAL");
  const channelRef = useRef<BroadcastChannel | null>(null);
  const filesRef = useRef<Record<string, PanelFile>>({});
  const assignmentSerialRef = useRef(0);
  const hydratedRef = useRef(false);

  const broadcast = useCallback((next: LiveWorkspacePanelState) => {
    writeStoredState(next);
    channelRef.current?.postMessage({ type: "state", state: next });
    setSyncState("SYNC");
    window.setTimeout(() => setSyncState("LOCAL"), 700);
  }, []);

  const applyState = useCallback((updater: (current: LiveWorkspacePanelState) => LiveWorkspacePanelState, shouldBroadcast = true) => {
    setState((current) => {
      const next = normalizeLiveWorkspacePanelState(updater(current));
      if (shouldBroadcast) broadcast(next);
      return next;
    });
  }, [broadcast]);

  const loadPanelFile = useCallback(async (panelId: string, workspaceId: string, relativePath: string) => {
    if (!workspaceId || !relativePath) return;
    try {
      const params = new URLSearchParams({ workspaceId, path: relativePath });
      const response = await fetch(`/api/dev/terminal-hub/live-workspace/file?${params}`, { headers: adminHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; file?: LiveWorkspaceFilePreview; code?: string; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.file) throw new Error(`${payload?.code ? `${payload.code}: ` : ""}${payload?.error || "A P7 panel fájlja nem tölthető be."}`);
      setFiles((current) => ({ ...current, [panelId]: { workspaceId, file: payload.file! } }));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "A P7 panel fájlja nem tölthető be.");
    }
  }, []);

  const hydrateFiles = useCallback((next: LiveWorkspacePanelState) => {
    for (const panel of next.panels) {
      if (!panel.workspaceId || !panel.relativePath) continue;
      const loaded = filesRef.current[panel.id];
      if (loaded?.workspaceId === panel.workspaceId && loaded.file.relativePath === panel.relativePath) continue;
      void loadPanelFile(panel.id, panel.workspaceId, panel.relativePath);
    }
  }, [loadPanelFile]);

  useEffect(() => { filesRef.current = files; }, [files]);

  useEffect(() => {
    if (!enabled) return;
    const initial = readStoredState();
    hydratedRef.current = true;
    setState(initial);
    hydrateFiles(initial);

    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(LIVE_WORKSPACE_P7_CHANNEL);
      channelRef.current = channel;
      channel.onmessage = (event: MessageEvent<{ type?: string; state?: unknown }>) => {
        if (event.data?.type !== "state") return;
        const next = normalizeLiveWorkspacePanelState(event.data.state);
        setState(next);
        writeStoredState(next);
        hydrateFiles(next);
        setSyncState("SYNC");
        window.setTimeout(() => setSyncState("LOCAL"), 700);
      };
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== LIVE_WORKSPACE_P7_STORAGE_KEY || !event.newValue) return;
      try {
        const next = normalizeLiveWorkspacePanelState(JSON.parse(event.newValue));
        setState(next);
        hydrateFiles(next);
      } catch {}
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [enabled, hydrateFiles]);

  useEffect(() => {
    if (!enabled || !assignment || !hydratedRef.current || assignment.serial === assignmentSerialRef.current) return;
    assignmentSerialRef.current = assignment.serial;
    const panelId = state.activePanelId;
    setFiles((current) => ({ ...current, [panelId]: { workspaceId: assignment.workspaceId, file: assignment.file } }));
    applyState((current) => ({
      ...current,
      panels: current.panels.map((panel) => panel.id === panelId ? {
        ...panel,
        workspaceId: assignment.workspaceId,
        workspaceName: assignment.workspaceName,
        relativePath: assignment.file.relativePath,
        fileName: assignment.file.name,
        mode: "live",
      } : panel),
      updatedAt: new Date().toISOString(),
    }));
  }, [applyState, assignment, enabled, state.activePanelId]);

  const activePanel = useMemo(() => state.panels.find((panel) => panel.id === state.activePanelId) || state.panels[0], [state.activePanelId, state.panels]);

  function setLayout(layout: LiveWorkspacePanelCount) {
    setFiles((current) => Object.fromEntries(Object.entries(current).filter(([id]) => Number(id.replace("panel-", "")) <= layout)));
    applyState((current) => resizeLiveWorkspacePanelState(current, layout));
  }

  function activatePanel(panelId: string) {
    if (state.activePanelId === panelId) return;
    applyState((current) => ({ ...current, activePanelId: panelId, updatedAt: new Date().toISOString() }));
  }

  function setPanelMode(panelId: string, mode: MonacoMode) {
    applyState((current) => ({ ...current, panels: current.panels.map((panel) => panel.id === panelId ? { ...panel, mode } : panel), updatedAt: new Date().toISOString() }));
  }

  function clearPanel(panelId: string) {
    setFiles((current) => {
      const next = { ...current };
      delete next[panelId];
      return next;
    });
    applyState((current) => ({
      ...current,
      panels: current.panels.map((panel) => panel.id === panelId ? { ...panel, workspaceId: "", workspaceName: "", relativePath: "", fileName: "", mode: "live" } : panel),
      updatedAt: new Date().toISOString(),
    }));
  }

  function resetBoard() {
    const next = createLiveWorkspacePanelState(1);
    setFiles({});
    setState(next);
    broadcast(next);
  }

  function detachWorkspace() {
    if (detached) return;
    const width = Math.max(1000, window.screen.availWidth || 1400);
    const height = Math.max(720, window.screen.availHeight || 900);
    const popup = window.open("about:blank", "benjadmin-live-workspace-p7", `popup=yes,resizable=yes,scrollbars=no,width=${width},height=${height},left=0,top=0`);
    if (!popup) {
      setMessage("A böngésző blokkolta a Live Workspace leválasztott ablakát.");
      return;
    }
    try {
      if (sessionStorage.getItem("dimproBenjadminSession") === "active") popup.sessionStorage.setItem("dimproBenjadminSession", "active");
      popup.location.replace("/admin/dev-console/workspace");
      popup.focus();
    } catch {
      popup.location.href = "/admin/dev-console/workspace";
    }
  }

  if (!enabled) {
    return <div className={styles.liveWorkspaceMultiPanelOff}><LayoutGrid size={22} /><div><strong>P7 MULTI-PANEL OFF</strong><span>A P6 egyablakos Monaco nézet változatlanul használható.</span></div></div>;
  }

  return (
    <section className={`${styles.liveWorkspaceMultiPanel} ${detached ? styles.liveWorkspaceMultiPanelDetached : ""}`} data-layout={state.layout} data-testid="live-workspace-p7">
      <header className={styles.liveWorkspaceMultiPanelToolbar}>
        <div>
          <strong>P7 · MULTI-PANEL WORKSPACE</strong>
          <span>{activePanel?.workspaceName || "Aktív panel üres"}{activePanel?.fileName ? ` · ${activePanel.fileName}` : ""}</span>
        </div>
        <div className={styles.liveWorkspaceMultiPanelActions}>
          <button type="button" data-active={state.layout === 1 ? "true" : "false"} onClick={() => setLayout(1)} title="1 panel"><PanelTopClose size={14} /> 1</button>
          <button type="button" data-active={state.layout === 2 ? "true" : "false"} onClick={() => setLayout(2)} title="2 panel"><Columns2 size={14} /> 2</button>
          <button type="button" data-active={state.layout === 4 ? "true" : "false"} onClick={() => setLayout(4)} title="4 panel"><LayoutGrid size={14} /> 4</button>
          <span data-sync={syncState.toLowerCase()}>{syncState}</span>
          {detached ? <button type="button" onClick={() => window.close()} title="Visszadokkolás"><MonitorUp size={14} /> Visszadokkolás</button> : <button type="button" onClick={detachWorkspace} title="Leválasztás második monitorra"><ExternalLink size={14} /> Leválasztás</button>}
          <button type="button" onClick={resetBoard} title="Panelkiosztás alaphelyzet"><RotateCcw size={14} /></button>
        </div>
      </header>

      {message ? <div className={styles.liveWorkspaceMultiPanelNotice}>{message}</div> : null}
      <div className={styles.liveWorkspaceMultiPanelGrid} data-layout={state.layout}>
        {state.panels.map((panel, index) => {
          const loaded = files[panel.id];
          const matchesDescriptor = loaded?.workspaceId === panel.workspaceId && loaded.file.relativePath === panel.relativePath;
          return (
            <article key={panel.id} className={styles.liveWorkspaceMultiPanelCell} data-active={panel.id === state.activePanelId ? "true" : "false"} onClick={() => activatePanel(panel.id)}>
              <header>
                <div><b>PANEL {index + 1}</b><strong>{panel.fileName || "ÜRES"}</strong><span>{panel.workspaceName || "Válassz worktree-t és fájlt a navigatorból"}</span></div>
                <div><span>{panel.mode.toUpperCase()}</span>{panel.fileName ? <button type="button" onClick={(event) => { event.stopPropagation(); clearPanel(panel.id); }} aria-label={`Panel ${index + 1} ürítése`}><X size={13} /></button> : null}</div>
              </header>
              <div className={styles.liveWorkspaceMultiPanelContent}>
                {matchesDescriptor && loaded ? (
                  <LiveWorkspaceMonaco enabled workspaceId={panel.workspaceId} file={loaded.file} theme={theme} instanceId={panel.id} mode={panel.mode} onModeChange={(mode) => setPanelMode(panel.id, mode)} />
                ) : panel.workspaceId && panel.relativePath ? (
                  <div className={styles.liveWorkspaceMultiPanelEmpty}>Panel tartalmának visszatöltése…</div>
                ) : (
                  <div className={styles.liveWorkspaceMultiPanelEmpty}><Rows2 size={22} /><strong>PANEL {index + 1}</strong><span>Kattints a panelre, majd válassz fájlt a bal oldali Live Workspace navigatorban.</span></div>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <footer>READ ONLY · P4/P6 policy öröklődik · állapot: azonosítók és UI metaadatok · fájltartalom nem kerül localStorage-ba</footer>
    </section>
  );
}
