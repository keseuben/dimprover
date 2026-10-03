"use client";

import Link from "next/link";
import {
  Archive,
  Bell,
  Box,
  Clock3,
  FolderOpen,
  HardDrive,
  HelpCircle,
  Home,
  Inbox,
  PackageCheck,
  PanelLeftOpen,
  Settings,
  Star,
} from "lucide-react";
import { DRIVE_VERSION_DISPLAY, type DriveNavigationTarget } from "./driveBuildInfo";
import styles from "./DriveWorkspace.module.css";

type Props = {
  boardOpen: boolean;
  activeTarget: DriveNavigationTarget;
  onToggleBoard: () => void;
  onHoverOpen: () => void;
  onHoverLeave: () => void;
  onNavigate: (target: DriveNavigationTarget) => void;
};

export default function DriveNavigationRail({
  boardOpen,
  activeTarget,
  onToggleBoard,
  onHoverOpen,
  onHoverLeave,
  onNavigate,
}: Props) {
  const itemClass = (target: DriveNavigationTarget) =>
    `${styles.railButton} ${activeTarget === target ? styles.railActive : ""}`;

  return (
    <nav
      className={styles.rail}
      aria-label="DIMPRO Drive fő navigáció"
      onMouseEnter={onHoverOpen}
      onMouseLeave={onHoverLeave}
      data-drive-navigation-surface="true"
    >
      <button
        type="button"
        className={styles.brandMark}
        onClick={onToggleBoard}
        title={boardOpen ? "Bal oldali board összecsukása" : "Bal oldali board megnyitása"}
        aria-label={boardOpen ? "Bal oldali board összecsukása" : "Bal oldali board megnyitása"}
      >
        <HardDrive size={21} />
      </button>

      <button type="button" className={styles.railButton} onClick={onToggleBoard} title="Drive navigációs board">
        <PanelLeftOpen size={18} />
      </button>

      <button type="button" className={`${styles.railButton} ${styles.railDisabled}`} disabled title="Kezdőlap – hamarosan">
        <Home size={18} />
      </button>
      <button type="button" className={itemClass("documents")} onClick={() => onNavigate("documents")} title="Dokumentumtár">
        <FolderOpen size={18} />
      </button>
      <button type="button" className={`${styles.railButton} ${styles.railDisabled}`} disabled title="Legutóbbi – hamarosan">
        <Clock3 size={18} />
      </button>
      <button type="button" className={itemClass("favorites")} onClick={() => onNavigate("favorites")} title="Kedvencek">
        <Star size={18} />
      </button>
      <button type="button" className={itemClass("incoming")} onClick={() => onNavigate("incoming")} title="Beérkező Drop">
        <Inbox size={18} />
      </button>
      <button type="button" className={`${styles.railButton} ${styles.railDisabled}`} disabled title="Kiadások – külön Drive nézet hamarosan">
        <PackageCheck size={18} />
      </button>
      <button type="button" className={itemClass("boxes")} onClick={() => onNavigate("boxes")} title="CsomagBOX">
        <Box size={18} />
      </button>
      <button type="button" className={`${styles.railButton} ${styles.railDisabled}`} disabled title="Lomtár nézet – hamarosan">
        <Archive size={18} />
      </button>

      <div className={styles.railSpacer} />
      <button type="button" className={styles.railButton} title="Értesítések">
        <Bell size={18} />
      </button>
      <button type="button" className={styles.railButton} title="Súgó">
        <HelpCircle size={18} />
      </button>
      <Link href="/beallitasok" className={styles.railLink} title="Beállítások">
        <Settings size={18} />
      </Link>
      <span className={styles.railVersion} title={DRIVE_VERSION_DISPLAY}>{DRIVE_VERSION_DISPLAY}</span>
    </nav>
  );
}
