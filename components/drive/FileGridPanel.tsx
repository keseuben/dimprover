"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Archive, BadgeCheck, CheckCircle2, Clock3, File, FileSpreadsheet, FileText, Folder, FolderUp, Image as ImageIcon, RefreshCw, RotateCcw, Search, ShieldCheck, Trash2 } from "lucide-react";
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
  onOpenDocument?: (document: DriveDocument) => void;
  onRefresh: () => void;
  boxColorsByDocument?: Record<string, string[]>;
  metadataByDocument?: Record<string, DriveEngineeringMetadata>;
  folders?: DriveFolder[];
  selectedFolderId?: string;
  currentFolder?: DriveFolder | null;
  onFolderChange?: (folderId: string) => void;
  onNavigateParent?: () => void;
  canWrite?: boolean;
  canApprove?: boolean;
  membershipRole?: "OWNER" | "PROJECT_MANAGER" | "CONTRIBUTOR" | "REVIEWER" | "VIEWER" | "";
  busy?: boolean;
  onBulkReview?: (input: {
    documentIds?: string[];
    folderId?: string;
    includeDescendants?: boolean;
    fields: Record<string, string | number>;
  }) => Promise<number>;
  onOpenReviewDetail?: (document: DriveDocument, field: string) => void;
  tableZoom?: number;
  dragPanEnabled?: boolean;
  selectedDocumentIds?: string[];
  onSelectionChange?: (documentIds: string[]) => void;
  canDelete?: boolean;
  onDeleteSelected?: (documentIds: string[]) => Promise<void>;
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

function versionStatusLabel(value: string | undefined) {
  switch ((value || "").toUpperCase()) {
    case "AVAILABLE": return "Elérhető";
    case "QUARANTINED": return "Biztonsági ellenőrzés alatt";
    case "REJECTED": return "Elutasítva";
    case "STAGED": return "Feldolgozás alatt";
    case "METADATA_ONLY": return "Csak metaadat";
    default: return value || "—";
  }
}

function uploaderLabel(value: string | undefined) {
  const actor = (value || "").trim();
  if (!actor) return "—";
  if (actor === "dev-web-user") return "DIMPRO felhasználó";
  return actor;
}

function displayDocumentName(document: DriveDocument, metadata?: DriveEngineeringMetadata) {
  const extra = metadata?.extra || {};
  const explicit = typeof extra.displayName === "string" && extra.displayName.trim()
    ? extra.displayName.trim()
    : typeof extra.planTitle === "string" && extra.planTitle.trim()
      ? extra.planTitle.trim()
      : typeof extra.drawingTitle === "string" && extra.drawingTitle.trim()
        ? extra.drawingTitle.trim()
        : "";
  return { explicit, value: explicit || fileNameWithoutExtension(document.name) };
}

function normalizePlanScale(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  const withoutPrefix = text.replace(/^M\s*=\s*1\s*:\s*/i, "");
  const denominator = withoutPrefix.replace(/\D+/g, "");
  return denominator ? "M=1:" + denominator : "";
}

function documentPlanScales(metadata?: DriveEngineeringMetadata) {
  const extra = metadata?.extra || {};
  const source = extra.scales;
  const values = Array.isArray(source)
    ? source
    : typeof source === "string"
      ? source.split(/[,;\n]+/)
      : typeof extra.scale === "string"
        ? [extra.scale]
        : [];
  return values.map(normalizePlanScale).filter(Boolean).slice(0, 3);
}

function scaleSummary(metadata?: DriveEngineeringMetadata) {
  const scales = documentPlanScales(metadata);
  return {
    scales,
    text: !scales.length ? "—" : scales.length === 1 ? scales[0] : scales[0] + ", …",
    title: scales.length ? scales.join(", ") : "Nincs rögzített lépték",
  };
}

const imageExtensions = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "heic", "heif", "tif", "tiff"]);

