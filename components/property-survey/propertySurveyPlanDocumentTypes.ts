export type PropertySurveySourceMode = "site" | "designPlan" | "asBuiltPlan";

export type SurveyPlanType = "floorPlan" | "section" | "elevation" | "sitePlan" | "other";
export type SurveyPlanVersion = "permit" | "construction" | "modifiedConstruction" | "asBuilt" | "other";
export type SurveyPdfContentKind = "unknown" | "vector" | "raster" | "mixed";
export type SurveyPlanRecognitionMode = "rooms" | "roomsWalls" | "roomsWallsOpenings" | "fullEnergyGeometry";
export type SurveyPlanDataSource =
  | "manualDrawing"
  | "vectorPdfRecognition"
  | "rasterPdfRecognition"
  | "ocrRecognition"
  | "planLabel"
  | "userCorrected"
  | "imported";
export type SurveyPlanRecognitionStatus = "draft" | "review" | "approved" | "ignored" | "error";
export type SurveyPlanConfidence = "high" | "medium" | "low" | "manual";

export type SurveyNormalizedPoint = {
  x: number;
  y: number;
};

export type SurveyNormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SurveyPlanCalibrationMeasurement = {
  pointA: SurveyNormalizedPoint | null;
  pointB: SurveyNormalizedPoint | null;
  realDistanceMeters: number;
  pixelDistance: number;
  pixelsPerMeter: number;
};

export type SurveyPlanCalibration = {
  primary: SurveyPlanCalibrationMeasurement;
  verification: SurveyPlanCalibrationMeasurement;
  verificationDifferenceMeters: number;
  verificationErrorPercent: number;
  status: "notSet" | "acceptable" | "needsCorrection";
  acceptedTolerancePercent: number;
  updatedAt: string;
};

