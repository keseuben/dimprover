import JSZip from "jszip";
import type {
  PropertySurveyPlanDocumentWorkspace,
  SurveyPlanElementDiff,
  SurveyPlanPagePair,
  SurveyPlanVersionComparison,
  SurveyPlanVersionModelApplicationRecord,
} from "@/components/property-survey/propertySurveyPlanDocumentTypes";
import { buildSurveyPlanVersionGraph } from "@/components/property-survey/propertySurveyPlanVersionGraph";

export const DIMPRO_PLAN_REVISION_PACKAGE_SCHEMA = "dimpro.plan-revision-package.v1" as const;
export const DIMPRO_SHARED_PLAN_REVISION_SCHEMA = "dimpro.shared-plan-revision.v1" as const;

export type SurveyPlanRevisionPackageWarning = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  entityId: string;
};

export type SurveyPlanRevisionPackageManifest = {
  schema: typeof DIMPRO_PLAN_REVISION_PACKAGE_SCHEMA;
  packageVersion: "1";
  packageId: string;
  generatedAt: string;
  generatedBy: string;
  source: {
    product: "DIMPRO Felmérő";
    productVersion: "v0.8.4.4.7";
    workspaceSchema: PropertySurveyPlanDocumentWorkspace["schema"];
    workspaceUpdatedAt: string;
    surveySourceMode: PropertySurveyPlanDocumentWorkspace["surveySourceMode"];
  };
  project: {
    projectName: string;
    surveyName: string;
    projectKey: string;
  };
  graph: ReturnType<typeof buildSurveyPlanVersionGraph>;
  documents: Array<{
    id: string;
    fileName: string;
    fileFingerprint: string;
    sizeBytes: number;
    versionGroupId: string;
    revisionCode: string;
    revisionDate: string;
    supersedesDocumentId: string;
    isCurrentVersion: boolean;
    pageCount: number;
    uploadedAt: string;
    updatedAt: string;
    pages: Array<{
      id: string;
      pageNumber: number;
      pageLabel: string;
      planType: string;
      planVersion: string;
      levelId: string;
      contentKind: string;
      roomSuggestionCount: number;
      wallSuggestionCount: number;
      openingSuggestionCount: number;
      approvedRoomCount: number;
      approvedWallCount: number;
      approvedOpeningCount: number;
      updatedAt: string;
    }>;
  }>;
  comparisons: Array<{
    id: string;
    baseDocumentId: string;
    baseRevision: string;
    targetDocumentId: string;
    targetRevision: string;
    status: SurveyPlanVersionComparison["status"];
    createdAt: string;
    updatedAt: string;
    appliedAt: string;
    totals: {
      pagePairCount: number;
      changedElementCount: number;
      addedCount: number;
      removedCount: number;
      modifiedCount: number;
      unchangedCount: number;
      pendingCount: number;
      acceptedCount: number;
      rejectedCount: number;
    };
    pagePairs: Array<{
      id: string;
      basePageId: string;
      basePageLabel: string;
      targetPageId: string;
      targetPageLabel: string;
      method: SurveyPlanPagePair["method"];
      confidenceScore: number;
      updatedAt: string;
      elementDiffs: SurveyPlanElementDiff[];
    }>;
  }>;
  applications: Array<Omit<SurveyPlanVersionModelApplicationRecord, "rollbackSnapshot"> & { rollbackAvailable: boolean }>;
  snapshots: Array<{
    id: string;
    fileName: string;
    fingerprint: string;
    estimatedBytes: number;
    createdAt: string;
    lastUsedAt: string;
    referenceCount: number;
  }>;
  audit: PropertySurveyPlanDocumentWorkspace["versionComparison"]["modelApplicationAudit"];
  transferRegistry: {
    recordCount: number;
    auditCount: number;
    updatedAt: string;
  };
  warnings: SurveyPlanRevisionPackageWarning[];
  checksums: {
    algorithm: "fnv1a32-canonical-json";
    workspaceFingerprint: string;
    graphFingerprint: string;
    documentFingerprint: string;
    comparisonFingerprint: string;
    applicationFingerprint: string;
    snapshotIndexFingerprint: string;
  };
  sharedRevisionEnvelope: {
    schema: typeof DIMPRO_SHARED_PLAN_REVISION_SCHEMA;
    apiVersion: "v1";
    revisionId: string;
    parentRevisionId: string;
    projectKey: string;
    workspaceSchema: PropertySurveyPlanDocumentWorkspace["schema"];
    sourceUpdatedAt: string;
    contentFingerprint: string;
    graphFingerprint: string;
    sequenceNumber: number;
    publishState: "localDraft";
    publishReady: boolean;
    blockers: string[];
    optimisticLock: {
      expectedServerFingerprint: string;
      expectedServerUpdatedAt: string;
      rejectOnFingerprintMismatch: true;
    };
    mergePolicy: {
      mode: "manualElementDecision";
      preserveCentralIds: true;
      requireExplicitDeletionConfirmation: true;
      conflictResolution: "manual";
    };
    permissionsVersion: "1";
    transport: {
      status: "notConfigured";
      suggestedEndpoint: "/api/property-survey/revisions";
    };
    createdAt: string;
  };
};

