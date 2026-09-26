"use client";

import { useMemo, useState } from "react";
import { File, FileSpreadsheet, FileText, FolderUp, RefreshCw } from "lucide-react";
import type { DriveDocument, DriveEngineeringMetadata, DriveFolder, DriveViewMode } from "./driveTypes";
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
  boxColorsByDocument?: Record<string, string[]>;
  metadataByDocument?: Record<string, DriveEngineeringMetadata>;
  folders?: DriveFolder[];
  currentFolder?: DriveFolder | null;
  onNavigateParent?: () => void;
  onOpenReviewDetail?: (document: DriveDocument, field: string) => void;
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

function fileNameWithoutExtension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function FileKindIcon({ extension }: { extension: string }) {
  const ext = extension.toLowerCase();
  if (["xlsx", "xls", "csv"].includes(ext)) return <FileSpreadsheet size={13} />;
  if (["doc", "docx", "txt", "rtf"].includes(ext)) return <FileText size={13} />;
  return <File size={13} />;
}

function boxDotClass(token: string) {
  switch (token) {
    case "orange": return `${styles.boxDot} ${styles.boxDotOrange}`;
    case "purple": return `${styles.boxDot} ${styles.boxDotPurple}`;
    case "green": return `${styles.boxDot} ${styles.boxDotGreen}`;
    case "cyan": return `${styles.boxDot} ${styles.boxDotCyan}`;
    case "slate": return `${styles.boxDot} ${styles.boxDotSlate}`;
    default: return `${styles.boxDot} ${styles.boxDotBlue}`;
  }
}

function fileIconClass(extension: string) {
  const ext = extension.toLowerCase();
  if (["xlsx", "xls", "csv"].includes(ext)) return `${styles.fileIcon} ${styles.fileIconSheet}`;
  if (["doc", "docx", "txt", "rtf", "dwg", "dxf"].includes(ext)) return `${styles.fileIcon} ${styles.fileIconDoc}`;
  return styles.fileIcon;
}

function reviewMark(value: string) {
  const v = value.trim().toLocaleLowerCase("hu-HU");
  if (!v) return "—";
  if (v.includes("megfelelő") || v.includes("jóváhagy") || v === "igen" || v === "approved" || v.includes("elfogad")) return "✓";
  if (v.includes("javítandó") || v.includes("elutas")) return "⚠";
  if (v.includes("visszaad")) return "↩";
  if (v.includes("vár") || v.includes("folyamat")) return "◷";
  return "—";
}

function revisionMark(value: string) {
  const v = value.trim().toLocaleUpperCase("hu-HU");
  if (!v || v === "—") return "—";
  if (v.includes("NEM TALÁLHATÓ")) return "✕";
  if (v.includes("ÁTHELYEZVE")) return "↪";
  if (v.includes("MÓDOSULT")) return "●";
  if (v.includes("ÚJ")) return "+";
  return "●";
}

