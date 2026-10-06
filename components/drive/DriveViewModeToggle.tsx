"use client";

import { RefreshCw } from "lucide-react";
import type { DriveViewMode } from "./driveTypes";
import styles from "./DriveWorkspace.module.css";

const LABELS: Record<DriveViewMode, string> = {
  simple: "Egyszerű nézet",
  engineering: "Mérnöki nézet",
  review: "Tervellenőrzés",
};

type Props = {
  value: DriveViewMode;
  onChange: (value: DriveViewMode) => void;
  allowedModes?: DriveViewMode[];
  onRefresh?: () => void;
};

export default function DriveViewModeToggle({ value, onChange, allowedModes = ["simple", "engineering", "review"], onRefresh }: Props) {
  return (
    <div className={styles.viewToggle}>
      {allowedModes.map((mode) => (
        <button
          key={mode}
          type="button"
          className={value === mode ? styles.viewToggleActive : ""}
          onClick={() => onChange(mode)}
          aria-pressed={value === mode}
        >
          {LABELS[mode]}
        </button>
      ))}
      {onRefresh ? (
        <button type="button" onClick={onRefresh} title="Fájllista frissítése" aria-label="Fájllista frissítése"><RefreshCw size={12} /></button>
      ) : null}
    </div>
  );
}
