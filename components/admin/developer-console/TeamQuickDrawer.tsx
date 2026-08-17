"use client";

import { X } from "lucide-react";
import BenjadminAvatar, { memberName } from "./BenjadminAvatar";
import type { ConsoleAuthor, ConsoleLiveState } from "./types";
import styles from "./DeveloperConsole.module.css";

const team: Array<{ author: Exclude<ConsoleAuthor, "SYSTEM">; role: string; responsibility: string; workerCode?: string }> = [
  { author: "BENJADMIN", role: "Emberi rendszervezető", responsibility: "Végső döntés, prioritás, approval és fejlesztési irány." },
  { author: "BENAI", role: "AI koordinátor", responsibility: "Task-bontás, worker-kiosztás, acceptance- és munkasorrend." },
  { author: "ARMINAI", role: "Belső kódmérnök · frontend / alkalmazás", responsibility: "UI, komponens, alkalmazáslogika, responsive acceptance.", workerCode: "ARMINAI" },
  { author: "JAZMINAI", role: "Belső kódmérnök · backend / adatbázis", responsibility: "API, DB, migráció, backend biztonság és teszt.", workerCode: "JAZMINAI" },
  { author: "OUTMINAI", role: "Partner fejlesztési worker", responsibility: "PARTNER plane, partner build/release/handoff, internal default DENY.", workerCode: "OUTMINAI" },
  { author: "MFORGE", role: "Külső Coding Worker", responsibility: "Frontend, backend, API, implementáció és célzott refaktor. DEV-only, saját worktree/scope." },
  { author: "VGUARD", role: "Külső Review & Quality Worker", responsibility: "Független review, security, regresszió, teszt és minőségi ellenőrzés. M.Forge worktree write nélkül." },
];

export default function TeamQuickDrawer({ open, onClose, live }: { open: boolean; onClose: () => void; live: ConsoleLiveState | null }) {
  if (!open) return null;
  return <div className={styles.drawerLayer} role="presentation"><button type="button" className={styles.drawerBackdrop} aria-label="Csapat bezárása" onClick={onClose} /><aside className={styles.drawer} aria-label="BENJADMIN csapat"><header className={styles.drawerHeader}><div><span>BENJADMIN CSAPAT</span><strong>Szerepek és élő állapot</strong></div><button type="button" onClick={onClose} aria-label="Bezárás"><X size={18} /></button></header><div className={styles.drawerBody}><div className={styles.teamQuickList}>{team.map((item) => { const worker = item.workerCode ? live?.workers.find((candidate) => candidate.code === item.workerCode) : null; const autoPresence = item.workerCode ? live?.workerPresence?.find((candidate) => candidate.workerCode === item.workerCode && candidate.active) || null : null; const active = worker ? Boolean(autoPresence) || Boolean(live?.tasks.some((task) => (task.assigned_worker_id === worker.id || task.requested_worker_id === worker.id) && ["claimed", "in_progress", "testing"].includes(task.status))) : item.author === "BENAI" ? Boolean(live?.tasks.some((task) => !task.assigned_worker_id && !task.requested_worker_id && ["queued", "ready"].includes(task.status))) : item.author === "BENJADMIN"; const blocked = worker ? live?.tasks.some((task) => (task.assigned_worker_id === worker.id || task.requested_worker_id === worker.id) && task.status === "blocked") : false; const status = blocked ? "blocked" : active ? "working" : "idle"; return <article key={item.author} data-auto-presence={autoPresence ? "true" : "false"}><BenjadminAvatar member={item.author} size="head" status={status} /><div><strong>{item.author === "BENJADMIN" ? "BenjAdmin · VEZETŐ" : memberName(item.author)}</strong><span>{item.role}</span><p>{autoPresence?.summary || item.responsibility}</p><small>{blocked ? "BLOKKOLVA" : autoPresence ? "AKTÍV · AUTO" : active ? "AKTÍV" : "INAKTÍV"}{worker?.status ? ` · engine: ${worker.status}` : ""}</small></div></article>; })}</div></div></aside></div>;
}
