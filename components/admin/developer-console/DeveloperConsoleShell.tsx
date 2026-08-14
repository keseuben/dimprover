"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppInstallDrawer from "./AppInstallDrawer";
import CommandLibraryDrawer from "./CommandLibraryDrawer";
import DeveloperComposer from "./DeveloperComposer";
import DeveloperConsoleProjectRail from "./DeveloperConsoleProjectRail";
import DeveloperConsoleTopbar from "./DeveloperConsoleTopbar";
import DeveloperConversation from "./DeveloperConversation";
import DevelopmentResourcesDrawer from "./DevelopmentResourcesDrawer";
import ExternalAiWorkersDrawer from "./ExternalAiWorkersDrawer";
import LiveWorkPanel from "./LiveWorkPanel";
import OutminPartnerBar from "./OutminPartnerBar";
import TeamQuickDrawer from "./TeamQuickDrawer";
import TerminalHubWorkspace from "./TerminalHubWorkspace";
import type { ConnectionMode } from "./ConnectionStatus";
import type { BenAiDispatch, ConsoleLiveState, ConsoleMessage, ConsoleTarget, ConsoleTheme, DevelopmentResource, ResourceHealth, RuntimeContext } from "./types";
import styles from "./DeveloperConsole.module.css";

const THEME_KEY = "benjadmin-developer-console-theme";
const PROJECT_KEY = "benjadmin-developer-console-project";

function adminHeaders(json = false) {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { ...(json ? { "content-type": "application/json" } : {}), "x-dimpro-license-admin-key": key };
}

function stableMerge<T extends { id: string }>(current: T[], incoming: T[]) {
  const existing = new Map(current.map((item) => [item.id, item]));
  return incoming.map((item) => {
    const old = existing.get(item.id);
    if (!old) return item;
    return JSON.stringify(old) === JSON.stringify(item) ? old : item;
  });
}

function mergeLive(current: ConsoleLiveState | null, incoming: ConsoleLiveState): ConsoleLiveState {
  if (!current) return incoming;
  return {
    ...incoming,
    projects: stableMerge(current.projects, incoming.projects),
    workers: stableMerge(current.workers, incoming.workers),
    tasks: stableMerge(current.tasks, incoming.tasks),
    sessions: stableMerge(current.sessions, incoming.sessions),
    builds: stableMerge(current.builds, incoming.builds),
    releases: stableMerge(current.releases, incoming.releases),
    approvals: stableMerge(current.approvals, incoming.approvals),
    audits: stableMerge(current.audits, incoming.audits),
  };
}

function mergeMessages(current: ConsoleMessage[], incoming: ConsoleMessage[]) {
  const existing = new Map(current.map((item) => [item.id, item]));
  return incoming.map((item) => {
    const old = existing.get(item.id);
    if (!old) return item;
    return JSON.stringify(old) === JSON.stringify(item) ? old : item;
  });
}