export type SurveyPlanRevisionPackageResult = {
  blob: Blob;
  fileName: string;
  manifest: SurveyPlanRevisionPackageManifest;
  includedFiles: string[];
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonicalize(entry)]));
}

export function stableSurveyPlanRevisionJson(value: unknown, spacing = 0) {
  return JSON.stringify(canonicalize(value), null, spacing);
}

function fnv1a32(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

export function fingerprintSurveyPlanRevisionValue(value: unknown) {
  return `fnv1a32:${fnv1a32(stableSurveyPlanRevisionJson(value))}`;
}

function safeText(value: unknown, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function revisionLabel(document: { revisionCode: string; fileName: string } | undefined) {
  return document?.revisionCode || document?.fileName || "-";
}

function countDiffs(comparison: SurveyPlanVersionComparison) {
  const diffs = comparison.pagePairs.flatMap((pair) => pair.elementDiffs);
  return {
    pagePairCount: comparison.pagePairs.length,
    changedElementCount: diffs.filter((diff) => diff.changeType !== "unchanged").length,
    addedCount: diffs.filter((diff) => diff.changeType === "added").length,
    removedCount: diffs.filter((diff) => diff.changeType === "removed").length,
    modifiedCount: diffs.filter((diff) => diff.changeType === "modified").length,
    unchangedCount: diffs.filter((diff) => diff.changeType === "unchanged").length,
    pendingCount: diffs.filter((diff) => diff.changeType !== "unchanged" && diff.decision === "pending").length,
    acceptedCount: diffs.filter((diff) => diff.changeType !== "unchanged" && diff.decision === "accepted").length,
    rejectedCount: diffs.filter((diff) => diff.changeType !== "unchanged" && diff.decision === "rejected").length,
  };
}

function buildWarnings(input: {
  workspace: PropertySurveyPlanDocumentWorkspace;
  graph: ReturnType<typeof buildSurveyPlanVersionGraph>;
  comparisons: SurveyPlanRevisionPackageManifest["comparisons"];
}) {
  const warnings: SurveyPlanRevisionPackageWarning[] = [];
  if (!input.workspace.documents.length) warnings.push({ code: "NO_DOCUMENTS", severity: "error", message: "A munkatér nem tartalmaz tervdokumentumot.", entityId: "workspace" });
  if (input.graph.totals.cycleCount) warnings.push({ code: "VERSION_GRAPH_CYCLE", severity: "error", message: `${input.graph.totals.cycleCount} dokumentum körkörös verziókapcsolatban szerepel.`, entityId: "version-graph" });
  if (input.graph.totals.orphanCount) warnings.push({ code: "ORPHAN_VERSION", severity: "error", message: `${input.graph.totals.orphanCount} dokumentum elődje nem található a munkatérben.`, entityId: "version-graph" });
  if (input.graph.totals.branchCount) warnings.push({ code: "VERSION_BRANCH", severity: "warning", message: `${input.graph.totals.branchCount} elágazási pont található; szerveres publikálás előtt ág választandó.`, entityId: "version-graph" });
  const pendingCount = input.comparisons.reduce((sum, comparison) => sum + comparison.totals.pendingCount, 0);
  if (pendingCount) warnings.push({ code: "PENDING_DIFF_DECISIONS", severity: "warning", message: `${pendingCount} tervváltozás döntése még függőben van.`, entityId: "comparisons" });
  const currentByGroup = new Map<string, number>();
  input.graph.nodes.filter((node) => node.isCurrentVersion).forEach((node) => currentByGroup.set(node.versionGroupId, (currentByGroup.get(node.versionGroupId) || 0) + 1));
  for (const group of input.graph.groups) {
    const currentCount = currentByGroup.get(group.id) || 0;
    if (currentCount === 0) warnings.push({ code: "NO_CURRENT_VERSION", severity: "warning", message: `A(z) ${group.id} verziócsoportban nincs aktuális revízió kijelölve.`, entityId: group.id });
    if (currentCount > 1) warnings.push({ code: "MULTIPLE_CURRENT_VERSIONS", severity: "error", message: `A(z) ${group.id} verziócsoportban ${currentCount} aktuális revízió szerepel.`, entityId: group.id });
  }
  return warnings;
}

function currentRevisionParentId(workspace: PropertySurveyPlanDocumentWorkspace) {
  const current = workspace.documents
    .filter((document) => document.isCurrentVersion)
    .sort((left, right) => right.revisionDate.localeCompare(left.revisionDate) || right.updatedAt.localeCompare(left.updatedAt))[0];
  if (!current?.supersedesDocumentId) return "";
  const parent = workspace.documents.find((document) => document.id === current.supersedesDocumentId);
  return parent ? `plan-document:${parent.fileFingerprint || parent.id}` : `plan-document-id:${current.supersedesDocumentId}`;
}

export function buildSurveyPlanRevisionPackageManifest(input: {
  workspace: PropertySurveyPlanDocumentWorkspace;
  projectName?: string;
  surveyName?: string;
  generatedAt?: string;
  generatedBy?: string;
}): SurveyPlanRevisionPackageManifest {
  const generatedAt = input.generatedAt || new Date().toISOString();
  const graph = buildSurveyPlanVersionGraph(input.workspace);
  const documents = input.workspace.documents.map((document) => ({
    id: document.id,
    fileName: document.fileName,
    fileFingerprint: document.fileFingerprint,
    sizeBytes: document.sizeBytes,
    versionGroupId: document.versionGroupId,
    revisionCode: document.revisionCode,
    revisionDate: document.revisionDate,
    supersedesDocumentId: document.supersedesDocumentId,
    isCurrentVersion: document.isCurrentVersion,
    pageCount: document.pageCount,
    uploadedAt: document.uploadedAt,
    updatedAt: document.updatedAt,
    pages: document.pages.map((page) => ({
      id: page.id,
      pageNumber: page.pageNumber,
      pageLabel: page.pageLabel,
      planType: page.planType,
      planVersion: page.planVersion,
      levelId: page.levelId,
      contentKind: page.contentKind,
      roomSuggestionCount: page.suggestions.length,
      wallSuggestionCount: page.wallSuggestions.length,
      openingSuggestionCount: page.openingSuggestions.length,
      approvedRoomCount: page.suggestions.filter((item) => item.status === "approved").length,
      approvedWallCount: page.wallSuggestions.filter((item) => item.status === "approved").length,
      approvedOpeningCount: page.openingSuggestions.filter((item) => item.status === "approved").length,
      updatedAt: page.updatedAt,
    })),
  }));
  const documentMap = new Map(input.workspace.documents.map((document) => [document.id, document]));
  const pageMap = new Map(input.workspace.documents.flatMap((document) => document.pages.map((page) => [page.id, page] as const)));
  const comparisons = Object.values(input.workspace.versionComparison.comparisons)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
    .map((comparison) => ({
      id: comparison.id,
      baseDocumentId: comparison.baseDocumentId,
      baseRevision: revisionLabel(documentMap.get(comparison.baseDocumentId)),
      targetDocumentId: comparison.targetDocumentId,
      targetRevision: revisionLabel(documentMap.get(comparison.targetDocumentId)),
      status: comparison.status,
      createdAt: comparison.createdAt,
      updatedAt: comparison.updatedAt,
      appliedAt: comparison.appliedAt,
      totals: countDiffs(comparison),
      pagePairs: comparison.pagePairs.map((pair) => ({
        id: pair.id,
        basePageId: pair.basePageId,
        basePageLabel: pageMap.get(pair.basePageId)?.pageLabel || "-",
        targetPageId: pair.targetPageId,
        targetPageLabel: pageMap.get(pair.targetPageId)?.pageLabel || "-",
        method: pair.method,
        confidenceScore: pair.confidenceScore,
        updatedAt: pair.updatedAt,
        elementDiffs: pair.elementDiffs.map((diff) => ({ ...diff, changedFields: [...diff.changedFields] })),
      })),
    }));
  const applications = input.workspace.versionComparison.modelApplicationHistory.map((record) => ({
    id: record.id,
    comparisonId: record.comparisonId,
    baseDocumentId: record.baseDocumentId,
    targetDocumentId: record.targetDocumentId,
    status: record.status,
    sequenceNumber: record.sequenceNumber,
    parentApplicationId: record.parentApplicationId,
    counts: { ...record.counts },
    issues: record.issues.map((issue) => ({ ...issue })),
    appliedAt: record.appliedAt,
    rolledBackAt: record.rolledBackAt,
    sourceComparisonUpdatedAt: record.sourceComparisonUpdatedAt,
    rollbackSnapshotId: record.rollbackSnapshotId,
    rollbackSnapshotBytes: record.rollbackSnapshotBytes,
    updatedAt: record.updatedAt,
    rollbackAvailable: Boolean(record.rollbackSnapshotId && input.workspace.versionComparison.modelSnapshotStore.snapshots[record.rollbackSnapshotId]),
  }));
  const snapshots = input.workspace.versionComparison.modelSnapshotStore.order
    .map((id) => input.workspace.versionComparison.modelSnapshotStore.snapshots[id])
    .filter(Boolean)
    .map((entry) => ({
      id: entry.id,
      fileName: `snapshots/${entry.id}.json`,
      fingerprint: entry.fingerprint,
      estimatedBytes: entry.estimatedBytes,
      createdAt: entry.createdAt,
      lastUsedAt: entry.lastUsedAt,
      referenceCount: applications.filter((record) => record.rollbackSnapshotId === entry.id).length,
    }));
  const projectName = safeText(input.projectName, "Projekt nélküli felmérés");
  const surveyName = safeText(input.surveyName, "Névtelen felmérés");
  const projectKey = fingerprintSurveyPlanRevisionValue({ projectName, surveyName });
  const workspaceFingerprintPayload = {
    schema: input.workspace.schema,
    surveySourceMode: input.workspace.surveySourceMode,
    updatedAt: input.workspace.updatedAt,
    documents,
    comparisons,
    applications,
    snapshots,
    transferRegistry: input.workspace.transferRegistry,
  };
  const workspaceFingerprint = fingerprintSurveyPlanRevisionValue(workspaceFingerprintPayload);
  const graphFingerprint = fingerprintSurveyPlanRevisionValue(graph);
  const warnings = buildWarnings({ workspace: input.workspace, graph, comparisons });
  const blockers = warnings.filter((warning) => warning.severity === "error").map((warning) => warning.code);
  const revisionId = `plan-revision-${workspaceFingerprint.replace(/[^a-z0-9]+/gi, "-")}`;
  return {
    schema: DIMPRO_PLAN_REVISION_PACKAGE_SCHEMA,
    packageVersion: "1",
    packageId: `${revisionId}-${generatedAt.replace(/[^0-9]/g, "").slice(0, 14)}`,
    generatedAt,
    generatedBy: safeText(input.generatedBy, "DIMPRO Felmérő"),
    source: {
      product: "DIMPRO Felmérő",
      productVersion: "v0.8.4.4.7",
      workspaceSchema: input.workspace.schema,
      workspaceUpdatedAt: input.workspace.updatedAt,
      surveySourceMode: input.workspace.surveySourceMode,
    },
    project: { projectName, surveyName, projectKey },
    graph,
    documents,
    comparisons,
    applications,
    snapshots,
    audit: input.workspace.versionComparison.modelApplicationAudit.map((entry) => ({ ...entry, counts: { ...entry.counts } })),
    transferRegistry: {
      recordCount: Object.keys(input.workspace.transferRegistry.records).length,
      auditCount: input.workspace.transferRegistry.auditLog.length,
      updatedAt: input.workspace.transferRegistry.updatedAt,
    },
    warnings,
    checksums: {
      algorithm: "fnv1a32-canonical-json",
      workspaceFingerprint,
      graphFingerprint,
      documentFingerprint: fingerprintSurveyPlanRevisionValue(documents),
      comparisonFingerprint: fingerprintSurveyPlanRevisionValue(comparisons),
      applicationFingerprint: fingerprintSurveyPlanRevisionValue(applications),
      snapshotIndexFingerprint: fingerprintSurveyPlanRevisionValue(snapshots),
    },
    sharedRevisionEnvelope: {
      schema: DIMPRO_SHARED_PLAN_REVISION_SCHEMA,
      apiVersion: "v1",
      revisionId,
      parentRevisionId: currentRevisionParentId(input.workspace),
      projectKey,
      workspaceSchema: input.workspace.schema,
      sourceUpdatedAt: input.workspace.updatedAt,
      contentFingerprint: workspaceFingerprint,
      graphFingerprint,
      sequenceNumber: Math.max(0, ...applications.map((record) => record.sequenceNumber)),
      publishState: "localDraft",
      publishReady: blockers.length === 0,
      blockers,
      optimisticLock: {
        expectedServerFingerprint: workspaceFingerprint,
        expectedServerUpdatedAt: input.workspace.updatedAt,
        rejectOnFingerprintMismatch: true,
      },
      mergePolicy: {
        mode: "manualElementDecision",
        preserveCentralIds: true,
        requireExplicitDeletionConfirmation: true,
        conflictResolution: "manual",
      },
      permissionsVersion: "1",
      transport: {
        status: "notConfigured",
        suggestedEndpoint: "/api/property-survey/revisions",
      },
      createdAt: generatedAt,
    },
  };
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  return `"${text.replace(/"/g, '""')}"`;
}

export function createSurveyPlanRevisionDiffCsv(manifest: SurveyPlanRevisionPackageManifest) {
  const rows: unknown[][] = [[
    "Összehasonlítás ID",
    "Alap revízió",
    "Cél revízió",
    "Alap oldal",
    "Cél oldal",
    "Oldalpárosítás módja",
    "Oldalpárosítás biztonsága %",
    "Elemtípus",
    "Változás",
    "Döntés",
    "Alap elem ID",
    "Cél elem ID",
    "Módosult mezők",
    "Elempárosítás biztonsága %",
    "Frissítve",
  ]];
  for (const comparison of manifest.comparisons) {
    for (const pair of comparison.pagePairs) {
      if (!pair.elementDiffs.length) {
        rows.push([comparison.id, comparison.baseRevision, comparison.targetRevision, pair.basePageLabel, pair.targetPageLabel, pair.method, Math.round(pair.confidenceScore * 100), "", "", "", "", "", "", "", pair.updatedAt]);
        continue;
      }
      for (const diff of pair.elementDiffs) rows.push([
        comparison.id,
        comparison.baseRevision,
        comparison.targetRevision,
        pair.basePageLabel,
        pair.targetPageLabel,
        pair.method,
        Math.round(pair.confidenceScore * 100),
        diff.kind,
        diff.changeType,
        diff.decision,
        diff.baseElementId,
        diff.targetElementId,
        diff.changedFields.join(", "),
        Math.round(diff.matchScore * 100),
        diff.updatedAt,
      ]);
    }
  }
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
}

function pdfSafeText(value: unknown) {
  return String(value ?? "")
    .replace(/[Őő]/g, (character) => character === "Ő" ? "O" : "o")
    .replace(/[Űű]/g, (character) => character === "Ű" ? "U" : "u")
    .replace(/[–—]/g, "-")
    .replace(/→/g, "->")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/°/g, " fok")
    .replace(/[^\u0009\u000A\u000D\u0020-\u00FF]/g, "?");
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("hu-HU");
}

export async function createSurveyPlanRevisionSummaryPdfBlob(manifest: SurveyPlanRevisionPackageManifest) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  let pageNumber = 1;

  const addPage = () => {
    page.drawText(pdfSafeText(`DIMPRO Felmero - tervrevizios osszefoglalo · ${pageNumber}`), { x: margin, y: 20, size: 7, font, color: rgb(0.38, 0.45, 0.55) });
    page = pdf.addPage([pageWidth, pageHeight]);
    pageNumber += 1;
    y = pageHeight - margin;
  };
  const ensure = (height: number) => { if (y - height < 42) addPage(); };
  const wrap = (text: string, size: number, maxWidth = contentWidth) => {
    const words = pdfSafeText(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
      else { if (current) lines.push(current); current = word; }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  };
  const text = (value: string, options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; gapAfter?: number; lineHeight?: number } = {}) => {
    const size = options.size || 9;
    const indent = options.indent || 0;
    const lineHeight = options.lineHeight || size * 1.35;
    const lines = wrap(value, size, contentWidth - indent);
    ensure(lines.length * lineHeight + (options.gapAfter || 0));
    for (const line of lines) {
      page.drawText(pdfSafeText(line), { x: margin + indent, y, size, font: options.bold ? bold : font, color: options.color || rgb(0.12, 0.16, 0.22) });
      y -= lineHeight;
    }
    y -= options.gapAfter || 0;
  };
  const section = (title: string) => {
    ensure(32);
    y -= 7;
    page.drawRectangle({ x: margin, y: y - 18, width: contentWidth, height: 24, color: rgb(0.93, 0.95, 0.98), borderColor: rgb(0.55, 0.43, 0.84), borderWidth: 0.8 });
    page.drawText(pdfSafeText(title), { x: margin + 9, y: y - 10, size: 11, font: bold, color: rgb(0.26, 0.16, 0.48) });
    y -= 31;
  };
  const keyValue = (label: string, value: string) => text(`${label}: ${value}`, { size: 8.5, gapAfter: 1 });

  page.drawRectangle({ x: margin, y: pageHeight - 150, width: contentWidth, height: 108, color: rgb(0.05, 0.12, 0.2) });
  page.drawText("DIMPRO", { x: margin + 18, y: pageHeight - 78, size: 17, font: bold, color: rgb(0.25, 0.95, 0.83) });
  page.drawText(pdfSafeText("TERVREVIZIOS DOKUMENTUMCSOMAG"), { x: margin + 18, y: pageHeight - 104, size: 17, font: bold, color: rgb(1, 1, 1) });
  page.drawText(pdfSafeText(manifest.project.projectName), { x: margin + 18, y: pageHeight - 128, size: 10, font, color: rgb(0.78, 0.84, 0.92) });
  y = pageHeight - 177;
  keyValue("Felmeres", manifest.project.surveyName);
  keyValue("Csomagazonosito", manifest.packageId);
  keyValue("Letrehozas", formatDate(manifest.generatedAt));
  keyValue("Munkater-sema", manifest.source.workspaceSchema);
  keyValue("Tartalmi lenyomat", manifest.checksums.workspaceFingerprint);

  section("1. Verziógráf összesítés");
  text(`${manifest.graph.totals.documentCount} dokumentumverzio, ${manifest.graph.totals.groupCount} verziocsoport, ${manifest.graph.totals.edgeCount} kapcsolat, ${manifest.graph.totals.applicationCount} modellalkalmazas, ${manifest.graph.totals.rollbackPointCount} rollback-pont.`, { size: 9, gapAfter: 4 });
  text(`Snapshot-tar: ${manifest.graph.totals.snapshotCount} egyedi allapot, ${(manifest.graph.totals.storedSnapshotBytes / 1024).toFixed(1)} KB; becsult megtakaritas ${(manifest.graph.totals.estimatedSavedBytes / 1024).toFixed(1)} KB.`, { size: 8.5, gapAfter: 5 });
  if (manifest.warnings.length) manifest.warnings.forEach((warning) => text(`[${warning.severity.toUpperCase()}] ${warning.code}: ${warning.message}`, { size: 8, indent: 8, color: warning.severity === "error" ? rgb(0.72, 0.12, 0.12) : warning.severity === "warning" ? rgb(0.65, 0.38, 0.05) : rgb(0.12, 0.32, 0.58) }));
  else text("A verziógráfban nincs exportot vagy későbbi publikálást blokkoló hiba.", { size: 8.5, color: rgb(0.05, 0.45, 0.24) });

  section("2. Dokumentumverziók");
  for (const document of manifest.documents) {
    text(`${document.revisionCode || "revizio nelkul"} · ${document.fileName}${document.isCurrentVersion ? " · AKTUALIS" : ""}`, { bold: true, size: 9 });
    text(`Datum: ${document.revisionDate || "-"} · elod: ${document.supersedesDocumentId || "-"} · ${document.pageCount} oldal · ${(document.sizeBytes / 1024).toFixed(1)} KB`, { size: 7.8, indent: 8, gapAfter: 2 });
    document.pages.forEach((planPage) => text(`${planPage.pageNumber}. ${planPage.pageLabel} · ${planPage.levelId} · helyiseg ${planPage.approvedRoomCount}/${planPage.roomSuggestionCount}, fal ${planPage.approvedWallCount}/${planPage.wallSuggestionCount}, nyilas ${planPage.approvedOpeningCount}/${planPage.openingSuggestionCount}`, { size: 7.4, indent: 16 }));
    y -= 3;
  }

  section("3. Összehasonlítások és döntések");
  if (!manifest.comparisons.length) text("Nincs mentett tervverzió-összehasonlítás.", { size: 8.5 });
  for (const comparison of manifest.comparisons) {
    text(`${comparison.baseRevision} -> ${comparison.targetRevision} · ${comparison.status}`, { bold: true, size: 9 });
    text(`${comparison.totals.pagePairCount} oldalpár · ${comparison.totals.modifiedCount} módosított · ${comparison.totals.addedCount} új · ${comparison.totals.removedCount} törölt · ${comparison.totals.pendingCount} függőben`, { size: 8, indent: 8 });
    text(`Elfogadva: ${comparison.totals.acceptedCount} · elutasítva: ${comparison.totals.rejectedCount} · változatlan: ${comparison.totals.unchangedCount}`, { size: 8, indent: 8, gapAfter: 4 });
  }

  section("4. Központi modellalkalmazások és rollback");
  if (!manifest.applications.length) text("Nincs központi modellalkalmazási előzmény.", { size: 8.5 });
  for (const application of manifest.applications) {
    const base = revisionLabel(manifest.documents.find((document) => document.id === application.baseDocumentId));
    const target = revisionLabel(manifest.documents.find((document) => document.id === application.targetDocumentId));
    text(`#${application.sequenceNumber} · ${base} -> ${target} · ${application.status}`, { bold: true, size: 9 });
    text(`Alkalmazva: ${formatDate(application.appliedAt)} · rollback: ${application.rollbackAvailable ? "elerheto" : "csak audit"} · snapshot: ${application.rollbackSnapshotId || "-"}`, { size: 7.8, indent: 8 });
    text(`Helyiseg +${application.counts.roomCreateCount}/~${application.counts.roomUpdateCount}/-${application.counts.roomDeleteCount}; fal +${application.counts.wallCreateCount}/~${application.counts.wallUpdateCount}/-${application.counts.wallDeleteCount}; nyilas +${application.counts.openingCreateCount}/~${application.counts.openingUpdateCount}/-${application.counts.openingDeleteCount}.`, { size: 7.8, indent: 8, gapAfter: 3 });
  }

  section("5. Megosztott revízió előkészítés");
  keyValue("Revízióazonosító", manifest.sharedRevisionEnvelope.revisionId);
  keyValue("Szülőrevízió", manifest.sharedRevisionEnvelope.parentRevisionId || "nincs");
  keyValue("Publikálhatóság", manifest.sharedRevisionEnvelope.publishReady ? "előkészítve" : "blokkolt");
  keyValue("Optimista zár", manifest.sharedRevisionEnvelope.optimisticLock.expectedServerFingerprint);
  keyValue("Konfliktuspolitika", manifest.sharedRevisionEnvelope.mergePolicy.conflictResolution);
  text("Ez a verzió helyi exportcsomagot készít. A szerveres publikálási végpont még nincs aktiválva; a csomag a későbbi tranzakciós feltöltéshez szükséges szerződést és lenyomatokat tartalmazza.", { size: 8, gapAfter: 4 });
  if (manifest.sharedRevisionEnvelope.blockers.length) text(`Blokkolók: ${manifest.sharedRevisionEnvelope.blockers.join(", ")}`, { size: 8, color: rgb(0.72, 0.12, 0.12) });

  page.drawText(pdfSafeText(`DIMPRO Felmero - tervrevizios osszefoglalo · ${pageNumber}`), { x: margin, y: 20, size: 7, font, color: rgb(0.38, 0.45, 0.55) });
  const bytes = Uint8Array.from(await pdf.save());
  return new Blob([bytes.buffer], { type: "application/pdf" });
}

