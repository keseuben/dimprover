"use client";

import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { LiveSession } from "./types";
import styles from "./DeveloperConsole.module.css";

type ManagedAction = {
  id: "refresh" | "metrics" | "build" | "tests" | "restart";
  label: string;
  operation: "read" | "monitor" | "build" | "test" | "restart";
  commandName: "refresh_state" | "collect_metrics" | "run_build" | "run_tests" | "restart_service";
  mutating: boolean;
  destructiveApproval?: boolean;
};

type PendingApproval = {
  id: string;
  operation: ManagedAction["operation"];
  commandName: ManagedAction["commandName"];
  sessionId: string;
  expiresAt: string;
  confirmation: string;
};

const ACTIONS: ManagedAction[] = [
  { id: "refresh", label: "Állapot frissítés", operation: "read", commandName: "refresh_state", mutating: false },
  { id: "metrics", label: "Metrika gyűjtés", operation: "monitor", commandName: "collect_metrics", mutating: false },
  { id: "build", label: "DEV build queue", operation: "build", commandName: "run_build", mutating: true },
  { id: "tests", label: "DEV teszt queue", operation: "test", commandName: "run_tests", mutating: true },
  { id: "restart", label: "DEV restart", operation: "restart", commandName: "restart_service", mutating: true, destructiveApproval: true },
];

function adminHeaders(json = false) {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { "x-dimpro-license-admin-key": key, ...(json ? { "content-type": "application/json" } : {}) };
}

