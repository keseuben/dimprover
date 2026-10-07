"use client";

import { useEffect } from "react";
import { FileSearch2, X } from "lucide-react";
import type { DriveDocument } from "./driveTypes";
import DriveDocumentViewer from "./DriveDocumentViewer";
import OverflowTooltipText from "./OverflowTooltipText";
import styles from "./DriveWorkspace.module.css";

type Props = {
  projectId: string;
  document: DriveDocument | null;
  open: boolean;
  onClose: () => void;
};

function displayName(document: DriveDocument) {
  return document.currentVersion?.originalName || document.name || "Dokumentum";
}

export default function DrivePreviewDrawer({ projectId, document, open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className={styles.previewDrawerOverlay}
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className={styles.previewDrawer} role="dialog" aria-modal="true" aria-label="Fájl megjelenítő" onPointerDown={(event) => event.stopPropagation()}>
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
          {document
            ? <DriveDocumentViewer projectId={projectId} document={document} />
            : <div className={styles.previewPlaceholder}><div><FileSearch2 size={26} /><strong>Nincs kijelölt fájl</strong></div></div>}
        </div>
      </aside>
    </div>
  );
}
