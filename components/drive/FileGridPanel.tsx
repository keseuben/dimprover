"use client";

import { File, FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import type { DriveDocument, DriveViewMode } from "./driveTypes";
import styles from "./DriveWorkspace.module.css";

type Props = {
  title: string;
  subtitle: string;
  documents: DriveDocument[];
  selectedDocumentId: string;
  viewMode: DriveViewMode;
  onViewModeChange: (value: DriveViewMode) => void;
  onSelectDocument: (document: DriveDocument) => void;
  onRefresh: () => void;
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "–";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function FileKindIcon({ extension }: { extension: string }) {
  const ext = extension.toLowerCase();
  if (["xlsx", "xls", "csv"].includes(ext)) return <FileSpreadsheet size={13} />;
  if (["doc", "docx", "txt", "rtf"].includes(ext)) return <FileText size={13} />;
  return <File size={13} />;
}

function fileIconClass(extension: string) {
  const ext = extension.toLowerCase();
  if (["xlsx", "xls", "csv"].includes(ext)) return `${styles.fileIcon} ${styles.fileIconSheet}`;
  if (["doc", "docx", "txt", "rtf", "dwg", "dxf"].includes(ext)) return `${styles.fileIcon} ${styles.fileIconDoc}`;
  return styles.fileIcon;
}

export default function FileGridPanel({
  title,
  subtitle,
  documents,
  selectedDocumentId,
  viewMode,
  onViewModeChange,
  onSelectDocument,
  onRefresh,
}: Props) {
  return (
    <section className={styles.filePanel}>
      <header className={styles.filePanelTop}>
        <div className={styles.filePanelTitle}>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <div className={styles.viewToggle}>
          <button
            type="button"
            className={viewMode === "simple" ? styles.viewToggleActive : ""}
            onClick={() => onViewModeChange("simple")}
          >
            Egyszerű nézet
          </button>
          <button
            type="button"
            className={viewMode === "engineering" ? styles.viewToggleActive : ""}
            onClick={() => onViewModeChange("engineering")}
          >
            Mérnöki nézet
          </button>
          <button type="button" onClick={onRefresh} title="Fájllista frissítése"><RefreshCw size={12} /></button>
        </div>
      </header>

      <div className={styles.fileTableWrap}>
        {viewMode === "simple" ? (
          <table className={styles.fileTable}>
            <colgroup>
              <col style={{ width: "38%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "8%" }} />
            </colgroup>
            <thead><tr><th>Név</th><th>Típus</th><th>Revízió</th><th>Forrás</th><th>Méret</th><th>Feltöltve</th><th>Állapot</th></tr></thead>
            <tbody>
              {documents.map((document) => {
                const version = document.currentVersion;
                const selected = selectedDocumentId === document.id;
                const sourceClass = document.source === "DROP" ? styles.sourceDrop : document.source === "DESKTOP" ? styles.sourceDesktop : "";
                return (
                  <tr
                    key={document.id}
                    className={`${styles.fileRow} ${selected ? styles.fileSelected : ""}`}
                    onClick={() => onSelectDocument(document)}
                  >
                    <td><div className={styles.fileNameCell}><span className={fileIconClass(document.extension)}><FileKindIcon extension={document.extension} /></span><strong>{document.name}</strong></div></td>
                    <td>{document.extension?.toUpperCase() || "FILE"}</td>
                    <td>{version?.revisionCode || `V${document.currentVersionNumber}`}</td>
                    <td><span className={`${styles.sourceDot} ${sourceClass}`} />{document.source === "WEB" ? "Web" : document.source}</td>
                    <td>{formatBytes(version?.sizeBytes || 0)}</td>
                    <td>{formatDate(document.updatedAt)}</td>
                    <td><span className={`${styles.statusBadge} ${version?.status === "AVAILABLE" ? styles.statusAvailable : version?.status === "QUARANTINED" ? styles.statusQuarantine : ""}`}>{version?.status || "–"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className={styles.fileTable}>
            <colgroup>
              <col style={{ width: "31%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "8%" }} />
            </colgroup>
            <thead><tr><th>Név</th><th>Típus</th><th>MIME</th><th>Revízió</th><th>Verzió</th><th>Forrás</th><th>Méret</th><th>Állapot</th></tr></thead>
            <tbody>
              {documents.map((document) => {
                const version = document.currentVersion;
                const selected = selectedDocumentId === document.id;
                return (
                  <tr key={document.id} className={`${styles.fileRow} ${selected ? styles.fileSelected : ""}`} onClick={() => onSelectDocument(document)}>
                    <td><div className={styles.fileNameCell}><span className={fileIconClass(document.extension)}><FileKindIcon extension={document.extension} /></span><strong>{document.name}</strong></div></td>
                    <td>{document.extension?.toUpperCase() || "FILE"}</td>
                    <td title={document.mimeType}>{document.mimeType || "–"}</td>
                    <td>{version?.revisionCode || "–"}</td>
                    <td>V{document.currentVersionNumber}</td>
                    <td>{document.source}</td>
                    <td>{formatBytes(version?.sizeBytes || 0)}</td>
                    <td><span className={`${styles.statusBadge} ${version?.status === "AVAILABLE" ? styles.statusAvailable : version?.status === "QUARANTINED" ? styles.statusQuarantine : ""}`}>{version?.status || "–"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!documents.length && <div className={styles.tableEmpty}><strong>Nincs megjeleníthető fájl</strong>A kiválasztott mappában vagy keresésben nincs találat.</div>}
      </div>
    </section>
  );
}
