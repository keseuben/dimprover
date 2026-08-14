"use client";

import { ArrowUp, FileCode2, Folder, GitBranch, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LiveWorkspaceFilePreview, LiveWorkspaceSummary, LiveWorkspaceTreeEntry } from "@/app/lib/dev-center/terminal-hub/live-workspace";
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

export default function LiveWorkspaceReadOnly({ enabled }: { enabled: boolean }) {
  const [workspaces, setWorkspaces] = useState<LiveWorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [tree, setTree] = useState<TreePayload | null>(null);
  const [file, setFile] = useState<LiveWorkspaceFilePreview | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const selectedWorkspace = useMemo(() => workspaces.find((item) => item.id === workspaceId) || null, [workspaceId, workspaces]);

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

  const loadWorkspaces = useCallback(async () => {
    if (!enabled) return;
    setBusy("workspaces"); setMessage("");
    try {
      const response = await fetch("/api/dev/terminal-hub/live-workspace", { headers: adminHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; workspaces?: LiveWorkspaceSummary[]; code?: string; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(`${payload?.code ? `${payload.code}: ` : ""}${payload?.error || "A Live Workspace lista nem tölthető be."}`);
      const next = payload.workspaces || [];
      setWorkspaces(next);
      const nextId = next.some((item) => item.id === workspaceId) ? workspaceId : next[0]?.id || "";
      setWorkspaceId(nextId);
      if (nextId) await loadTree(nextId, "");
      else { setTree(null); setFile(null); }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A Live Workspace lista nem tölthető be.");
    } finally { setBusy(""); }
  }, [enabled, loadTree, workspaceId]);

  useEffect(() => {
    if (!enabled) return;
    void loadWorkspaces();
  }, [enabled, loadWorkspaces]);

  async function selectWorkspace(id: string) {
    setWorkspaceId(id);
    await loadTree(id, "");
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A fájl nem nyitható meg.");
    } finally { setBusy(""); }
  }

  if (!enabled) {
    return (
      <section className={styles.liveWorkspaceDisabled}>
        <LockKeyhole size={30} />
        <strong>LIVE WORKSPACE · P4</strong>
        <p>A read-only workspace motor elkészítés alatt áll. A feature flag jelenleg OFF, ezért fájlfa és előnézet nem kérhető le.</p>
        <small>Watcher, Monaco, 1/2/4 panel és fájlírás külön későbbi gate mögött marad.</small>
      </section>
    );
  }

  return (
    <section className={styles.liveWorkspaceReadOnly}>
      <header className={styles.liveWorkspaceHeader}>
        <div><ShieldCheck size={18} /><div><span>LIVE WORKSPACE · READ ONLY</span><strong>Allowlistelt DEV worktree-k · biztonságos fájlfa</strong></div></div>
        <div><b>WATCHER OFF</b><b>WRITE OFF</b><button type="button" onClick={() => void loadWorkspaces()} disabled={Boolean(busy)} title="Frissítés"><RefreshCw size={14} /></button></div>
      </header>
      {message ? <div className={styles.terminalHubNotice}>{message}</div> : null}
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
          {file ? <>
            <div className={styles.liveWorkspaceFileMeta}><span>{file.language}</span><span>{bytes(file.sizeBytes)}</span><span>{file.lineCount} sor</span><span>SHA {file.sha256.slice(0, 12)}…</span>{file.sensitiveFindings.length ? <span>{file.sensitiveFindings.length} érzékeny találat</span> : null}</div>
            <pre><code>{file.content}</code></pre>
          </> : <div className={styles.liveWorkspacePreviewEmpty}><FileCode2 size={28} /><p>Válassz előnézhető szöveges forrásfájlt.</p><small>Monaco, Diff és History a későbbi P6 rétegben érkezik.</small></div>}
          {busy === "file" ? <div className={styles.liveWorkspacePreviewLoading}>Fájl betöltése…</div> : null}
        </section>
      </div>
      <footer className={styles.liveWorkspaceFooter}><ShieldCheck size={14} /><span>.git · .dimprover · .env · secret/credential · node_modules · .next · build/dist/cache/coverage automatikusan kizárva. Symlink és worktree-escape fail-closed.</span></footer>
    </section>
  );
}
