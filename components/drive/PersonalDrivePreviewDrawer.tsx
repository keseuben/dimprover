"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSearch2, Loader2, ShieldCheck, X } from "lucide-react";
import type { DriveDocument } from "./driveTypes";
import OverflowTooltipText from "./OverflowTooltipText";
import styles from "./DriveWorkspace.module.css";

type Props = { document: DriveDocument | null; open: boolean; onClose: () => void };
type PreviewPayload = { ok?: boolean; error?: string; preview?: { url?: string; kind?: "PDF" | "IMAGE" | null; mimeType?: string; fileName?: string } };

function displayName(document: DriveDocument) {
  return document.currentVersion?.originalName || document.name || "Dokumentum";
}

export default function PersonalDrivePreviewDrawer({ document, open, onClose }: Props) {
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<"PDF" | "IMAGE" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const documentId = document?.id || "";
  const title = useMemo(() => document ? displayName(document) : "Fájl megjelenítő", [document]);

  useEffect(() => {
    if (!open || !documentId) { setUrl(""); setKind(null); setError(""); return; }
    const controller = new AbortController();
    setLoading(true); setError(""); setUrl(""); setKind(null);
    void (async () => {
      try {
        const response = await fetch(`/api/drive/personal/content/${encodeURIComponent(documentId)}/preview`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const payload = await response.json().catch(() => ({})) as PreviewPayload;
        if (!response.ok || !payload.ok || !payload.preview?.url) throw new Error(payload.error || "Az előnézet nem tölthető be.");
        if (!controller.signal.aborted) { setUrl(payload.preview.url); setKind(payload.preview.kind || null); }
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Az előnézet nem tölthető be.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [documentId, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className={styles.previewDrawerOverlay} role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className={styles.previewDrawer} role="dialog" aria-modal="true" aria-label="Saját Drive fájl megjelenítő" onPointerDown={(event) => event.stopPropagation()}>
        <header className={styles.previewDrawerHeader}>
          <div className={styles.previewDrawerHeaderIcon}><FileSearch2 size={18} /></div>
          <div className={styles.previewDrawerHeaderText}><small>DIMPRO DRIVE · SAJÁT FÁJL MEGJELENÍTŐ</small><OverflowTooltipText text={title} className={styles.previewDrawerTitle} />{document ? <span>{document.extension?.toUpperCase() || "FILE"} · Saját Drive</span> : null}</div>
          <button type="button" className={styles.previewDrawerClose} onClick={onClose} title="Bezárás" aria-label="Fájl megjelenítő bezárása"><X size={18} /></button>
        </header>
        <div className={`${styles.previewDrawerBody} ${styles.personalPreviewDrawerBody}`}>
          {loading ? <div className={styles.previewPlaceholder}><div><Loader2 className={styles.spin} size={26} /><strong>Előnézet betöltése…</strong></div></div> :
            error ? <div className={styles.previewPlaceholder}><div><ShieldCheck size={25} /><strong>Az előnézet nem tölthető be</strong><span>{error}</span></div></div> :
            url && kind === "IMAGE" ? (
              // Signed short-lived object URL; native image avoids proxy/cache persistence.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={title} className={styles.personalPreviewDrawerImage} />
            ) : url && kind === "PDF" ? <iframe src={url} title={title} className={styles.personalPreviewDrawerFrame} /> :
              <div className={styles.previewPlaceholder}><div><FileSearch2 size={25} /><strong>Ehhez a fájltípushoz nincs böngészős előnézet</strong><span>A fájl letöltéssel nyitható meg.</span></div></div>}
        </div>
      </aside>
    </div>
  );
}
