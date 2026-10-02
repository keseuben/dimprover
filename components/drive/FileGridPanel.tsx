"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Archive, BadgeCheck, CheckCircle2, ChevronDown, ChevronUp, Clock3, File, FileSpreadsheet, FileText, Folder, FolderUp, Image as ImageIcon, Pencil, RefreshCw, RotateCcw, Search, ShieldCheck, Trash2 } from "lucide-react";
import type { DriveDocument, DriveEngineeringMetadata, DriveFolder, DriveViewMode } from "./driveTypes";
import OverflowTooltipText from "./OverflowTooltipText";
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
  newFolderEditorOpen?: boolean;
  newFolderName?: string;
  newFolderSaving?: boolean;
  onNewFolderNameChange?: (value: string) => void;
  onSaveNewFolder?: () => void;
  onCancelNewFolder?: () => void;
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
  const originalName = document.currentVersion?.originalName || document.name;
  return { explicit, value: explicit || fileNameWithoutExtension(originalName) };
}

function DisplayNameValue({
  document,
  metadata,
  canWrite,
  onEdit,
}: {
  document: DriveDocument;
  metadata?: DriveEngineeringMetadata;
  canWrite: boolean;
  onEdit: () => void;
}) {
  const displayName = displayDocumentName(document, metadata);
  return (
    <span className={styles.displayNameValue}>
      <OverflowTooltipText text={displayName.value} className={styles.displayNameText} />
      {!displayName.explicit && canWrite && (
        <button
          type="button"
          className={styles.missingDisplayNameButton}
          title="Egyedi név megadása"
          aria-label={displayName.value + " – egyedi név megadása"}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onEdit();
          }}
        >
          <Pencil size={11} />
        </button>
      )}
    </span>
  );
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

function versionLabel(value: number | undefined) {
  return "V" + String(Math.max(0, Number(value || 0))).padStart(2, "0");
}

function revisionLabel(document: DriveDocument) {
  const version = document.currentVersion;
  if (!version) return "R00";
  return version.revisionCode || ("R" + String(Math.max(0, Number(version.revisionNumber || 0))).padStart(2, "0"));
}

function numberingPresentation(document: DriveDocument) {
  switch (document.currentVersion?.numberingOrigin) {
    case "IMPORTED":
      return { className: styles.numberingImported, title: "Importált kezdőérték" };
    case "CORRECTED":
      return { className: styles.numberingCorrected, title: "Kézi korrekció" };
    default:
      return { className: styles.numberingSystem, title: "DIMPRO automatikusan létrehozta" };
  }
}

function engineeringRowStatusClass(metadata: DriveEngineeringMetadata | undefined) {
  const lifecycle = reviewMetadataValue(metadata, "lifecycleStatus").toLocaleLowerCase("hu-HU");
  if (lifecycle.includes("arch")) return styles.rowEngineeringArchive;
  if (lifecycle.includes("aktu")) {
    const manager = reviewMetadataValue(metadata, "projectManagerApproval");
    const investor = reviewMetadataValue(metadata, "investorProjectManagerApproval");
    return isApprovedReviewValue(investor) || isApprovedReviewValue(manager)
      ? styles.rowEngineeringApprovedCurrent
      : styles.rowEngineeringCurrent;
  }
  return styles.rowEngineeringWorking;
}

function reviewRowStatusClass(metadata: DriveEngineeringMetadata | undefined) {
  const lifecycle = reviewMetadataValue(metadata, "lifecycleStatus").toLocaleLowerCase("hu-HU");
  if (lifecycle.includes("arch")) return styles.rowReviewArchive;
  const approval = approvalVisual(metadata);
  if (approval.kind === "returned") return styles.rowReviewReturned;
  if (approval.kind === "review") return styles.rowReviewInProgress;
  if (approval.kind === "customer" || approval.kind === "manager" || approval.kind === "investor") return styles.rowReviewApproved;
  return styles.rowReviewPending;
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

function folderSecurityPresentation(folder: DriveFolder) {
  switch (folder.securityState) {
    case "PASSWORD":
      return {
        className: styles.folderSecurityPassword,
        title: folder.passwordUnlocked
          ? "Jelszóval védett mappa · feloldva ebben a munkamenetben"
          : "Jelszóval védett mappa · feloldás szükséges",
      };
    case "CUSTOM":
      return { className: styles.folderSecurityCustom, title: "Egyedi felhasználói mappajogosultság" };
    case "RESTRICTED":
      return { className: styles.folderSecurityRestricted, title: "Korlátozott mappajogosultság" };
    default:
      return { className: styles.folderSecurityNormal, title: "Normál mappa – projektjogosultság öröklése" };
  }
}

function FolderTableRow({
  folder,
  view,
  active,
  onSelect,
  onOpen,
}: {
  folder: DriveFolder;
  view: TableViewKey;
  active: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const security = folderSecurityPresentation(folder);
  const name = folder.displayName || folder.name;
  const icon = (
    <span className={`${styles.tableFolderIcon} ${security.className}`} title={security.title}>
      <Folder size={16} />
    </span>
  );
  const commonProps = {
    className: `${styles.tableFolderRow} ${active ? styles.tableFolderRowSelected : ""}`,
    onClick: onSelect,
    onDoubleClick: onOpen,
    onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onOpen();
      }
    },
    tabIndex: 0,
    title: security.title + " · Kattintás: kijelölés · Dupla kattintás: megnyitás",
  };

  if (view === "simple") {
    return (
      <tr {...commonProps}>
        <td className={styles.reviewSelectCell} />
        <td><div className={styles.tableFolderName}>{icon}<OverflowTooltipText text={name} className={styles.tableFolderNameText} /></div></td>
        <td className={styles.fileRawName}><OverflowTooltipText text={folder.name} /></td>
        <td>—</td>
        <td>Mappa</td>
        <td>—</td>
        <td>Drive</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td><span className={styles.folderStatusText}>{security.title}</span></td>
      </tr>
    );
  }

  if (view === "engineering") {
    return (
      <tr {...commonProps}>
        <td className={styles.reviewSelectCell} />
        <td className={styles.statusIconColumn}>{icon}</td>
        <td>—</td>
        <td><div className={styles.tableFolderName}><OverflowTooltipText text={name} className={styles.tableFolderNameText} /></div></td>
        <td>—</td>
        <td className={styles.fileRawName}><OverflowTooltipText text={folder.name} /></td>
        <td>—</td>
        <td>Mappa</td>
        <td>inode/directory</td>
        <td>—</td>
        <td>—</td>
        <td>Drive</td>
        <td>—</td>
        <td>—</td>
        <td><span className={styles.folderStatusText}>{security.title}</span></td>
      </tr>
    );
  }

  return (
    <tr {...commonProps}>
      <td className={styles.reviewSelectCell} />
      <td className={styles.statusIconColumn}>{icon}</td>
      <td>—</td>
      <td className={styles.reviewNameCell}><div className={styles.tableFolderName}><OverflowTooltipText text={name} className={styles.tableFolderNameText} /></div></td>
      <td>—</td>
      <td className={styles.reviewFileName}><OverflowTooltipText text={folder.name} /></td>
      <td>—</td>
      <td>—</td>
      <td><OverflowTooltipText text={folder.discipline || "—"} /></td>
      <td><OverflowTooltipText text={folder.topic || "—"} /></td>
      {Array.from({ length: 12 }, (_, index) => <td key={index}>—</td>)}
    </tr>
  );
}

