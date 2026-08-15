"use client";

import { Columns2, Columns3, PanelsLeftRight, Rows3, Square } from "lucide-react";
import type { DriveLayoutMode } from "./driveTypes";
import styles from "./DriveWorkspace.module.css";

type Props = {
  value: DriveLayoutMode;
  onChange: (value: DriveLayoutMode) => void;
};

const modes: Array<{ value: DriveLayoutMode; label: string; icon: typeof Columns3 }> = [
  { value: "three", label: "3 paneles nézet", icon: Columns3 },
  { value: "two", label: "2 paneles nézet", icon: Columns2 },
  { value: "one", label: "1 paneles nézet", icon: Square },
  { value: "split", label: "Osztott nézet", icon: Rows3 },
  { value: "commander", label: "Commander – kétpaneles fájlkezelő", icon: PanelsLeftRight },
];

export default function ViewLayoutSwitcher({ value, onChange }: Props) {
  return (
    <div className={styles.layoutSwitcher} aria-label="Drive nézetváltó">
      {modes.map((mode) => {
        const Icon = mode.icon;
        return (
          <button
            key={mode.value}
            type="button"
            className={value === mode.value ? styles.layoutActive : ""}
            onClick={() => onChange(mode.value)}
            title={mode.label}
            aria-label={mode.label}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
