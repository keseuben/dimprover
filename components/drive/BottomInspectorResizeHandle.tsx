"use client";

import { GripHorizontal } from "lucide-react";
import styles from "./DriveWorkspace.module.css";

const MIN_PANEL_HEIGHT = 230;
const MIN_TABLE_HEIGHT = 190;

export default function BottomInspectorResizeHandle() {
  const resetToHalf = (element: HTMLElement) => {
    const panel = element.closest(`.${styles.fullTableInspectorBottom}`) as HTMLElement | null;
    if (!panel) return;
    panel.style.flexBasis = "50%";
  };

  return (
    <button
      type="button"
      className={styles.fullTableInspectorResizeHandle}
      title="Adatok panel magasságának állítása · dupla kattintás: 50%"
      aria-label="Adatok panel magasságának állítása"
      onDoubleClick={(event) => resetToHalf(event.currentTarget)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const handle = event.currentTarget;
        const panel = handle.closest(`.${styles.fullTableInspectorBottom}`) as HTMLElement | null;
        const overlay = handle.closest("[data-drive-full-table], [data-project-gate-drive-full-table]") as HTMLElement | null;
        if (!panel || !overlay) return;

        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        const startY = event.clientY;
        const startHeight = panel.getBoundingClientRect().height;
        const maxHeight = Math.max(MIN_PANEL_HEIGHT, overlay.getBoundingClientRect().height - MIN_TABLE_HEIGHT);

        const onMove = (moveEvent: PointerEvent) => {
          const next = Math.min(maxHeight, Math.max(MIN_PANEL_HEIGHT, startHeight + startY - moveEvent.clientY));
          panel.style.flexBasis = `${Math.round(next)}px`;
        };
        const onEnd = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onEnd);
          window.removeEventListener("pointercancel", onEnd);
          if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onEnd, { once: true });
        window.addEventListener("pointercancel", onEnd, { once: true });
      }}
    >
      <GripHorizontal size={18} aria-hidden="true" />
    </button>
  );
}
