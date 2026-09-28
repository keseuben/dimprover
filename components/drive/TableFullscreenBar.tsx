"use client";

import { PanelRightOpen } from "lucide-react";
import type { DriveLayoutMode } from "./driveTypes";
import TableZoomControls from "./TableZoomControls";
import ViewLayoutSwitcher from "./ViewLayoutSwitcher";
import styles from "./DriveWorkspace.module.css";

type Props = {
  title: string;
  subtitle: string;
  layoutMode: DriveLayoutMode;
  onLayoutModeChange: (value: DriveLayoutMode) => void;
  zoom: number;
  onZoomChange: (value: number) => void;
  onToggleFullscreen: () => void;
  inspectorOpen?: boolean;
  inspectorDisabled?: boolean;
  onToggleInspector?: () => void;
};

export default function TableFullscreenBar({ title, subtitle, layoutMode, onLayoutModeChange, zoom, onZoomChange, onToggleFullscreen, inspectorOpen = false, inspectorDisabled = false, onToggleInspector }: Props) {
  return (
    <header className={styles.fullTableBar}>
      <div className={styles.fullTableIdentity}>
        <strong>{title}</strong>
        <span>{subtitle} · Hosszan nyomd az egérgombot a táblázaton, majd húzd bármely irányba.</span>
      </div>
      {onToggleInspector && (
        <button
          type="button"
          className={`${styles.fullTableInspectorButton} ${inspectorOpen ? styles.fullTableInspectorButtonActive : ""}`}
          onClick={onToggleInspector}
          disabled={inspectorDisabled}
          title={inspectorDisabled ? "Válassz ki egy dokumentumot" : inspectorOpen ? "Dokumentumadatok bezárása" : "Részletek, tervellenőrzés, verziók és megjegyzések"}
          aria-label="Dokumentumadatok"
          aria-pressed={inspectorOpen}
        >
          <PanelRightOpen size={14} />
          <span>Adatok</span>
        </button>
      )}
      <TableZoomControls zoom={zoom} onZoomChange={onZoomChange} />
      <ViewLayoutSwitcher value={layoutMode} onChange={onLayoutModeChange} tableFullscreen onToggleTableFullscreen={onToggleFullscreen} />
    </header>
  );
}
