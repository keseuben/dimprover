"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Check, CheckCircle2, ChevronDown, ChevronUp, ClipboardCheck, Download, FileSearch2, Lock, Mic, Plus, QrCode, Save, ShieldCheck, Square, StickyNote, Trash2, UploadCloud, UserCheck, X } from "lucide-react";
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
  scales: string[];
};

type MetadataTextKey = Exclude<keyof MetadataForm, "scales">;

type ReviewSectionKey = "technical" | "customer" | "manager" | "investor" | "lifecycle";

type ReviewObservationItem = { id: string; text: string; source: "text" | "voice" };

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

type ReviewForm = {
  checked: string;
  result: string;
  observations: string;
  observationItems: ReviewObservationItem[];
  workflow: string;
  internal: string;
  customer: string;
  customerNote: string;
  customerObservationItems: ReviewObservationItem[];
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
  observationItems: [],
  workflow: "",
  internal: "",
  customer: "",
  customerNote: "",
  customerObservationItems: [],
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
  canDelete?: boolean;
  membershipRole?: "OWNER" | "PROJECT_MANAGER" | "CONTRIBUTOR" | "REVIEWER" | "VIEWER" | "";
  membershipDisplayName?: string;
  securityReady: boolean;
  securityLabel: string;
  onScan: () => Promise<void>;
  onReview: (action: "APPROVE" | "REJECT") => Promise<void>;
  onSaveMetadata: (input: Record<string, unknown>) => Promise<void>;
  onSaveReview: (fields: Record<string, unknown>) => Promise<void>;
  onSaveNote: (note: string) => Promise<void>;
  onEnsureQr: () => Promise<void>;
  onDownload: () => Promise<void>;
  onDelete?: () => Promise<void>;
  responsiveClassName?: string;
  focusTab?: "details" | "review" | "versions" | "notes";
  inheritedDiscipline?: string;
  inheritedTopic?: string;
  reviewFocus?: string;
  detailsFocus?: "planNo" | "scales" | "";
};

function formatAuditDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function reviewAuditTime(extra: Record<string, unknown>, prefix: string) {
  return formatAuditDate(extra[prefix + "At"]);
}

function scaleDenominator(value: unknown) {
  const text = String(value || "").trim().replace(/^M\s*=\s*1\s*:\s*/i, "");
  return text.replace(/\D+/g, "");
}

function scalesFromExtra(extra: Record<string, unknown> | undefined) {
  const source = extra?.scales;
  const values = Array.isArray(source)
    ? source
    : typeof source === "string"
      ? source.split(/[,;\n]+/)
      : typeof extra?.scale === "string"
        ? [extra.scale]
        : [];
  const denominators = values.map(scaleDenominator).filter(Boolean).slice(0, 3);
  return denominators.length ? denominators : [""];
}

function scalesForSave(values: string[]) {
  return values
    .map(scaleDenominator)
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, 3)
    .map((value) => "M=1:" + value);
}

