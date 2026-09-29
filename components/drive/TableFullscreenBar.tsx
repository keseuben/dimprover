"use client";

import { PanelBottomOpen, PanelRightOpen } from "lucide-react";
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
  inspectorLayout?: "side" | "bottom";
  onToggleInspector?: () => void;
  onInspectorLayoutChange?: (layout: "side" | "bottom") => void;
};

export default function TableFullscreenBar({ title, subtitle, layoutMode, onLayoutModeChange, zoom, onZoomChange, onToggleFullscreen, inspectorOpen = false, inspectorDisabled = false, inspectorLayout = "side", onToggleInspector, onInspectorLayoutChange }: Props) {
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
      {onInspectorLayoutChange && (
        <div className={styles.fullTableInspectorLayoutToggle} aria-label="Adatok panel elrendezése">
          <button
            type="button"
            className={`${styles.fullTableInspectorLayoutButton} ${inspectorLayout === "side" ? styles.fullTableInspectorLayoutButtonActive : ""}`}
            onClick={() => { onInspectorLayoutChange("side"); if (!inspectorOpen) onToggleInspector?.(); }}
            disabled={inspectorDisabled}
            title="Adatok panel jobb oldalon"
            aria-label="Adatok panel jobb oldalon"
            aria-pressed={inspectorLayout === "side"}
          >
            <PanelRightOpen size={14} />
          </button>
          <button
            type="button"
            className={`${styles.fullTableInspectorLayoutButton} ${inspectorLayout === "bottom" ? styles.fullTableInspectorLayoutButtonActive : ""}`}
            onClick={() => { onInspectorLayoutChange("bottom"); if (!inspectorOpen) onToggleInspector?.(); }}
            disabled={inspectorDisabled}
            title="Adatok panel alul, fekvő nézetben"
            aria-label="Adatok panel alul, fekvő nézetben"
            aria-pressed={inspectorLayout === "bottom"}
          >
            <PanelBottomOpen size={14} />
          </button>
        </div>
      )}
      <TableZoomControls zoom={zoom} onZoomChange={onZoomChange} />
      <ViewLayoutSwitcher value={layoutMode} onChange={onLayoutModeChange} tableFullscreen onToggleTableFullscreen={onToggleFullscreen} />
    </header>
  );
}
