"use client";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { CircleStop, Eye, EyeOff, KeyRound, Link2, Play, RefreshCw, Send, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TerminalCoreReadiness } from "@/app/lib/dev-center/terminal-hub/readiness";
import type { TerminalOutputChunk, TerminalSessionSummary } from "@/app/lib/dev-center/terminal-hub/session-types";
import styles from "./DeveloperConsole.module.css";

function adminHeaders(json = false) {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { ...(json ? { "content-type": "application/json" } : {}), "x-dimpro-license-admin-key": key };
}

function terminalTheme(element: HTMLElement) {
  const style = getComputedStyle(element.closest("[data-console-theme]") || element);
  return {
    background: style.getPropertyValue("--surface").trim() || "#0f172a",
    foreground: style.getPropertyValue("--text").trim() || "#f8fafc",
    cursor: style.getPropertyValue("--accent-strong").trim() || "#67e8f9",
    selectionBackground: style.getPropertyValue("--accent-soft").trim() || "rgba(34,211,238,.18)",
  };
}

export default function TerminalCorePanel({ readiness }: { readiness: TerminalCoreReadiness | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);
  const sessionRef = useRef<TerminalSessionSummary | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const privateInputRef = useRef(false);
  const [cwd, setCwd] = useState("/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2");
  const [session, setSession] = useState<TerminalSessionSummary | null>(null);
  const [sessions, setSessions] = useState<TerminalSessionSummary[]>([]);
  const [connection, setConnection] = useState<"IDLE" | "CONNECTING" | "LIVE" | "RECONNECTING" | "CLOSED" | "ERROR">("IDLE");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [privateInput, setPrivateInput] = useState(false);
  const [privateValue, setPrivateValue] = useState("");

  const updateSession = useCallback((next: TerminalSessionSummary | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const loadSessions = useCallback(async () => {
    const response = await fetch("/api/dev/terminal-hub/sessions", { headers: adminHeaders(), cache: "no-store" });
    const payload = await response.json().catch(() => null) as { ok?: boolean; sessions?: TerminalSessionSummary[]; error?: string } | null;
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A terminál session lista nem tölthető be.");
    setSessions(payload.sessions || []);
  }, []);

  const sendResize = useCallback(async () => {
    const active = sessionRef.current;
    const terminal = terminalRef.current;
    if (!active || !terminal || active.state !== "RUNNING") return;
    await fetch(`/api/dev/terminal-hub/sessions/${encodeURIComponent(active.id)}/resize`, {
      method: "POST", headers: adminHeaders(true), body: JSON.stringify({ cols: terminal.cols, rows: terminal.rows }),
    }).catch(() => undefined);
  }, []);

  const beginStream = useCallback(async function stream(sessionId: string) {
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    setConnection(sequenceRef.current ? "RECONNECTING" : "CONNECTING");
    try {
      const response = await fetch(`/api/dev/terminal-hub/sessions/${encodeURIComponent(sessionId)}/stream?after=${sequenceRef.current}`, { headers: adminHeaders(), cache: "no-store", signal: controller.signal });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "A terminál stream nem kapcsolható.");
      }
      setConnection("LIVE");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventName = "message";
      let dataLines: string[] = [];
      const dispatch = () => {
        if (!dataLines.length) { eventName = "message"; return; }
        const raw = dataLines.join("\n");
        dataLines = [];
        try {
          const payload = JSON.parse(raw) as TerminalOutputChunk | { session?: TerminalSessionSummary; sequence?: number };
          if (eventName === "output" && "data" in payload && typeof payload.data === "string") {
            terminalRef.current?.write(payload.data);
            if ("sequence" in payload && typeof payload.sequence === "number") sequenceRef.current = Math.max(sequenceRef.current, payload.sequence);
          } else if ((eventName === "session" || eventName === "terminal-end") && "session" in payload && payload.session) {
            updateSession(payload.session);
            if (typeof payload.sequence === "number") sequenceRef.current = Math.max(sequenceRef.current, payload.sequence);
            if (eventName === "terminal-end") setConnection("CLOSED");
          }
        } catch { /* hibás SSE esemény figyelmen kívül */ }
        eventName = "message";
      };
      while (!controller.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line) dispatch();
          else if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        }
      }
      dispatch();
      if (!controller.signal.aborted && sessionRef.current && ["RUNNING", "DISCONNECTED"].includes(sessionRef.current.state)) {
        setConnection("RECONNECTING");
        reconnectTimerRef.current = setTimeout(() => void stream(sessionId), 1000);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setMessage(error instanceof Error ? error.message : "A terminál stream megszakadt.");
      setConnection("RECONNECTING");
      reconnectTimerRef.current = setTimeout(() => void stream(sessionId), 1500);
    }
  }, [updateSession]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const terminal = new Terminal({ cursorBlink: true, convertEol: true, scrollback: 5000, fontFamily: "Cascadia Code, Consolas, monospace", fontSize: 13, theme: terminalTheme(host) });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    fit.fit();
    terminal.writeln("BENJADMIN Terminal Core · P2 candidate\r\nExecution csak READY security gate mellett engedélyezett.\r\n");
    terminalRef.current = terminal;
    fitRef.current = fit;
    const dataDisposable = terminal.onData((data) => {
      if (privateInputRef.current) return;
      const active = sessionRef.current;
      if (!active || active.state !== "RUNNING") return;
      void fetch(`/api/dev/terminal-hub/sessions/${encodeURIComponent(active.id)}/input`, { method: "POST", headers: adminHeaders(true), body: JSON.stringify({ data, private: false }) });
    });
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      fit.fit();
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => void sendResize(), 120);
    });
    observer.observe(host);
    void loadSessions().catch((error) => setMessage(error instanceof Error ? error.message : "Session lista hiba."));
    return () => {
      observer.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      dataDisposable.dispose();
      streamAbortRef.current?.abort();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [loadSessions, sendResize]);

  useEffect(() => {
    privateInputRef.current = privateInput;
    if (terminalRef.current) terminalRef.current.options.disableStdin = privateInput;
    if (!privateInput) setPrivateValue("");
  }, [privateInput]);

  async function setAiVisibility(mode: "FILTERED" | "BLOCKED") {
    const active=sessionRef.current; if(!active||busy) return;
    setBusy(true); setMessage("");
    try {
      const response=await fetch(`/api/dev/terminal-hub/sessions/${encodeURIComponent(active.id)}/ai-visibility`,{method:"POST",headers:adminHeaders(true),body:JSON.stringify({mode})});
      const payload=await response.json().catch(()=>null) as {ok?:boolean;session?:TerminalSessionSummary;error?:string}|null;
      if(!response.ok||!payload?.ok||!payload.session) throw new Error(payload?.error||"Az AI visibility nem módosítható.");
      updateSession(payload.session); await loadSessions();
    } catch(error){setMessage(error instanceof Error?error.message:"Az AI visibility nem módosítható.");}
    finally{setBusy(false);}
  }

  async function sendPrivateInput() {
    const active=sessionRef.current; const value=privateValue;
    if(!active||active.state!=="RUNNING"||!value||busy) return;
    setBusy(true); setMessage(""); setPrivateValue("");
    try {
      const response=await fetch(`/api/dev/terminal-hub/sessions/${encodeURIComponent(active.id)}/input`,{method:"POST",headers:adminHeaders(true),body:JSON.stringify({data:`${value}\r`,private:true})});
      const payload=await response.json().catch(()=>null) as {ok?:boolean;error?:string}|null;
      if(!response.ok||!payload?.ok) throw new Error(payload?.error||"A privát input nem küldhető.");
      terminalRef.current?.write("\r\n[PRIVÁT INPUT ELKÜLDVE · TARTALOM NEM NAPLÓZVA]\r\n");
    } catch(error){setMessage(error instanceof Error?error.message:"A privát input nem küldhető.");}
    finally{setBusy(false);}
  }

  async function startSession() {
    const terminal = terminalRef.current;
    if (!terminal || !readiness?.ready || busy) return;
    setBusy(true); setMessage(""); sequenceRef.current = 0;
    try {
      const response = await fetch("/api/dev/terminal-hub/sessions", { method: "POST", headers: adminHeaders(true), body: JSON.stringify({ cwd, cols: terminal.cols, rows: terminal.rows }) });
      const payload = await response.json().catch(() => null) as { ok?: boolean; session?: TerminalSessionSummary; error?: string; code?: string } | null;
      if (!response.ok || !payload?.ok || !payload.session) throw new Error(`${payload?.code ? `${payload.code}: ` : ""}${payload?.error || "A terminál session nem indítható."}`);
      terminal.clear();
      updateSession(payload.session);
      await loadSessions();
      void beginStream(payload.session.id);
    } catch (error) { setConnection("ERROR"); setMessage(error instanceof Error ? error.message : "A terminál session nem indítható."); }
    finally { setBusy(false); }
  }

  async function attachSession(item: TerminalSessionSummary) {
    if (!["RUNNING", "DISCONNECTED"].includes(item.state)) return;
    sequenceRef.current = 0;
    terminalRef.current?.clear();
    updateSession(item);
    void beginStream(item.id);
  }

  async function closeSession() {
    const active = sessionRef.current;
    if (!active) return;
    setBusy(true);
    try {
      await fetch(`/api/dev/terminal-hub/sessions/${encodeURIComponent(active.id)}`, { method: "DELETE", headers: adminHeaders() });
      streamAbortRef.current?.abort();
      setConnection("CLOSED");
      setPrivateInput(false); setPrivateValue("");
      updateSession(null);
      await loadSessions();
    } finally { setBusy(false); }
  }

  return (
    <section className={styles.terminalCorePanel}>
      <header className={styles.terminalCoreToolbar}>
        <label><span>Munkakönyvtár</span><input value={cwd} onChange={(event) => setCwd(event.target.value)} disabled={Boolean(session)} /></label>
        <div className={styles.terminalCoreActions}>
          <span data-state={connection}>{connection}</span>
          <button type="button" onClick={() => void setAiVisibility(session?.aiVisibility === "BLOCKED" ? "FILTERED" : "BLOCKED")} disabled={!session || busy} title="Session AI láthatóság váltása">{session?.aiVisibility === "BLOCKED" ? <EyeOff size={15} /> : <Eye size={15} />} AI: {session?.aiVisibility === "BLOCKED" ? "TILTVA" : "SZŰRT"}</button>
          <button type="button" data-private={privateInput ? "true" : "false"} onClick={() => setPrivateInput((value) => !value)} disabled={!session || session.state !== "RUNNING" || busy} title="Privát input mód"> <KeyRound size={15} /> Privát input</button>
          <button type="button" onClick={() => void loadSessions()} title="Session lista frissítése"><RefreshCw size={15} /></button>
          <button type="button" onClick={() => void startSession()} disabled={!readiness?.ready || Boolean(session) || busy}><Play size={15} /> Indítás</button>
          <button type="button" onClick={() => void closeSession()} disabled={!session || busy}><CircleStop size={15} /> Leállítás</button>
        </div>
      </header>
      {!readiness?.ready ? <div className={styles.terminalCoreBlocked}><ShieldAlert size={16} /><span>A terminál végrehajtás jelenleg BLOCKED. A P2 security gate feloldásáig ez csak kliens/session candidate felület.</span></div> : null}
      {message ? <div className={styles.terminalHubNotice}>{message}</div> : null}
      {privateInput ? <div className={styles.terminalPrivateInput}><div><KeyRound size={16} /><span><strong>PRIVÁT INPUT</strong><small>Nem kerül AI-adatútba, Parancstárba vagy tartalmi auditba.</small></span></div><input type="password" autoComplete="off" spellCheck={false} value={privateValue} onChange={(event)=>setPrivateValue(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();void sendPrivateInput();}}} placeholder="Titkos érték / jelszó / token" /><button type="button" onClick={() => void sendPrivateInput()} disabled={!privateValue||busy}><Send size={14}/> Küldés privátként</button></div> : null}
      <div ref={hostRef} className={styles.terminalCoreCanvas} aria-label="DEV Terminal Core" />
      <footer className={styles.terminalCoreSessionBar}>
        <div><strong>{session ? `Session ${session.id.slice(0, 8)}` : "Nincs aktív session"}</strong><span>{session ? `${session.state} · AI ${session.aiVisibility} · seq ${sequenceRef.current} · ${session.cwd}` : "DEV · nem-root gate · PROD tiltva"}</span></div>
        <div className={styles.terminalCoreSessionList}>{sessions.slice(0, 4).map((item) => <button type="button" key={item.id} onClick={() => void attachSession(item)} disabled={!["RUNNING","DISCONNECTED"].includes(item.state)} title={item.cwd}><Link2 size={13} />{item.id.slice(0, 6)} · {item.state}</button>)}</div>
      </footer>
    </section>
  );
}