type TableSortKey = "name" | "fileName" | "uploadedAt";
type SortDirection = "asc" | "desc";
type TableViewKey = "simple" | "engineering" | "review";
type TableSortState = { key: TableSortKey; direction: SortDirection };

type TableColumnConfig = {
  id: string;
  defaultWidth: number;
  minWidth: number;
  resizable?: boolean;
};

type ColumnWidthsByView = Record<TableViewKey, Record<string, number>>;

const SIMPLE_COLUMNS: readonly TableColumnConfig[] = [
  { id: "select", defaultWidth: 34, minWidth: 34, resizable: false },
  { id: "name", defaultWidth: 260, minWidth: 160 },
  { id: "fileName", defaultWidth: 220, minWidth: 140 },
  { id: "uploader", defaultWidth: 120, minWidth: 90 },
  { id: "type", defaultWidth: 80, minWidth: 65 },
  { id: "revision", defaultWidth: 85, minWidth: 70 },
  { id: "source", defaultWidth: 90, minWidth: 70 },
  { id: "size", defaultWidth: 90, minWidth: 70 },
  { id: "uploadedAt", defaultWidth: 125, minWidth: 110 },
  { id: "box", defaultWidth: 60, minWidth: 50 },
  { id: "status", defaultWidth: 110, minWidth: 90 },
];

const ENGINEERING_COLUMNS: readonly TableColumnConfig[] = [
  { id: "select", defaultWidth: 34, minWidth: 34, resizable: false },
  { id: "statusIcons", defaultWidth: 78, minWidth: 64 },
  { id: "planNo", defaultWidth: 100, minWidth: 90 },
  { id: "name", defaultWidth: 240, minWidth: 160 },
  { id: "scale", defaultWidth: 90, minWidth: 75 },
  { id: "fileName", defaultWidth: 180, minWidth: 140 },
  { id: "uploader", defaultWidth: 110, minWidth: 90 },
  { id: "type", defaultWidth: 80, minWidth: 65 },
  { id: "mime", defaultWidth: 130, minWidth: 120 },
  { id: "revision", defaultWidth: 80, minWidth: 70 },
  { id: "version", defaultWidth: 70, minWidth: 60 },
  { id: "source", defaultWidth: 85, minWidth: 70 },
  { id: "size", defaultWidth: 85, minWidth: 70 },
  { id: "box", defaultWidth: 60, minWidth: 50 },
  { id: "status", defaultWidth: 110, minWidth: 90 },
];

const REVIEW_COLUMNS: readonly TableColumnConfig[] = [
  { id: "select", defaultWidth: 34, minWidth: 34, resizable: false },
  { id: "statusIcons", defaultWidth: 78, minWidth: 64 },
  { id: "planNo", defaultWidth: 110, minWidth: 80 },
  { id: "name", defaultWidth: 280, minWidth: 160 },
  { id: "scale", defaultWidth: 92, minWidth: 70 },
  { id: "fileName", defaultWidth: 160, minWidth: 130 },
  { id: "uploader", defaultWidth: 105, minWidth: 90 },
  { id: "uploadedAt", defaultWidth: 112, minWidth: 105 },
  { id: "discipline", defaultWidth: 85, minWidth: 80 },
  { id: "topic", defaultWidth: 105, minWidth: 90 },
  { id: "checked", defaultWidth: 55, minWidth: 50 },
  { id: "result", defaultWidth: 65, minWidth: 50 },
  { id: "observations", defaultWidth: 58, minWidth: 50 },
  { id: "workflow", defaultWidth: 65, minWidth: 50 },
  { id: "internal", defaultWidth: 58, minWidth: 50 },
  { id: "revisionChange", defaultWidth: 58, minWidth: 50 },
  { id: "customer", defaultWidth: 58, minWidth: 50 },
  { id: "customerObservations", defaultWidth: 58, minWidth: 50 },
  { id: "customerNote", defaultWidth: 58, minWidth: 50 },
  { id: "projectManager", defaultWidth: 62, minWidth: 52 },
  { id: "investorProjectManager", defaultWidth: 62, minWidth: 52 },
  { id: "lifecycle", defaultWidth: 64, minWidth: 54 },
];

const TABLE_COLUMN_CONFIGS: Record<TableViewKey, readonly TableColumnConfig[]> = {
  simple: SIMPLE_COLUMNS,
  engineering: ENGINEERING_COLUMNS,
  review: REVIEW_COLUMNS,
};

