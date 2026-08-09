"use client";

import Link from "next/link";
import {
  Archive,
  BarChart3,
  CalendarDays,
  ChevronsLeft,
  FolderKanban,
  Settings,
  Users,
} from "lucide-react";
import {
  D6_MODULES,
  projectGateModuleHref,
  type D6ModuleId,
} from "@/app/lib/project-gate/d6Modules";
import styles from "./ProjectGateShell.module.css";

type ProjectOption = {
  id: string;
  code: string;
  name: string;
};

type Props = {
  projectId: string;
  projectCode: string;
  projectName: string;
  projectStatus: string;
  currentPhase: string;
  progressPercent: number;
  activeMemberCount: number;
  activeModuleId: D6ModuleId;
  projects: ProjectOption[];
  onProjectChange: (projectId: string) => void;
  onClose: () => void;
};

export default function ProjectGateProjectBoard({
  projectId,
  projectCode,
  projectName,
  projectStatus,
  currentPhase,
  progressPercent,
  activeMemberCount,
  activeModuleId,
  projects,
  onProjectChange,
  onClose,
}: Props) {
  const projectOptions = projects.length
    ? projects
    : [{ id: projectId, code: projectCode, name: projectName }];

  return (
    <aside className={styles.board} aria-label="DIMPRO Projektkapu navigációs board">
      <div className={styles.boardInner}>
        <header className={styles.boardHeader}>
          <div className={styles.boardTitle}>
            <FolderKanban size={17} />
            <div>
              <strong>DIMPRO Projektkapu</strong>
              <span>D6 Core</span>
            </div>
          </div>
          <button className={styles.boardClose} type="button" onClick={onClose} title="Board bezárása" aria-label="Board bezárása">
            <ChevronsLeft size={17} />
          </button>
        </header>

        <span className={styles.boardSectionLabel}>Projekt</span>
        <select
          className={styles.projectSelect}
          value={projectId}
          onChange={(event) => onProjectChange(event.target.value)}
          aria-label="Projekt kiválasztása"
        >
          {projectOptions.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>

        <span className={styles.boardSectionLabel}>D6 modulok</span>
        <div className={styles.boardNav}>
          {D6_MODULES.map((item) => {
            const Icon = item.Icon;
            return (
              <Link
                key={item.id}
                href={projectGateModuleHref(projectId, item.id)}
                className={activeModuleId === item.id ? styles.boardActive : ""}
              >
                <Icon size={16} />
                <span>
                  <strong>{item.hungarianName}</strong>
                  <small>{item.brandName}</small>
                </span>
              </Link>
            );
          })}
        </div>

        <span className={styles.boardSectionLabel}>Projektmunka</span>
        <div className={styles.boardNav}>
          <Link href="/naptar"><CalendarDays size={16} /> Naptár</Link>
          <Link href={`/projektkapu/project/${encodeURIComponent(projectId)}/reports`}><BarChart3 size={16} /> Jelentések</Link>
          <Link href={`/projektkapu/project/${encodeURIComponent(projectId)}/settings`}><Users size={16} /> Résztvevők és projektadatok</Link>
          <Link href={`/projektkapu/project/${encodeURIComponent(projectId)}/reports`}><Archive size={16} /> Projektarchívum</Link>
          <Link href={`/projektkapu/project/${encodeURIComponent(projectId)}/settings`}><Settings size={16} /> Beállítások</Link>
        </div>

        <div className={styles.boardProjectCard}>
          <div className={styles.boardProjectTop}>
            <span>{projectCode}</span>
            <strong>{progressPercent}%</strong>
          </div>
          <strong className={styles.boardProjectName}>{projectName}</strong>
          <span className={styles.boardProjectPhase}>{currentPhase}</span>
          <div className={styles.boardProgress}><i style={{ width: `${progressPercent}%` }} /></div>
          <div className={styles.boardProjectMeta}>
            <span className={projectStatus === "ACTIVE" ? styles.boardStatusActive : ""}>{projectStatus}</span>
            <small>{activeMemberCount} aktív résztvevő</small>
          </div>
        </div>
      </div>
    </aside>
  );
}