function FileKindIcon({ extension }: { extension: string }) {
  const ext = extension.toLowerCase();
  if (imageExtensions.has(ext)) return <ImageIcon size={13} />;
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
  if (imageExtensions.has(ext)) return `${styles.fileIcon} ${styles.fileIconImage}`;
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

function reviewMetadataValue(metadata: DriveEngineeringMetadata | undefined, key: string) {
  const value = metadata?.extra?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function approvalVisual(metadata: DriveEngineeringMetadata | undefined) {
  const investor = reviewMetadataValue(metadata, "investorProjectManagerApproval");
  const manager = reviewMetadataValue(metadata, "projectManagerApproval");
  const customer = reviewMetadataValue(metadata, "customerApproval") || reviewMetadataValue(metadata, "clientApproval");
  const workflow = reviewMetadataValue(metadata, "workflowStatus") || metadata?.approvalStatus || "";
  const result = reviewMetadataValue(metadata, "reviewResult") || reviewMetadataValue(metadata, "hageResult");
  const checked = reviewMetadataValue(metadata, "reviewChecked") || reviewMetadataValue(metadata, "hageChecked");
  const normalizedWorkflow = workflow.toLocaleLowerCase("hu-HU");
  const normalizedResult = result.toLocaleLowerCase("hu-HU");

  if (isApprovedReviewValue(investor)) return { kind: "investor" as const, title: "Beruházói projektvezető által jóváhagyva", Icon: ShieldCheck };
  if (isApprovedReviewValue(manager)) return { kind: "manager" as const, title: "Projektvezető által jóváhagyva", Icon: BadgeCheck };
  if (isApprovedReviewValue(customer)) return { kind: "customer" as const, title: "Megrendelő által jóváhagyva", Icon: CheckCircle2 };
  if (normalizedWorkflow.includes("visszaad") || normalizedResult.includes("javítand") || normalizedResult.includes("visszaad")) {
    return { kind: "returned" as const, title: "Javításra visszaadva", Icon: RotateCcw };
  }
  if (normalizedWorkflow.includes("alatt") || normalizedWorkflow.includes("folyamat") || checked.toLocaleLowerCase("hu-HU") === "igen") {
    return { kind: "review" as const, title: "Ellenőrzés alatt", Icon: Search };
  }
  return { kind: "pending" as const, title: workflow || "Feltöltve / ellenőrzésre vár", Icon: Clock3 };
}

function lifecycleVisual(metadata: DriveEngineeringMetadata | undefined) {
  const lifecycle = reviewMetadataValue(metadata, "lifecycleStatus");
  const normalized = lifecycle.toLocaleLowerCase("hu-HU");
  if (normalized.includes("arch")) return { kind: "archive" as const, title: "Archív terv", Icon: Archive };
  if (normalized.includes("aktu")) return { kind: "current" as const, title: "Aktuális terv", Icon: CheckCircle2 };
  return { kind: "working" as const, title: lifecycle || "Munkaközi terv", Icon: Clock3 };
}

function lifecycleRowClass(metadata: DriveEngineeringMetadata | undefined) {
  const lifecycle = reviewMetadataValue(metadata, "lifecycleStatus").toLocaleLowerCase("hu-HU");
  if (lifecycle.includes("arch")) return styles.rowLifecycleArchive;
  if (lifecycle.includes("aktu")) {
    const manager = reviewMetadataValue(metadata, "projectManagerApproval");
    const investor = reviewMetadataValue(metadata, "investorProjectManagerApproval");
    return isApprovedReviewValue(investor) || isApprovedReviewValue(manager)
      ? styles.rowLifecycleApprovedCurrent
      : styles.rowLifecycleCurrent;
  }
  return "";
}

function approvalFocus(kind: ReturnType<typeof approvalVisual>["kind"]) {
  if (kind === "investor") return "investor-project-manager";
  if (kind === "manager") return "project-manager";
  if (kind === "customer") return "customer";
  if (kind === "returned") return "result";
  return "workflow";
}

function ReviewStateIcons({
  metadata,
  onApprovalClick,
  onLifecycleClick,
}: {
  metadata?: DriveEngineeringMetadata;
  onApprovalClick?: () => void;
  onLifecycleClick?: () => void;
}) {
  const approval = approvalVisual(metadata);
  const lifecycle = lifecycleVisual(metadata);
  const ApprovalIcon = approval.Icon;
  const LifecycleIcon = lifecycle.Icon;
  return (
    <span className={styles.reviewStateIcons} aria-label={approval.title + "; " + lifecycle.title}>
      <button
        type="button"
        className={styles.reviewStateButton + " " + styles.reviewApprovalIcon + " " + styles["reviewApproval_" + approval.kind]}
        title={approval.title + (onApprovalClick ? " – kattints a részletekhez" : "")}
        onClick={(event) => { event.stopPropagation(); onApprovalClick?.(); }}
        aria-label={approval.title}
      >
        <ApprovalIcon size={12} />
      </button>
      <button
        type="button"
        className={styles.reviewStateButton + " " + styles.reviewLifecycleIcon + " " + styles["reviewLifecycle_" + lifecycle.kind]}
        title={lifecycle.title + (onLifecycleClick ? " – kattints a részletekhez" : "")}
        onClick={(event) => { event.stopPropagation(); onLifecycleClick?.(); }}
        aria-label={lifecycle.title}
      >
        <LifecycleIcon size={11} />
      </button>
    </span>
  );
}

export default function FileGridPanel({
  title,
  subtitle,
  documents,
  selectedDocumentId,
  viewMode,
  onViewModeChange,
  onSelectDocument,
  onOpenDocument,
  onRefresh,
  boxColorsByDocument = {},
  metadataByDocument = {},
  folders = [],
  selectedFolderId = "all",
  currentFolder = null,
  onFolderChange,
  onNavigateParent,
  canWrite = false,
  canApprove = false,
  membershipRole = "",
  busy = false,
  onBulkReview,
  onOpenReviewDetail,
  tableZoom = 100,
  dragPanEnabled = false,
  selectedDocumentIds,
  onSelectionChange,
  canDelete = false,
  onDeleteSelected,
}: Props) {
  const [reviewDiscipline, setReviewDiscipline] = useState("all");
  const [reviewTopic, setReviewTopic] = useState("all");
  const [reviewStatus, setReviewStatus] = useState("all");
  const [reviewApprovalStage, setReviewApprovalStage] = useState("all");
  const [reviewLifecycle, setReviewLifecycle] = useState("all");
  const [reviewSearch, setReviewSearch] = useState("");
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);
  const selectedIds = selectedDocumentIds ?? internalSelectedIds;
  const setSelectedIds = (next: string[] | ((current: string[]) => string[])) => {
    const resolved = typeof next === "function" ? next(selectedIds) : next;
    if (onSelectionChange) onSelectionChange(resolved);
    else setInternalSelectedIds(resolved);
  };
  const [bulkScope, setBulkScope] = useState<"selection" | "folder" | null>(null);
  const [bulkIncludeDescendants, setBulkIncludeDescendants] = useState(true);
  const [bulkForm, setBulkForm] = useState({
    reviewChecked: "__KEEP__",
    reviewResult: "__KEEP__",
    workflowStatus: "__KEEP__",
    customerApproval: "__KEEP__",
    projectManagerApproval: "__KEEP__",
    investorProjectManagerApproval: "__KEEP__",
    lifecycleStatus: "__KEEP__",
  });
  const panStateRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    active: false,
    moved: false,
    timer: null as ReturnType<typeof setTimeout> | null,
  });
  const suppressPanClickRef = useRef(false);
  const [tablePanning, setTablePanning] = useState(false);

  const clearPanTimer = () => {
    if (panStateRef.current.timer) clearTimeout(panStateRef.current.timer);
    panStateRef.current.timer = null;
  };

  const handlePanPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragPanEnabled || event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button,input,select,textarea,a,label")) return;
    clearPanTimer();
    suppressPanClickRef.current = false;
    const scroller = event.currentTarget;
    const pointerId = event.pointerId;
    panStateRef.current = {
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: scroller.scrollLeft,
      startTop: scroller.scrollTop,
      active: false,
      moved: false,
      timer: setTimeout(() => {
        if (panStateRef.current.pointerId !== pointerId) return;
        panStateRef.current.active = true;
        setTablePanning(true);
        try { scroller.setPointerCapture(pointerId); } catch { /* optional */ }
      }, 180),
    };
  };

  const handlePanPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = panStateRef.current;
    if (!dragPanEnabled || state.pointerId !== event.pointerId || !state.active) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) state.moved = true;
    event.currentTarget.scrollLeft = state.startLeft - dx;
    event.currentTarget.scrollTop = state.startTop - dy;
    event.preventDefault();
  };

  const finishPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = panStateRef.current;
    if (state.pointerId !== event.pointerId) return;
    clearPanTimer();
    if (state.active && state.moved) suppressPanClickRef.current = true;
    setTablePanning(false);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } catch { /* optional */ }
    panStateRef.current.pointerId = -1;
    panStateRef.current.active = false;
    window.setTimeout(() => { suppressPanClickRef.current = false; }, 0);
  };

  const suppressPanClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressPanClickRef.current) return;
    suppressPanClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => () => clearPanTimer(), []);
  const canBulkTechnical = canApprove;
  const canBulkCustomer = canApprove && (membershipRole === "PROJECT_MANAGER" || membershipRole === "OWNER");
  const canBulkManager = canApprove && (membershipRole === "PROJECT_MANAGER" || membershipRole === "OWNER");
  const canBulkInvestor = canApprove && membershipRole === "OWNER";
  const canBulkLifecycle = membershipRole === "PROJECT_MANAGER" || membershipRole === "OWNER";
  const canAnyBulkReview = canBulkTechnical || canBulkCustomer || canBulkManager || canBulkInvestor || canBulkLifecycle;

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
    const observationItems = Array.isArray(extra.reviewObservationItems) ? extra.reviewObservationItems : [];
    const customerObservations = value("customerObservations");
    const customerObservationItems = Array.isArray(extra.customerObservationItems) ? extra.customerObservationItems : [];
    const observationCountRaw = Number(extra.openObservationCount ?? (observationItems.length || (observations ? 1 : 0)));
    const approval = approvalVisual(metadata);
    const lifecycle = value("lifecycleStatus") || "Munkaközi";
    return {
      document,
      approvalStage: approval.kind,
      approvalTitle: approval.title,
      lifecycle,
      explicitName: value("planTitle") || value("drawingTitle"),
      displayName: (value("displayName") || value("planTitle") || value("drawingTitle")) || fileNameWithoutExtension(document.name),
      planNo: metadata?.planNo || "",
      effectiveDiscipline: metadata?.discipline || inherited?.discipline || "",
      effectiveTopic: value("topic") || inherited?.topic || "",
      scale: scaleSummary(metadata),
      checked: value("reviewChecked") || value("hageChecked"),
      result: value("reviewResult") || value("hageResult"),
      observations,
      workflow: value("workflowStatus") || metadata?.approvalStatus || "",
      internalNote: value("internalNote") || value("hageNote"),
      customer: value("customerApproval") || value("clientApproval"),
      customerObservations,
      customerObservationCount: customerObservationItems.length || (customerObservations ? 1 : 0),
      customerNote: value("customerNote") || value("clientNote"),
      projectManager: value("projectManagerApproval"),
      investorProjectManager: value("investorProjectManagerApproval"),
      revisionChange: value("revisionChange") || value("change"),
      observationCount: Number.isFinite(observationCountRaw) ? observationCountRaw : 0,
    };
  }), [documents, effectiveFolderClassification, metadataByDocument]);

  const reviewRows = useMemo(() => {
    const q = reviewSearch.trim().toLocaleLowerCase("hu-HU");
    return allReviewRows.filter((row) => {
      const matchesSearch = !q || [
        row.displayName,
        row.planNo,
        row.scale.title,
        row.document.name,
        row.effectiveDiscipline,
        row.effectiveTopic,
        row.observations,
        row.internalNote,
        row.customerObservations,
        row.customerNote,
      ].some((value) => value.toLocaleLowerCase("hu-HU").includes(q));
      return matchesSearch
        && (reviewDiscipline === "all" || row.effectiveDiscipline === reviewDiscipline)
        && (reviewTopic === "all" || row.effectiveTopic === reviewTopic)
        && (reviewStatus === "all" || (reviewStatus === "not-approved" ? !isApprovedReviewValue(row.customer) : row.workflow === reviewStatus))
        && (reviewApprovalStage === "all" || row.approvalStage === reviewApprovalStage)
        && (reviewLifecycle === "all" || row.lifecycle === reviewLifecycle);
    });
  }, [allReviewRows, reviewApprovalStage, reviewDiscipline, reviewLifecycle, reviewSearch, reviewStatus, reviewTopic]);

  const reviewDisciplines = useMemo(() => [...new Set(allReviewRows.map((row) => row.effectiveDiscipline).filter(Boolean))].sort(), [allReviewRows]);
  const reviewTopics = useMemo(() => [...new Set(allReviewRows.map((row) => row.effectiveTopic).filter(Boolean))].sort(), [allReviewRows]);
  const reviewStatuses = useMemo(() => [...new Set(allReviewRows.map((row) => row.workflow).filter(Boolean))].sort(), [allReviewRows]);
  const folderOptions = useMemo(
    () => [...folders].sort((a, b) => a.path.localeCompare(b.path, "hu-HU")),
    [folders],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleSelectionIds = viewMode === "review"
    ? reviewRows.map((row) => row.document.id)
    : documents.map((document) => document.id);
  const allVisibleSelected = visibleSelectionIds.length > 0 && visibleSelectionIds.every((id) => selectedSet.has(id));

  useEffect(() => {
    if (selectedDocumentIds) return;
    const available = new Set(documents.map((document) => document.id));
    setInternalSelectedIds((current) => current.filter((id) => available.has(id)));
  }, [documents, selectedDocumentIds]);

  const toggleDocumentSelection = (documentId: string) => {
    setSelectedIds((current) => current.includes(documentId)
      ? current.filter((id) => id !== documentId)
      : [...current, documentId]);
  };

  const toggleVisibleSelection = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const select = !visibleSelectionIds.every((id) => next.has(id));
      for (const id of visibleSelectionIds) select ? next.add(id) : next.delete(id);
      return [...next];
    });
  };

  const deleteSelected = async () => {
    if (!canDelete || !onDeleteSelected || !selectedIds.length || busy) return;
    await onDeleteSelected(selectedIds);
  };

  const resetBulkForm = () => setBulkForm({
    reviewChecked: "__KEEP__",
    reviewResult: "__KEEP__",
    workflowStatus: "__KEEP__",
    customerApproval: "__KEEP__",
    projectManagerApproval: "__KEEP__",
    investorProjectManagerApproval: "__KEEP__",
    lifecycleStatus: "__KEEP__",
  });

  const applyBulkReview = async () => {
    if (!bulkScope || !onBulkReview) return;
    const fields = Object.fromEntries(Object.entries(bulkForm).filter(([, value]) => value !== "__KEEP__"));
    if (!Object.keys(fields).length) return;
    const input = bulkScope === "folder" && currentFolder
      ? { folderId: currentFolder.id, includeDescendants: bulkIncludeDescendants, fields }
      : { documentIds: selectedIds, fields };
    await onBulkReview(input);
    setBulkScope(null);
    setSelectedIds([]);
    resetBulkForm();
  };

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

      <div className={styles.fileFolderNav}>
        <div className={styles.fileFolderNavLabel}><Folder size={14} /><strong>Mappa</strong></div>
        <select
          value={selectedFolderId}
          onChange={(event) => onFolderChange?.(event.target.value)}
          aria-label="Aktív mappa"
        >
          <option value="all">Dokumentumtár / összes fájl</option>
          {folderOptions.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.path.split("/").filter(Boolean).join(" / ")}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.fileFolderUpButton}
          onClick={onNavigateParent}
          disabled={!currentFolder || !onNavigateParent}
          title={currentFolder ? "Vissza a szülőmappába" : "Már a Dokumentumtárban vagy"}
          aria-label="Vissza a szülőmappába"
        >
          <FolderUp size={14} />
        </button>
        <span className={styles.fileFolderPath}>{currentFolder?.path || "Dokumentumtár / összes fájl"}</span>
      </div>

      <div className={styles.fileSelectionBar}>
        <label>
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleVisibleSelection}
            disabled={!visibleSelectionIds.length}
            aria-label="Látható fájlok kijelölése"
          />
          <span>{selectedIds.length} kijelölt</span>
        </label>
        <button type="button" disabled={!selectedIds.length || busy} onClick={() => setSelectedIds([])} title="Kijelölés törlése">Kijelölés törlése</button>
        {canDelete && onDeleteSelected && (
          <button type="button" className={styles.fileDeleteSelected} disabled={!selectedIds.length || busy} onClick={() => void deleteSelected()} title="Kijelölt dokumentumok lomtárba helyezése">
            <Trash2 size={12} /> Törlés
          </button>
        )}
      </div>

      <div className={styles.fileCompactControls}>
        {viewMode === "review" ? (
          <>
            <div className={styles.reviewCompactActions}>
              <strong>Tervellenőrzés <span>{reviewRows.length}/{allReviewRows.length}</span></strong>
              <button
                type="button"
                className={styles.reviewBulkPrimary}
                disabled={!canAnyBulkReview || busy || !currentFolder}
                onClick={() => { resetBulkForm(); setBulkScope("folder"); }}
                title={currentFolder ? "A mappában lévő tervek csoportos ellenőrzése" : "Előbb válassz ki egy mappát"}
              >
                Mappa
              </button>
              <button type="button" disabled={!canAnyBulkReview || busy || !selectedIds.length} onClick={() => { resetBulkForm(); setBulkScope("selection"); }} title="Kijelölt fájlok csoportos ellenőrzése">Kijelöltek</button>
              <span className={styles.reviewLegendCompact} title="✓ megfelelő · ⚠ javítandó · ↩ visszaadva · ◷ folyamatban · + új · ● módosult · ↪ áthelyezve · ✕ nem található · — nincs adat">Jelmagyarázat ⓘ</span>
            </div>
            <div className={styles.reviewCompactFilters}>
              <input aria-label="Keresés" className={styles.reviewSearch} value={reviewSearch} onChange={(event) => setReviewSearch(event.target.value)} placeholder="Keresés…" />
              <select aria-label="Szakág" title="Szakág" value={reviewDiscipline} onChange={(event) => setReviewDiscipline(event.target.value)}><option value="all">Szakág: mind</option>{reviewDisciplines.map((value) => <option key={value} value={value}>{value}</option>)}</select>
              <select aria-label="Témakör" title="Témakör" value={reviewTopic} onChange={(event) => setReviewTopic(event.target.value)}><option value="all">Témakör: mind</option>{reviewTopics.map((value) => <option key={value} value={value}>{value}</option>)}</select>
              <select aria-label="Workflow állapot" title="Workflow állapot" value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value)}><option value="all">Állapot: mind</option><option value="not-approved">Nincs még jóváhagyva</option>{reviewStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</select>
              <select aria-label="Jóváhagyási szint" title="Jóváhagyási szint" value={reviewApprovalStage} onChange={(event) => setReviewApprovalStage(event.target.value)}><option value="all">Jóváh.: mind</option><option value="pending">Ellenőrzésre vár</option><option value="review">Ellenőrzés alatt</option><option value="returned">Visszaadva</option><option value="customer">Megrendelő jóváhagyta</option><option value="manager">Projektvezető jóváhagyta</option><option value="investor">Beruházói PV jóváhagyta</option></select>
              <select aria-label="Életciklus" title="Életciklus" value={reviewLifecycle} onChange={(event) => setReviewLifecycle(event.target.value)}><option value="all">Életc.: mind</option><option value="Munkaközi">Munkaközi</option><option value="Aktuális">Aktuális</option><option value="Archív">Archív</option></select>
              <button type="button" className={styles.reviewReset} disabled={!reviewSearch && reviewDiscipline === "all" && reviewTopic === "all" && reviewStatus === "all" && reviewApprovalStage === "all" && reviewLifecycle === "all"} onClick={() => { setReviewSearch(""); setReviewDiscipline("all"); setReviewTopic("all"); setReviewStatus("all"); setReviewApprovalStage("all"); setReviewLifecycle("all"); }} title="Szűrők törlése">×</button>
            </div>
          </>
        ) : (
          <div className={styles.fileStatusLegend} aria-label="Tervállapot jelmagyarázat">
            <span className={styles.fileStatusLegendTitle}>Tervállapot</span>
            <span><i className={styles.legendSwatchPending} /> ellenőrzésre vár</span>
            <span><i className={styles.legendSwatchReview} /> ellenőrzés alatt</span>
            <span><i className={styles.legendSwatchReturned} /> visszaadva</span>
            <span><i className={styles.legendSwatchApproved} /> jóváhagyási szint</span>
            <span className={styles.fileStatusLegendDivider}>|</span>
            <span><i className={styles.legendRowCurrent} /> aktuális</span>
            <span><i className={styles.legendRowApproved} /> jóváhagyott aktuális</span>
            <span><i className={styles.legendRowArchive} /> archív</span>
          </div>
        )}
      </div>

      {viewMode === "review" ? (
        <div className={styles.reviewHost}>
          {bulkScope && (
            <div className={styles.reviewBulkEditor}>
              <div className={styles.reviewBulkEditorHead}>
                <div>
                  <strong>{bulkScope === "folder" ? "Mappa csoportos tervellenőrzése" : "Kijelölt fájlok csoportos tervellenőrzése"}</strong>
                  <span>{bulkScope === "folder" ? (currentFolder?.path || "—") : selectedIds.length + " kijelölt fájl"}</span>
                </div>
                <button type="button" onClick={() => setBulkScope(null)} disabled={busy}>Bezárás</button>
              </div>
              {bulkScope === "folder" && (
                <label className={styles.reviewBulkRecursive}>
                  <input type="checkbox" checked={bulkIncludeDescendants} onChange={(event) => setBulkIncludeDescendants(event.target.checked)} disabled={busy} />
                  Almappák fájljait is vegye bele
                </label>
              )}
              <div className={styles.reviewBulkGrid}>
                <label>Ellenőrzés<select value={bulkForm.reviewChecked} disabled={busy || !canBulkTechnical} onChange={(event) => setBulkForm((current) => ({ ...current, reviewChecked: event.target.value }))}><option value="__KEEP__">Nem módosítom</option><option value="Igen">Igen</option><option value="Nem">Nem</option></select></label>
                <label>Eredmény<select value={bulkForm.reviewResult} disabled={busy || !canBulkTechnical} onChange={(event) => setBulkForm((current) => ({ ...current, reviewResult: event.target.value }))}><option value="__KEEP__">Nem módosítom</option><option value="Megfelelő">Megfelelő</option><option value="Javítandó">Javítandó</option><option value="Visszaadva">Visszaadva</option></select></label>
                <label>Workflow állapot<select value={bulkForm.workflowStatus} disabled={busy || !canBulkTechnical} onChange={(event) => setBulkForm((current) => ({ ...current, workflowStatus: event.target.value }))}><option value="__KEEP__">Nem módosítom</option><option value="Ellenőrzésre vár">Ellenőrzésre vár</option><option value="Ellenőrzés alatt">Ellenőrzés alatt</option><option value="Javításra visszaadva">Javításra visszaadva</option><option value="Megrendelői jóváhagyásra vár">Megrendelői jóváhagyásra vár</option><option value="Jóváhagyva">Jóváhagyva</option></select></label>
                <label>Megrendelő<select value={bulkForm.customerApproval} disabled={busy || !canBulkCustomer} onChange={(event) => setBulkForm((current) => ({ ...current, customerApproval: event.target.value }))}><option value="__KEEP__">Nem módosítom</option><option value="Jóváhagyva">Jóváhagyva</option><option value="Elutasítva">Elutasítva</option></select></label>
                <label>Projektvezető<select value={bulkForm.projectManagerApproval} disabled={busy || !canBulkManager} onChange={(event) => setBulkForm((current) => ({ ...current, projectManagerApproval: event.target.value }))}><option value="__KEEP__">Nem módosítom</option><option value="Jóváhagyva">Jóváhagyva</option><option value="Elutasítva">Elutasítva</option></select></label>
                <label>Beruházói projektvezető<select value={bulkForm.investorProjectManagerApproval} disabled={busy || !canBulkInvestor} onChange={(event) => setBulkForm((current) => ({ ...current, investorProjectManagerApproval: event.target.value }))}><option value="__KEEP__">Nem módosítom</option><option value="Jóváhagyva">Jóváhagyva</option><option value="Elutasítva">Elutasítva</option></select></label>
                <label>Életciklus<select value={bulkForm.lifecycleStatus} disabled={busy || !canBulkLifecycle} onChange={(event) => setBulkForm((current) => ({ ...current, lifecycleStatus: event.target.value }))}><option value="__KEEP__">Nem módosítom</option><option value="Munkaközi">Munkaközi</option><option value="Aktuális">Aktuális</option><option value="Archív">Archív</option></select></label>
              </div>
              <div className={styles.reviewBulkActions}>
                <span>Csak a „Nem módosítom” értéktől eltérő mezők kerülnek csoportosan átírva.</span>
                <button type="button" className={styles.reviewBulkPrimary} disabled={busy || !Object.values(bulkForm).some((value) => value !== "__KEEP__")} onClick={() => void applyBulkReview()}>
                  {busy ? "Mentés…" : "Csoportos mentés"}
                </button>
              </div>
            </div>
          )}
          <div className={`${styles.reviewTableWrap} ${dragPanEnabled ? styles.tablePanEnabled : ""} ${tablePanning ? styles.tablePanning : ""}`} onPointerDown={handlePanPointerDown} onPointerMove={handlePanPointerMove} onPointerUp={finishPan} onPointerCancel={finishPan} onClickCapture={suppressPanClick}>
            <table className={styles.reviewTable} style={{ zoom: tableZoom / 100 }}>
              <colgroup>
                <col style={{ width: "34px" }} />
                <col style={{ width: "280px" }} />
                <col style={{ width: "110px" }} />
                <col style={{ width: "92px" }} />
                <col style={{ width: "160px" }} />
                <col style={{ width: "105px" }} />
                <col style={{ width: "112px" }} />
                <col style={{ width: "85px" }} />
                <col style={{ width: "105px" }} />
                <col style={{ width: "55px" }} />
                <col style={{ width: "65px" }} />
                <col style={{ width: "58px" }} />
                <col style={{ width: "65px" }} />
                <col style={{ width: "58px" }} />
                <col style={{ width: "58px" }} />
                <col style={{ width: "58px" }} />
                <col style={{ width: "58px" }} />
                <col style={{ width: "58px" }} />
                <col style={{ width: "62px" }} />
                <col style={{ width: "62px" }} />
                <col style={{ width: "64px" }} />
              </colgroup>
              <thead>
                <tr className={styles.reviewGroupHeader}>
                  <th colSpan={9}>Dokumentum</th>
                  <th colSpan={6} className={styles.reviewGroupTechnical}>Ellenőrzés</th>
                  <th colSpan={3} className={styles.reviewGroupCustomer}>Megrendelő</th>
                  <th className={styles.reviewGroupManager} title="Projektvezető">Projektv.</th>
                  <th className={styles.reviewGroupInvestor} title="Beruházói projektvezető">Ber. PV.</th>
                  <th className={styles.reviewGroupLifecycle}>Terv</th>
                </tr>
                <tr className={styles.reviewColumnHeader}>
                  <th className={styles.reviewSelectCell}><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSelection} aria-label="Látható tervek kijelölése" /></th>
                  <th title="Megjelenített tervnév">Név</th>
                  <th title="Tervszám">Tervszám</th>
                  <th title="Tervlépték">Lépték</th>
                  <th className={styles.reviewFileNameHeader} title="Eredeti fájlnév">Fájlnév</th>
                  <th title="Feltöltő">Feltöltő</th>
                  <th title="Fájlfeltöltés dátuma és ideje">Feltöltve</th>
                  <th title="Szakág">Szakág</th>
                  <th title="Témakör">Témakör</th>
                  <th title="Ellenőrzés">Ell.</th>
                  <th title="Eredmény">Eredm.</th>
                  <th title="Észrevételek">Észr.</th>
                  <th title="Workflow állapot">Áll.</th>
                  <th title="Belső megjegyzés">Belső</th>
                  <th title="Revízióváltozás">Rev.</th>
                  <th title="Megrendelői jóváhagyás">Jóváh.</th>
                  <th title="Megrendelői észrevételek">Észr.</th>
                  <th title="Megrendelői belső megjegyzés">Belső</th>
                  <th title="Projektvezetői jóváhagyás">Jóváh.</th>
                  <th title="Beruházói projektvezetői jóváhagyás">Jóváh.</th>
                  <th title="Terv életciklusa">Életc.</th>
                </tr>
              </thead>
              <tbody>
                {currentFolder && onNavigateParent && (
                  <tr className={styles.folderUpRow} onClick={onNavigateParent} title="Vissza a szülőmappába">
                    <td colSpan={21}>
                      <div className={styles.folderUpCell}>
                        <span className={styles.folderUpIcon}><FolderUp size={15} /></span>
                        <strong>[..]</strong>
                        <span>{currentFolder.parentId ? "Szülőmappa" : "Dokumentumtár"}</span>
                      </div>
                    </td>
                  </tr>
                )}
                {reviewRows.map((row) => (
                  <tr key={row.document.id} className={(selectedSet.has(row.document.id) ? styles.reviewRowSelected : "") + " " + lifecycleRowClass(metadataByDocument[row.document.id])} onClick={() => onSelectDocument(row.document)} onDoubleClick={() => onOpenDocument?.(row.document)} title="Kattintás: kijelölés · Dupla kattintás: megnyitás">
                    <td className={styles.reviewSelectCell}>
                      <input
                        type="checkbox"
                        checked={selectedSet.has(row.document.id)}
                        onChange={() => toggleDocumentSelection(row.document.id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={row.displayName + " kijelölése"}
                      />
                    </td>
                    <td>
                      <div className={styles.fileNameCell}>
                        <ReviewStateIcons
                          metadata={metadataByDocument[row.document.id]}
                          onApprovalClick={() => openDetail(row.document, approvalFocus(approvalVisual(metadataByDocument[row.document.id]).kind))}
                          onLifecycleClick={() => openDetail(row.document, "lifecycle")}
                        />
                        <span className={fileIconClass(row.document.extension)} title={row.document.extension?.toUpperCase() || "Fájl"}>
                          <FileKindIcon extension={row.document.extension} />
                        </span>
                        <button
                          type="button"
                          className={styles.reviewName + " " + (row.explicitName ? styles.reviewNameExplicit : styles.reviewNameFallback)}
                          title={row.displayName}
                          onClick={() => openDetail(row.document, "checked")}
                        >
                          {row.displayName}
                        </button>
                      </div>
                    </td>
                    <td><button type="button" className={styles.metadataCellButton} title={row.planNo || "Tervszám megadása"} onClick={() => openDetail(row.document, "planNo")}>{row.planNo || "—"}</button></td>
                    <td><button type="button" className={styles.metadataCellButton} title={row.scale.title} onClick={() => openDetail(row.document, "scales")}>{row.scale.text}</button></td>
                    <td className={styles.reviewFileName} title={row.document.name}>{row.document.name}</td>
                    <td>{uploaderLabel(row.document.currentVersion?.createdBy)}</td>
                    <td title={formatDate(row.document.currentVersion?.createdAt || row.document.updatedAt)}>{formatDate(row.document.currentVersion?.createdAt || row.document.updatedAt)}</td>
                    <td>{row.effectiveDiscipline || "—"}</td>
                    <td>{row.effectiveTopic || "—"}</td>
                    <td><button type="button" className={styles.reviewSymbol} title={row.checked || "Nincs ellenőrzési adat"} onClick={() => openDetail(row.document, "checked")}>{reviewMark(row.checked)}</button></td>
                    <td><button type="button" className={styles.reviewSymbol} title={row.result || "Nincs eredmény"} onClick={() => openDetail(row.document, "result")}>{reviewMark(row.result)}</button></td>
                    <td><button type="button" className={styles.reviewSymbol} title={row.observations || "Nincs észrevétel"} onClick={() => openDetail(row.document, "observations")}>{row.observationCount || "—"}</button></td>
                    <td><button type="button" className={styles.reviewSymbol} title={row.workflow || "Nincs workflow állapot"} onClick={() => openDetail(row.document, "workflow")}>{reviewMark(row.workflow)}</button></td>
                    <td><button type="button" className={styles.reviewSymbol} title={row.internalNote || "Nincs belső megjegyzés"} onClick={() => openDetail(row.document, "internal")}>{row.internalNote ? "●" : "—"}</button></td>
                    <td><button type="button" className={styles.reviewSymbol} title={row.revisionChange || "Nincs revízióváltozás"} onClick={() => openDetail(row.document, "revision")}>{revisionMark(row.revisionChange)}</button></td>
                    <td><button type="button" className={styles.reviewSymbol} title={row.customer || "Nincs jóváhagyás"} onClick={() => openDetail(row.document, "customer")}>{reviewMark(row.customer)}</button></td>
                    <td><button type="button" className={styles.reviewSymbol} title={row.customerObservations || "Nincs észrevétel"} onClick={() => openDetail(row.document, "customer-observations")}>{row.customerObservationCount || "—"}</button></td>
                    <td><button type="button" className={styles.reviewSymbol} title={row.customerNote || "Nincs belső megjegyzés"} onClick={() => openDetail(row.document, "customer-note")}>{row.customerNote ? "●" : "—"}</button></td>
                    <td><button type="button" className={styles.reviewSymbol} title={row.projectManager || "Nincs projektvezetői jóváhagyás"} onClick={() => openDetail(row.document, "project-manager")}>{reviewMark(row.projectManager)}</button></td>
                    <td><button type="button" className={styles.reviewSymbol} title={row.investorProjectManager || "Nincs beruházói projektvezetői jóváhagyás"} onClick={() => openDetail(row.document, "investor-project-manager")}>{reviewMark(row.investorProjectManager)}</button></td>
                    <td><button type="button" className={styles.reviewSymbol} title={row.lifecycle || "Nincs életciklus állapot"} onClick={() => openDetail(row.document, "lifecycle")}>{row.lifecycle === "Aktuális" ? "✓" : row.lifecycle === "Archív" ? "▣" : row.lifecycle === "Munkaközi" ? "◷" : "—"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!reviewRows.length && <div className={styles.tableEmpty}><strong>Nincs megjeleníthető terv</strong>A jelenlegi tervellenőrzési szűrésre nincs találat.</div>}
          </div>
        </div>
      ) : (
        <div className={`${styles.fileTableWrap} ${dragPanEnabled ? styles.tablePanEnabled : ""} ${tablePanning ? styles.tablePanning : ""}`} onPointerDown={handlePanPointerDown} onPointerMove={handlePanPointerMove} onPointerUp={finishPan} onPointerCancel={finishPan} onClickCapture={suppressPanClick}>
          {viewMode === "simple" ? (
            <table className={styles.fileTable} style={{ zoom: tableZoom / 100 }}>
              <colgroup>
                <col style={{ width: "34px" }} />
                <col style={{ width: "24%" }} /><col style={{ width: "20%" }} /><col style={{ width: "11%" }} /><col style={{ width: "7%" }} /><col style={{ width: "7%" }} /><col style={{ width: "8%" }} /><col style={{ width: "7%" }} /><col style={{ width: "8%" }} /><col style={{ width: "4%" }} /><col style={{ width: "10%" }} />
              </colgroup>
              <thead><tr><th className={styles.reviewSelectCell}><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSelection} aria-label="Látható fájlok kijelölése" /></th><th>Név</th><th>Fájlnév</th><th>Feltöltő</th><th>Típus</th><th>Revízió</th><th>Forrás</th><th>Méret</th><th>Feltöltve</th><th>BOX</th><th>Állapot</th></tr></thead>
              <tbody>
                {currentFolder && onNavigateParent && (
                  <tr className={styles.folderUpRow} onClick={onNavigateParent} title="Vissza a szülőmappába">
                    <td colSpan={11}>
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
                  const metadata = metadataByDocument[document.id];
                  const displayName = displayDocumentName(document, metadata);
                  return (
                    <tr key={document.id} className={`${styles.fileRow} ${selected ? styles.fileSelected : ""} ${selectedSet.has(document.id) ? styles.reviewRowSelected : ""} ${lifecycleRowClass(metadata)}`} onClick={() => onSelectDocument(document)} onDoubleClick={() => onOpenDocument?.(document)} draggable={!dragPanEnabled} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-dimpro-drive-document", JSON.stringify({ documentId: document.id, versionId: version?.id || null })); }} title="Kattintás: kijelölés · Dupla kattintás: megnyitás · CsomagBOX-hoz húzd a fájlt a polcra.">
                      <td className={styles.reviewSelectCell}><input type="checkbox" checked={selectedSet.has(document.id)} onChange={() => toggleDocumentSelection(document.id)} onClick={(event) => event.stopPropagation()} aria-label={displayName.value + " kijelölése"} /></td>
                      <td><div className={styles.fileNameCell}><ReviewStateIcons metadata={metadata} onApprovalClick={() => openDetail(document, approvalFocus(approvalVisual(metadata).kind))} onLifecycleClick={() => openDetail(document, "lifecycle")} /><span className={fileIconClass(document.extension)}><FileKindIcon extension={document.extension} /></span><strong className={displayName.explicit ? styles.fileDisplayNameExplicit : styles.fileDisplayNameFallback}>{displayName.value}</strong></div></td>
                      <td className={styles.fileRawName} title={document.name}>{document.name}</td>
                      <td>{uploaderLabel(version?.createdBy)}</td>
                      <td>{document.extension?.toUpperCase() || "FILE"}</td>
                      <td>{version?.revisionCode || `V${document.currentVersionNumber}`}</td>
                      <td><span className={`${styles.sourceDot} ${sourceClass}`} />{document.source === "WEB" ? "Web" : document.source}</td>
                      <td>{formatBytes(version?.sizeBytes || 0)}</td>
                      <td>{formatDate(document.updatedAt)}</td>
                      <td><div className={styles.boxDots}>{(boxColorsByDocument[document.id] || []).slice(0, 4).map((token, index) => <span key={`${token}-${index}`} className={boxDotClass(token)} />)}{(boxColorsByDocument[document.id] || []).length > 4 && <small>+{(boxColorsByDocument[document.id] || []).length - 4}</small>}</div></td>
                      <td><span className={`${styles.statusBadge} ${version?.status === "AVAILABLE" ? styles.statusAvailable : version?.status === "QUARANTINED" ? styles.statusQuarantine : ""}`}>{versionStatusLabel(version?.status)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className={styles.fileTable} style={{ zoom: tableZoom / 100 }}>
              <colgroup>
                <col style={{ width: "34px" }} />
                <col style={{ width: "20%" }} /><col style={{ width: "9%" }} /><col style={{ width: "8%" }} /><col style={{ width: "16%" }} /><col style={{ width: "9%" }} /><col style={{ width: "6%" }} /><col style={{ width: "9%" }} /><col style={{ width: "6%" }} /><col style={{ width: "6%" }} /><col style={{ width: "7%" }} /><col style={{ width: "7%" }} /><col style={{ width: "4%" }} /><col style={{ width: "9%" }} />
              </colgroup>
              <thead><tr><th className={styles.reviewSelectCell}><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSelection} aria-label="Látható fájlok kijelölése" /></th><th>Név</th><th>Tervszám</th><th>Lépték</th><th>Fájlnév</th><th>Feltöltő</th><th>Típus</th><th>MIME</th><th>Revízió</th><th>Verzió</th><th>Forrás</th><th>Méret</th><th>BOX</th><th>Állapot</th></tr></thead>
              <tbody>
                {currentFolder && onNavigateParent && (
                  <tr className={styles.folderUpRow} onClick={onNavigateParent} title="Vissza a szülőmappába">
                    <td colSpan={14}>
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
                  const metadata = metadataByDocument[document.id];
                  const displayName = displayDocumentName(document, metadata);
                  return (
                    <tr key={document.id} className={`${styles.fileRow} ${selected ? styles.fileSelected : ""} ${selectedSet.has(document.id) ? styles.reviewRowSelected : ""} ${lifecycleRowClass(metadata)}`} onClick={() => onSelectDocument(document)} onDoubleClick={() => onOpenDocument?.(document)} draggable={!dragPanEnabled} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-dimpro-drive-document", JSON.stringify({ documentId: document.id, versionId: version?.id || null })); }} title="Kattintás: kijelölés · Dupla kattintás: megnyitás · CsomagBOX-hoz húzd a fájlt a polcra.">
                                            <td className={styles.reviewSelectCell}><input type="checkbox" checked={selectedSet.has(document.id)} onChange={() => toggleDocumentSelection(document.id)} onClick={(event) => event.stopPropagation()} aria-label={displayName.value + " kijelölése"} /></td>
                      <td><div className={styles.fileNameCell}><ReviewStateIcons metadata={metadata} onApprovalClick={() => openDetail(document, approvalFocus(approvalVisual(metadata).kind))} onLifecycleClick={() => openDetail(document, "lifecycle")} /><span className={fileIconClass(document.extension)}><FileKindIcon extension={document.extension} /></span><strong className={displayName.explicit ? styles.fileDisplayNameExplicit : styles.fileDisplayNameFallback}>{displayName.value}</strong></div></td>
                      <td><button type="button" className={styles.metadataCellButton} title={metadata?.planNo || "Tervszám megadása"} onClick={() => openDetail(document, "planNo")}>{metadata?.planNo || "—"}</button></td>
                      <td><button type="button" className={styles.metadataCellButton} title={scaleSummary(metadata).title} onClick={() => openDetail(document, "scales")}>{scaleSummary(metadata).text}</button></td>
                      <td className={styles.fileRawName} title={document.name}>{document.name}</td>
                      <td>{uploaderLabel(version?.createdBy)}</td>
                      <td>{document.extension?.toUpperCase() || "FILE"}</td>
                      <td title={document.mimeType}>{document.mimeType || "–"}</td>
                      <td>{version?.revisionCode || "–"}</td>
                      <td>V{document.currentVersionNumber}</td>
                      <td>{document.source}</td>
                      <td>{formatBytes(version?.sizeBytes || 0)}</td>
                      <td><div className={styles.boxDots}>{(boxColorsByDocument[document.id] || []).slice(0, 4).map((token, index) => <span key={`${token}-${index}`} className={boxDotClass(token)} />)}{(boxColorsByDocument[document.id] || []).length > 4 && <small>+{(boxColorsByDocument[document.id] || []).length - 4}</small>}</div></td>
                      <td><span className={`${styles.statusBadge} ${version?.status === "AVAILABLE" ? styles.statusAvailable : version?.status === "QUARANTINED" ? styles.statusQuarantine : ""}`}>{versionStatusLabel(version?.status)}</span></td>
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
