"use client";

import { ExternalLink, ShieldCheck } from "lucide-react";
import BenjadminAvatar from "./BenjadminAvatar";
import type { ConsoleLiveState, ConsoleMessage } from "./types";
import styles from "./DeveloperConsole.module.css";

function formatTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("hu-HU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}

export default function OutminPartnerBar({ live, messages }: { live: ConsoleLiveState | null; messages: ConsoleMessage[] }) {
  const worker = live?.workers.find((item) => item.code === "OUTMINAI");
  const activeTasks = (live?.tasks || []).filter((task) => task.requested_worker_id === worker?.id || task.assigned_worker_id === worker?.id).filter((task) => !["completed", "cancelled", "closed"].includes(task.status));
  const recentMessage = [...messages].reverse().find((message) => message.author === "OUTMINAI");
  const blocked = activeTasks.some((task) => task.status === "blocked") || recentMessage?.level === "error";
  const status = blocked ? "blocked" : activeTasks.length ? "working" : "idle";
  return (
    <section className={`${styles.outminBar} ${blocked ? styles.outminBlocked : ""}`} aria-label="Outmin-AI partner fejlesztési sáv">
      <div className={styles.outminIdentity}><BenjadminAvatar member="OUTMINAI" size="task" status={status} eager /><div><strong>OUTMIN-AI</strong><span>PARTNER FEJLESZTÉSI SÍK · ALAPÉRTELMEZETT TILTÁS</span></div></div>
      <div className={styles.outminSummary}>
        <span><ShieldCheck size={14} /> {activeTasks.length ? `${activeTasks.length} aktív partnerfeladat` : "Nincs aktív partnerfeladat"}</span>
        <span>{recentMessage ? `${recentMessage.summary.slice(0, 130)} · ${formatTime(recentMessage.createdAt)}` : "Legutóbbi partneresemény nincs a jelenlegi ablakban."}</span>
      </div>
      <a href="/admin#partner" target="_blank" rel="noreferrer" title="Partner fejlesztések megnyitása"><ExternalLink size={15} /> Partner nézet</a>
    </section>
  );
}
