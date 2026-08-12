"use client";

import { BookOpenText, FolderOpen, MonitorDown, ShieldCheck, UsersRound } from "lucide-react";
import ConnectionStatus, { type ConnectionMode } from "./ConnectionStatus";
import ThemeModeMenu from "./ThemeModeMenu";
import type { ConsoleTheme, RuntimeContext } from "./types";
import styles from "./DeveloperConsole.module.css";

function formatClock(now: number) {
  return new Intl.DateTimeFormat("hu-HU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(now));
}

export default function DeveloperConsoleTopbar({ theme, onThemeChange, connection, lastUpdate, now, context, onCommands, onResources, onInstall, onTeam, onPrivacy }: {
  theme: ConsoleTheme;
  onThemeChange: (theme: ConsoleTheme) => void;
  connection: ConnectionMode;
  lastUpdate?: string;
  now: number;
  context: RuntimeContext | null;
  onCommands: () => void;
  onResources: () => void;
  onInstall: () => void;
  onTeam: () => void;
  onPrivacy: () => void;
}) {
  return (
    <header className={styles.topbar}>
      <div className={styles.brand}><span>D</span><div><strong>DIMPRO BENJADMIN</strong><small>FEJLESZTŐI KONZOL V1</small></div></div>
      <div className={styles.topbarCenter}><ConnectionStatus mode={connection} lastUpdate={lastUpdate} /><span className={styles.envBadge}>DEV</span><span className={styles.readOnlyBadge}>PROD · READ ONLY</span><span className={styles.bridgeBadge} title={context?.aiBridge?.executorConfigured ? "Natív worker executor konfigurálva" : "A Konzol jelenleg kézi ChatGPT/MCP végrehajtó híddal működik"}>AI HÍD · {context?.aiBridge?.mode === "OPENAI_RESPONSES" ? "API" : "KÉZI"}</span><time>{formatClock(now)}</time><small>{context?.branch || "ág…"} · {context?.commit || "HEAD…"}</small></div>
      <div className={styles.topbarActions}>
        <button type="button" onClick={onCommands}><BookOpenText size={16} /><span>ChatGPT Parancstár</span></button>
        <button type="button" onClick={onResources}><FolderOpen size={16} /><span>Fejlesztési Tár</span></button>
        <ThemeModeMenu theme={theme} onChange={onThemeChange} />
        <button type="button" onClick={onInstall}><MonitorDown size={16} /><span>Telepítés</span></button>
        <button type="button" onClick={onTeam}><UsersRound size={16} /><span>Csapat</span></button>
        <button type="button" onClick={onPrivacy} title="Takaróképernyő · Ctrl+Alt+Space"><ShieldCheck size={16} /><span>Takaró</span></button>
      </div>
    </header>
  );
}