export type SurveyPlanSuggestion = {
  id: string;
  pageId: string;
  levelId: string;
  name: string;
  function: string;
  polygon: SurveyNormalizedPoint[];
  labelPosition?: SurveyNormalizedPoint | null;
  calculatedAreaSquareMeters: number;
  labeledAreaSquareMeters: number | null;
  areaDifferenceSquareMeters: number | null;
  areaDifferencePercent: number | null;
  confidence: SurveyPlanConfidence;
  confidenceScore: number;
  source: SurveyPlanDataSource;
  sourceDetails: string;
  geometryMethod: "closedVectorContour" | "labelBoundApproximation" | "manualPolygon";
  contourClosed: boolean;
  heated: boolean;
  roomHeightMeters: number;
  status: SurveyPlanRecognitionStatus;
  userModified: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SurveyPlanWallBoundaryType =
  | "externalAir"
  | "ground"
  | "unheatedSpace"
  | "adjacentBuilding"
  | "internal"
  | "unknown";

export type SurveyPlanOpeningKind = "window" | "door" | "balconyDoor" | "garageDoor" | "unknown";
export type SurveyPlanOpeningThermalBridgeMode = "none" | "installationPerimeter" | "separateEdges";

export type SurveyPlanTransferState =
  | "notTransferred"
  | "synced"
  | "sourceChanged"
  | "modelChanged"
  | "conflict"
  | "sourceRemoved"
  | "modelRemoved"
  | "removed";

export type SurveyPlanTransferAction = "created" | "updated" | "forcedOverwrite" | "modelAccepted" | "removed" | "removalBlocked";

export type SurveyPlanVersionComparisonStatus = "draft" | "review" | "applied";
export type SurveyPlanPagePairMethod = "automatic" | "manual";
export type SurveyPlanDiffKind = "room" | "wall" | "opening";
export type SurveyPlanDiffChangeType = "unchanged" | "added" | "removed" | "modified";
export type SurveyPlanDiffDecision = "pending" | "accepted" | "rejected";

export type SurveyPlanElementDiff = {
  id: string;
  kind: SurveyPlanDiffKind;
  baseElementId: string;
  targetElementId: string;
  changeType: SurveyPlanDiffChangeType;
  changedFields: string[];
  matchScore: number;
  decision: SurveyPlanDiffDecision;
  updatedAt: string;
};

export type SurveyPlanPagePair = {
  id: string;
  basePageId: string;
  targetPageId: string;
  method: SurveyPlanPagePairMethod;
  confidenceScore: number;
  elementDiffs: SurveyPlanElementDiff[];
  updatedAt: string;
};

export type SurveyPlanVersionComparison = {
  id: string;
  baseDocumentId: string;
  targetDocumentId: string;
  status: SurveyPlanVersionComparisonStatus;
  pagePairs: SurveyPlanPagePair[];
  createdAt: string;
  updatedAt: string;
  appliedAt: string;
};

export type SurveyPlanVersionModelApplicationStatus = "preview" | "applied" | "superseded" | "rolledBack" | "blocked";
export type SurveyPlanVersionModelApplicationAction = "apply" | "rollback" | "blocked" | "snapshotPruned";

export type SurveyPlanVersionModelApplicationIssue = {
  code: string;
  severity: "warning" | "error";
  blocking: boolean;
  entityType: "comparison" | "page" | "room" | "wall" | "opening";
  entityId: string;
  message: string;
};

export type SurveyPlanVersionModelApplicationCounts = {
  roomCreateCount: number;
  roomUpdateCount: number;
  roomDeleteCount: number;
  wallCreateCount: number;
  wallUpdateCount: number;
  wallDeleteCount: number;
  openingCreateCount: number;
  openingUpdateCount: number;
  openingDeleteCount: number;
  thermalBridgeCreateCount: number;
  thermalBridgeDeleteCount: number;
  preservedCentralIdCount: number;
};

export type SurveyPlanVersionModelRollbackSnapshot = {
  rooms: Array<Record<string, unknown>>;
  wallSegments: Array<Record<string, unknown>>;
  wallOpenings: Array<Record<string, unknown>>;
  zoneWorkspace: Record<string, unknown>;
  openingWorkspace: Record<string, unknown>;
  transferRegistry: SurveyPlanTransferRegistry;
};

export type SurveyPlanVersionModelSnapshotEntry = {
  id: string;
  fingerprint: string;
  payload: SurveyPlanVersionModelRollbackSnapshot;
  estimatedBytes: number;
  createdAt: string;
  lastUsedAt: string;
};

export type SurveyPlanVersionModelSnapshotStore = {
  version: "1";
  snapshots: Record<string, SurveyPlanVersionModelSnapshotEntry>;
  order: string[];
  maxSnapshots: number;
  updatedAt: string;
};

export type SurveyPlanVersionModelApplicationRecord = {
  id: string;
  comparisonId: string;
  baseDocumentId: string;
  targetDocumentId: string;
  status: SurveyPlanVersionModelApplicationStatus;
  sequenceNumber: number;
  parentApplicationId: string;
  counts: SurveyPlanVersionModelApplicationCounts;
  issues: SurveyPlanVersionModelApplicationIssue[];
  appliedAt: string;
  rolledBackAt: string;
  sourceComparisonUpdatedAt: string;
  rollbackSnapshotId: string;
  rollbackSnapshotBytes: number;
  /** Régi v0.8.4.4.5 projektfájlok beágyazott pillanatképe. Normalizáláskor a snapshot-tárba kerül. */
  rollbackSnapshot: SurveyPlanVersionModelRollbackSnapshot | null;
  updatedAt: string;
};

export type SurveyPlanVersionModelApplicationAuditEntry = {
  id: string;
  comparisonId: string;
  applicationId: string;
  action: SurveyPlanVersionModelApplicationAction;
  result: "success" | "blocked";
  counts: SurveyPlanVersionModelApplicationCounts;
  message: string;
  createdAt: string;
};

export type SurveyPlanVersionComparisonWorkspace = {
  version: "1";
  comparisons: Record<string, SurveyPlanVersionComparison>;
  activeComparisonId: string | null;
  /** Összehasonlításonként az aktuális/legutóbbi alkalmazási rekord. */
  modelApplications: Record<string, SurveyPlanVersionModelApplicationRecord>;
  /** Időrendi alkalmazási előzmény; a legutóbbi rekordok visszaállítási ponttal rendelkezhetnek. */
  modelApplicationHistory: SurveyPlanVersionModelApplicationRecord[];
  /** Deduplikált központi modellpillanatképek. */
  modelSnapshotStore: SurveyPlanVersionModelSnapshotStore;
  modelApplicationAudit: SurveyPlanVersionModelApplicationAuditEntry[];
  updatedAt: string;
};

export type SurveyPlanTransferRecord = {
  pageId: string;
  documentId: string;
  state: SurveyPlanTransferState;
  lastAction: SurveyPlanTransferAction;
  lastTransferId: string;
  lastTransferredAt: string;
  sourceFingerprint: string;
  modelFingerprint: string;
  sourceWallSuggestionIds: string[];
  sourceOpeningSuggestionIds: string[];
  centralWallIds: string[];
  centralOpeningIds: string[];
  centralThermalBridgeIds: string[];
  wallCount: number;
  openingCount: number;
  thermalBridgeCount: number;
  updatedAt: string;
};

export type SurveyPlanTransferAuditEntry = {
  id: string;
  pageId: string;
  documentId: string;
  action: SurveyPlanTransferAction;
  result: "success" | "blocked";
  stateBefore: SurveyPlanTransferState;
  stateAfter: SurveyPlanTransferState;
  transferId: string;
  wallCount: number;
  openingCount: number;
  thermalBridgeCount: number;
  sourceFingerprint: string;
  modelFingerprint: string;
  message: string;
  createdAt: string;
};

export type SurveyPlanTransferRegistry = {
  version: "1";
  records: Record<string, SurveyPlanTransferRecord>;
  auditLog: SurveyPlanTransferAuditEntry[];
  updatedAt: string;
};

export type SurveyPlanOpeningSuggestion = {
  id: string;
  pageId: string;
  levelId: string;
  wallSuggestionId: string;
  connectedRoomSuggestionIds: string[];
  zoneId: string;
  name: string;
  kind: SurveyPlanOpeningKind;
  center: SurveyNormalizedPoint;
  offsetRatio: number;
  widthMeters: number;
  heightMeters: number;
  sillHeightMeters: number;
  areaSquareMeters: number;
  frame: string;
  glazing: string;
  uValueWm2K: string;
  catalogProfileId: string;
  sourceReference: string;
  solarGValue: string;
  shading: string;
  thermalBridgeMode: SurveyPlanOpeningThermalBridgeMode;
  installationPsiWmK: string;
  installationPsiSourceReference: string;
  confidence: SurveyPlanConfidence;
  confidenceScore: number;
  source: SurveyPlanDataSource;
  sourceDetails: string;
  status: "review" | "approved" | "ignored";
  userModified: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SurveyPlanWallSuggestion = {
  id: string;
  pageId: string;
  levelId: string;
  start: SurveyNormalizedPoint;
  end: SurveyNormalizedPoint;
  boundaryType: SurveyPlanWallBoundaryType;
  orientationDegrees: number;
  orientationLabel: string;
  lengthMeters: number;
  heightMeters: number;
  thicknessMeters: number;
  assemblyId: string;
  zoneId: string;
  adjacentZoneId: string;
  grossAreaSquareMeters: number;
  openingAreaSquareMeters: number;
  netAreaSquareMeters: number;
  connectedRoomSuggestionIds: string[];
  confidence: SurveyPlanConfidence;
  confidenceScore: number;
  source: SurveyPlanDataSource;
  sourceDetails: string;
  status: "review" | "approved" | "ignored";
  userModified: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SurveyPlanPage = {
  id: string;
  documentId: string;
  pageNumber: number;
  pageLabel: string;
  planType: SurveyPlanType;
  planVersion: SurveyPlanVersion;
  crop: SurveyNormalizedRect;
  rotationDegrees: 0 | 90 | 180 | 270;
  fineRotationDegrees: number;
  opacity: number;
  locked: boolean;
  offsetXNormalized: number;
  offsetYNormalized: number;
  scalePercent: number;
  levelId: string;
  northAngle: number;
  contentKind: SurveyPdfContentKind;
  vectorPathCount: number;
  rasterImageCount: number;
  textItemCount: number;
  lineSegmentCount: number;
  closedContourCount: number;
  openContourCount: number;
  stitchedContourCount: number;
  parallelWallPairCount: number;
  calibration: SurveyPlanCalibration;
  recognitionMode: SurveyPlanRecognitionMode;
  recognitionStatus: "idle" | "analyzing" | "ready" | "error";
  recognitionMessage: string;
  suggestions: SurveyPlanSuggestion[];
  wallRecognitionStatus: "idle" | "analyzing" | "ready" | "error";
  wallRecognitionMessage: string;
  wallSuggestions: SurveyPlanWallSuggestion[];
  openingRecognitionStatus: "idle" | "analyzing" | "ready" | "error";
  openingRecognitionMessage: string;
  openingSuggestions: SurveyPlanOpeningSuggestion[];
  createdAt: string;
  updatedAt: string;
};

export type SurveyPlanDocument = {
  id: string;
  fileName: string;
  mimeType: "application/pdf";
  sizeBytes: number;
  dataUrl: string;
  fileFingerprint: string;
  versionGroupId: string;
  revisionCode: string;
  revisionDate: string;
  supersedesDocumentId: string;
  isCurrentVersion: boolean;
  pageCount: number;
  pages: SurveyPlanPage[];
  uploadedAt: string;
  updatedAt: string;
};

export type PropertySurveyPlanDocumentWorkspace = {
  schema: "dimpro.property-survey.plan-document.v1";
  surveySourceMode: PropertySurveySourceMode;
  documents: SurveyPlanDocument[];
  activeDocumentId: string | null;
  activePageId: string | null;
  transferRegistry: SurveyPlanTransferRegistry;
  versionComparison: SurveyPlanVersionComparisonWorkspace;
  updatedAt: string;
};

export const surveySourceModeLabels: Record<PropertySurveySourceMode, string> = {
  site: "Helyszíni felmérés",
  designPlan: "Tervdokumentáció alapú felmérés",
  asBuiltPlan: "Megvalósulási dokumentáció alapú felmérés",
};

export const surveyPlanTypeLabels: Record<SurveyPlanType, string> = {
  floorPlan: "Alaprajz",
  section: "Metszet",
  elevation: "Homlokzat",
  sitePlan: "Helyszínrajz",
  other: "Egyéb",
};

export const surveyPlanVersionLabels: Record<SurveyPlanVersion, string> = {
  permit: "Engedélyezési terv",
  construction: "Kiviteli terv",
  modifiedConstruction: "Módosított kiviteli terv",
  asBuilt: "Megvalósulási terv",
  other: "Egyéb",
};

export const surveyPlanRecognitionModeLabels: Record<SurveyPlanRecognitionMode, string> = {
  rooms: "Csak helyiségek felismerése",
  roomsWalls: "Helyiségek és falak",
  roomsWallsOpenings: "Helyiségek, falak és nyílászárók",
  fullEnergyGeometry: "Teljes energetikai geometria előkészítése",
};

export function createSurveyPlanTransferRegistry(): SurveyPlanTransferRegistry {
  return { version: "1", records: {}, auditLog: [], updatedAt: new Date().toISOString() };
}

export function createSurveyPlanVersionComparisonWorkspace(): SurveyPlanVersionComparisonWorkspace {
  const now = new Date().toISOString();
  return {
    version: "1",
    comparisons: {},
    activeComparisonId: null,
    modelApplications: {},
    modelApplicationHistory: [],
    modelSnapshotStore: { version: "1", snapshots: {}, order: [], maxSnapshots: 8, updatedAt: now },
    modelApplicationAudit: [],
    updatedAt: now,
  };
}

export function createSurveyPlanWorkspace(sourceMode: PropertySurveySourceMode = "site"): PropertySurveyPlanDocumentWorkspace {
  return {
    schema: "dimpro.property-survey.plan-document.v1",
    surveySourceMode: sourceMode,
    documents: [],
    activeDocumentId: null,
    activePageId: null,
    transferRegistry: createSurveyPlanTransferRegistry(),
    versionComparison: createSurveyPlanVersionComparisonWorkspace(),
    updatedAt: new Date().toISOString(),
  };
}

export function createEmptyCalibration(): SurveyPlanCalibration {
  const emptyMeasurement: SurveyPlanCalibrationMeasurement = {
    pointA: null,
    pointB: null,
    realDistanceMeters: 0,
    pixelDistance: 0,
    pixelsPerMeter: 0,
  };
  return {
    primary: { ...emptyMeasurement },
    verification: { ...emptyMeasurement },
    verificationDifferenceMeters: 0,
    verificationErrorPercent: 0,
    status: "notSet",
    acceptedTolerancePercent: 2,
    updatedAt: new Date().toISOString(),
  };
}

export function createSurveyPlanPage(input: { documentId: string; pageNumber: number; levelId: string; sourceMode: PropertySurveySourceMode }): SurveyPlanPage {
  const now = new Date().toISOString();
  return {
    id: `plan-page-${Date.now()}-${input.pageNumber}-${Math.random().toString(36).slice(2, 7)}`,
    documentId: input.documentId,
    pageNumber: input.pageNumber,
    pageLabel: `${input.pageNumber}. oldal`,
    planType: "floorPlan",
    planVersion: input.sourceMode === "asBuiltPlan" ? "asBuilt" : "construction",
    crop: { x: 0, y: 0, width: 1, height: 1 },
    rotationDegrees: 0,
    fineRotationDegrees: 0,
    opacity: 0.72,
    locked: true,
    offsetXNormalized: 0,
    offsetYNormalized: 0,
    scalePercent: 100,
    levelId: input.levelId,
    northAngle: 0,
    contentKind: "unknown",
    vectorPathCount: 0,
    rasterImageCount: 0,
    textItemCount: 0,
    lineSegmentCount: 0,
    closedContourCount: 0,
    openContourCount: 0,
    stitchedContourCount: 0,
    parallelWallPairCount: 0,
    calibration: createEmptyCalibration(),
    recognitionMode: "rooms",
    recognitionStatus: "idle",
    recognitionMessage: "A tervlap még nincs elemezve.",
    suggestions: [],
    wallRecognitionStatus: "idle",
    wallRecognitionMessage: "A külső határolás még nincs elemezve.",
    wallSuggestions: [],
    openingRecognitionStatus: "idle",
    openingRecognitionMessage: "A nyílászáró-javaslatok még nincsenek elemezve.",
    openingSuggestions: [],
    createdAt: now,
    updatedAt: now,
  };
}

function clamp01(value: unknown, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

function normalizePoint(input: unknown): SurveyNormalizedPoint | null {
  if (!input || typeof input !== "object") return null;
  const point = input as Partial<SurveyNormalizedPoint>;
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp01(x, 0), y: clamp01(y, 0) };
}

function normalizeCalibration(input: Partial<SurveyPlanCalibration> | undefined): SurveyPlanCalibration {
  const base = createEmptyCalibration();
  const normalizeMeasurement = (measurement: Partial<SurveyPlanCalibrationMeasurement> | undefined): SurveyPlanCalibrationMeasurement => ({
    pointA: normalizePoint(measurement?.pointA) || null,
    pointB: normalizePoint(measurement?.pointB) || null,
    realDistanceMeters: Math.max(0, Number(measurement?.realDistanceMeters) || 0),
    pixelDistance: Math.max(0, Number(measurement?.pixelDistance) || 0),
    pixelsPerMeter: Math.max(0, Number(measurement?.pixelsPerMeter) || 0),
  });
  const status = input?.status === "acceptable" || input?.status === "needsCorrection" ? input.status : "notSet";
  return {
    ...base,
    ...input,
    primary: normalizeMeasurement(input?.primary),
    verification: normalizeMeasurement(input?.verification),
    verificationDifferenceMeters: Math.max(0, Number(input?.verificationDifferenceMeters) || 0),
    verificationErrorPercent: Math.max(0, Number(input?.verificationErrorPercent) || 0),
    acceptedTolerancePercent: Math.max(0.1, Number(input?.acceptedTolerancePercent) || 2),
    status,
    updatedAt: input?.updatedAt || base.updatedAt,
  };
}

function normalizeTransferState(value: unknown): SurveyPlanTransferState {
  return value === "synced" || value === "sourceChanged" || value === "modelChanged" || value === "conflict" || value === "sourceRemoved" || value === "modelRemoved" || value === "removed" ? value : "notTransferred";
}

function normalizeTransferAction(value: unknown): SurveyPlanTransferAction {
  return value === "updated" || value === "forcedOverwrite" || value === "modelAccepted" || value === "removed" || value === "removalBlocked" ? value : "created";
}

function normalizeVersionComparisonWorkspace(input: Partial<SurveyPlanVersionComparisonWorkspace> | undefined): SurveyPlanVersionComparisonWorkspace {
  const base = createSurveyPlanVersionComparisonWorkspace();
  const normalizeDecision = (value: unknown): SurveyPlanDiffDecision => value === "accepted" || value === "rejected" ? value : "pending";
  const normalizeChangeType = (value: unknown): SurveyPlanDiffChangeType => value === "added" || value === "removed" || value === "modified" ? value : "unchanged";
  const normalizeKind = (value: unknown): SurveyPlanDiffKind => value === "wall" || value === "opening" ? value : "room";
  const comparisons = Object.fromEntries(Object.entries(input?.comparisons || {}).flatMap(([comparisonId, raw]) => {
    if (!raw || typeof raw !== "object") return [];
    const comparison = raw as Partial<SurveyPlanVersionComparison>;
    const id = typeof comparison.id === "string" && comparison.id ? comparison.id : comparisonId;
    if (!id || !comparison.baseDocumentId || !comparison.targetDocumentId || comparison.baseDocumentId === comparison.targetDocumentId) return [];
    const pagePairs = Array.isArray(comparison.pagePairs) ? comparison.pagePairs.flatMap((pair) => {
      if (!pair || !pair.id || (!pair.basePageId && !pair.targetPageId)) return [];
      const elementDiffs = Array.isArray(pair.elementDiffs) ? pair.elementDiffs.flatMap((diff) => {
        if (!diff || !diff.id) return [];
        return [{
          id: diff.id,
          kind: normalizeKind(diff.kind),
          baseElementId: typeof diff.baseElementId === "string" ? diff.baseElementId : "",
          targetElementId: typeof diff.targetElementId === "string" ? diff.targetElementId : "",
          changeType: normalizeChangeType(diff.changeType),
          changedFields: Array.isArray(diff.changedFields) ? diff.changedFields.filter((field): field is string => typeof field === "string" && Boolean(field)) : [],
          matchScore: Math.min(1, Math.max(0, Number(diff.matchScore) || 0)),
          decision: normalizeDecision(diff.decision),
          updatedAt: typeof diff.updatedAt === "string" ? diff.updatedAt : new Date().toISOString(),
        } satisfies SurveyPlanElementDiff];
      }) : [];
      return [{
        id: pair.id,
        basePageId: pair.basePageId,
        targetPageId: pair.targetPageId,
        method: pair.method === "manual" ? "manual" as const : "automatic" as const,
        confidenceScore: Math.min(1, Math.max(0, Number(pair.confidenceScore) || 0)),
        elementDiffs,
        updatedAt: typeof pair.updatedAt === "string" ? pair.updatedAt : new Date().toISOString(),
      } satisfies SurveyPlanPagePair];
    }) : [];
    const status: SurveyPlanVersionComparisonStatus = comparison.status === "review" || comparison.status === "applied" ? comparison.status : "draft";
    return [[id, {
      id,
      baseDocumentId: comparison.baseDocumentId,
      targetDocumentId: comparison.targetDocumentId,
      status,
      pagePairs,
      createdAt: typeof comparison.createdAt === "string" ? comparison.createdAt : new Date().toISOString(),
      updatedAt: typeof comparison.updatedAt === "string" ? comparison.updatedAt : new Date().toISOString(),
      appliedAt: typeof comparison.appliedAt === "string" ? comparison.appliedAt : "",
    } satisfies SurveyPlanVersionComparison]];
  }));
  const activeComparisonId = typeof input?.activeComparisonId === "string" && comparisons[input.activeComparisonId] ? input.activeComparisonId : Object.keys(comparisons)[0] || null;
  const emptyCounts = (): SurveyPlanVersionModelApplicationCounts => ({ roomCreateCount: 0, roomUpdateCount: 0, roomDeleteCount: 0, wallCreateCount: 0, wallUpdateCount: 0, wallDeleteCount: 0, openingCreateCount: 0, openingUpdateCount: 0, openingDeleteCount: 0, thermalBridgeCreateCount: 0, thermalBridgeDeleteCount: 0, preservedCentralIdCount: 0 });
  const normalizeCounts = (value: unknown): SurveyPlanVersionModelApplicationCounts => {
    const source = value && typeof value === "object" ? value as Partial<SurveyPlanVersionModelApplicationCounts> : {};
    const baseCounts = emptyCounts();
    return Object.fromEntries(Object.keys(baseCounts).map((key) => [key, Math.max(0, Number(source[key as keyof SurveyPlanVersionModelApplicationCounts]) || 0)])) as SurveyPlanVersionModelApplicationCounts;
  };
  const normalizeSnapshotPayload = (value: unknown): SurveyPlanVersionModelRollbackSnapshot | null => {
    if (!value || typeof value !== "object") return null;
    const snapshot = value as Partial<SurveyPlanVersionModelRollbackSnapshot>;
    if (!Array.isArray(snapshot.rooms) || !Array.isArray(snapshot.wallSegments) || !Array.isArray(snapshot.wallOpenings) || !snapshot.zoneWorkspace || !snapshot.openingWorkspace || !snapshot.transferRegistry) return null;
    return {
      rooms: snapshot.rooms.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object"),
      wallSegments: snapshot.wallSegments.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object"),
      wallOpenings: snapshot.wallOpenings.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object"),
      zoneWorkspace: snapshot.zoneWorkspace as Record<string, unknown>,
      openingWorkspace: snapshot.openingWorkspace as Record<string, unknown>,
      transferRegistry: snapshot.transferRegistry as SurveyPlanTransferRegistry,
    };
  };
  const snapshotFingerprint = (snapshot: SurveyPlanVersionModelRollbackSnapshot) => {
    const text = JSON.stringify(snapshot);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return { fingerprint: (hash >>> 0).toString(36), estimatedBytes: text.length };
  };
  const rawStore = input?.modelSnapshotStore;
  const maxSnapshots = Math.min(20, Math.max(2, Number(rawStore?.maxSnapshots) || 8));
  const normalizedSnapshots: Record<string, SurveyPlanVersionModelSnapshotEntry> = {};
  const ensureSnapshot = (payload: SurveyPlanVersionModelRollbackSnapshot, preferredId = "", createdAt = new Date().toISOString(), lastUsedAt = createdAt) => {
    const meta = snapshotFingerprint(payload);
    const existing = Object.values(normalizedSnapshots).find((entry) => entry.fingerprint === meta.fingerprint && entry.estimatedBytes === meta.estimatedBytes);
    if (existing) {
      if (lastUsedAt > existing.lastUsedAt) existing.lastUsedAt = lastUsedAt;
      return existing.id;
    }
    const id = preferredId || `plan-model-snapshot-${meta.fingerprint}-${meta.estimatedBytes}`;
    normalizedSnapshots[id] = { id, fingerprint: meta.fingerprint, payload, estimatedBytes: meta.estimatedBytes, createdAt, lastUsedAt };
    return id;
  };
  for (const [snapshotId, raw] of Object.entries(rawStore?.snapshots || {})) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Partial<SurveyPlanVersionModelSnapshotEntry>;
    const payload = normalizeSnapshotPayload(entry.payload);
    if (!payload) continue;
    ensureSnapshot(payload, typeof entry.id === "string" && entry.id ? entry.id : snapshotId, typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString(), typeof entry.lastUsedAt === "string" ? entry.lastUsedAt : new Date().toISOString());
  }
  const normalizeApplicationRecord = (comparisonId: string, raw: unknown, fallbackSequence = 1): SurveyPlanVersionModelApplicationRecord | null => {
    if (!raw || typeof raw !== "object" || !comparisons[comparisonId]) return null;
    const record = raw as Partial<SurveyPlanVersionModelApplicationRecord>;
    const status: SurveyPlanVersionModelApplicationStatus = record.status === "applied" || record.status === "superseded" || record.status === "rolledBack" || record.status === "blocked" ? record.status : "preview";
    const issues = Array.isArray(record.issues) ? record.issues.flatMap((issue) => issue && typeof issue === "object" && typeof issue.code === "string" ? [{ ...issue, severity: issue.severity === "error" ? "error" as const : "warning" as const, blocking: Boolean(issue.blocking), entityType: issue.entityType === "page" || issue.entityType === "room" || issue.entityType === "wall" || issue.entityType === "opening" ? issue.entityType : "comparison" as const, entityId: typeof issue.entityId === "string" ? issue.entityId : "", message: typeof issue.message === "string" ? issue.message : "" }] : []) : [];
    const appliedAt = typeof record.appliedAt === "string" ? record.appliedAt : "";
    const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString();
    const legacySnapshot = normalizeSnapshotPayload(record.rollbackSnapshot);
    const referencedSnapshot = typeof record.rollbackSnapshotId === "string" && normalizedSnapshots[record.rollbackSnapshotId] ? record.rollbackSnapshotId : "";
    const rollbackSnapshotId = referencedSnapshot || (legacySnapshot ? ensureSnapshot(legacySnapshot, "", appliedAt || updatedAt, updatedAt) : "");
    const rollbackSnapshotBytes = rollbackSnapshotId ? normalizedSnapshots[rollbackSnapshotId]?.estimatedBytes || Math.max(0, Number(record.rollbackSnapshotBytes) || 0) : Math.max(0, Number(record.rollbackSnapshotBytes) || 0);
    return {
      id: typeof record.id === "string" && record.id ? record.id : `plan-model-application-${comparisonId}-${fallbackSequence}`,
      comparisonId,
      baseDocumentId: typeof record.baseDocumentId === "string" ? record.baseDocumentId : comparisons[comparisonId].baseDocumentId,
      targetDocumentId: typeof record.targetDocumentId === "string" ? record.targetDocumentId : comparisons[comparisonId].targetDocumentId,
      status,
      sequenceNumber: Math.max(1, Number(record.sequenceNumber) || fallbackSequence),
      parentApplicationId: typeof record.parentApplicationId === "string" ? record.parentApplicationId : "",
      counts: normalizeCounts(record.counts),
      issues,
      appliedAt,
      rolledBackAt: typeof record.rolledBackAt === "string" ? record.rolledBackAt : "",
      sourceComparisonUpdatedAt: typeof record.sourceComparisonUpdatedAt === "string" ? record.sourceComparisonUpdatedAt : "",
      rollbackSnapshotId,
      rollbackSnapshotBytes,
      rollbackSnapshot: null,
      updatedAt,
    };
  };
  const modelApplications = Object.fromEntries(Object.entries(input?.modelApplications || {}).flatMap(([comparisonId, raw], index) => {
    const record = normalizeApplicationRecord(comparisonId, raw, index + 1);
    return record ? [[comparisonId, record]] : [];
  }));
  const rawHistory = Array.isArray(input?.modelApplicationHistory) ? input.modelApplicationHistory : [];
  const historyCandidates = [
    ...rawHistory.flatMap((raw, index) => {
      const comparisonId = raw && typeof raw === "object" && typeof (raw as Partial<SurveyPlanVersionModelApplicationRecord>).comparisonId === "string" ? (raw as Partial<SurveyPlanVersionModelApplicationRecord>).comparisonId as string : "";
      const record = normalizeApplicationRecord(comparisonId, raw, index + 1);
      return record ? [record] : [];
    }),
    ...Object.values(modelApplications),
  ];
  const historyById = new Map<string, SurveyPlanVersionModelApplicationRecord>();
  for (const record of historyCandidates) historyById.set(record.id, record);
  let modelApplicationHistory = [...historyById.values()].sort((left, right) => left.sequenceNumber - right.sequenceNumber || left.updatedAt.localeCompare(right.updatedAt));
  const requiredSnapshotIds = new Set([
    ...Object.values(modelApplications).map((record) => record.rollbackSnapshotId).filter(Boolean),
    ...modelApplicationHistory.filter((record) => record.rollbackSnapshotId).slice(-maxSnapshots).map((record) => record.rollbackSnapshotId),
  ]);
  const snapshotOrder = Object.values(normalizedSnapshots)
    .sort((left, right) => left.lastUsedAt.localeCompare(right.lastUsedAt))
    .map((entry) => entry.id)
    .filter((id) => requiredSnapshotIds.has(id))
    .slice(-maxSnapshots);
  const keptSnapshotIds = new Set(snapshotOrder);
  const snapshots = Object.fromEntries(Object.entries(normalizedSnapshots).filter(([id]) => keptSnapshotIds.has(id)));
  modelApplicationHistory = modelApplicationHistory.map((record) => record.rollbackSnapshotId && !keptSnapshotIds.has(record.rollbackSnapshotId) ? { ...record, rollbackSnapshotId: "" } : record).slice(-40);
  for (const [comparisonId, record] of Object.entries(modelApplications)) if (record.rollbackSnapshotId && !keptSnapshotIds.has(record.rollbackSnapshotId)) modelApplications[comparisonId] = { ...record, rollbackSnapshotId: "" };
  const modelSnapshotStore: SurveyPlanVersionModelSnapshotStore = { version: "1", snapshots, order: snapshotOrder, maxSnapshots, updatedAt: typeof rawStore?.updatedAt === "string" ? rawStore.updatedAt : input?.updatedAt || base.updatedAt };
  const modelApplicationAudit = Array.isArray(input?.modelApplicationAudit) ? input.modelApplicationAudit.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const entry = raw as Partial<SurveyPlanVersionModelApplicationAuditEntry>;
    if (!entry.id || !entry.comparisonId) return [];
    const action: SurveyPlanVersionModelApplicationAction = entry.action === "rollback" || entry.action === "blocked" || entry.action === "snapshotPruned" ? entry.action : "apply";
    return [{ id: entry.id, comparisonId: entry.comparisonId, applicationId: entry.applicationId || "", action, result: entry.result === "blocked" ? "blocked" : "success", counts: normalizeCounts(entry.counts), message: entry.message || "", createdAt: entry.createdAt || new Date().toISOString() } satisfies SurveyPlanVersionModelApplicationAuditEntry];
  }).slice(-150) : [];
  return { ...base, version: "1", comparisons, activeComparisonId, modelApplications, modelApplicationHistory, modelSnapshotStore, modelApplicationAudit, updatedAt: input?.updatedAt || base.updatedAt };
}

