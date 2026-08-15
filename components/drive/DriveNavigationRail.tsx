"use client";

import Link from "next/link";
import {
  Bell,
  CalendarDays,
  CheckSquare2,
  FolderKanban,
  FolderOpen,
  HelpCircle,
  MessageSquareText,
  PanelLeftOpen,
  Settings,
  Star,
  Users,
} from "lucide-react";
import styles from "./DriveWorkspace.module.css";

type Props = {
  boardOpen: boolean;
  onToggleBoard: () => void;
  onHoverOpen: () => void;
  onHoverLeave: () => void;
};

export default function DriveNavigationRail({
  boardOpen,
  onToggleBoard,
  onHoverOpen,
  onHoverLeave,
}: Props) {
  return (
    <nav
      className={styles.rail}
      aria-label="DIMPRO Drive fő navigáció"
      onMouseEnter={onHoverOpen}
      onMouseLeave={onHoverLeave}
    >
      <button
        type="button"
        className={styles.brandMark}
        onClick={onToggleBoard}
        title={boardOpen ? "Bal oldali board összecsukása" : "Bal oldali board megnyitása"}
        aria-label={boardOpen ? "Bal oldali board összecsukása" : "Bal oldali board megnyitása"}
      >
        <FolderKanban size={21} />
      </button>

      <button type="button" className={styles.railButton} onClick={onToggleBoard} title="Navigációs board">
        <PanelLeftOpen size={18} />
      </button>
      <Link href="/drive" className={`${styles.railLink} ${styles.railActive}`} title="Drive">
        <FolderOpen size={18} />
      </Link>
      <Link href="/projektkapu" className={styles.railLink} title="Projektkapu">
        <FolderKanban size={18} />
      </Link>
      <Link href="/projektkapu" className={styles.railLink} title="Kedvencek">
        <Star size={18} />
      </Link>
      <Link href="/projektkapu" className={styles.railLink} title="Feladatok">
        <CheckSquare2 size={18} />
      </Link>
      <Link href="/projektkapu" className={styles.railLink} title="Egyeztetések">
        <MessageSquareText size={18} />
      </Link>
      <Link href="/naptar" className={styles.railLink} title="Naptár">
        <CalendarDays size={18} />
      </Link>
      <Link href="/projektkapu" className={styles.railLink} title="Partnerek">
        <Users size={18} />
      </Link>

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
      <span className={styles.railVersion}>DRIVE 1.0 RC</span>
    </nav>
  );
}
