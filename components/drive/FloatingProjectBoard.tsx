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
  Plus,
  Settings,
  UploadCloud,
} from "lucide-react";
import type { DriveProject } from "./driveTypes";
import styles from "./DriveWorkspace.module.css";

type DriveProvisioningInfo = {
  version: string;
  projectId: string;
  ready: boolean;
  folderCount: number;
  incomingDropFolder: unknown | null;
  pilotFolder: unknown | null;
};

type DriveProvisioningStatus = "checking" | "ready" | "repair-required" | "error";

type Props = {
  projects: DriveProject[];
  selectedProjectId: string;
  pinned: boolean;
  onProjectChange: (projectId: string) => void;
  onCreateProject: () => void;
  onClose: () => void;
  onTogglePinned: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  provisioning?: DriveProvisioningInfo | null;
  provisioningStatus?: DriveProvisioningStatus;
  provisioningError?: string | null;
  provisioningNotice?: string | null;
  provisioningRepairBusy?: boolean;
  canRepairProvisioning?: boolean;
  onRepairProvisioning?: () => void | Promise<void>;
};

export default function FloatingProjectBoard({
  projects,
  selectedProjectId,
  pinned,
  onProjectChange,
  onCreateProject,
  onClose,
  onTogglePinned,
  onHoverEnter,
  onHoverLeave,
  provisioning = null,
  provisioningStatus = "checking",
  provisioningError = null,
  provisioningNotice = null,
  provisioningRepairBusy = false,
  canRepairProvisioning = false,
  onRepairProvisioning,
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
        <button type="button" className={styles.projectCreateButton} onClick={onCreateProject}>
          <Plus size={14} /> Új projekt
        </button>

        <section className={styles.provisioningCard} aria-label="Drive projektkörnyezet">
          <div className={styles.provisioningCardHeader}>
            <strong>Drive projektkörnyezet</strong>
            <span className={styles.provisioningStatusBadge + " " + (
              provisioningStatus === "ready"
                ? styles.provisioningStatusReady
                : provisioningStatus === "repair-required"
                  ? styles.provisioningStatusWarning
                  : provisioningStatus === "error"
                    ? styles.provisioningStatusError
                    : styles.provisioningStatusChecking
            )}>
              {provisioningStatus === "ready"
                ? "Kész"
                : provisioningStatus === "repair-required"
                  ? "Javítandó"
                  : provisioningStatus === "error"
                    ? "Hiba"
                    : "Ellenőrzés…"}
            </span>
          </div>

          {provisioningStatus === "checking" ? (
            <div className={styles.provisioningMessage}>A projektkörnyezet ellenőrzése folyamatban…</div>
          ) : null}

          {provisioning && provisioningStatus !== "checking" ? (
            <div className={styles.provisioningMeta}>
              <div><span>Verzió</span><strong>{provisioning.version}</strong></div>
              <div><span>Mappák</span><strong>{provisioning.folderCount}</strong></div>
              <div><span>Beérkező Drop</span><strong>{provisioning.incomingDropFolder ? "Elérhető" : "Nincs"}</strong></div>
              {provisioning.pilotFolder ? <div><span>PILOT</span><strong>Elérhető</strong></div> : null}
            </div>
          ) : null}

          {provisioningStatus === "repair-required" ? (
            <div className={styles.provisioningMessage + " " + styles.provisioningWarning}>
              A Drive projektkörnyezet javítást igényel.
            </div>
          ) : null}

          {provisioningStatus === "error" && provisioningError ? (
            <div className={styles.provisioningMessage + " " + styles.provisioningError}>{provisioningError}</div>
          ) : null}

          {provisioningNotice ? (
            <div className={styles.provisioningMessage + " " + styles.provisioningSuccess}>{provisioningNotice}</div>
          ) : null}

          {canRepairProvisioning && (provisioningStatus === "repair-required" || provisioningStatus === "error") ? (
            <button type="button" className={styles.provisioningRepairButton} disabled={provisioningRepairBusy} onClick={() => { void onRepairProvisioning?.(); }}>
              {provisioningRepairBusy ? "Javítás…" : "Javítás / újrapróbálás"}
            </button>
          ) : null}
        </section>

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