export default function DeveloperConsoleShell() {
  const [theme, setTheme] = useState<ConsoleTheme>("dark");
  const [live, setLive] = useState<ConsoleLiveState | null>(null);
  const [messages, setMessages] = useState<ConsoleMessage[]>([]);
  const [context, setContext] = useState<RuntimeContext | null>(null);
  const [resources, setResources] = useState<DevelopmentResource[]>([]);
  const [resourceHealth, setResourceHealth] = useState<ResourceHealth | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [connection, setConnection] = useState<ConnectionMode>("connecting");
  const [lastUpdate, setLastUpdate] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [aiWorkersOpen, setAiWorkersOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [terminalHubOpen, setTerminalHubOpen] = useState(false);
  const liveRef = useRef<ConsoleLiveState | null>(null);
  const messagesRef = useRef<ConsoleMessage[]>([]);

  useEffect(() => {
    const storedTheme = localStorage.getItem(THEME_KEY);
    setTheme(storedTheme === "light" || storedTheme === "sunlight" ? storedTheme : "dark");
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const changeTheme = useCallback((next: ConsoleTheme) => {
    localStorage.setItem(THEME_KEY, next);
    setTheme(next);
  }, []);

  const changeProject = useCallback((id: string) => {
    localStorage.setItem(PROJECT_KEY, id);
    setSelectedProjectId(id);
  }, []);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const hasOpenLayer = commandsOpen || resourcesOpen || aiWorkersOpen || teamOpen || installOpen || terminalHubOpen;
      if (!hasOpenLayer) return;
      event.preventDefault();
      setCommandsOpen(false);
      setResourcesOpen(false);
      setAiWorkersOpen(false);
      setTeamOpen(false);
      setInstallOpen(false);
      setTerminalHubOpen(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [aiWorkersOpen, commandsOpen, installOpen, resourcesOpen, teamOpen, terminalHubOpen]);

  const applySnapshot = useCallback((incomingLive: ConsoleLiveState, incomingMessages: ConsoleMessage[]) => {
    setLive((current) => {
      const next = mergeLive(current, incomingLive);
      liveRef.current = next;
      return next;
    });
    setMessages((current) => {
      const next = mergeMessages(current, incomingMessages);
      messagesRef.current = next;
      return next;
    });
    setLastUpdate(new Date().toISOString());
    setError("");
  }, []);

  const loadResources = useCallback(async () => {
    const response = await fetch("/api/dev/console/resources", { headers: adminHeaders(), cache: "no-store" });
    const payload = await response.json().catch(() => null) as { ok?: boolean; resources?: DevelopmentResource[]; health?: ResourceHealth; error?: string } | null;
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || "A Fejlesztési Tár nem tölthető be.");
    setResources(payload.resources || []);
    setResourceHealth(payload.health || null);
  }, []);

  const silentFetch = useCallback(async () => {
    try {
      const [liveResponse, messageResponse] = await Promise.all([
        fetch("/api/dev/console/live", { headers: adminHeaders(), cache: "no-store" }),
        fetch("/api/dev/console/messages", { headers: adminHeaders(), cache: "no-store" }),
      ]);
      const livePayload = await liveResponse.json().catch(() => null) as { ok?: boolean; live?: ConsoleLiveState; error?: string } | null;
      const messagePayload = await messageResponse.json().catch(() => null) as { ok?: boolean; messages?: ConsoleMessage[]; error?: string } | null;
      if (!liveResponse.ok || !livePayload?.live) throw new Error(livePayload?.error || "Az élő állapot nem tölthető be.");
      if (!messageResponse.ok || !messagePayload?.messages) throw new Error(messagePayload?.error || "A munkanapló nem tölthető be.");
      applySnapshot(livePayload.live, messagePayload.messages);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az élő állapot nem érhető el.");
      return false;
    }
  }, [applySnapshot]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | null = null;
    let reconnectTimer: number | null = null;
    let streamAbort: AbortController | null = null;

    const stopPolling = () => { if (pollTimer) { window.clearInterval(pollTimer); pollTimer = null; } };
    const startPolling = () => {
      if (pollTimer || cancelled) return;
      setConnection("polling");
      void silentFetch();
      pollTimer = window.setInterval(() => { if (document.visibilityState === "visible") void silentFetch(); }, 2000);
    };

    const connect = async (attempt = 0) => {
      if (cancelled) return;
      setConnection(attempt ? "reconnecting" : "connecting");
      streamAbort = new AbortController();
      try {
        const response = await fetch("/api/dev/console/stream", { headers: adminHeaders(), cache: "no-store", signal: streamAbort.signal });
        if (!response.ok || !response.body) throw new Error(`SSE ${response.status}`);
        stopPolling();
        setConnection("stream");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) throw new Error("SSE kapcsolat lezárult.");
          buffer += decoder.decode(value, { stream: true });
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const event = block.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim() || "message";
            const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
            if (event === "snapshot" && data) {
              const payload = JSON.parse(data) as { live: ConsoleLiveState; messages: ConsoleMessage[]; sentAt?: string };
              applySnapshot(payload.live, payload.messages);
            } else if (event === "stream-error" && data) {
              const payload = JSON.parse(data) as { error?: string };
              setError(payload.error || "Az eseményfolyam hibát jelzett.");
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch (caught) {
        if (cancelled || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setConnection("reconnecting");
        startPolling();
        const delay = Math.min(20_000, 1500 * 2 ** Math.min(attempt, 4));
        reconnectTimer = window.setTimeout(() => void connect(attempt + 1), delay);
      }
    };

    async function bootstrap() {
      try {
        const [contextResponse] = await Promise.all([
          fetch("/api/dev/console/context", { headers: adminHeaders(), cache: "no-store" }),
          silentFetch(),
          loadResources(),
        ]);
        const contextPayload = await contextResponse.json().catch(() => null) as { ok?: boolean; context?: RuntimeContext; error?: string } | null;
        if (contextResponse.ok && contextPayload?.context) setContext(contextPayload.context);
        if (!cancelled) {
          const storedProject = localStorage.getItem(PROJECT_KEY) || "";
          const projects = liveRef.current?.projects || [];
          const initial = projects.some((item) => item.id === storedProject) ? storedProject : projects.length === 1 ? projects[0].id : "";
          setSelectedProjectId(initial);
          void connect(0);
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "A Fejlesztői Konzol indulása sikertelen.");
        startPolling();
        void connect(1);
      }
    }
    void bootstrap();

    return () => {
      cancelled = true;
      stopPolling();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      streamAbort?.abort();
    };
  }, [applySnapshot, loadResources, silentFetch]);

  const selectedProjectName = useMemo(() => live?.projects.find((item) => item.id === selectedProjectId)?.name || "", [live?.projects, selectedProjectId]);

  async function send(input: { text: string; target: ConsoleTarget; createTask: boolean; kind: "INSTRUCTION" | "DECISION" }) {
    setSending(true); setNotice(""); setError("");
    try {
      if (input.createTask && !selectedProjectId) throw new Error("Feladat létrehozásához válassz projektet, vagy kapcsold ki a Feladat létrehozása jelölést.");
      const response = await fetch("/api/dev/console/messages", {
        method: "POST",
        headers: adminHeaders(true),
        body: JSON.stringify({ ...input, projectId: selectedProjectId || undefined }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; message?: ConsoleMessage; coordinatorMessage?: ConsoleMessage; task?: { id?: string }; dispatch?: BenAiDispatch; error?: string; code?: string } | null;
      if (!response.ok || !payload?.ok || !payload.message) throw new Error(payload?.error || "Az utasítás nem rögzíthető.");
      setMessages((current) => {
        const map = new Map(current.map((item) => [item.id, item]));
        map.set(payload.message!.id, payload.message!);
        if (payload.coordinatorMessage) map.set(payload.coordinatorMessage.id, payload.coordinatorMessage);
        const next = [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        messagesRef.current = next;
        return next;
      });
      setNotice(payload.dispatch?.summary || (payload.task?.id ? `Utasítás és fejlesztési task rögzítve: ${payload.task.id}` : "Utasítás rögzítve a közös munkanaplóba."));
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az utasítás nem rögzíthető.");
      return false;
    } finally { setSending(false); }
  }

  function requestPrivacy() {
    window.dispatchEvent(new CustomEvent("benjadmin:privacy-cover"));
  }

  return (
    <main className={styles.console} data-console-theme={theme} data-testid="benjadmin-developer-console">
      <DeveloperConsoleTopbar theme={theme} onThemeChange={changeTheme} connection={connection} lastUpdate={lastUpdate} now={now} context={context} onCommands={() => setCommandsOpen(true)} onResources={() => setResourcesOpen(true)} onAiWorkers={() => setAiWorkersOpen(true)} onInstall={() => setInstallOpen(true)} onTeam={() => setTeamOpen(true)} onPrivacy={requestPrivacy} />
      {error ? <div className={styles.alertBar}><AlertTriangle size={15} /><span>{error}</span><button type="button" onClick={() => void silentFetch()}><RefreshCw size={14} /> Újrapróbálás</button></div> : null}
      {notice ? <div className={styles.noticeBar}>{notice}</div> : null}
      <div className={styles.workspace}>
        <DeveloperConsoleProjectRail live={live} selectedProjectId={selectedProjectId} onSelectProject={changeProject} />
        <DeveloperConversation messages={messages} selectedProjectId={selectedProjectId} />
        <LiveWorkPanel live={live} now={now} context={context} onOpenTerminalHub={() => setTerminalHubOpen(true)} />
      </div>
      <OutminPartnerBar live={live} messages={messages} />
      <DeveloperComposer projects={live?.projects || []} selectedProjectId={selectedProjectId} onProjectChange={changeProject} onSend={send} busy={sending} />
      <CommandLibraryDrawer open={commandsOpen} onClose={() => setCommandsOpen(false)} context={context} selectedProjectName={selectedProjectName} resources={resources} />
      <ExternalAiWorkersDrawer open={aiWorkersOpen} onClose={() => setAiWorkersOpen(false)} projects={live?.projects || []} selectedProjectId={selectedProjectId} />
      <DevelopmentResourcesDrawer open={resourcesOpen} onClose={() => setResourcesOpen(false)} resources={resources} health={resourceHealth} onReload={loadResources} />
      <TeamQuickDrawer open={teamOpen} onClose={() => setTeamOpen(false)} live={live} />
      <AppInstallDrawer open={installOpen} onClose={() => setInstallOpen(false)} />
      <TerminalHubWorkspace open={terminalHubOpen} onClose={() => setTerminalHubOpen(false)} live={live} theme={theme} />
    </main>
  );
}
