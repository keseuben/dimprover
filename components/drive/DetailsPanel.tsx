"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Download, FileSearch2, QrCode, Save, ShieldCheck, StickyNote, X } from "lucide-react";
import type { DriveDocument, DriveDocumentDetails } from "./driveTypes";
import DriveDocumentViewer from "./DriveDocumentViewer";
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
  topic: string;
  planTitle: string;
};

type Props = {
  projectId: string;
  document: DriveDocument | null;
  details: DriveDocumentDetails | null;
  loading: boolean;
  busy: boolean;
  canWrite: boolean;
  canComment: boolean;
  canApprove: boolean;
  securityReady: boolean;
  securityLabel: string;
  onScan: () => Promise<void>;
  onReview: (action: "APPROVE" | "REJECT") => Promise<void>;
  onSaveMetadata: (input: Record<string, unknown>) => Promise<void>;
  onSaveNote: (note: string) => Promise<void>;
  onEnsureQr: () => Promise<void>;
  onDownload: () => Promise<void>;
  responsiveClassName?: string;
  focusTab?: "details" | "review" | "versions" | "notes";
  inheritedDiscipline?: string;
  inheritedTopic?: string;
  reviewFocus?: string;
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
  topic: "",
  planTitle: "",
};

export default function DetailsPanel({
  projectId,
  document,
  details,
  loading,
  busy,
  canWrite,
  canComment,
  canApprove,
  securityReady,
  securityLabel,
  onScan,
  onReview,
  onSaveMetadata,
  onSaveNote,
  onEnsureQr,
  onDownload,
  responsiveClassName = "",
  focusTab,
  inheritedDiscipline = "",
  inheritedTopic = "",
  reviewFocus = "",
}: Props) {
  const [tab, setTab] = useState<"details" | "review" | "versions" | "notes">("details");
  const [metadata, setMetadata] = useState<MetadataForm>(emptyMetadata);
  const [note, setNote] = useState("");

  useEffect(() => { if (focusTab) setTab(focusTab); }, [focusTab]);
  useEffect(() => { if (!reviewFocus || tab !== "review") return; const element = document?.id ? window.document.getElementById("drive-review-" + document.id + "-" + reviewFocus) : null; element?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [document?.id, reviewFocus, tab]);

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
      topic: typeof source.extra?.topic === "string" ? source.extra.topic : "",
      planTitle: typeof source.extra?.planTitle === "string" ? source.extra.planTitle : typeof source.extra?.drawingTitle === "string" ? source.extra.drawingTitle : "",
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
        <button type="button" className={tab === "review" ? styles.detailsTabActive : ""} onClick={() => setTab("review")}>Tervellenőrzés</button>
        <button type="button" className={tab === "versions" ? styles.detailsTabActive : ""} onClick={() => setTab("versions")}>Verziók ({details?.versions.length || 0})</button>
        <button type="button" className={tab === "notes" ? styles.detailsTabActive : ""} onClick={() => setTab("notes")}>Megjegyzések</button>
      </div>

      <div className={styles.detailsBody}>
        {loading ? (
          <div className={styles.previewPlaceholder}><div><FileSearch2 size={24} /><strong>Részletek betöltése…</strong></div></div>
        ) : tab === "details" ? (
          <>
            <DriveDocumentViewer projectId={projectId} document={document} />

            <div className={styles.infoBox}><strong>Öröklött mappabesorolás</strong><br />Szakág: {inheritedDiscipline || "—"} · Témakör: {inheritedTopic || "—"}</div>

            <div className={styles.metaGrid}>
              {([
                ["planNo", "Tervszám"],
                ["planTitle", "Tervlap pontos neve"],
                ["discipline", "Szakág"],
                ["documentType", "Dokumentumtípus"],
                ["revision", "Revízió"],
                ["issueStatus", "Kiadás"],
                ["approvalStatus", "Jóváhagyás"],
                ["building", "Épület"],
                ["level", "Szint"],
                ["zone", "Zóna"],
                ["topic", "Témakör felülírás"],
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

            {document.currentVersion?.status === "QUARANTINED" && (
              <div className={styles.infoBox}>
                <strong>Biztonsági karantén</strong><br />
                {securityReady ? `${securityLabel} elérhető. CLEAN eredmény után a terv belső ellenőrzésre megnyitható; letöltéshez és kiadáshoz továbbra is a dokumentumfolyamat szabályai érvényesek.` : `Vírusellenőrző nem elérhető (${securityLabel}). Az előnézet és kiadás fail-closed tiltva.`}
              </div>
            )}
            {canApprove && document.currentVersion?.status === "QUARANTINED" && (
              <div className={styles.detailsActions}>
                <button type="button" className={`${styles.smallButton} ${styles.smallPrimary}`} disabled={busy || !securityReady} onClick={() => void onScan()}>
                  <ShieldCheck size={12} /> Vírusellenőrzés
                </button>
                <button type="button" className={styles.smallButton} disabled={busy || !securityReady} onClick={() => void onReview("APPROVE")}>
                  <Check size={12} /> Jóváhagyás
                </button>
                <button type="button" className={styles.smallButton} disabled={busy} onClick={() => void onReview("REJECT")}>
                  <X size={12} /> Elutasítás
                </button>
              </div>
            )}

            <div className={styles.detailsActions}>
              <button type="button" className={`${styles.smallButton} ${styles.smallPrimary}`} disabled={!canWrite || busy} onClick={() => void onSaveMetadata({ ...metadata, extra: { ...(details?.metadata?.extra || {}), topic: metadata.topic, planTitle: metadata.planTitle } }))}>
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
        ) : tab === "review" ? (
          <div className={styles.versionList}>
            <div className={styles.infoBox}><strong>Besorolás forrása</strong><br />Szakág: {metadata.discipline ? "fájl felülírás: " + metadata.discipline : inheritedDiscipline ? "mappából örökölt: " + inheritedDiscipline : "—"}<br />Témakör: {metadata.topic ? "fájl felülírás: " + metadata.topic : inheritedTopic ? "mappából örökölt: " + inheritedTopic : "—"}</div>
            {[
              ["Ellenőrzés", details?.metadata?.extra?.reviewChecked ?? details?.metadata?.extra?.hageChecked],
              ["Eredmény", details?.metadata?.extra?.reviewResult ?? details?.metadata?.extra?.hageResult],
              ["Észrevételek", details?.metadata?.extra?.reviewObservations ?? details?.metadata?.extra?.hageObservations],
              ["Workflow állapot", details?.metadata?.extra?.workflowStatus ?? details?.metadata?.approvalStatus],
              ["Belső megjegyzés", details?.metadata?.extra?.internalNote ?? details?.metadata?.extra?.hageNote],
              ["Megrendelő", details?.metadata?.extra?.customerApproval ?? details?.metadata?.extra?.clientApproval],
              ["Megrendelői megjegyzés", details?.metadata?.extra?.customerNote ?? details?.metadata?.extra?.clientNote],
              ["Revízióváltozás", details?.metadata?.extra?.revisionChange ?? details?.metadata?.extra?.change],
            ].map(([label, value], index) => { const keys = ["checked", "result", "observations", "workflow", "internal", "customer", "customer-note", "revision"]; const key = keys[index]; return <div id={"drive-review-" + document.id + "-" + key} className={styles.infoBox} key={String(label)} data-review-focused={reviewFocus === key ? "true" : undefined}><strong>{String(label)}</strong><br />{value ? String(value) : "—"}</div>; })}
          </div>
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
              <textarea id="drive-file-note" rows={8} value={note} readOnly={!canComment} onChange={(event) => setNote(event.target.value)} />
            </div>
            <div className={styles.detailsActions}>
              <button type="button" className={`${styles.smallButton} ${styles.smallPrimary}`} disabled={!canComment || busy} onClick={() => void onSaveNote(note)}>
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
