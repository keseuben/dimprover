"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, FileSearch2, Loader2, ShieldCheck } from "lucide-react";
import styles from "./DriveWorkspace.module.css";

export type PersonalDriveDetailsItem = {
  id: string;
  name: string;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  sourceSystem: string;
  securityStatus: string;
  virusScanStatus: string;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  item: PersonalDriveDetailsItem | null;
  folderName: string;
  onDownload: (item: PersonalDriveDetailsItem) => Promise<void> | void;
  responsiveClassName?: string;
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("hu-HU");
}

function extensionOf(item: PersonalDriveDetailsItem) {
  const name = item.originalName || item.name;
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export default function PersonalDriveDetailsPanel({ item, folderName, onDownload, responsiveClassName = "" }: Props) {
  const [tab, setTab] = useState<"details" | "preview">("details");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const clean = Boolean(item && item.securityStatus === "clean" && item.virusScanStatus === "clean");
  const itemId = item?.id || "";
  const extension = item ? extensionOf(item) : "";
  const previewKind = useMemo(() => {
    if (!item) return "none";
    if (["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"].includes(extension)) return "image";
    if (extension === "pdf" || item.mimeType === "application/pdf") return "pdf";
    return "unsupported";
  }, [extension, item]);

  useEffect(() => {
    setTab("details");
    setPreviewUrl("");
    setPreviewError("");
  }, [item?.id]);

  useEffect(() => {
    if (!itemId || tab !== "preview" || !clean || previewKind === "unsupported" || previewUrl) return;
    const controller = new AbortController();
    setPreviewLoading(true);
    setPreviewError("");
    void (async () => {
      try {
        const response = await fetch(`/api/drive/personal/content/${encodeURIComponent(itemId)}/preview`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { ok?: boolean; error?: string; preview?: { url?: string } };
        if (!response.ok || !payload.ok || !payload.preview?.url) throw new Error(payload.error || "Az előnézet nem tölthető be.");
        if (!controller.signal.aborted) setPreviewUrl(payload.preview.url);
      } catch (caught) {
        if (!controller.signal.aborted) setPreviewError(caught instanceof Error ? caught.message : "Az előnézet nem tölthető be.");
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    })();
    return () => controller.abort();
  }, [clean, itemId, previewKind, previewUrl, tab]);

  if (!item) return (
    <aside className={`${styles.detailsPanel} ${responsiveClassName}`}>
      <div className={styles.loadingState}><div><FileSearch2 size={28} /><strong>Válassz ki egy fájlt</strong><span>A részletek és az előnézet itt jelennek meg.</span></div></div>
    </aside>
  );

  return (
    <aside className={`${styles.detailsPanel} ${responsiveClassName}`}>
      <header className={styles.detailsHeader}>
        <div className={styles.detailsHeaderIcon}>{extension.toUpperCase().slice(0, 4) || "FILE"}</div>
        <div className={styles.detailsHeaderText}><strong>{item.name}</strong><span>{extension.toUpperCase() || "FILE"} · {formatBytes(item.sizeBytes)} · Saját Drive</span></div>
      </header>
      <div className={styles.detailsTabs}>
        <button type="button" className={tab === "details" ? styles.detailsTabActive : ""} onClick={() => setTab("details")}>Részletek</button>
        <button type="button" className={tab === "preview" ? styles.detailsTabActive : ""} onClick={() => setTab("preview")}>Előnézet</button>
      </div>
      <div className={`${styles.detailsBody} ${tab === "details" ? styles.detailsBodyStructured : ""}`}>
        {tab === "preview" ? (
          <div className={styles.personalPreviewStage}>
            {!clean ? <div className={styles.previewPlaceholder}><div><ShieldCheck size={24} /><strong>Az előnézet biztonsági ellenőrzés után érhető el</strong></div></div> :
              previewKind === "unsupported" ? <div className={styles.previewPlaceholder}><div><FileSearch2 size={24} /><strong>Ehhez a fájltípushoz nincs böngészős előnézet</strong><span>A fájl letölthető vagy külső alkalmazásban megnyitható.</span></div></div> :
              previewLoading ? <div className={styles.previewPlaceholder}><div><Loader2 className={styles.spin} size={24} /><strong>Előnézet betöltése…</strong></div></div> :
              previewError ? <div className={styles.previewPlaceholder}><div><FileSearch2 size={24} /><strong>Az előnézet nem tölthető be</strong><span>{previewError}</span></div></div> :
              previewUrl && previewKind === "image" ? (
                // Signed, short-lived object URL: native img intentionally avoids Next image proxy/cache.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt={item.name} className={styles.personalPreviewImage} />
              ) :
              previewUrl && previewKind === "pdf" ? <iframe src={previewUrl} title={item.name} className={styles.personalPreviewFrame} /> : null}
          </div>
        ) : (
          <div className={styles.personalDetailsGrid}>
            <div><span>Megnevezés</span><strong>{item.name}</strong></div>
            <div><span>Eredeti fájlnév</span><strong>{item.originalName || "—"}</strong></div>
            <div><span>Mappa</span><strong>{folderName}</strong></div>
            <div><span>Fájltípus</span><strong>{item.mimeType || extension.toUpperCase() || "—"}</strong></div>
            <div><span>Méret</span><strong>{formatBytes(item.sizeBytes)}</strong></div>
            <div><span>Forrás</span><strong>{item.sourceSystem || "DIMPRO"}</strong></div>
            <div><span>Létrehozva</span><strong>{formatDate(item.createdAt)}</strong></div>
            <div><span>Módosítva</span><strong>{formatDate(item.updatedAt)}</strong></div>
            <div><span>Biztonság</span><strong>{clean ? "Ellenőrzött" : "Ellenőrzés alatt"}</strong></div>
            <div className={styles.personalDetailsWide}><span>SHA-256</span><strong>{item.sha256 || "—"}</strong></div>
            <div className={styles.personalDetailsWide}><span>Mérnöki metaadatok</span><strong>Tervszám, megnevezés, revízió, lépték: még nincs rögzített személyes metaadat.</strong></div>
          </div>
        )}
      </div>
      <div className={styles.personalDetailsActions}>
        <button type="button" disabled={!clean} onClick={() => void onDownload(item)}><Download size={13} /> Letöltés</button>
        <button type="button" disabled={!previewUrl} onClick={() => previewUrl && window.open(previewUrl, "_blank", "noopener,noreferrer")}><ExternalLink size={13} /> Új ablak</button>
      </div>
    </aside>
  );
}
