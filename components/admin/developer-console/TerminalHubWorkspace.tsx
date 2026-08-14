"use client";

import { BookOpenCheck, Boxes, Columns3, History, LayoutPanelTop, LockKeyhole, Maximize2, Minimize2, RefreshCw, ShieldCheck, SquareTerminal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TerminalHubStatus } from "@/app/lib/dev-center/terminal-hub/types";
import type { ConsoleLiveState } from "./types";
import styles from "./DeveloperConsole.module.css";

type HubTab = "terminal" | "commands" | "workspace" | "sessions" | "audit";
type HubMode = "floating" | "docked";

function adminHeaders() {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { "x-dimpro-license-admin-key": key };
}

const tabs: Array<{ id: HubTab; label: string }> = [
  { id: "terminal", label: "TERMINAL" },
  { id: "commands", label: "TERMINÁL PARANCSTÁR" },
  { id: "workspace", label: "LIVE WORKSPACE" },
  { id: "sessions", label: "SESSIONS" },
  { id: "audit", label: "AUDIT" },
];

export default function TerminalHubWorkspace({ open, onClose, live }: { open: boolean; onClose: () => void; live: ConsoleLiveState | null }) {
  const [tab, setTab] = useState<HubTab>("terminal");
  const [mode, setMode] = useState<HubMode>("floating");
  const [status, setStatus] = useState<TerminalHubStatus | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/dev/terminal-hub/status", { headers: adminHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; status?: TerminalHubStatus; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.status) throw new Error(payload?.error || "A Terminal Hub állapota nem tölthető be.");
      setStatus(payload.status);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A Terminal Hub állapota nem tölthető be.");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [load, open]);

  const recentSessions = useMemo(() => (live?.sessions || []).slice(0, 12), [live?.sessions]);
  const recentAudits = useMemo(() => (live?.audits || []).slice(0, 16), [live?.audits]);

  if (!open) return null;

  return (
    <div className={`${styles.terminalHubLayer} ${mode === "docked" ? styles.terminalHubLayerDocked : ""}`} role="presentation">
      <button type="button" className={styles.terminalHubBackdrop} aria-label="Terminal Hub bezárása" onClick={onClose} />
      <section className={styles.terminalHubWorkspace} aria-label="BENJADMIN Terminal Hub">
        <header className={styles.terminalHubWorkspaceHeader}>
          <div className={styles.terminalHubTitle}><SquareTerminal size={20} /><div><span>BENJADMIN TERMINAL HUB</span><strong>Szabályozott terminál · parancstudástár · élő workspace</strong></div></div>
          <div className={styles.terminalHubHeaderActions}>
            <button type="button" onClick={() => void load()} title="Állapot frissítése"><RefreshCw size={15} /></button>
            <button type="button" onClick={() => setMode((value) => value === "floating" ? "docked" : "floating")} title={mode === "floating" ? "Dokkolt nagy nézet" : "Lebegő nézet"}>{mode === "floating" ? <Maximize2 size={15} /> : <Minimize2 size={15} />}</button>
            <button type="button" onClick={onClose} aria-label="Bezárás"><X size={17} /></button>
          </div>
        </header>

        <div className={styles.terminalHubSecurityStrip}>
          <span><ShieldCheck size={14} /> RAW: jogosult UI</span>
          <span>SANITIZED: AI szűrt</span>
          <span>AUDIT: maszkolt meta</span>
          <span className={styles.terminalHubProdLock}><LockKeyhole size={14} /> PROD AI: TILTVA</span>
          <b>{status?.phase || "P0_P1_UI_SHELL"}</b>
        </div>

        <nav className={styles.terminalHubTabs} aria-label="Terminal Hub nézetek">
          {tabs.map((item) => <button type="button" key={item.id} className={tab === item.id ? styles.terminalHubTabActive : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}
        </nav>

        <div className={styles.terminalHubBody}>
          {error ? <div className={styles.terminalHubNotice}>{error}</div> : null}
          {tab === "terminal" ? (
            <div className={styles.terminalHubTerminalView}>
              <section className={styles.terminalHubIntro}>
                <SquareTerminal size={28} />
                <div><strong>P1 TERMINÁL KEZELŐFELÜLET</strong><p>Ebben a fázisban nincs valódi shell vagy SSH végrehajtás. A böngésző nem kap SSH-kulcsot, PowerShell processzt vagy nyers szerver-hozzáférést.</p></div>
              </section>
              <div className={styles.terminalEndpointGrid}>
                {(status?.endpoints || []).map((endpoint) => (
                  <article key={endpoint.kind} data-state={endpoint.state}>
                    <header><strong>{endpoint.label}</strong><b>{endpoint.state}</b></header>
                    <span>{endpoint.environment} · AI: {endpoint.aiVisibility.toUpperCase()} · {endpoint.risk.toUpperCase()}</span>
                    <p>{endpoint.note}</p>
                  </article>
                ))}
              </div>
              <section className={styles.terminalHubReadinessGrid}>
                <div><span>Central lock</span><strong>{status?.coordination.exclusiveOperationBusy ? "FOGLALT" : "SZABAD"}</strong><small>Managed build/restart később sem kerülheti meg.</small></div>
                <div><span>Execution</span><strong>{status?.features.terminalExecutionEnabled ? "ENABLED" : "KIKAPCSOLVA"}</strong><small>P2 előtt kötelezően OFF.</small></div>
                <div><span>Desktop Bridge</span><strong>{status?.features.windowsBridgeEnabled ? "ENABLED" : "KIKAPCSOLVA"}</strong><small>PowerShell csak P8-ban.</small></div>
              </section>
            </div>
          ) : null}

          {tab === "commands" ? (
            <section className={styles.terminalHubPlaceholder}><BookOpenCheck size={30} /><strong>TERMINÁL PARANCSTÁR · P3</strong><p>A ChatGPT Parancstártól különálló, deduplikált shell/Git/PowerShell tudástár. A P1-ben még nincs parancsrögzítés vagy futtatás.</p><small>Tervezett lánc: redaction → normalizálás → shell family → SHA-256 → catalog upsert → execution audit insert.</small></section>
          ) : null}

          {tab === "workspace" ? (
            <section className={styles.terminalHubPlaceholder}><Columns3 size={30} /><strong>LIVE WORKSPACE · P4–P7</strong><p>Allowlist-first fájlfa, worker aktivitás, Git/Diff/History és később Monaco 1/2/4 paneles nézet.</p><div className={styles.terminalHubPolicyFacts}><span>Policy <b>{status?.workspace.policy || "ALLOWLIST_FIRST"}</b></span><span>Rootok <b>{status?.workspace.configuredRootCount ?? 0}</b></span><span>Watcher <b>{status?.workspace.watcherEnabled ? "ON" : "OFF"}</b></span><span>Symlink <b>{status?.workspace.symlinkPolicy || "FAIL_CLOSED"}</b></span></div></section>
          ) : null}

          {tab === "sessions" ? (
            <section className={styles.terminalHubListView}><div className={styles.terminalHubSectionTitle}><LayoutPanelTop size={16} /> Aktív és legutóbbi BENJADMIN sessionök</div>{recentSessions.length ? recentSessions.map((session) => <article key={session.id}><strong>{session.handshake_stage || "SESSION"}</strong><span>{session.status}</span><small>{session.branch_name || session.worktree_path || session.id}</small></article>) : <p>Nincs session adat.</p>}</section>
          ) : null}

          {tab === "audit" ? (
            <section className={styles.terminalHubListView}><div className={styles.terminalHubSectionTitle}><History size={16} /> Biztonságos audit összefoglaló</div>{recentAudits.length ? recentAudits.map((audit) => <article key={audit.id}><strong>{audit.action}</strong><span>{audit.created_at ? new Date(audit.created_at).toLocaleString("hu-HU") : "—"}</span><small>{audit.summary || "Audit esemény"}</small></article>) : <p>Nincs audit adat.</p>}</section>
          ) : null}
        </div>

        <footer className={styles.terminalHubFooter}><Boxes size={14} /><span>P0/P1: UI + security contract. Nincs nyers shell, nincs Desktop Bridge, nincs PROD write.</span></footer>
      </section>
    </div>
  );
}
