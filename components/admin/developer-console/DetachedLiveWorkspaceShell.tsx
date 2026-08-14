"use client";

import { AlertTriangle, MonitorUp, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { TerminalHubStatus } from "@/app/lib/dev-center/terminal-hub/types";
import LiveWorkspaceMultiPanel from "./LiveWorkspaceMultiPanel";
import type { ConsoleTheme } from "./types";
import styles from "./DeveloperConsole.module.css";

const THEME_KEY = "benjadmin-developer-console-theme";

function adminHeaders() {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { "x-dimpro-license-admin-key": key };
}

export default function DetachedLiveWorkspaceShell() {
  const [theme, setTheme] = useState<ConsoleTheme>("dark");
  const [status, setStatus] = useState<TerminalHubStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const applyTheme = () => {
      const stored = localStorage.getItem(THEME_KEY);
      setTheme(stored === "light" || stored === "sunlight" ? stored : "dark");
    };
    applyTheme();
    const onStorage = (event: StorageEvent) => { if (event.key === THEME_KEY) applyTheme(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadStatus() {
      try {
        const response = await fetch("/api/dev/terminal-hub/status", { headers: adminHeaders(), cache: "no-store" });
        const payload = await response.json().catch(() => null) as { ok?: boolean; status?: TerminalHubStatus; error?: string } | null;
        if (!response.ok || !payload?.ok || !payload.status) throw new Error(payload?.error || "A P7 leválasztott munkatér állapota nem tölthető be.");
        if (!cancelled) { setStatus(payload.status); setError(""); }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "A P7 leválasztott munkatér állapota nem tölthető be.");
      }
    }
    void loadStatus();
    const timer = window.setInterval(() => void loadStatus(), 10_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const enabled = Boolean(status?.features.liveWorkspaceEnabled && status?.features.workspaceMonacoEnabled && status?.features.multiPanelEnabled);

  return (
    <main className={`${styles.console} ${styles.liveWorkspaceDetachedShell}`} data-console-theme={theme} data-testid="benjadmin-live-workspace-detached">
      <header className={styles.liveWorkspaceDetachedHeader}>
        <div><MonitorUp size={20} /><div><span>BENJADMIN FEJLESZTŐI KONZOL</span><strong>Live Workspace · leválasztott P7 munkatér</strong></div></div>
        <div><ShieldCheck size={14} /><b>READ ONLY</b><span>Terminal execution OFF · PROD ZÁRVA</span></div>
      </header>
      {error ? <div className={styles.liveWorkspaceMultiPanelNotice}><AlertTriangle size={14} /> {error}</div> : null}
      <LiveWorkspaceMultiPanel enabled={enabled} theme={theme} detached />
    </main>
  );
}
