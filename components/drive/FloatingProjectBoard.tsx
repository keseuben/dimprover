"use client";

import Link from "next/link";
import {
  Archive,
  Box,
  ChevronsLeft,
  Clock3,
  FolderKanban,
  FolderOpen,
  Home,
  Inbox,
  PackageCheck,
  Pin,
  Plus,
  Settings,
  Star,
} from "lucide-react";
import { DRIVE_VERSION_DISPLAY, type DriveNavigationTarget } from "./driveBuildInfo";
import type { DriveProject, DriveStorageQuota } from "./driveTypes";
import styles from "./DriveWorkspace.module.css";

type DriveProvisionedFolder = {
  id: string;
  name?: string;
  path?: string;
};

type DriveProvisioningInfo = {
  version: string;
  projectId: string;
  ready: boolean;
  folderCount: number;
  incomingDropFolder: DriveProvisionedFolder | null;
  pilotFolder: DriveProvisionedFolder | null;
};

type DriveProvisioningStatus = "checking" | "ready" | "repair-required" | "error";

type Props = {
  projects: DriveProject[];
  selectedProjectId: string;
  pinned: boolean;
  activeTarget: DriveNavigationTarget;
  onProjectChange: (projectId: string) => void;
  onCreateProject: () => void;
  onClose: () => void;
  onTogglePinned: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onNavigate: (target: DriveNavigationTarget) => void;
  provisioning?: DriveProvisioningInfo | null;
  provisioningStatus?: DriveProvisioningStatus;
  provisioningError?: string | null;
  provisioningNotice?: string | null;
  provisioningRepairBusy?: boolean;
  canRepairProvisioning?: boolean;
  onRepairProvisioning?: () => void | Promise<void>;
  storageQuota?: DriveStorageQuota | null;
  storageLoading?: boolean;
  storageError?: string | null;
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

export default function FloatingProjectBoard({
  projects,
  selectedProjectId,
  pinned,
  activeTarget,
  onProjectChange,
  onCreateProject,
  onClose,
  onTogglePinned,
  onHoverEnter,
  onHoverLeave,
  onNavigate,
  provisioning = null,
  provisioningStatus = "checking",
  provisioningError = null,
  provisioningNotice = null,
  provisioningRepairBusy = false,
  canRepairProvisioning = false,
  onRepairProvisioning,
  storageQuota = null,
  storageLoading = false,
  storageError = null,
}: Props) {
  const storagePercent = storageQuota ? Math.max(0, Math.min(100, storageQuota.usagePercent)) : 0;
  const storageValue = storageLoading
    ? "Betöltés…"
    : storageError
      ? "Nem elérhető"
      : storageQuota
        ? `${formatBytes(storageQuota.occupiedBytes)} / ${formatBytes(storageQuota.quotaBytes)}`
        : "—";

  const navClass = (target: DriveNavigationTarget) =>
    activeTarget === target ? styles.boardActive : "";

  return (
    <aside
      className={styles.board}
      aria-label="DIMPRO Drive navigációs board"
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      data-drive-navigation-surface="true"
    >
      <div className={styles.boardInner}>
        <header className={styles.boardHeader}>
          <div className={styles.boardTitle}>
            <FolderKanban size={17} />
            <div className={styles.boardTitleMeta}>
              <strong>DIMPRO Drive</strong>
              <small>{DRIVE_VERSION_DISPLAY}</small>
            </div>
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
              <div><span>Környezet séma</span><strong>{provisioning.version}</strong></div>
              <div><span>Mappák</span><strong>{provisioning.folderCount}</strong></div>
              <div><span>Beérkező Drop</span><strong>{provisioning.incomingDropFolder ? "Elérhető" : "Nincs"}</strong></div>
              {provisioning.pilotFolder ? <div><span>PILOT</span><strong>Elérhető</strong></div> : null}
            </div>
          ) : null}

          {provisioningStatus === "repair-required" ? (
            <div className={`${styles.provisioningMessage} ${styles.provisioningWarning}`}>
              A Drive projektkörnyezet javítást igényel.
            </div>
          ) : null}

          {provisioningStatus === "error" && provisioningError ? (
            <div className={`${styles.provisioningMessage} ${styles.provisioningError}`}>{provisioningError}</div>
          ) : null}

          {provisioningNotice ? (
            <div className={`${styles.provisioningMessage} ${styles.provisioningSuccess}`}>{provisioningNotice}</div>
          ) : null}

          {canRepairProvisioning && (provisioningStatus === "repair-required" || provisioningStatus === "error") ? (
            <button type="button" className={styles.provisioningRepairButton} disabled={provisioningRepairBusy} onClick={() => { void onRepairProvisioning?.(); }}>
              {provisioningRepairBusy ? "Javítás…" : "Javítás / újrapróbálás"}
            </button>
          ) : null}
        </section>

        <span className={styles.boardSectionLabel}>Drive</span>
        <div className={styles.boardNav}>
          <button type="button" className={styles.boardNavDisabled} disabled title="Kezdőlap – hamarosan">
            <Home size={16} /> <span>Kezdőlap</span><small>hamarosan</small>
          </button>
          <button type="button" className={navClass("documents")} onClick={() => onNavigate("documents")}>
            <FolderOpen size={16} /> Dokumentumtár
          </button>
          <button type="button" className={styles.boardNavDisabled} disabled title="Legutóbbi – hamarosan">
            <Clock3 size={16} /> <span>Legutóbbi</span><small>hamarosan</small>
          </button>
          <button type="button" className={navClass("favorites")} onClick={() => onNavigate("favorites")}>
            <Star size={16} /> Kedvencek
          </button>
          <button type="button" className={navClass("incoming")} onClick={() => onNavigate("incoming")}>
            <Inbox size={16} /> Beérkező Drop
          </button>
          <button type="button" className={styles.boardNavDisabled} disabled title="Kiadások – külön Drive nézet hamarosan">
            <PackageCheck size={16} /> <span>Kiadások</span><small>hamarosan</small>
          </button>
          <button type="button" className={navClass("boxes")} onClick={() => onNavigate("boxes")}>
            <Box size={16} /> CsomagBOX
          </button>
          <button type="button" className={styles.boardNavDisabled} disabled title="Lomtár nézet – hamarosan">
            <Archive size={16} /> <span>Lomtár</span><small>hamarosan</small>
          </button>
        </div>

        <span className={styles.boardSectionLabel}>Rendszer</span>
        <div className={styles.boardNav}>
          <Link href="/beallitasok"><Settings size={16} /> Beállítások</Link>
        </div>

        <div className={styles.storageCard}>
          <div className={styles.storageRow}><span>Tárhely</span><strong>{storageValue}</strong></div>
          <div
            className={styles.storageBar}
            role="progressbar"
            aria-label="Drive tárhelyhasználat"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(storagePercent)}
          >
            <div className={styles.storageBarFill} style={{ width: `${storagePercent}%` }} />
          </div>
          {storageError ? <div className={styles.storageError}>{storageError}</div> : null}
          <button type="button" className={styles.storageButton}>Tárhely bővítése</button>
        </div>
      </div>
    </aside>
  );
}
