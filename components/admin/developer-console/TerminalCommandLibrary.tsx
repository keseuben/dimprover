"use client";

import { BookOpenCheck, ChevronDown, ChevronUp, ClipboardCopy, DatabaseZap, Plus, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TerminalCommandCatalogItem, TerminalCommandEvent } from "@/app/lib/dev-center/terminal-hub/command-library";
import type { LiveProject } from "./types";
import styles from "./DeveloperConsole.module.css";

function adminHeaders(json = false) {
  const key = localStorage.getItem("dimproLicenseAdminKey")?.trim() || "";
  return { ...(json ? { "content-type": "application/json" } : {}), "x-dimpro-license-admin-key": key };
}

function dateTime(value: string) {
  if (!value) return "—";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString("hu-HU") : value;
}

export default function TerminalCommandLibrary({ enabled, projects }: { enabled: boolean; projects: LiveProject[] }) {
  const [commands, setCommands] = useState<TerminalCommandCatalogItem[]>([]);
  const [eventsByCommand, setEventsByCommand] = useState<Record<string, TerminalCommandEvent[]>>({});
  const [expandedId, setExpandedId] = useState("");
  const [query, setQuery] = useState("");
  const [shell, setShell] = useState("");
  const [environment, setEnvironment] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCommand, setManualCommand] = useState("");
  const [manualShell, setManualShell] = useState("bash");
  const [manualEnvironment, setManualEnvironment] = useState("DEV");
  const [manualProjectId, setManualProjectId] = useState("");
  const [manualPurpose, setManualPurpose] = useState("");
  const [manualTags, setManualTags] = useState("");

  const projectName = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);

  const load = useCallback(async () => {
    if (!enabled) return;
    setBusy("load");
    setMessage("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (shell) params.set("shell", shell);
      if (environment) params.set("environment", environment);
      if (projectId) params.set("projectId", projectId);
      params.set("limit", "100");
      const response = await fetch(`/api/dev/terminal-hub/command-library?${params}`, { headers: adminHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; commands?: TerminalCommandCatalogItem[]; code?: string; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(`${payload?.code ? `${payload.code}: ` : ""}${payload?.error || "A Terminál Parancstár nem tölthető be."}`);
      setCommands(payload.commands || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A Terminál Parancstár nem tölthető be.");
    } finally {
      setBusy("");
    }
  }, [enabled, environment, projectId, query, shell]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [enabled, load]);

  async function loadEvents(commandId: string) {
    if (eventsByCommand[commandId]) return;
    setBusy(`events:${commandId}`);
    try {
      const response = await fetch(`/api/dev/terminal-hub/command-library/${encodeURIComponent(commandId)}/events?limit=60`, { headers: adminHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; events?: TerminalCommandEvent[]; code?: string; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(`${payload?.code ? `${payload.code}: ` : ""}${payload?.error || "A parancstörténet nem tölthető be."}`);
      setEventsByCommand((current) => ({ ...current, [commandId]: payload.events || [] }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A parancstörténet nem tölthető be.");
    } finally {
      setBusy("");
    }
  }

  async function toggleEvents(commandId: string) {
    const next = expandedId === commandId ? "" : commandId;
    setExpandedId(next);
    if (next) await loadEvents(commandId);
  }

  async function recordManual() {
    if (!manualCommand.trim()) {
      setMessage("Adj meg rögzítendő parancsot.");
      return;
    }
    setBusy("record");
    setMessage("");
    try {
      const response = await fetch("/api/dev/terminal-hub/command-library", {
        method: "POST",
        headers: adminHeaders(true),
        body: JSON.stringify({
          command: manualCommand,
          shellFamily: manualShell,
          environment: manualEnvironment,
          projectId: manualProjectId || null,
          purpose: manualPurpose,
          tags: manualTags.split(",").map((item) => item.trim()).filter(Boolean),
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; result?: { id?: string; redacted?: boolean; findingCount?: number }; code?: string; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(`${payload?.code ? `${payload.code}: ` : ""}${payload?.error || "A parancs nem rögzíthető."}`);
      setMessage(payload.result?.redacted ? `Parancs rögzítve maszkolva · ${payload.result.findingCount || 0} érzékeny találat.` : "Parancs rögzítve a deduplikált Terminál Parancstárba.");
      setManualCommand("");
      setManualPurpose("");
      setManualTags("");
      setEventsByCommand({});
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A parancs nem rögzíthető.");
    } finally {
      setBusy("");
    }
  }

  if (!enabled) {
    return (
      <section className={styles.terminalCommandLibraryDisabled}>
        <BookOpenCheck size={30} />
        <strong>TERMINÁL PARANCSTÁR · P3</strong>
        <p>A deduplikált shell/Git/PowerShell tudástár kódja elkészítés alatt áll. A feature flag jelenleg OFF, ezért adatbázis-írás és automatikus parancsrögzítés nincs.</p>
        <small>Ez külön modul a ChatGPT Parancstártól. A Terminál Parancstár nem nyers shell-végrehajtó.</small>
      </section>
    );
  }

  return (
    <section className={styles.terminalCommandLibrary}>
      <header className={styles.terminalCommandLibraryHeader}>
        <div><BookOpenCheck size={19} /><div><span>TERMINÁL PARANCSTÁR</span><strong>Deduplikált shell · Git · PowerShell tudástár</strong></div></div>
        <div><ShieldCheck size={14} /><span>SECRET-MASZKOLT</span><button type="button" onClick={() => void load()} disabled={busy === "load"} title="Frissítés"><RefreshCw size={14} /></button></div>
      </header>

      <div className={styles.terminalCommandLibraryToolbar}>
        <label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keresés a parancsok között…" /></label>
        <select value={shell} onChange={(event) => setShell(event.target.value)} aria-label="Shell szűrő"><option value="">Minden shell</option><option value="bash">Bash</option><option value="git">Git</option><option value="powershell">PowerShell</option><option value="other">Egyéb</option></select>
        <select value={environment} onChange={(event) => setEnvironment(event.target.value)} aria-label="Környezet szűrő"><option value="">Minden környezet</option><option value="DEV">DEV</option><option value="LOCAL">LOCAL</option><option value="STAGING">STAGING</option><option value="PRODUCTION">PRODUCTION</option><option value="CONTROL">CONTROL</option></select>
        <select value={projectId} onChange={(event) => setProjectId(event.target.value)} aria-label="Projekt szűrő"><option value="">Minden projekt</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
        <button type="button" onClick={() => setManualOpen((value) => !value)}><Plus size={14} /> Kézi rögzítés</button>
      </div>

      {manualOpen ? (
        <div className={styles.terminalCommandManualForm}>
          <label className={styles.terminalCommandManualWide}><span>Parancs</span><textarea rows={2} value={manualCommand} onChange={(event) => setManualCommand(event.target.value)} placeholder="Pl. git status --short" /></label>
          <label><span>Shell</span><select value={manualShell} onChange={(event) => setManualShell(event.target.value)}><option value="bash">Bash</option><option value="git">Git</option><option value="powershell">PowerShell</option><option value="other">Egyéb</option></select></label>
          <label><span>Környezet</span><select value={manualEnvironment} onChange={(event) => setManualEnvironment(event.target.value)}><option value="DEV">DEV</option><option value="LOCAL">LOCAL</option></select></label>
          <label><span>Projekt</span><select value={manualProjectId} onChange={(event) => setManualProjectId(event.target.value)}><option value="">Nincs projekt</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label><span>Cél / mire használtuk</span><input value={manualPurpose} onChange={(event) => setManualPurpose(event.target.value)} placeholder="Rövid cél" /></label>
          <label className={styles.terminalCommandManualWide}><span>Címkék</span><input value={manualTags} onChange={(event) => setManualTags(event.target.value)} placeholder="git, ellenőrzés, build" /></label>
          <button type="button" onClick={() => void recordManual()} disabled={busy === "record"}><DatabaseZap size={14} /> {busy === "record" ? "Rögzítés…" : "Rögzítés a Parancstárba"}</button>
        </div>
      ) : null}

      {message ? <div className={styles.terminalHubNotice}>{message}</div> : null}

      <div className={styles.terminalCommandList}>
        {commands.map((command) => {
          const expanded = expandedId === command.id;
          const events = eventsByCommand[command.id] || [];
          return (
            <article key={command.id}>
              <div className={styles.terminalCommandCardMain}>
                <div className={styles.terminalCommandBadges}><b>{command.shellFamily.toUpperCase()}</b><span>{command.lastEnvironment}</span><span>{command.usageCount}× használat</span>{command.lastProjectId ? <span>{projectName.get(command.lastProjectId) || command.lastProjectId}</span> : null}</div>
                <code>{command.displayCommand}</code>
                {command.purpose ? <p><strong>Cél:</strong> {command.purpose}</p> : null}
                {command.lastResultSummary ? <p><strong>Utolsó eredmény:</strong> {command.lastResultSummary}</p> : null}
                {command.tags.length ? <div className={styles.terminalCommandTags}>{command.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
                <small>Első: {dateTime(command.firstUsedAt)} · Utolsó: {dateTime(command.lastUsedAt)} · SHA {command.commandHash.slice(0, 12)}…</small>
              </div>
              <div className={styles.terminalCommandCardActions}>
                <button type="button" onClick={() => void navigator.clipboard.writeText(command.displayCommand)} title="Maszkolt parancs másolása"><ClipboardCopy size={14} /></button>
                <button type="button" onClick={() => void toggleEvents(command.id)} title="Használati események">{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
              </div>
              {expanded ? <div className={styles.terminalCommandEvents}>{busy === `events:${command.id}` ? <p>Használatok betöltése…</p> : events.length ? events.map((event) => <div key={event.id}><b>{event.environment}</b><span>{event.source} · {event.resultStatus}</span><span>{event.projectId ? projectName.get(event.projectId) || event.projectId : "nincs projekt"}</span><time>{dateTime(event.executedAt)}</time>{event.resultSummary ? <small>{event.resultSummary}</small> : null}</div>) : <p>Nincs használati esemény.</p>}</div> : null}
            </article>
          );
        })}
        {!commands.length && busy !== "load" ? <div className={styles.terminalCommandEmpty}>Még nincs a szűrésnek megfelelő parancs a Terminál Parancstárban.</div> : null}
        {busy === "load" ? <div className={styles.terminalCommandEmpty}>Terminál Parancstár betöltése…</div> : null}
      </div>

      <footer className={styles.terminalCommandLibraryFooter}><ShieldCheck size={14} /><span>A katalógus csak sanitizált/maszkolt parancsot tárol. Minden használat külön audit-esemény, miközben a felhasználói nézet deduplikált marad.</span></footer>
    </section>
  );
}
