"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileSearch2, X } from "lucide-react";
import type { DriveDocument } from "./driveTypes";
import DriveDocumentViewer from "./DriveDocumentViewer";
import OverflowTooltipText from "./OverflowTooltipText";
import styles from "./DriveWorkspace.module.css";

type Props = {
  projectId: string;
  document: DriveDocument | null;
  open: boolean;
  onClose: () => void;
  position?: number;
  total?: number;
  onPrevious?: () => void;
  onNext?: () => void;
};

function displayName(document: DriveDocument) {
  return document.currentVersion?.originalName || document.name || "Dokumentum";
}

export default function DrivePreviewDrawer({ projectId, document, open, onClose, position = 0, total = 0, onPrevious, onNext }: Props) {
  const [drawerWidth, setDrawerWidth] = useState<number | null>(null);
  const effectiveWidth = drawerWidth ?? 1120;
  const clampWidth = (width: number) => Math.max(320, Math.min(window.innerWidth, width));
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if ((event.target instanceof HTMLInputElement) || (event.target instanceof HTMLTextAreaElement) || (event.target instanceof HTMLSelectElement) || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
      if (event.key === "ArrowLeft" && onPrevious) { event.preventDefault(); onPrevious(); }
      if (event.key === "ArrowRight" && onNext) { event.preventDefault(); onNext(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, onPrevious, onNext, open]);

  if (!open) return null;

  return (
    <div
      className={styles.previewDrawerOverlay}
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className={styles.previewDrawer} style={drawerWidth === null ? undefined : { width: `${drawerWidth}px`, maxWidth: "100vw" }} role="dialog" aria-modal="true" aria-label="Fájl megjelenítő" onPointerDown={(event) => event.stopPropagation()}>
        <div className={styles.previewDrawerResizeHandle}
          role="separator" aria-orientation="vertical"
          aria-label="Fájlmegjelenítő szélességének módosítása"
          aria-valuemin={320} aria-valuemax={typeof window === "undefined" ? 1920 : window.innerWidth}
          aria-valuenow={effectiveWidth}
          title="Húzd balra a fájlmegjelenítő szélesítéséhez · dupla kattintás: alapméret"
          tabIndex={0}
          onDoubleClick={() => setDrawerWidth(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") { event.preventDefault(); setDrawerWidth(clampWidth((drawerWidth ?? Math.min(window.innerWidth * .68, 1120)) + 40)); }
            if (event.key === "ArrowRight") { event.preventDefault(); setDrawerWidth(clampWidth((drawerWidth ?? Math.min(window.innerWidth * .68, 1120)) - 40)); }
            if (event.key === "Home") { event.preventDefault(); setDrawerWidth(320); }
            if (event.key === "End") { event.preventDefault(); setDrawerWidth(window.innerWidth); }
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            event.preventDefault();
            const original = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 800;
            const startX = event.clientX;
            const onMove = (move: PointerEvent) => setDrawerWidth(clampWidth(original + startX - move.clientX));
            const onEnd = () => {
              window.document.body.style.userSelect = "";
              window.document.body.style.cursor = "";
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onEnd);
              window.removeEventListener("pointercancel", onEnd);
            };
            window.document.body.style.userSelect = "none";
            window.document.body.style.cursor = "col-resize";
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onEnd, { once: true });
            window.addEventListener("pointercancel", onEnd, { once: true });
          }}
        ><span /></div>
        <header className={styles.previewDrawerHeader}>
          <div className={styles.previewDrawerHeaderIcon}><FileSearch2 size={18} /></div>
          <div className={styles.previewDrawerHeaderText}>
            <small>DIMPRO DRIVE · FÁJL MEGJELENÍTŐ</small>
            <OverflowTooltipText text={document ? displayName(document) : "Fájl megjelenítő"} className={styles.previewDrawerTitle} />
            {document && <span>{document.extension?.toUpperCase() || "FILE"} · {document.currentVersion?.revisionCode || "R00"} · V{String(document.currentVersion?.versionNumber || document.currentVersionNumber || 0).padStart(2, "0")}</span>}
          </div>
          <button type="button" className={styles.previewDrawerClose} onClick={onClose} title="Bezárás" aria-label="Fájl megjelenítő bezárása"><X size={18} /></button>
        </header>
        <div className={styles.previewDrawerBody}>
          {onPrevious && <button className={styles.previewNavigatorPrevious} type="button" onClick={onPrevious} aria-label="Előző dokumentum" title="Előző dokumentum"><ChevronLeft size={25}/></button>}
          {onNext && <button className={styles.previewNavigatorNext} type="button" onClick={onNext} aria-label="Következő dokumentum" title="Következő dokumentum"><ChevronRight size={25}/></button>}
          {total > 0 && position >= 0 && <div className={styles.previewNavigatorCounter}>{position + 1} / {total}</div>}
          {document
            ? <DriveDocumentViewer projectId={projectId} document={document} />
            : <div className={styles.previewPlaceholder}><div><FileSearch2 size={26} /><strong>Nincs kijelölt fájl</strong></div></div>}
        </div>
      </aside>
    </div>
  );
}
