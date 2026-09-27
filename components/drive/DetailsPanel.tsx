"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Check, CheckCircle2, ClipboardCheck, Download, FileSearch2, Lock, QrCode, Save, ShieldCheck, StickyNote, UploadCloud, UserCheck, X } from "lucide-react";
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

type ReviewForm = {
  checked: string;
  result: string;
  observations: string;
  workflow: string;
  internal: string;
  customer: string;
  customerNote: string;
  revisionChange: string;
  projectManager: string;
  investorProjectManager: string;
  lifecycle: string;
  openObservationCount: string;
};

const emptyReview: ReviewForm = {
  checked: "",
  result: "",
  observations: "",
  workflow: "",
  internal: "",
  customer: "",
  customerNote: "",
  revisionChange: "",
  projectManager: "",
  investorProjectManager: "",
  lifecycle: "",
  openObservationCount: "0",
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
  membershipRole?: "OWNER" | "PROJECT_MANAGER" | "CONTRIBUTOR" | "REVIEWER" | "VIEWER" | "";
  membershipDisplayName?: string;
  securityReady: boolean;
  securityLabel: string;
  onScan: () => Promise<void>;
  onReview: (action: "APPROVE" | "REJECT") => Promise<void>;
  onSaveMetadata: (input: Record<string, unknown>) => Promise<void>;
  onSaveReview: (fields: Record<string, string | number>) => Promise<void>;
  onSaveNote: (note: string) => Promise<void>;
  onEnsureQr: () => Promise<void>;
  onDownload: () => Promise<void>;
  responsiveClassName?: string;
  focusTab?: "details" | "review" | "versions" | "notes";
  inheritedDiscipline?: string;
  inheritedTopic?: string;
  reviewFocus?: string;
};

function formatAuditDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("hu-HU", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function isApprovedDecision(value: string) {
  const normalized = value.trim().toLocaleLowerCase("hu-HU");
  return ["igen", "jóváhagyva", "jóváhagyott", "approved", "elfogadva", "elfogadott"].includes(normalized);
}

function reviewAuditLine(extra: Record<string, unknown>, prefix: string) {
  const name = typeof extra[prefix + "ByName"] === "string" ? String(extra[prefix + "ByName"]).trim() : "";
  const at = formatAuditDate(extra[prefix + "At"]);
  const decision = typeof extra[prefix + "Decision"] === "string" ? String(extra[prefix + "Decision"]).trim() : "";
  if (!name && !at && !decision) return "";
  return [decision, name, at].filter(Boolean).join(" · ");
}

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
  membershipRole = "",
  membershipDisplayName = "",
  securityReady,
  securityLabel,
  onScan,
  onReview,
  onSaveMetadata,
  onSaveReview,
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
  const [review, setReview] = useState<ReviewForm>(emptyReview);
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
    const extra = source?.extra || {};
    setReview({
      checked: typeof extra.reviewChecked === "string" ? extra.reviewChecked : typeof extra.hageChecked === "string" ? extra.hageChecked : "",
      result: typeof extra.reviewResult === "string" ? extra.reviewResult : typeof extra.hageResult === "string" ? extra.hageResult : "",
      observations: typeof extra.reviewObservations === "string" ? extra.reviewObservations : typeof extra.hageObservations === "string" ? extra.hageObservations : "",
      workflow: typeof extra.workflowStatus === "string" ? extra.workflowStatus : source?.approvalStatus || "",
      internal: typeof extra.internalNote === "string" ? extra.internalNote : typeof extra.hageNote === "string" ? extra.hageNote : "",
      customer: typeof extra.customerApproval === "string" ? extra.customerApproval : typeof extra.clientApproval === "string" ? extra.clientApproval : "",
      customerNote: typeof extra.customerNote === "string" ? extra.customerNote : typeof extra.clientNote === "string" ? extra.clientNote : "",
      revisionChange: typeof extra.revisionChange === "string" ? extra.revisionChange : typeof extra.change === "string" ? extra.change : "",
      projectManager: typeof extra.projectManagerApproval === "string" ? extra.projectManagerApproval : "",
      investorProjectManager: typeof extra.investorProjectManagerApproval === "string" ? extra.investorProjectManagerApproval : "",
      lifecycle: typeof extra.lifecycleStatus === "string" ? extra.lifecycleStatus : "",
      openObservationCount: String(Number.isFinite(Number(extra.openObservationCount)) ? Number(extra.openObservationCount) : 0),
    });
    setNote(details?.notes?.[0]?.note || "");
  }, [details?.document.id, details?.metadata, details?.notes]);

  const activeQr = useMemo(() => details?.qrCodes.find((qr) => qr.status === "ACTIVE") || null, [details?.qrCodes]);
  const reviewExtra = (details?.metadata?.extra || {}) as Record<string, unknown>;
  const canTechnicalReview = canApprove;
  const canCustomerApproval = canApprove && (membershipRole === "PROJECT_MANAGER" || membershipRole === "OWNER");
  const canProjectManagerApproval = canApprove && (membershipRole === "PROJECT_MANAGER" || membershipRole === "OWNER");
  const canInvestorProjectManagerApproval = canApprove && membershipRole === "OWNER";
  const canLifecycleEdit = membershipRole === "PROJECT_MANAGER" || membershipRole === "OWNER";
  const canAnyReviewEdit = canTechnicalReview || canCustomerApproval || canProjectManagerApproval || canInvestorProjectManagerApproval || canLifecycleEdit;
  const reviewReturned = review.workflow.toLocaleLowerCase("hu-HU").includes("vissza") || review.result.toLocaleLowerCase("hu-HU").includes("javítand") || review.result.toLocaleLowerCase("hu-HU").includes("visszaad");
  const technicalDone = review.result.toLocaleLowerCase("hu-HU") === "megfelelő";
  const customerDone = isApprovedDecision(review.customer);
  const managerDone = isApprovedDecision(review.projectManager);
  const investorDone = isApprovedDecision(review.investorProjectManager);
  const lifecycleDone = review.lifecycle === "Aktuális";

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
              <button type="button" className={`${styles.smallButton} ${styles.smallPrimary}`} disabled={!canWrite || busy} onClick={() => void onSaveMetadata({ ...metadata, extra: { ...(details?.metadata?.extra || {}), topic: metadata.topic, planTitle: metadata.planTitle } })}>
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

            <div className={styles.reviewProgress} aria-label="Tervellenőrzési folyamat">
              {([
                { key: "upload", label: "Feltöltve", Icon: UploadCloud, done: true, active: false, target: "" },
                { key: "technical", label: reviewReturned ? "Visszaadva" : "Ellenőrzés", Icon: ClipboardCheck, done: technicalDone && !reviewReturned, active: reviewReturned || !technicalDone, target: "technical" },
                { key: "customer", label: "Megrendelő", Icon: UserCheck, done: customerDone, active: technicalDone && !customerDone, target: "customer" },
                { key: "manager", label: "Projektvezető", Icon: BadgeCheck, done: managerDone, active: customerDone && !managerDone, target: "manager" },
                { key: "investor", label: "Beruházói PV", Icon: ShieldCheck, done: investorDone, active: managerDone && !investorDone, target: "investor" },
                { key: "current", label: "Aktuális", Icon: CheckCircle2, done: lifecycleDone, active: investorDone && !lifecycleDone, target: "lifecycle" },
              ] as const).map((step, index, steps) => (
                <div className={styles.reviewProgressStepWrap} key={step.key}>
                  <button type="button" className={styles.reviewProgressStep + " " + (step.done ? styles.reviewProgressDone : step.active ? (reviewReturned && step.key === "technical" ? styles.reviewProgressReturned : styles.reviewProgressActive) : styles.reviewProgressPending)} title={step.label} onClick={() => { if (!step.target) return; window.document.getElementById("drive-review-section-" + document.id + "-" + step.target)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }}>
                    <step.Icon size={15} /><span>{step.label}</span>
                  </button>
                  {index < steps.length - 1 && <span className={styles.reviewProgressLine} data-done={step.done ? "true" : undefined} />}
                </div>
              ))}
            </div>

            <div className={styles.reviewRoleInfo}>
              <span>Aktív projektjogosultság</span>
              <strong>{membershipDisplayName || "DIMPRO felhasználó"} · {membershipRole === "OWNER" ? "Beruházási projektvezető" : membershipRole === "PROJECT_MANAGER" ? "Projektvezető" : membershipRole === "REVIEWER" ? "Ellenőrző" : membershipRole === "CONTRIBUTOR" ? "Közreműködő" : membershipRole === "VIEWER" ? "Megtekintő" : "Projekt résztvevő"}</strong>
            </div>

            <section id={"drive-review-section-" + document.id + "-technical"} className={styles.reviewSection}>
              <header className={styles.reviewSectionHeader}>
                <div><ClipboardCheck size={16} /><span><strong>Műszaki ellenőrzés</strong><small>Ellenőrzési eredmény, észrevételek és revízió</small></span></div>
                <span className={canTechnicalReview ? styles.reviewPermissionActive : styles.reviewPermissionLocked}>{canTechnicalReview ? "Szerkeszthető" : <><Lock size={11} /> Nincs jogosultság</>}</span>
              </header>
              <div className={styles.reviewEditorGrid}>
                <div id={"drive-review-" + document.id + "-checked"} className={styles.reviewEditorItem} data-review-focused={reviewFocus === "checked" ? "true" : undefined}>
                  <label htmlFor="drive-review-checked">Ellenőrzés</label>
                  <select id="drive-review-checked" value={review.checked} disabled={!canTechnicalReview || busy} onChange={(event) => setReview((current) => ({ ...current, checked: event.target.value }))}><option value="">—</option><option value="Igen">Igen</option><option value="Nem">Nem</option></select>
                </div>
                <div id={"drive-review-" + document.id + "-result"} className={styles.reviewEditorItem} data-review-focused={reviewFocus === "result" ? "true" : undefined}>
                  <label htmlFor="drive-review-result">Eredmény</label>
                  <select id="drive-review-result" value={review.result} disabled={!canTechnicalReview || busy} onChange={(event) => setReview((current) => ({ ...current, result: event.target.value }))}><option value="">—</option><option value="Megfelelő">Megfelelő</option><option value="Javítandó">Javítandó</option><option value="Visszaadva">Visszaadva</option></select>
                </div>
                <div id={"drive-review-" + document.id + "-workflow"} className={styles.reviewEditorItem} data-review-focused={reviewFocus === "workflow" ? "true" : undefined}>
                  <label htmlFor="drive-review-workflow">Workflow állapot</label>
                  <select id="drive-review-workflow" value={review.workflow} disabled={!canTechnicalReview || busy} onChange={(event) => setReview((current) => ({ ...current, workflow: event.target.value }))}>
                    <option value="">—</option><option value="Ellenőrzésre vár">Ellenőrzésre vár</option><option value="Ellenőrzés alatt">Ellenőrzés alatt</option><option value="Folyamatban">Folyamatban</option><option value="Javításra visszaadva">Javításra visszaadva</option><option value="Jóváhagyásra vár">Jóváhagyásra vár</option><option value="Jóváhagyva">Jóváhagyva</option><option value="Elutasítva">Elutasítva</option>
                  </select>
                  {reviewAuditLine(reviewExtra, "workflowChanged") && <small className={styles.reviewAuditLine}>{reviewAuditLine(reviewExtra, "workflowChanged")}</small>}
                </div>
                <div id={"drive-review-" + document.id + "-revision"} className={styles.reviewEditorItem} data-review-focused={reviewFocus === "revision" ? "true" : undefined}>
                  <label htmlFor="drive-review-revision">Revízióváltozás</label>
                  <select id="drive-review-revision" value={review.revisionChange} disabled={!canTechnicalReview || busy} onChange={(event) => setReview((current) => ({ ...current, revisionChange: event.target.value }))}><option value="">—</option><option value="ÚJ">ÚJ</option><option value="MÓDOSULT">MÓDOSULT</option><option value="ÁTHELYEZVE">ÁTHELYEZVE</option><option value="NEM TALÁLHATÓ">NEM TALÁLHATÓ</option></select>
                </div>
                <div className={styles.reviewEditorItem}>
                  <label htmlFor="drive-review-count">Nyitott észrevételek</label>
                  <input id="drive-review-count" type="number" min="0" value={review.openObservationCount} disabled={!canTechnicalReview || busy} onChange={(event) => setReview((current) => ({ ...current, openObservationCount: event.target.value }))} />
                </div>
                <div id={"drive-review-" + document.id + "-observations"} className={styles.reviewEditorItem + " " + styles.reviewEditorFull} data-review-focused={reviewFocus === "observations" ? "true" : undefined}>
                  <label htmlFor="drive-review-observations">Észrevételek</label>
                  <textarea id="drive-review-observations" rows={4} value={review.observations} readOnly={!canTechnicalReview} disabled={busy} onChange={(event) => setReview((current) => ({ ...current, observations: event.target.value }))} />
                </div>
                <div id={"drive-review-" + document.id + "-internal"} className={styles.reviewEditorItem + " " + styles.reviewEditorFull} data-review-focused={reviewFocus === "internal" ? "true" : undefined}>
                  <label htmlFor="drive-review-internal">Belső megjegyzés</label>
                  <textarea id="drive-review-internal" rows={3} value={review.internal} readOnly={!canTechnicalReview} disabled={busy} onChange={(event) => setReview((current) => ({ ...current, internal: event.target.value }))} />
                </div>
              </div>
            </section>

            <section id={"drive-review-section-" + document.id + "-customer"} className={styles.reviewSection}>
              <header className={styles.reviewSectionHeader}>
                <div><UserCheck size={16} /><span><strong>Megrendelői jóváhagyás</strong><small>Megrendelői döntés és megjegyzés</small></span></div>
                <span className={canCustomerApproval ? styles.reviewPermissionActive : styles.reviewPermissionLocked}>{canCustomerApproval ? "Szerkeszthető" : <><Lock size={11} /> Nincs jogosultság</>}</span>
              </header>
              <div className={styles.reviewEditorGrid}>
                <div id={"drive-review-" + document.id + "-customer"} className={styles.reviewEditorItem} data-review-focused={reviewFocus === "customer" ? "true" : undefined}>
                  <label htmlFor="drive-review-customer">Megrendelő</label>
                  <select id="drive-review-customer" value={review.customer} disabled={!canCustomerApproval || busy} onChange={(event) => setReview((current) => ({ ...current, customer: event.target.value }))}><option value="">—</option><option value="Jóváhagyva">Jóváhagyva</option><option value="Elutasítva">Elutasítva</option></select>
                  {reviewAuditLine(reviewExtra, "customerApproval") && <small className={styles.reviewAuditLine}>{reviewAuditLine(reviewExtra, "customerApproval")}</small>}
                </div>
                <div id={"drive-review-" + document.id + "-customer-note"} className={styles.reviewEditorItem + " " + styles.reviewEditorFull} data-review-focused={reviewFocus === "customer-note" ? "true" : undefined}>
                  <label htmlFor="drive-review-customer-note">Megrendelői megjegyzés</label>
                  <textarea id="drive-review-customer-note" rows={3} value={review.customerNote} readOnly={!canCustomerApproval} disabled={busy} onChange={(event) => setReview((current) => ({ ...current, customerNote: event.target.value }))} />
                </div>
              </div>
            </section>

            <section id={"drive-review-section-" + document.id + "-manager"} className={styles.reviewSection}>
              <header className={styles.reviewSectionHeader}>
                <div><BadgeCheck size={16} /><span><strong>Projektvezetői jóváhagyás</strong><small>Projektvezetői döntési szint</small></span></div>
                <span className={canProjectManagerApproval ? styles.reviewPermissionActive : styles.reviewPermissionLocked}>{canProjectManagerApproval ? "Szerkeszthető" : <><Lock size={11} /> Nincs jogosultság</>}</span>
              </header>
              <div className={styles.reviewEditorGrid}>
                <div id={"drive-review-" + document.id + "-project-manager"} className={styles.reviewEditorItem + " " + styles.reviewEditorFull} data-review-focused={reviewFocus === "project-manager" ? "true" : undefined}>
                  <label htmlFor="drive-review-project-manager">Projektvezetői jóváhagyás</label>
                  <select id="drive-review-project-manager" value={review.projectManager} disabled={!canProjectManagerApproval || busy} onChange={(event) => setReview((current) => ({ ...current, projectManager: event.target.value }))}><option value="">—</option><option value="Jóváhagyva">Jóváhagyva</option><option value="Elutasítva">Elutasítva</option></select>
                  {reviewAuditLine(reviewExtra, "projectManagerApproval") && <small className={styles.reviewAuditLine}>{reviewAuditLine(reviewExtra, "projectManagerApproval")}</small>}
                </div>
              </div>
            </section>

            <section id={"drive-review-section-" + document.id + "-investor"} className={styles.reviewSection}>
              <header className={styles.reviewSectionHeader}>
                <div><ShieldCheck size={16} /><span><strong>Beruházói projektvezetői jóváhagyás</strong><small>Végső beruházói döntési szint</small></span></div>
                <span className={canInvestorProjectManagerApproval ? styles.reviewPermissionActive : styles.reviewPermissionLocked}>{canInvestorProjectManagerApproval ? "Szerkeszthető" : <><Lock size={11} /> Nincs jogosultság</>}</span>
              </header>
              <div className={styles.reviewEditorGrid}>
                <div id={"drive-review-" + document.id + "-investor-project-manager"} className={styles.reviewEditorItem + " " + styles.reviewEditorFull} data-review-focused={reviewFocus === "investor-project-manager" ? "true" : undefined}>
                  <label htmlFor="drive-review-investor-project-manager">Beruházói projektvezető</label>
                  <select id="drive-review-investor-project-manager" value={review.investorProjectManager} disabled={!canInvestorProjectManagerApproval || busy} onChange={(event) => setReview((current) => ({ ...current, investorProjectManager: event.target.value }))}><option value="">—</option><option value="Jóváhagyva">Jóváhagyva</option><option value="Elutasítva">Elutasítva</option></select>
                  {reviewAuditLine(reviewExtra, "investorProjectManagerApproval") && <small className={styles.reviewAuditLine}>{reviewAuditLine(reviewExtra, "investorProjectManagerApproval")}</small>}
                </div>
              </div>
            </section>

            <section id={"drive-review-section-" + document.id + "-lifecycle"} className={styles.reviewSection}>
              <header className={styles.reviewSectionHeader}>
                <div><CheckCircle2 size={16} /><span><strong>Terv életciklusa</strong><small>Munkaközi, aktuális vagy archív állapot</small></span></div>
                <span className={canLifecycleEdit ? styles.reviewPermissionActive : styles.reviewPermissionLocked}>{canLifecycleEdit ? "Szerkeszthető" : <><Lock size={11} /> Nincs jogosultság</>}</span>
              </header>
              <div className={styles.reviewEditorGrid}>
                <div id={"drive-review-" + document.id + "-lifecycle"} className={styles.reviewEditorItem + " " + styles.reviewEditorFull} data-review-focused={reviewFocus === "lifecycle" ? "true" : undefined}>
                  <label htmlFor="drive-review-lifecycle">Terv életciklusa</label>
                  <select id="drive-review-lifecycle" value={review.lifecycle} disabled={!canLifecycleEdit || busy} onChange={(event) => setReview((current) => ({ ...current, lifecycle: event.target.value }))}><option value="">—</option><option value="Munkaközi">Munkaközi</option><option value="Aktuális">Aktuális</option><option value="Archív">Archív</option></select>
                  {reviewAuditLine(reviewExtra, "lifecycleChanged") && <small className={styles.reviewAuditLine}>{reviewAuditLine(reviewExtra, "lifecycleChanged")}</small>}
                </div>
              </div>
            </section>
            <div className={styles.detailsActions}>
              <button
                type="button"
                className={styles.smallButton + " " + styles.smallPrimary}
                disabled={!canAnyReviewEdit || busy}
                onClick={() => void onSaveReview({
                  ...(canTechnicalReview ? {
                    reviewChecked: review.checked,
                    reviewResult: review.result,
                    reviewObservations: review.observations,
                    workflowStatus: review.workflow,
                    internalNote: review.internal,
                    revisionChange: review.revisionChange,
                    openObservationCount: Math.max(0, Number(review.openObservationCount) || 0),
                  } : {}),
                  ...(canCustomerApproval ? { customerApproval: review.customer, customerNote: review.customerNote } : {}),
                  ...(canProjectManagerApproval ? { projectManagerApproval: review.projectManager } : {}),
                  ...(canInvestorProjectManagerApproval ? { investorProjectManagerApproval: review.investorProjectManager } : {}),
                  ...(canLifecycleEdit ? { lifecycleStatus: review.lifecycle } : {}),
                })}
              >
                <Save size={12} /> Jogosult szakaszok mentése
              </button>
            </div>
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
