"use client";

import { Bot, LockKeyhole, Server, ShieldCheck, SquareTerminal } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { TerminalHubStatus } from "@/app/lib/dev-center/terminal-hub/types";
import styles from "./DeveloperConsole.module.css";

function adminHeaders() {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { "x-dimpro-license-admin-key": key };
}

export default function TerminalHubCard({ onOpen }: { onOpen: () => void }) {
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
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const hubEnabled = Boolean(status?.features.terminalHubEnabled);
  const dev = status?.endpoints.find((item) => item.kind === "ssh-dev");
  const prod = status?.endpoints.find((item) => item.kind === "ssh-prod");

  return (
    <section className={styles.terminalHubCard} data-enabled={hubEnabled ? "true" : "false"} aria-label="Terminal Hub állapot">
      <div className={styles.terminalHubCardHead}>
        <span><SquareTerminal size={17} /></span>
        <div><strong>TERMINAL HUB</strong><small>P0/P1 · biztonságos kezelőfelület</small></div>
        <b>{hubEnabled ? "UI READY" : "FLAG OFF"}</b>
      </div>
      <div className={styles.terminalHubQuickGrid}>
        <span><ShieldCheck size={13} /> Managed <b>{status?.coordination.exclusiveOperationBusy ? "FOGLALT" : "KÉSZ"}</b></span>
        <span><Server size={13} /> DEV VPS <b>{dev?.state || "—"}</b></span>
        <span><LockKeyhole size={13} /> PROD VPS <b>{prod?.state || "LOCKED"}</b></span>
        <span><Bot size={13} /> AI hozzáférés <b>SZŰRT</b></span>
      </div>
      {error ? <p className={styles.terminalHubError}>{error}</p> : null}
      <button type="button" onClick={onOpen} disabled={!hubEnabled}>TERMINAL HUB MEGNYITÁSA</button>
    </section>
  );
}