function normalizeTransferRegistry(input: Partial<SurveyPlanTransferRegistry> | undefined): SurveyPlanTransferRegistry {
  const base = createSurveyPlanTransferRegistry();
  const records = Object.fromEntries(Object.entries(input?.records || {}).flatMap(([pageId, raw]) => {
    if (!raw || typeof raw !== "object") return [];
    const record = raw as Partial<SurveyPlanTransferRecord>;
    const normalizedPageId = typeof record.pageId === "string" && record.pageId ? record.pageId : pageId;
    if (!normalizedPageId) return [];
    const normalizeIds = (values: unknown) => Array.isArray(values) ? values.filter((id): id is string => typeof id === "string" && Boolean(id)) : [];
    return [[normalizedPageId, {
      pageId: normalizedPageId,
      documentId: typeof record.documentId === "string" ? record.documentId : "",
      state: normalizeTransferState(record.state),
      lastAction: normalizeTransferAction(record.lastAction),
      lastTransferId: typeof record.lastTransferId === "string" ? record.lastTransferId : "",
      lastTransferredAt: typeof record.lastTransferredAt === "string" ? record.lastTransferredAt : "",
      sourceFingerprint: typeof record.sourceFingerprint === "string" ? record.sourceFingerprint : "",
      modelFingerprint: typeof record.modelFingerprint === "string" ? record.modelFingerprint : "",
      sourceWallSuggestionIds: normalizeIds(record.sourceWallSuggestionIds),
      sourceOpeningSuggestionIds: normalizeIds(record.sourceOpeningSuggestionIds),
      centralWallIds: normalizeIds(record.centralWallIds),
      centralOpeningIds: normalizeIds(record.centralOpeningIds),
      centralThermalBridgeIds: normalizeIds(record.centralThermalBridgeIds),
      wallCount: Math.max(0, Number(record.wallCount) || 0),
      openingCount: Math.max(0, Number(record.openingCount) || 0),
      thermalBridgeCount: Math.max(0, Number(record.thermalBridgeCount) || 0),
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
    } satisfies SurveyPlanTransferRecord]];
  }));
  const auditLog = Array.isArray(input?.auditLog) ? input.auditLog.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const entry = raw as Partial<SurveyPlanTransferAuditEntry>;
    if (!entry.pageId || !entry.id) return [];
    return [{
      id: entry.id,
      pageId: entry.pageId,
      documentId: entry.documentId || "",
      action: normalizeTransferAction(entry.action),
      result: entry.result === "blocked" ? "blocked" as const : "success" as const,
      stateBefore: normalizeTransferState(entry.stateBefore),
      stateAfter: normalizeTransferState(entry.stateAfter),
      transferId: entry.transferId || "",
      wallCount: Math.max(0, Number(entry.wallCount) || 0),
      openingCount: Math.max(0, Number(entry.openingCount) || 0),
      thermalBridgeCount: Math.max(0, Number(entry.thermalBridgeCount) || 0),
      sourceFingerprint: entry.sourceFingerprint || "",
      modelFingerprint: entry.modelFingerprint || "",
      message: entry.message || "",
      createdAt: entry.createdAt || new Date().toISOString(),
    } satisfies SurveyPlanTransferAuditEntry];
  }).slice(-250) : [];
  return { ...base, version: "1", records, auditLog, updatedAt: input?.updatedAt || base.updatedAt };
}

