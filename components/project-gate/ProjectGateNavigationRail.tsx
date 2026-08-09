"use client";

import Link from "next/link";
import {
  Bell,
  CalendarDays,
  FolderKanban,
  HelpCircle,
  LayoutGrid,
  Moon,
  PanelLeftOpen,
  Settings,
  Sun,
} from "lucide-react";
import {
  D6_MODULES,
  projectGateModuleHref,
  type D6ModuleId,
} from "@/app/lib/project-gate/d6Modules";
import styles from "./ProjectGateShell.module.css";

type Props = {
  projectId: string;
  activeModuleId: D6ModuleId;
  boardOpen: boolean;
  theme: "light" | "dark";
  onToggleBoard: () => void;
  onOpenModuleSwitcher: () => void;
  onToggleTheme: () => void;
};

export default function ProjectGateNavigationRail({
  projectId,
  activeModuleId,
  boardOpen,
  theme,
  onToggleBoard,
  onOpenModuleSwitcher,
  onToggleTheme,
}: Props) {
  return (
    <nav className={styles.rail} aria-label="DIMPRO Projektkapu fő navigáció">
      <button
        type="button"
        className={styles.railBrand}
        onClick={onToggleBoard}
        title={boardOpen ? "Bal oldali board összecsukása" : "Bal oldali board megnyitása"}
        aria-label={boardOpen ? "Bal oldali board összecsukása" : "Bal oldali board megnyitása"}
      >
        <FolderKanban size={21} />
      </button>

      <button type="button" className={styles.railButton} onClick={onToggleBoard} title="Navigációs board">
        <PanelLeftOpen size={18} />
      </button>
      <button type="button" className={styles.railButton} onClick={onOpenModuleSwitcher} title="Modulváltó · Ctrl+Alt+M">
        <LayoutGrid size={18} />
      </button>

      <span className={styles.railDivider} />

      {D6_MODULES.map((item) => {
        const Icon = item.Icon;
        return (
          <Link
            key={item.id}
            href={projectGateModuleHref(projectId, item.id)}
            className={`${styles.railLink} ${activeModuleId === item.id ? styles.railActive : ""}`}
            title={`${item.hungarianName} · ${item.brandName}`}
            aria-label={`${item.hungarianName} · ${item.brandName}`}
          >
            <Icon size={18} />
          </Link>
        );
      })}

      <Link href="/naptar" className={styles.railLink} title="Naptár">
        <CalendarDays size={18} />
      </Link>

      <div className={styles.railSpacer} />

      <button type="button" className={styles.railButton} title="Értesítések" aria-label="Értesítések">
        <Bell size={18} />
      </button>
      <button type="button" className={styles.railButton} title="Súgó" aria-label="Súgó">
        <HelpCircle size={18} />
      </button>
      <button
        type="button"
        className={styles.railButton}
        onClick={onToggleTheme}
        title={theme === "dark" ? "Világos mód" : "Sötét mód"}
        aria-label={theme === "dark" ? "Világos mód" : "Sötét mód"}
      >
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <Link href={`/projektkapu/project/${encodeURIComponent(projectId)}/settings`} className={styles.railLink} title="Projektbeállítások">
        <Settings size={18} />
      </Link>
      <span className={styles.railVersion}>PROJEKTKAPU</span>
    </nav>
  );
}
