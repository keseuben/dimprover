"use client";

import Editor, { DiffEditor, loader, type Monaco } from "@monaco-editor/react";
import { Code2, GitCompareArrows, History, LoaderCircle, LockKeyhole, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LiveWorkspaceFilePreview } from "@/app/lib/dev-center/terminal-hub/live-workspace";
import type { LiveWorkspaceGitContext } from "@/app/lib/dev-center/terminal-hub/live-workspace-git";
import type { ConsoleTheme } from "./types";
import styles from "./DeveloperConsole.module.css";

export type MonacoMode = "live" | "diff" | "history";

type MonacoWorkerEnvironment = {
  getWorker: (_moduleId: string, label: string) => Worker;
};

function configureMonacoWorker() {
  const scope = globalThis as typeof globalThis & { MonacoEnvironment?: MonacoWorkerEnvironment };
  scope.MonacoEnvironment = {
    getWorker: (_moduleId, label) => label === "json"
      ? new Worker(new URL("./monaco-json.worker.ts", import.meta.url), { type: "module", name: "dimpro-monaco-json" })
      : new Worker(new URL("./monaco-editor.worker.ts", import.meta.url), { type: "module", name: `dimpro-monaco-${label || "editor"}` }),
  };
}

function adminHeaders() {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { "x-dimpro-license-admin-key": key };
}

function editorLanguage(language: string) {
  if (language === "typescriptreact") return "typescript";
  if (language === "javascriptreact") return "javascript";
  return language || "plaintext";
}

function monacoTheme(theme: ConsoleTheme) {
  if (theme === "dark") return "vs-dark";
  if (theme === "sunlight") return "dimpro-sunlight";
  return "vs";
}

function configureMonaco(instance: Monaco) {
  instance.editor.defineTheme("dimpro-sunlight", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#fffdf5",
      "editor.foreground": "#172033",
      "editorLineNumber.foreground": "#8993a5",
      "editorLineNumber.activeForeground": "#334155",
      "editor.selectionBackground": "#b8e6ee88",
      "editor.inactiveSelectionBackground": "#dceff288",
      "editor.lineHighlightBackground": "#f3f7f2",
      "editorIndentGuide.background1": "#e3e8e5",
      "editorIndentGuide.activeBackground1": "#b6c8c5",
    },
  });
}

const editorOptions = {
  readOnly: true,
  domReadOnly: true,
  automaticLayout: true,
  minimap: { enabled: true },
  fontSize: 13,
  lineHeight: 20,
  fontFamily: '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
  scrollBeyondLastLine: false,
  wordWrap: "off" as const,
  renderWhitespace: "selection" as const,
  folding: true,
  links: false,
  contextmenu: true,
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  parameterHints: { enabled: false },
  codeLens: false,
  glyphMargin: false,
  stickyScroll: { enabled: false },
  overviewRulerBorder: false,
};

