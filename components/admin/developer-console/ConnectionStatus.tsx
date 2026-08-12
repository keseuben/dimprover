"use client";

import { Activity, CircleAlert, LoaderCircle, Wifi, WifiOff } from "lucide-react";
import styles from "./DeveloperConsole.module.css";

export type ConnectionMode = "connecting" | "stream" | "polling" | "reconnecting" | "offline";

export default function ConnectionStatus({ mode, lastUpdate }: { mode: ConnectionMode; lastUpdate?: string }) {
  const config = mode === "stream"
    ? { icon: <Wifi size={14} />, label: "ÉLŐ · SSE", cls: styles.connectionOk }
    : mode === "polling"
      ? { icon: <Activity size={14} />, label: "ÉLŐ · FALLBACK", cls: styles.connectionWarn }
      : mode === "reconnecting"
        ? { icon: <LoaderCircle size={14} className={styles.spin} />, label: "ÚJRACSATLAKOZÁS", cls: styles.connectionWarn }
        : mode === "offline"
          ? { icon: <WifiOff size={14} />, label: "KAPCSOLAT NINCS", cls: styles.connectionDanger }
          : { icon: <LoaderCircle size={14} className={styles.spin} />, label: "KAPCSOLÓDÁS", cls: styles.connectionMuted };
  return <span className={`${styles.connectionBadge} ${config.cls}`} title={lastUpdate ? `Utolsó frissítés: ${lastUpdate}` : undefined}>{config.icon}{config.label}{mode === "offline" ? <CircleAlert size={12} /> : null}</span>;
}