function reviewAuditActor(extra: Record<string, unknown>, prefix: string) {
  const name = extra[prefix + "ByName"];
  const userId = extra[prefix + "ByUserId"];
  if (typeof name === "string" && name.trim()) return name.trim();
  if (typeof userId === "string" && userId.trim()) return userId.trim();
  return "—";
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

function newObservationId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `obs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function observationItems(value: unknown, legacyText: string): ReviewObservationItem[] {
  if (Array.isArray(value)) {
    const parsed = value.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const text = typeof row.text === "string" ? row.text.trim() : "";
      if (!text) return null;
      return {
        id: typeof row.id === "string" && row.id.trim() ? row.id : newObservationId(),
        text,
        source: row.source === "voice" ? "voice" as const : "text" as const,
      };
    }).filter((item): item is ReviewObservationItem => Boolean(item));
    if (parsed.length) return parsed;
  }
  return legacyText.trim() ? [{ id: "legacy-observation-1", text: legacyText.trim(), source: "text" }] : [];
}

function ChoiceButtons({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string; tone?: "ok" | "warn" | "danger" | "neutral" }>;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.reviewChoiceGrid}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          className={styles.reviewChoice + (value === option.value ? " " + styles.reviewChoiceActive : "")}
          data-tone={option.tone || "neutral"}
          onClick={() => onChange(value === option.value ? "" : option.value)}
        >
          {value === option.value && <Check size={11} />}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function ObservationEditor({
  projectId,
  title,
  items,
  disabled,
  busy,
  onChange,
}: {
  projectId: string;
  title: string;
  items: ReviewObservationItem[];
  disabled: boolean;
  busy: boolean;
  onChange: (items: ReviewObservationItem[]) => void;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const dictationRef = useRef<BrowserSpeechRecognition | null>(null);
  const dictationTextRef = useRef("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const addEmpty = () => onChange([...items, { id: newObservationId(), text: "", source: "text" }]);
  const updateItem = (id: string, text: string) => onChange(items.map((item) => item.id === id ? { ...item, text } : item));
  const removeItem = (id: string) => onChange(items.filter((item) => item.id !== id));

  const transcribe = async (blob: Blob) => {
    setTranscribing(true);
    setError("");
    try {
      const form = new FormData();
      const extension = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
      form.append("file", new File([blob], `drive-observation.${extension}`, { type: blob.type || "audio/webm" }));
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/transcription`, {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      const payload = await response.json() as { ok?: boolean; text?: string; error?: string };
      if (!response.ok || !payload.ok || !payload.text?.trim()) throw new Error(payload.error || "A hangátírás sikertelen.");
      onChange([...items, { id: newObservationId(), text: payload.text.trim(), source: "voice" }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A hangátírás sikertelen.");
    } finally {
      setTranscribing(false);
    }
  };

  const startBrowserDictation = () => {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: BrowserSpeechRecognitionCtor;
      webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
    };
    const SpeechCtor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechCtor) {
      setError("A szerveres DIMPRO hangátírás nincs konfigurálva, és ez a böngésző nem támogatja a diktálási tartalék módot.");
      return false;
    }
    try {
      const recognition = new SpeechCtor();
      dictationTextRef.current = "";
      recognition.lang = "hu-HU";
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onresult = (event: unknown) => {
        const payload = event as { resultIndex?: number; results?: ArrayLike<unknown> };
        const results = payload.results;
        if (!results) return;
        for (let index = payload.resultIndex || 0; index < results.length; index += 1) {
          const result = results[index] as { isFinal?: boolean; 0?: { transcript?: string } } | undefined;
          const transcript = result?.[0]?.transcript?.trim() || "";
          if (transcript && result?.isFinal !== false) dictationTextRef.current += (dictationTextRef.current ? " " : "") + transcript;
        }
      };
      recognition.onerror = (event: unknown) => {
        const code = (event as { error?: string })?.error || "ismeretlen hiba";
        setError("A böngésző diktálása megszakadt: " + code + ".");
      };
      recognition.onend = () => {
        const text = dictationTextRef.current.trim();
        dictationRef.current = null;
        setRecording(false);
        if (text) onChange([...items, { id: newObservationId(), text, source: "voice" }]);
      };
      dictationRef.current = recognition;
      setNotice("Böngésző diktálási mód aktív. A hang feldolgozását a böngésző beszédfelismerő szolgáltatása végzi.");
      setRecording(true);
      recognition.start();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A böngésző diktálása nem indítható.");
      return false;
    }
  };

  const startRecording = async () => {
    setError("");
    setNotice("");
    try {
      const configResponse = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive/transcription`, { credentials: "same-origin" });
      const config = await configResponse.json().catch(() => ({})) as { configured?: boolean };
      if (configResponse.ok && config.configured === false) {
        startBrowserDictation();
        return;
      }
    } catch {
      // Ha a konfiguráció lekérése nem sikerül, megpróbáljuk a szerveres hangrögzítést.
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("A böngésző nem támogatja a hangrögzítést.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        if (blob.size) void transcribe(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A mikrofon nem érhető el.");
    }
  };

  const stopRecording = () => {
    const dictation = dictationRef.current;
    if (dictation) {
      dictation.stop();
      return;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };

  useEffect(() => () => {
    try { dictationRef.current?.abort(); } catch {}
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  return (
    <div className={styles.observationEditor}>
      <div className={styles.observationEditorHead}>
        <div><strong>{title}</strong><span>{items.length} db</span></div>
        <div>
          <button type="button" disabled={disabled || busy || transcribing || recording} onClick={addEmpty}><Plus size={12} /> Új</button>
          <button type="button" className={recording ? styles.voiceButtonActive : ""} disabled={disabled || busy || transcribing} onClick={recording ? stopRecording : startRecording}>
            {recording ? <Square size={12} /> : <Mic size={12} />}
            {recording ? "Leállítás" : transcribing ? "Átírás…" : "Hangból"}
          </button>
        </div>
      </div>
      <div className={styles.observationList}>
        {items.map((item, index) => (
          <div key={item.id} className={styles.observationItem}>
            <div className={styles.observationIndex}>{index + 1}</div>
            <textarea
              rows={2}
              value={item.text}
              readOnly={disabled}
              disabled={busy}
              placeholder="Írd le az észrevételt…"
              onChange={(event) => updateItem(item.id, event.target.value)}
            />
            <span className={styles.observationSource} title={item.source === "voice" ? "Hangátírásból" : "Szöveges bevitel"}>{item.source === "voice" ? <Mic size={10} /> : null}</span>
            <button type="button" className={styles.observationDelete} disabled={disabled || busy} onClick={() => removeItem(item.id)} title="Észrevétel törlése"><Trash2 size={12} /></button>
          </div>
        ))}
        {!items.length && <div className={styles.observationEmpty}>Nincs rögzített észrevétel.</div>}
      </div>
      {notice && <div className={styles.observationNotice}>{notice}</div>}
      {error && <div className={styles.observationError}>{error}</div>}
    </div>
  );
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
  scales: [""],
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
  canDelete = false,
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
  onDelete,
  responsiveClassName = "",
  focusTab,
  inheritedDiscipline = "",
  inheritedTopic = "",
  reviewFocus = "",
  detailsFocus = "",
}: Props) {
  const [tab, setTab] = useState<"details" | "review" | "versions" | "notes">("details");
  const [metadata, setMetadata] = useState<MetadataForm>(emptyMetadata);
  const [review, setReview] = useState<ReviewForm>(emptyReview);
  const [note, setNote] = useState("");
  const [reviewSection, setReviewSection] = useState<ReviewSectionKey>("technical");
  const [reviewTimelineOpen, setReviewTimelineOpen] = useState(false);

  useEffect(() => { if (focusTab) setTab(focusTab); }, [focusTab]);
  useEffect(() => { if (detailsFocus) setTab("details"); }, [detailsFocus]);
  useEffect(() => {
    if (!detailsFocus || tab !== "details" || !document) return;
    const targetId = detailsFocus === "planNo" ? "drive-meta-planNo" : "drive-meta-scale-0";
    const frame = requestAnimationFrame(() => {
      const target = globalThis.document?.getElementById(targetId) as HTMLInputElement | null;
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
      target?.focus({ preventScroll: true });
      target?.select?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [detailsFocus, document?.id, tab]);
  useEffect(() => { setReviewTimelineOpen(false); }, [document?.id]);
  useEffect(() => {
    if (!reviewFocus || tab !== "review") return;
    const sectionByFocus: Record<string, ReviewSectionKey> = {
      checked: "technical",
      result: "technical",
      observations: "technical",
      workflow: "technical",
      internal: "technical",
      revision: "technical",
      customer: "customer",
      "customer-observations": "customer",
      "customer-note": "customer",
      "project-manager": "manager",
      "investor-project-manager": "investor",
      lifecycle: "lifecycle",
    };
    const nextSection = sectionByFocus[reviewFocus];
    if (nextSection) setReviewSection(nextSection);
  }, [reviewFocus, tab]);

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
      planTitle: typeof source.extra?.displayName === "string" ? source.extra.displayName : typeof source.extra?.planTitle === "string" ? source.extra.planTitle : typeof source.extra?.drawingTitle === "string" ? source.extra.drawingTitle : "",
      scales: scalesFromExtra(source.extra),
    } : emptyMetadata);
    const extra = source?.extra || {};
    const legacyObservations = typeof extra.reviewObservations === "string" ? extra.reviewObservations : typeof extra.hageObservations === "string" ? extra.hageObservations : "";
    const technicalObservationItems = observationItems(extra.reviewObservationItems, legacyObservations);
    const legacyCustomerObservations = typeof extra.customerObservations === "string" ? extra.customerObservations : "";
    const customerObservationItems = observationItems(extra.customerObservationItems, legacyCustomerObservations);
    setReview({
      checked: typeof extra.reviewChecked === "string" ? extra.reviewChecked : typeof extra.hageChecked === "string" ? extra.hageChecked : "",
      result: typeof extra.reviewResult === "string" ? extra.reviewResult : typeof extra.hageResult === "string" ? extra.hageResult : "",
      observations: legacyObservations,
      observationItems: technicalObservationItems,
      workflow: typeof extra.workflowStatus === "string" ? extra.workflowStatus : source?.approvalStatus || "",
      internal: typeof extra.internalNote === "string" ? extra.internalNote : typeof extra.hageNote === "string" ? extra.hageNote : "",
      customer: typeof extra.customerApproval === "string" ? extra.customerApproval : typeof extra.clientApproval === "string" ? extra.clientApproval : "",
      customerNote: typeof extra.customerNote === "string" ? extra.customerNote : typeof extra.clientNote === "string" ? extra.clientNote : "",
      customerObservationItems,
      revisionChange: typeof extra.revisionChange === "string" ? extra.revisionChange : typeof extra.change === "string" ? extra.change : "",
      projectManager: typeof extra.projectManagerApproval === "string" ? extra.projectManagerApproval : "",
      investorProjectManager: typeof extra.investorProjectManagerApproval === "string" ? extra.investorProjectManagerApproval : "",
      lifecycle: typeof extra.lifecycleStatus === "string" ? extra.lifecycleStatus : "",
      openObservationCount: String(technicalObservationItems.length),
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
                ["planTitle", "Egyedi megjelenítési név / tervlap neve"],
                ["discipline", "Szakág"],
                ["documentType", "Dokumentumtípus"],
                ["revision", "Revízió"],
                ["issueStatus", "Kiadás"],
                ["approvalStatus", "Jóváhagyás"],
                ["building", "Épület"],
                ["level", "Szint"],
                ["zone", "Zóna"],
                ["topic", "Témakör felülírás"],
              ] as Array<[MetadataTextKey, string]>).map(([key, label]) => (
                <div className={styles.metaItem} key={key} data-details-focused={detailsFocus === key ? "true" : undefined}>
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

            <div className={styles.scaleEditor} data-details-focused={detailsFocus === "scales" ? "true" : undefined}>
              <div className={styles.scaleEditorHead}>
                <div>
                  <strong>Tervlépték</strong>
                  <span>Legfeljebb 3 lépték rögzíthető.</span>
                </div>
                {canWrite && metadata.scales.length < 3 && (
                  <button type="button" onClick={() => setMetadata((current) => ({ ...current, scales: [...current.scales, ""] }))}>
                    <Plus size={12} /> Lépték hozzáadása
                  </button>
                )}
              </div>
              <div className={styles.scaleEditorList}>
                {metadata.scales.map((scale, index) => (
                  <div className={styles.scaleEditorRow} key={"scale-" + index}>
                    <span>M=1:</span>
                    <input
                      id={"drive-meta-scale-" + index}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={scale}
                      readOnly={!canWrite}
                      onChange={(event) => {
                        const value = event.target.value.replace(/\D+/g, "").slice(0, 8);
                        setMetadata((current) => ({
                          ...current,
                          scales: current.scales.map((entry, entryIndex) => entryIndex === index ? value : entry),
                        }));
                      }}
                      placeholder="100"
                      aria-label={"Lépték " + (index + 1)}
                    />
                    {canWrite && index > 0 && (
                      <button
                        type="button"
                        className={styles.scaleRemove}
                        onClick={() => setMetadata((current) => ({ ...current, scales: current.scales.filter((_, entryIndex) => entryIndex !== index) }))}
                        title="Lépték eltávolítása"
                        aria-label={"Lépték " + (index + 1) + " eltávolítása"}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {document.currentVersion?.status === "QUARANTINED" && (
              <div className={styles.infoBox}>
                <strong>Biztonsági karantén</strong><br />
                {securityReady ? `${securityLabel} aktív. Sikeres ellenőrzés után a fájl megnyitható és letölthető; a végleges kiadáshoz továbbra is a dokumentumfolyamat szabályai érvényesek.` : `Biztonsági ellenőrzés nem elérhető (${securityLabel}). Az előnézet, letöltés és kiadás biztonsági okból tiltva.`}
              </div>
            )}
            {canApprove && document.currentVersion?.status === "QUARANTINED" && (
              <div className={styles.detailsActions}>
                <button type="button" className={`${styles.smallButton} ${styles.smallPrimary}`} disabled={busy || !securityReady} onClick={() => void onScan()}>
                  <ShieldCheck size={12} /> Biztonsági ellenőrzés
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
              <button type="button" className={`${styles.smallButton} ${styles.smallPrimary}`} disabled={!canWrite || busy} onClick={() => void onSaveMetadata({ ...metadata, extra: { ...(details?.metadata?.extra || {}), topic: metadata.topic, displayName: metadata.planTitle, planTitle: metadata.planTitle, scales: scalesForSave(metadata.scales) } })}>
                <Save size={12} /> Metaadat mentése
              </button>
              <button type="button" className={styles.smallButton} disabled={busy || !document.currentVersion || ["REJECTED", "STAGED", "METADATA_ONLY"].includes(document.currentVersion.status)} onClick={() => void onDownload()}>
                <Download size={12} /> Letöltés
              </button>
              {canDelete && onDelete && (
                <button type="button" className={`${styles.smallButton} ${styles.smallDanger}`} disabled={busy} onClick={() => void onDelete()} title="Dokumentum lomtárba helyezése">
                  <Trash2 size={12} /> Lomtárba
                </button>
              )}
              <button type="button" className={styles.smallButton} disabled={!canWrite || busy} onClick={() => void onEnsureQr()}>
                <QrCode size={12} /> {activeQr ? "QR elérhető" : "QR létrehozása"}
              </button>
            </div>
            {activeQr && <div className={styles.infoBox}>QR azonosító aktív. A publikus QR feloldó oldal és vizuális QR-kép későbbi vertikális szeletben kapcsolódik hozzá.</div>}
          </>
        ) : tab === "review" ? (
          <div className={`${styles.versionList} ${styles.reviewWorkspace}`}>
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
                  <button type="button" className={styles.reviewProgressStep + " " + (step.done ? styles.reviewProgressDone : step.active ? (reviewReturned && step.key === "technical" ? styles.reviewProgressReturned : styles.reviewProgressActive) : styles.reviewProgressPending)} title={step.label} onClick={() => { if (step.target) setReviewSection(step.target as ReviewSectionKey); }}>
                    <step.Icon size={15} /><span>{step.label}</span>
                  </button>
                  {index < steps.length - 1 && <span className={styles.reviewProgressLine} data-done={step.done ? "true" : undefined} />}
                </div>
              ))}
            </div>

            <div className={styles.reviewTimeline}>
              <button type="button" className={styles.reviewTimelineToggle} aria-expanded={reviewTimelineOpen} onClick={() => setReviewTimelineOpen((current) => !current)}>
                <span>Időnapló</span>
                <small>jóváhagyások és állapotváltások</small>
                {reviewTimelineOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {reviewTimelineOpen && (
                <div className={styles.reviewTimelineTableWrap}>
                  <table className={styles.reviewTimelineTable}>
                    <thead><tr><th>Esemény</th><th>Dátum / idő</th><th>Rögzítette</th></tr></thead>
                    <tbody>
                      {[
                        { label: "Feltöltve", at: formatAuditDate(document.currentVersion?.createdAt || document.updatedAt), actor: document.currentVersion?.createdBy || "—" },
                        { label: "Műszaki ellenőrzés", at: reviewAuditTime(reviewExtra, "technicalReview") || reviewAuditTime(reviewExtra, "workflowChanged"), actor: reviewAuditActor(reviewExtra, reviewAuditTime(reviewExtra, "technicalReview") ? "technicalReview" : "workflowChanged") },
                        { label: "Megrendelő", at: reviewAuditTime(reviewExtra, "customerReview") || reviewAuditTime(reviewExtra, "customerApproval"), actor: reviewAuditActor(reviewExtra, reviewAuditTime(reviewExtra, "customerReview") ? "customerReview" : "customerApproval") },
                        { label: "Projektvezető", at: reviewAuditTime(reviewExtra, "projectManagerApproval"), actor: reviewAuditActor(reviewExtra, "projectManagerApproval") },
                        { label: "Beruházói PV", at: reviewAuditTime(reviewExtra, "investorProjectManagerApproval"), actor: reviewAuditActor(reviewExtra, "investorProjectManagerApproval") },
                        { label: "Életciklus", at: reviewAuditTime(reviewExtra, "lifecycleChanged"), actor: reviewAuditActor(reviewExtra, "lifecycleChanged") },
                      ].map((row) => (
                        <tr key={row.label}><td>{row.label}</td><td>{row.at || "—"}</td><td>{row.actor}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className={styles.reviewRoleInfo}>
              <span>Aktív projektjogosultság</span>
              <strong>{membershipDisplayName || "DIMPRO felhasználó"} · {membershipRole === "OWNER" ? "Beruházási projektvezető" : membershipRole === "PROJECT_MANAGER" ? "Projektvezető" : membershipRole === "REVIEWER" ? "Ellenőrző" : membershipRole === "CONTRIBUTOR" ? "Közreműködő" : membershipRole === "VIEWER" ? "Megtekintő" : "Projekt résztvevő"}</strong>
            </div>

            <nav className={styles.reviewCategoryMenu} aria-label="Tervellenőrzési kategóriák">
              {([
                { key: "technical", label: "Ellenőrzés", Icon: ClipboardCheck, allowed: canTechnicalReview },
                { key: "customer", label: "Megrendelő", Icon: UserCheck, allowed: canCustomerApproval },
                { key: "manager", label: "Projektvezető", Icon: BadgeCheck, allowed: canProjectManagerApproval },
                { key: "investor", label: "Beruházói", Icon: ShieldCheck, allowed: canInvestorProjectManagerApproval },
                { key: "lifecycle", label: "Életciklus", Icon: CheckCircle2, allowed: canLifecycleEdit },
              ] as const).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={styles.reviewCategoryButton + (reviewSection === item.key ? " " + styles.reviewCategoryButtonActive : "")}
                  onClick={() => setReviewSection(item.key)}
                  title={item.allowed ? item.label : item.label + " – csak megtekinthető"}
                >
                  <item.Icon size={14} />
                  <span>{item.label}</span>
                  {!item.allowed && <Lock size={9} />}
                </button>
              ))}
            </nav>

            {reviewSection === "technical" && (
            <section id={"drive-review-section-" + document.id + "-technical"} className={styles.reviewSection}>
              <header className={styles.reviewSectionHeader}>
                <div><ClipboardCheck size={16} /><span><strong>Műszaki ellenőrzés</strong><small>Ellenőrzési eredmény, észrevételek és revízió</small></span></div>
                <span className={canTechnicalReview ? styles.reviewPermissionActive : styles.reviewPermissionLocked}>{canTechnicalReview ? "Szerkeszthető" : <><Lock size={11} /> Nincs jogosultság</>}</span>
              </header>
              <div className={styles.reviewEditorGrid}>
                <div id={"drive-review-" + document.id + "-checked"} className={styles.reviewEditorItem} data-review-focused={reviewFocus === "checked" ? "true" : undefined}>
                  <label>Ellenőrzés</label>
                  <ChoiceButtons value={review.checked} disabled={!canTechnicalReview || busy} options={[{ value: "Igen", label: "Ellenőrizve", tone: "ok" }, { value: "Nem", label: "Nincs ellenőrizve", tone: "neutral" }]} onChange={(value) => setReview((current) => ({ ...current, checked: value }))} />
                </div>
                <div id={"drive-review-" + document.id + "-result"} className={styles.reviewEditorItem} data-review-focused={reviewFocus === "result" ? "true" : undefined}>
                  <label>Eredmény</label>
                  <ChoiceButtons value={review.result} disabled={!canTechnicalReview || busy} options={[{ value: "Megfelelő", label: "Megfelelő", tone: "ok" }, { value: "Javítandó", label: "Javítandó", tone: "warn" }, { value: "Visszaadva", label: "Visszaadva", tone: "danger" }]} onChange={(value) => setReview((current) => ({ ...current, result: value }))} />
                </div>
                <div id={"drive-review-" + document.id + "-workflow"} className={styles.reviewEditorItem} data-review-focused={reviewFocus === "workflow" ? "true" : undefined}>
                  <label htmlFor="drive-review-workflow">Workflow állapot</label>
                  <select id="drive-review-workflow" value={review.workflow} disabled={!canTechnicalReview || busy} onChange={(event) => setReview((current) => ({ ...current, workflow: event.target.value }))}>
                    <option value="">—</option><option value="Ellenőrzésre vár">Ellenőrzésre vár</option><option value="Ellenőrzés alatt">Ellenőrzés alatt</option><option value="Folyamatban">Folyamatban</option><option value="Javításra visszaadva">Javításra visszaadva</option><option value="Jóváhagyásra vár">Jóváhagyásra vár</option><option value="Jóváhagyva">Jóváhagyva</option><option value="Elutasítva">Elutasítva</option>
                  </select>
                  {reviewAuditLine(reviewExtra, "workflowChanged") && <small className={styles.reviewAuditLine}>{reviewAuditLine(reviewExtra, "workflowChanged")}</small>}
                </div>
                <div id={"drive-review-" + document.id + "-revision"} className={styles.reviewEditorItem} data-review-focused={reviewFocus === "revision" ? "true" : undefined}>
                  <label>Revízióváltozás</label>
                  <ChoiceButtons value={review.revisionChange} disabled={!canTechnicalReview || busy} options={[{ value: "ÚJ", label: "Új", tone: "ok" }, { value: "MÓDOSULT", label: "Módosult", tone: "warn" }, { value: "ÁTHELYEZVE", label: "Áthelyezve", tone: "neutral" }, { value: "NEM TALÁLHATÓ", label: "Nem található", tone: "danger" }]} onChange={(value) => setReview((current) => ({ ...current, revisionChange: value }))} />
                </div>
                <div id={"drive-review-" + document.id + "-observations"} className={styles.reviewEditorItem + " " + styles.reviewEditorFull} data-review-focused={reviewFocus === "observations" ? "true" : undefined}>
                  <ObservationEditor projectId={projectId} title="Észrevételek" items={review.observationItems} disabled={!canTechnicalReview} busy={busy} onChange={(items) => setReview((current) => ({ ...current, observationItems: items, openObservationCount: String(items.length) }))} />
                </div>
                <div id={"drive-review-" + document.id + "-internal"} className={styles.reviewEditorItem + " " + styles.reviewEditorFull} data-review-focused={reviewFocus === "internal" ? "true" : undefined}>
                  <label htmlFor="drive-review-internal">Belső megjegyzés</label>
                  <textarea id="drive-review-internal" rows={3} value={review.internal} readOnly={!canTechnicalReview} disabled={busy} onChange={(event) => setReview((current) => ({ ...current, internal: event.target.value }))} />
                </div>
              </div>
            </section>
            )}

            {reviewSection === "customer" && (
            <section id={"drive-review-section-" + document.id + "-customer"} className={styles.reviewSection}>
              <header className={styles.reviewSectionHeader}>
                <div><UserCheck size={16} /><span><strong>Megrendelői jóváhagyás</strong><small>Megrendelői döntés és megjegyzés</small></span></div>
                <span className={canCustomerApproval ? styles.reviewPermissionActive : styles.reviewPermissionLocked}>{canCustomerApproval ? "Szerkeszthető" : <><Lock size={11} /> Nincs jogosultság</>}</span>
              </header>
              <div className={styles.reviewEditorGrid}>
                <div id={"drive-review-" + document.id + "-customer"} className={styles.reviewEditorItem} data-review-focused={reviewFocus === "customer" ? "true" : undefined}>
                  <label>Jóváhagyás</label>
                  <ChoiceButtons value={review.customer} disabled={!canCustomerApproval || busy} options={[{ value: "Jóváhagyva", label: "Jóváhagyva", tone: "ok" }, { value: "Elutasítva", label: "Elutasítva", tone: "danger" }]} onChange={(value) => setReview((current) => ({ ...current, customer: value }))} />
                  {reviewAuditLine(reviewExtra, "customerApproval") && <small className={styles.reviewAuditLine}>{reviewAuditLine(reviewExtra, "customerApproval")}</small>}
                </div>
                <div id={"drive-review-" + document.id + "-customer-observations"} className={styles.reviewEditorItem + " " + styles.reviewEditorFull} data-review-focused={reviewFocus === "customer-observations" ? "true" : undefined}>
                  <ObservationEditor projectId={projectId} title="Észrevételek" items={review.customerObservationItems} disabled={!canCustomerApproval} busy={busy} onChange={(items) => setReview((current) => ({ ...current, customerObservationItems: items }))} />
                </div>
                <div id={"drive-review-" + document.id + "-customer-note"} className={styles.reviewEditorItem + " " + styles.reviewEditorFull} data-review-focused={reviewFocus === "customer-note" ? "true" : undefined}>
                  <label htmlFor="drive-review-customer-note">Belső megjegyzés</label>
                  <textarea id="drive-review-customer-note" rows={3} value={review.customerNote} readOnly={!canCustomerApproval} disabled={busy} onChange={(event) => setReview((current) => ({ ...current, customerNote: event.target.value }))} />
                </div>
              </div>
            </section>
            )}

            {reviewSection === "manager" && (
            <section id={"drive-review-section-" + document.id + "-manager"} className={styles.reviewSection}>
              <header className={styles.reviewSectionHeader}>
                <div><BadgeCheck size={16} /><span><strong>Projektvezetői jóváhagyás</strong><small>Projektvezetői döntési szint</small></span></div>
                <span className={canProjectManagerApproval ? styles.reviewPermissionActive : styles.reviewPermissionLocked}>{canProjectManagerApproval ? "Szerkeszthető" : <><Lock size={11} /> Nincs jogosultság</>}</span>
              </header>
              <div className={styles.reviewEditorGrid}>
                <div id={"drive-review-" + document.id + "-project-manager"} className={styles.reviewEditorItem + " " + styles.reviewEditorFull} data-review-focused={reviewFocus === "project-manager" ? "true" : undefined}>
                  <label>Jóváhagyás</label>
                  <ChoiceButtons value={review.projectManager} disabled={!canProjectManagerApproval || busy} options={[{ value: "Jóváhagyva", label: "Jóváhagyva", tone: "ok" }, { value: "Elutasítva", label: "Elutasítva", tone: "danger" }]} onChange={(value) => setReview((current) => ({ ...current, projectManager: value }))} />
                  {reviewAuditLine(reviewExtra, "projectManagerApproval") && <small className={styles.reviewAuditLine}>{reviewAuditLine(reviewExtra, "projectManagerApproval")}</small>}
                </div>
              </div>
            </section>
            )}

            {reviewSection === "investor" && (
            <section id={"drive-review-section-" + document.id + "-investor"} className={styles.reviewSection}>
              <header className={styles.reviewSectionHeader}>
                <div><ShieldCheck size={16} /><span><strong>Beruházói projektvezetői jóváhagyás</strong><small>Végső beruházói döntési szint</small></span></div>
                <span className={canInvestorProjectManagerApproval ? styles.reviewPermissionActive : styles.reviewPermissionLocked}>{canInvestorProjectManagerApproval ? "Szerkeszthető" : <><Lock size={11} /> Nincs jogosultság</>}</span>
              </header>
              <div className={styles.reviewEditorGrid}>
                <div id={"drive-review-" + document.id + "-investor-project-manager"} className={styles.reviewEditorItem + " " + styles.reviewEditorFull} data-review-focused={reviewFocus === "investor-project-manager" ? "true" : undefined}>
                  <label>Jóváhagyás</label>
                  <ChoiceButtons value={review.investorProjectManager} disabled={!canInvestorProjectManagerApproval || busy} options={[{ value: "Jóváhagyva", label: "Jóváhagyva", tone: "ok" }, { value: "Elutasítva", label: "Elutasítva", tone: "danger" }]} onChange={(value) => setReview((current) => ({ ...current, investorProjectManager: value }))} />
                  {reviewAuditLine(reviewExtra, "investorProjectManagerApproval") && <small className={styles.reviewAuditLine}>{reviewAuditLine(reviewExtra, "investorProjectManagerApproval")}</small>}
                </div>
              </div>
            </section>
            )}

            {reviewSection === "lifecycle" && (
            <section id={"drive-review-section-" + document.id + "-lifecycle"} className={styles.reviewSection}>
              <header className={styles.reviewSectionHeader}>
                <div><CheckCircle2 size={16} /><span><strong>Terv életciklusa</strong><small>Munkaközi, aktuális vagy archív állapot</small></span></div>
                <span className={canLifecycleEdit ? styles.reviewPermissionActive : styles.reviewPermissionLocked}>{canLifecycleEdit ? "Szerkeszthető" : <><Lock size={11} /> Nincs jogosultság</>}</span>
              </header>
              <div className={styles.reviewEditorGrid}>
                <div id={"drive-review-" + document.id + "-lifecycle"} className={styles.reviewEditorItem + " " + styles.reviewEditorFull} data-review-focused={reviewFocus === "lifecycle" ? "true" : undefined}>
                  <label>Terv életciklusa</label>
                  <ChoiceButtons value={review.lifecycle} disabled={!canLifecycleEdit || busy} options={[{ value: "Munkaközi", label: "Munkaközi", tone: "neutral" }, { value: "Aktuális", label: "Aktuális", tone: "ok" }, { value: "Archív", label: "Archív", tone: "neutral" }]} onChange={(value) => setReview((current) => ({ ...current, lifecycle: value }))} />
                  {reviewAuditLine(reviewExtra, "lifecycleChanged") && <small className={styles.reviewAuditLine}>{reviewAuditLine(reviewExtra, "lifecycleChanged")}</small>}
                </div>
              </div>
            </section>
            )}

            <div className={styles.detailsActions}>
              <button
                type="button"
                className={styles.smallButton + " " + styles.smallPrimary}
                disabled={!canAnyReviewEdit || busy}
                onClick={() => void onSaveReview({
                  ...(canTechnicalReview ? {
                    reviewChecked: review.checked,
                    reviewResult: review.result,
                    reviewObservationItems: review.observationItems,
                    workflowStatus: review.workflow,
                    internalNote: review.internal,
                    revisionChange: review.revisionChange,
                  } : {}),
                  ...(canCustomerApproval ? { customerApproval: review.customer, customerObservationItems: review.customerObservationItems, customerNote: review.customerNote } : {}),
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