export default function LiveWorkspaceMonaco({ enabled, workspaceId, file, theme, instanceId = "primary", mode: controlledMode, onModeChange }: { enabled: boolean; workspaceId: string; file: LiveWorkspaceFilePreview; theme: ConsoleTheme; instanceId?: string; mode?: MonacoMode; onModeChange?: (mode: MonacoMode) => void }) {
  const [engineReady, setEngineReady] = useState(false);
  const [internalMode, setInternalMode] = useState<MonacoMode>("live");
  const [context, setContext] = useState<LiveWorkspaceGitContext | null>(null);
  const [selectedCommit, setSelectedCommit] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const monacoRef = useRef<Monaco | null>(null);
  const mode = controlledMode ?? internalMode;
  const modelAuthority = useMemo(() => `dimpro-${instanceId.replace(/[^a-z0-9-]/gi, "-").toLowerCase() || "panel"}`, [instanceId]);

  const changeMode = useCallback((next: MonacoMode) => {
    if (controlledMode === undefined) setInternalMode(next);
    onModeChange?.(next);
  }, [controlledMode, onModeChange]);

  useEffect(() => {
    let cancelled = false;
    if (!enabled) return;
    configureMonacoWorker();
    void Promise.all([
      import("monaco-editor/editor/editor.api"),
      import("monaco-editor/editor/contrib/documentSymbols/browser/outlineModel"),
      import("monaco-editor/editor/contrib/codelens/browser/codeLensCache"),
      import("monaco-editor/editor/contrib/inlayHints/browser/inlayHintsController"),
      import("monaco-editor/editor/common/services/treeViewsDndService"),
      import("monaco-editor/editor/contrib/suggest/browser/suggestMemory"),
      import("monaco-editor/platform/actionWidget/browser/actionWidget"),
      import("monaco-editor/languages/definitions/javascript/register"),
      import("monaco-editor/languages/definitions/typescript/register"),
      import("monaco-editor/language/json/monaco.contribution"),
      import("monaco-editor/languages/definitions/css/register"),
      import("monaco-editor/languages/definitions/scss/register"),
      import("monaco-editor/languages/definitions/html/register"),
      import("monaco-editor/languages/definitions/xml/register"),
      import("monaco-editor/languages/definitions/yaml/register"),
      import("monaco-editor/languages/definitions/sql/register"),
      import("monaco-editor/languages/definitions/shell/register"),
      import("monaco-editor/languages/definitions/powershell/register"),
      import("monaco-editor/languages/definitions/python/register"),
      import("monaco-editor/languages/definitions/markdown/register"),
      import("monaco-editor/languages/definitions/ini/register"),
    ]).then(([monaco]) => {
      if (cancelled) return;
      const localMonaco = monaco as unknown as Monaco;
      monacoRef.current = localMonaco;
      loader.config({ monaco: localMonaco });
      configureMonaco(localMonaco);
      setEngineReady(true);
    }).catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : "A helyi Monaco motor nem tölthető be.");
    });
    return () => { cancelled = true; };
  }, [enabled]);

  useEffect(() => () => {
    const instance = monacoRef.current;
    window.setTimeout(() => {
      for (const model of instance?.editor.getModels() || []) {
        if (model.uri.scheme === "inmemory" && model.uri.authority === modelAuthority) model.dispose();
      }
    }, 0);
  }, [modelAuthority]);

  const loadContext = useCallback(async (commit = "") => {
    if (!enabled || !workspaceId || !file.relativePath) return;
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams({ workspaceId, path: file.relativePath });
      if (commit) params.set("commit", commit);
      const response = await fetch(`/api/dev/terminal-hub/live-workspace/git-context?${params}`, { headers: adminHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; context?: LiveWorkspaceGitContext; code?: string; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.context) throw new Error(`${payload?.code ? `${payload.code}: ` : ""}${payload?.error || "A Git context nem tölthető be."}`);
      setContext(payload.context);
      setSelectedCommit(payload.context.selectedCommit || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A Git context nem tölthető be.");
    } finally { setBusy(false); }
  }, [enabled, file.relativePath, workspaceId]);

  useEffect(() => {
    if (controlledMode === undefined) setInternalMode("live");
    setSelectedCommit("");
    setContext(null);
    if (enabled) void loadContext();
  }, [controlledMode, enabled, file.relativePath, loadContext]);

  const language = editorLanguage(context?.language || file.language);
  const themeName = monacoTheme(theme);
  const currentContent = context?.current.content ?? file.content;
  const currentAi = context?.current.aiVisibility ?? file.aiVisibility;
  const historyRevision = useMemo(() => context?.history.find((item) => item.commit === selectedCommit) || null, [context?.history, selectedCommit]);

  if (!enabled) {
    return (
      <div className={styles.liveWorkspaceMonacoOff}>
        <Code2 size={20} /><div><strong>MONACO P6 OFF</strong><span>A P4 egyszerű read-only előnézet aktív marad.</span></div>
      </div>
    );
  }

  return (
    <div className={styles.liveWorkspaceMonaco}>
      <header className={styles.liveWorkspaceMonacoToolbar}>
        <div className={styles.liveWorkspaceMonacoTabs}>
          <button type="button" data-active={mode === "live" ? "true" : "false"} onClick={() => changeMode("live")}><Code2 size={13} /> LIVE</button>
          <button type="button" data-active={mode === "diff" ? "true" : "false"} onClick={() => changeMode("diff")}><GitCompareArrows size={13} /> DIFF</button>
          <button type="button" data-active={mode === "history" ? "true" : "false"} onClick={() => changeMode("history")}><History size={13} /> HISTORY</button>
        </div>
        <div className={styles.liveWorkspaceMonacoState}>
          <b>READ ONLY</b>
          <span data-ai={currentAi}>AI {currentAi === "blocked" ? "TILTVA" : "SZŰRT"}</span>
          <button type="button" title="Git context frissítése" onClick={() => void loadContext(selectedCommit)} disabled={busy}><RefreshCw size={13} /></button>
        </div>
      </header>

      {error ? <div className={styles.liveWorkspaceMonacoError}>{error}</div> : null}
      {!engineReady ? <div className={styles.liveWorkspaceMonacoLoading}><LoaderCircle size={18} /> Helyi Monaco motor betöltése…</div> : null}

      {engineReady && mode === "live" ? (
        <Editor
          height="100%"
          language={language}
          value={currentContent}
          path={`inmemory://${modelAuthority}/live/${workspaceId}/${encodeURIComponent(file.relativePath)}`}
          theme={themeName}
          beforeMount={configureMonaco}
          options={editorOptions}
          loading="Monaco betöltése…"
        />
      ) : null}

      {engineReady && mode === "diff" ? (
        context?.head.available ? (
          <DiffEditor
            height="100%"
            language={language}
            original={context.head.content}
            modified={currentContent}
            originalModelPath={`inmemory://${modelAuthority}/head/${context.headCommit}/${encodeURIComponent(file.relativePath)}`}
            modifiedModelPath={`inmemory://${modelAuthority}/worktree/${workspaceId}/${encodeURIComponent(file.relativePath)}`}
            theme={themeName}
            beforeMount={configureMonaco}
            keepCurrentOriginalModel
            keepCurrentModifiedModel
            options={{ ...editorOptions, renderSideBySide: true, originalEditable: false, enableSplitViewResizing: true }}
            loading="Diff betöltése…"
          />
        ) : <div className={styles.liveWorkspaceMonacoEmpty}><GitCompareArrows size={26} /><strong>UNTRACKED / NINCS HEAD VERZIÓ</strong><span>A fájlhoz nincs összehasonlítható HEAD tartalom.</span></div>
      ) : null}

      {engineReady && mode === "history" ? (
        <div className={styles.liveWorkspaceHistory}>
          <aside>
            <header><History size={13} /><strong>FILE HISTORY</strong><b>{context?.history.length ?? 0}</b></header>
            <div>{(context?.history || []).map((revision) => (
              <button type="button" key={revision.commit} data-active={selectedCommit === revision.commit ? "true" : "false"} onClick={() => void loadContext(revision.commit)}>
                <strong>{revision.shortCommit} · {revision.subject}</strong>
                <span>{revision.author}</span>
                <small>{new Date(revision.authoredAt).toLocaleString("hu-HU")}</small>
              </button>
            ))}{context && !context.history.length ? <p>Nincs fájlszintű Git history.</p> : null}</div>
          </aside>
          <section>
            {context?.selectedHistory?.available ? (
              <Editor
                height="100%"
                language={language}
                value={context.selectedHistory.content}
                path={`inmemory://${modelAuthority}/history/${selectedCommit}/${encodeURIComponent(file.relativePath)}`}
                theme={themeName}
                beforeMount={configureMonaco}
                options={editorOptions}
                loading="History betöltése…"
              />
            ) : <div className={styles.liveWorkspaceMonacoEmpty}><LockKeyhole size={25} /><strong>{historyRevision ? historyRevision.shortCommit : "VÁLASSZ COMMITOT"}</strong><span>{historyRevision ? "A fájl ezen a commiton nem érhető el a jelenlegi útvonalon." : "A bal oldali history listából válassz egy verziót."}</span></div>}
          </section>
        </div>
      ) : null}

      {busy ? <div className={styles.liveWorkspaceMonacoBusy}><LoaderCircle size={16} /> Git context frissítése…</div> : null}
    </div>
  );
}
