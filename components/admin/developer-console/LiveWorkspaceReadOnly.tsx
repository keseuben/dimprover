"use client";

import { Activity, ArrowUp, FileCode2, Folder, GitBranch, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LiveWorkspaceFilePreview, LiveWorkspaceSummary, LiveWorkspaceTreeEntry } from "@/app/lib/dev-center/terminal-hub/live-workspace";
import type { LiveWorkspaceActivitySnapshot } from "@/app/lib/dev-center/terminal-hub/live-workspace-activity";
import LiveWorkspaceMonaco from "./LiveWorkspaceMonaco";
import LiveWorkspaceMultiPanel from "./LiveWorkspaceMultiPanel";
import type { ConsoleTheme } from "./types";
import styles from "./DeveloperConsole.module.css";

type TreePayload = {
  workspace: { id: string; name: string; plane: "INTERNAL" | "PARTNER"; path: string };
  relativePath: string;
  parentPath: string | null;
  entries: LiveWorkspaceTreeEntry[];
  hiddenCount: number;
  truncated: boolean;
};

function adminHeaders() {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { "x-dimpro-license-admin-key": key };
}

function bytes(value: number) {
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

function timeLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function LiveWorkspaceReadOnly({ enabled, activityEnabled, monacoEnabled, multiPanelEnabled, theme }: { enabled: boolean; activityEnabled: boolean; monacoEnabled: boolean; multiPanelEnabled: boolean; theme: ConsoleTheme }) {
  const [workspaces, setWorkspaces] = useState<LiveWorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [tree, setTree] = useState<TreePayload | null>(null);
  const [file, setFile] = useState<LiveWorkspaceFilePreview | null>(null);
  const [activity, setActivity] = useState<LiveWorkspaceActivitySnapshot | null>(null);
  const [busy, setBusy] = useState("");
  const [activityBusy, setActivityBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [activityMessage, setActivityMessage] = useState("");
  const [assignmentSerial, setAssignmentSerial] = useState(0);
  const workspaceIdRef = useRef("");

  const selectedWorkspace = useMemo(() => workspaces.find((item) => item.id === workspaceId) || null, [workspaceId, workspaces]);
  const activityWorkers = useMemo(() => [...(activity?.workers || [])].sort((a, b) => Number(b.selectedWorkspace) - Number(a.selectedWorkspace) || Number(b.freshness === "LIVE") - Number(a.freshness === "LIVE") || a.code.localeCompare(b.code, "hu")), [activity]);

  const loadTree = useCallback(async (id: string, relativePath = "") => {
    if (!id) return;
    setBusy("tree"); setMessage("");
    try {
      const params = new URLSearchParams({ workspaceId: id, path: relativePath });
      const response = await fetch(`/api/dev/terminal-hub/live-workspace/tree?${params}`, { headers: adminHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; tree?: TreePayload; code?: string; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.tree) throw new Error(`${payload?.code ? `${payload.code}: ` : ""}${payload?.error || "A Live Workspace fájlfa nem tölthető be."}`);
      setTree(payload.tree);
      setFile(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A Live Workspace fájlfa nem tölthető be.");
    } finally { setBusy(""); }
  }, []);

  const loadActivity = useCallback(async (id: string, silent = false) => {
    if (!activityEnabled || !id) return;
    if (!silent) setActivityBusy(true);
    setActivityMessage("");
    try {
      const params = new URLSearchParams({ workspaceId: id });
      const response = await fetch(`/api/dev/terminal-hub/live-workspace/activity?${params}`, { headers: adminHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; activity?: LiveWorkspaceActivitySnapshot; code?: string; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.activity) throw new Error(`${payload?.code ? `${payload.code}: ` : ""}${payload?.error || "A worker activity nem tölthető be."}`);
      setActivity(payload.activity);
    } catch (error) {
      setActivityMessage(error instanceof Error ? error.message : "A worker activity nem tölthető be.");
    } finally { if (!silent) setActivityBusy(false); }
  }, [activityEnabled]);

  const loadWorkspaces = useCallback(async () => {
    if (!enabled) return;
    setBusy("workspaces"); setMessage("");
    try {
      const response = await fetch("/api/dev/terminal-hub/live-workspace", { headers: adminHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; workspaces?: LiveWorkspaceSummary[]; code?: string; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(`${payload?.code ? `${payload.code}: ` : ""}${payload?.error || "A Live Workspace lista nem tölthető be."}`);
      const next = payload.workspaces || [];
      setWorkspaces(next);
      const currentId = workspaceIdRef.current;
      const nextId = next.some((item) => item.id === currentId) ? currentId : next[0]?.id || "";
      if (nextId !== currentId) {
        workspaceIdRef.current = nextId;
        setWorkspaceId(nextId);
        if (nextId) await loadTree(nextId, "");
        else { setTree(null); setFile(null); setActivity(null); }
      } else if (!nextId) {
        setTree(null); setFile(null); setActivity(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A Live Workspace lista nem tölthető be.");
    } finally { setBusy(""); }
  }, [enabled, loadTree]);

  useEffect(() => {
    if (!enabled) return;
    void loadWorkspaces();
  }, [enabled, loadWorkspaces]);

  useEffect(() => {
    if (!enabled || !activityEnabled || !workspaceId) {
      setActivity(null);
      return;
    }
    void loadActivity(workspaceId);
    const timer = window.setInterval(() => void loadActivity(workspaceId, true), 4000);
    return () => window.clearInterval(timer);
  }, [activityEnabled, enabled, loadActivity, workspaceId]);

  async function selectWorkspace(id: string) {
    workspaceIdRef.current = id;
    setWorkspaceId(id);
    await loadTree(id, "");
    if (activityEnabled) await loadActivity(id);
  }

  async function openFile(entry: LiveWorkspaceTreeEntry) {
    if (!workspaceId) return;
    if (entry.kind === "directory") {
      await loadTree(workspaceId, entry.relativePath);
      return;
    }
    if (!entry.previewable) {
      setMessage("A fájl látható a fájlfában, de P4 read-only előnézetben a típusa vagy mérete nem támogatott.");
      return;
    }
    setBusy("file"); setMessage("");
    try {
      const params = new URLSearchParams({ workspaceId, path: entry.relativePath });
      const response = await fetch(`/api/dev/terminal-hub/live-workspace/file?${params}`, { headers: adminHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; file?: LiveWorkspaceFilePreview; code?: string; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.file) throw new Error(`${payload?.code ? `${payload.code}: ` : ""}${payload?.error || "A fájl nem nyitható meg."}`);
      setFile(payload.file);
      setAssignmentSerial((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A fájl nem nyitható meg.");
    } finally { setBusy(""); }
  }

  if (!enabled) {
    return (
      <section className={styles.liveWorkspaceDisabled}>
        <LockKeyhole size={30} />
        <strong>LIVE WORKSPACE · P4</strong>
        <p>A read-only workspace motor feature flagje jelenleg OFF, ezért fájlfa és előnézet nem kérhető le.</p>
        <small>Watcher, Monaco, 1/2/4 panel és fájlírás külön későbbi gate mögött marad.</small>
      </section>
    );
  }

  return (
    <section className={styles.liveWorkspaceReadOnly}>
      <header className={styles.liveWorkspaceHeader}>
        <div><ShieldCheck size={18} /><div><span>LIVE WORKSPACE · READ ONLY</span><strong>Allowlistelt DEV worktree-k · biztonságos fájlfa</strong></div></div>
        <div><b>WATCHER OFF</b><b>WRITE OFF</b><button type="button" onClick={() => { void loadWorkspaces(); if (activityEnabled && workspaceId) void loadActivity(workspaceId); }} disabled={Boolean(busy) || activityBusy} title="Frissítés"><RefreshCw size={14} /></button></div>
      </header>
      {message ? <div className={styles.terminalHubNotice}>{message}</div> : null}

      {activityEnabled ? (
        <section className={styles.liveWorkspaceActivity}>
          <header>
            <div><Activity size={15} /><strong>WORKER ACTIVITY · P5</strong><span>{selectedWorkspace?.name || "Nincs worktree"}</span></div>
            <div><b>{activity?.summary.liveWorkers ?? 0} LIVE</b><b>{activity?.summary.selectedWorkspaceWorkers ?? 0} ITT DOLGOZIK</b><b>{activity?.summary.dirtyFiles ?? 0} FÁJLÁLLAPOT</b><span>POLL 4s</span></div>
          </header>
          {activityMessage ? <div className={styles.liveWorkspaceActivityMessage}>{activityMessage}</div> : null}
          <div className={styles.liveWorkspaceWorkers}>
            {activityWorkers.map((worker) => (
              <article key={worker.workerId} data-selected={worker.selectedWorkspace ? "true" : "false"} data-freshness={worker.freshness.toLowerCase()}>
                <div><strong>{worker.name}</strong><b>{worker.freshness}</b></div>
                <span>{worker.workspaceLabel || "nincs aktív worktree"}{worker.branch ? ` · ${worker.branch}` : ""}</span>
                <small>{worker.taskTitle || worker.role || worker.workerStatus}</small>
                <small>{worker.handshakeStage || worker.sessionStatus || worker.workerStatus} · HB {timeLabel(worker.lastHeartbeatAt)}</small>
              </article>
            ))}
            {!activityWorkers.length && !activityBusy ? <p>Nincs worker activity adat.</p> : null}
            {activityBusy ? <p>Worker activity betöltése…</p> : null}
          </div>
        </section>
      ) : (
        <div className={styles.liveWorkspaceActivityOff}><Activity size={14} /><span>Worker Activity P5 OFF · a P4 fájlfa továbbra is működik.</span></div>
      )}

      <div className={styles.liveWorkspaceGrid}>
        <aside className={styles.liveWorkspaceList}>
          <header><span>WORKTREE-K</span><b>{workspaces.length}</b></header>
          <div>{workspaces.map((workspace) => (
            <button type="button" key={workspace.id} onClick={() => void selectWorkspace(workspace.id)} data-active={workspace.id === workspaceId ? "true" : "false"}>
              <strong>{workspace.name}</strong>
              <span>{workspace.plane} · {workspace.status} · {workspace.dirtyCount} eltérés</span>
              <small><GitBranch size={12} /> {workspace.branch || "—"} · {workspace.commit || "—"}</small>
            </button>
          ))}{!workspaces.length && busy !== "workspaces" ? <p>Nincs allowlistelt worktree.</p> : null}</div>
        </aside>

        <section className={styles.liveWorkspaceTree}>
          <header>
            <div><strong>{selectedWorkspace?.name || "Nincs worktree"}</strong><span>{tree?.relativePath || "/"}</span></div>
            <div>{tree?.hiddenCount ? <b>{tree.hiddenCount} rejtett</b> : null}{tree?.truncated ? <b>500 elem limit</b> : null}</div>
          </header>
          <div className={styles.liveWorkspaceTreeRows}>
            {tree?.parentPath !== null ? <button type="button" className={styles.liveWorkspaceParent} onClick={() => workspaceId && void loadTree(workspaceId, tree?.parentPath || "")}><ArrowUp size={14} /><span>Szülőmappa</span></button> : null}
            {tree?.entries.map((entry) => <button type="button" key={entry.relativePath} onClick={() => void openFile(entry)} title={entry.relativePath}>
              {entry.kind === "directory" ? <Folder size={15} /> : <FileCode2 size={15} />}
              <span>{entry.name}</span>
              <small>{entry.kind === "directory" ? "mappa" : entry.previewable ? bytes(entry.sizeBytes) : "előnézet tiltva"}</small>
            </button>)}
            {busy === "tree" ? <p>Fájlfa betöltése…</p> : null}
            {tree && !tree.entries.length && busy !== "tree" ? <p>Üres vagy minden elem deny policy alá esik.</p> : null}
          </div>
        </section>

        <section className={styles.liveWorkspacePreview}>
          <header>{file ? <><div><strong>{file.name}</strong><span>{file.relativePath}</span></div><div><b data-ai={file.aiVisibility}>AI: {file.aiVisibility === "blocked" ? "TILTVA" : "SZŰRT"}</b><span>{file.gitStatus || "Git: tiszta"}</span></div></> : <><div><strong>FÁJL ELŐNÉZET</strong><span>P4 · egyszerű read-only renderer</span></div></>}</header>
          {multiPanelEnabled ? (
            <LiveWorkspaceMultiPanel
              enabled
              theme={theme}
              assignment={file && selectedWorkspace ? { serial: assignmentSerial, workspaceId, workspaceName: selectedWorkspace.name, file } : null}
            />
          ) : file ? <>
            <div className={styles.liveWorkspaceFileMeta}><span>{file.language}</span><span>{bytes(file.sizeBytes)}</span><span>{file.lineCount} sor</span><span>SHA {file.sha256.slice(0, 12)}…</span><span>{monacoEnabled ? "MONACO P6" : "P4 PREVIEW"}</span>{file.sensitiveFindings.length ? <span>{file.sensitiveFindings.length} érzékeny találat</span> : null}</div>
            {monacoEnabled ? <LiveWorkspaceMonaco enabled workspaceId={workspaceId} file={file} theme={theme} /> : <pre><code>{file.content}</code></pre>}
          </> : <div className={styles.liveWorkspacePreviewEmpty}><FileCode2 size={28} /><p>Válassz előnézhető szöveges forrásfájlt.</p><small>{monacoEnabled ? "P6 Monaco Live / Diff / History készen áll a kiválasztott fájlhoz." : "P4 egyszerű read-only preview aktív; P6 Monaco flag OFF."}</small></div>}
          {busy === "file" ? <div className={styles.liveWorkspacePreviewLoading}>Fájl betöltése…</div> : null}
        </section>
      </div>

      {activityEnabled ? (
        <section className={styles.liveWorkspaceEvents}>
          <header><div><Activity size={14} /><strong>FEJLESZTÉSI ESEMÉNYEK</strong></div><div><span>AUDIT + COMMIT + FILE STATE</span><b>{activity?.events.length ?? 0}</b></div></header>
          <div>
            {(activity?.events || []).slice(0, 24).map((event) => (
              <article key={event.id} data-level={event.level}>
                <time>{timeLabel(event.createdAt)}</time>
                <b>{event.kind}</b>
                <span>{event.actor}</span>
                <strong>{event.summary}</strong>
                {event.gitStatus ? <code>{event.gitStatus}</code> : null}
              </article>
            ))}
            {activity && !activity.events.length ? <p>Nincs megjeleníthető esemény ehhez a worktree-hez.</p> : null}
          </div>
        </section>
      ) : null}

      <footer className={styles.liveWorkspaceFooter}><ShieldCheck size={14} /><span>.git · .dimprover · .env · secret/credential · node_modules · .next · build/dist/cache/coverage automatikusan kizárva. Symlink és worktree-escape fail-closed. P7 multi-panel csak azonosító/UI állapotot perzisztál, fájltartalmat nem.</span></footer>
    </section>
  );
}