function createColumnWidthMap(columns: readonly TableColumnConfig[]) {
  return Object.fromEntries(columns.map((column) => [column.id, column.defaultWidth])) as Record<string, number>;
}

function compareTableText(a: unknown, b: unknown) {
  return String(a || "").localeCompare(String(b || ""), "hu-HU", { sensitivity: "base", numeric: true });
}

function compareTableDates(a: string | null | undefined, b: string | null | undefined, direction: SortDirection) {
  const aTime = a ? Date.parse(a) : Number.NaN;
  const bTime = b ? Date.parse(b) : Number.NaN;
  const aValid = Number.isFinite(aTime);
  const bValid = Number.isFinite(bTime);
  if (!aValid && !bValid) return 0;
  if (!aValid) return 1;
  if (!bValid) return -1;
  return (aTime - bTime) * (direction === "asc" ? 1 : -1);
}

type SortableResizableHeaderProps = {
  label: string;
  title?: string;
  className?: string;
  sortKey?: TableSortKey;
  sortState: TableSortState;
  onSort: (key: TableSortKey) => void;
  resizeLabel: string;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

function SortableResizableHeader({
  label,
  title,
  className = "",
  sortKey,
  sortState,
  onSort,
  resizeLabel,
  onResizeStart,
}: SortableResizableHeaderProps) {
  const active = Boolean(sortKey && sortState.key === sortKey);
  const ariaSort = sortKey ? (active ? (sortState.direction === "asc" ? "ascending" : "descending") : "none") : undefined;
  const headerClassName = (styles.resizableTableHeader + " " + className).trim();

  return (
    <th className={headerClassName} title={title} aria-sort={ariaSort}>
      {sortKey ? (
        <button type="button" className={styles.sortableHeaderButton} onClick={() => onSort(sortKey)}>
          <span>{label}</span>
          <span className={styles.sortDirectionIndicator + (active ? " " + styles.sortDirectionActive : "")} aria-hidden="true">
            {active ? (sortState.direction === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
          </span>
        </button>
      ) : (
        <span className={styles.tableHeaderLabel}>{label}</span>
      )}
      <button
        type="button"
        className={styles.columnResizeHandle}
        aria-label={resizeLabel}
        title={resizeLabel}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerDown={onResizeStart}
      />
    </th>
  );
}

type InlineNewFolderRowProps = {
  open: boolean;
  colSpan: number;
  name: string;
  saving: boolean;
  onNameChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

function InlineNewFolderRow({ open, colSpan, name, saving, onNameChange, onSave, onCancel }: InlineNewFolderRowProps) {
  if (!open) return null;

  return (
    <tr className={styles.newFolderRow}>
      <td colSpan={colSpan} className={styles.newFolderCell}>
        <div
          className={styles.newFolderEditor}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span className={styles.newFolderIcon}><Folder size={15} /></span>
          <input
            className={styles.newFolderInput}
            value={name}
            autoFocus
            disabled={saving}
            aria-label="Új mappa neve"
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => onNameChange(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                if (!saving && name.trim()) onSave();
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                if (!saving) onCancel();
              }
            }}
          />
          <span className={saving ? styles.newFolderSaving : styles.newFolderHint}>
            {saving ? "Mentés…" : "Enter: mentés · Esc: mégse"}
          </span>
        </div>
      </td>
    </tr>
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
  newFolderEditorOpen = false,
  newFolderName = "",
  newFolderSaving = false,
  onNewFolderNameChange = () => undefined,
  onSaveNewFolder = () => undefined,
  onCancelNewFolder = () => undefined,
}: Props) {
  const [reviewDiscipline, setReviewDiscipline] = useState("all");
  const [reviewTopic, setReviewTopic] = useState("all");
  const [reviewStatus, setReviewStatus] = useState("all");
  const [reviewApprovalStage, setReviewApprovalStage] = useState("all");
  const [reviewLifecycle, setReviewLifecycle] = useState("all");
  const [reviewSearch, setReviewSearch] = useState("");
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);
  const [activeFolderRowId, setActiveFolderRowId] = useState("");
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
  const [sortState, setSortState] = useState<TableSortState>({ key: "name", direction: "asc" });
  const [columnWidths, setColumnWidths] = useState<ColumnWidthsByView>(() => ({
    simple: createColumnWidthMap(SIMPLE_COLUMNS),
    engineering: createColumnWidthMap(ENGINEERING_COLUMNS),
    review: createColumnWidthMap(REVIEW_COLUMNS),
  }));
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  const toggleSort = (key: TableSortKey) => {
    setSortState((current) => {
      if (current.key === key) return { key, direction: current.direction === "asc" ? "desc" : "asc" };
      return { key, direction: key === "uploadedAt" ? "desc" : "asc" };
    });
  };

  const tableMinWidth = (view: TableViewKey) => TABLE_COLUMN_CONFIGS[view].reduce(
    (total, column) => total + (columnWidths[view][column.id] ?? column.defaultWidth),
    0,
  );

  const startColumnResize = (view: TableViewKey, columnId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const config = TABLE_COLUMN_CONFIGS[view].find((column) => column.id === columnId);
    if (!config || config.resizable === false) return;

    resizeCleanupRef.current?.();
    const startX = event.clientX;
    const startWidth = columnWidths[view][columnId] ?? config.defaultWidth;
    const zoomFactor = Math.max(0.01, tableZoom / 100);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = (moveEvent.clientX - startX) / zoomFactor;
      const nextWidth = Math.max(config.minWidth, Math.round(startWidth + delta));
      setColumnWidths((current) => ({
        ...current,
        [view]: { ...current[view], [columnId]: nextWidth },
      }));
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      if (resizeCleanupRef.current === cleanup) resizeCleanupRef.current = null;
    };
    const handlePointerUp = () => cleanup();

    resizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

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
  useEffect(() => () => resizeCleanupRef.current?.(), []);
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
      explicitName: value("displayName") || value("planTitle") || value("drawingTitle"),
      displayName: (value("displayName") || value("planTitle") || value("drawingTitle")) || fileNameWithoutExtension(document.currentVersion?.originalName || document.name),
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

  const childFolders = useMemo(() => {
    const targetParentId = selectedFolderId === "all" ? null : selectedFolderId;
    return folders
      .filter((folder) => folder.parentId === targetParentId)
      .sort((a, b) => {
        const order = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
        if (order) return order;
        return compareTableText(a.displayName || a.name, b.displayName || b.name);
      });
  }, [folders, selectedFolderId]);

  const sortedDocuments = useMemo(() => {
    return [...documents].sort((a, b) => {
      if (sortState.key === "uploadedAt") return compareTableDates(a.updatedAt, b.updatedAt, sortState.direction);
      const aValue = sortState.key === "fileName" ? a.name : displayDocumentName(a, metadataByDocument[a.id]).value;
      const bValue = sortState.key === "fileName" ? b.name : displayDocumentName(b, metadataByDocument[b.id]).value;
      const result = compareTableText(aValue, bValue);
      return result * (sortState.direction === "asc" ? 1 : -1);
    });
  }, [documents, metadataByDocument, sortState]);

  const sortedReviewRows = useMemo(() => {
    return [...reviewRows].sort((a, b) => {
      if (sortState.key === "uploadedAt") {
        return compareTableDates(
          a.document.currentVersion?.createdAt || a.document.updatedAt,
          b.document.currentVersion?.createdAt || b.document.updatedAt,
          sortState.direction,
        );
      }
      const aValue = sortState.key === "fileName" ? a.document.name : a.displayName;
      const bValue = sortState.key === "fileName" ? b.document.name : b.displayName;
      const result = compareTableText(aValue, bValue);
      return result * (sortState.direction === "asc" ? 1 : -1);
    });
  }, [reviewRows, sortState]);

  const reviewDisciplines = useMemo(() => [...new Set(allReviewRows.map((row) => row.effectiveDiscipline).filter(Boolean))].sort(), [allReviewRows]);
  const reviewTopics = useMemo(() => [...new Set(allReviewRows.map((row) => row.effectiveTopic).filter(Boolean))].sort(), [allReviewRows]);
  const reviewStatuses = useMemo(() => [...new Set(allReviewRows.map((row) => row.workflow).filter(Boolean))].sort(), [allReviewRows]);
  const folderOptions = useMemo(
    () => [...folders].sort((a, b) => a.path.localeCompare(b.path, "hu-HU")),
    [folders],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleSelectionIds = viewMode === "review"
    ? sortedReviewRows.map((row) => row.document.id)
    : sortedDocuments.map((document) => document.id);
  const allVisibleSelected = visibleSelectionIds.length > 0 && visibleSelectionIds.every((id) => selectedSet.has(id));

  const beginDocumentDrag = (event: ReactDragEvent<HTMLElement>, document: DriveDocument) => {
    event.stopPropagation();
    const version = document.currentVersion;
    const documentIds = selectedSet.has(document.id) && selectedIds.length > 1
      ? selectedIds
      : [document.id];
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-dimpro-drive-document", JSON.stringify({
      documentId: document.id,
      documentIds,
      versionId: version?.id || null,
    }));
    event.dataTransfer.setData("text/plain", document.name);
  };

  useEffect(() => {
    setActiveFolderRowId("");
  }, [selectedFolderId]);

  useEffect(() => {
    if (selectedDocumentIds) return;
    const available = new Set(documents.map((document) => document.id));
    setInternalSelectedIds((current) => current.filter((id) => available.has(id)));
  }, [documents, selectedDocumentIds]);

  const selectDocumentRow = (document: DriveDocument) => {
    setActiveFolderRowId("");
    onSelectDocument(document);
  };

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
          <OverflowTooltipText text={title} className={styles.filePanelTitleMain} />
          <OverflowTooltipText text={subtitle} className={styles.filePanelSubtitle} />
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
              {(folder.displayPath || folder.path).split("/").filter(Boolean).join(" / ")}
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
        <OverflowTooltipText text={currentFolder?.displayPath || currentFolder?.path || "Dokumentumtár / összes fájl"} className={styles.fileFolderPath} />
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
              <span className={styles.reviewLegendCompact} title="✓ megfelelő · ⚠ javítandó · ↩ visszaadva · ◷ folyamatban · + új · ● módosult · ↪ áthelyezve · ✕ nem található · — nincs adat · Sor: szürke várakozó · kék ellenőrzés alatt · narancs visszaadva · zöld jóváhagyott · szürke archív">Jelmagyarázat ⓘ</span>
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
        ) : viewMode === "simple" ? (
          <div className={styles.fileStatusLegend} aria-label="Fájlállapot jelmagyarázat">
            <span className={styles.fileStatusLegendTitle}>Fájlállapot</span>
            <span><i className={styles.legendSimpleAvailable} /> elérhető</span>
            <span><i className={styles.legendSimpleQuarantine} /> biztonsági ellenőrzés</span>
            <span><i className={styles.legendSimpleRejected} /> elutasítva</span>
            <span><i className={styles.legendSimpleProcessing} /> feldolgozás / metaadat</span>
          </div>
        ) : (
          <div className={styles.fileStatusLegend} aria-label="Műszaki tervállapot jelmagyarázat">
            <span className={styles.fileStatusLegendTitle}>Műszaki tervállapot</span>
            <span><i className={styles.legendEngineeringWorking} /> munkaközi</span>
            <span><i className={styles.legendEngineeringCurrent} /> aktuális</span>
            <span><i className={styles.legendEngineeringApproved} /> jóváhagyott aktuális</span>
            <span><i className={styles.legendEngineeringArchive} /> archív</span>
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
            <table className={styles.reviewTable} style={{ zoom: tableZoom / 100, minWidth: Math.max(1742, tableMinWidth("review")) + "px" }}>
              <colgroup>
                {REVIEW_COLUMNS.map((column) => (
                  <col key={column.id} style={{ width: (columnWidths.review[column.id] ?? column.defaultWidth) + "px" }} />
                ))}
              </colgroup>
              <thead>
                <tr className={styles.reviewGroupHeader}>
                  <th colSpan={10}>Dokumentum</th>
                  <th colSpan={6} className={styles.reviewGroupTechnical}>Ellenőrzés</th>
                  <th colSpan={3} className={styles.reviewGroupCustomer}>Megrendelő</th>
                  <th className={styles.reviewGroupManager} title="Projektvezető">Projektv.</th>
                  <th className={styles.reviewGroupInvestor} title="Beruházói projektvezető">Ber. PV.</th>
                  <th className={styles.reviewGroupLifecycle}>Terv</th>
                </tr>
                <tr className={styles.reviewColumnHeader}>
                  <th className={styles.reviewSelectCell}><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSelection} aria-label="Látható tervek kijelölése" /></th>
                  <SortableResizableHeader label="" className={styles.statusIconColumn} title="Állapotjelzők és fájltípus" sortState={sortState} onSort={toggleSort} resizeLabel="Állapot oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "statusIcons", event)} />
                  <SortableResizableHeader label="Tervszám" title="Tervszám" sortState={sortState} onSort={toggleSort} resizeLabel="Tervszám oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "planNo", event)} />
                  <SortableResizableHeader label="Név" className={styles.reviewNameHeader} title="Megjelenített tervnév" sortKey="name" sortState={sortState} onSort={toggleSort} resizeLabel="Név oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "name", event)} />
                  <SortableResizableHeader label="Lépték" title="Tervlépték" sortState={sortState} onSort={toggleSort} resizeLabel="Lépték oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "scale", event)} />
                  <SortableResizableHeader label="Fájlnév" className={styles.reviewFileNameHeader} title="Eredeti fájlnév" sortKey="fileName" sortState={sortState} onSort={toggleSort} resizeLabel="Fájlnév oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "fileName", event)} />
                  <SortableResizableHeader label="Feltöltő" title="Feltöltő" sortState={sortState} onSort={toggleSort} resizeLabel="Feltöltő oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "uploader", event)} />
                  <SortableResizableHeader label="Feltöltve" title="Fájlfeltöltés dátuma és ideje" sortKey="uploadedAt" sortState={sortState} onSort={toggleSort} resizeLabel="Feltöltve oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "uploadedAt", event)} />
                  <SortableResizableHeader label="Szakág" title="Szakág" sortState={sortState} onSort={toggleSort} resizeLabel="Szakág oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "discipline", event)} />
                  <SortableResizableHeader label="Témakör" title="Témakör" sortState={sortState} onSort={toggleSort} resizeLabel="Témakör oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "topic", event)} />
                  <SortableResizableHeader label="Ell." title="Ellenőrzés" sortState={sortState} onSort={toggleSort} resizeLabel="Ellenőrzés oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "checked", event)} />
                  <SortableResizableHeader label="Eredm." title="Eredmény" sortState={sortState} onSort={toggleSort} resizeLabel="Eredmény oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "result", event)} />
                  <SortableResizableHeader label="Észr." title="Észrevételek" sortState={sortState} onSort={toggleSort} resizeLabel="Észrevételek oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "observations", event)} />
                  <SortableResizableHeader label="Áll." title="Workflow állapot" sortState={sortState} onSort={toggleSort} resizeLabel="Workflow oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "workflow", event)} />
                  <SortableResizableHeader label="Belső" title="Belső megjegyzés" sortState={sortState} onSort={toggleSort} resizeLabel="Belső megjegyzés oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "internal", event)} />
                  <SortableResizableHeader label="Rev." title="Revízióváltozás" sortState={sortState} onSort={toggleSort} resizeLabel="Revízió oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "revisionChange", event)} />
                  <SortableResizableHeader label="Jóváh." title="Megrendelői jóváhagyás" sortState={sortState} onSort={toggleSort} resizeLabel="Megrendelői jóváhagyás oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "customer", event)} />
                  <SortableResizableHeader label="Észr." title="Megrendelői észrevételek" sortState={sortState} onSort={toggleSort} resizeLabel="Megrendelői észrevételek oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "customerObservations", event)} />
                  <SortableResizableHeader label="Belső" title="Megrendelői belső megjegyzés" sortState={sortState} onSort={toggleSort} resizeLabel="Megrendelői belső megjegyzés oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "customerNote", event)} />
                  <SortableResizableHeader label="Jóváh." title="Projektvezetői jóváhagyás" sortState={sortState} onSort={toggleSort} resizeLabel="Projektvezetői jóváhagyás oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "projectManager", event)} />
                  <SortableResizableHeader label="Jóváh." title="Beruházói projektvezetői jóváhagyás" sortState={sortState} onSort={toggleSort} resizeLabel="Beruházói jóváhagyás oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "investorProjectManager", event)} />
                  <SortableResizableHeader label="Életc." title="Terv életciklusa" sortState={sortState} onSort={toggleSort} resizeLabel="Életciklus oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("review", "lifecycle", event)} />
                </tr>
              </thead>
              <tbody>
                {currentFolder && onNavigateParent && (
                  <tr className={styles.folderUpRow} onClick={onNavigateParent} title="Vissza a szülőmappába">
                    <td colSpan={22}>
                      <div className={styles.folderUpCell}>
                        <span className={styles.folderUpIcon}><FolderUp size={15} /></span>
                        <strong>[..]</strong>
                        <span>{currentFolder.parentId ? "Szülőmappa" : "Dokumentumtár"}</span>
                      </div>
                    </td>
                  </tr>
                )}
                <InlineNewFolderRow
                  open={newFolderEditorOpen}
                  colSpan={22}
                  name={newFolderName}
                  saving={newFolderSaving}
                  onNameChange={onNewFolderNameChange}
                  onSave={onSaveNewFolder}
                  onCancel={onCancelNewFolder}
                />
                {childFolders.map((folder) => (
                  <FolderTableRow
                    key={folder.id}
                    folder={folder}
                    view="review"
                    active={activeFolderRowId === folder.id}
                    onSelect={() => setActiveFolderRowId(folder.id)}
                    onOpen={() => onFolderChange?.(folder.id)}
                  />
                ))}
                {sortedReviewRows.map((row) => (
                  <tr key={row.document.id} className={`${selectedDocumentId === row.document.id ? styles.fileSelected : ""} ${selectedSet.has(row.document.id) ? styles.reviewRowSelected : ""} ${reviewRowStatusClass(metadataByDocument[row.document.id])}`} onClick={() => selectDocumentRow(row.document)} onDoubleClick={() => onOpenDocument?.(row.document)} title="Kattintás: kijelölés · Dupla kattintás: megnyitás · A fájlikont húzd CsomagBOX-ba">
                    <td className={styles.reviewSelectCell}>
                      <input
                        type="checkbox"
                        checked={selectedSet.has(row.document.id)}
                        onChange={() => toggleDocumentSelection(row.document.id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={row.displayName + " kijelölése"}
                      />
                    </td>
                    <td className={styles.statusIconColumn}>
                      <div className={styles.statusIconStrip}>
                        <ReviewStateIcons
                          metadata={metadataByDocument[row.document.id]}
                          onApprovalClick={() => openDetail(row.document, approvalFocus(approvalVisual(metadataByDocument[row.document.id]).kind))}
                          onLifecycleClick={() => openDetail(row.document, "lifecycle")}
                        />
                        <span
                          className={`${fileIconClass(row.document.extension)} ${styles.fileDragHandle}`}
                          draggable
                          onPointerDown={(event) => event.stopPropagation()}
                          onDragStart={(event) => beginDocumentDrag(event, row.document)}
                          title="Húzd a fájlt CsomagBOX-ba"
                          aria-label={`${row.displayName} CsomagBOX-ba húzása`}
                        >
                          <FileKindIcon extension={row.document.extension} />
                        </span>
                      </div>
                    </td>
                    <td><button type="button" className={styles.metadataCellButton} title={row.planNo || "Tervszám megadása"} onClick={() => openDetail(row.document, "planNo")}>{row.planNo || "—"}</button></td>
                    <td className={styles.reviewNameCell}>
                      <DisplayNameValue document={row.document} metadata={metadataByDocument[row.document.id]} canWrite={canWrite} onEdit={() => openDetail(row.document, "planTitle")} />
                    </td>
                    <td><button type="button" className={styles.metadataCellButton} title={row.scale.title} onClick={() => openDetail(row.document, "scales")}>{row.scale.text}</button></td>
                    <td className={styles.reviewFileName}><OverflowTooltipText text={row.document.name} /></td>
                    <td><OverflowTooltipText text={uploaderLabel(row.document.currentVersion?.createdBy)} /></td>
                    <td title={formatDate(row.document.currentVersion?.createdAt || row.document.updatedAt)}>{formatDate(row.document.currentVersion?.createdAt || row.document.updatedAt)}</td>
                    <td><OverflowTooltipText text={row.effectiveDiscipline || "—"} /></td>
                    <td><OverflowTooltipText text={row.effectiveTopic || "—"} /></td>
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
            {!reviewRows.length && !childFolders.length && <div className={styles.tableEmpty}><strong>Nincs megjeleníthető terv</strong>A jelenlegi tervellenőrzési szűrésre nincs találat.</div>}
          </div>
        </div>
      ) : (
        <div className={`${styles.fileTableWrap} ${dragPanEnabled ? styles.tablePanEnabled : ""} ${tablePanning ? styles.tablePanning : ""}`} onPointerDown={handlePanPointerDown} onPointerMove={handlePanPointerMove} onPointerUp={finishPan} onPointerCancel={finishPan} onClickCapture={suppressPanClick}>
          {viewMode === "simple" ? (
            <table className={styles.fileTable} style={{ zoom: tableZoom / 100, minWidth: tableMinWidth("simple") + "px" }}>
              <colgroup>
                {SIMPLE_COLUMNS.map((column) => (
                  <col key={column.id} style={{ width: (columnWidths.simple[column.id] ?? column.defaultWidth) + "px" }} />
                ))}
              </colgroup>
              <thead><tr>
                <th className={styles.reviewSelectCell}><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSelection} aria-label="Látható fájlok kijelölése" /></th>
                <SortableResizableHeader label="Név" sortKey="name" sortState={sortState} onSort={toggleSort} resizeLabel="Név oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("simple", "name", event)} />
                <SortableResizableHeader label="Fájlnév" sortKey="fileName" sortState={sortState} onSort={toggleSort} resizeLabel="Fájlnév oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("simple", "fileName", event)} />
                <SortableResizableHeader label="Feltöltő" sortState={sortState} onSort={toggleSort} resizeLabel="Feltöltő oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("simple", "uploader", event)} />
                <SortableResizableHeader label="Típus" sortState={sortState} onSort={toggleSort} resizeLabel="Típus oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("simple", "type", event)} />
                <SortableResizableHeader label="Revízió" sortState={sortState} onSort={toggleSort} resizeLabel="Revízió oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("simple", "revision", event)} />
                <SortableResizableHeader label="Forrás" sortState={sortState} onSort={toggleSort} resizeLabel="Forrás oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("simple", "source", event)} />
                <SortableResizableHeader label="Méret" sortState={sortState} onSort={toggleSort} resizeLabel="Méret oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("simple", "size", event)} />
                <SortableResizableHeader label="Feltöltve" sortKey="uploadedAt" sortState={sortState} onSort={toggleSort} resizeLabel="Feltöltve oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("simple", "uploadedAt", event)} />
                <SortableResizableHeader label="BOX" sortState={sortState} onSort={toggleSort} resizeLabel="BOX oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("simple", "box", event)} />
                <SortableResizableHeader label="Állapot" sortState={sortState} onSort={toggleSort} resizeLabel="Állapot oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("simple", "status", event)} />
              </tr></thead>
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
                <InlineNewFolderRow
                  open={newFolderEditorOpen}
                  colSpan={11}
                  name={newFolderName}
                  saving={newFolderSaving}
                  onNameChange={onNewFolderNameChange}
                  onSave={onSaveNewFolder}
                  onCancel={onCancelNewFolder}
                />
                {childFolders.map((folder) => (
                  <FolderTableRow
                    key={folder.id}
                    folder={folder}
                    view="simple"
                    active={activeFolderRowId === folder.id}
                    onSelect={() => setActiveFolderRowId(folder.id)}
                    onOpen={() => onFolderChange?.(folder.id)}
                  />
                ))}
                {sortedDocuments.map((document) => {
                  const version = document.currentVersion;
                  const selected = selectedDocumentId === document.id;
                  const sourceClass = document.source === "DROP" ? styles.sourceDrop : document.source === "DESKTOP" ? styles.sourceDesktop : "";
                  const metadata = metadataByDocument[document.id];
                  const displayName = displayDocumentName(document, metadata);
                  return (
                    <tr key={document.id} className={`${styles.fileRow} ${selected ? styles.fileSelected : ""} ${selectedSet.has(document.id) ? styles.reviewRowSelected : ""}`} onClick={() => selectDocumentRow(document)} onDoubleClick={() => onOpenDocument?.(document)} title="Kattintás: kijelölés · Dupla kattintás: megnyitás · A fájlikont húzd CsomagBOX-ba">
                      <td className={styles.reviewSelectCell}><input type="checkbox" checked={selectedSet.has(document.id)} onChange={() => toggleDocumentSelection(document.id)} onClick={(event) => event.stopPropagation()} aria-label={displayName.value + " kijelölése"} /></td>
                      <td><div className={styles.fileNameCell}><ReviewStateIcons metadata={metadata} onApprovalClick={() => openDetail(document, approvalFocus(approvalVisual(metadata).kind))} onLifecycleClick={() => openDetail(document, "lifecycle")} /><span
                        className={`${fileIconClass(document.extension)} ${styles.fileDragHandle}`}
                        draggable
                        onPointerDown={(event) => event.stopPropagation()}
                        onDragStart={(event) => beginDocumentDrag(event, document)}
                        title="Húzd a fájlt CsomagBOX-ba"
                        aria-label={`${displayName.value} CsomagBOX-ba húzása`}
                      ><FileKindIcon extension={document.extension} /></span><DisplayNameValue document={document} metadata={metadata} canWrite={canWrite} onEdit={() => openDetail(document, "planTitle")} /></div></td>
                      <td className={styles.fileRawName}><OverflowTooltipText text={document.name} /></td>
                      <td><OverflowTooltipText text={uploaderLabel(version?.createdBy)} /></td>
                      <td>{document.extension?.toUpperCase() || "FILE"}</td>
                      <td><button type="button" className={`${styles.numberingCellButton} ${numberingPresentation(document).className}`} title={numberingPresentation(document).title + " · Kattints a verzió/revízió beállításához"} onClick={(event) => { event.stopPropagation(); openDetail(document, "numbering"); }}>{revisionLabel(document)}</button></td>
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
            <table className={styles.fileTable} style={{ zoom: tableZoom / 100, minWidth: tableMinWidth("engineering") + "px" }}>
              <colgroup>
                {ENGINEERING_COLUMNS.map((column) => (
                  <col key={column.id} style={{ width: (columnWidths.engineering[column.id] ?? column.defaultWidth) + "px" }} />
                ))}
              </colgroup>
              <thead><tr>
                <th className={styles.reviewSelectCell}><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSelection} aria-label="Látható fájlok kijelölése" /></th>
                <SortableResizableHeader label="" className={styles.statusIconColumn} title="Állapotjelzők és fájltípus" sortState={sortState} onSort={toggleSort} resizeLabel="Állapot oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("engineering", "statusIcons", event)} />
                <SortableResizableHeader label="Tervszám" sortState={sortState} onSort={toggleSort} resizeLabel="Tervszám oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("engineering", "planNo", event)} />
                <SortableResizableHeader label="Név" sortKey="name" sortState={sortState} onSort={toggleSort} resizeLabel="Név oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("engineering", "name", event)} />
                <SortableResizableHeader label="Lépték" sortState={sortState} onSort={toggleSort} resizeLabel="Lépték oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("engineering", "scale", event)} />
                <SortableResizableHeader label="Fájlnév" sortKey="fileName" sortState={sortState} onSort={toggleSort} resizeLabel="Fájlnév oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("engineering", "fileName", event)} />
                <SortableResizableHeader label="Feltöltő" sortState={sortState} onSort={toggleSort} resizeLabel="Feltöltő oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("engineering", "uploader", event)} />
                <SortableResizableHeader label="Típus" sortState={sortState} onSort={toggleSort} resizeLabel="Típus oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("engineering", "type", event)} />
                <SortableResizableHeader label="MIME" sortState={sortState} onSort={toggleSort} resizeLabel="MIME oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("engineering", "mime", event)} />
                <SortableResizableHeader label="Revízió" sortState={sortState} onSort={toggleSort} resizeLabel="Revízió oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("engineering", "revision", event)} />
                <SortableResizableHeader label="Verzió" sortState={sortState} onSort={toggleSort} resizeLabel="Verzió oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("engineering", "version", event)} />
                <SortableResizableHeader label="Forrás" sortState={sortState} onSort={toggleSort} resizeLabel="Forrás oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("engineering", "source", event)} />
                <SortableResizableHeader label="Méret" sortState={sortState} onSort={toggleSort} resizeLabel="Méret oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("engineering", "size", event)} />
                <SortableResizableHeader label="BOX" sortState={sortState} onSort={toggleSort} resizeLabel="BOX oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("engineering", "box", event)} />
                <SortableResizableHeader label="Állapot" sortState={sortState} onSort={toggleSort} resizeLabel="Állapot oszlop szélességének módosítása" onResizeStart={(event) => startColumnResize("engineering", "status", event)} />
              </tr></thead>
              <tbody>
                {currentFolder && onNavigateParent && (
                  <tr className={styles.folderUpRow} onClick={onNavigateParent} title="Vissza a szülőmappába">
                    <td colSpan={15}>
                      <div className={styles.folderUpCell}>
                        <span className={styles.folderUpIcon}><FolderUp size={15} /></span>
                        <strong>[..]</strong>
                        <span>{currentFolder.parentId ? "Szülőmappa" : "Dokumentumtár"}</span>
                      </div>
                    </td>
                  </tr>
                )}
                <InlineNewFolderRow
                  open={newFolderEditorOpen}
                  colSpan={15}
                  name={newFolderName}
                  saving={newFolderSaving}
                  onNameChange={onNewFolderNameChange}
                  onSave={onSaveNewFolder}
                  onCancel={onCancelNewFolder}
                />
                {childFolders.map((folder) => (
                  <FolderTableRow
                    key={folder.id}
                    folder={folder}
                    view="engineering"
                    active={activeFolderRowId === folder.id}
                    onSelect={() => setActiveFolderRowId(folder.id)}
                    onOpen={() => onFolderChange?.(folder.id)}
                  />
                ))}
                {sortedDocuments.map((document) => {
                  const version = document.currentVersion;
                  const selected = selectedDocumentId === document.id;
                  const metadata = metadataByDocument[document.id];
                  const displayName = displayDocumentName(document, metadata);
                  return (
                    <tr key={document.id} className={`${styles.fileRow} ${selected ? styles.fileSelected : ""} ${selectedSet.has(document.id) ? styles.reviewRowSelected : ""} ${engineeringRowStatusClass(metadata)}`} onClick={() => selectDocumentRow(document)} onDoubleClick={() => onOpenDocument?.(document)} title="Kattintás: kijelölés · Dupla kattintás: megnyitás · A fájlikont húzd CsomagBOX-ba">
                                            <td className={styles.reviewSelectCell}><input type="checkbox" checked={selectedSet.has(document.id)} onChange={() => toggleDocumentSelection(document.id)} onClick={(event) => event.stopPropagation()} aria-label={displayName.value + " kijelölése"} /></td>
                      <td className={styles.statusIconColumn}><div className={styles.statusIconStrip}><ReviewStateIcons metadata={metadata} onApprovalClick={() => openDetail(document, approvalFocus(approvalVisual(metadata).kind))} onLifecycleClick={() => openDetail(document, "lifecycle")} /><span
                        className={`${fileIconClass(document.extension)} ${styles.fileDragHandle}`}
                        draggable
                        onPointerDown={(event) => event.stopPropagation()}
                        onDragStart={(event) => beginDocumentDrag(event, document)}
                        title="Húzd a fájlt CsomagBOX-ba"
                        aria-label={`${displayName.value} CsomagBOX-ba húzása`}
                      ><FileKindIcon extension={document.extension} /></span></div></td>
                      <td><button type="button" className={styles.metadataCellButton} title={metadata?.planNo || "Tervszám megadása"} onClick={() => openDetail(document, "planNo")}>{metadata?.planNo || "—"}</button></td>
                      <td><DisplayNameValue document={document} metadata={metadata} canWrite={canWrite} onEdit={() => openDetail(document, "planTitle")} /></td>
                      <td><button type="button" className={styles.metadataCellButton} title={scaleSummary(metadata).title} onClick={() => openDetail(document, "scales")}>{scaleSummary(metadata).text}</button></td>
                      <td className={styles.fileRawName}><OverflowTooltipText text={document.name} /></td>
                      <td><OverflowTooltipText text={uploaderLabel(version?.createdBy)} /></td>
                      <td>{document.extension?.toUpperCase() || "FILE"}</td>
                      <td><OverflowTooltipText text={document.mimeType || "–"} /></td>
                      <td><button type="button" className={`${styles.numberingCellButton} ${numberingPresentation(document).className}`} title={numberingPresentation(document).title + " · Kattints a verzió/revízió beállításához"} onClick={(event) => { event.stopPropagation(); openDetail(document, "numbering"); }}>{revisionLabel(document)}</button></td>
                      <td><button type="button" className={`${styles.numberingCellButton} ${numberingPresentation(document).className}`} title={numberingPresentation(document).title + " · Kattints a verzió/revízió beállításához"} onClick={(event) => { event.stopPropagation(); openDetail(document, "numbering"); }}>{versionLabel(version?.versionNumber || document.currentVersionNumber)}</button></td>
                      <td><OverflowTooltipText text={document.source} /></td>
                      <td>{formatBytes(version?.sizeBytes || 0)}</td>
                      <td><div className={styles.boxDots}>{(boxColorsByDocument[document.id] || []).slice(0, 4).map((token, index) => <span key={`${token}-${index}`} className={boxDotClass(token)} />)}{(boxColorsByDocument[document.id] || []).length > 4 && <small>+{(boxColorsByDocument[document.id] || []).length - 4}</small>}</div></td>
                      <td><span className={`${styles.statusBadge} ${version?.status === "AVAILABLE" ? styles.statusAvailable : version?.status === "QUARANTINED" ? styles.statusQuarantine : ""}`}>{versionStatusLabel(version?.status)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!documents.length && !childFolders.length && <div className={styles.tableEmpty}><strong>Nincs megjeleníthető fájl</strong>A kiválasztott mappában vagy keresésben nincs találat.</div>}
        </div>
      )}
    </section>
  );
}
