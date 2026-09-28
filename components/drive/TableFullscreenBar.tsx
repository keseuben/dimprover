"use client";

import { Minus, PanelRightOpen, Plus } from "lucide-react";
import type { DriveLayoutMode } from "./driveTypes";
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

const clampZoom = (value: number) => Math.max(70, Math.min(150, Math.round(value / 10) * 10));

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
      <div className={styles.tableZoomControls} aria-label="Táblázat nagyítása">
        <button type="button" onClick={() => onZoomChange(clampZoom(zoom - 10))} disabled={zoom <= 70} title="Kicsinyítés" aria-label="Táblázat kicsinyítése"><Minus size={14} /></button>
        <button type="button" className={styles.tableZoomValue} onClick={() => onZoomChange(100)} title="Visszaállítás 100%-ra">{zoom}%</button>
        <button type="button" onClick={() => onZoomChange(clampZoom(zoom + 10))} disabled={zoom >= 150} title="Nagyítás" aria-label="Táblázat nagyítása"><Plus size={14} /></button>
      </div>
      <ViewLayoutSwitcher value={layoutMode} onChange={onLayoutModeChange} tableFullscreen onToggleTableFullscreen={onToggleFullscreen} />
    </header>
  );
}
