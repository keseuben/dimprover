"use client";

import { Activity, Hammer, RefreshCw, RotateCw, TestTube2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { LiveSession } from "./types";
import styles from "./DeveloperConsole.module.css";

type ManagedAction = {
  id: "refresh" | "metrics" | "build" | "tests" | "restart";
  label: string;
  operation: "read" | "monitor" | "build" | "test" | "restart";
  commandName: "refresh_state" | "collect_metrics" | "run_build" | "run_tests" | "restart_service";
  mutating: boolean;
};

const actions: ManagedAction[] = [
  { id: "refresh", label: "Állapot", operation: "read", commandName: "refresh_state", mutating: false },
  { id: "metrics", label: "Metrika", operation: "monitor", commandName: "collect_metrics", mutating: false },
  { id: "build", label: "Build", operation: "build", commandName: "run_build", mutating: true },
  { id: "tests", label: "Tesztek", operation: "test", commandName: "run_tests", mutating: true },
  { id: "restart", label: "DEV restart", operation: "restart", commandName: "restart_service", mutating: true },
];

function adminHeaders(json = false) {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { ...(json ? { "content-type": "application/json" } : {}), "x-dimpro-license-admin-key": key };
}

function icon(id: ManagedAction["id"]) {
  if (id === "refresh") return <RefreshCw size={14} />;
  if (id === "metrics") return <Activity size={14} />;
  if (id === "build") return <Hammer size={14} />;
  if (id === "tests") return <TestTube2 size={14} />;
  return <RotateCw size={14} />;
}

export default function TerminalManagedCommands({ sessions }: { sessions: LiveSession[] }) {
  const readySessions = useMemo(() => sessions.filter((item) => item.status === "active" && item.handshake_stage === "READY"), [sessions]);
  const [sessionId, setSessionId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (sessionId && readySessions.some((item) => item.id === sessionId)) return;
    setSessionId(readySessions[0]?.id || "");
  }, [readySessions, sessionId]);

  async function queue(action: ManagedAction) {
    if (action.mutating && !sessionId) {
      setMessage("Build/test/restart csak READY BENJADMIN worker sessionnel queue-zható.");
      return;
    }
    setBusy(action.id); setMessage("");
    try {
      const response = await fetch("/api/dev/engine/control-plane/commands", {
        method: "POST",
        headers: adminHeaders(true),
        body: JSON.stringify({
          targetEnvironment: "DEV",
          operation: action.operation,
          commandName: action.commandName,
          requestedBy: "BENJADMIN_TERMINAL_HUB",
          ...(action.mutating ? { sessionId } : {}),
          payload: { origin: "TERMINAL_HUB_MANAGED_COMMAND", rawCommand: false },
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; command?: { id?: string; status?: string }; code?: string; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(`${payload?.code ? `${payload.code}: ` : ""}${payload?.error || "A managed command nem queue-zható."}`);
      setMessage(`${action.label} queue-zva · ${payload.command?.status || "queued"}${payload.command?.id ? ` · ${payload.command.id.slice(0, 8)}` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A managed command nem queue-zható.");
    } finally { setBusy(""); }
  }

  return (
    <section className={styles.terminalManagedCommands}>
      <header><div><strong>MANAGED MŰVELETEK</strong><span>Control Plane queue · nincs nyers shell payload</span></div><b>{readySessions.length} READY session</b></header>
      <div className={styles.terminalManagedSession}>
        <label><span>Worker session</span><select value={sessionId} onChange={(event) => setSessionId(event.target.value)}><option value="">Nincs READY session</option>{readySessions.map((item) => <option key={item.id} value={item.id}>{item.id.slice(0, 8)} · {item.branch_name || item.worktree_path || "READY"}</option>)}</select></label>
      </div>
      <div className={styles.terminalManagedActions}>{actions.map((action) => <button type="button" key={action.id} onClick={() => void queue(action)} disabled={Boolean(busy) || (action.mutating && !sessionId)}>{icon(action.id)} {busy === action.id ? "Queue…" : action.label}</button>)}</div>
      {message ? <p>{message}</p> : <small>A build/test/restart művelet a meglévő DEV session/scope és central operation lock rendszerét használja; a Terminal Hub nem futtat saját build motort.</small>}
    </section>
  );
}
