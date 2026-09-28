"use client";

import { Minus, Plus } from "lucide-react";
import styles from "./DriveWorkspace.module.css";

type Props = {
  zoom: number;
  onZoomChange: (value: number) => void;
  compact?: boolean;
};

export const clampTableZoom = (value: number) => Math.max(70, Math.min(150, Math.round(value / 10) * 10));

export default function TableZoomControls({ zoom, onZoomChange, compact = false }: Props) {
  return (
    <div className={`${styles.tableZoomControls} ${compact ? styles.tableZoomControlsCompact : ""}`} aria-label="Táblázat nagyítása">
      <button type="button" onClick={() => onZoomChange(clampTableZoom(zoom - 10))} disabled={zoom <= 70} title="Kicsinyítés" aria-label="Táblázat kicsinyítése"><Minus size={14} /></button>
      <button type="button" className={styles.tableZoomValue} onClick={() => onZoomChange(100)} title="Visszaállítás 100%-ra">{zoom}%</button>
      <button type="button" onClick={() => onZoomChange(clampTableZoom(zoom + 10))} disabled={zoom >= 150} title="Nagyítás" aria-label="Táblázat nagyítása"><Plus size={14} /></button>
    </div>
  );
}
