"use client";

import Link from "next/link";
import {
  Archive,
  Box,
  CheckSquare2,
  ChevronsLeft,
  FileCheck2,
  FolderKanban,
  FolderOpen,
  MessageSquareText,
  PackageCheck,
  Pin,
  Settings,
  UploadCloud,
} from "lucide-react";
import type { DriveProject } from "./driveTypes";
import styles from "./DriveWorkspace.module.css";

type Props = {
  projects: DriveProject[];
  selectedProjectId: string;
  pinned: boolean;
  onProjectChange: (projectId: string) => void;
  onClose: () => void;
  onTogglePinned: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
};

export default function FloatingProjectBoard({
  projects,
  selectedProjectId,
  pinned,
  onProjectChange,
  onClose,
  onTogglePinned,
  onHoverEnter,
  onHoverLeave,
}: Props) {
  return (
    <aside
      className={styles.board}
      aria-label="DIMPRO Drive navigációs board"
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
    >
      <div className={styles.boardInner}>
        <header className={styles.boardHeader}>
          <div className={styles.boardTitle}>
            <FolderKanban size={17} />
            <strong>DIMPRO Drive</strong>
          </div>
          <div className={styles.boardHeaderActions}>
            <button
              className={`${styles.boardPin} ${pinned ? styles.boardPinActive : ""}`}
              type="button"
              onClick={onTogglePinned}
              title={pinned ? "Board rögzítésének feloldása" : "Board rögzítése"}
              aria-pressed={pinned}
            >
              <Pin size={15} />
            </button>
            <button className={styles.boardClose} type="button" onClick={onClose} title="Board bezárása">
              <ChevronsLeft size={17} />
            </button>
          </div>
        </header>

        <span className={styles.boardSectionLabel}>Projekt</span>
        <select
          className={styles.projectSelect}
          value={selectedProjectId}
          onChange={(event) => onProjectChange(event.target.value)}
          aria-label="Drive projekt kiválasztása"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>

        <div className={styles.boardNav}>
          <Link href="/drive"><FolderOpen size={16} /> Drive</Link>
          <Link href="/projektkapu"><FolderKanban size={16} /> Projektkapu</Link>
          <button type="button" className={styles.boardActive}><FolderOpen size={16} /> Dokumentumtár</button>
          <button type="button"><UploadCloud size={16} /> Fájlkapu</button>
          <button type="button"><PackageCheck size={16} /> Kiadások</button>
          <button type="button"><Box size={16} /> Csomagok</button>
        </div>

        <span className={styles.boardSectionLabel}>Projektmunka</span>
        <div className={styles.boardNav}>
          <Link href="/projektkapu"><MessageSquareText size={16} /> Egyeztetések</Link>
          <Link href="/projektkapu"><FileCheck2 size={16} /> Jóváhagyások</Link>
          <Link href="/projektkapu"><CheckSquare2 size={16} /> Feladatok</Link>
          <Link href="/projektkapu"><Archive size={16} /> Projektarchívum</Link>
          <Link href="/beallitasok"><Settings size={16} /> Beállítások</Link>
        </div>

        <div className={styles.storageCard}>
          <div className={styles.storageRow}><span>Tárhely</span><strong>68.4 GB / 250 GB</strong></div>
          <div className={styles.storageBar}><div className={styles.storageBarFill} /></div>
          <button type="button" className={styles.storageButton}>Tárhely bővítése</button>
        </div>
      </div>
    </aside>
  );
}
