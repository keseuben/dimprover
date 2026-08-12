"use client";

import { AlertTriangle, CheckCircle2, Clock3, Code2, GitCommitHorizontal, Hammer, ListChecks, ShieldCheck } from "lucide-react";
import BenjadminAvatar from "./BenjadminAvatar";
import type { ConsoleAuthor, ConsoleLiveState, LiveTask, RuntimeContext } from "./types";
import styles from "./DeveloperConsole.module.css";

const workers: Array<{ code: string; author: ConsoleAuthor; fallbackName: string }> = [
  { code: "ARMINAI", author: "ARMINAI", fallbackName: "Ármin-AI" },
  { code: "JAZMINAI", author: "JAZMINAI", fallbackName: "Jázmin-AI" },
];

function elapsed(now: number, value?: string | null) {
  if (!value) return "—";
  const start = new Date(value).getTime();
  if (!Number.isFinite(start)) return "—";
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function activeTaskFor(workerId: string | undefined, tasks: LiveTask[]) {
  if (!workerId) return null;
  return tasks.find((task) => (task.assigned_worker_id === workerId || task.requested_worker_id === workerId) && ["claimed", "in_progress", "testing", "blocked", "ready", "queued"].includes(task.status)) || null;
}

function workerStatus(task: LiveTask | null) {
  if (!task) return { status: "idle" as const, label: "INAKTÍV" };
  if (task.status === "blocked") return { status: "blocked" as const, label: "BLOKKOLVA" };
  if (["queued", "ready"].includes(task.status)) return { status: "waiting" as const, label: "VÁRAKOZIK" };
  return { status: "working" as const, label: "DOLGOZIK" };
}

export default function LiveWorkPanel({ live, now, context }: { live: ConsoleLiveState | null; now: number; context: RuntimeContext | null }) {
  const tasks = live?.tasks || [];
  const sessions = live?.sessions || [];
  const builds = live?.builds || [];
  const pendingApprovals = (live?.approvals || []).filter((item) => item.status === "pending");
  const genericQueue = tasks.filter((task) => !task.requested_worker_id && !task.assigned_worker_id && ["queued", "ready"].includes(task.status));

  return (
    <aside className={styles.livePanel} aria-label="Élő fejlesztési munka">
      <header><Code2 size={17} /><div><span>ÉLŐ MUNKA</span><strong>Worker / task / build</strong></div></header>
      <section className={styles.benAiCoordinator}>
        <BenjadminAvatar member="BENAI" size="task" status={genericQueue.length ? "waiting" : "idle"} eager />
        <div><strong>Ben-AI</strong><span>KOORDINÁTOR · {context?.aiBridge?.mode === "OPENAI_RESPONSES" ? "API HÍD" : "KÉZI CHATGPT HÍD"}</span><p>{genericQueue.length ? `${genericQueue.length} kiosztásra váró általános task` : context?.aiBridge?.executorConfigured ? "A végrehajtó híd konfigurálva." : "Natív worker executor még nincs bekötve."}</p></div>
      </section>
      <div className={styles.workerCards}>
        {workers.map((item) => {
          const worker = live?.workers.find((candidate) => candidate.code === item.code);
          const task = activeTaskFor(worker?.id, tasks);
          const session = sessions.find((candidate) => candidate.worker_id === worker?.id && candidate.status !== "closed");
          const build = builds.find((candidate) => candidate.task_id === task?.id || (session?.id && candidate.session_id === session.id));
          const state = workerStatus(task);
          return (
            <article key={item.code} className={`${styles.workerCard} ${state.status === "blocked" ? styles.workerBlocked : ""}`}>
              <div className={styles.workerHead}><BenjadminAvatar member={item.author} size="task" status={state.status} eager /><div><strong>{worker?.name || item.fallbackName}</strong><span>{state.label} {session ? `· ${elapsed(now, session.opened_at)}` : ""}</span></div></div>
              <p>{task?.title || "Nincs aktív feladat."}</p>
              <div className={styles.workerFacts}>
                <span><Clock3 size={13} /> {session?.handshake_stage || "Nincs aktív session"}</span>
                <span><Hammer size={13} /> {build ? `${build.run_type || "build"}: ${build.status}` : "Build: nincs"}</span>
                <span><GitCommitHorizontal size={13} /> {build?.git_commit ? build.git_commit.slice(0, 10) : task?.branch_name || "Git: —"}</span>
              </div>
            </article>
          );
        })}
      </div>
      <section className={styles.executorReadinessBox} data-ready={context?.executorReadiness?.ready ? "true" : "false"}>
        <strong>VÉGREHAJTÓ KAPU</strong>
        <span>{context?.executorReadiness?.repositoryReady ? "Repo ✓" : "Repo ✕"} · {context?.executorReadiness?.baselineReady ? "Baseline ✓" : "Baseline ✕"} · {context?.executorReadiness?.providerConfigured ? "AI provider ✓" : "AI provider —"} · {context?.executorReadiness?.executorConfigured ? "Executor ✓" : "Executor —"}</span>
        <small>{context?.executorReadiness?.ready ? "Natív worker indításra kész." : context?.executorReadiness?.blockers?.[0] || "Végrehajtási állapot ellenőrzése…"}</small>
      </section>
      <section className={`${styles.approvalBox} ${pendingApprovals.length ? styles.approvalWaiting : ""}`}>
        {pendingApprovals.length ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}
        <div><strong>{pendingApprovals.length ? `${pendingApprovals.length} döntés / jóváhagyás vár` : "Nincs függő jóváhagyás"}</strong><span>{pendingApprovals.length ? "BENJADMIN beavatkozás szükséges." : "A Control Plane approval queue tiszta."}</span></div>
      </section>
      <section className={styles.latestBuilds}>
        <div className={styles.railSectionTitle}><ListChecks size={14} /> LEGUTÓBBI ELLENŐRZÉSEK</div>
        {(builds || []).slice(0, 6).map((build) => <div key={build.id}><span className={build.status === "passed" ? styles.buildPass : build.status === "failed" ? styles.buildFail : styles.buildRunning}>{build.status === "passed" ? <CheckCircle2 size={12} /> : build.status === "failed" ? <AlertTriangle size={12} /> : <Hammer size={12} />}</span><strong>{build.run_type || "build"}</strong><small>{build.summary || build.build_id || build.status}</small></div>)}
        {!builds.length ? <p className={styles.railEmpty}>Nincs build/teszt adat.</p> : null}
      </section>
    </aside>
  );
}