function isApprovedReviewValue(value: string) {
  const normalized = value.trim().toLocaleLowerCase("hu-HU");
  return ["igen", "jóváhagyva", "jóváhagyott", "approved", "elfogadva", "elfogadott"].includes(normalized);
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
  boxColorsByDocument = {},
  metadataByDocument = {},
  folders = [],
  currentFolder = null,
  onNavigateParent,
  onOpenReviewDetail,
}: Props) {
  const [reviewDiscipline, setReviewDiscipline] = useState("all");
  const [reviewTopic, setReviewTopic] = useState("all");
  const [reviewStatus, setReviewStatus] = useState("all");
  const [reviewSearch, setReviewSearch] = useState("");

  const effectiveFolderClassification = useMemo(() => {
    const result = new Map<string, { discipline: string; topic: string }>();
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    for (const folder of folders) {
      const visited = new Set<string>();
      let discipline = "";
      let topic = "";
      let current: DriveFolder | undefined = folder;
      while (current && !visited.has(current.id) && (!discipline || !topic)) {
        visited.add(current.id);
        discipline ||= String(current.discipline || "").trim();
        topic ||= String(current.topic || "").trim();
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      result.set(folder.id, { discipline, topic });
    }
    return result;
  }, [folders]);

  const allReviewRows = useMemo(() => documents.map((document) => {
    const metadata = metadataByDocument[document.id];
    const inherited = effectiveFolderClassification.get(document.folderId);
    const extra = metadata?.extra || {};
    const value = (key: string) => typeof extra[key] === "string" ? String(extra[key]).trim() : "";
    const observations = value("reviewObservations") || value("hageObservations");
    const observationCountRaw = Number(extra.openObservationCount ?? (observations ? 1 : 0));
    return {
      document,
      explicitName: value("planTitle") || value("drawingTitle"),
      displayName: (value("planTitle") || value("drawingTitle")) || fileNameWithoutExtension(document.name),
      effectiveDiscipline: metadata?.discipline || inherited?.discipline || "",
      effectiveTopic: value("topic") || inherited?.topic || "",
      checked: value("reviewChecked") || value("hageChecked"),
      result: value("reviewResult") || value("hageResult"),
      observations,
      workflow: value("workflowStatus") || metadata?.approvalStatus || "",
      internalNote: value("internalNote") || value("hageNote"),
      customer: value("customerApproval") || value("clientApproval"),
      customerNote: value("customerNote") || value("clientNote"),
      revisionChange: value("revisionChange") || value("change"),
      observationCount: Number.isFinite(observationCountRaw) ? observationCountRaw : 0,
    };
  }), [documents, effectiveFolderClassification, metadataByDocument]);

  const reviewRows = useMemo(() => {
    const q = reviewSearch.trim().toLocaleLowerCase("hu-HU");
    return allReviewRows.filter((row) => {
      const matchesSearch = !q || [
        row.displayName,
        row.document.name,
        row.effectiveDiscipline,
        row.effectiveTopic,
        row.observations,
        row.internalNote,
        row.customerNote,
      ].some((value) => value.toLocaleLowerCase("hu-HU").includes(q));
      return matchesSearch
        && (reviewDiscipline === "all" || row.effectiveDiscipline === reviewDiscipline)
        && (reviewTopic === "all" || row.effectiveTopic === reviewTopic)
        && (reviewStatus === "all" || (reviewStatus === "not-approved" ? !isApprovedReviewValue(row.customer) : row.workflow === reviewStatus));
    });
  }, [allReviewRows, reviewDiscipline, reviewSearch, reviewStatus, reviewTopic]);

  const reviewDisciplines = useMemo(() => [...new Set(allReviewRows.map((row) => row.effectiveDiscipline).filter(Boolean))].sort(), [allReviewRows]);
  const reviewTopics = useMemo(() => [...new Set(allReviewRows.map((row) => row.effectiveTopic).filter(Boolean))].sort(), [allReviewRows]);
  const reviewStatuses = useMemo(() => [...new Set(allReviewRows.map((row) => row.workflow).filter(Boolean))].sort(), [allReviewRows]);

  const openDetail = (document: DriveDocument, field: string) => {
    onSelectDocument(document);
    onOpenReviewDetail?.(document, field);
  };

  return (
    <section className={styles.filePanel}>
      <header className={styles.filePanelTop}>
        <div className={styles.filePanelTitle}>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <div className={styles.viewToggle}>
          <button type="button" className={viewMode === "simple" ? styles.viewToggleActive : ""} onClick={() => onViewModeChange("simple")}>
            Egyszerű nézet
          </button>
          <button type="button" className={viewMode === "engineering" ? styles.viewToggleActive : ""} onClick={() => onViewModeChange("engineering")}>
            Mérnöki nézet
          </button>
          <button type="button" className={viewMode === "review" ? styles.viewToggleActive : ""} onClick={() => onViewModeChange("review")}>
            Tervellenőrzés
          </button>
          <button type="button" onClick={onRefresh} title="Fájllista frissítése"><RefreshCw size={12} /></button>
        </div>
      </header>

      {viewMode === "review" ? (
        <div className={styles.reviewHost}>
          <header className={styles.reviewHeader}>
            <div><span>Tervellenőrzés</span><strong>{reviewRows.length} / {allReviewRows.length} terv</strong></div>
            <div className={styles.reviewLegend}>✓ megfelelő · ⚠ javítandó · ↩ visszaadva · ◷ folyamatban · + új · ● módosult · ↪ áthelyezve · ✕ nem található · — nincs adat</div>
          </header>
          <div className={styles.reviewFilters}>
            <label>Keresés<input className={styles.reviewSearch} value={reviewSearch} onChange={(event) => setReviewSearch(event.target.value)} placeholder="Név, fájlnév, észrevétel…" /></label>
            <label>Szakág<select value={reviewDiscipline} onChange={(event) => setReviewDiscipline(event.target.value)}><option value="all">Mind</option>{reviewDisciplines.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label>Témakör<select value={reviewTopic} onChange={(event) => setReviewTopic(event.target.value)}><option value="all">Mind</option>{reviewTopics.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label>Workflow állapot<select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value)}><option value="all">Mind</option><option value="not-approved">Nincs még jóváhagyva</option>{reviewStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <button type="button" className={styles.reviewReset} disabled={!reviewSearch && reviewDiscipline === "all" && reviewTopic === "all" && reviewStatus === "all"} onClick={() => { setReviewSearch(""); setReviewDiscipline("all"); setReviewTopic("all"); setReviewStatus("all"); }}>Szűrők törlése</button>
          </div>
          <div className={styles.reviewTableWrap}>
            <table className={styles.reviewTable}>
              <colgroup>
                <col style={{ width: "250px" }} />
                <col style={{ width: "260px" }} />
                <col style={{ width: "58px" }} />
                <col style={{ width: "95px" }} />
                <col style={{ width: "120px" }} />
                <col style={{ width: "70px" }} />
                <col style={{ width: "80px" }} />
                <col style={{ width: "80px" }} />
                <col style={{ width: "95px" }} />
                <col style={{ width: "85px" }} />
                <col style={{ width: "80px" }} />
                <col style={{ width: "95px" }} />
                <col style={{ width: "80px" }} />
              </colgroup>
              <thead><tr><th>Név</th><th>Fájlnév</th><th>Típus</th><th>Szakág</th><th>Témakör</th><th>Ell.</th><th>Eredmény</th><th>Észrev.</th><th>Állapot</th><th>Belső megj.</th><th>Megrend.</th><th>Megr. megj.</th><th>Revízió</th></tr></thead>
              <tbody>
                {currentFolder && onNavigateParent && (
                  <tr className={styles.folderUpRow} onClick={onNavigateParent} title="Vissza a szülőmappába">
                    <td colSpan={13}>
                      <div className={styles.folderUpCell}>
                        <span className={styles.folderUpIcon}><FolderUp size={15} /></span>
                        <strong>[..]</strong>
                        <span>{currentFolder.parentId ? "Szülőmappa" : "Dokumentumtár"}</span>
                      </div>
                    </td>
                  </tr>
                )}
                {reviewRows.map((row) => (
                  <tr key={row.document.id}>
                    <td>
                      <button
                        type="button"
                        className={`${styles.reviewName} ${row.explicitName ? styles.reviewNameExplicit : styles.reviewNameFallback}`}
                        title={row.explicitName ? "Megadott név" : "Automatikus név a fájlnévből"}
                        onClick={() => openDetail(row.document, "checked")}
                      >
                        {row.displayName}
                      </button>
                    </td>
                    <td className={styles.reviewFileName} title={row.document.name}>{row.document.name}</td>
                    <td>
                      <span className={fileIconClass(row.document.extension)} title={row.document.extension?.toUpperCase() || "Fájl"}>
                        <FileKindIcon extension={row.document.extension} />
                      </span>
                    </td>
                    <td>{row.effectiveDiscipline || "—"}</td>
                    <td>{row.effectiveTopic || "—"}</td>
                    <td><button type="button" className={styles.reviewSymbol} title={row.checked || "Nincs ellenőrzési adat"} onClick={() => openDetail(row.document, "checked")}>{reviewMark(row.checked)}</button></td>
                    <td><button type="button" className={styles.reviewSymbol} title={row.result || "Nincs eredmény"} onClick={() => openDetail(row.document, "result")}>{reviewMark(row.result)}</button></td>
                    <td><button type="button" className={styles.reviewSymbol} title={row.observations || "Nincs észrevétel"} onClick={() => openDetail(row.document, "observations")}>{row.observationCount || "—"}</button></td>
                    <td><button type="button" className={styles.reviewSymbol} title={row.workflow || "Nincs workflow állapot"} onClick={() => openDetail(row.document, "workflow")}>{reviewMark(row.workflow)}</button></td>
                    <td><button type="button" className={styles.reviewSymbol} title={row.internalNote || "Nincs belső megjegyzés"} onClick={() => openDetail(row.document, "internal")}>{row.internalNote ? "●" : "—"}</button></td>
                    <td><button type="button" className={styles.reviewSymbol} title={row.customer || "Nincs megrendelői jóváhagyás"} onClick={() => openDetail(row.document, "customer")}>{reviewMark(row.customer)}</button></td>
                    <td><button type="button" className={styles.reviewSymbol} title={row.customerNote || "Nincs megrendelői megjegyzés"} onClick={() => openDetail(row.document, "customer-note")}>{row.customerNote ? "●" : "—"}</button></td>
                    <td><button type="button" className={styles.reviewSymbol} title={row.revisionChange || "Nincs revízióváltozás"} onClick={() => openDetail(row.document, "revision")}>{revisionMark(row.revisionChange)}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!reviewRows.length && <div className={styles.tableEmpty}><strong>Nincs megjeleníthető terv</strong>A jelenlegi tervellenőrzési szűrésre nincs találat.</div>}
          </div>
        </div>
      ) : (
        <div className={styles.fileTableWrap}>
          {viewMode === "simple" ? (
            <table className={styles.fileTable}>
              <colgroup>
                <col style={{ width: "34%" }} /><col style={{ width: "8%" }} /><col style={{ width: "8%" }} /><col style={{ width: "9%" }} /><col style={{ width: "10%" }} /><col style={{ width: "14%" }} /><col style={{ width: "9%" }} /><col style={{ width: "8%" }} />
              </colgroup>
              <thead><tr><th>Név</th><th>Típus</th><th>Revízió</th><th>Forrás</th><th>Méret</th><th>Feltöltve</th><th>BOX</th><th>Állapot</th></tr></thead>
              <tbody>
                {currentFolder && onNavigateParent && (
                  <tr className={styles.folderUpRow} onClick={onNavigateParent} title="Vissza a szülőmappába">
                    <td colSpan={8}>
                      <div className={styles.folderUpCell}>
                        <span className={styles.folderUpIcon}><FolderUp size={15} /></span>
                        <strong>[..]</strong>
                        <span>{currentFolder.parentId ? "Szülőmappa" : "Dokumentumtár"}</span>
                      </div>
                    </td>
                  </tr>
                )}
                {documents.map((document) => {
                  const version = document.currentVersion;
                  const selected = selectedDocumentId === document.id;
                  const sourceClass = document.source === "DROP" ? styles.sourceDrop : document.source === "DESKTOP" ? styles.sourceDesktop : "";
                  return (
                    <tr key={document.id} className={`${styles.fileRow} ${selected ? styles.fileSelected : ""}`} onClick={() => onSelectDocument(document)} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-dimpro-drive-document", JSON.stringify({ documentId: document.id, versionId: version?.id || null })); }} title="Kijelöléshez kattints; CsomagBOX-hoz húzd a fájlt a polcra.">
                      <td><div className={styles.fileNameCell}><span className={fileIconClass(document.extension)}><FileKindIcon extension={document.extension} /></span><strong>{document.name}</strong></div></td>
                      <td>{document.extension?.toUpperCase() || "FILE"}</td>
                      <td>{version?.revisionCode || `V${document.currentVersionNumber}`}</td>
                      <td><span className={`${styles.sourceDot} ${sourceClass}`} />{document.source === "WEB" ? "Web" : document.source}</td>
                      <td>{formatBytes(version?.sizeBytes || 0)}</td>
                      <td>{formatDate(document.updatedAt)}</td>
                      <td><div className={styles.boxDots}>{(boxColorsByDocument[document.id] || []).slice(0, 4).map((token, index) => <span key={`${token}-${index}`} className={boxDotClass(token)} />)}{(boxColorsByDocument[document.id] || []).length > 4 && <small>+{(boxColorsByDocument[document.id] || []).length - 4}</small>}</div></td>
                      <td><span className={`${styles.statusBadge} ${version?.status === "AVAILABLE" ? styles.statusAvailable : version?.status === "QUARANTINED" ? styles.statusQuarantine : ""}`}>{version?.status || "–"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className={styles.fileTable}>
              <colgroup>
                <col style={{ width: "28%" }} /><col style={{ width: "8%" }} /><col style={{ width: "11%" }} /><col style={{ width: "8%" }} /><col style={{ width: "8%" }} /><col style={{ width: "9%" }} /><col style={{ width: "10%" }} /><col style={{ width: "10%" }} /><col style={{ width: "8%" }} />
              </colgroup>
              <thead><tr><th>Név</th><th>Típus</th><th>MIME</th><th>Revízió</th><th>Verzió</th><th>Forrás</th><th>Méret</th><th>BOX</th><th>Állapot</th></tr></thead>
              <tbody>
                {currentFolder && onNavigateParent && (
                  <tr className={styles.folderUpRow} onClick={onNavigateParent} title="Vissza a szülőmappába">
                    <td colSpan={9}>
                      <div className={styles.folderUpCell}>
                        <span className={styles.folderUpIcon}><FolderUp size={15} /></span>
                        <strong>[..]</strong>
                        <span>{currentFolder.parentId ? "Szülőmappa" : "Dokumentumtár"}</span>
                      </div>
                    </td>
                  </tr>
                )}
                {documents.map((document) => {
                  const version = document.currentVersion;
                  const selected = selectedDocumentId === document.id;
                  return (
                    <tr key={document.id} className={`${styles.fileRow} ${selected ? styles.fileSelected : ""}`} onClick={() => onSelectDocument(document)} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-dimpro-drive-document", JSON.stringify({ documentId: document.id, versionId: version?.id || null })); }} title="Kijelöléshez kattints; CsomagBOX-hoz húzd a fájlt a polcra.">
                      <td><div className={styles.fileNameCell}><span className={fileIconClass(document.extension)}><FileKindIcon extension={document.extension} /></span><strong>{document.name}</strong></div></td>
                      <td>{document.extension?.toUpperCase() || "FILE"}</td>
                      <td title={document.mimeType}>{document.mimeType || "–"}</td>
                      <td>{version?.revisionCode || "–"}</td>
                      <td>V{document.currentVersionNumber}</td>
                      <td>{document.source}</td>
                      <td>{formatBytes(version?.sizeBytes || 0)}</td>
                      <td><div className={styles.boxDots}>{(boxColorsByDocument[document.id] || []).slice(0, 4).map((token, index) => <span key={`${token}-${index}`} className={boxDotClass(token)} />)}{(boxColorsByDocument[document.id] || []).length > 4 && <small>+{(boxColorsByDocument[document.id] || []).length - 4}</small>}</div></td>
                      <td><span className={`${styles.statusBadge} ${version?.status === "AVAILABLE" ? styles.statusAvailable : version?.status === "QUARANTINED" ? styles.statusQuarantine : ""}`}>{version?.status || "–"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!documents.length && <div className={styles.tableEmpty}><strong>Nincs megjeleníthető fájl</strong>A kiválasztott mappában vagy keresésben nincs találat.</div>}
        </div>
      )}
    </section>
  );
}
