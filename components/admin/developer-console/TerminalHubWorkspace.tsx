"use client";

import { Boxes, History, LayoutPanelTop, LockKeyhole, Maximize2, Minimize2, RefreshCw, ShieldCheck, SquareTerminal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TerminalCoreReadiness } from "@/app/lib/dev-center/terminal-hub/readiness";
import type { TerminalHubStatus } from "@/app/lib/dev-center/terminal-hub/types";
import TerminalCorePanel from "./TerminalCorePanel";
import TerminalCommandLibrary from "./TerminalCommandLibrary";
import LiveWorkspaceReadOnly from "./LiveWorkspaceReadOnly";
import TerminalManagedCommands from "./TerminalManagedCommands";
import WindowsBridgePanel from "./WindowsBridgePanel";
import SecretVaultPanel from "./SecretVaultPanel";
import ProdReadinessPanel from "./ProdReadinessPanel";
import type { ConsoleLiveState, ConsoleTheme } from "./types";
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

export default function TerminalHubWorkspace({ open, onClose, live, theme }: { open: boolean; onClose: () => void; live: ConsoleLiveState | null; theme: ConsoleTheme }) {
  const [tab, setTab] = useState<HubTab>("terminal");
  const [mode, setMode] = useState<HubMode>("floating");
  const [status, setStatus] = useState<TerminalHubStatus | null>(null);
  const [terminalReadiness, setTerminalReadiness] = useState<TerminalCoreReadiness | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [statusResponse, readinessResponse] = await Promise.all([
        fetch("/api/dev/terminal-hub/status", { headers: adminHeaders(), cache: "no-store" }),
        fetch("/api/dev/terminal-hub/readiness", { headers: adminHeaders(), cache: "no-store" }),
      ]);
      const payload = await statusResponse.json().catch(() => null) as { ok?: boolean; status?: TerminalHubStatus; error?: string } | null;
      const readinessPayload = await readinessResponse.json().catch(() => null) as { ok?: boolean; readiness?: TerminalCoreReadiness; error?: string } | null;
      if (!statusResponse.ok || !payload?.ok || !payload.status) throw new Error(payload?.error || "A Terminal Hub állapota nem tölthető be.");
      if (!readinessResponse.ok || !readinessPayload?.ok || !readinessPayload.readiness) throw new Error(readinessPayload?.error || "A Terminal Core readiness nem tölthető be.");
      setStatus(payload.status);
      setTerminalReadiness(readinessPayload.readiness);
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
          <b>{terminalReadiness?.phase || status?.phase || "P0_P1_UI_SHELL"}</b>
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
                <div><strong>P2 · DEV TERMINAL CORE CANDIDATE</strong><p>A session/stream/resize/reconnect szerződés előkészítés alatt áll. Valódi PTY csak nem-root OS-identitás és explicit execution gate mellett indulhat.</p></div>
              </section>
              <section className={styles.terminalCoreGate} data-ready={terminalReadiness?.ready ? "true" : "false"}>
                <header><strong>TERMINAL CORE GATE</strong><b>{terminalReadiness?.ready ? "READY" : "BLOCKED"}</b></header>
                <div><span>Execution kill switch</span><strong>{terminalReadiness?.executionEnabled ? "ON" : "OFF"}</strong></div>
                <div><span>Nem-root OS-identitás</span><strong>{terminalReadiness?.osIdentity ? `${terminalReadiness.osIdentity.label} · ${terminalReadiness.osIdentity.uid}:${terminalReadiness.osIdentity.gid}` : "NINCS"}</strong></div>
                <div><span>PROD terminal</span><strong>{terminalReadiness?.prodTerminalEnabled ? "ON · TILTOTT" : "OFF"}</strong></div>
                <div><span>P4 Live Workspace / P8 Bridge</span><strong>{`${terminalReadiness?.liveWorkspaceEnabled ? "P4 ON" : "P4 OFF"} · ${terminalReadiness?.windowsBridgeEnabled ? "P8 FLAG ON" : "P8 OFF"}`}</strong></div>
                {terminalReadiness?.blockers?.length ? <ul>{terminalReadiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <p>A P2 végrehajtási előfeltételei teljesülnek; külön candidate acceptance szükséges a PTY aktiválása előtt.</p>}
              </section>
              <TerminalCorePanel readiness={terminalReadiness} />
              <TerminalManagedCommands sessions={live?.sessions || []} />
              <WindowsBridgePanel />
              <SecretVaultPanel />
              <ProdReadinessPanel />
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
                <div><span>Execution</span><strong>{terminalReadiness?.executionEnabled ? "ENABLED" : "KIKAPCSOLVA"}</strong><small>P2 candidate gate szabályozza.</small></div>
                <div><span>Windows Bridge</span><strong>{terminalReadiness?.windowsBridgeEnabled ? "FOUNDATION FLAG ON" : "KIKAPCSOLVA"}</strong><small>P8 agent/pairing/execution külön gate.</small></div>
              </section>
            </div>
          ) : null}

          {tab === "commands" ? (
            <TerminalCommandLibrary enabled={Boolean(status?.features.commandLibraryEnabled)} projects={live?.projects || []} />
          ) : null}

          {tab === "workspace" ? (
            <LiveWorkspaceReadOnly enabled={Boolean(status?.features.liveWorkspaceEnabled)} activityEnabled={Boolean(status?.features.workspaceActivityEnabled)} monacoEnabled={Boolean(status?.features.workspaceMonacoEnabled)} multiPanelEnabled={Boolean(status?.features.multiPanelEnabled)} theme={theme} />
          ) : null}

          {tab === "sessions" ? (
            <section className={styles.terminalHubListView}><div className={styles.terminalHubSectionTitle}><LayoutPanelTop size={16} /> Aktív és legutóbbi BENJADMIN sessionök</div>{recentSessions.length ? recentSessions.map((session) => <article key={session.id}><strong>{session.handshake_stage || "SESSION"}</strong><span>{session.status}</span><small>{session.branch_name || session.worktree_path || session.id}</small></article>) : <p>Nincs session adat.</p>}</section>
          ) : null}

          {tab === "audit" ? (
            <section className={styles.terminalHubListView}><div className={styles.terminalHubSectionTitle}><History size={16} /> Biztonságos audit összefoglaló</div>{recentAudits.length ? recentAudits.map((audit) => <article key={audit.id}><strong>{audit.action}</strong><span>{audit.created_at ? new Date(audit.created_at).toLocaleString("hu-HU") : "—"}</span><small>{audit.summary || "Audit esemény"}</small></article>) : <p>Nincs audit adat.</p>}</section>
          ) : null}
        </div>

        <footer className={styles.terminalHubFooter}><Boxes size={14} /><span>P10 foundation: PROD readiness csak külön read-only connectorral készíthető elő; AI BLOCKED, execution default deny, approval/release/rollback kötelező.</span></footer>
      </section>
    </div>
  );
}