function safeFileName(value: string, fallback = "dimpro_tervrevizio") {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

export function createSurveyPlanRevisionPackageBaseName(manifest: SurveyPlanRevisionPackageManifest) {
  const currentRevisions = manifest.documents.filter((document) => document.isCurrentVersion).map((document) => document.revisionCode || "aktualis").join("_") || "reviziok";
  return safeFileName(`${manifest.project.projectName}_${manifest.project.surveyName}_${currentRevisions}_tervrevizio_v08447`);
}

export async function createSurveyPlanRevisionPackageBlob(input: {
  workspace: PropertySurveyPlanDocumentWorkspace;
  manifest?: SurveyPlanRevisionPackageManifest;
  projectName?: string;
  surveyName?: string;
  generatedAt?: string;
  generatedBy?: string;
}): Promise<SurveyPlanRevisionPackageResult> {
  const manifest = input.manifest || buildSurveyPlanRevisionPackageManifest(input);
  const zip = new JSZip();
  const baseName = createSurveyPlanRevisionPackageBaseName(manifest);
  const includedFiles: string[] = [];
  const addText = (name: string, text: string) => { zip.file(name, text); includedFiles.push(name); };
  const manifestText = stableSurveyPlanRevisionJson(manifest, 2);
  const envelopeText = stableSurveyPlanRevisionJson(manifest.sharedRevisionEnvelope, 2);
  const csvText = createSurveyPlanRevisionDiffCsv(manifest);
  addText("manifest.json", manifestText);
  addText("shared-revision-envelope.json", envelopeText);
  addText("valtozasok.csv", csvText);
  const pdfBlob = await createSurveyPlanRevisionSummaryPdfBlob(manifest);
  zip.file("osszefoglalo.pdf", await pdfBlob.arrayBuffer());
  includedFiles.push("osszefoglalo.pdf");
  const snapshotChecksums: Record<string, string> = {};
  for (const snapshot of manifest.snapshots) {
    const entry = input.workspace.versionComparison.modelSnapshotStore.snapshots[snapshot.id];
    if (!entry) continue;
    const text = stableSurveyPlanRevisionJson(entry.payload, 2);
    addText(snapshot.fileName, text);
    snapshotChecksums[snapshot.fileName] = fingerprintSurveyPlanRevisionValue(entry.payload);
  }
  const checksums = {
    algorithm: manifest.checksums.algorithm,
    manifest: fingerprintSurveyPlanRevisionValue(manifest),
    sharedRevisionEnvelope: fingerprintSurveyPlanRevisionValue(manifest.sharedRevisionEnvelope),
    diffCsv: fingerprintSurveyPlanRevisionValue(csvText),
    snapshots: snapshotChecksums,
  };
  addText("checksums.json", stableSurveyPlanRevisionJson(checksums, 2));
  addText("README.txt", [
    "DIMPRO Felmérő tervrevíziós dokumentumcsomag",
    "",
    `Csomagazonosító: ${manifest.packageId}`,
    `Projekt: ${manifest.project.projectName}`,
    `Felmérés: ${manifest.project.surveyName}`,
    `Létrehozás: ${manifest.generatedAt}`,
    "",
    "Tartalom:",
    "- manifest.json: verziógráf, dokumentumok, összehasonlítások és alkalmazási előzmények",
    "- valtozasok.csv: oldal- és elemszintű változási lista",
    "- osszefoglalo.pdf: nyomtatható revíziós összefoglaló",
    "- shared-revision-envelope.json: későbbi szerveres publikálási szerződés",
    "- snapshots/: deduplikált rollback-pillanatképek",
    "- checksums.json: tartalmi ellenőrző lenyomatok",
    "",
    "A szerveres publikálás ebben a verzióban nincs aktiválva. A csomag helyi archiválásra, átadásra és a későbbi megosztott revíziókezelés előkészítésére szolgál.",
  ].join("\r\n"));
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { blob, fileName: `${baseName}.zip`, manifest, includedFiles };
}
