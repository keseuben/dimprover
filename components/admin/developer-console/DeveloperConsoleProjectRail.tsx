"use client";

import { AlertTriangle, CheckCircle2, CircleDot, FolderKanban, ListTodo, PauseCircle } from "lucide-react";
import type { ConsoleLiveState } from "./types";
import styles from "./DeveloperConsole.module.css";

function taskTone(status: string) {
  if (status === "blocked") return styles.taskBlocked;
  if (["in_progress", "testing", "claimed"].includes(status)) return styles.taskWorking;
  if (["queued", "ready"].includes(status)) return styles.taskWaiting;
  if (status === "completed") return styles.taskDone;
  return "";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: "Sorban",
    ready: "Kész indításra",
    claimed: "Átvéve",
    in_progress: "Folyamatban",
    testing: "Tesztelés",
    blocked: "Blokkolt",
    completed: "Kész",
    cancelled: "Visszavonva",
  };
  return labels[status] || status;
}

export default function DeveloperConsoleProjectRail({ live, selectedProjectId, onSelectProject }: { live: ConsoleLiveState | null; selectedProjectId: string; onSelectProject: (id: string) => void }) {
  const projects = live?.projects || [];
  const tasks = live?.tasks || [];
  const selectedTasks = tasks.filter((task) => !selectedProjectId || task.project_id === selectedProjectId);
  const active = selectedTasks.filter((task) => ["claimed", "in_progress", "testing"].includes(task.status)).length;
  const waiting = selectedTasks.filter((task) => ["queued", "ready"].includes(task.status)).length;
  const blocked = selectedTasks.filter((task) => task.status === "blocked").length;

  return (
    <aside className={styles.projectRail} aria-label="Projekt és feladat navigáció">
      <header><FolderKanban size={17} /><div><span>PROJEKT</span><strong>Fejlesztési munkatér</strong></div></header>
      <button type="button" className={`${styles.projectItem} ${!selectedProjectId ? styles.projectSelected : ""}`} onClick={() => onSelectProject("")}><span>Összes fejlesztés</span><b>{tasks.length}</b></button>
      <div className={styles.projectList}>
        {projects.map((project) => {
          const count = tasks.filter((task) => task.project_id === project.id && !["completed", "cancelled"].includes(task.status)).length;
          return <button type="button" key={project.id} className={`${styles.projectItem} ${selectedProjectId === project.id ? styles.projectSelected : ""}`} onClick={() => onSelectProject(project.id)}><span>{project.name}</span><b>{count}</b></button>;
        })}
      </div>
      <section className={styles.taskCounters}>
        <div><CircleDot size={14} /><span>Aktív</span><b>{active}</b></div>
        <div><PauseCircle size={14} /><span>Várakozik</span><b>{waiting}</b></div>
        <div className={blocked ? styles.counterDanger : ""}><AlertTriangle size={14} /><span>Blokkolt</span><b>{blocked}</b></div>
      </section>
      <div className={styles.railSectionTitle}><ListTodo size={14} /> FELADATOK</div>
      <div className={styles.taskList}>
        {selectedTasks.slice(0, 14).map((task) => (
          <article key={task.id} className={`${styles.taskItem} ${taskTone(task.status)}`}>
            <div><strong>{task.title}</strong><span>{statusLabel(task.status)} · P{task.priority ?? 50}</span></div>
            {task.status === "completed" ? <CheckCircle2 size={14} /> : task.status === "blocked" ? <AlertTriangle size={14} /> : <CircleDot size={14} />}
          </article>
        ))}
        {!selectedTasks.length ? <div className={styles.railEmpty}>Nincs feladat ebben a nézetben.</div> : null}
      </div>
    </aside>
  );
}