export function normalizeSurveyPlanWorkspace(input: Partial<PropertySurveyPlanDocumentWorkspace> | undefined): PropertySurveyPlanDocumentWorkspace {
  const base = createSurveyPlanWorkspace(input?.surveySourceMode || "site");
  const documents = Array.isArray(input?.documents) ? input.documents.map((document) => {
    const documentId = document.id || `plan-doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sourceMode = input?.surveySourceMode || "site";
    const pages = Array.isArray(document.pages) ? document.pages.map((page, index) => {
      const fallback = createSurveyPlanPage({ documentId, pageNumber: index + 1, levelId: page.levelId || "level-ground", sourceMode });
      const cropInput = page.crop || fallback.crop;
      const cropX = clamp01(cropInput.x, 0);
      const cropY = clamp01(cropInput.y, 0);
      const cropWidth = Math.max(0.01, Math.min(1 - cropX, clamp01(cropInput.width, 1)));
      const cropHeight = Math.max(0.01, Math.min(1 - cropY, clamp01(cropInput.height, 1)));
      const suggestions = Array.isArray(page.suggestions) ? page.suggestions.map((suggestion) => ({
        ...suggestion,
        polygon: Array.isArray(suggestion.polygon) ? suggestion.polygon.map(normalizePoint).filter((point): point is SurveyNormalizedPoint => Boolean(point)) : [],
        labelPosition: normalizePoint(suggestion.labelPosition) || null,
        calculatedAreaSquareMeters: Math.max(0, Number(suggestion.calculatedAreaSquareMeters) || 0),
        labeledAreaSquareMeters: suggestion.labeledAreaSquareMeters == null ? null : Math.max(0, Number(suggestion.labeledAreaSquareMeters) || 0),
        areaDifferenceSquareMeters: suggestion.areaDifferenceSquareMeters == null ? null : Number(suggestion.areaDifferenceSquareMeters) || 0,
        areaDifferencePercent: suggestion.areaDifferencePercent == null ? null : Number(suggestion.areaDifferencePercent) || 0,
        confidenceScore: Math.min(1, Math.max(0, Number(suggestion.confidenceScore) || 0)),
        status: suggestion.status === "approved" || suggestion.status === "ignored" || suggestion.status === "error" ? suggestion.status : "review",
        updatedAt: suggestion.updatedAt || new Date().toISOString(),
      })) : [];
      const wallSuggestions = Array.isArray(page.wallSuggestions) ? page.wallSuggestions.flatMap((wall) => {
        const start = normalizePoint(wall.start);
        const end = normalizePoint(wall.end);
        if (!start || !end) return [];
        const boundaryType: SurveyPlanWallBoundaryType = wall.boundaryType === "externalAir"
          || wall.boundaryType === "ground"
          || wall.boundaryType === "unheatedSpace"
          || wall.boundaryType === "adjacentBuilding"
          || wall.boundaryType === "internal"
          ? wall.boundaryType
          : "unknown";
        return [{
          ...wall,
          start,
          end,
          boundaryType,
          orientationDegrees: Number(wall.orientationDegrees) || 0,
          orientationLabel: wall.orientationLabel || "–",
          lengthMeters: Math.max(0, Number(wall.lengthMeters) || 0),
          heightMeters: Math.max(0.1, Number(wall.heightMeters) || 2.7),
          thicknessMeters: Math.max(0.01, Number(wall.thicknessMeters) || 0.3),
          assemblyId: typeof wall.assemblyId === "string" ? wall.assemblyId : "",
          zoneId: typeof wall.zoneId === "string" ? wall.zoneId : "",
          adjacentZoneId: typeof wall.adjacentZoneId === "string" ? wall.adjacentZoneId : "",
          grossAreaSquareMeters: Math.max(0, Number(wall.grossAreaSquareMeters) || Math.max(0, Number(wall.lengthMeters) || 0) * Math.max(0.1, Number(wall.heightMeters) || 2.7)),
          openingAreaSquareMeters: Math.max(0, Number(wall.openingAreaSquareMeters) || 0),
          netAreaSquareMeters: Math.max(0, Number(wall.netAreaSquareMeters) || Math.max(0, (Number(wall.grossAreaSquareMeters) || Math.max(0, Number(wall.lengthMeters) || 0) * Math.max(0.1, Number(wall.heightMeters) || 2.7)) - Math.max(0, Number(wall.openingAreaSquareMeters) || 0))),
          connectedRoomSuggestionIds: Array.isArray(wall.connectedRoomSuggestionIds) ? wall.connectedRoomSuggestionIds.filter((id): id is string => typeof id === "string") : [],
          confidenceScore: Math.min(1, Math.max(0, Number(wall.confidenceScore) || 0)),
          status: wall.status === "approved" || wall.status === "ignored" ? wall.status : "review",
          userModified: Boolean(wall.userModified),
          createdAt: wall.createdAt || new Date().toISOString(),
          updatedAt: wall.updatedAt || new Date().toISOString(),
        } satisfies SurveyPlanWallSuggestion];
      }) : [];
      const openingSuggestions = Array.isArray(page.openingSuggestions) ? page.openingSuggestions.flatMap((opening) => {
        const center = normalizePoint(opening.center);
        if (!center || typeof opening.wallSuggestionId !== "string" || !opening.wallSuggestionId) return [];
        const kind: SurveyPlanOpeningKind = opening.kind === "window" || opening.kind === "door" || opening.kind === "balconyDoor" || opening.kind === "garageDoor" ? opening.kind : "unknown";
        const widthMeters = Math.max(0.1, Number(opening.widthMeters) || 1.2);
        const heightMeters = Math.max(0.1, Number(opening.heightMeters) || 1.5);
        return [{
          ...opening,
          center,
          kind,
          connectedRoomSuggestionIds: Array.isArray(opening.connectedRoomSuggestionIds) ? opening.connectedRoomSuggestionIds.filter((id): id is string => typeof id === "string") : [],
          zoneId: typeof opening.zoneId === "string" ? opening.zoneId : "",
          name: typeof opening.name === "string" && opening.name.trim() ? opening.name : "Nyílászáró",
          offsetRatio: Math.min(1, Math.max(0, Number(opening.offsetRatio) || 0.5)),
          widthMeters,
          heightMeters,
          sillHeightMeters: Math.max(0, Number(opening.sillHeightMeters) || 0),
          areaSquareMeters: Math.max(0.01, Number(opening.areaSquareMeters) || widthMeters * heightMeters),
          frame: typeof opening.frame === "string" ? opening.frame : "",
          glazing: typeof opening.glazing === "string" ? opening.glazing : "",
          uValueWm2K: typeof opening.uValueWm2K === "string" ? opening.uValueWm2K : "",
          catalogProfileId: typeof opening.catalogProfileId === "string" && opening.catalogProfileId ? opening.catalogProfileId : "custom",
          sourceReference: typeof opening.sourceReference === "string" ? opening.sourceReference : "",
          solarGValue: typeof opening.solarGValue === "string" ? opening.solarGValue : "",
          shading: typeof opening.shading === "string" ? opening.shading : "Nincs megadva",
          thermalBridgeMode: opening.thermalBridgeMode === "installationPerimeter" || opening.thermalBridgeMode === "separateEdges" ? opening.thermalBridgeMode : "none",
          installationPsiWmK: typeof opening.installationPsiWmK === "string" ? opening.installationPsiWmK : "",
          installationPsiSourceReference: typeof opening.installationPsiSourceReference === "string" ? opening.installationPsiSourceReference : "",
          confidenceScore: Math.min(1, Math.max(0, Number(opening.confidenceScore) || 0)),
          status: opening.status === "approved" || opening.status === "ignored" ? opening.status : "review",
          userModified: Boolean(opening.userModified),
          createdAt: opening.createdAt || new Date().toISOString(),
          updatedAt: opening.updatedAt || new Date().toISOString(),
        } satisfies SurveyPlanOpeningSuggestion];
      }) : [];

      return {
        ...fallback,
        ...page,
        id: page.id || fallback.id,
        documentId,
        pageNumber: Number(page.pageNumber) || index + 1,
        crop: { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
        opacity: Math.min(1, Math.max(0.05, Number(page.opacity) || fallback.opacity)),
        offsetXNormalized: Math.min(1, Math.max(-1, Number(page.offsetXNormalized) || 0)),
        offsetYNormalized: Math.min(1, Math.max(-1, Number(page.offsetYNormalized) || 0)),
        scalePercent: Math.min(400, Math.max(10, Number(page.scalePercent) || 100)),
        fineRotationDegrees: Math.min(10, Math.max(-10, Number(page.fineRotationDegrees) || 0)),
        northAngle: Number(page.northAngle) || 0,
        vectorPathCount: Math.max(0, Number(page.vectorPathCount) || 0),
        rasterImageCount: Math.max(0, Number(page.rasterImageCount) || 0),
        textItemCount: Math.max(0, Number(page.textItemCount) || 0),
        lineSegmentCount: Math.max(0, Number(page.lineSegmentCount) || 0),
        closedContourCount: Math.max(0, Number(page.closedContourCount) || 0),
        openContourCount: Math.max(0, Number(page.openContourCount) || 0),
        stitchedContourCount: Math.max(0, Number(page.stitchedContourCount) || 0),
        parallelWallPairCount: Math.max(0, Number(page.parallelWallPairCount) || 0),
        calibration: normalizeCalibration(page.calibration),
        suggestions,
        wallRecognitionStatus: page.wallRecognitionStatus === "analyzing" || page.wallRecognitionStatus === "ready" || page.wallRecognitionStatus === "error" ? page.wallRecognitionStatus : "idle",
        wallRecognitionMessage: page.wallRecognitionMessage || fallback.wallRecognitionMessage,
        wallSuggestions,
        openingRecognitionStatus: page.openingRecognitionStatus === "analyzing" || page.openingRecognitionStatus === "ready" || page.openingRecognitionStatus === "error" ? page.openingRecognitionStatus : "idle",
        openingRecognitionMessage: page.openingRecognitionMessage || fallback.openingRecognitionMessage,
        openingSuggestions,
      } as SurveyPlanPage;
    }) : [];
    return {
      ...document,
      id: documentId,
      mimeType: "application/pdf" as const,
      fileName: document.fileName || "tervlap.pdf",
      dataUrl: document.dataUrl || "",
      sizeBytes: Math.max(0, Number(document.sizeBytes) || 0),
      versionGroupId: typeof document.versionGroupId === "string" && document.versionGroupId ? document.versionGroupId : `plan-version-group-${documentId}`,
      revisionCode: typeof document.revisionCode === "string" ? document.revisionCode : "",
      revisionDate: typeof document.revisionDate === "string" ? document.revisionDate : "",
      supersedesDocumentId: typeof document.supersedesDocumentId === "string" ? document.supersedesDocumentId : "",
      isCurrentVersion: document.isCurrentVersion !== false,
      pageCount: pages.length || Math.max(0, Number(document.pageCount) || 0),
      pages,
      uploadedAt: document.uploadedAt || new Date().toISOString(),
      updatedAt: document.updatedAt || new Date().toISOString(),
    };
  }) : [];
  const activeDocumentId = documents.some((document) => document.id === input?.activeDocumentId) ? input?.activeDocumentId || null : documents[0]?.id || null;
  const activeDocument = documents.find((document) => document.id === activeDocumentId);
  const activePageId = activeDocument?.pages.some((page) => page.id === input?.activePageId) ? input?.activePageId || null : activeDocument?.pages[0]?.id || null;
  return {
    ...base,
    ...input,
    schema: "dimpro.property-survey.plan-document.v1",
    surveySourceMode: input?.surveySourceMode || "site",
    documents,
    activeDocumentId,
    activePageId,
    transferRegistry: normalizeTransferRegistry(input?.transferRegistry),
    versionComparison: normalizeVersionComparisonWorkspace(input?.versionComparison),
    updatedAt: input?.updatedAt || base.updatedAt,
  };
}
