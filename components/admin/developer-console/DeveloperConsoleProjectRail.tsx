"use client";

import { AlertTriangle, CircleDot, FolderKanban, Layers3, Map as MapIcon, PauseCircle } from "lucide-react";
import { isTechnicalDevelopmentTask, resolveDevelopmentMapNode } from "@/app/lib/dev-center/development-map";
import { resolveTaskDevelopmentContext } from "@/app/lib/dev-center/development-context";
import type { ConsoleLiveState, LiveTask } from "./types";
import styles from "./DeveloperConsole.module.css";

function taskTone(status: string) {
  if (status === "blocked") return styles.taskBlocked;
  if (["in_progress", "testing", "claimed"].includes(status)) return styles.taskWorking;
  if (["queued", "ready"].includes(status)) return styles.taskWaiting;
  return "";
}

function stage(task: LiveTask) {
  return resolveTaskDevelopmentContext({ projectId: task.project_id, title: task.title, description: task.description, status: task.status, scope: task.scope, metadata: task.metadata });
}

function mapPath(task: LiveTask) {
  const node = resolveDevelopmentMapNode({ projectId: task.project_id, title: task.title, description: task.description, status: task.status, scope: task.scope, metadata: task.metadata });
  const context = stage(task);
  return node ? `${node.projectName} › ${node.moduleName}` : `${context.mainModule} › ${context.moduleName}`;
}

export default function DeveloperConsoleProjectRail({ live, selectedProjectId, onSelectProject }: { live: ConsoleLiveState | null; selectedProjectId: string; onSelectProject: (id: string) => void }) {
  const projects = live?.projects || [];
  const tasks = live?.tasks || [];
  const selectedTasks = tasks.filter((task) => !selectedProjectId || task.project_id === selectedProjectId);
  const openTasks = selectedTasks.filter((task) => !["completed", "cancelled"].includes(task.status));
  const active = openTasks.filter((task) => ["claimed", "in_progress", "testing"].includes(task.status)).length;
  const waiting = openTasks.filter((task) => ["queued", "ready"].includes(task.status)).length;
  const blocked = openTasks.filter((task) => task.status === "blocked").length;
  const technicalCount = openTasks.filter(isTechnicalDevelopmentTask).length;
  const developmentCards = openTasks
    .filter((task) => !isTechnicalDevelopmentTask(task))
    .sort((a, b) => Number(["claimed", "in_progress", "testing"].includes(b.status)) - Number(["claimed", "in_progress", "testing"].includes(a.status)) || Number(b.priority || 0) - Number(a.priority || 0) || String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
    .slice(0, 8);

  function openMap() {
    window.dispatchEvent(new CustomEvent("benjadmin:development-map-open"));
  }

  return (
    <aside className={styles.projectRail} aria-label="Projekt és fejlesztési térkép navigáció">
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
        <div><PauseCircle size={14} /><span>Vár</span><b>{waiting}</b></div>
        <div className={blocked ? styles.counterDanger : ""}><AlertTriangle size={14} /><span>Blokk</span><b>{blocked}</b></div>
      </section>
      <div className={styles.mapRailHeader}>
        <div className={styles.railSectionTitle}><Layers3 size={14} /> AKTÍV FEJLESZTÉSEK</div>
        <button type="button" data-testid="benjadmin-open-development-map" onClick={openMap} title="Fejlesztési Térkép · Ctrl+Alt+2"><MapIcon size={13} /> Térkép</button>
      </div>
      <div className={styles.taskList} data-testid="benjadmin-compact-development-map">
        {developmentCards.map((task) => {
          const context = stage(task);
          return <article key={task.id} className={`${styles.taskItem} ${styles.mapTaskItem} ${taskTone(task.status)}`} data-map-task={task.id}>
            <div><strong>{task.title}</strong><span className={styles.mapTaskPath}>{mapPath(task)}</span><span className={styles.mapTaskStage}>6/{context.workStageIndex} · {context.workStageLabel}</span></div>
            <CircleDot size={13} />
          </article>;
        })}
        {!developmentCards.length ? <div className={styles.railEmpty}>Nincs aktív, vezetői szintű fejlesztés ebben a nézetben.</div> : null}
      </div>
      {technicalCount ? <button type="button" className={styles.technicalTaskSummary} onClick={openMap}><span>Technikai / acceptance taskok</span><b>{technicalCount}</b><small>a teljes térképen kezelhetők</small></button> : null}
    </aside>
  );
}
