"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileSearch2, QrCode, Save, StickyNote } from "lucide-react";
import type { DriveDocument, DriveDocumentDetails } from "./driveTypes";
import styles from "./DriveWorkspace.module.css";

type MetadataForm = {
  planNo: string;
  discipline: string;
  documentType: string;
  revision: string;
  issueStatus: string;
  approvalStatus: string;
  building: string;
  level: string;
  zone: string;
};

type Props = {
  document: DriveDocument | null;
  details: DriveDocumentDetails | null;
  loading: boolean;
  busy: boolean;
  canWrite: boolean;
  onSaveMetadata: (input: MetadataForm) => Promise<void>;
  onSaveNote: (note: string) => Promise<void>;
  onEnsureQr: () => Promise<void>;
  onDownload: () => Promise<void>;
  responsiveClassName?: string;
};

const emptyMetadata: MetadataForm = {
  planNo: "",
  discipline: "",
  documentType: "",
  revision: "",
  issueStatus: "",
  approvalStatus: "",
  building: "",
  level: "",
  zone: "",
};

export default function DetailsPanel({
  document,
  details,
  loading,
  busy,
  canWrite,
  onSaveMetadata,
  onSaveNote,
  onEnsureQr,
  onDownload,
  responsiveClassName = "",
}: Props) {
  const [tab, setTab] = useState<"details" | "versions" | "notes">("details");
  const [metadata, setMetadata] = useState<MetadataForm>(emptyMetadata);
  const [note, setNote] = useState("");

  useEffect(() => {
    const source = details?.metadata;
    setMetadata(source ? {
      planNo: source.planNo,
      discipline: source.discipline,
      documentType: source.documentType,
      revision: source.revision,
      issueStatus: source.issueStatus,
      approvalStatus: source.approvalStatus,
      building: source.building,
      level: source.level,
      zone: source.zone,
    } : emptyMetadata);
    setNote(details?.notes?.[0]?.note || "");
  }, [details?.document.id, details?.metadata, details?.notes]);

  const activeQr = useMemo(() => details?.qrCodes.find((qr) => qr.status === "ACTIVE") || null, [details?.qrCodes]);

  if (!document) {
    return (
      <aside className={`${styles.detailsPanel} ${responsiveClassName}`}>
        <div className={styles.loadingState}>
          <div><FileSearch2 size={28} /><strong>Válassz ki egy fájlt</strong><span>A részletek és mérnöki metaadatok itt jelennek meg.</span></div>
        </div>
      </aside>
    );
  }

  return (
    <aside className={`${styles.detailsPanel} ${responsiveClassName}`}>
      <header className={styles.detailsHeader}>
        <div className={styles.detailsHeaderIcon}>{document.extension?.toUpperCase().slice(0, 4) || "FILE"}</div>
        <div className={styles.detailsHeaderText}>
          <strong>{document.name}</strong>
          <span>{document.extension?.toUpperCase() || "FILE"} · {document.currentVersion?.revisionCode || `V${document.currentVersionNumber}`}</span>
        </div>
      </header>

      <div className={styles.detailsTabs}>
        <button type="button" className={tab === "details" ? styles.detailsTabActive : ""} onClick={() => setTab("details")}>Részletek</button>
        <button type="button" className={tab === "versions" ? styles.detailsTabActive : ""} onClick={() => setTab("versions")}>Verziók ({details?.versions.length || 0})</button>
        <button type="button" className={tab === "notes" ? styles.detailsTabActive : ""} onClick={() => setTab("notes")}>Megjegyzések</button>
      </div>

      <div className={styles.detailsBody}>
        {loading ? (
          <div className={styles.previewPlaceholder}><div><FileSearch2 size={24} /><strong>Részletek betöltése…</strong></div></div>
        ) : tab === "details" ? (
          <>
            <div className={styles.previewPlaceholder}>
              <div>
                <FileSearch2 size={28} />
                <strong>DocumentViewer helye előkészítve</strong>
                <span>A közös PDF/kép inline előnézet a 4. napi Viewer + Compare fejlesztésben aktiválódik.</span>
              </div>
            </div>

            <div className={styles.metaGrid}>
              {([
                ["planNo", "Tervszám"],
                ["discipline", "Szakág"],
                ["documentType", "Dokumentumtípus"],
                ["revision", "Revízió"],
                ["issueStatus", "Kiadás"],
                ["approvalStatus", "Jóváhagyás"],
                ["building", "Épület"],
                ["level", "Szint"],
                ["zone", "Zóna"],
              ] as Array<[keyof MetadataForm, string]>).map(([key, label]) => (
                <div className={styles.metaItem} key={key}>
                  <label htmlFor={`drive-meta-${key}`}>{label}</label>
                  <input
                    id={`drive-meta-${key}`}
                    value={metadata[key]}
                    readOnly={!canWrite}
                    onChange={(event) => setMetadata((current) => ({ ...current, [key]: event.target.value }))}
                    placeholder="–"
                  />
                </div>
              ))}
            </div>

            <div className={styles.detailsActions}>
              <button type="button" className={`${styles.smallButton} ${styles.smallPrimary}`} disabled={!canWrite || busy} onClick={() => void onSaveMetadata(metadata)}>
                <Save size={12} /> Metaadat mentése
              </button>
              <button type="button" className={styles.smallButton} disabled={busy || document.currentVersion?.status !== "AVAILABLE"} onClick={() => void onDownload()}>
                <Download size={12} /> Letöltés
              </button>
              <button type="button" className={styles.smallButton} disabled={!canWrite || busy} onClick={() => void onEnsureQr()}>
                <QrCode size={12} /> {activeQr ? "QR elérhető" : "QR létrehozása"}
              </button>
            </div>
            {activeQr && <div className={styles.infoBox}>QR azonosító aktív. A publikus QR feloldó oldal és vizuális QR-kép későbbi vertikális szeletben kapcsolódik hozzá.</div>}
          </>
        ) : tab === "versions" ? (
          <div className={styles.versionList}>
            {(details?.versions || []).map((version) => (
              <article className={styles.versionCard} key={version.id}>
                <strong>V{version.versionNumber} · {version.revisionCode || "revízió nélkül"}</strong>
                <span>{version.status} · {new Date(version.createdAt).toLocaleString("hu-HU")}</span>
                <span>{version.changeNote || version.originalName}</span>
              </article>
            ))}
            {!details?.versions.length && <div className={styles.infoBox}>Nincs verzióadat.</div>}
          </div>
        ) : (
          <>
            <div className={`${styles.metaItem} ${styles.metaFull}`}>
              <label htmlFor="drive-file-note">Fájlhoz kapcsolt megjegyzés</label>
              <textarea id="drive-file-note" rows={8} value={note} readOnly={!canWrite} onChange={(event) => setNote(event.target.value)} />
            </div>
            <div className={styles.detailsActions}>
              <button type="button" className={`${styles.smallButton} ${styles.smallPrimary}`} disabled={!canWrite || busy} onClick={() => void onSaveNote(note)}>
                <StickyNote size={12} /> Megjegyzés mentése
              </button>
            </div>
            {(details?.notes || []).slice(1, 6).map((item) => (
              <div key={item.id} className={styles.infoBox}>{item.note}</div>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}