export default function TerminalManagedCommands({ sessions }: { sessions: LiveSession[] }) {
  const readySessions = useMemo(() => sessions.filter((item) => item.status === "active" && item.handshake_stage === "READY"), [sessions]);
  const [sessionId, setSessionId] = useState(readySessions[0]?.id || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    if (sessionId && readySessions.some((item) => item.id === sessionId)) return;
    setSessionId(readySessions[0]?.id || "");
  }, [readySessions, sessionId]);

  useEffect(() => {
    if (pendingApproval && pendingApproval.sessionId !== sessionId) setPendingApproval(null);
  }, [pendingApproval, sessionId]);

  useEffect(() => {
    if (!pendingApproval) { setNowMs(0); return; }
    const tick = () => setNowMs(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [pendingApproval]);

  async function queueAction(action: ManagedAction, approvalId?: string) {
    if (action.mutating && !sessionId) {
      setMessage("Módosító DEV művelethez READY worker session szükséges.");
      return false;
    }
    const response = await fetch("/api/dev/engine/control-plane/commands", {
      method: "POST",
      headers: adminHeaders(true),
      body: JSON.stringify({
        targetEnvironment: "DEV",
        operation: action.operation,
        commandName: action.commandName,
        requestedBy: "BENJADMIN_TERMINAL_HUB",
        sessionId: action.mutating ? sessionId : undefined,
        approvalId,
        payload: { origin: "TERMINAL_HUB_MANAGED_COMMAND", rawCommand: false },
      }),
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; command?: { id?: string }; approval?: { status?: string }; error?: string; code?: string } | null;
    if (!response.ok || !payload?.ok) throw new Error(`${payload?.error || "A managed command nem queue-zható."}${payload?.code ? ` · ${payload.code}` : ""}`);
    setMessage(`${action.label} queue-zva${payload.command?.id ? ` · ${payload.command.id}` : ""}${payload.approval?.status ? ` · approval ${payload.approval.status}` : ""}`);
    return true;
  }

  async function requestApproval(action: ManagedAction) {
    if (!sessionId) { setMessage("A DEV restart approvalhoz READY worker session szükséges."); return; }
    setBusy(action.id); setMessage("");
    try {
      const response = await fetch("/api/dev/engine/control-plane/approvals", {
        method: "POST", headers: adminHeaders(true),
        body: JSON.stringify({ operation: action.operation, commandName: action.commandName, sessionId, reason: "BENJADMIN Terminal Hub kétlépcsős destruktív megerősítés." }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; approval?: { id?: string; expires_at?: string }; confirmation?: string; error?: string; code?: string } | null;
      if (!response.ok || !payload?.ok || !payload.approval?.id || !payload.approval.expires_at || !payload.confirmation) throw new Error(`${payload?.error || "A DEV approval nem kérhető."}${payload?.code ? ` · ${payload.code}` : ""}`);
      setPendingApproval({ id: payload.approval.id, operation: action.operation, commandName: action.commandName, sessionId, expiresAt: payload.approval.expires_at, confirmation: payload.confirmation });
      setMessage("DEV restart approval létrehozva. A command még NINCS queue-zva.");
    } catch (error) { setPendingApproval(null); setMessage(error instanceof Error ? error.message : "A DEV approval nem kérhető."); }
    finally { setBusy(null); }
  }

  async function approveAndQueue() {
    const pending = pendingApproval; if (!pending) return;
    const action = ACTIONS.find((item) => item.operation === pending.operation && item.commandName === pending.commandName);
    if (!action || pending.sessionId !== sessionId) { setPendingApproval(null); setMessage("Az approval scope megváltozott. Kérj új approvalt."); return; }
    if (nowMs > 0 && Date.parse(pending.expiresAt) <= nowMs) { setPendingApproval(null); setMessage("Az approval lejárt. Kérj újat."); return; }
    setBusy(action.id); setMessage("");
    try {
      const approve = await fetch(`/api/dev/engine/control-plane/approvals/${encodeURIComponent(pending.id)}/approve`, {
        method: "POST", headers: adminHeaders(true),
        body: JSON.stringify({ operation: pending.operation, commandName: pending.commandName, sessionId: pending.sessionId, confirmation: pending.confirmation }),
      });
      const approvalPayload = await approve.json().catch(() => null) as { ok?: boolean; error?: string; code?: string } | null;
      if (!approve.ok || !approvalPayload?.ok) throw new Error(`${approvalPayload?.error || "A DEV approval nem hagyható jóvá."}${approvalPayload?.code ? ` · ${approvalPayload.code}` : ""}`);
      const queued = await queueAction(action, pending.id);
      if (queued) setPendingApproval(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "A destruktív DEV művelet nem queue-zható."); }
    finally { setBusy(null); }
  }

  async function run(action: ManagedAction) {
    if (busy) return;
    if (action.destructiveApproval) { await requestApproval(action); return; }
    setBusy(action.id); setMessage("");
    try { await queueAction(action); }
    catch (error) { setMessage(error instanceof Error ? error.message : "A managed command nem queue-zható."); }
    finally { setBusy(null); }
  }

  const approvalRemaining = pendingApproval && nowMs > 0 ? Math.max(0, Math.ceil((Date.parse(pendingApproval.expiresAt) - nowMs) / 1000)) : 0;

  return (
    <section className={styles.terminalManagedPanel}>
      <header><div><ShieldCheck size={16} /><span>MANAGED COMMANDS · CONTROL PLANE</span></div><strong>RAW SHELL NINCS</strong></header>
      <div className={styles.terminalManagedControls}>
        <label>READY session<select value={sessionId} onChange={(event) => setSessionId(event.target.value)}><option value="">Nincs kiválasztva</option>{readySessions.map((item) => <option key={item.id} value={item.id}>{item.worker_id} · {item.id.slice(0, 8)}</option>)}</select></label>
        <div>{ACTIONS.map((action) => <button key={action.id} type="button" data-destructive={action.destructiveApproval ? "true" : "false"} onClick={() => void run(action)} disabled={Boolean(busy) || (action.mutating && !sessionId)}>{busy === action.id ? <RefreshCw size={14} /> : action.destructiveApproval ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}{action.destructiveApproval ? "Jóváhagyás kérése · " : ""}{action.label}</button>)}</div>
      </div>
      {pendingApproval ? <div className={styles.terminalDestructiveApproval}>
        <div><AlertTriangle size={18} /><span><strong>DEV RESTART · KÜLÖN JÓVÁHAGYÁS SZÜKSÉGES</strong><small>A command még nincs queue-zva. Scope: {pendingApproval.sessionId.slice(0, 12)} · egyszer használható.</small></span></div>
        <div><Clock3 size={14} /><span>{approvalRemaining}s</span><button type="button" onClick={() => void approveAndQueue()} disabled={Boolean(busy) || approvalRemaining <= 0}>JÓVÁHAGYOM ÉS QUEUE-ZOM</button><button type="button" onClick={() => setPendingApproval(null)} disabled={Boolean(busy)}>Mégse</button></div>
      </div> : null}
      {message ? <p>{message}</p> : <small>A build/test READY sessionhöz kötött. A restart kétlépcsős, 5 perces, egyszer használható approvalt igényel.</small>}
    </section>
  );
}
