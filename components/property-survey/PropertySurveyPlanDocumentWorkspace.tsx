"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  Crop,
  Database,
  Download,
  GitBranch,
  GitCompareArrows,
  History,
  Link2,
  ListChecks,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  Eye,
  EyeOff,
  FileJson,
  FileSearch,
  FileUp,
  LocateFixed,
  Lock,
  MousePointer2,
  PencilRuler,
  RotateCw,
  Ruler,
  ScanLine,
  ServerCog,
  Trash2,
  Unlock,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import {
  analyzeSharedPdfPage,
  loadSharedPdfDocument,
  loadSharedPdfJs,
  renderSharedPdfPage,
  type SharedPdfDocument,
  type SharedPdfJsModule,
  type SharedPdfPageAnalysis,
} from "@/components/viewers/pdfDocumentEngine";
import {
  createSurveyPlanPage,
  normalizeSurveyPlanWorkspace,
  surveyPlanRecognitionModeLabels,
  surveyPlanTypeLabels,
  surveyPlanVersionLabels,
  type PropertySurveyPlanDocumentWorkspace,
  type SurveyNormalizedPoint,
  type SurveyPlanCalibration,
  type SurveyPlanCalibrationMeasurement,
  type SurveyPlanDiffDecision,
  type SurveyPlanDocument,
  type SurveyPlanElementDiff,
  type SurveyPlanPage,
  type SurveyPlanSuggestion,
  type SurveyPlanOpeningKind,
  type SurveyPlanOpeningSuggestion,
  type SurveyPlanOpeningThermalBridgeMode,
  type SurveyPlanWallBoundaryType,
  type SurveyPlanWallSuggestion,
} from "@/components/property-survey/propertySurveyPlanDocumentTypes";
import {
  buildExternalWallSuggestions,
  mergeAdjacentPolygons,
  recalculateSuggestionGeometry,
  recalculateWallGeometry,
  splitPolygonByLine,
  surveyPlanWallBoundaryTypeLabels,
  wallMidpoint,
} from "@/components/property-survey/propertySurveyPlanGeometry";
import {
  buildPlanOpeningSuggestions,
  createManualPlanOpening,
  openingCenterOnWall,
  openingKindLabel,
  recalculateAllPlanWallAreas,
  recalculatePlanWallAreas,
} from "@/components/property-survey/propertySurveyPlanOpenings";
import type { SurveyBuildingLevel, SurveyWallOpening, SurveyWallSegment } from "@/components/property-survey/propertySurveyBuildingModel";
import type { SurveyConstructionAssembly } from "@/components/property-survey/propertySurveyEnergyModel";
import type { EnergyZoneWorkspace } from "@/components/energy/domain/energyZoneTypes";
import type { EnergyOpeningWorkspace } from "@/components/energy/domain/energyOpeningTypes";
import { applySurveyOpeningCatalogProfile, getSurveyOpeningCatalogProfilesForKind } from "@/components/property-survey/propertySurveyOpeningCatalog";
import {
  buildManagedSurveyPlanTransferPreview,
  buildSurveyPlanTransferRemovalPreview,
  type ManagedSurveyPlanTransferResult,
  type SurveyPlanTransferConflictStrategy,
  type SurveyPlanTransferRemovalResult,
} from "@/components/property-survey/propertySurveyPlanTransferOperations";
import {
  buildSurveyPlanTransferRegistrySummary,
  surveyPlanTransferStateLabels,
} from "@/components/property-survey/propertySurveyPlanTransferRegistry";
import {
  applySurveyPlanVersionComparisonDecisions,
  buildSurveyPlanVersionComparisonSummary,
  createSurveyPlanVersionComparison,
  rebuildSurveyPlanVersionComparison,
  setSurveyPlanDiffDecisions,
  setSurveyPlanElementDiffDecision,
  setSurveyPlanPagePair,
  surveyPlanDiffChangeTypeLabels,
  surveyPlanDiffDecisionLabels,
  surveyPlanDiffKindLabels,
} from "@/components/property-survey/propertySurveyPlanVersionComparison";
import {
  buildSurveyPlanVersionModelApplicationPreview,
  type SurveyPlanVersionModelApplicationResult,
} from "@/components/property-survey/propertySurveyPlanVersionModelApplication";
import { buildSurveyPlanVersionGraph } from "@/components/property-survey/propertySurveyPlanVersionGraph";
import { getSurveyPlanVersionHistorySummary } from "@/components/property-survey/propertySurveyPlanVersionHistory";
import {
  buildSurveyPlanRevisionPackageManifest,
  createSurveyPlanRevisionPackageBaseName,
  createSurveyPlanRevisionPackageBlob,
  createSurveyPlanRevisionSummaryPdfBlob,
  stableSurveyPlanRevisionJson,
} from "@/components/property-survey/propertySurveyPlanVersionExport";
import { downloadSurveyBlob } from "@/components/property-survey/propertySurveyExport";

type PlanDocumentViewMode = "plan" | "data" | "split";
type CanvasTool = "select" | "crop" | "primaryCalibration" | "verificationCalibration" | "manualRoom" | "editRoomVertices" | "splitRoom" | "manualWall";
type SuggestionFilter = "all" | "review" | "approved" | "ignored";
type VersionDiffFilter = "all" | "changed" | "pending" | "accepted" | "rejected";
type SuggestionDragMode = "polygon" | "label" | "vertex";

type SuggestionDragState = {
  pointerId: number;
  suggestionId: string;
  mode: SuggestionDragMode;
  start: SurveyNormalizedPoint;
  startPolygon: SurveyNormalizedPoint[];
  startLabelPosition: SurveyNormalizedPoint | null;
  vertexIndex?: number;
  previewPolygon?: SurveyNormalizedPoint[];
  previewLabelPosition?: SurveyNormalizedPoint | null;
  moved: boolean;
};

type SuggestionDragPreview = {
  suggestionId: string;
  polygon?: SurveyNormalizedPoint[];
  labelPosition?: SurveyNormalizedPoint | null;
};

type PlanViewSnapshot = {
  zoomPercent: number;
  scrollLeft: number;
  scrollTop: number;
};

type WallDragState = {
  pointerId: number;
  wallId: string;
  endpoint: "start" | "end";
  startWall: SurveyPlanWallSuggestion;
  previewWall?: SurveyPlanWallSuggestion;
  moved: boolean;
};

type WallDragPreview = {
  wallId: string;
  wall: SurveyPlanWallSuggestion;
};

type PropertySurveyPlanDocumentWorkspaceProps = {
  workspace: PropertySurveyPlanDocumentWorkspace;
  projectName: string;
  surveyName: string;
  levels: SurveyBuildingLevel[];
  rooms: SurveyRoom[];
  assemblies: SurveyConstructionAssembly[];
  zoneWorkspace: EnergyZoneWorkspace;
  wallSegments: SurveyWallSegment[];
  wallOpenings: SurveyWallOpening[];
  openingWorkspace: EnergyOpeningWorkspace;
  viewMode: PlanDocumentViewMode;
  onViewModeChange: (mode: PlanDocumentViewMode) => void;
  onChange: (workspace: PropertySurveyPlanDocumentWorkspace) => void;
  onApproveRoom: (room: SurveyRoom, suggestion: SurveyPlanSuggestion, page: SurveyPlanPage) => void;
  onTransferEnergyModel: (page: SurveyPlanPage, strategy?: SurveyPlanTransferConflictStrategy) => ManagedSurveyPlanTransferResult;
  onAcknowledgeEnergyModel: (page: SurveyPlanPage) => unknown;
  onRemoveEnergyTransfer: (page: SurveyPlanPage, options: { confirmed: boolean; force?: boolean }) => SurveyPlanTransferRemovalResult;
  onApplyVersionEnergyModel: (comparisonId: string, confirmed: boolean) => SurveyPlanVersionModelApplicationResult;
  onRollbackVersionEnergyModel: (comparisonId: string, confirmed: boolean, applicationId?: string | null) => SurveyPlanVersionModelApplicationResult;
};

type PointerDraft = {
  start: SurveyNormalizedPoint;
  current: SurveyNormalizedPoint;
};

type LoadedPdfState = {
  documentId: string;
  document: SharedPdfDocument;
  pdfJs: SharedPdfJsModule;
};

const inputClass = "h-11 w-full rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 text-sm font-bold text-[var(--survey-text)] outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-[var(--survey-muted)]">{children}</span>;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("A PDF fájl olvasása nem sikerült."));
    reader.readAsDataURL(file);
  });
}

function normalizeClientPoint(clientX: number, clientY: number, element: Element): SurveyNormalizedPoint {
  const bounds = element.getBoundingClientRect();
  return {
    x: clamp((clientX - bounds.left) / Math.max(1, bounds.width), 0, 1),
    y: clamp((clientY - bounds.top) / Math.max(1, bounds.height), 0, 1),
  };
}

function normalizePointer(event: React.PointerEvent<Element>, element: Element): SurveyNormalizedPoint {
  return normalizeClientPoint(event.clientX, event.clientY, element);
}

function invertPageTransform(point: SurveyNormalizedPoint, page: SurveyPlanPage): SurveyNormalizedPoint {
  const scale = Math.max(0.1, page.scalePercent / 100);
  const angle = -((page.rotationDegrees + page.fineRotationDegrees) * Math.PI / 180);
  const translatedX = point.x - page.offsetXNormalized;
  const translatedY = point.y - page.offsetYNormalized;
  const centeredX = translatedX - 0.5;
  const centeredY = translatedY - 0.5;
  const rotatedX = centeredX * Math.cos(angle) - centeredY * Math.sin(angle);
  const rotatedY = centeredX * Math.sin(angle) + centeredY * Math.cos(angle);
  return {
    x: clamp(rotatedX / scale + 0.5, 0, 1),
    y: clamp(rotatedY / scale + 0.5, 0, 1),
  };
}

function applyPageTransform(point: SurveyNormalizedPoint, page: SurveyPlanPage): SurveyNormalizedPoint {
  const scale = Math.max(0.1, page.scalePercent / 100);
  const angle = ((page.rotationDegrees + page.fineRotationDegrees) * Math.PI / 180);
  const centeredX = (point.x - 0.5) * scale;
  const centeredY = (point.y - 0.5) * scale;
  return {
    x: 0.5 + centeredX * Math.cos(angle) - centeredY * Math.sin(angle) + page.offsetXNormalized,
    y: 0.5 + centeredX * Math.sin(angle) + centeredY * Math.cos(angle) + page.offsetYNormalized,
  };
}

function normalizedDistance(pointA: SurveyNormalizedPoint, pointB: SurveyNormalizedPoint, width: number, height: number) {
  return Math.hypot((pointB.x - pointA.x) * width, (pointB.y - pointA.y) * height);
}

function polygonAreaPixels(points: SurveyNormalizedPoint[], width: number, height: number) {
  if (points.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * width * next.y * height - next.x * width * current.y * height;
  }
  return Math.abs(area) / 2;
}

function polygonBounds(points: SurveyNormalizedPoint[]) {
  if (!points.length) return { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(0.01, Math.max(...xs) - x),
    height: Math.max(0.01, Math.max(...ys) - y),
  };
}

function suggestionPolygonCenter(suggestion: SurveyPlanSuggestion) {
  const bounds = polygonBounds(suggestion.polygon);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

function automaticSuggestionLabelPosition(suggestion: SurveyPlanSuggestion, page: SurveyPlanPage) {
  if (suggestion.labelPosition) return suggestion.labelPosition;
  const bounds = polygonBounds(suggestion.polygon);
  const center = suggestionPolygonCenter(suggestion);
  const isSmallRoom = bounds.width < 0.14 || bounds.height < 0.095;
  if (!isSmallRoom) return center;
  const crop = page.crop;
  const marginX = 0.095;
  const marginY = 0.055;
  const candidates = [
    { x: bounds.x + bounds.width + marginX, y: center.y },
    { x: bounds.x - marginX, y: center.y },
    { x: center.x, y: bounds.y - marginY },
    { x: center.x, y: bounds.y + bounds.height + marginY },
  ];
  const fitting = candidates.find((candidate) => candidate.x >= crop.x + 0.07
    && candidate.x <= crop.x + crop.width - 0.07
    && candidate.y >= crop.y + 0.035
    && candidate.y <= crop.y + crop.height - 0.035);
  const selected = fitting || candidates[0];
  return {
    x: clamp(selected.x, crop.x + 0.06, crop.x + crop.width - 0.06),
    y: clamp(selected.y, crop.y + 0.035, crop.y + crop.height - 0.035),
  };
}

function formatSquareMeters(value: number | null) {
  return value == null || !Number.isFinite(value) || value <= 0 ? "–" : `${value.toFixed(2).replace(".", ",")} m²`;
}

function versionDiffElementLabel(diff: SurveyPlanElementDiff, basePage: SurveyPlanPage | null, targetPage: SurveyPlanPage | null) {
  if (diff.kind === "room") {
    const element = targetPage?.suggestions.find((item) => item.id === diff.targetElementId) || basePage?.suggestions.find((item) => item.id === diff.baseElementId);
    return element?.name || "Helyiség";
  }
  if (diff.kind === "wall") {
    const element = targetPage?.wallSuggestions.find((item) => item.id === diff.targetElementId) || basePage?.wallSuggestions.find((item) => item.id === diff.baseElementId);
    return element ? `${element.orientationLabel || "–"} fal · ${element.lengthMeters > 0 ? `${element.lengthMeters.toFixed(2)} m` : "nincs lépték"}` : "Falszakasz";
  }
  const element = targetPage?.openingSuggestions.find((item) => item.id === diff.targetElementId) || basePage?.openingSuggestions.find((item) => item.id === diff.baseElementId);
  return element?.name || "Nyílászáró";
}

function versionDiffFieldLabels(fields: string[]) {
  const labels: Record<string, string> = {
    added: "új elem", removed: "törlés", geometry: "geometria", name: "név", function: "funkció", area: "terület", height: "magasság", heated: "fűtöttség", status: "jóváhagyás",
    boundaryType: "határolás", orientation: "tájolás", length: "hossz", thickness: "vastagság", assembly: "rétegrend", zone: "zóna", adjacentZone: "másik oldali zóna", rooms: "helyiségkapcsolat",
    wall: "kapcsolt fal", kind: "típus", offset: "fal menti hely", width: "szélesség", sillHeight: "parapet", frame: "keret", glazing: "üvegezés", uValue: "Uw/U-érték", sourceReference: "adatforrás", solarGValue: "g-érték", shading: "árnyékolás", thermalBridge: "hőhíd",
  };
  return fields.map((field) => labels[field] || field).join(", ");
}

function normalizeRecognitionText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/(?:\p{L}\s+){2,}\p{L}/gu, (letterSpaced) => letterSpaced.replace(/\s+/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

const ROOM_NAME_PATTERN = /(?<![\p{L}\p{N}])(?:SZOBA|HÁLÓ|HALO|GYEREK|NAPPALI|KONYHA|ÉTKEZŐ|ETKEZO|ÉTK\.?|ETK\.?|FÜRDŐ|FURDO|FÜRDŐSZOBA|FURDOSZOBA|WC|MOSDÓ|MOSDO|ELŐTÉR|ELOTER|ELŐSZOBA|ELOSZOBA|KÖZLEKEDŐ|KOZLEKEDO|KÖZL\.?|KOZL\.?|FOLYOSÓ|FOLYOSO|GARÁZS|GARAZS|GAR\.?|KAMRA|KRA\.?|TÁROLÓ|TAROLO|GARDROB|GARDRÓB|GARD\.?|HÁZTARTÁSI|HAZTARTASI|HÁZT\.?|HAZT\.?|MOSÓKONYHA|MOSOKONYHA|DOLGOZÓ|DOLGOZO|VENDÉGSZOBA|VENDEGSZOBA|GÉPÉSZET|GEPESZET|KAZÁNHÁZ|KAZANHAZ|LÉPCSŐ|LEPCSO|TERASZ|FED\.?\s*TERASZ|ERKÉLY|ERKELY|LOGGIA|PINCE|PADLÁS|PADLAS|MŰHELY|MUHELY|IRODA|RENDELŐ|RENDELO|ÜZLET|UZLET)(?![\p{L}\p{N}])/iu;

const AREA_LABEL_PATTERN = /(?:^|[^\d])(\d{1,4}(?:[.,]\d{1,3})?)\s*m\s*(?:2|\^2|²)(?=$|[^\p{L}\p{N}])/iu;
const AREA_LABEL_GLOBAL_PATTERN = /\d{1,4}(?:[.,]\d{1,3})?\s*m\s*(?:2|\^2|²)/giu;
const ROOM_LABEL_NOISE_PATTERN = /\b(?:KERÁMIA|KERAMIA|LAM\.?\s*PARK\.?|LAMINÁLT|LAMINALT|PARKETTA|PADLÓ|PADLO|BURKOLAT|GRES|PVC|SZŐNYEG|SZONYEG|JÁRÓLAP|JAROLAP|HŐSZIGETELÉS|HOSZIGETELES|VAKOLAT|VB\.?\s*KOSZORÚ|VB\.?\s*KOSZORU|FALBURKOLAT)\b/giu;

function inferRoomName(text: string) {
  return normalizeRecognitionText(text)
    .replace(/^\d+[.)-]?\s*/, "")
    .slice(0, 64) || "Felismert helyiség";
}

function cleanRoomLabelText(value: string) {
  return normalizeRecognitionText(value)
    .replace(AREA_LABEL_GLOBAL_PATTERN, " ")
    .replace(ROOM_LABEL_NOISE_PATTERN, " ")
    .replace(/[|•]/g, " ")
    .replace(/^\d+[.)-]?\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlausibleRoomLabel(value: string) {
  const text = cleanRoomLabelText(value);
  if (text.length < 2 || text.length > 42) return false;
  if (!/[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]/.test(text)) return false;
  if (/[:=]/.test(text)) return false;
  if (/^[<>±~]?\s*[\d.,]+\s*(?:mm|cm|m|m2|m²|%|°)\b/iu.test(text)) return false;
  if (/\b(?:LAPMÉRET|LAPMERET|LÉPTÉK|LEPTEK|TERV(?:SZÁM|SZAM|LAP|FAJTA|VERZIÓ|VERZIO)?|RAJZ(?:SZÁM|SZAM)?|MUNKA(?:SZÁM|SZAM)?|DÁTUM|DATUM|ÉPÍTTETŐ|EPITTETO|MEGRENDELŐ|MEGRENDELO|TERVEZŐ|TERVEZO|ELLENŐRIZTE|ELLENORIZTE|SZERKESZTŐ|SZERKESZTO|JELMAGYARÁZAT|JELMAGYARAZAT|HRSZ|FÖLDSZINTI?\s+ALAPRAJZ|FOLDSZINTI?\s+ALAPRAJZ|ALAPRAJZ|METSZET|HOMLOKZAT|RÉSZLET|RESZLET|MÉRET|MERET|VERZIÓ|VERZIO|OLDAL|LAP|ÉSZAK|ESZAK|FAL|FÖDÉM|FODEM|RÉTEGREND|RETEGREND|KONSZIGNÁCIÓ|KONSZIGNACIO|ANYAG|GYÁRTMÁNY|GYARTMANY|MEGJEGYZÉS|MEGJEGYZES)\b/iu.test(text)) return false;
  if (/\d{3,}/.test(text)) return false;
  return true;
}

function extractStrongRoomName(value: string) {
  const cleaned = cleanRoomLabelText(value);
  const match = cleaned.match(ROOM_NAME_PATTERN);
  if (!match) return null;
  const matchIndex = match.index || 0;
  const trailing = cleaned.slice(matchIndex + match[0].length);
  const roomNumber = trailing.match(/^\s*([1-9]\d?)(?![.,\d])/u)?.[1] || "";
  return inferRoomName(`${match[0]}${roomNumber ? ` ${roomNumber}` : ""}`);
}

function isStrongRoomLabel(value: string) {
  return extractStrongRoomName(value) != null;
}

function parseAreaLabel(text: string) {
  const normalized = normalizeRecognitionText(text);
  const match = normalized.match(AREA_LABEL_PATTERN);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) && value > 0.5 && value < 1500 ? value : null;
}

function buildRecognitionTextItems(items: SharedPdfPageAnalysis["textItems"]) {
  const sorted = [...items].sort((left, right) => left.y - right.y || left.x - right.x);
  const merged = [...items];
  for (let index = 0; index < sorted.length; index += 1) {
    const first = sorted[index];
    const lineItems = [first];
    let rightEdge = first.x + first.width;
    for (let nextIndex = index + 1; nextIndex < Math.min(sorted.length, index + 10); nextIndex += 1) {
      const next = sorted[nextIndex];
      if (next.y - first.y > 0.025) break;
      const firstCenterY = first.y + first.height / 2;
      const nextCenterY = next.y + next.height / 2;
      const verticalDistance = Math.abs(firstCenterY - nextCenterY);
      const horizontalGap = next.x - rightEdge;
      if (verticalDistance > Math.max(0.012, first.height * 1.6, next.height * 1.6)) continue;
      if (horizontalGap < -0.008 || horizontalGap > 0.035) continue;
      lineItems.push(next);
      rightEdge = Math.max(rightEdge, next.x + next.width);
    }
    if (lineItems.length < 2) continue;
    lineItems.sort((left, right) => left.x - right.x);
    let text = lineItems[0].text;
    let previousRight = lineItems[0].x + lineItems[0].width;
    for (const item of lineItems.slice(1)) {
      const gap = item.x - previousRight;
      text += `${gap <= 0.004 ? "" : " "}${item.text}`;
      previousRight = Math.max(previousRight, item.x + item.width);
    }
    const x = Math.min(...lineItems.map((item) => item.x));
    const y = Math.min(...lineItems.map((item) => item.y));
    const maximumX = Math.max(...lineItems.map((item) => item.x + item.width));
    const maximumY = Math.max(...lineItems.map((item) => item.y + item.height));
    merged.push({ text: normalizeRecognitionText(text), x, y, width: maximumX - x, height: maximumY - y });
  }
  const seen = new Set<string>();
  return merged.filter((item) => {
    const key = `${normalizeRecognitionText(item.text).toLocaleUpperCase("hu-HU")}:${Math.round(item.x * 2000)}:${Math.round(item.y * 2000)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pointInPolygon(point: SurveyNormalizedPoint, polygon: SurveyNormalizedPoint[]) {
  let inside = false;
  for (let currentIndex = 0, previousIndex = polygon.length - 1; currentIndex < polygon.length; previousIndex = currentIndex++) {
    const current = polygon[currentIndex];
    const previous = polygon[previousIndex];
    const intersects = ((current.y > point.y) !== (previous.y > point.y))
      && point.x < (previous.x - current.x) * (point.y - current.y) / Math.max(1e-9, previous.y - current.y) + current.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function buildRecognitionSuggestions(input: {
  analysis: SharedPdfPageAnalysis;
  page: SurveyPlanPage;
  viewportWidth: number;
  viewportHeight: number;
}) {
  const now = new Date().toISOString();
  const calibration = input.page.calibration.primary;
  const pixelsPerMeter = calibration.pixelsPerMeter;
  const analysisItems = buildRecognitionTextItems(input.analysis.textItems).filter((item) => {
    const centerX = item.x + item.width / 2;
    const centerY = item.y + item.height / 2;
    return centerX >= input.page.crop.x - 0.005
      && centerX <= input.page.crop.x + input.page.crop.width + 0.005
      && centerY >= input.page.crop.y - 0.005
      && centerY <= input.page.crop.y + input.page.crop.height + 0.005;
  });
  const areaKeys = new Set<string>();
  const areaItems = analysisItems.flatMap((item) => {
    const area = parseAreaLabel(item.text);
    if (area == null) return [];
    const key = `${area.toFixed(3)}:${Math.round((item.x + item.width / 2) * 1000)}:${Math.round((item.y + item.height / 2) * 1000)}`;
    if (areaKeys.has(key)) return [];
    areaKeys.add(key);
    return [{ ...item, area }];
  });
  const labelKeys = new Set<string>();
  const labelItems = analysisItems.flatMap((item) => {
    const strongName = extractStrongRoomName(item.text);
    const cleaned = strongName || cleanRoomLabelText(item.text);
    const strong = Boolean(strongName);
    if (!cleaned || (!strong && (parseAreaLabel(item.text) != null || !isPlausibleRoomLabel(cleaned)))) return [];
    const key = `${cleaned.toLocaleUpperCase("hu-HU")}:${Math.round((item.x + item.width / 2) * 1000)}:${Math.round((item.y + item.height / 2) * 1000)}`;
    if (labelKeys.has(key)) return [];
    labelKeys.add(key);
    return [{ ...item, text: cleaned, strong }];
  });
  const usedLabels = new Set<number>();
  const usedContours = new Set<number>();

  function contourAreaSquareMeters(contourIndex: number) {
    const contour = input.analysis.vectorContours[contourIndex];
    if (!contour || pixelsPerMeter <= 0) return 0;
    return contour.normalizedArea * input.viewportWidth * input.viewportHeight / (pixelsPerMeter * pixelsPerMeter);
  }

  function selectContour(anchor: SurveyNormalizedPoint, labeledArea: number | null) {
    const candidates = input.analysis.vectorContours.flatMap((contour, contourIndex) => {
      if (usedContours.has(contourIndex) || !contour.closed || contour.points.length < 3) return [];
      const bounds = contour.bounds;
      if (bounds.width < 0.012 || bounds.height < 0.012 || bounds.width > 0.65 || bounds.height > 0.65) return [];
      if (bounds.x < input.page.crop.x - 0.01 || bounds.y < input.page.crop.y - 0.01) return [];
      if (bounds.x + bounds.width > input.page.crop.x + input.page.crop.width + 0.01) return [];
      if (bounds.y + bounds.height > input.page.crop.y + input.page.crop.height + 0.01) return [];
      const containsAnchor = pointInPolygon(anchor, contour.points);
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      const centerDistance = Math.hypot(centerX - anchor.x, centerY - anchor.y);
      if (!containsAnchor && centerDistance > 0.075) return [];
      const calculatedArea = contourAreaSquareMeters(contourIndex);
      const areaScore = labeledArea && calculatedArea > 0
        ? Math.abs(Math.log(Math.max(0.01, calculatedArea) / Math.max(0.01, labeledArea)))
        : contour.normalizedArea * 2;
      const score = areaScore + centerDistance * 4 + (containsAnchor ? 0 : 0.65) + (contour.source === "stitchedSegments" ? 0.05 : 0);
      return [{ contourIndex, contour, calculatedArea, score }];
    }).sort((left, right) => left.score - right.score);
    const selected = candidates[0] || null;
    if (selected) usedContours.add(selected.contourIndex);
    return selected;
  }

  function buildFallbackPolygon(area: number, anchor: SurveyNormalizedPoint) {
    const aspect = 1.25;
    const widthMeters = Math.sqrt(Math.max(1, area) * aspect);
    const heightMeters = Math.max(1, area) / Math.max(0.1, widthMeters);
    const fallbackWidth = clamp(Math.sqrt(Math.max(1, area)) / 110, 0.035, 0.14);
    const fallbackHeight = clamp(fallbackWidth / aspect, 0.03, 0.12);
    const widthNormalized = Math.min(input.page.crop.width, pixelsPerMeter > 0
      ? clamp(widthMeters * pixelsPerMeter / Math.max(1, input.viewportWidth), 0.02, 0.28)
      : fallbackWidth);
    const heightNormalized = Math.min(input.page.crop.height, pixelsPerMeter > 0
      ? clamp(heightMeters * pixelsPerMeter / Math.max(1, input.viewportHeight), 0.02, 0.24)
      : fallbackHeight);
    const x = clamp(anchor.x - widthNormalized / 2, input.page.crop.x, input.page.crop.x + input.page.crop.width - widthNormalized);
    const y = clamp(anchor.y - heightNormalized / 2, input.page.crop.y, input.page.crop.y + input.page.crop.height - heightNormalized);
    return [
      { x, y },
      { x: x + widthNormalized, y },
      { x: x + widthNormalized, y: y + heightNormalized },
      { x, y: y + heightNormalized },
    ];
  }

  function createSuggestion(inputSuggestion: {
    name: string;
    anchor: SurveyNormalizedPoint;
    labeledArea: number | null;
    fallbackIndex: number;
  }) {
    const selectedContour = selectContour(inputSuggestion.anchor, inputSuggestion.labeledArea);
    const polygon = selectedContour?.contour.points || buildFallbackPolygon(inputSuggestion.labeledArea || 12, inputSuggestion.anchor);
    const calculatedArea = selectedContour?.calculatedArea && selectedContour.calculatedArea > 0
      ? selectedContour.calculatedArea
      : inputSuggestion.labeledArea || 0;
    const areaDifference = inputSuggestion.labeledArea != null && calculatedArea > 0
      ? calculatedArea - inputSuggestion.labeledArea
      : null;
    const areaDifferencePercent = inputSuggestion.labeledArea != null && inputSuggestion.labeledArea > 0 && areaDifference != null
      ? areaDifference / inputSuggestion.labeledArea * 100
      : null;
    const absoluteAreaError = areaDifferencePercent == null ? null : Math.abs(areaDifferencePercent);
    const confidenceScore = selectedContour
      ? absoluteAreaError == null
        ? 0.74
        : absoluteAreaError <= 5
          ? 0.93
          : absoluteAreaError <= 15
            ? 0.79
            : absoluteAreaError <= 30
              ? 0.63
              : 0.46
      : inputSuggestion.labeledArea != null
        ? pixelsPerMeter > 0 ? 0.52 : 0.4
        : 0.32;
    const confidence = confidenceScore >= 0.88 ? "high" : confidenceScore >= 0.62 ? "medium" : "low";
    const geometryMethod = selectedContour ? "closedVectorContour" : "labelBoundApproximation";
    const sourceDetails = selectedContour
      ? `${selectedContour.contour.source === "stitchedSegments" ? "Kapcsolódó vektorszakaszokból összefűzött" : "PDF vektorútvonalból kiolvasott"} zárt kontúr, tervfelirattal párosítva${pixelsPerMeter > 0 ? ", léptékhelyes geometriai területtel összevetve" : ""}. Jóváhagyás előtt ellenőrzendő.`
      : inputSuggestion.labeledArea != null
        ? "Vektoros PDF szövegrétegéből felismert helyiségnév és terület; biztos zárt vektorkontúr hiányában címkeközpontú közelítés, kötelező ellenőrzéssel."
        : "Vektoros PDF helyiségfeliratából létrehozott, alacsony biztonságú közelítő kontúrjavaslat.";
    return {
      id: createId("plan-suggestion"),
      pageId: input.page.id,
      levelId: input.page.levelId,
      name: inferRoomName(inputSuggestion.name || `Helyiség ${inputSuggestion.fallbackIndex + 1}`),
      function: inferRoomName(inputSuggestion.name || `Helyiség ${inputSuggestion.fallbackIndex + 1}`),
      polygon,
      labelPosition: null,
      calculatedAreaSquareMeters: calculatedArea,
      labeledAreaSquareMeters: inputSuggestion.labeledArea,
      areaDifferenceSquareMeters: areaDifference,
      areaDifferencePercent,
      confidence,
      confidenceScore,
      source: "vectorPdfRecognition",
      sourceDetails,
      geometryMethod,
      contourClosed: Boolean(selectedContour) || polygon.length >= 3,
      heated: !/(garázs|terasz|fedett|kazán|tároló|kamra|kra\.)/i.test(inputSuggestion.name),
      roomHeightMeters: 2.7,
      status: "review",
      userModified: false,
      createdAt: now,
      updatedAt: now,
    } satisfies SurveyPlanSuggestion;
  }

  const suggestions = areaItems.map((areaItem, areaIndex) => {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    labelItems.forEach((label, labelIndex) => {
      if (usedLabels.has(labelIndex)) return;
      const dx = Math.abs((label.x + label.width / 2) - (areaItem.x + areaItem.width / 2));
      const dy = Math.abs(label.y - areaItem.y);
      const distance = dx * 0.65 + dy - (label.strong ? 0.012 : 0);
      if (dx <= 0.14 && dy <= 0.085 && distance < bestDistance) {
        bestDistance = distance;
        bestIndex = labelIndex;
      }
    });
    const label = bestIndex >= 0 ? labelItems[bestIndex] : null;
    if (bestIndex >= 0) usedLabels.add(bestIndex);
    return createSuggestion({
      name: label?.text || `Helyiség ${areaIndex + 1}`,
      anchor: {
        x: clamp((label?.x ?? areaItem.x) + (label?.width ?? areaItem.width) / 2, 0, 1),
        y: clamp((label?.y ?? areaItem.y) + 0.012, 0, 1),
      },
      labeledArea: areaItem.area,
      fallbackIndex: areaIndex,
    });
  });

  labelItems.forEach((label, labelIndex) => {
    if (usedLabels.has(labelIndex) || !isStrongRoomLabel(label.text)) return;
    const anchor = { x: clamp(label.x + label.width / 2, 0, 1), y: clamp(label.y + 0.012, 0, 1) };
    suggestions.push(createSuggestion({ name: label.text, anchor, labeledArea: null, fallbackIndex: suggestions.length }));
    usedLabels.add(labelIndex);
  });

  return suggestions.filter((suggestion, suggestionIndex, allSuggestions) => {
    const bounds = polygonBounds(suggestion.polygon);
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const normalizedName = suggestion.name.toLocaleUpperCase("hu-HU").replace(/\s+/g, " ").trim();
    return allSuggestions.findIndex((other) => {
      const otherBounds = polygonBounds(other.polygon);
      const otherCenterX = otherBounds.x + otherBounds.width / 2;
      const otherCenterY = otherBounds.y + otherBounds.height / 2;
      const otherName = other.name.toLocaleUpperCase("hu-HU").replace(/\s+/g, " ").trim();
      return otherName === normalizedName && Math.hypot(otherCenterX - centerX, otherCenterY - centerY) <= 0.018;
    }) === suggestionIndex;
  });
}

function getSuggestionVisual(suggestion: SurveyPlanSuggestion) {
  if (suggestion.status === "ignored") return { stroke: "#64748b", fill: "#cbd5e1", label: "Figyelmen kívül hagyva" };
  if (suggestion.userModified || suggestion.source === "userCorrected") return { stroke: "#2563eb", fill: "#bfdbfe", label: "Felhasználó által módosított" };
  if (!suggestion.contourClosed || suggestion.status === "error") return { stroke: "#dc2626", fill: "#fecaca", label: "Hibás vagy nyitott" };
  if (suggestion.confidence === "high" || suggestion.confidence === "manual") return { stroke: "#16a34a", fill: "#bbf7d0", label: "Nagy biztonság" };
  return { stroke: "#ca8a04", fill: "#fef08a", label: "Ellenőrzendő" };
}

function updateCalibrationMeasurement(input: {
  calibration: SurveyPlanCalibration;
  kind: "primary" | "verification";
  pointA: SurveyNormalizedPoint | null;
  pointB: SurveyNormalizedPoint | null;
  realDistanceMeters: number;
  viewportWidth: number;
  viewportHeight: number;
}) {
  const pixelDistance = input.pointA && input.pointB
    ? normalizedDistance(input.pointA, input.pointB, input.viewportWidth, input.viewportHeight)
    : 0;
  const pixelsPerMeter = input.realDistanceMeters > 0 ? pixelDistance / input.realDistanceMeters : 0;
  const measurement: SurveyPlanCalibrationMeasurement = {
    pointA: input.pointA,
    pointB: input.pointB,
    realDistanceMeters: Math.max(0, input.realDistanceMeters),
    pixelDistance,
    pixelsPerMeter,
  };
  const next = { ...input.calibration, [input.kind]: measurement, updatedAt: new Date().toISOString() };
  const primary = input.kind === "primary" ? measurement : next.primary;
  const verification = input.kind === "verification" ? measurement : next.verification;
  if (primary.pixelsPerMeter > 0 && verification.pixelDistance > 0 && verification.realDistanceMeters > 0) {
    const calculatedDistance = verification.pixelDistance / primary.pixelsPerMeter;
    const difference = calculatedDistance - verification.realDistanceMeters;
    const errorPercent = Math.abs(difference) / verification.realDistanceMeters * 100;
    return {
      ...next,
      verificationDifferenceMeters: difference,
      verificationErrorPercent: errorPercent,
      status: errorPercent <= next.acceptedTolerancePercent ? "acceptable" as const : "needsCorrection" as const,
    };
  }
  return { ...next, verificationDifferenceMeters: 0, verificationErrorPercent: 0, status: primary.pixelsPerMeter > 0 ? "acceptable" as const : "notSet" as const };
}

export function PropertySurveyPlanDocumentWorkspace({
  workspace,
  projectName,
  surveyName,
  levels,
  rooms,
  assemblies,
  zoneWorkspace,
  wallSegments,
  wallOpenings,
  openingWorkspace,
  viewMode,
  onViewModeChange,
  onChange,
  onApproveRoom,
  onTransferEnergyModel,
  onAcknowledgeEnergyModel,
  onRemoveEnergyTransfer,
  onApplyVersionEnergyModel,
  onRollbackVersionEnergyModel,
}: PropertySurveyPlanDocumentWorkspaceProps) {
  const normalizedWorkspace = useMemo(() => normalizeSurveyPlanWorkspace(workspace), [workspace]);
  const activeDocument = normalizedWorkspace.documents.find((document) => document.id === normalizedWorkspace.activeDocumentId) || normalizedWorkspace.documents[0] || null;
  const activePage = activeDocument?.pages.find((page) => page.id === normalizedWorkspace.activePageId) || activeDocument?.pages[0] || null;
  const latestWorkspaceRef = useRef(normalizedWorkspace);
  const latestActiveDocumentRef = useRef(activeDocument);
  const latestActivePageRef = useRef(activePage);
  const latestOnChangeRef = useRef(onChange);
  latestWorkspaceRef.current = normalizedWorkspace;
  latestActiveDocumentRef.current = activeDocument;
  latestActivePageRef.current = activePage;
  latestOnChangeRef.current = onChange;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const loadedPdfRef = useRef<LoadedPdfState | null>(null);
  const [tool, setTool] = useState<CanvasTool>("select");
  const [pointerDraft, setPointerDraft] = useState<PointerDraft | null>(null);
  const [manualPoints, setManualPoints] = useState<SurveyNormalizedPoint[]>([]);
  const [manualWallPoints, setManualWallPoints] = useState<SurveyNormalizedPoint[]>([]);
  const [splitRoomPoints, setSplitRoomPoints] = useState<SurveyNormalizedPoint[]>([]);
  const [splitRoomSuggestionId, setSplitRoomSuggestionId] = useState<string | null>(null);
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(null);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null);
  const [activeWallId, setActiveWallId] = useState<string | null>(null);
  const [activeOpeningId, setActiveOpeningId] = useState<string | null>(null);
  const [showOpeningSuggestions, setShowOpeningSuggestions] = useState(true);
  const [wallEndpointPlacement, setWallEndpointPlacement] = useState<{ wallId: string; endpoint: "start" | "end" } | null>(null);
  const [mergeTargetSuggestionId, setMergeTargetSuggestionId] = useState("");
  const [geometryMessage, setGeometryMessage] = useState("");
  const [energyTransferMessage, setEnergyTransferMessage] = useState("");
  const [transferOverwriteConfirmed, setTransferOverwriteConfirmed] = useState(false);
  const [transferRemovalOpen, setTransferRemovalOpen] = useState(false);
  const [transferRemovalConfirmed, setTransferRemovalConfirmed] = useState(false);
  const [transferRemovalForceConfirmed, setTransferRemovalForceConfirmed] = useState(false);
  const [comparisonBaseDocumentId, setComparisonBaseDocumentId] = useState("");
  const [comparisonTargetDocumentId, setComparisonTargetDocumentId] = useState("");
  const [comparisonMessage, setComparisonMessage] = useState("");
  const [activeVersionPairId, setActiveVersionPairId] = useState<string | null>(null);
  const [showVersionDiffOverlay, setShowVersionDiffOverlay] = useState(true);
  const [versionDiffFilter, setVersionDiffFilter] = useState<VersionDiffFilter>("changed");
  const [versionModelApplyConfirmed, setVersionModelApplyConfirmed] = useState(false);
  const [versionModelRollbackConfirmed, setVersionModelRollbackConfirmed] = useState(false);
  const [selectedVersionModelApplicationId, setSelectedVersionModelApplicationId] = useState<string | null>(null);
  const [versionModelMessage, setVersionModelMessage] = useState("");
  const [versionExportState, setVersionExportState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [versionExportMessage, setVersionExportMessage] = useState("");
  const [pendingFocusSuggestionId, setPendingFocusSuggestionId] = useState<string | null>(null);
  const [zoomedSuggestionId, setZoomedSuggestionId] = useState<string | null>(null);
  const [viewZoomPercent, setViewZoomPercent] = useState(100);
  const [showAllSuggestionLabels, setShowAllSuggestionLabels] = useState(false);
  const [showWallSuggestions, setShowWallSuggestions] = useState(true);
  const [suggestionFilter, setSuggestionFilter] = useState<SuggestionFilter>("all");
  const [suggestionDragPreview, setSuggestionDragPreview] = useState<SuggestionDragPreview | null>(null);
  const [wallDragPreview, setWallDragPreview] = useState<WallDragPreview | null>(null);
  const [loadingState, setLoadingState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState("Tölts fel egy PDF tervdokumentációt.");
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [isPortraitTablet, setIsPortraitTablet] = useState(false);
  const backgroundDragRef = useRef<{ pointerId: number; start: SurveyNormalizedPoint; offsetX: number; offsetY: number } | null>(null);
  const suggestionDragRef = useRef<SuggestionDragState | null>(null);
  const wallDragRef = useRef<WallDragState | null>(null);
  const updateSuggestionDragHandlerRef = useRef<(pointerId: number, clientX: number, clientY: number) => void>(() => {});
  const finishSuggestionDragHandlerRef = useRef<(pointerId: number) => void>(() => {});
  const updateWallDragHandlerRef = useRef<(pointerId: number, clientX: number, clientY: number) => void>(() => {});
  const finishWallDragHandlerRef = useRef<(pointerId: number) => void>(() => {});
  const suppressSuggestionClickRef = useRef(false);
  const preFocusViewRef = useRef<PlanViewSnapshot | null>(null);

  useEffect(() => {
    const update = () => setIsPortraitTablet(window.matchMedia("(orientation: portrait) and (max-width: 1000px)").matches);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const effectiveViewMode: PlanDocumentViewMode = isPortraitTablet && viewMode === "split" ? "plan" : viewMode;
  const filteredSuggestions = useMemo(() => {
    const suggestions = activePage?.suggestions || [];
    if (suggestionFilter === "all") return suggestions;
    return suggestions.filter((suggestion) => suggestion.status === suggestionFilter);
  }, [activePage?.suggestions, suggestionFilter]);
  const activeSuggestion = activePage?.suggestions.find((suggestion) => suggestion.id === activeSuggestionId) || null;
  const activeWall = activePage?.wallSuggestions.find((wall) => wall.id === activeWallId) || null;
  const activeOpening = activePage?.openingSuggestions.find((opening) => opening.id === activeOpeningId) || null;
  const wallAssemblies = useMemo(() => assemblies.filter((assembly) => assembly.category === "wall"), [assemblies]);
  const zoneByRoomSuggestionId = useMemo(() => {
    const result: Record<string, string> = {};
    rooms.forEach((room) => {
      if (!room.planSuggestionId) return;
      const zoneId = zoneWorkspace.roomAssignments[room.id] || zoneWorkspace.unheatedRoomAssignments[room.id] || "";
      if (zoneId) result[room.planSuggestionId] = zoneId;
    });
    return result;
  }, [rooms, zoneWorkspace.roomAssignments, zoneWorkspace.unheatedRoomAssignments]);
  const transferRegistrySummary = useMemo(() => buildSurveyPlanTransferRegistrySummary({ workspace: normalizedWorkspace, wallSegments, wallOpenings, openingWorkspace }), [normalizedWorkspace, openingWorkspace, wallOpenings, wallSegments]);
  const activeTransferStatus = transferRegistrySummary.pages.find((page) => page.pageId === activePage?.id) || null;
  const energyTransferPreview = useMemo(() => activePage ? buildManagedSurveyPlanTransferPreview({ page: activePage, rooms, wallSegments, wallOpenings, assemblies, zoneWorkspace, openingWorkspace, transferRegistry: normalizedWorkspace.transferRegistry }) : null, [activePage, assemblies, normalizedWorkspace.transferRegistry, openingWorkspace, rooms, wallOpenings, wallSegments, zoneWorkspace]);
  const removalPreview = useMemo(() => activePage ? buildSurveyPlanTransferRemovalPreview({ page: activePage, wallSegments, wallOpenings, openingWorkspace, transferRegistry: normalizedWorkspace.transferRegistry }) : null, [activePage, normalizedWorkspace.transferRegistry, openingWorkspace, wallOpenings, wallSegments]);
  const activeTransferAuditEntries = useMemo(() => activePage ? normalizedWorkspace.transferRegistry.auditLog.filter((entry) => entry.pageId === activePage.id).slice(-8).reverse() : [], [activePage, normalizedWorkspace.transferRegistry.auditLog]);
  const versionComparisonSummary = useMemo(() => buildSurveyPlanVersionComparisonSummary({ workspace: normalizedWorkspace }), [normalizedWorkspace]);
  const versionModelPreview = useMemo(() => versionComparisonSummary ? buildSurveyPlanVersionModelApplicationPreview({
    workspace: normalizedWorkspace,
    comparisonId: versionComparisonSummary.comparison.id,
    rooms,
    wallSegments,
    wallOpenings,
    assemblies,
    zoneWorkspace,
    openingWorkspace,
  }) : null, [assemblies, normalizedWorkspace, openingWorkspace, rooms, versionComparisonSummary, wallOpenings, wallSegments, zoneWorkspace]);
  const versionModelApplication = versionComparisonSummary ? normalizedWorkspace.versionComparison.modelApplications[versionComparisonSummary.comparison.id] || null : null;
  const versionGraph = useMemo(() => buildSurveyPlanVersionGraph(normalizedWorkspace), [normalizedWorkspace]);
  const versionHistorySummary = useMemo(() => getSurveyPlanVersionHistorySummary({ workspace: normalizedWorkspace }), [normalizedWorkspace]);
  const versionExportManifest = useMemo(() => buildSurveyPlanRevisionPackageManifest({ workspace: normalizedWorkspace, projectName, surveyName, generatedAt: normalizedWorkspace.updatedAt || new Date().toISOString() }), [normalizedWorkspace, projectName, surveyName]);
  const versionModelHistory = useMemo(() => normalizedWorkspace.versionComparison.modelApplicationHistory.slice().reverse(), [normalizedWorkspace.versionComparison.modelApplicationHistory]);
  const selectedVersionModelApplication = versionModelHistory.find((record) => record.id === selectedVersionModelApplicationId) || versionModelApplication || versionModelHistory[0] || null;
  const selectedVersionSnapshot = selectedVersionModelApplication?.rollbackSnapshotId ? normalizedWorkspace.versionComparison.modelSnapshotStore.snapshots[selectedVersionModelApplication.rollbackSnapshotId] || null : null;
  const versionModelAuditEntries = useMemo(() => versionComparisonSummary ? normalizedWorkspace.versionComparison.modelApplicationAudit.filter((entry) => entry.comparisonId === versionComparisonSummary.comparison.id).slice(-8).reverse() : [], [normalizedWorkspace.versionComparison.modelApplicationAudit, versionComparisonSummary]);
  const activeVersionPair = useMemo(() => {
    if (!versionComparisonSummary) return null;
    return versionComparisonSummary.comparison.pagePairs.find((pair) => pair.id === activeVersionPairId)
      || versionComparisonSummary.comparison.pagePairs.find((pair) => pair.targetPageId === activePage?.id)
      || versionComparisonSummary.comparison.pagePairs.find((pair) => pair.basePageId === activePage?.id)
      || versionComparisonSummary.comparison.pagePairs[0]
      || null;
  }, [activePage?.id, activeVersionPairId, versionComparisonSummary]);
  const baselineComparisonPage = useMemo(() => {
    if (!versionComparisonSummary || !activeVersionPair) return null;
    return versionComparisonSummary.baseDocument.pages.find((page) => page.id === activeVersionPair.basePageId) || null;
  }, [activeVersionPair, versionComparisonSummary]);
  const activeVersionDiffs = useMemo(() => {
    const diffs = activeVersionPair?.elementDiffs || [];
    if (versionDiffFilter === "all") return diffs;
    if (versionDiffFilter === "changed") return diffs.filter((diff) => diff.changeType !== "unchanged");
    return diffs.filter((diff) => diff.changeType !== "unchanged" && diff.decision === versionDiffFilter);
  }, [activeVersionPair?.elementDiffs, versionDiffFilter]);
  const activeDiffByBaseId = useMemo(() => new Map((activeVersionPair?.elementDiffs || []).filter((diff) => diff.baseElementId).map((diff) => [diff.baseElementId, diff])), [activeVersionPair?.elementDiffs]);
  const activeDiffByTargetId = useMemo(() => new Map((activeVersionPair?.elementDiffs || []).filter((diff) => diff.targetElementId).map((diff) => [diff.targetElementId, diff])), [activeVersionPair?.elementDiffs]);
  const zoneOptions = useMemo(() => [
    ...zoneWorkspace.zones.map((zone) => ({ id: zone.id, label: `Fűtött zóna · ${zone.name}` })),
    ...zoneWorkspace.unheatedSpaces.map((space) => ({ id: space.id, label: `Fűtetlen tér · ${space.name}` })),
  ], [zoneWorkspace.unheatedSpaces, zoneWorkspace.zones]);

  useEffect(() => {
    const documents = normalizedWorkspace.documents;
    const comparison = normalizedWorkspace.versionComparison.activeComparisonId ? normalizedWorkspace.versionComparison.comparisons[normalizedWorkspace.versionComparison.activeComparisonId] : null;
    setComparisonBaseDocumentId((current) => documents.some((document) => document.id === current) ? current : comparison?.baseDocumentId || documents[0]?.id || "");
    setComparisonTargetDocumentId((current) => documents.some((document) => document.id === current) ? current : comparison?.targetDocumentId || documents[1]?.id || documents[0]?.id || "");
  }, [normalizedWorkspace.documents, normalizedWorkspace.versionComparison.activeComparisonId, normalizedWorkspace.versionComparison.comparisons]);

  useEffect(() => {
    if (!versionComparisonSummary || !activePage) return;
    const matchingPair = versionComparisonSummary.comparison.pagePairs.find((pair) => pair.targetPageId === activePage.id || pair.basePageId === activePage.id);
    if (matchingPair) setActiveVersionPairId(matchingPair.id);
  }, [activePage, versionComparisonSummary]);

  useEffect(() => {
    setViewZoomPercent(100);
    setShowAllSuggestionLabels(false);
    setActiveSuggestionId(null);
    setSelectedVertexIndex(null);
    setActiveWallId(null);
    setActiveOpeningId(null);
    setWallEndpointPlacement(null);
    setManualWallPoints([]);
    setSplitRoomPoints([]);
    setSplitRoomSuggestionId(null);
    setMergeTargetSuggestionId("");
    setGeometryMessage("");
    setEnergyTransferMessage("");
    setTransferOverwriteConfirmed(false);
    setTransferRemovalOpen(false);
    setTransferRemovalConfirmed(false);
    setTransferRemovalForceConfirmed(false);
    setComparisonMessage("");
    setVersionModelApplyConfirmed(false);
    setVersionModelRollbackConfirmed(false);
    setVersionModelMessage("");
    setVersionExportMessage("");
    setVersionExportState("idle");
    setPendingFocusSuggestionId(null);
    setZoomedSuggestionId(null);
    preFocusViewRef.current = null;
    setSuggestionFilter("all");
    setSuggestionDragPreview(null);
    setWallDragPreview(null);
    suggestionDragRef.current = null;
    wallDragRef.current = null;
    if (viewportRef.current) viewportRef.current.scrollTo({ left: 0, top: 0 });
  }, [activePage?.id]);

  useEffect(() => {
    if (!pendingFocusSuggestionId || !activePage) return;
    const suggestion = activePage.suggestions.find((item) => item.id === pendingFocusSuggestionId);
    if (!suggestion) return;
    const timer = window.setTimeout(() => {
      const viewport = viewportRef.current;
      const stage = stageRef.current;
      if (!viewport || !stage) return;
      const bounds = polygonBounds(suggestion.polygon);
      const transformedCenter = applyPageTransform({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }, activePage);
      viewport.scrollTo({
        left: Math.max(0, stage.offsetLeft + transformedCenter.x * stage.clientWidth - viewport.clientWidth / 2),
        top: Math.max(0, stage.offsetTop + transformedCenter.y * stage.clientHeight - viewport.clientHeight / 2),
        behavior: "smooth",
      });
      setPendingFocusSuggestionId(null);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [activePage, effectiveViewMode, pendingFocusSuggestionId, viewZoomPercent]);

  function commit(next: PropertySurveyPlanDocumentWorkspace) {
    onChange({ ...next, updatedAt: new Date().toISOString() });
  }

  function patchDocument(documentId: string, patch: Partial<SurveyPlanDocument>) {
    const updatedAt = new Date().toISOString();
    commit({
      ...normalizedWorkspace,
      documents: normalizedWorkspace.documents.map((document) => document.id === documentId ? { ...document, ...patch, updatedAt } : document),
    });
  }

  function createOrRefreshVersionComparison() {
    if (!comparisonBaseDocumentId || !comparisonTargetDocumentId || comparisonBaseDocumentId === comparisonTargetDocumentId) {
      setComparisonMessage("Válassz két különböző tervdokumentum-verziót.");
      return;
    }
    try {
      const next = createSurveyPlanVersionComparison({ workspace: normalizedWorkspace, baseDocumentId: comparisonBaseDocumentId, targetDocumentId: comparisonTargetDocumentId });
      const target = next.documents.find((document) => document.id === comparisonTargetDocumentId);
      const createdComparison = next.versionComparison.activeComparisonId ? next.versionComparison.comparisons[next.versionComparison.activeComparisonId] : null;
      commit({ ...next, activeDocumentId: target?.id || next.activeDocumentId, activePageId: target?.pages[0]?.id || next.activePageId });
      setActiveVersionPairId(createdComparison?.pagePairs.find((pair) => pair.targetPageId)?.id || createdComparison?.pagePairs[0]?.id || null);
      setComparisonMessage("Az oldal- és elempárosítás elkészült. A módosítások elemenként elfogadhatók vagy elutasíthatók.");
      setVersionDiffFilter("changed");
    } catch (error) {
      setComparisonMessage(error instanceof Error ? error.message : "A tervverziók összehasonlítása nem sikerült.");
    }
  }

  function refreshActiveVersionComparison() {
    const comparisonId = normalizedWorkspace.versionComparison.activeComparisonId;
    if (!comparisonId) return;
    commit(rebuildSurveyPlanVersionComparison({ workspace: normalizedWorkspace, comparisonId }));
    setComparisonMessage("Az oldal- és elemdiff újraszámítva; a korábbi döntések megmaradtak, ahol az elempár azonos maradt.");
  }

  function selectVersionComparison(comparisonId: string) {
    const comparison = normalizedWorkspace.versionComparison.comparisons[comparisonId];
    if (!comparison) return;
    const target = normalizedWorkspace.documents.find((document) => document.id === comparison.targetDocumentId);
    commit({
      ...normalizedWorkspace,
      activeDocumentId: target?.id || normalizedWorkspace.activeDocumentId,
      activePageId: target?.pages[0]?.id || normalizedWorkspace.activePageId,
      versionComparison: { ...normalizedWorkspace.versionComparison, activeComparisonId: comparisonId, updatedAt: new Date().toISOString() },
    });
    setComparisonBaseDocumentId(comparison.baseDocumentId);
    setComparisonTargetDocumentId(comparison.targetDocumentId);
    setActiveVersionPairId(comparison.pagePairs.find((pair) => pair.targetPageId)?.id || comparison.pagePairs[0]?.id || null);
    setComparisonMessage("");
  }

  function pairTargetPage(targetPageId: string, basePageId: string) {
    const comparisonId = normalizedWorkspace.versionComparison.activeComparisonId;
    if (!comparisonId) return;
    const next = setSurveyPlanPagePair({ workspace: normalizedWorkspace, comparisonId, targetPageId, basePageId });
    const nextComparison = next.versionComparison.comparisons[comparisonId];
    setActiveVersionPairId(nextComparison?.pagePairs.find((pair) => pair.targetPageId === targetPageId)?.id || null);
    commit(next);
    setComparisonMessage(basePageId ? "A kézi oldal-párosítás és az elemdiff frissült." : "Az új tervlap kézzel párosítatlanként lett rögzítve; elemei új változásként dönthetők el.");
  }

  function selectVersionPair(pairId: string) {
    const summary = versionComparisonSummary;
    const pair = summary?.comparison.pagePairs.find((item) => item.id === pairId);
    if (!summary || !pair) return;
    setActiveVersionPairId(pair.id);
    if (pair.targetPageId) commit({ ...normalizedWorkspace, activeDocumentId: summary.targetDocument.id, activePageId: pair.targetPageId });
    else if (pair.basePageId) commit({ ...normalizedWorkspace, activeDocumentId: summary.baseDocument.id, activePageId: pair.basePageId });
  }

  function setVersionDiffDecision(pairId: string, diffId: string, decision: SurveyPlanDiffDecision) {
    const comparisonId = normalizedWorkspace.versionComparison.activeComparisonId;
    if (!comparisonId) return;
    commit(setSurveyPlanElementDiffDecision({ workspace: normalizedWorkspace, comparisonId, pairId, diffId, decision }));
  }

  function setActivePairDiffDecisions(decision: SurveyPlanDiffDecision) {
    const comparisonId = normalizedWorkspace.versionComparison.activeComparisonId;
    if (!comparisonId || !activeVersionPair) return;
    commit(setSurveyPlanDiffDecisions({ workspace: normalizedWorkspace, comparisonId, pairId: activeVersionPair.id, decision, onlyChangeTypes: ["added", "removed", "modified"] }));
  }

  function applyVersionComparisonDecisions() {
    const comparisonId = normalizedWorkspace.versionComparison.activeComparisonId;
    if (!comparisonId) return;
    try {
      const result = applySurveyPlanVersionComparisonDecisions({ workspace: normalizedWorkspace, comparisonId });
      commit(result.workspace);
      setComparisonMessage(`${result.acceptedCount} változás elfogadva, ${result.rejectedCount} elutasítva, ${result.pendingCount} függőben. Az új tervverzió jóváhagyási állapota frissült.`);
    } catch (error) {
      setComparisonMessage(error instanceof Error ? error.message : "A részleges változásátvétel nem sikerült.");
    }
  }

  function patchPage(patch: Partial<SurveyPlanPage>) {
    if (!activeDocument || !activePage) return;
    const updatedAt = new Date().toISOString();
    commit({
      ...normalizedWorkspace,
      documents: normalizedWorkspace.documents.map((document) => document.id === activeDocument.id ? {
        ...document,
        updatedAt,
        pages: document.pages.map((page) => page.id === activePage.id ? { ...page, ...patch, updatedAt } : page),
      } : document),
    });
  }

  function patchSuggestion(suggestionId: string, patch: Partial<SurveyPlanSuggestion>) {
    if (!activePage) return;
    patchPage({
      suggestions: activePage.suggestions.map((suggestion) => suggestion.id === suggestionId ? {
        ...suggestion,
        ...patch,
        userModified: patch.userModified ?? true,
        updatedAt: new Date().toISOString(),
      } : suggestion),
    });
  }

  function patchWallSuggestion(wallId: string, patch: Partial<SurveyPlanWallSuggestion>) {
    if (!activePage) return;
    const updatedAt = new Date().toISOString();
    const patchedWall = activePage.wallSuggestions.find((wall) => wall.id === wallId);
    if (!patchedWall) return;
    const nextWall = {
      ...patchedWall,
      ...patch,
      userModified: patch.userModified ?? true,
      updatedAt,
    };
    const nextOpenings = activePage.openingSuggestions.map((opening) => opening.wallSuggestionId === wallId ? {
      ...opening,
      center: openingCenterOnWall(nextWall, opening.offsetRatio),
      connectedRoomSuggestionIds: [...nextWall.connectedRoomSuggestionIds],
      zoneId: opening.zoneId || nextWall.zoneId,
      updatedAt,
    } : opening);
    const nextWalls = recalculateAllPlanWallAreas(
      activePage.wallSuggestions.map((wall) => wall.id === wallId ? nextWall : wall),
      nextOpenings,
    );
    patchPage({ wallSuggestions: nextWalls, openingSuggestions: nextOpenings });
  }

  function patchOpeningSuggestion(openingId: string, patch: Partial<SurveyPlanOpeningSuggestion>) {
    if (!activePage) return;
    const opening = activePage.openingSuggestions.find((candidate) => candidate.id === openingId);
    if (!opening) return;
    const wall = activePage.wallSuggestions.find((candidate) => candidate.id === (patch.wallSuggestionId || opening.wallSuggestionId));
    if (!wall) return;
    const widthMeters = Math.max(0.1, Number(patch.widthMeters ?? opening.widthMeters) || 0.1);
    const heightMeters = Math.max(0.1, Number(patch.heightMeters ?? opening.heightMeters) || 0.1);
    const offsetRatio = clamp(Number(patch.offsetRatio ?? opening.offsetRatio) || 0, 0, 1);
    const updatedAt = new Date().toISOString();
    const nextOpening: SurveyPlanOpeningSuggestion = {
      ...opening,
      ...patch,
      wallSuggestionId: wall.id,
      connectedRoomSuggestionIds: [...wall.connectedRoomSuggestionIds],
      center: openingCenterOnWall(wall, offsetRatio),
      offsetRatio,
      widthMeters,
      heightMeters,
      sillHeightMeters: Math.max(0, Number(patch.sillHeightMeters ?? opening.sillHeightMeters) || 0),
      areaSquareMeters: widthMeters * heightMeters,
      zoneId: typeof patch.zoneId === "string" ? patch.zoneId : opening.zoneId || wall.zoneId,
      userModified: patch.userModified ?? true,
      updatedAt,
    };
    const nextOpenings = activePage.openingSuggestions.map((candidate) => candidate.id === openingId ? nextOpening : candidate);
    patchPage({
      openingSuggestions: nextOpenings,
      wallSuggestions: recalculateAllPlanWallAreas(activePage.wallSuggestions, nextOpenings),
    });
  }

  function changeViewZoom(nextZoom: number) {
    setViewZoomPercent(clamp(Math.round(nextZoom / 10) * 10, 50, 400));
  }

  function resetPlanView() {
    setViewZoomPercent(100);
    setZoomedSuggestionId(null);
    preFocusViewRef.current = null;
    window.requestAnimationFrame(() => viewportRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" }));
  }

  function selectSuggestion(suggestion: SurveyPlanSuggestion) {
    setActiveSuggestionId(suggestion.id);
    setActiveWallId(null);
    setActiveOpeningId(null);
    setWallEndpointPlacement(null);
    setSelectedVertexIndex(null);
  }

  function selectWall(wall: SurveyPlanWallSuggestion) {
    setActiveWallId(wall.id);
    setActiveSuggestionId(null);
    setActiveOpeningId(null);
    setSelectedVertexIndex(null);
    setTool("select");
  }

  function selectOpening(opening: SurveyPlanOpeningSuggestion) {
    setActiveOpeningId(opening.id);
    setActiveWallId(opening.wallSuggestionId);
    setActiveSuggestionId(null);
    setSelectedVertexIndex(null);
    setTool("select");
    setShowOpeningSuggestions(true);
  }

  function toggleSuggestionFocus(suggestion: SurveyPlanSuggestion, switchToDrawing = true) {
    const viewport = viewportRef.current;
    if (zoomedSuggestionId === suggestion.id && preFocusViewRef.current) {
      const snapshot = preFocusViewRef.current;
      setViewZoomPercent(snapshot.zoomPercent);
      setZoomedSuggestionId(null);
      preFocusViewRef.current = null;
      window.setTimeout(() => viewportRef.current?.scrollTo({ left: snapshot.scrollLeft, top: snapshot.scrollTop, behavior: "smooth" }), 100);
      return;
    }
    preFocusViewRef.current = {
      zoomPercent: viewZoomPercent,
      scrollLeft: viewport?.scrollLeft || 0,
      scrollTop: viewport?.scrollTop || 0,
    };
    const bounds = polygonBounds(suggestion.polygon);
    const pageScale = Math.max(0.1, (activePage?.scalePercent || 100) / 100);
    const targetZoom = clamp(65 / Math.max(0.08, Math.max(bounds.width, bounds.height) * pageScale), 125, 400);
    setActiveSuggestionId(suggestion.id);
    setZoomedSuggestionId(suggestion.id);
    setPendingFocusSuggestionId(suggestion.id);
    changeViewZoom(targetZoom);
    if (switchToDrawing && effectiveViewMode === "data") onViewModeChange(isPortraitTablet ? "plan" : "split");
  }

  function beginSuggestionDrag(event: React.PointerEvent<SVGElement>, suggestion: SurveyPlanSuggestion, mode: SuggestionDragMode, vertexIndex?: number) {
    const toolAllowsDrag = mode === "vertex" ? tool === "editRoomVertices" : tool === "select";
    if (!toolAllowsDrag || !stageRef.current || suggestion.status === "ignored") return;
    event.preventDefault();
    event.stopPropagation();
    selectSuggestion(suggestion);
    const rawPoint = normalizePointer(event, stageRef.current);
    const point = invertPageTransform(rawPoint, activePage!);
    suggestionDragRef.current = {
      pointerId: event.pointerId,
      suggestionId: suggestion.id,
      mode,
      start: point,
      startPolygon: suggestion.polygon.map((polygonPoint) => ({ ...polygonPoint })),
      startLabelPosition: suggestion.labelPosition ? { ...suggestion.labelPosition } : null,
      vertexIndex,
      moved: false,
    };
    setSuggestionDragPreview(null);
    suppressSuggestionClickRef.current = false;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer capture opcionális */ }
  }

  function updateSuggestionDrag(pointerId: number, clientX: number, clientY: number) {
    const drag = suggestionDragRef.current;
    if (!drag || drag.pointerId !== pointerId || !activePage || !stageRef.current) return;
    const rawPoint = normalizeClientPoint(clientX, clientY, stageRef.current);
    const point = invertPageTransform(rawPoint, activePage);
    const deltaX = point.x - drag.start.x;
    const deltaY = point.y - drag.start.y;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 0.003) return;
    drag.moved = true;
    suppressSuggestionClickRef.current = true;
    const suggestion = activePage.suggestions.find((item) => item.id === drag.suggestionId);
    if (!suggestion) return;
    if (drag.mode === "label") {
      const base = drag.startLabelPosition || automaticSuggestionLabelPosition({ ...suggestion, polygon: drag.startPolygon }, activePage);
      const labelPosition = {
        x: clamp(base.x + deltaX, activePage.crop.x, activePage.crop.x + activePage.crop.width),
        y: clamp(base.y + deltaY, activePage.crop.y, activePage.crop.y + activePage.crop.height),
      };
      drag.previewLabelPosition = labelPosition;
      setSuggestionDragPreview({ suggestionId: drag.suggestionId, labelPosition });
      return;
    }
    if (drag.mode === "vertex" && drag.vertexIndex != null) {
      const polygon = drag.startPolygon.map((polygonPoint, index) => index === drag.vertexIndex ? {
        x: clamp(point.x, activePage.crop.x, activePage.crop.x + activePage.crop.width),
        y: clamp(point.y, activePage.crop.y, activePage.crop.y + activePage.crop.height),
      } : polygonPoint);
      drag.previewPolygon = polygon;
      setSuggestionDragPreview({ suggestionId: drag.suggestionId, polygon, labelPosition: drag.startLabelPosition });
      return;
    }
    const bounds = polygonBounds(drag.startPolygon);
    const adjustedDeltaX = clamp(deltaX, activePage.crop.x - bounds.x, activePage.crop.x + activePage.crop.width - (bounds.x + bounds.width));
    const adjustedDeltaY = clamp(deltaY, activePage.crop.y - bounds.y, activePage.crop.y + activePage.crop.height - (bounds.y + bounds.height));
    const polygon = drag.startPolygon.map((polygonPoint) => ({ x: polygonPoint.x + adjustedDeltaX, y: polygonPoint.y + adjustedDeltaY }));
    const labelPosition = drag.startLabelPosition ? {
      x: clamp(drag.startLabelPosition.x + adjustedDeltaX, activePage.crop.x, activePage.crop.x + activePage.crop.width),
      y: clamp(drag.startLabelPosition.y + adjustedDeltaY, activePage.crop.y, activePage.crop.y + activePage.crop.height),
    } : null;
    drag.previewPolygon = polygon;
    drag.previewLabelPosition = labelPosition;
    setSuggestionDragPreview({ suggestionId: drag.suggestionId, polygon, labelPosition });
  }

  function commitSuggestionDragPatch(suggestionId: string, patch: Partial<SurveyPlanSuggestion>) {
    const currentWorkspace = latestWorkspaceRef.current;
    const currentDocument = latestActiveDocumentRef.current;
    const currentPage = latestActivePageRef.current;
    if (!currentDocument || !currentPage) return;
    const updatedAt = new Date().toISOString();
    latestOnChangeRef.current({
      ...currentWorkspace,
      updatedAt,
      documents: currentWorkspace.documents.map((document) => document.id === currentDocument.id ? {
        ...document,
        updatedAt,
        pages: document.pages.map((page) => page.id === currentPage.id ? {
          ...page,
          updatedAt,
          suggestions: page.suggestions.map((suggestion) => suggestion.id === suggestionId ? {
            ...suggestion,
            ...patch,
            userModified: true,
            updatedAt,
          } : suggestion),
        } : page),
      } : document),
    });
  }

  function finishSuggestionDrag(pointerId: number) {
    const drag = suggestionDragRef.current;
    if (!drag || drag.pointerId !== pointerId) return;
    suggestionDragRef.current = null;
    if (drag.moved) {
      if (drag.mode === "label" && drag.previewLabelPosition) {
        commitSuggestionDragPatch(drag.suggestionId, { labelPosition: drag.previewLabelPosition, source: "userCorrected" });
      } else if ((drag.mode === "polygon" || drag.mode === "vertex") && drag.previewPolygon) {
        const currentPage = latestActivePageRef.current;
        const currentSuggestion = currentPage?.suggestions.find((suggestion) => suggestion.id === drag.suggestionId);
        if (currentPage && currentSuggestion) {
          commitSuggestionDragPatch(drag.suggestionId, {
            ...recalculateSuggestionGeometry(currentSuggestion, drag.previewPolygon, currentPage, viewportSize.width, viewportSize.height),
            labelPosition: drag.mode === "polygon" ? drag.previewLabelPosition ?? null : currentSuggestion.labelPosition,
          });
        }
      }
      window.setTimeout(() => { suppressSuggestionClickRef.current = false; }, 0);
    }
    setSuggestionDragPreview(null);
  }

  updateSuggestionDragHandlerRef.current = updateSuggestionDrag;
  finishSuggestionDragHandlerRef.current = finishSuggestionDrag;

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const wallDrag = wallDragRef.current;
      if (wallDrag && wallDrag.pointerId === event.pointerId) {
        event.preventDefault();
        updateWallDragHandlerRef.current(event.pointerId, event.clientX, event.clientY);
        return;
      }
      const drag = suggestionDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      updateSuggestionDragHandlerRef.current(event.pointerId, event.clientX, event.clientY);
    };
    const handlePointerEnd = (event: PointerEvent) => {
      const wallDrag = wallDragRef.current;
      if (wallDrag && wallDrag.pointerId === event.pointerId) {
        event.preventDefault();
        finishWallDragHandlerRef.current(event.pointerId);
        return;
      }
      const drag = suggestionDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      finishSuggestionDragHandlerRef.current(event.pointerId);
    };
    const handleMouseMove = (event: MouseEvent) => {
      const wallDrag = wallDragRef.current;
      if (wallDrag) updateWallDragHandlerRef.current(wallDrag.pointerId, event.clientX, event.clientY);
    };
    const handleMouseUp = () => {
      const wallDrag = wallDragRef.current;
      if (wallDrag) finishWallDragHandlerRef.current(wallDrag.pointerId);
      const drag = suggestionDragRef.current;
      if (drag) finishSuggestionDragHandlerRef.current(drag.pointerId);
    };
    const handleWindowBlur = () => {
      const wallDrag = wallDragRef.current;
      if (wallDrag) finishWallDragHandlerRef.current(wallDrag.pointerId);
      const drag = suggestionDragRef.current;
      if (drag) finishSuggestionDragHandlerRef.current(drag.pointerId);
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: false, capture: true });
    window.addEventListener("pointerup", handlePointerEnd, { passive: false, capture: true });
    window.addEventListener("pointercancel", handlePointerEnd, { passive: false, capture: true });
    window.addEventListener("mousemove", handleMouseMove, true);
    window.addEventListener("mouseup", handleMouseUp, true);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerEnd, true);
      window.removeEventListener("pointercancel", handlePointerEnd, true);
      window.removeEventListener("mousemove", handleMouseMove, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  function insertSuggestionVertex(suggestion: SurveyPlanSuggestion, edgeIndex: number) {
    if (!activePage || suggestion.polygon.length < 2) return;
    const start = suggestion.polygon[edgeIndex];
    const end = suggestion.polygon[(edgeIndex + 1) % suggestion.polygon.length];
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const polygon = [...suggestion.polygon.slice(0, edgeIndex + 1), midpoint, ...suggestion.polygon.slice(edgeIndex + 1)];
    patchSuggestion(suggestion.id, recalculateSuggestionGeometry(suggestion, polygon, activePage, viewportSize.width, viewportSize.height));
    setSelectedVertexIndex(edgeIndex + 1);
  }

  function deleteSelectedVertex() {
    if (!activePage || !activeSuggestion || selectedVertexIndex == null || activeSuggestion.polygon.length <= 3) return;
    const polygon = activeSuggestion.polygon.filter((_, index) => index !== selectedVertexIndex);
    patchSuggestion(activeSuggestion.id, recalculateSuggestionGeometry(activeSuggestion, polygon, activePage, viewportSize.width, viewportSize.height));
    setSelectedVertexIndex(Math.min(selectedVertexIndex, polygon.length - 1));
  }

  function commitRoomGeometrySuggestions(nextSuggestions: SurveyPlanSuggestion[], message: string) {
    if (!activePage) return;
    const validSuggestionIds = new Set(nextSuggestions.map((suggestion) => suggestion.id));
    const manualWalls = activePage.wallSuggestions
      .filter((wall) => wall.source === "manualDrawing")
      .map((wall) => ({
        ...wall,
        connectedRoomSuggestionIds: wall.connectedRoomSuggestionIds.filter((id) => validSuggestionIds.has(id)),
        status: "review" as const,
        source: "manualDrawing" as const,
        userModified: true,
        updatedAt: new Date().toISOString(),
      }));
    const manualWallIds = new Set(manualWalls.map((wall) => wall.id));
    const preservedOpenings = activePage.openingSuggestions
      .filter((opening) => opening.source === "manualDrawing" && manualWallIds.has(opening.wallSuggestionId))
      .map((opening) => ({ ...opening, status: "review" as const, updatedAt: new Date().toISOString() }));
    patchPage({
      suggestions: nextSuggestions,
      wallSuggestions: recalculateAllPlanWallAreas(manualWalls, preservedOpenings),
      wallRecognitionStatus: "idle",
      wallRecognitionMessage: "A helyiséggeometria megváltozott. A külső határolást újra kell felismerni.",
      openingSuggestions: preservedOpenings,
      openingRecognitionStatus: "idle",
      openingRecognitionMessage: "A helyiséggeometria megváltozott. A nyílászáró-javaslatokat újra kell felismerni.",
    });
    setActiveWallId(null);
    setActiveOpeningId(null);
    setSelectedVertexIndex(null);
    setGeometryMessage(message);
  }

  function mergeSelectedRoom(sourceSuggestionId = activeSuggestionId) {
    if (!activePage || !sourceSuggestionId || !mergeTargetSuggestionId) return;
    const sourceSuggestion = activePage.suggestions.find((suggestion) => suggestion.id === sourceSuggestionId && suggestion.status !== "ignored");
    const target = activePage.suggestions.find((suggestion) => suggestion.id === mergeTargetSuggestionId && suggestion.status !== "ignored");
    if (!sourceSuggestion || !target || target.id === sourceSuggestion.id || target.levelId !== sourceSuggestion.levelId) {
      setGeometryMessage("Az összevonáshoz válassz ugyanazon a szinten lévő másik helyiséget.");
      return;
    }
    const mergedPolygon = mergeAdjacentPolygons(sourceSuggestion.polygon, target.polygon);
    if (!mergedPolygon) {
      setGeometryMessage("A két helyiség nem vonható össze automatikusan: teljes közös falszakasz szükséges. A poligonpontokat előbb igazítsd egymáshoz.");
      return;
    }
    const firstBase = sourceSuggestion.name.replace(/\s+[AB]$/u, "");
    const secondBase = target.name.replace(/\s+[AB]$/u, "");
    const mergedName = firstBase === secondBase ? firstBase : `${sourceSuggestion.name} + ${target.name}`;
    const weightedHeight = (
      sourceSuggestion.roomHeightMeters * Math.max(0.1, sourceSuggestion.calculatedAreaSquareMeters)
      + target.roomHeightMeters * Math.max(0.1, target.calculatedAreaSquareMeters)
    ) / Math.max(0.2, sourceSuggestion.calculatedAreaSquareMeters + target.calculatedAreaSquareMeters);
    const baseSuggestion: SurveyPlanSuggestion = {
      ...sourceSuggestion,
      name: mergedName,
      function: sourceSuggestion.function === target.function ? sourceSuggestion.function : "Összevont helyiség",
      polygon: mergedPolygon,
      labelPosition: null,
      labeledAreaSquareMeters: null,
      areaDifferenceSquareMeters: null,
      areaDifferencePercent: null,
      heated: sourceSuggestion.heated || target.heated,
      roomHeightMeters: Number.isFinite(weightedHeight) ? weightedHeight : sourceSuggestion.roomHeightMeters,
      confidence: "manual",
      confidenceScore: 1,
      source: "userCorrected",
      sourceDetails: `Felhasználói helyiség-összevonás: ${sourceSuggestion.name} + ${target.name}.`,
      geometryMethod: "manualPolygon",
      contourClosed: true,
      status: "review",
      userModified: true,
      updatedAt: new Date().toISOString(),
    };
    const merged = {
      ...baseSuggestion,
      ...recalculateSuggestionGeometry(baseSuggestion, mergedPolygon, activePage, viewportSize.width, viewportSize.height),
    };
    const nextSuggestions = activePage.suggestions
      .filter((suggestion) => suggestion.id !== target.id)
      .map((suggestion) => suggestion.id === sourceSuggestion.id ? merged : suggestion);
    commitRoomGeometrySuggestions(nextSuggestions, `A(z) „${sourceSuggestion.name}” és „${target.name}” helyiség összevonva. A külső falakat újra kell felismerni.`);
    setMergeTargetSuggestionId("");
    setActiveSuggestionId(merged.id);
    setTool("select");
  }

  function finishSplitRoom(points = splitRoomPoints) {
    if (!activePage || points.length < 2) return;
    const sourceSuggestion = activePage.suggestions.find((suggestion) => suggestion.id === (splitRoomSuggestionId || activeSuggestionId) && suggestion.status !== "ignored");
    if (!sourceSuggestion) {
      setGeometryMessage("A kettévágandó helyiség már nem található. Jelöld ki újra, majd indítsd újra a kettévágást.");
      setSplitRoomPoints([]);
      setSplitRoomSuggestionId(null);
      setTool("select");
      return;
    }
    const split = splitPolygonByLine(sourceSuggestion.polygon, points[0], points[1]);
    if (!split) {
      setGeometryMessage("A vágóvonalnak a kijelölt helyiséget két külön, használható poligonra kell osztania.");
      setSplitRoomPoints([]);
      return;
    }
    const now = new Date().toISOString();
    const createPart = (polygon: SurveyNormalizedPoint[], id: string, suffix: string): SurveyPlanSuggestion => {
      const base: SurveyPlanSuggestion = {
        ...sourceSuggestion,
        id,
        name: `${sourceSuggestion.name.replace(/\s+[AB]$/u, "")} ${suffix}`,
        polygon,
        labelPosition: null,
        labeledAreaSquareMeters: null,
        areaDifferenceSquareMeters: null,
        areaDifferencePercent: null,
        confidence: "manual",
        confidenceScore: 1,
        source: "userCorrected",
        sourceDetails: `Felhasználói helyiség-kettévágás: ${sourceSuggestion.name}, ${suffix} rész.`,
        geometryMethod: "manualPolygon",
        contourClosed: true,
        status: "review",
        userModified: true,
        createdAt: id === sourceSuggestion.id ? sourceSuggestion.createdAt : now,
        updatedAt: now,
      };
      return { ...base, ...recalculateSuggestionGeometry(base, polygon, activePage, viewportSize.width, viewportSize.height) };
    };
    const first = createPart(split[0], sourceSuggestion.id, "A");
    const second = createPart(split[1], createId("split-room"), "B");
    const nextSuggestions = activePage.suggestions.flatMap((suggestion) => suggestion.id === sourceSuggestion.id ? [first, second] : [suggestion]);
    commitRoomGeometrySuggestions(nextSuggestions, `A(z) „${sourceSuggestion.name}” helyiség két részre bontva. Mindkét új helyiség ellenőrzendő.`);
    setSplitRoomPoints([]);
    setSplitRoomSuggestionId(null);
    setMergeTargetSuggestionId(second.id);
    setActiveSuggestionId(first.id);
    setTool("select");
  }

  function startWallEndpointDrag(pointerId: number, wall: SurveyPlanWallSuggestion, endpoint: "start" | "end") {
    if (!stageRef.current || wall.status === "ignored" || wallDragRef.current) return;
    selectWall(wall);
    wallDragRef.current = { pointerId, wallId: wall.id, endpoint, startWall: { ...wall }, moved: false };
    setWallDragPreview(null);
  }

  function beginWallEndpointDrag(event: React.PointerEvent<SVGElement>, wall: SurveyPlanWallSuggestion, endpoint: "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    startWallEndpointDrag(event.pointerId, wall, endpoint);
  }

  function beginWallEndpointMouseDrag(event: React.MouseEvent<SVGElement>, wall: SurveyPlanWallSuggestion, endpoint: "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    startWallEndpointDrag(wallDragRef.current?.pointerId || 1, wall, endpoint);
  }

  function updateWallDrag(pointerId: number, clientX: number, clientY: number) {
    const drag = wallDragRef.current;
    const currentPage = latestActivePageRef.current;
    if (!drag || drag.pointerId !== pointerId || !currentPage || !stageRef.current) return;
    const rawPoint = normalizeClientPoint(clientX, clientY, stageRef.current);
    const point = invertPageTransform(rawPoint, currentPage);
    const clampedPoint = {
      x: clamp(point.x, currentPage.crop.x, currentPage.crop.x + currentPage.crop.width),
      y: clamp(point.y, currentPage.crop.y, currentPage.crop.y + currentPage.crop.height),
    };
    const movedDistance = Math.hypot(clampedPoint.x - drag.startWall[drag.endpoint].x, clampedPoint.y - drag.startWall[drag.endpoint].y);
    if (!drag.moved && movedDistance < 0.003) return;
    const connectedRoom = currentPage.suggestions.find((suggestion) => drag.startWall.connectedRoomSuggestionIds.includes(suggestion.id)) || null;
    drag.previewWall = recalculateWallGeometry(drag.startWall, {
      [drag.endpoint]: clampedPoint,
      page: currentPage,
      viewportWidth: viewportSize.width,
      viewportHeight: viewportSize.height,
      connectedRoom,
    });
    drag.moved = true;
    setWallDragPreview({ wallId: drag.wallId, wall: drag.previewWall });
  }

  function commitWallDragPatch(wallId: string, wallPatch: Partial<SurveyPlanWallSuggestion>) {
    const currentWorkspace = latestWorkspaceRef.current;
    const currentDocument = latestActiveDocumentRef.current;
    const currentPage = latestActivePageRef.current;
    if (!currentDocument || !currentPage) return;
    const updatedAt = new Date().toISOString();
    const originalWall = currentPage.wallSuggestions.find((wall) => wall.id === wallId);
    if (!originalWall) return;
    const nextWall = { ...originalWall, ...wallPatch, userModified: true, updatedAt };
    const nextOpenings = currentPage.openingSuggestions.map((opening) => opening.wallSuggestionId === wallId ? {
      ...opening,
      center: openingCenterOnWall(nextWall, opening.offsetRatio),
      updatedAt,
    } : opening);
    const nextWalls = recalculateAllPlanWallAreas(
      currentPage.wallSuggestions.map((wall) => wall.id === wallId ? nextWall : wall),
      nextOpenings,
    );
    latestOnChangeRef.current({
      ...currentWorkspace,
      updatedAt,
      documents: currentWorkspace.documents.map((document) => document.id === currentDocument.id ? {
        ...document,
        updatedAt,
        pages: document.pages.map((page) => page.id === currentPage.id ? {
          ...page,
          updatedAt,
          wallSuggestions: nextWalls,
          openingSuggestions: nextOpenings,
        } : page),
      } : document),
    });
  }

  function finishWallDrag(pointerId: number) {
    const drag = wallDragRef.current;
    if (!drag || drag.pointerId !== pointerId) return;
    wallDragRef.current = null;
    if (drag.moved && drag.previewWall) commitWallDragPatch(drag.wallId, drag.previewWall);
    setWallDragPreview(null);
  }

  updateWallDragHandlerRef.current = updateWallDrag;
  finishWallDragHandlerRef.current = finishWallDrag;

  function startWallEndpointPlacement(wall: SurveyPlanWallSuggestion, endpoint: "start" | "end") {
    if (wall.status === "ignored") return;
    setActiveWallId(wall.id);
    setActiveSuggestionId(null);
    setWallEndpointPlacement({ wallId: wall.id, endpoint });
    setTool("select");
    setShowWallSuggestions(true);
    onViewModeChange("plan");
  }

  function recognizeExternalWalls() {
    if (!activePage) return;
    const approvedRooms = activePage.suggestions.filter((suggestion) => suggestion.status === "approved" && suggestion.polygon.length >= 3);
    const sourceRooms = approvedRooms.length ? approvedRooms : activePage.suggestions.filter((suggestion) => suggestion.status !== "ignored" && suggestion.polygon.length >= 3);
    if (!sourceRooms.length) {
      patchPage({ wallRecognitionStatus: "error", wallRecognitionMessage: "Nincs használható helyiségpoligon. Előbb ismerd fel vagy rajzold meg a helyiségeket." });
      return;
    }
    patchPage({ wallRecognitionStatus: "analyzing", wallRecognitionMessage: "A helyiségpoligonok külső peremszakaszainak elemzése folyamatban..." });
    const generated = buildExternalWallSuggestions({
      page: activePage,
      roomSuggestions: sourceRooms,
      viewportWidth: viewportSize.width,
      viewportHeight: viewportSize.height,
      idFactory: createId,
    }).map((wall) => ({
      ...wall,
      zoneId: wall.connectedRoomSuggestionIds.map((id) => zoneByRoomSuggestionId[id] || "").find(Boolean) || "",
    }));
    const preserved = activePage.wallSuggestions.filter((wall) => wall.source === "manualDrawing" || wall.status === "approved");
    const nextWallsWithoutMetrics = [...preserved, ...generated];
    const validWallIds = new Set(nextWallsWithoutMetrics.map((wall) => wall.id));
    const preservedOpenings = activePage.openingSuggestions.filter((opening) => validWallIds.has(opening.wallSuggestionId) && (opening.source === "manualDrawing" || opening.status === "approved"));
    const nextWalls = recalculateAllPlanWallAreas(nextWallsWithoutMetrics, preservedOpenings);
    patchPage({
      wallRecognitionStatus: "ready",
      wallRecognitionMessage: `${generated.length} külső határoló falszakasz-javaslat készült ${sourceRooms.length} helyiségpoligonból. A besorolás, szerkezettípus, zóna és végpontok jóváhagyás előtt ellenőrzendők.`,
      wallSuggestions: nextWalls,
      openingSuggestions: preservedOpenings,
      openingRecognitionStatus: "idle",
      openingRecognitionMessage: preservedOpenings.length ? "A megőrzött kézi vagy jóváhagyott nyílászárók mellett az automatikus javaslatokat újra kell felismerni." : "A falszakaszok elkészültek. A nyílászáró-javaslatok felismerése indítható.",
    });
    setShowWallSuggestions(true);
    setActiveWallId(generated[0]?.id || preserved[0]?.id || null);
    setActiveOpeningId(preservedOpenings[0]?.id || null);
  }

  async function recognizeOpenings() {
    if (!activeDocument || !activePage) return;
    const usableWalls = activePage.wallSuggestions.filter((wall) => wall.status !== "ignored" && wall.lengthMeters >= 0.4);
    if (!usableWalls.length) {
      patchPage({ openingRecognitionStatus: "error", openingRecognitionMessage: "Nincs használható falszakasz. Előbb készítsd el vagy javítsd a külső határoló falakat." });
      return;
    }
    patchPage({ openingRecognitionStatus: "analyzing", openingRecognitionMessage: "A PDF vektorgeometriájának és falszakaszainak nyílászáró-elemzése folyamatban..." });
    try {
      let loaded = loadedPdfRef.current;
      if (!loaded || loaded.documentId !== activeDocument.id) {
        const [document, pdfJs] = await Promise.all([loadSharedPdfDocument(activeDocument.dataUrl), loadSharedPdfJs()]);
        loaded = { documentId: activeDocument.id, document, pdfJs };
        loadedPdfRef.current = loaded;
      }
      const pdfPage = await loaded.document.getPage(activePage.pageNumber);
      const analysis = await analyzeSharedPdfPage(loaded.pdfJs, pdfPage);
      if (analysis.contentKind === "raster") {
        patchPage({ openingRecognitionStatus: "error", openingRecognitionMessage: "Raszteres PDF esetén automatikus vektoros nyílászáró-javaslat nem készíthető. A kijelölt falhoz kézi nyílászáró adható." });
        return;
      }
      const analysisViewport = pdfPage.getViewport({ scale: 1.35, rotation: 0 });
      const generated = buildPlanOpeningSuggestions({
        page: activePage,
        walls: usableWalls,
        vectorContours: analysis.vectorContours,
        textItems: analysis.textItems,
        viewportWidth: analysisViewport.width,
        viewportHeight: analysisViewport.height,
        zoneByRoomSuggestionId,
        idFactory: createId,
      });
      const validWallIds = new Set(usableWalls.map((wall) => wall.id));
      const preserved = activePage.openingSuggestions.filter((opening) => validWallIds.has(opening.wallSuggestionId) && (opening.source === "manualDrawing" || opening.status === "approved"));
      const freshGenerated = generated.filter((opening) => !preserved.some((saved) => saved.wallSuggestionId === opening.wallSuggestionId && Math.abs(saved.offsetRatio - opening.offsetRatio) <= 0.04));
      const nextOpenings = [...preserved, ...freshGenerated];
      patchPage({
        openingRecognitionStatus: "ready",
        openingRecognitionMessage: freshGenerated.length
          ? `${freshGenerated.length} automatikus nyílászáró-javaslat készült ${usableWalls.length} falszakaszhoz. A típus, méret, parapet, keret, üvegezés és U-érték jóváhagyás előtt ellenőrzendő.`
          : "Nem találtunk kellően biztos, falhoz párosítható vektoros nyílászáró-geometriát. A falszakaszokhoz kézi nyílászáró adható.",
        openingSuggestions: nextOpenings,
        wallSuggestions: recalculateAllPlanWallAreas(activePage.wallSuggestions, nextOpenings),
      });
      setShowOpeningSuggestions(true);
      setActiveOpeningId(freshGenerated[0]?.id || preserved[0]?.id || null);
      setActiveWallId(freshGenerated[0]?.wallSuggestionId || preserved[0]?.wallSuggestionId || activeWallId);
    } catch (error) {
      console.error(error);
      patchPage({ openingRecognitionStatus: "error", openingRecognitionMessage: error instanceof Error ? error.message : "A nyílászáró-javaslatok felismerése sikertelen." });
    }
  }

  function finishManualWall(points = manualWallPoints) {
    if (!activePage || points.length < 2) return;
    const now = new Date().toISOString();
    const base: SurveyPlanWallSuggestion = {
      id: createId("manual-wall"),
      pageId: activePage.id,
      levelId: activePage.levelId,
      start: points[0],
      end: points[1],
      boundaryType: "unknown",
      orientationDegrees: 0,
      orientationLabel: "–",
      lengthMeters: 0,
      heightMeters: 2.7,
      thicknessMeters: 0.3,
      assemblyId: "",
      zoneId: "",
      adjacentZoneId: "",
      grossAreaSquareMeters: 0,
      openingAreaSquareMeters: 0,
      netAreaSquareMeters: 0,
      connectedRoomSuggestionIds: [],
      confidence: "manual",
      confidenceScore: 1,
      source: "manualDrawing",
      sourceDetails: "A felhasználó kézzel rajzolta a külső határoló falszakaszt a PDF fölé.",
      status: "review",
      userModified: true,
      createdAt: now,
      updatedAt: now,
    };
    const wall = {
      ...recalculateWallGeometry(base, { page: activePage, viewportWidth: viewportSize.width, viewportHeight: viewportSize.height, connectedRoom: null }),
      source: "manualDrawing" as const,
      sourceDetails: base.sourceDetails,
      userModified: true,
    };
    const nextWalls = recalculateAllPlanWallAreas([...activePage.wallSuggestions, wall], activePage.openingSuggestions);
    patchPage({ wallSuggestions: nextWalls, wallRecognitionStatus: "ready", wallRecognitionMessage: "Kézi falszakasz hozzáadva; a határolási típus, szerkezet és zóna ellenőrzendő." });
    setActiveWallId(wall.id);
    setManualWallPoints([]);
    setTool("select");
    setShowWallSuggestions(true);
  }

  function deleteWallSuggestion(wallId: string) {
    if (!activePage) return;
    const nextOpenings = activePage.openingSuggestions.filter((opening) => opening.wallSuggestionId !== wallId);
    patchPage({
      wallSuggestions: recalculateAllPlanWallAreas(activePage.wallSuggestions.filter((wall) => wall.id !== wallId), nextOpenings),
      openingSuggestions: nextOpenings,
    });
    setActiveWallId(null);
    setActiveOpeningId(null);
  }

  function addManualOpeningToWall(wall: SurveyPlanWallSuggestion) {
    if (!activePage) return;
    const opening = createManualPlanOpening({
      page: activePage,
      wall,
      zoneId: wall.zoneId || wall.connectedRoomSuggestionIds.map((id) => zoneByRoomSuggestionId[id] || "").find(Boolean) || "",
      idFactory: createId,
    });
    const nextOpenings = [...activePage.openingSuggestions, opening];
    patchPage({
      openingSuggestions: nextOpenings,
      openingRecognitionStatus: "ready",
      openingRecognitionMessage: "Kézi nyílászáró hozzáadva. A típus, méret, parapet, rétegrend és U-érték ellenőrzendő.",
      wallSuggestions: recalculateAllPlanWallAreas(activePage.wallSuggestions, nextOpenings),
    });
    setActiveOpeningId(opening.id);
    setActiveWallId(wall.id);
    setShowOpeningSuggestions(true);
  }

  function applyOpeningCatalog(opening: SurveyPlanOpeningSuggestion, profileId: string) {
    patchOpeningSuggestion(opening.id, applySurveyOpeningCatalogProfile(opening, profileId));
  }

  function applyActiveVersionToEnergyModel() {
    if (!versionComparisonSummary || !versionModelPreview) return;
    const confirmed = !versionModelPreview.requiresConfirmation || versionModelApplyConfirmed;
    const result = onApplyVersionEnergyModel(versionComparisonSummary.comparison.id, confirmed);
    setVersionModelMessage(result.message);
    if (result.applied) {
      setVersionModelApplyConfirmed(false);
      setVersionModelRollbackConfirmed(false);
    }
  }

  function rollbackActiveVersionEnergyModel() {
    if (!selectedVersionModelApplication) return;
    const result = onRollbackVersionEnergyModel(selectedVersionModelApplication.comparisonId, versionModelRollbackConfirmed, selectedVersionModelApplication.id);
    setVersionModelMessage(result.message);
    if (result.rolledBack) {
      setVersionModelRollbackConfirmed(false);
      setVersionModelApplyConfirmed(false);
    }
  }

  function createCurrentVersionExportManifest() {
    return buildSurveyPlanRevisionPackageManifest({
      workspace: normalizedWorkspace,
      projectName,
      surveyName,
      generatedAt: new Date().toISOString(),
    });
  }

  function exportVersionManifestJson() {
    try {
      const manifest = createCurrentVersionExportManifest();
      const baseName = createSurveyPlanRevisionPackageBaseName(manifest);
      downloadSurveyBlob(new Blob([stableSurveyPlanRevisionJson(manifest, 2)], { type: "application/json;charset=utf-8" }), `${baseName}_manifest.json`);
      setVersionExportState("done");
      setVersionExportMessage(`Manifest elkészült: ${manifest.graph.totals.documentCount} verzió, ${manifest.comparisons.length} összehasonlítás, ${manifest.snapshots.length} snapshot-index.`);
    } catch (error) {
      console.error(error);
      setVersionExportState("error");
      setVersionExportMessage(error instanceof Error ? error.message : "A revíziós manifest exportja nem sikerült.");
    }
  }

  async function exportVersionSummaryPdf() {
    setVersionExportState("working");
    setVersionExportMessage("PDF revíziós összefoglaló készítése...");
    try {
      const manifest = createCurrentVersionExportManifest();
      const blob = await createSurveyPlanRevisionSummaryPdfBlob(manifest);
      downloadSurveyBlob(blob, `${createSurveyPlanRevisionPackageBaseName(manifest)}_osszefoglalo.pdf`);
      setVersionExportState("done");
      setVersionExportMessage(`PDF összefoglaló elkészült (${(blob.size / 1024).toFixed(1)} KB).`);
    } catch (error) {
      console.error(error);
      setVersionExportState("error");
      setVersionExportMessage(error instanceof Error ? error.message : "A PDF revíziós összefoglaló nem készült el.");
    }
  }

  async function exportVersionPackageZip() {
    setVersionExportState("working");
    setVersionExportMessage("Revíziós ZIP dokumentumcsomag készítése...");
    try {
      const manifest = createCurrentVersionExportManifest();
      const result = await createSurveyPlanRevisionPackageBlob({ workspace: normalizedWorkspace, manifest });
      downloadSurveyBlob(result.blob, result.fileName);
      setVersionExportState("done");
      setVersionExportMessage(`ZIP csomag elkészült: ${result.includedFiles.length} fájl, ${(result.blob.size / 1024).toFixed(1)} KB.`);
    } catch (error) {
      console.error(error);
      setVersionExportState("error");
      setVersionExportMessage(error instanceof Error ? error.message : "A revíziós ZIP dokumentumcsomag nem készült el.");
    }
  }

  function transferActivePageToEnergyModel(strategy: SurveyPlanTransferConflictStrategy = "block") {
    if (!activePage) return;
    const result = onTransferEnergyModel(activePage, strategy);
    if (!result.canTransfer) {
      setEnergyTransferMessage(`${result.blockingIssueCount} blokkoló hiba miatt az átadás nem indult el. Az esemény bekerült az auditnaplóba.`);
      return;
    }
    setTransferOverwriteConfirmed(false);
    setTransferRemovalOpen(false);
    setEnergyTransferMessage(`Energetikai modell frissítve: ${result.approvedWallCount} fal, ${result.approvedOpeningCount} nyílászáró, ${result.generatedThermalBridgeCount} külön élhőhíd. Állapot: szinkronban.`);
  }

  function acknowledgeActivePageModelChanges() {
    if (!activePage) return;
    onAcknowledgeEnergyModel(activePage);
    setTransferOverwriteConfirmed(false);
    setEnergyTransferMessage("A központi modell kézi módosításai lettek az új elfogadott összehasonlítási alapok. A tervlap nem írta felül őket.");
  }

  function removeActivePageEnergyTransfer() {
    if (!activePage) return;
    const result = onRemoveEnergyTransfer(activePage, { confirmed: transferRemovalConfirmed, force: transferRemovalForceConfirmed });
    if (!result.removed) {
      setEnergyTransferMessage(result.blockedReason || "Az energetikai átadás eltávolítása nem történt meg.");
      return;
    }
    setTransferRemovalOpen(false);
    setTransferRemovalConfirmed(false);
    setTransferRemovalForceConfirmed(false);
    setEnergyTransferMessage(`${result.wallCount} fal, ${result.openingCount} nyílászáró és ${result.thermalBridgeCount} hőhíd eltávolítva. Az automatikus helyiségfalak helyreálltak.`);
  }

  function selectTransferRegistryPage(documentId: string, pageId: string) {
    commit({ ...normalizedWorkspace, activeDocumentId: documentId, activePageId: pageId });
    setTool("select");
    setEnergyTransferMessage("");
  }

  function deleteOpeningSuggestion(openingId: string) {
    if (!activePage) return;
    const nextOpenings = activePage.openingSuggestions.filter((opening) => opening.id !== openingId);
    patchPage({
      openingSuggestions: nextOpenings,
      wallSuggestions: recalculateAllPlanWallAreas(activePage.wallSuggestions, nextOpenings),
    });
    setActiveOpeningId(null);
  }

  function handleSuggestionClick(event: React.MouseEvent<SVGGElement>, suggestion: SurveyPlanSuggestion) {
    event.stopPropagation();
    if (suppressSuggestionClickRef.current) return;
    selectSuggestion(suggestion);
  }

  function handleSuggestionDoubleClick(event: React.MouseEvent<SVGGElement>, suggestion: SurveyPlanSuggestion) {
    event.preventDefault();
    event.stopPropagation();
    if (suppressSuggestionClickRef.current) return;
    toggleSuggestionFocus(suggestion, false);
  }

  function handleViewerWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    changeViewZoom(viewZoomPercent + (event.deltaY < 0 ? 20 : -20));
  }

  useEffect(() => {
    let cancelled = false;
    async function loadAndRender() {
      if (!activeDocument || !activePage || !canvasRef.current) {
        setLoadingState("idle");
        return;
      }
      setLoadingState("loading");
      setMessage("PDF tervlap betöltése...");
      try {
        let loaded = loadedPdfRef.current;
        if (!loaded || loaded.documentId !== activeDocument.id) {
          try { await loaded?.document.destroy?.(); } catch { /* előző PDF felszabadítása opcionális */ }
          const [document, pdfJs] = await Promise.all([loadSharedPdfDocument(activeDocument.dataUrl), loadSharedPdfJs()]);
          loaded = { documentId: activeDocument.id, document, pdfJs };
          loadedPdfRef.current = loaded;
        }
        const page = await loaded.document.getPage(activePage.pageNumber);
        if (cancelled || !canvasRef.current) return;
        const viewport = await renderSharedPdfPage({ page, canvas: canvasRef.current, scale: 1.35, rotation: 0, maximumPixelDimension: 2600 });
        if (cancelled) return;
        setViewportSize({ width: viewport.width, height: viewport.height });
        setLoadingState("ready");
        setMessage(`${activeDocument.fileName} · ${activePage.pageNumber}/${activeDocument.pageCount}. oldal`);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setLoadingState("error");
          setMessage(error instanceof Error ? error.message : "A PDF tervlap betöltése nem sikerült.");
        }
      }
    }
    void loadAndRender();
    return () => { cancelled = true; };
  // A PDF újrarenderelését kizárólag a dokumentum- és oldalazonosító változása indítja.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocument?.id, activeDocument?.dataUrl, activePage?.id, activePage?.pageNumber, effectiveViewMode]);

  useEffect(() => () => {
    try { void loadedPdfRef.current?.document.destroy?.(); } catch { /* felszabadítás opcionális */ }
  }, []);

  useEffect(() => {
    if (!wallEndpointPlacement && tool !== "manualRoom" && tool !== "manualWall" && tool !== "editRoomVertices" && tool !== "splitRoom") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setManualPoints([]);
        setManualWallPoints([]);
        setSplitRoomPoints([]);
        setSplitRoomSuggestionId(null);
        setSelectedVertexIndex(null);
        setWallEndpointPlacement(null);
        setTool("select");
      } else if (tool === "editRoomVertices" && (event.key === "Backspace" || event.key === "Delete") && selectedVertexIndex != null) {
        event.preventDefault();
        deleteSelectedVertex();
      } else if (tool === "manualRoom" && (event.key === "Backspace" || event.key === "Delete") && manualPoints.length) {
        event.preventDefault();
        setManualPoints((current) => current.slice(0, -1));
      } else if (tool === "manualRoom" && event.key === "Enter" && manualPoints.length >= 3) {
        event.preventDefault();
        finishManualRoom();
      } else if (tool === "manualWall" && (event.key === "Backspace" || event.key === "Delete") && manualWallPoints.length) {
        event.preventDefault();
        setManualWallPoints((current) => current.slice(0, -1));
      } else if (tool === "splitRoom" && (event.key === "Backspace" || event.key === "Delete") && splitRoomPoints.length) {
        event.preventDefault();
        setSplitRoomPoints([]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [manualPoints, manualWallPoints, selectedVertexIndex, splitRoomPoints, tool, wallEndpointPlacement]);

  async function uploadPdf(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setLoadingState("error");
      setMessage("Csak PDF tervdokumentáció tölthető fel.");
      return;
    }
    setLoadingState("loading");
    setMessage("PDF ellenőrzése és oldalak előkészítése...");
    try {
      const dataUrl = await fileToDataUrl(file);
      const pdfDocument = await loadSharedPdfDocument(dataUrl);
      const documentId = createId("plan-document");
      const levelId = levels[0]?.id || "level-ground";
      const pages = Array.from({ length: pdfDocument.numPages }, (_, index) => createSurveyPlanPage({
        documentId,
        pageNumber: index + 1,
        levelId,
        sourceMode: normalizedWorkspace.surveySourceMode,
      }));
      const document: SurveyPlanDocument = {
        id: documentId,
        fileName: file.name,
        mimeType: "application/pdf",
        sizeBytes: file.size,
        dataUrl,
        fileFingerprint: pdfDocument.fingerprints?.[0] || `${file.name}:${file.size}:${file.lastModified}`,
        versionGroupId: `plan-version-group-${documentId}`,
        revisionCode: "",
        revisionDate: new Date(file.lastModified || Date.now()).toISOString().slice(0, 10),
        supersedesDocumentId: "",
        isCurrentVersion: true,
        pageCount: pdfDocument.numPages,
        pages,
        uploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await pdfDocument.destroy?.();
      commit({
        ...normalizedWorkspace,
        documents: [...normalizedWorkspace.documents, document],
        activeDocumentId: document.id,
        activePageId: pages[0]?.id || null,
      });
      setTool("select");
      setManualPoints([]);
      setSplitRoomPoints([]);
      setSplitRoomSuggestionId(null);
      setMessage(`${file.name} feltöltve · ${pages.length} oldal.`);
    } catch (error) {
      console.error(error);
      setLoadingState("error");
      setMessage(error instanceof Error ? error.message : "A PDF feltöltése nem sikerült.");
    }
  }

  function selectDocument(documentId: string) {
    const document = normalizedWorkspace.documents.find((item) => item.id === documentId);
    commit({ ...normalizedWorkspace, activeDocumentId: documentId, activePageId: document?.pages[0]?.id || null });
    setTool("select");
    setManualPoints([]);
    setSplitRoomPoints([]);
    setSplitRoomSuggestionId(null);
  }

  function selectPage(pageId: string) {
    commit({ ...normalizedWorkspace, activePageId: pageId });
    setTool("select");
    setManualPoints([]);
    setSplitRoomPoints([]);
    setSplitRoomSuggestionId(null);
  }

  function removeActiveDocument() {
    if (!activeDocument) return;
    const documents = normalizedWorkspace.documents.filter((document) => document.id !== activeDocument.id);
    const comparisons = Object.fromEntries(Object.entries(normalizedWorkspace.versionComparison.comparisons).filter(([, comparison]) => comparison.baseDocumentId !== activeDocument.id && comparison.targetDocumentId !== activeDocument.id));
    const activeComparisonId = normalizedWorkspace.versionComparison.activeComparisonId && comparisons[normalizedWorkspace.versionComparison.activeComparisonId] ? normalizedWorkspace.versionComparison.activeComparisonId : Object.keys(comparisons)[0] || null;
    commit({
      ...normalizedWorkspace,
      documents,
      activeDocumentId: documents[0]?.id || null,
      activePageId: documents[0]?.pages[0]?.id || null,
      versionComparison: { ...normalizedWorkspace.versionComparison, comparisons, activeComparisonId, updatedAt: new Date().toISOString() },
    });
    setActiveVersionPairId(null);
  }

  function captureCanvasDrawingAction(event: React.PointerEvent<HTMLDivElement>) {
    if (!activePage || !stageRef.current) return;
    const handlesDrawingAction = Boolean(wallEndpointPlacement)
      || tool === "manualRoom"
      || tool === "manualWall"
      || tool === "splitRoom";
    if (!handlesDrawingAction) return;
    event.preventDefault();
    event.stopPropagation();
    const rawPoint = normalizePointer(event, stageRef.current);
    const point = invertPageTransform(rawPoint, activePage);

    if (wallEndpointPlacement) {
      const wall = activePage.wallSuggestions.find((candidate) => candidate.id === wallEndpointPlacement.wallId);
      if (wall) {
        const connectedRoom = activePage.suggestions.find((suggestion) => wall.connectedRoomSuggestionIds.includes(suggestion.id)) || null;
        const corrected = recalculateWallGeometry(wall, {
          [wallEndpointPlacement.endpoint]: {
            x: clamp(point.x, activePage.crop.x, activePage.crop.x + activePage.crop.width),
            y: clamp(point.y, activePage.crop.y, activePage.crop.y + activePage.crop.height),
          },
          page: activePage,
          viewportWidth: viewportSize.width,
          viewportHeight: viewportSize.height,
          connectedRoom,
        });
        patchWallSuggestion(wall.id, corrected);
        setActiveWallId(wall.id);
      }
      setWallEndpointPlacement(null);
      return;
    }

    if (tool === "manualRoom") {
      setManualPoints((current) => [...current, point]);
      return;
    }

    if (tool === "manualWall") {
      if (!manualWallPoints.length) setManualWallPoints([point]);
      else {
        const points = [manualWallPoints[0], point];
        setManualWallPoints(points);
        window.setTimeout(() => finishManualWall(points), 0);
      }
      return;
    }

    if (tool === "splitRoom") {
      const splitTarget = activePage.suggestions.find((suggestion) => suggestion.id === (splitRoomSuggestionId || activeSuggestionId) && suggestion.status !== "ignored");
      if (!splitTarget) {
        setGeometryMessage("A kettévágáshoz előbb jelölj ki egy helyiséget.");
        setSplitRoomSuggestionId(null);
        setTool("select");
      } else if (!splitRoomPoints.length) setSplitRoomPoints([point]);
      else {
        const points = [splitRoomPoints[0], point];
        setSplitRoomPoints(points);
        window.setTimeout(() => finishSplitRoom(points), 0);
      }
    }
  }

  function beginCanvasPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (!activePage || !stageRef.current) return;
    const rawPoint = normalizePointer(event, stageRef.current);
    const point = invertPageTransform(rawPoint, activePage);
    if (tool === "manualRoom") {
      event.preventDefault();
      event.stopPropagation();
      setManualPoints((current) => [...current, point]);
      return;
    }
    if (tool === "manualWall") {
      event.preventDefault();
      event.stopPropagation();
      if (!manualWallPoints.length) setManualWallPoints([point]);
      else {
        const points = [manualWallPoints[0], point];
        setManualWallPoints(points);
        window.setTimeout(() => finishManualWall(points), 0);
      }
      return;
    }
    if (tool === "splitRoom") {
      event.preventDefault();
      event.stopPropagation();
      const splitTarget = activePage.suggestions.find((suggestion) => suggestion.id === (splitRoomSuggestionId || activeSuggestionId) && suggestion.status !== "ignored");
      if (!splitTarget) {
        setGeometryMessage("A kettévágáshoz előbb jelölj ki egy helyiséget.");
        setSplitRoomSuggestionId(null);
        setTool("select");
      } else if (!splitRoomPoints.length) setSplitRoomPoints([point]);
      else {
        const points = [splitRoomPoints[0], point];
        setSplitRoomPoints(points);
        window.setTimeout(() => finishSplitRoom(points), 0);
      }
      return;
    }
    if (tool === "crop" || tool === "primaryCalibration" || tool === "verificationCalibration") {
      event.preventDefault();
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer capture opcionális */ }
      setPointerDraft({ start: point, current: point });
      return;
    }
    if (tool === "select" && !activePage.locked) {
      event.preventDefault();
      backgroundDragRef.current = {
        pointerId: event.pointerId,
        start: rawPoint,
        offsetX: activePage.offsetXNormalized,
        offsetY: activePage.offsetYNormalized,
      };
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* opcionális */ }
    }
  }

  function moveCanvasPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (suggestionDragRef.current?.pointerId === event.pointerId) return;
    if (!activePage || !stageRef.current) return;
    const rawPoint = normalizePointer(event, stageRef.current);
    const point = invertPageTransform(rawPoint, activePage);
    if (pointerDraft) {
      event.preventDefault();
      setPointerDraft({ ...pointerDraft, current: point });
      return;
    }
    const drag = backgroundDragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      event.preventDefault();
      patchPage({
        offsetXNormalized: clamp(drag.offsetX + rawPoint.x - drag.start.x, -1, 1),
        offsetYNormalized: clamp(drag.offsetY + rawPoint.y - drag.start.y, -1, 1),
      });
    }
  }

  function endCanvasPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (suggestionDragRef.current?.pointerId === event.pointerId) return;
    if (!activePage || !pointerDraft) {
      backgroundDragRef.current = null;
      return;
    }
    event.preventDefault();
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* opcionális */ }
    const current = pointerDraft;
    setPointerDraft(null);
    if (tool === "crop") {
      const x = Math.min(current.start.x, current.current.x);
      const y = Math.min(current.start.y, current.current.y);
      const width = Math.abs(current.current.x - current.start.x);
      const height = Math.abs(current.current.y - current.start.y);
      if (width >= 0.03 && height >= 0.03) patchPage({ crop: { x, y, width, height } });
      setTool("select");
      return;
    }
    const kind = tool === "primaryCalibration" ? "primary" : "verification";
    const existing = activePage.calibration[kind];
    const calibration = updateCalibrationMeasurement({
      calibration: activePage.calibration,
      kind,
      pointA: current.start,
      pointB: current.current,
      realDistanceMeters: existing.realDistanceMeters,
      viewportWidth: viewportSize.width,
      viewportHeight: viewportSize.height,
    });
    patchPage({ calibration });
    setTool("select");
  }

  function updateCalibrationDistance(kind: "primary" | "verification", realDistanceMeters: number) {
    if (!activePage) return;
    const existing = activePage.calibration[kind];
    const calibration = updateCalibrationMeasurement({
      calibration: activePage.calibration,
      kind,
      pointA: existing.pointA,
      pointB: existing.pointB,
      realDistanceMeters,
      viewportWidth: viewportSize.width,
      viewportHeight: viewportSize.height,
    });
    patchPage({ calibration });
  }

  function finishManualRoom() {
    if (!activePage || manualPoints.length < 3) return;
    const pixelArea = polygonAreaPixels(manualPoints, viewportSize.width, viewportSize.height);
    const pixelsPerMeter = activePage.calibration.primary.pixelsPerMeter;
    const calculatedAreaSquareMeters = pixelsPerMeter > 0 ? pixelArea / (pixelsPerMeter * pixelsPerMeter) : 0;
    const now = new Date().toISOString();
    const suggestion: SurveyPlanSuggestion = {
      id: createId("manual-room"),
      pageId: activePage.id,
      levelId: activePage.levelId,
      name: `Új helyiség ${activePage.suggestions.length + 1}`,
      function: "Helyiség",
      polygon: manualPoints,
      labelPosition: null,
      calculatedAreaSquareMeters,
      labeledAreaSquareMeters: null,
      areaDifferenceSquareMeters: null,
      areaDifferencePercent: null,
      confidence: "manual",
      confidenceScore: 1,
      source: "manualDrawing",
      sourceDetails: "A felhasználó kézzel rajzolta a zárolt PDF-háttér fölé.",
      geometryMethod: "manualPolygon",
      contourClosed: true,
      heated: true,
      roomHeightMeters: 2.7,
      status: "review",
      userModified: true,
      createdAt: now,
      updatedAt: now,
    };
    patchPage({ suggestions: [...activePage.suggestions, suggestion] });
    setActiveSuggestionId(suggestion.id);
    setManualPoints([]);
    setTool("select");
  }

  async function recognizePage() {
    if (!activeDocument || !activePage) return;
    patchPage({ recognitionStatus: "analyzing", recognitionMessage: "A PDF vektor- és szövegrétegének elemzése folyamatban..." });
    setMessage("ALAPRAJZ FELISMERÉSE · elemzés...");
    try {
      let loaded = loadedPdfRef.current;
      if (!loaded || loaded.documentId !== activeDocument.id) {
        const [document, pdfJs] = await Promise.all([loadSharedPdfDocument(activeDocument.dataUrl), loadSharedPdfJs()]);
        loaded = { documentId: activeDocument.id, document, pdfJs };
        loadedPdfRef.current = loaded;
      }
      const pdfPage = await loaded.document.getPage(activePage.pageNumber);
      const analysis = await analyzeSharedPdfPage(loaded.pdfJs, pdfPage);
      const analysisViewport = pdfPage.getViewport({ scale: 1.35, rotation: 0 });
      const suggestions = analysis.contentKind === "raster"
        ? []
        : buildRecognitionSuggestions({ analysis, page: activePage, viewportWidth: analysisViewport.width, viewportHeight: analysisViewport.height });
      patchPage({
        contentKind: analysis.contentKind,
        vectorPathCount: analysis.vectorPathCount,
        rasterImageCount: analysis.rasterImageCount,
        textItemCount: analysis.textItemCount,
        lineSegmentCount: analysis.lineSegmentCount,
        closedContourCount: analysis.closedContourCount,
        openContourCount: analysis.openContourCount,
        stitchedContourCount: analysis.stitchedContourCount,
        parallelWallPairCount: analysis.parallelWallPairCount,
        suggestions: [...activePage.suggestions.filter((suggestion) => suggestion.source === "manualDrawing" || suggestion.status === "approved"), ...suggestions],
        wallSuggestions: activePage.wallSuggestions.filter((wall) => wall.source === "manualDrawing" || wall.status === "approved"),
        wallRecognitionStatus: "idle",
        wallRecognitionMessage: "A helyiséggeometria megváltozott. A külső határolást újra kell felismerni.",
        openingSuggestions: activePage.openingSuggestions.filter((opening) => (opening.source === "manualDrawing" || opening.status === "approved") && activePage.wallSuggestions.some((wall) => wall.id === opening.wallSuggestionId && (wall.source === "manualDrawing" || wall.status === "approved"))),
        openingRecognitionStatus: "idle",
        openingRecognitionMessage: "A helyiség- vagy falgeometria megváltozott. A nyílászáró-javaslatokat újra kell felismerni.",
        recognitionStatus: "ready",
        recognitionMessage: analysis.contentKind === "raster"
          ? "Raszteres PDF felismerve. Az OCR/raszteres geometriafelismerés későbbi fejlesztési szint; kézi poligonrajzolás használható."
          : suggestions.length
            ? `${suggestions.length} helyiségjavaslat készült. ${suggestions.filter((suggestion) => suggestion.geometryMethod === "closedVectorContour").length} javaslat zárt vektorkontúrra épül; minden eredmény jóváhagyás előtt ellenőrzendő.`
            : `A PDF vektoros, de biztosan párosítható helyiségfelirat és zárt kontúr nem található. ${analysis.openContourCount} nyitott útvonal ellenőrzendő; kézi poligonrajzolás használható.`,
      });
      setMessage(`${analysis.contentKind === "vector" ? "Vektoros" : analysis.contentKind === "mixed" ? "Vegyes" : "Raszteres"} PDF · ${suggestions.length} javaslat.`);
    } catch (error) {
      console.error(error);
      patchPage({ recognitionStatus: "error", recognitionMessage: error instanceof Error ? error.message : "A tervlap felismerése sikertelen." });
      setMessage("A tervlap felismerése sikertelen.");
    }
  }

  function approveSuggestion(suggestion: SurveyPlanSuggestion) {
    if (!activePage || suggestion.status === "approved") return;
    const bounds = polygonBounds(suggestion.polygon);
    const area = suggestion.calculatedAreaSquareMeters || suggestion.labeledAreaSquareMeters || 0;
    const planPolygon = suggestion.polygon.map((point) => ({ x: point.x * 900, y: point.y * 610 }));
    const room: SurveyRoom = {
      id: createId("room-plan"),
      levelId: activePage.levelId,
      name: suggestion.name,
      function: suggestion.function,
      area,
      height: suggestion.roomHeightMeters,
      x: bounds.x * 900,
      y: bounds.y * 610,
      width: bounds.width * 900,
      depth: bounds.height * 610,
      polygon: planPolygon,
      heated: suggestion.heated,
      externalWallType: "Tervdokumentáció alapján ellenőrzendő",
      floorType: "Tervdokumentáció alapján ellenőrzendő",
      ceilingType: "Tervdokumentáció alapján ellenőrzendő",
      windowCount: 0,
      windowType: "",
      orientation: "Terv alapján ellenőrzendő",
      note: suggestion.sourceDetails,
      planDataSource: suggestion.userModified ? "userCorrected" : suggestion.source,
      planRecognitionStatus: "approved",
      planConfidence: suggestion.confidence,
      planDocumentId: activePage.documentId,
      planPageId: activePage.id,
      planSuggestionId: suggestion.id,
    };
    onApproveRoom(room, suggestion, activePage);
    patchSuggestion(suggestion.id, { status: "approved", userModified: suggestion.userModified });
  }

  const cropDraft = pointerDraft && tool === "crop" ? {
    x: Math.min(pointerDraft.start.x, pointerDraft.current.x),
    y: Math.min(pointerDraft.start.y, pointerDraft.current.y),
    width: Math.abs(pointerDraft.current.x - pointerDraft.start.x),
    height: Math.abs(pointerDraft.current.y - pointerDraft.start.y),
  } : null;

  const calibrationDraft = pointerDraft && (tool === "primaryCalibration" || tool === "verificationCalibration") ? pointerDraft : null;
  const calibration = activePage?.calibration;

  function renderViewSwitch() {
    const modes: Array<{ id: PlanDocumentViewMode; label: string }> = [
      { id: "plan", label: "Rajz" },
      { id: "data", label: "Adatok" },
      { id: "split", label: "Osztott" },
    ];
    return <div className="inline-grid grid-cols-3 gap-1 rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-1" data-plan-document-view-switch>
      {modes.map((mode) => <button key={mode.id} type="button" data-plan-document-view-mode={mode.id} onClick={() => onViewModeChange(mode.id)} className={`min-h-11 rounded-lg px-3 text-[10px] font-black uppercase ${viewMode === mode.id ? "bg-cyan-700 text-white" : "text-[var(--survey-muted)] hover:bg-[var(--survey-panel)]"}`}>{mode.label}</button>)}
    </div>;
  }

  function renderPlanCanvas() {
    return <section className="flex min-h-[620px] min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-[var(--survey-border)] bg-[var(--survey-panel)]" data-plan-document-canvas>
      <header className="survey-no-print flex flex-col gap-2 border-b border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0"><div className="text-[9px] font-black uppercase tracking-[0.12em] text-cyan-700">Közös DIMPRO PDF-/DocumentViewer motor</div><div className="mt-1 truncate text-sm font-black">{activeDocument?.fileName || "Nincs PDF tervlap"}</div><div className="mt-1 flex items-center gap-2 text-[10px] font-semibold text-[var(--survey-muted)]"><span>{message}</span><span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${loadingState === "error" ? "bg-red-100 text-red-800" : loadingState === "loading" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{loadingState === "loading" ? "Betöltés" : loadingState === "error" ? "Hiba" : loadingState === "ready" ? "Kész" : "Várakozik"}</span></div></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!activePage} onClick={() => setTool("select")} className={tool === "select" ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"}><MousePointer2 size={16} /><span>Kijelölés</span></button>
          <button type="button" disabled={!activePage} onClick={() => setTool("crop")} className={tool === "crop" ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"}><Crop size={16} /><span>Kivágás</span></button>
          <button type="button" disabled={!activePage} onClick={() => setTool("primaryCalibration")} className={tool === "primaryCalibration" ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"}><Ruler size={16} /><span>Lépték</span></button>
          <button type="button" disabled={!activePage} onClick={() => { setTool("manualRoom"); setManualPoints([]); setManualWallPoints([]); }} className={tool === "manualRoom" ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"}><PencilRuler size={16} /><span>Kézi helyiség</span></button>
          <button type="button" data-plan-vertex-tool disabled={!activeSuggestion} onClick={() => { setTool("editRoomVertices"); setSelectedVertexIndex(null); }} className={tool === "editRoomVertices" ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"}><MousePointer2 size={16} /><span>Poligonpontok</span></button>
          <button type="button" data-plan-manual-wall-tool disabled={!activePage} onClick={() => { setTool("manualWall"); setManualWallPoints([]); setManualPoints([]); }} className={tool === "manualWall" ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"}><Ruler size={16} /><span>Kézi fal</span></button>
          {tool === "manualRoom" && manualPoints.length >= 3 ? <button type="button" onClick={finishManualRoom} className="survey-action-primary"><Check size={16} /> Poligon lezárása</button> : null}
          {tool === "manualRoom" && manualPoints.length ? <button type="button" onClick={() => setManualPoints((current) => current.slice(0, -1))} className="survey-tool-button"><X size={16} /><span>Utolsó pont</span></button> : null}
          {tool === "editRoomVertices" && selectedVertexIndex != null && activeSuggestion && activeSuggestion.polygon.length > 3 ? <button type="button" data-plan-delete-vertex onClick={deleteSelectedVertex} className="survey-tool-button"><Trash2 size={16} /><span>Pont törlése</span></button> : null}
          <div className="flex min-h-11 items-stretch overflow-hidden rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel)]" data-plan-viewer-zoom-controls>
            <button type="button" disabled={!activePage || viewZoomPercent <= 50} data-plan-zoom-out onClick={() => changeViewZoom(viewZoomPercent - 20)} className="grid min-w-11 place-items-center border-r border-[var(--survey-border)] hover:bg-cyan-50 disabled:opacity-35" aria-label="Tervlap kicsinyítése"><ZoomOut size={17} /></button>
            <button type="button" disabled={!activePage} data-plan-zoom-reset onClick={resetPlanView} className="min-w-[66px] px-2 text-[10px] font-black hover:bg-cyan-50 disabled:opacity-35" title="Nézet visszaállítása 100%-ra">{viewZoomPercent}%</button>
            <button type="button" disabled={!activePage || viewZoomPercent >= 400} data-plan-zoom-in onClick={() => changeViewZoom(viewZoomPercent + 20)} className="grid min-w-11 place-items-center border-l border-[var(--survey-border)] hover:bg-cyan-50 disabled:opacity-35" aria-label="Tervlap nagyítása"><ZoomIn size={17} /></button>
          </div>
          <button type="button" disabled={!activePage} data-plan-label-toggle onClick={() => setShowAllSuggestionLabels((current) => !current)} className={showAllSuggestionLabels ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"} title="Alapállapotban csak a kijelölt helyiség felirata látszik">{showAllSuggestionLabels ? <EyeOff size={16} /> : <Eye size={16} />}<span>{showAllSuggestionLabels ? "Feliratok elrejtése" : "Minden felirat"}</span></button>
          <button type="button" disabled={!activePage?.wallSuggestions.length} data-plan-wall-toggle onClick={() => setShowWallSuggestions((current) => !current)} className={showWallSuggestions ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"}><Eye size={16} /><span>{showWallSuggestions ? "Falak látszanak" : "Falak elrejtve"}</span></button>
          <button type="button" disabled={!activePage?.openingSuggestions.length} data-plan-opening-toggle onClick={() => setShowOpeningSuggestions((current) => !current)} className={showOpeningSuggestions ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"}><Eye size={16} /><span>{showOpeningSuggestions ? "Nyílászárók látszanak" : "Nyílászárók elrejtve"}</span></button>
          {baselineComparisonPage && activeVersionPair ? <button type="button" data-plan-version-diff-overlay-toggle onClick={() => setShowVersionDiffOverlay((current) => !current)} className={showVersionDiffOverlay ? "survey-tool-button survey-tool-button-active" : "survey-tool-button"}><GitCompareArrows size={16} /><span>{showVersionDiffOverlay ? "Verzió-diff látszik" : "Verzió-diff rejtve"}</span></button> : null}
        </div>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-700/20 p-3 sm:p-5">
        {!activeDocument ? <div className="grid h-full min-h-[560px] place-items-center"><label className="grid max-w-md cursor-pointer place-items-center rounded-[1.75rem] border-2 border-dashed border-cyan-400 bg-white/95 p-8 text-center text-slate-950 shadow-xl"><FileUp size={38} className="text-cyan-700" /><span className="mt-4 text-lg font-black">PDF tervdokumentáció feltöltése</span><span className="mt-2 text-sm font-semibold leading-6 text-slate-600">Többoldalas, vektoros vagy raszteres PDF. Az eredeti fájl változatlan marad; a DIMPRO geometria külön overlay-rétegen készül.</span><input type="file" accept="application/pdf,.pdf" data-plan-document-upload className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPdf(file); event.currentTarget.value = ""; }} /><span className="survey-action-primary mt-5"><FileUp size={17} /> PDF kiválasztása</span></label></div> : <div ref={viewportRef} data-plan-document-viewport onWheel={handleViewerWheel} className="relative h-full min-h-[560px] overflow-auto p-1 sm:p-2">
          <div
            ref={stageRef}
            data-plan-document-stage
            data-plan-view-zoom={viewZoomPercent}
            className={`relative mx-auto shrink-0 overflow-hidden bg-white shadow-2xl ${tool === "manualRoom" || tool === "manualWall" || tool === "splitRoom" || tool === "crop" || tool.includes("Calibration") ? "cursor-crosshair" : activePage?.locked ? "cursor-default" : "cursor-move"}`}
            style={{ aspectRatio: `${viewportSize.width} / ${viewportSize.height}`, width: `min(${viewZoomPercent}%, ${(1180 * viewZoomPercent) / 100}px)`, touchAction: "none" }}
            onPointerDownCapture={captureCanvasDrawingAction}
            onPointerDown={beginCanvasPointer}
            onPointerMove={moveCanvasPointer}
            onPointerUp={endCanvasPointer}
            onPointerCancel={() => { setPointerDraft(null); backgroundDragRef.current = null; suggestionDragRef.current = null; }}
          >
            <div className="absolute inset-0 origin-center" style={{
              transform: `translate(${(activePage?.offsetXNormalized || 0) * 100}%, ${(activePage?.offsetYNormalized || 0) * 100}%) rotate(${(activePage?.rotationDegrees || 0) + (activePage?.fineRotationDegrees || 0)}deg) scale(${(activePage?.scalePercent || 100) / 100})`,
            }}>
              <canvas ref={canvasRef} className="block h-full w-full" style={{ opacity: activePage?.opacity || 0.72 }} />
              <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-label="DIMPRO tervfelismerési overlay">
                <defs><pattern id="planIgnoredHatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="16" stroke="#64748b" strokeWidth="5" /></pattern></defs>
                {activePage ? <>
                  <path d={`M0 0H1000V1000H0Z M${activePage.crop.x * 1000} ${activePage.crop.y * 1000}H${(activePage.crop.x + activePage.crop.width) * 1000}V${(activePage.crop.y + activePage.crop.height) * 1000}H${activePage.crop.x * 1000}Z`} fill="#0f172a" fillOpacity="0.38" fillRule="evenodd" />
                  <rect x={activePage.crop.x * 1000} y={activePage.crop.y * 1000} width={activePage.crop.width * 1000} height={activePage.crop.height * 1000} fill="none" stroke="#06b6d4" strokeWidth="4" strokeDasharray="14 8" vectorEffect="non-scaling-stroke" />
                  {showVersionDiffOverlay && baselineComparisonPage && activeVersionPair ? <g data-plan-version-diff-overlay={activeVersionPair.id} pointerEvents="none">
                    {baselineComparisonPage.suggestions.filter((item) => item.status !== "ignored").map((suggestion) => { const diff = activeDiffByBaseId.get(suggestion.id); if (!diff || diff.changeType === "unchanged") return null; const stroke = diff.changeType === "removed" ? "#dc2626" : "#d97706"; return <polygon key={`base-room-${suggestion.id}`} data-plan-version-diff-base-room={suggestion.id} points={suggestion.polygon.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" ")} fill={stroke} fillOpacity="0.08" stroke={stroke} strokeWidth="5" strokeDasharray="14 8" vectorEffect="non-scaling-stroke" />; })}
                    {baselineComparisonPage.wallSuggestions.filter((item) => item.status !== "ignored").map((wall) => { const diff = activeDiffByBaseId.get(wall.id); if (!diff || diff.changeType === "unchanged") return null; const stroke = diff.changeType === "removed" ? "#dc2626" : "#d97706"; return <line key={`base-wall-${wall.id}`} data-plan-version-diff-base-wall={wall.id} x1={wall.start.x * 1000} y1={wall.start.y * 1000} x2={wall.end.x * 1000} y2={wall.end.y * 1000} stroke={stroke} strokeWidth="7" strokeDasharray="16 8" vectorEffect="non-scaling-stroke" />; })}
                    {baselineComparisonPage.openingSuggestions.filter((item) => item.status !== "ignored").map((opening) => { const diff = activeDiffByBaseId.get(opening.id); if (!diff || diff.changeType === "unchanged") return null; const stroke = diff.changeType === "removed" ? "#dc2626" : "#d97706"; return <g key={`base-opening-${opening.id}`} data-plan-version-diff-base-opening={opening.id}><circle cx={opening.center.x * 1000} cy={opening.center.y * 1000} r="15" fill="#fff" fillOpacity="0.7" stroke={stroke} strokeWidth="5" strokeDasharray="8 5" vectorEffect="non-scaling-stroke" /><line x1={opening.center.x * 1000 - 18} y1={opening.center.y * 1000} x2={opening.center.x * 1000 + 18} y2={opening.center.y * 1000} stroke={stroke} strokeWidth="4" vectorEffect="non-scaling-stroke" /></g>; })}
                    {activePage.suggestions.filter((item) => item.status !== "ignored").map((suggestion) => { const diff = activeDiffByTargetId.get(suggestion.id); if (!diff || diff.changeType === "unchanged") return null; const stroke = diff.changeType === "added" ? "#16a34a" : "#2563eb"; return <polygon key={`target-room-${suggestion.id}`} data-plan-version-diff-target-room={suggestion.id} points={suggestion.polygon.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" ")} fill="none" stroke={stroke} strokeWidth="6" strokeDasharray={diff.changeType === "added" ? "5 4" : "none"} vectorEffect="non-scaling-stroke" />; })}
                    {activePage.wallSuggestions.filter((item) => item.status !== "ignored").map((wall) => { const diff = activeDiffByTargetId.get(wall.id); if (!diff || diff.changeType === "unchanged") return null; const stroke = diff.changeType === "added" ? "#16a34a" : "#2563eb"; return <line key={`target-wall-${wall.id}`} data-plan-version-diff-target-wall={wall.id} x1={wall.start.x * 1000} y1={wall.start.y * 1000} x2={wall.end.x * 1000} y2={wall.end.y * 1000} stroke={stroke} strokeWidth="5" strokeDasharray={diff.changeType === "added" ? "7 4" : "none"} vectorEffect="non-scaling-stroke" />; })}
                    {activePage.openingSuggestions.filter((item) => item.status !== "ignored").map((opening) => { const diff = activeDiffByTargetId.get(opening.id); if (!diff || diff.changeType === "unchanged") return null; const stroke = diff.changeType === "added" ? "#16a34a" : "#2563eb"; return <circle key={`target-opening-${opening.id}`} data-plan-version-diff-target-opening={opening.id} cx={opening.center.x * 1000} cy={opening.center.y * 1000} r="12" fill="#fff" fillOpacity="0.7" stroke={stroke} strokeWidth="5" vectorEffect="non-scaling-stroke" />; })}
                  </g> : null}
                  {activePage.suggestions.map((suggestion) => {
                    const preview = suggestionDragPreview?.suggestionId === suggestion.id ? suggestionDragPreview : null;
                    const renderedSuggestion: SurveyPlanSuggestion = preview ? {
                      ...suggestion,
                      polygon: preview.polygon || suggestion.polygon,
                      labelPosition: preview.labelPosition !== undefined ? preview.labelPosition : suggestion.labelPosition,
                    } : suggestion;
                    const visual = getSuggestionVisual(renderedSuggestion);
                    const points = renderedSuggestion.polygon.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" ");
                    const polygonCenter = suggestionPolygonCenter(renderedSuggestion);
                    const labelPosition = automaticSuggestionLabelPosition(renderedSuggestion, activePage);
                    const selected = activeSuggestionId === suggestion.id;
                    const showLabel = showAllSuggestionLabels || selected;
                    const pageScale = Math.max(0.1, activePage.scalePercent / 100);
                    const labelScale = clamp(100 / Math.max(50, viewZoomPercent) / pageScale, 0.22, 1.15);
                    const hasCallout = Math.hypot(labelPosition.x - polygonCenter.x, labelPosition.y - polygonCenter.y) > 0.018;
                    return <g
                      key={suggestion.id}
                      data-plan-overlay-suggestion={suggestion.id}
                      data-plan-suggestion-zoomed={zoomedSuggestionId === suggestion.id ? "true" : "false"}
                      opacity={suggestion.status === "ignored" ? 0.3 : selected ? 1 : 0.64}
                      style={{ pointerEvents: "auto" }}
                      onClick={(event) => handleSuggestionClick(event, suggestion)}
                      onDoubleClick={(event) => handleSuggestionDoubleClick(event, suggestion)}
                    >
                      <polygon
                        points={points}
                        fill={suggestion.status === "ignored" ? "url(#planIgnoredHatch)" : visual.fill}
                        fillOpacity={selected ? 0.38 : 0.16}
                        stroke={visual.stroke}
                        strokeWidth={selected ? 7 : 2.5}
                        vectorEffect="non-scaling-stroke"
                        style={{ cursor: tool === "select" ? "move" : "pointer" }}
                        onPointerDown={(event) => beginSuggestionDrag(event, suggestion, "polygon")}
                        onLostPointerCapture={(event) => finishSuggestionDrag(event.pointerId)}
                      />
                      {showLabel && hasCallout ? <line x1={polygonCenter.x * 1000} y1={polygonCenter.y * 1000} x2={labelPosition.x * 1000} y2={labelPosition.y * 1000} stroke={visual.stroke} strokeWidth="2.5" strokeDasharray="8 5" vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} data-plan-suggestion-callout={suggestion.id} /> : null}
                      {showLabel ? <g
                        data-plan-suggestion-label={suggestion.id}
                        data-plan-label-scale={labelScale.toFixed(3)}
                        transform={`translate(${labelPosition.x * 1000} ${labelPosition.y * 1000}) scale(${labelScale})`}
                        style={{ pointerEvents: "auto", cursor: tool === "select" ? "move" : "pointer" }}
                        onPointerDown={(event) => beginSuggestionDrag(event, suggestion, "label")}
                        onLostPointerCapture={(event) => finishSuggestionDrag(event.pointerId)}
                      ><rect x="-66" y="-20" width="132" height="40" rx="10" fill="#ffffff" fillOpacity="0.96" stroke={visual.stroke} strokeWidth={selected ? 3 : 2} vectorEffect="non-scaling-stroke" /><text x="0" y="-3" textAnchor="middle" fill="#0f172a" fontSize="14" fontWeight="900">{suggestion.name.slice(0, 20)}</text><text x="0" y="14" textAnchor="middle" fill={visual.stroke} fontSize="11" fontWeight="900">{formatSquareMeters(suggestion.labeledAreaSquareMeters || suggestion.calculatedAreaSquareMeters)}</text></g> : null}
                      {selected && tool === "select" ? <g
                        data-plan-suggestion-move-handle={suggestion.id}
                        transform={`translate(${polygonCenter.x * 1000} ${polygonCenter.y * 1000})`}
                        style={{ pointerEvents: "auto", cursor: "move" }}
                        onPointerDown={(event) => beginSuggestionDrag(event, suggestion, "polygon")}
                        onLostPointerCapture={(event) => finishSuggestionDrag(event.pointerId)}
                      ><circle r="18" fill="#ffffff" fillOpacity="0.98" stroke={visual.stroke} strokeWidth="4" vectorEffect="non-scaling-stroke" /><path d="M-9 0H9M0-9V9M-9 0l4-4M-9 0l4 4M9 0l-4-4M9 0l-4 4M0-9l-4 4M0-9l4 4M0 9l-4-4M0 9l4-4" fill="none" stroke={visual.stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></g> : null}
                      {selected && tool === "editRoomVertices" ? <g data-plan-vertex-editor={suggestion.id}>
                        {renderedSuggestion.polygon.map((point, vertexIndex) => <g key={`vertex-${suggestion.id}-${vertexIndex}`} data-plan-room-vertex={`${suggestion.id}:${vertexIndex}`} transform={`translate(${point.x * 1000} ${point.y * 1000})`} style={{ pointerEvents: "auto", cursor: "move" }} onPointerDown={(event) => { setSelectedVertexIndex(vertexIndex); beginSuggestionDrag(event, suggestion, "vertex", vertexIndex); }}><circle r={selectedVertexIndex === vertexIndex ? 13 : 10} fill="#ffffff" stroke={selectedVertexIndex === vertexIndex ? "#dc2626" : "#0e7490"} strokeWidth="4" vectorEffect="non-scaling-stroke" /><text x="0" y="4" textAnchor="middle" fill="#0f172a" fontSize="10" fontWeight="900">{vertexIndex + 1}</text></g>)}
                        {renderedSuggestion.polygon.map((point, edgeIndex) => { const next = renderedSuggestion.polygon[(edgeIndex + 1) % renderedSuggestion.polygon.length]; const midpoint = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 }; return <g key={`mid-${suggestion.id}-${edgeIndex}`} data-plan-room-edge-midpoint={`${suggestion.id}:${edgeIndex}`} transform={`translate(${midpoint.x * 1000} ${midpoint.y * 1000})`} style={{ pointerEvents: "auto", cursor: "copy" }} onClick={(event) => { event.stopPropagation(); insertSuggestionVertex(suggestion, edgeIndex); }}><circle r="8" fill="#cffafe" stroke="#0891b2" strokeWidth="3" vectorEffect="non-scaling-stroke" /><path d="M-4 0H4M0-4V4" stroke="#155e75" strokeWidth="2" vectorEffect="non-scaling-stroke" /></g>; })}
                      </g> : null}
                    </g>;
                  })}
                  {showWallSuggestions ? activePage.wallSuggestions.map((wall) => {
                    const renderedWall = wallDragPreview?.wallId === wall.id ? wallDragPreview.wall : wall;
                    const selected = activeWallId === wall.id;
                    const midpoint = wallMidpoint(renderedWall);
                    const wallStroke = renderedWall.status === "approved" ? "#16a34a" : renderedWall.status === "ignored" ? "#64748b" : renderedWall.userModified ? "#2563eb" : "#f97316";
                    return <g key={wall.id} data-plan-wall-suggestion={wall.id} opacity={renderedWall.status === "ignored" ? 0.3 : 1} style={{ pointerEvents: "auto", cursor: "pointer" }} onClick={(event) => { event.stopPropagation(); selectWall(wall); }}>
                      <line x1={renderedWall.start.x * 1000} y1={renderedWall.start.y * 1000} x2={renderedWall.end.x * 1000} y2={renderedWall.end.y * 1000} stroke="#ffffff" strokeWidth={selected ? 13 : 9} vectorEffect="non-scaling-stroke" />
                      <line x1={renderedWall.start.x * 1000} y1={renderedWall.start.y * 1000} x2={renderedWall.end.x * 1000} y2={renderedWall.end.y * 1000} stroke={wallStroke} strokeWidth={selected ? 8 : 5} strokeDasharray={renderedWall.status === "review" ? "12 6" : undefined} vectorEffect="non-scaling-stroke" />
                      {selected ? <><circle data-plan-wall-endpoint={`${wall.id}:start`} cx={renderedWall.start.x * 1000} cy={renderedWall.start.y * 1000} r="12" fill="#fff" stroke={wallStroke} strokeWidth="4" vectorEffect="non-scaling-stroke" style={{ cursor: "move" }} onPointerDown={(event) => beginWallEndpointDrag(event, wall, "start")} onMouseDown={(event) => beginWallEndpointMouseDrag(event, wall, "start")} /><circle data-plan-wall-endpoint={`${wall.id}:end`} cx={renderedWall.end.x * 1000} cy={renderedWall.end.y * 1000} r="12" fill="#fff" stroke={wallStroke} strokeWidth="4" vectorEffect="non-scaling-stroke" style={{ cursor: "move" }} onPointerDown={(event) => beginWallEndpointDrag(event, wall, "end")} onMouseDown={(event) => beginWallEndpointMouseDrag(event, wall, "end")} /><g transform={`translate(${midpoint.x * 1000} ${midpoint.y * 1000 - 18})`} style={{ pointerEvents: "none" }}><rect x="-42" y="-13" width="84" height="26" rx="8" fill="#fff" fillOpacity="0.94" stroke={wallStroke} strokeWidth="2" vectorEffect="non-scaling-stroke" /><text x="0" y="4" textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="900">{renderedWall.orientationLabel} · {renderedWall.lengthMeters > 0 ? `${renderedWall.lengthMeters.toFixed(2)} m` : "–"}</text></g></> : null}
                    </g>;
                  }) : null}
                  {showOpeningSuggestions ? activePage.openingSuggestions.map((opening) => {
                    const wall = activePage.wallSuggestions.find((candidate) => candidate.id === opening.wallSuggestionId);
                    if (!wall) return null;
                    const center = openingCenterOnWall(wall, opening.offsetRatio);
                    const angle = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) * 180 / Math.PI;
                    const halfWidth = wall.lengthMeters > 0 ? clamp(opening.widthMeters / wall.lengthMeters * 500, 10, 72) : 24;
                    const selected = activeOpeningId === opening.id;
                    const openingStroke = opening.status === "approved" ? "#16a34a" : opening.status === "ignored" ? "#64748b" : opening.userModified ? "#2563eb" : "#0891b2";
                    return <g key={opening.id} data-plan-opening-suggestion={opening.id} data-plan-opening-wall={wall.id} transform={`translate(${center.x * 1000} ${center.y * 1000}) rotate(${angle})`} opacity={opening.status === "ignored" ? 0.3 : 1} style={{ pointerEvents: "auto", cursor: "pointer" }} onClick={(event) => { event.stopPropagation(); selectOpening(opening); }}>
                      <line x1={-halfWidth} y1="0" x2={halfWidth} y2="0" stroke="#ffffff" strokeWidth={selected ? 18 : 14} vectorEffect="non-scaling-stroke" />
                      <line x1={-halfWidth} y1="0" x2={halfWidth} y2="0" stroke={openingStroke} strokeWidth={selected ? 11 : 8} strokeDasharray={opening.status === "review" ? "8 4" : undefined} vectorEffect="non-scaling-stroke" />
                      <line x1={-halfWidth} y1="-7" x2={-halfWidth} y2="7" stroke={openingStroke} strokeWidth="3" vectorEffect="non-scaling-stroke" />
                      <line x1={halfWidth} y1="-7" x2={halfWidth} y2="7" stroke={openingStroke} strokeWidth="3" vectorEffect="non-scaling-stroke" />
                      {selected ? <g transform="translate(0 -22)" style={{ pointerEvents: "none" }}><rect x="-52" y="-13" width="104" height="26" rx="8" fill="#fff" fillOpacity="0.96" stroke={openingStroke} strokeWidth="2" vectorEffect="non-scaling-stroke" /><text x="0" y="4" textAnchor="middle" fill="#0f172a" fontSize="11" fontWeight="900">{openingKindLabel(opening.kind)} · {opening.widthMeters.toFixed(2)}×{opening.heightMeters.toFixed(2)} m</text></g> : null}
                    </g>;
                  }) : null}
                  {activePage.calibration.primary.pointA && activePage.calibration.primary.pointB ? <g><line x1={activePage.calibration.primary.pointA.x * 1000} y1={activePage.calibration.primary.pointA.y * 1000} x2={activePage.calibration.primary.pointB.x * 1000} y2={activePage.calibration.primary.pointB.y * 1000} stroke="#7c3aed" strokeWidth="5" vectorEffect="non-scaling-stroke" /><circle cx={activePage.calibration.primary.pointA.x * 1000} cy={activePage.calibration.primary.pointA.y * 1000} r="10" fill="#fff" stroke="#7c3aed" strokeWidth="4" vectorEffect="non-scaling-stroke" /><circle cx={activePage.calibration.primary.pointB.x * 1000} cy={activePage.calibration.primary.pointB.y * 1000} r="10" fill="#fff" stroke="#7c3aed" strokeWidth="4" vectorEffect="non-scaling-stroke" /></g> : null}
                  {activePage.calibration.verification.pointA && activePage.calibration.verification.pointB ? <g><line x1={activePage.calibration.verification.pointA.x * 1000} y1={activePage.calibration.verification.pointA.y * 1000} x2={activePage.calibration.verification.pointB.x * 1000} y2={activePage.calibration.verification.pointB.y * 1000} stroke="#ea580c" strokeWidth="5" strokeDasharray="12 7" vectorEffect="non-scaling-stroke" /></g> : null}
                </> : null}
                {cropDraft ? <rect x={cropDraft.x * 1000} y={cropDraft.y * 1000} width={cropDraft.width * 1000} height={cropDraft.height * 1000} fill="#cffafe" fillOpacity="0.22" stroke="#0891b2" strokeWidth="5" strokeDasharray="12 8" vectorEffect="non-scaling-stroke" /> : null}
                {calibrationDraft ? <line x1={calibrationDraft.start.x * 1000} y1={calibrationDraft.start.y * 1000} x2={calibrationDraft.current.x * 1000} y2={calibrationDraft.current.y * 1000} stroke={tool === "primaryCalibration" ? "#7c3aed" : "#ea580c"} strokeWidth="5" strokeDasharray="10 6" vectorEffect="non-scaling-stroke" /> : null}
                {manualWallPoints.length ? <g><line x1={manualWallPoints[0].x * 1000} y1={manualWallPoints[0].y * 1000} x2={(manualWallPoints[1] || manualWallPoints[0]).x * 1000} y2={(manualWallPoints[1] || manualWallPoints[0]).y * 1000} stroke="#f97316" strokeWidth="6" strokeDasharray="12 6" vectorEffect="non-scaling-stroke" /><circle cx={manualWallPoints[0].x * 1000} cy={manualWallPoints[0].y * 1000} r="10" fill="#fff" stroke="#f97316" strokeWidth="4" vectorEffect="non-scaling-stroke" /></g> : null}
                {splitRoomPoints.length ? <g data-plan-split-line><line x1={splitRoomPoints[0].x * 1000} y1={splitRoomPoints[0].y * 1000} x2={(splitRoomPoints[1] || splitRoomPoints[0]).x * 1000} y2={(splitRoomPoints[1] || splitRoomPoints[0]).y * 1000} stroke="#dc2626" strokeWidth="6" strokeDasharray="10 6" vectorEffect="non-scaling-stroke" /><circle cx={splitRoomPoints[0].x * 1000} cy={splitRoomPoints[0].y * 1000} r="10" fill="#fff" stroke="#dc2626" strokeWidth="4" vectorEffect="non-scaling-stroke" /></g> : null}
                {manualPoints.length ? <g><polyline points={manualPoints.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" ")} fill="#cffafe" fillOpacity={manualPoints.length >= 3 ? 0.2 : 0} stroke="#0891b2" strokeWidth="5" strokeDasharray="11 6" vectorEffect="non-scaling-stroke" />{manualPoints.map((point, index) => <g key={`${point.x}-${point.y}-${index}`}><circle cx={point.x * 1000} cy={point.y * 1000} r="11" fill="#fff" stroke="#0891b2" strokeWidth="4" vectorEffect="non-scaling-stroke" /><text x={point.x * 1000} y={point.y * 1000 + 4} textAnchor="middle" fill="#155e75" fontSize="11" fontWeight="900">{index + 1}</text></g>)}</g> : null}
              </svg>
            </div>
            <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2"><span className="rounded-lg border border-slate-300 bg-white/95 px-2 py-1 text-[10px] font-black text-slate-700">PDF: {activePage?.contentKind === "vector" ? "vektoros" : activePage?.contentKind === "raster" ? "raszteres" : activePage?.contentKind === "mixed" ? "vegyes" : "nem elemzett"}</span><span className={`rounded-lg border px-2 py-1 text-[10px] font-black ${activePage?.locked ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}>{activePage?.locked ? "Zárolt háttér" : "Mozgatható háttér"}</span></div>
            <div className="pointer-events-none absolute right-3 top-3 rounded-lg border border-cyan-300 bg-white/95 px-2 py-1 text-[10px] font-black text-cyan-900">Nézeti nagyítás: {viewZoomPercent}% · Ctrl + görgő · dupla kattintás: fókusz/vissza</div>
            {showVersionDiffOverlay && baselineComparisonPage && activeVersionPair ? <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-wrap justify-center gap-1 rounded-xl border border-slate-300 bg-white/95 px-3 py-2 text-[9px] font-black shadow-lg" data-plan-version-diff-legend><span className="text-red-700">Piros: törölt régi</span><span className="text-amber-700">Narancs: régi módosult</span><span className="text-blue-700">Kék: új módosult</span><span className="text-green-700">Zöld: új elem</span></div> : null}
            {tool === "manualRoom" ? <div className="pointer-events-none absolute left-1/2 top-14 max-w-[88%] -translate-x-1/2 rounded-xl border-2 border-cyan-500 bg-white/95 px-4 py-3 text-center text-xs font-black text-cyan-950 shadow-xl" data-plan-manual-room-instruction>Hiányzó helyiség kézi rajza: kattints körbe a helyiség sarkain. Enter vagy „Poligon lezárása” ment; Backspace visszavon; Esc kilép.</div> : null}
            {tool === "editRoomVertices" ? <div className="pointer-events-none absolute left-1/2 top-14 max-w-[88%] -translate-x-1/2 rounded-xl border-2 border-blue-500 bg-white/95 px-4 py-3 text-center text-xs font-black text-blue-950 shadow-xl" data-plan-vertex-instruction>A számozott pontok húzhatók. A kis „+” kör új töréspontot szúr be. A kijelölt pont a felső gombbal vagy Delete billentyűvel törölhető.</div> : null}
            {tool === "manualWall" ? <div className="pointer-events-none absolute left-1/2 top-14 max-w-[88%] -translate-x-1/2 rounded-xl border-2 border-orange-500 bg-white/95 px-4 py-3 text-center text-xs font-black text-orange-950 shadow-xl" data-plan-manual-wall-instruction>Kézi falszakasz: kattints a kezdőpontra, majd a végpontra. Escape megszakítja.</div> : null}
            {tool === "splitRoom" ? <div className="pointer-events-none absolute left-1/2 top-14 max-w-[88%] -translate-x-1/2 rounded-xl border-2 border-red-500 bg-white/95 px-4 py-3 text-center text-xs font-black text-red-950 shadow-xl" data-plan-split-room-instruction>Helyiség kettévágása: kattints a vágóvonal kezdőpontjára, majd a végpontjára úgy, hogy a vonal teljesen áthaladjon a kijelölt helyiségen. Escape megszakítja.</div> : null}
            {wallEndpointPlacement ? <div className="pointer-events-none absolute left-1/2 top-14 max-w-[88%] -translate-x-1/2 rounded-xl border-2 border-orange-500 bg-white/95 px-4 py-3 text-center text-xs font-black text-orange-950 shadow-xl" data-plan-wall-endpoint-placement-instruction>A kijelölt falszakasz {wallEndpointPlacement.endpoint === "start" ? "kezdő" : "vég"}pontjának új helye: kattints a kívánt pontra a rajzon. Escape megszakítja.</div> : null}
            {activeSuggestion ? <div className="pointer-events-none absolute bottom-3 left-3 max-w-[75%] rounded-xl border-2 border-cyan-500 bg-white/95 px-3 py-2 text-xs font-black text-slate-950 shadow-lg" data-plan-active-suggestion-badge>Kijelölt helyiség: {activeSuggestion.name} · {formatSquareMeters(activeSuggestion.labeledAreaSquareMeters || activeSuggestion.calculatedAreaSquareMeters)}</div> : null}
            {activeWall ? <div className="pointer-events-none absolute bottom-3 right-3 max-w-[75%] rounded-xl border-2 border-orange-500 bg-white/95 px-3 py-2 text-xs font-black text-slate-950 shadow-lg" data-plan-active-wall-badge>Kijelölt fal: {surveyPlanWallBoundaryTypeLabels[activeWall.boundaryType]} · {activeWall.orientationLabel} · {activeWall.lengthMeters > 0 ? `${activeWall.lengthMeters.toFixed(2)} m` : "nincs lépték"}</div> : null}
            {activeOpening ? <div className="pointer-events-none absolute bottom-14 right-3 max-w-[75%] rounded-xl border-2 border-cyan-600 bg-white/95 px-3 py-2 text-xs font-black text-slate-950 shadow-lg" data-plan-active-opening-badge>Kijelölt nyílászáró: {activeOpening.name} · {activeOpening.widthMeters.toFixed(2)} × {activeOpening.heightMeters.toFixed(2)} m</div> : null}
          </div>
        </div>}
      </div>
    </section>;
  }

  function renderDataPanel() {
    return <section className="min-w-0 rounded-[1.5rem] border border-[var(--survey-border)] bg-[var(--survey-panel)] p-3 shadow-sm sm:p-4" data-plan-document-data-panel>
      <div className="flex items-start justify-between gap-3 border-b border-[var(--survey-border)] pb-3"><div><div className="text-[9px] font-black uppercase tracking-[0.13em] text-cyan-700">PDF tervlap adatok és ellenőrzés</div><div className="mt-1 text-lg font-black">Tervdokumentáció előkészítése</div></div><label className="survey-action-primary cursor-pointer"><FileUp size={16} /> PDF feltöltés<input type="file" accept="application/pdf,.pdf" data-plan-document-upload className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPdf(file); event.currentTarget.value = ""; }} /></label></div>

      {!activeDocument || !activePage ? <div className="mt-4 rounded-2xl border border-dashed border-cyan-300 bg-cyan-50 p-6 text-center text-cyan-950"><FileSearch className="mx-auto" size={34} /><div className="mt-3 text-base font-black">Nincs aktív tervlap</div><div className="mt-1 text-xs font-semibold leading-5">Tölts fel egy PDF-et. A fájl tartalma változatlan marad, csak a DIMPRO munkatérben hivatkozunk rá.</div></div> : <div className="mt-4 grid gap-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div><FieldLabel>PDF dokumentum</FieldLabel><select data-plan-document-select className={inputClass} value={activeDocument.id} onChange={(event) => selectDocument(event.target.value)}>{normalizedWorkspace.documents.map((document) => <option key={document.id} value={document.id}>{document.fileName}</option>)}</select></div>
          <div><FieldLabel>Oldal</FieldLabel><select data-plan-page-select className={inputClass} value={activePage.id} onChange={(event) => selectPage(event.target.value)}>{activeDocument.pages.map((page) => <option key={page.id} value={page.id}>{page.pageNumber}. oldal · {surveyPlanTypeLabels[page.planType]}</option>)}</select></div>
          <button type="button" onClick={removeActiveDocument} className="survey-action-danger self-end"><Trash2 size={16} /> PDF törlése</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div><FieldLabel>Tervtípus</FieldLabel><select data-plan-type-select className={inputClass} value={activePage.planType} onChange={(event) => patchPage({ planType: event.target.value as SurveyPlanPage["planType"] })}>{Object.entries(surveyPlanTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div><FieldLabel>Tervverzió</FieldLabel><select data-plan-version-select className={inputClass} value={activePage.planVersion} onChange={(event) => patchPage({ planVersion: event.target.value as SurveyPlanPage["planVersion"] })}>{Object.entries(surveyPlanVersionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div><FieldLabel>Szint hozzárendelése</FieldLabel><select data-plan-level-select className={inputClass} value={activePage.levelId} onChange={(event) => patchPage({ levelId: event.target.value, suggestions: activePage.suggestions.map((suggestion) => ({ ...suggestion, levelId: event.target.value })) })}>{levels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}</select></div>
          <div><FieldLabel>Északi irány (°)</FieldLabel><input type="number" min="-180" max="180" step="1" className={inputClass} value={activePage.northAngle} onChange={(event) => patchPage({ northAngle: clamp(Number(event.target.value) || 0, -180, 180) })} /></div>
        </div>

        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-slate-950" data-plan-document-revision-metadata>
          <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-black"><Link2 size={16} className="text-indigo-700" /> Dokumentum-revízió</div><div className="mt-1 text-[10px] font-semibold leading-5 text-slate-600">A revíziókapcsolat a teljes PDF-dokumentumra vonatkozik, nem csak az aktív oldalra.</div></div><span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase ${activeDocument.isCurrentVersion ? "border-emerald-300 bg-white text-emerald-800" : "border-slate-300 bg-slate-100 text-slate-600"}`}>{activeDocument.isCurrentVersion ? "Aktuális verzió" : "Korábbi verzió"}</span></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><FieldLabel>Revíziókód</FieldLabel><input data-plan-document-revision-code className={inputClass} value={activeDocument.revisionCode} onChange={(event) => patchDocument(activeDocument.id, { revisionCode: event.target.value })} placeholder="pl. R00, R01, V2" /></div>
            <div><FieldLabel>Kiadás dátuma</FieldLabel><input data-plan-document-revision-date type="date" className={inputClass} value={activeDocument.revisionDate} onChange={(event) => patchDocument(activeDocument.id, { revisionDate: event.target.value })} /></div>
            <div><FieldLabel>Verziócsoport</FieldLabel><input data-plan-document-version-group className={inputClass} value={activeDocument.versionGroupId} onChange={(event) => patchDocument(activeDocument.id, { versionGroupId: event.target.value })} /></div>
            <div><FieldLabel>Előző dokumentumverzió</FieldLabel><select data-plan-document-supersedes className={inputClass} value={activeDocument.supersedesDocumentId} onChange={(event) => patchDocument(activeDocument.id, { supersedesDocumentId: event.target.value })}><option value="">Nincs megadva</option>{normalizedWorkspace.documents.filter((document) => document.id !== activeDocument.id).map((document) => <option key={document.id} value={document.id}>{document.fileName}{document.revisionCode ? ` · ${document.revisionCode}` : ""}</option>)}</select></div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3">
          <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-black">Tervlap elhelyezése</div><div className="mt-1 text-[10px] font-semibold leading-5 text-[var(--survey-muted)]">A PDF eredeti tartalma nem változik. A kivágás, forgatás és elhelyezés csak munkatér-paraméter.</div></div><button type="button" onClick={() => patchPage({ locked: !activePage.locked })} className={activePage.locked ? "survey-action-primary" : "survey-action-secondary"}>{activePage.locked ? <Lock size={16} /> : <Unlock size={16} />}{activePage.locked ? "Zárolva" : "Mozgatható"}</button></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><FieldLabel>Forgatás</FieldLabel><select className={inputClass} value={activePage.rotationDegrees} onChange={(event) => patchPage({ rotationDegrees: Number(event.target.value) as SurveyPlanPage["rotationDegrees"] })}><option value={0}>0°</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select></div>
            <div><FieldLabel>Finom szögkorrekció (°)</FieldLabel><input type="number" min="-10" max="10" step="0.1" className={inputClass} value={activePage.fineRotationDegrees} onChange={(event) => patchPage({ fineRotationDegrees: clamp(Number(event.target.value) || 0, -10, 10) })} /></div>
            <div><FieldLabel>Háttér átlátszóság</FieldLabel><input type="range" min="5" max="100" value={Math.round(activePage.opacity * 100)} onChange={(event) => patchPage({ opacity: Number(event.target.value) / 100 })} className="h-11 w-full accent-cyan-700" /></div>
            <div><FieldLabel>Nagyítás / méret (%)</FieldLabel><input type="number" min="10" max="400" step="1" className={inputClass} value={activePage.scalePercent} onChange={(event) => patchPage({ scalePercent: clamp(Number(event.target.value) || 100, 10, 400) })} /></div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setTool("crop")} className="survey-action-secondary"><Crop size={16} /> Tervrész kivágása</button><button type="button" onClick={() => patchPage({ crop: { x: 0, y: 0, width: 1, height: 1 }, offsetXNormalized: 0, offsetYNormalized: 0, scalePercent: 100 })} className="survey-action-secondary"><RotateCw size={16} /> Teljes oldal / alaphelyzet</button></div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[9px] font-black uppercase text-[var(--survey-muted)]"><div className="rounded-lg border border-[var(--survey-border)] bg-[var(--survey-panel)] p-2">Bal {Math.round(activePage.crop.x * 100)}%</div><div className="rounded-lg border border-[var(--survey-border)] bg-[var(--survey-panel)] p-2">Fent {Math.round(activePage.crop.y * 100)}%</div><div className="rounded-lg border border-[var(--survey-border)] bg-[var(--survey-panel)] p-2">Szél. {Math.round(activePage.crop.width * 100)}%</div><div className="rounded-lg border border-[var(--survey-border)] bg-[var(--survey-panel)] p-2">Mag. {Math.round(activePage.crop.height * 100)}%</div></div>
        </div>

        <div className="rounded-2xl border border-violet-300 bg-violet-50 p-3 text-slate-950" data-plan-calibration-panel>
          <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-black">Kétpontos léptékkalibráció</div><div className="mt-1 text-[10px] font-semibold leading-5 text-slate-600">Jelölj ki két ismert pontot, majd add meg a terven szereplő valós távolságot. A második mérés ellenőrzés.</div></div><span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${calibration?.status === "acceptable" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : calibration?.status === "needsCorrection" ? "border-red-300 bg-red-50 text-red-800" : "border-violet-300 bg-white text-violet-800"}`}>{calibration?.status === "acceptable" ? "Elfogadható" : calibration?.status === "needsCorrection" ? "Javítandó" : "Nincs beállítva"}</span></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-violet-200 bg-white p-3"><div className="text-[10px] font-black uppercase text-violet-800">1. Kalibráció</div><button type="button" onClick={() => setTool("primaryCalibration")} className="survey-action-secondary mt-2 w-full"><Ruler size={16} /> Két pont kijelölése</button><div className="mt-2"><FieldLabel>Valós távolság (m)</FieldLabel><input type="number" min="0" step="0.01" className={inputClass} data-plan-calibration-distance="primary" value={calibration?.primary.realDistanceMeters || ""} onChange={(event) => updateCalibrationDistance("primary", Number(event.target.value) || 0)} /></div><div className="mt-2 text-[10px] font-bold text-slate-600">Képpont/méter: <strong>{calibration?.primary.pixelsPerMeter ? calibration.primary.pixelsPerMeter.toFixed(3) : "–"}</strong></div></div>
            <div className="rounded-xl border border-orange-200 bg-white p-3"><div className="text-[10px] font-black uppercase text-orange-800">2. Ellenőrző mérés</div><button type="button" onClick={() => setTool("verificationCalibration")} className="survey-action-secondary mt-2 w-full"><Ruler size={16} /> Ellenőrző pontok</button><div className="mt-2"><FieldLabel>Valós távolság (m)</FieldLabel><input type="number" min="0" step="0.01" className={inputClass} data-plan-calibration-distance="verification" value={calibration?.verification.realDistanceMeters || ""} onChange={(event) => updateCalibrationDistance("verification", Number(event.target.value) || 0)} /></div><div className="mt-2 text-[10px] font-bold text-slate-600">Eltérés: <strong>{calibration ? calibration.verificationDifferenceMeters.toFixed(3).replace(".", ",") : "–"} m</strong> · hiba: <strong>{calibration ? calibration.verificationErrorPercent.toFixed(2).replace(".", ",") : "–"}%</strong></div></div>
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-3 text-slate-950" data-plan-recognition-panel>
          <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-black">Automatikus helyiségfelismerés MVP</div><div className="mt-1 text-[10px] font-semibold leading-5 text-slate-600">Csak külön parancsra indul. Az eredmény ellenőrző javaslati réteg; közvetlenül nem írja felül a DIMPRO modellt.</div></div><span className="rounded-full border border-cyan-300 bg-white px-2.5 py-1 text-[9px] font-black uppercase text-cyan-800">{activePage.contentKind === "vector" ? "Vektoros PDF" : activePage.contentKind === "mixed" ? "Vegyes PDF" : activePage.contentKind === "raster" ? "Raszteres PDF" : "Nem vizsgált"}</span></div>
          <div className="mt-3"><FieldLabel>Felismerési mód</FieldLabel><select className={inputClass} value={activePage.recognitionMode} onChange={(event) => patchPage({ recognitionMode: event.target.value as SurveyPlanPage["recognitionMode"] })}>{Object.entries(surveyPlanRecognitionModeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <button type="button" data-plan-recognize onClick={() => void recognizePage()} disabled={activePage.recognitionStatus === "analyzing"} className="survey-action-primary mt-3 w-full disabled:opacity-50"><ScanLine size={17} /> {activePage.recognitionStatus === "analyzing" ? "Felismerés folyamatban..." : "ALAPRAJZ FELISMERÉSE"}</button>
          <div data-plan-recognition-message className={`mt-3 rounded-xl border p-3 text-xs font-semibold leading-5 ${activePage.recognitionStatus === "error" ? "border-red-300 bg-red-50 text-red-900" : "border-cyan-200 bg-white text-slate-700"}`}>{activePage.recognitionMessage}<div className="mt-2 grid grid-cols-2 gap-1 text-[9px] font-black uppercase text-slate-500 sm:grid-cols-3"><span>Vektorútvonal: {activePage.vectorPathCount}</span><span>Vonalszakasz: {activePage.lineSegmentCount}</span><span>Zárt kontúr: {activePage.closedContourCount}</span><span>Összefűzött: {activePage.stitchedContourCount}</span><span>Párhuzamos falpár: {activePage.parallelWallPairCount}</span><span>Nyitott útvonal: {activePage.openContourCount}</span><span>Raszterkép: {activePage.rasterImageCount}</span><span>Szövegelem: {activePage.textItemCount}</span></div></div>
          <button type="button" data-plan-manual-room-cta onClick={() => { setTool("manualRoom"); setManualPoints([]); onViewModeChange("plan"); }} className="survey-action-secondary mt-3 w-full"><PencilRuler size={16} /> Nem felismert helyiség kézi felvétele</button>
        </div>

        <div className="rounded-2xl border border-orange-300 bg-orange-50 p-3 text-slate-950" data-plan-wall-panel>
          <div className="flex items-start justify-between gap-3">
            <div><div className="text-sm font-black">Külső határoló falak</div><div className="mt-1 text-[10px] font-semibold leading-5 text-slate-600">A helyiségpoligonok külső pereméből készülő faljavaslatok szerkezettípushoz és energetikai zónához kapcsolhatók. A bruttó és nettó felület automatikusan frissül.</div></div>
            <span className="rounded-full border border-orange-300 bg-white px-2.5 py-1 text-[9px] font-black uppercase text-orange-800">{activePage.wallSuggestions.length} falszakasz</span>
          </div>
          <button type="button" data-plan-recognize-walls onClick={recognizeExternalWalls} className="survey-action-primary mt-3 w-full"><ScanLine size={17} /> KÜLSŐ HATÁROLÁS FELISMERÉSE</button>
          <button type="button" data-plan-manual-wall-cta onClick={() => { setTool("manualWall"); setManualWallPoints([]); onViewModeChange("plan"); }} className="survey-action-secondary mt-2 w-full"><Ruler size={16} /> Hiányzó falszakasz kézi rajza</button>
          <div className={`mt-3 rounded-xl border p-3 text-xs font-semibold leading-5 ${activePage.wallRecognitionStatus === "error" ? "border-red-300 bg-red-50 text-red-900" : "border-orange-200 bg-white text-slate-700"}`} data-plan-wall-recognition-message>{activePage.wallRecognitionMessage}</div>
          <div className="mt-3 grid max-h-[540px] gap-2 overflow-y-auto pr-1">
            {activePage.wallSuggestions.length ? activePage.wallSuggestions.map((wall, index) => {
              const selected = activeWallId === wall.id;
              const wallOpeningCount = activePage.openingSuggestions.filter((opening) => opening.wallSuggestionId === wall.id && opening.status !== "ignored").length;
              return <article key={wall.id} data-plan-wall-card={wall.id} className={`rounded-xl border bg-white p-3 ${selected ? "border-orange-500 ring-2 ring-orange-200" : "border-orange-200"}`}>
                <button type="button" className="w-full text-left" onClick={() => selectWall(wall)}>
                  <div className="flex items-start justify-between gap-2"><div><div className="text-sm font-black">Falszakasz {index + 1}</div><div className="mt-1 text-[9px] font-black uppercase text-orange-700">{surveyPlanWallBoundaryTypeLabels[wall.boundaryType]} · {wall.source}</div></div><span className="rounded-lg border border-orange-200 bg-orange-50 px-2 py-1 text-[10px] font-black">{wall.orientationLabel} · {wall.lengthMeters > 0 ? `${wall.lengthMeters.toFixed(2)} m` : "–"}</span></div>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-[9px] font-black text-slate-600"><span>Bruttó {formatSquareMeters(wall.grossAreaSquareMeters)}</span><span>Nyílás {formatSquareMeters(wall.openingAreaSquareMeters)}</span><span>Nettó {formatSquareMeters(wall.netAreaSquareMeters)}</span></div>
                </button>
                {selected ? <div className="mt-3 grid gap-3 border-t border-orange-200 pt-3">
                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-2 text-[10px] font-bold leading-4">A végpontok húzhatók vagy pontos rajzi kattintással áthelyezhetők. A hossz, tájolás és felület automatikusan újraszámolódik.</div>
                  <div className="grid grid-cols-2 gap-2"><button type="button" data-plan-wall-place-start onClick={() => startWallEndpointPlacement(wall, "start")} className="survey-action-secondary"><LocateFixed size={16} /> Kezdőpont helye</button><button type="button" data-plan-wall-place-end onClick={() => startWallEndpointPlacement(wall, "end")} className="survey-action-secondary"><LocateFixed size={16} /> Végpont helye</button></div>
                  <div><FieldLabel>Határolási típus</FieldLabel><select data-plan-wall-boundary-type className={inputClass} value={wall.boundaryType} onChange={(event) => patchWallSuggestion(wall.id, { boundaryType: event.target.value as SurveyPlanWallBoundaryType, source: "userCorrected" })}>{Object.entries(surveyPlanWallBoundaryTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                  <div><FieldLabel>Falszerkezet / rétegrend</FieldLabel><select data-plan-wall-assembly className={inputClass} value={wall.assemblyId} onChange={(event) => patchWallSuggestion(wall.id, { assemblyId: event.target.value, source: "userCorrected" })}><option value="">Nincs hozzárendelve</option>{wallAssemblies.map((assembly) => <option key={assembly.id} value={assembly.id}>{assembly.name}</option>)}</select>{!wallAssemblies.length ? <div className="mt-1 text-[9px] font-bold text-amber-700">Még nincs fal kategóriájú rétegrend az energetikai szerkezetek között.</div> : null}</div>
                  <div className="grid gap-2 sm:grid-cols-2"><div><FieldLabel>Belső oldali zóna / tér</FieldLabel><select data-plan-wall-zone className={inputClass} value={wall.zoneId} onChange={(event) => patchWallSuggestion(wall.id, { zoneId: event.target.value, source: "userCorrected" })}><option value="">Nincs hozzárendelve</option>{zoneOptions.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}</select></div><div><FieldLabel>Másik oldali zóna / tér</FieldLabel><select data-plan-wall-adjacent-zone className={inputClass} value={wall.adjacentZoneId} onChange={(event) => patchWallSuggestion(wall.id, { adjacentZoneId: event.target.value, source: "userCorrected" })}><option value="">Külső környezet / nincs</option>{zoneOptions.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}</select></div></div>
                  <div className="grid grid-cols-2 gap-2"><div><FieldLabel>Falvastagság (m)</FieldLabel><input type="number" min="0.01" step="0.01" className={inputClass} value={wall.thicknessMeters} onChange={(event) => patchWallSuggestion(wall.id, { thicknessMeters: Math.max(0.01, Number(event.target.value) || 0.3), source: "userCorrected" })} /></div><div><FieldLabel>Magasság (m)</FieldLabel><input type="number" min="0.1" step="0.01" className={inputClass} value={wall.heightMeters} onChange={(event) => patchWallSuggestion(wall.id, { heightMeters: Math.max(0.1, Number(event.target.value) || 2.7), source: "userCorrected" })} /></div></div>
                  <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl border border-orange-200 bg-orange-50 p-2"><div className="text-[8px] font-black uppercase text-orange-700">Bruttó fal</div><div data-plan-wall-gross-area className="mt-1 text-sm font-black">{formatSquareMeters(wall.grossAreaSquareMeters)}</div></div><div className="rounded-xl border border-cyan-200 bg-cyan-50 p-2"><div className="text-[8px] font-black uppercase text-cyan-700">Nyílászáró</div><div data-plan-wall-opening-area className="mt-1 text-sm font-black">{formatSquareMeters(wall.openingAreaSquareMeters)}</div></div><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2"><div className="text-[8px] font-black uppercase text-emerald-700">Nettó fal</div><div data-plan-wall-net-area className="mt-1 text-sm font-black">{formatSquareMeters(wall.netAreaSquareMeters)}</div></div></div>
                  <button type="button" data-plan-add-manual-opening onClick={() => addManualOpeningToWall(wall)} className="survey-action-secondary w-full"><PencilRuler size={16} /> Nyílászáró hozzáadása ehhez a falhoz ({wallOpeningCount})</button>
                  <div className="grid grid-cols-2 gap-2"><button type="button" data-plan-wall-approve onClick={() => patchWallSuggestion(wall.id, { status: "approved", source: wall.userModified ? "userCorrected" : wall.source })} className="survey-action-primary"><CheckCircle2 size={16} /> {wall.status === "approved" ? "Jóváhagyva" : "Elfogadás"}</button><button type="button" onClick={() => patchWallSuggestion(wall.id, { status: wall.status === "ignored" ? "review" : "ignored" })} className="survey-action-secondary"><EyeOff size={16} /> {wall.status === "ignored" ? "Visszaállítás" : "Kihagyás"}</button></div>
                  <button type="button" data-plan-wall-delete onClick={() => deleteWallSuggestion(wall.id)} className="survey-action-danger w-full"><Trash2 size={16} /> Falszakasz és kapcsolt nyílászárók törlése</button>
                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-2 text-[10px] font-semibold leading-4 text-slate-600">Kapcsolódó helyiség: {wall.connectedRoomSuggestionIds.map((id) => activePage.suggestions.find((suggestion) => suggestion.id === id)?.name || id).join(", ") || "kézi / nincs megadva"}<br />Rétegrend: <strong>{wallAssemblies.find((assembly) => assembly.id === wall.assemblyId)?.name || "nincs"}</strong><br />Adatforrás: <strong>{wall.source}</strong></div>
                </div> : null}
              </article>;
            }) : <div className="rounded-xl border border-dashed border-orange-300 bg-white p-5 text-center text-xs font-semibold text-slate-600">Még nincs falszakasz-javaslat.</div>}
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-300 bg-cyan-50 p-3 text-slate-950" data-plan-opening-panel>
          <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-black">Nyílászáró-javaslatok és nettó falfelület</div><div className="mt-1 text-[10px] font-semibold leading-5 text-slate-600">A rendszer a falszakaszok közelében lévő kis vektorgeometriákból készít ellenőrzendő javaslatokat. A nyílászárók a falhoz, helyiséghez és energetikai zónához kapcsolódnak.</div></div><span className="rounded-full border border-cyan-300 bg-white px-2.5 py-1 text-[9px] font-black uppercase text-cyan-800">{activePage.openingSuggestions.length} nyílászáró</span></div>
          <button type="button" data-plan-recognize-openings onClick={() => void recognizeOpenings()} disabled={!activePage.wallSuggestions.length || activePage.openingRecognitionStatus === "analyzing"} className="survey-action-primary mt-3 w-full disabled:opacity-40"><ScanLine size={17} /> {activePage.openingRecognitionStatus === "analyzing" ? "NYÍLÁSZÁRÓK ELEMZÉSE..." : "NYÍLÁSZÁRÓ-JAVASLATOK FELISMERÉSE"}</button>
          {activeWall ? <button type="button" data-plan-add-manual-opening-panel onClick={() => addManualOpeningToWall(activeWall)} className="survey-action-secondary mt-2 w-full"><PencilRuler size={16} /> Kézi nyílászáró a kijelölt falhoz</button> : null}
          <div data-plan-opening-recognition-message className={`mt-3 rounded-xl border p-3 text-xs font-semibold leading-5 ${activePage.openingRecognitionStatus === "error" ? "border-red-300 bg-red-50 text-red-900" : "border-cyan-200 bg-white text-slate-700"}`}>{activePage.openingRecognitionMessage}</div>
          <div className="mt-3 grid max-h-[560px] gap-2 overflow-y-auto pr-1">
            {activePage.openingSuggestions.length ? activePage.openingSuggestions.map((opening, index) => {
              const selected = activeOpeningId === opening.id;
              const wall = activePage.wallSuggestions.find((candidate) => candidate.id === opening.wallSuggestionId);
              return <article key={opening.id} data-plan-opening-card={opening.id} className={`rounded-xl border bg-white p-3 ${selected ? "border-cyan-600 ring-2 ring-cyan-200" : "border-cyan-200"}`}>
                <button type="button" className="w-full text-left" onClick={() => selectOpening(opening)}><div className="flex items-start justify-between gap-2"><div><div className="text-sm font-black">{opening.name || `${openingKindLabel(opening.kind)} ${index + 1}`}</div><div className="mt-1 text-[9px] font-black uppercase text-cyan-700">{openingKindLabel(opening.kind)} · {opening.source}</div></div><span className="rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-1 text-[10px] font-black">{opening.widthMeters.toFixed(2)} × {opening.heightMeters.toFixed(2)} m</span></div><div className="mt-2 flex items-center justify-between text-[10px] font-bold text-slate-600"><span>{formatSquareMeters(opening.areaSquareMeters)}</span><span>{wall ? `${wall.orientationLabel} fal · ${Math.round(opening.offsetRatio * 100)}%` : "Fal hiányzik"}</span></div></button>
                {selected ? <div className="mt-3 grid gap-3 border-t border-cyan-200 pt-3">
                  <div><FieldLabel>Megnevezés</FieldLabel><input data-plan-opening-name className={inputClass} value={opening.name} onChange={(event) => patchOpeningSuggestion(opening.id, { name: event.target.value, source: "userCorrected" })} /></div>
                  <div className="grid gap-2 sm:grid-cols-2"><div><FieldLabel>Típus</FieldLabel><select data-plan-opening-kind className={inputClass} value={opening.kind} onChange={(event) => patchOpeningSuggestion(opening.id, { kind: event.target.value as SurveyPlanOpeningKind, source: "userCorrected" })}><option value="window">Ablak</option><option value="door">Ajtó</option><option value="balconyDoor">Erkélyajtó</option><option value="garageDoor">Garázskapu</option><option value="unknown">Egyéb / ismeretlen</option></select></div><div><FieldLabel>Kapcsolt falszakasz</FieldLabel><select data-plan-opening-wall className={inputClass} value={opening.wallSuggestionId} onChange={(event) => patchOpeningSuggestion(opening.id, { wallSuggestionId: event.target.value, source: "userCorrected" })}>{activePage.wallSuggestions.filter((candidate) => candidate.status !== "ignored").map((candidate, wallIndex) => <option key={candidate.id} value={candidate.id}>Fal {wallIndex + 1} · {candidate.orientationLabel}</option>)}</select></div></div>
                  <div className="grid grid-cols-3 gap-2"><div><FieldLabel>Szélesség (m)</FieldLabel><input data-plan-opening-width type="number" min="0.1" step="0.01" className={inputClass} value={opening.widthMeters} onChange={(event) => patchOpeningSuggestion(opening.id, { widthMeters: Math.max(0.1, Number(event.target.value) || 0.1), source: "userCorrected" })} /></div><div><FieldLabel>Magasság (m)</FieldLabel><input data-plan-opening-height type="number" min="0.1" step="0.01" className={inputClass} value={opening.heightMeters} onChange={(event) => patchOpeningSuggestion(opening.id, { heightMeters: Math.max(0.1, Number(event.target.value) || 0.1), source: "userCorrected" })} /></div><div><FieldLabel>Parapet (m)</FieldLabel><input data-plan-opening-sill type="number" min="0" step="0.01" className={inputClass} value={opening.sillHeightMeters} onChange={(event) => patchOpeningSuggestion(opening.id, { sillHeightMeters: Math.max(0, Number(event.target.value) || 0), source: "userCorrected" })} /></div></div>
                  <div><FieldLabel>Hely a falon (%)</FieldLabel><input data-plan-opening-offset type="range" min="2" max="98" step="1" value={Math.round(opening.offsetRatio * 100)} onChange={(event) => patchOpeningSuggestion(opening.id, { offsetRatio: Number(event.target.value) / 100, source: "userCorrected" })} className="h-11 w-full accent-cyan-700" /><div className="text-right text-[10px] font-black text-cyan-800">{Math.round(opening.offsetRatio * 100)}%</div></div>
                  <div><FieldLabel>Energetikai zóna / tér</FieldLabel><select data-plan-opening-zone className={inputClass} value={opening.zoneId} onChange={(event) => patchOpeningSuggestion(opening.id, { zoneId: event.target.value, source: "userCorrected" })}><option value="">Nincs hozzárendelve</option>{zoneOptions.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}</select></div>
                  <div className="grid gap-2 sm:grid-cols-2"><div><FieldLabel>Keret</FieldLabel><input data-plan-opening-frame className={inputClass} value={opening.frame} onChange={(event) => patchOpeningSuggestion(opening.id, { frame: event.target.value, source: "userCorrected" })} placeholder="pl. műanyag, fa, alumínium" /></div><div><FieldLabel>Üvegezés / kitöltés</FieldLabel><input data-plan-opening-glazing className={inputClass} value={opening.glazing} onChange={(event) => patchOpeningSuggestion(opening.id, { glazing: event.target.value, source: "userCorrected" })} placeholder="pl. 3 rétegű üveg" /></div></div>
                  <div><FieldLabel>Nyílászáró-katalógus</FieldLabel><select data-plan-opening-catalog className={inputClass} value={opening.catalogProfileId || "custom"} onChange={(event) => applyOpeningCatalog(opening, event.target.value)}>{getSurveyOpeningCatalogProfilesForKind(opening.kind).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select><div className="mt-1 text-[9px] font-bold text-amber-700">A DIMPRO-minták nem gyártóspecifikusak; végleges számításhoz termékadatlappal ellenőrizendők.</div></div>
                  <div className="grid gap-2 sm:grid-cols-2"><div><FieldLabel>Uw / U-érték (W/m²K)</FieldLabel><input data-plan-opening-uvalue className={inputClass} value={opening.uValueWm2K} onChange={(event) => patchOpeningSuggestion(opening.id, { uValueWm2K: event.target.value, source: "userCorrected" })} placeholder="pl. 1,10" /></div><div><FieldLabel>Napenergia-átbocsátás g</FieldLabel><input data-plan-opening-gvalue className={inputClass} value={opening.solarGValue} onChange={(event) => patchOpeningSuggestion(opening.id, { solarGValue: event.target.value, source: "userCorrected" })} placeholder="0,00–1,00" /></div></div>
                  <div><FieldLabel>U-érték adatforrása</FieldLabel><input data-plan-opening-source-reference className={inputClass} value={opening.sourceReference} onChange={(event) => patchOpeningSuggestion(opening.id, { sourceReference: event.target.value, source: "userCorrected" })} placeholder="Gyártó, típus, teljesítménynyilatkozat / termékadatlap" /></div>
                  <div><FieldLabel>Árnyékolás</FieldLabel><input data-plan-opening-shading className={inputClass} value={opening.shading} onChange={(event) => patchOpeningSuggestion(opening.id, { shading: event.target.value, source: "userCorrected" })} placeholder="Nincs, redőny, külső zsaluzia, árnyékoló" /></div>
                  <div><FieldLabel>Beépítési hőhíd elszámolása</FieldLabel><select data-plan-opening-thermal-bridge-mode className={inputClass} value={opening.thermalBridgeMode} onChange={(event) => patchOpeningSuggestion(opening.id, { thermalBridgeMode: event.target.value as SurveyPlanOpeningThermalBridgeMode, source: "userCorrected" })}><option value="none">Nincs megadva / később</option><option value="installationPerimeter">Teljes beépítési kerület egy Ψ-értékkel</option><option value="separateEdges">Káva + parapet + szemöldök külön hőhídként</option></select></div>
                  {opening.thermalBridgeMode !== "none" ? <div className="grid gap-2 sm:grid-cols-2"><div><FieldLabel>Beépítési / él Ψ (W/mK)</FieldLabel><input data-plan-opening-installation-psi className={inputClass} value={opening.installationPsiWmK} onChange={(event) => patchOpeningSuggestion(opening.id, { installationPsiWmK: event.target.value, source: "userCorrected" })} placeholder="pl. 0,040" /></div><div><FieldLabel>Ψ-érték forrása</FieldLabel><input data-plan-opening-psi-source className={inputClass} value={opening.installationPsiSourceReference} onChange={(event) => patchOpeningSuggestion(opening.id, { installationPsiSourceReference: event.target.value, source: "userCorrected" })} placeholder="Csomóponti számítás / katalógus" /></div></div> : null}
                  <div className="grid grid-cols-2 gap-2"><button type="button" data-plan-opening-approve onClick={() => patchOpeningSuggestion(opening.id, { status: "approved", source: opening.userModified ? "userCorrected" : opening.source })} className="survey-action-primary"><CheckCircle2 size={16} /> {opening.status === "approved" ? "Jóváhagyva" : "Elfogadás"}</button><button type="button" data-plan-opening-ignore onClick={() => patchOpeningSuggestion(opening.id, { status: opening.status === "ignored" ? "review" : "ignored" })} className="survey-action-secondary"><EyeOff size={16} /> {opening.status === "ignored" ? "Visszaállítás" : "Kihagyás"}</button></div>
                  <button type="button" data-plan-opening-delete onClick={() => deleteOpeningSuggestion(opening.id)} className="survey-action-danger w-full"><Trash2 size={16} /> Nyílászáró törlése</button>
                  <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-[10px] font-semibold leading-4 text-slate-600">Terület: <strong>{formatSquareMeters(opening.areaSquareMeters)}</strong><br />Fal nettó felülete: <strong>{formatSquareMeters(wall?.netAreaSquareMeters ?? null)}</strong><br />Adatforrás: <strong>{opening.source}</strong><br />{opening.sourceDetails}</div>
                </div> : null}
              </article>;
            }) : <div className="rounded-xl border border-dashed border-cyan-300 bg-white p-5 text-center text-xs font-semibold text-slate-600">Még nincs nyílászáró-javaslat. Indítsd a felismerést, vagy jelölj ki egy falat és adj hozzá kézi nyílászárót.</div>}
          </div>
        </div>

        <div className="rounded-2xl border border-fuchsia-300 bg-fuchsia-50 p-3 text-slate-950" data-plan-version-comparison>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-sm font-black"><GitCompareArrows size={17} className="text-fuchsia-700" /> Tervverziók összehasonlítása</div><div className="mt-1 text-[10px] font-semibold leading-5 text-slate-600">Oldal- és elempárosítás helyiségekre, falakra és nyílászárókra. Az elfogadás vagy elutasítás elemenként rögzíthető.</div></div>{versionComparisonSummary ? <span data-plan-version-comparison-status={versionComparisonSummary.comparison.status} className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${versionComparisonSummary.comparison.status === "applied" ? "border-emerald-300 bg-white text-emerald-800" : versionComparisonSummary.totals.pendingCount ? "border-amber-300 bg-amber-50 text-amber-900" : "border-fuchsia-300 bg-white text-fuchsia-800"}`}>{versionComparisonSummary.comparison.status === "applied" ? "Alkalmazva" : `${versionComparisonSummary.totals.pendingCount} függőben`}</span> : null}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><FieldLabel>Alap / korábbi dokumentum</FieldLabel><select data-plan-version-base-document className={inputClass} value={comparisonBaseDocumentId} onChange={(event) => setComparisonBaseDocumentId(event.target.value)}><option value="">Válassz dokumentumot</option>{normalizedWorkspace.documents.map((document) => <option key={document.id} value={document.id}>{document.fileName}{document.revisionCode ? ` · ${document.revisionCode}` : ""}</option>)}</select></div>
            <div><FieldLabel>Új / cél dokumentum</FieldLabel><select data-plan-version-target-document className={inputClass} value={comparisonTargetDocumentId} onChange={(event) => setComparisonTargetDocumentId(event.target.value)}><option value="">Válassz dokumentumot</option>{normalizedWorkspace.documents.map((document) => <option key={document.id} value={document.id}>{document.fileName}{document.revisionCode ? ` · ${document.revisionCode}` : ""}</option>)}</select></div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <select data-plan-version-comparison-select className={inputClass} value={normalizedWorkspace.versionComparison.activeComparisonId || ""} onChange={(event) => selectVersionComparison(event.target.value)}><option value="">Nincs mentett összehasonlítás</option>{Object.values(normalizedWorkspace.versionComparison.comparisons).map((comparison) => { const base = normalizedWorkspace.documents.find((document) => document.id === comparison.baseDocumentId); const target = normalizedWorkspace.documents.find((document) => document.id === comparison.targetDocumentId); return <option key={comparison.id} value={comparison.id}>{base?.revisionCode || base?.fileName || "Alap"} → {target?.revisionCode || target?.fileName || "Új"}</option>; })}</select>
            <button type="button" data-plan-version-compare onClick={createOrRefreshVersionComparison} disabled={normalizedWorkspace.documents.length < 2 || !comparisonBaseDocumentId || !comparisonTargetDocumentId || comparisonBaseDocumentId === comparisonTargetDocumentId} className="survey-action-primary disabled:opacity-40"><GitCompareArrows size={16} /> ÖSSZEHASONLÍTÁS</button>
          </div>
          {comparisonMessage ? <div data-plan-version-comparison-message className="mt-3 rounded-xl border border-fuchsia-200 bg-white p-3 text-xs font-bold leading-5 text-fuchsia-950">{comparisonMessage}</div> : null}
          {versionComparisonSummary ? <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-xl border border-fuchsia-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-fuchsia-700">Oldalpár</div><div className="mt-1 text-lg font-black">{versionComparisonSummary.totals.pairedPageCount}</div><div className="text-[8px] font-bold text-slate-500">kimarad: {versionComparisonSummary.totals.unpairedBasePageCount + versionComparisonSummary.totals.unpairedTargetPageCount}</div></div><div className="rounded-xl border border-blue-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-blue-700">Módosított</div><div className="mt-1 text-lg font-black">{versionComparisonSummary.totals.modifiedCount}</div></div><div className="rounded-xl border border-emerald-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-emerald-700">Új / törölt</div><div className="mt-1 text-lg font-black">{versionComparisonSummary.totals.addedCount} / {versionComparisonSummary.totals.removedCount}</div></div><div className="rounded-xl border border-amber-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-amber-700">Döntés</div><div className="mt-1 text-lg font-black">{versionComparisonSummary.totals.acceptedCount} / {versionComparisonSummary.totals.rejectedCount}</div><div className="text-[8px] font-bold text-slate-500">elfogadva / elutasítva</div></div></div>
            <div className="mt-3 rounded-xl border border-fuchsia-200 bg-white p-3" data-plan-version-page-pairs>
              <div className="flex items-center justify-between gap-2"><div className="text-xs font-black">Oldalpárosítás</div><button type="button" data-plan-version-rebuild onClick={refreshActiveVersionComparison} className="survey-action-secondary"><RefreshCcw size={15} /> Újraszámítás</button></div>
              <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto">{versionComparisonSummary.targetDocument.pages.map((targetPage) => { const pair = versionComparisonSummary.comparison.pagePairs.find((item) => item.targetPageId === targetPage.id); return <div key={targetPage.id} data-plan-version-page-pair={targetPage.id} className={`rounded-xl border p-3 ${activeVersionPair?.targetPageId === targetPage.id ? "border-fuchsia-500 bg-fuchsia-50" : "border-slate-200 bg-white"}`}><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><button type="button" onClick={() => pair && selectVersionPair(pair.id)} className="text-left"><div className="text-[9px] font-black uppercase text-fuchsia-700">Új tervlap</div><div className="mt-1 text-xs font-black">{targetPage.pageLabel} · {targetPage.levelId}</div></button><select data-plan-version-base-page={targetPage.id} className={inputClass} value={pair?.basePageId || ""} onChange={(event) => pairTargetPage(targetPage.id, event.target.value)}><option value="">Nincs pár</option>{versionComparisonSummary.baseDocument.pages.map((basePage) => <option key={basePage.id} value={basePage.id}>{basePage.pageLabel} · {basePage.levelId}</option>)}</select><span className={`self-center rounded-lg border px-2 py-1 text-[8px] font-black uppercase ${pair?.method === "manual" ? "border-blue-300 bg-blue-50 text-blue-800" : pair ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-slate-100 text-slate-500"}`}>{pair ? `${pair.method === "manual" ? "Kézi" : "Automatikus"} ${Math.round(pair.confidenceScore * 100)}%` : "Párosítatlan"}</span></div>{pair ? <div className="mt-2 text-[9px] font-bold text-slate-500">{pair.elementDiffs.filter((diff) => diff.changeType === "modified").length} módosított · {pair.elementDiffs.filter((diff) => diff.changeType === "added").length} új · {pair.elementDiffs.filter((diff) => diff.changeType === "removed").length} törölt</div> : null}</div>; })}</div>
              {versionComparisonSummary.comparison.pagePairs.some((pair) => pair.basePageId && !pair.targetPageId) ? <div className="mt-3 border-t border-fuchsia-100 pt-3" data-plan-version-removed-pages><div className="text-[9px] font-black uppercase text-rose-700">Az új dokumentumból hiányzó korábbi tervlapok</div><div className="mt-2 grid gap-2">{versionComparisonSummary.comparison.pagePairs.filter((pair) => pair.basePageId && !pair.targetPageId).map((pair) => { const basePage = versionComparisonSummary.baseDocument.pages.find((page) => page.id === pair.basePageId); return <button key={pair.id} type="button" data-plan-version-removed-page={pair.basePageId} onClick={() => selectVersionPair(pair.id)} className={`rounded-xl border p-3 text-left ${activeVersionPair?.id === pair.id ? "border-rose-500 bg-rose-50 ring-2 ring-rose-200" : "border-rose-200 bg-white"}`}><div className="text-xs font-black">{basePage?.pageLabel || "Korábbi tervlap"} · {basePage?.levelId || "–"}</div><div className="mt-1 text-[9px] font-bold text-rose-700">Teljes oldal töröltként kezelve · {pair.elementDiffs.length} elem</div></button>; })}</div></div> : null}
            </div>
            {activeVersionPair ? <div className="mt-3 rounded-xl border border-fuchsia-200 bg-white p-3" data-plan-version-element-diffs={activeVersionPair.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 text-xs font-black"><ListChecks size={15} /> Aktív oldalpár elemdiffje</div><div className="mt-1 text-[9px] font-semibold text-slate-500">A változatlan elemek automatikusan elfogadottak. A módosított, új és törölt elemekről külön döntés szükséges.</div></div><label className="flex min-h-11 items-center gap-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 text-[9px] font-black"><input data-plan-version-overlay-checkbox type="checkbox" checked={showVersionDiffOverlay} onChange={(event) => setShowVersionDiffOverlay(event.target.checked)} className="h-5 w-5 accent-fuchsia-700" /> Vizuális diff</label></div>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{([['all','Mind'],['changed','Változott'],['pending','Függőben'],['accepted','Elfogadva'],['rejected','Elutasítva']] as Array<[VersionDiffFilter,string]>).map(([value,label]) => <button key={value} type="button" data-plan-version-diff-filter={value} onClick={() => setVersionDiffFilter(value)} className={`min-h-10 rounded-lg border px-2 text-[8px] font-black uppercase ${versionDiffFilter === value ? "border-fuchsia-600 bg-fuchsia-700 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{label}</button>)}</div>
              <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" data-plan-version-accept-all onClick={() => setActivePairDiffDecisions("accepted")} className="survey-action-primary"><CheckCircle2 size={15} /> Minden változás elfogadása</button><button type="button" data-plan-version-reject-all onClick={() => setActivePairDiffDecisions("rejected")} className="survey-action-secondary"><X size={15} /> Minden változás elutasítása</button></div>
              <div className="mt-3 grid max-h-[430px] gap-2 overflow-y-auto pr-1">{activeVersionDiffs.length ? activeVersionDiffs.map((diff) => <article key={diff.id} data-plan-version-element-diff={diff.id} data-plan-version-change-type={diff.changeType} data-plan-version-decision={diff.decision} className={`rounded-xl border p-3 ${diff.changeType === "added" ? "border-emerald-300 bg-emerald-50" : diff.changeType === "removed" ? "border-rose-300 bg-rose-50" : diff.changeType === "modified" ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50"}`}><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-black">{versionDiffElementLabel(diff, baselineComparisonPage, activePage)}</div><div className="mt-1 text-[8px] font-black uppercase text-slate-600">{surveyPlanDiffKindLabels[diff.kind]} · {surveyPlanDiffChangeTypeLabels[diff.changeType]} · párosítás {Math.round(diff.matchScore * 100)}%</div></div><span className={`rounded-lg border px-2 py-1 text-[8px] font-black uppercase ${diff.decision === "accepted" ? "border-emerald-300 bg-white text-emerald-800" : diff.decision === "rejected" ? "border-rose-300 bg-white text-rose-800" : "border-amber-300 bg-white text-amber-800"}`}>{surveyPlanDiffDecisionLabels[diff.decision]}</span></div><div className="mt-2 text-[9px] font-semibold leading-4 text-slate-600">{versionDiffFieldLabels(diff.changedFields) || "nincs tartalmi változás"}</div>{diff.changeType !== "unchanged" ? <div className="mt-3 grid grid-cols-3 gap-2"><button type="button" data-plan-version-diff-pending onClick={() => setVersionDiffDecision(activeVersionPair.id, diff.id, "pending")} className="survey-action-secondary">Függőben</button><button type="button" data-plan-version-diff-accept onClick={() => setVersionDiffDecision(activeVersionPair.id, diff.id, "accepted")} className="survey-action-primary">Elfogadás</button><button type="button" data-plan-version-diff-reject onClick={() => setVersionDiffDecision(activeVersionPair.id, diff.id, "rejected")} className="survey-action-danger">Elutasítás</button></div> : null}</article>) : <div className="rounded-xl border border-dashed border-fuchsia-300 bg-fuchsia-50 p-5 text-center text-xs font-semibold text-slate-600">Ebben a szűrésben nincs elemdiff.</div>}</div>
              <button type="button" data-plan-version-apply-decisions onClick={applyVersionComparisonDecisions} className="survey-action-primary mt-3 w-full"><ListChecks size={16} /> DÖNTÉSEK ALKALMAZÁSA AZ ÚJ TERVVERZIÓRA</button>
            </div> : null}
          </> : <div className="mt-3 rounded-xl border border-dashed border-fuchsia-300 bg-white p-5 text-center text-xs font-semibold text-slate-600">Legalább két PDF-dokumentum feltöltése után válaszd ki a korábbi és az új tervverziót.</div>}
        </div>

        <div className="rounded-2xl border border-indigo-300 bg-indigo-50 p-3 text-slate-950" data-plan-version-model-application>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-sm font-black"><GitBranch size={17} className="text-indigo-700" /> Elfogadott tervváltozások átvezetése</div><div className="mt-1 text-[10px] font-semibold leading-5 text-slate-600">Az alkalmazott tervverzió-döntések részlegesen frissítik a központi helyiség-, fal-, nyílászáró- és hőhídmodellt. A párosított központi azonosítók megmaradnak, törlés előtt külön megerősítés és teljes rollback-pillanatkép készül.</div></div><span data-plan-version-model-status={versionModelApplication?.status || "preview"} className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${versionModelApplication?.status === "applied" ? "border-emerald-300 bg-white text-emerald-800" : versionModelApplication?.status === "rolledBack" ? "border-slate-300 bg-white text-slate-700" : versionModelPreview?.blockingIssueCount ? "border-rose-300 bg-rose-50 text-rose-800" : "border-indigo-300 bg-white text-indigo-800"}`}>{versionModelApplication?.status === "applied" ? "Átvezetve" : versionModelApplication?.status === "rolledBack" ? "Visszaállítva" : versionModelPreview?.blockingIssueCount ? `${versionModelPreview.blockingIssueCount} blokkoló hiba` : "Előnézet"}</span></div>
          {versionModelPreview ? <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-xl border border-indigo-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-indigo-700">Helyiség</div><div className="mt-1 text-sm font-black">+{versionModelPreview.counts.roomCreateCount} / ↻{versionModelPreview.counts.roomUpdateCount} / −{versionModelPreview.counts.roomDeleteCount}</div></div><div className="rounded-xl border border-blue-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-blue-700">Fal</div><div className="mt-1 text-sm font-black">+{versionModelPreview.counts.wallCreateCount} / ↻{versionModelPreview.counts.wallUpdateCount} / −{versionModelPreview.counts.wallDeleteCount}</div></div><div className="rounded-xl border border-cyan-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-cyan-700">Nyílászáró</div><div className="mt-1 text-sm font-black">+{versionModelPreview.counts.openingCreateCount} / ↻{versionModelPreview.counts.openingUpdateCount} / −{versionModelPreview.counts.openingDeleteCount}</div></div><div className="rounded-xl border border-emerald-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-emerald-700">Megőrzött központi ID</div><div className="mt-1 text-lg font-black">{versionModelPreview.counts.preservedCentralIdCount}</div><div className="text-[8px] font-bold text-slate-500">hőhíd +{versionModelPreview.counts.thermalBridgeCreateCount}</div></div></div>
            {versionModelPreview.issues.length ? <div className="mt-3 grid max-h-48 gap-1.5 overflow-y-auto">{versionModelPreview.issues.map((issue) => <div key={`${issue.code}-${issue.entityId}`} data-plan-version-model-issue={issue.code} className={`rounded-lg border px-2.5 py-2 text-[10px] font-bold leading-4 ${issue.blocking ? "border-rose-300 bg-rose-50 text-rose-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{issue.message}</div>)}</div> : <div className="mt-3 rounded-xl border border-emerald-200 bg-white p-3 text-xs font-bold text-emerald-900">A döntések és a központi modellkapcsolatok átvezethetők.</div>}
            {versionModelPreview.requiresConfirmation ? <label className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-rose-300 bg-white px-3 text-[10px] font-black text-rose-900"><input data-plan-version-model-confirm type="checkbox" checked={versionModelApplyConfirmed} onChange={(event) => setVersionModelApplyConfirmed(event.target.checked)} className="h-5 w-5 accent-rose-700" /> Megerősítem az elfogadott törlések központi modellből történő eltávolítását</label> : null}
            <button type="button" data-plan-version-model-apply disabled={!versionModelPreview.canApply || (versionModelPreview.requiresConfirmation && !versionModelApplyConfirmed)} onClick={applyActiveVersionToEnergyModel} className="survey-action-primary mt-3 w-full disabled:cursor-not-allowed disabled:opacity-40"><GitBranch size={17} /> ELFOGADOTT VÁLTOZÁSOK ÁTVEZETÉSE</button>
            {selectedVersionModelApplication && (selectedVersionModelApplication.status === "applied" || selectedVersionModelApplication.status === "superseded") && selectedVersionSnapshot ? <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3" data-plan-version-model-rollback-panel><div className="flex items-start gap-2"><History size={17} className="mt-0.5 text-amber-800" /><div><div className="text-xs font-black text-amber-900">Visszaállítási pont elérhető</div><div className="mt-1 text-[10px] font-semibold leading-5 text-amber-800">A teljes központi helyiség-, fal-, nyílászáró-, zóna-, hőhíd- és átadási állapot visszaállítható az átvezetés előtti pillanatra.</div></div></div><label className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-amber-300 bg-white px-3 text-[10px] font-black text-amber-900"><input data-plan-version-model-rollback-confirm type="checkbox" checked={versionModelRollbackConfirmed} onChange={(event) => setVersionModelRollbackConfirmed(event.target.checked)} className="h-5 w-5 accent-amber-700" /> Megerősítem a teljes központi modell visszaállítását</label><button type="button" data-plan-version-model-rollback disabled={!versionModelRollbackConfirmed} onClick={rollbackActiveVersionEnergyModel} className="survey-action-danger mt-2 w-full disabled:opacity-40"><RefreshCcw size={16} /> ÁTVEZETÉS VISSZAÁLLÍTÁSA</button></div> : null}
            {versionModelMessage ? <div data-plan-version-model-message className="mt-3 rounded-xl border border-indigo-200 bg-white p-3 text-xs font-black text-indigo-950">{versionModelMessage}</div> : null}
            <div className="mt-4 border-t border-indigo-200 pt-3"><div className="flex items-center gap-2 text-xs font-black"><History size={15} /> Átvezetési auditnapló</div><div className="mt-2 grid max-h-40 gap-2 overflow-y-auto" data-plan-version-model-audit>{versionModelAuditEntries.length ? versionModelAuditEntries.map((entry) => <div key={entry.id} data-plan-version-model-audit-entry={entry.action} className={`rounded-lg border bg-white p-2 text-[9px] font-semibold leading-4 ${entry.result === "blocked" ? "border-rose-300 text-rose-900" : "border-indigo-200 text-slate-700"}`}><div className="flex items-center justify-between gap-2"><strong>{entry.action}</strong><span>{new Date(entry.createdAt).toLocaleString("hu-HU")}</span></div><div className="mt-1">{entry.message}</div></div>) : <div className="rounded-lg border border-dashed border-indigo-300 bg-white p-3 text-center text-[10px] font-semibold text-slate-500">Még nincs központi modellátvezetési esemény.</div>}</div></div>
          </> : <div className="mt-3 rounded-xl border border-dashed border-indigo-300 bg-white p-4 text-center text-xs font-semibold text-slate-600">Előbb készíts és alkalmazz tervverzió-összehasonlítást.</div>}
        </div>

        <div className="rounded-2xl border border-violet-300 bg-violet-50 p-3 text-slate-950" data-plan-version-graph>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-sm font-black"><GitBranch size={17} className="text-violet-700" /> Tervverzió-gráf és visszaállítási pontok</div><div className="mt-1 text-[10px] font-semibold leading-5 text-slate-600">A dokumentum-revíziók, összehasonlítások és központi modellátvezetések egy időrendi láncban követhetők. A pillanatképek deduplikált tárban vannak, legfeljebb nyolc aktív rollback-ponttal.</div></div><span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${versionGraph.totals.cycleCount || versionGraph.totals.orphanCount ? "border-rose-300 bg-rose-50 text-rose-800" : "border-violet-300 bg-white text-violet-800"}`}>{versionGraph.totals.cycleCount ? `${versionGraph.totals.cycleCount} ciklushiba` : `${versionGraph.totals.documentCount} verzió`}</span></div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-xl border border-violet-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-violet-700">Verziócsoport</div><div className="mt-1 text-lg font-black">{versionGraph.totals.groupCount}</div><div className="text-[8px] font-bold text-slate-500">{versionGraph.totals.edgeCount} kapcsolat</div></div><div className="rounded-xl border border-fuchsia-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-fuchsia-700">Alkalmazás</div><div className="mt-1 text-lg font-black">{versionHistorySummary.applicationCount}</div><div className="text-[8px] font-bold text-slate-500">{versionHistorySummary.rollbackPointCount} rollback-pont</div></div><div className="rounded-xl border border-cyan-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-cyan-700">Snapshot-tár</div><div className="mt-1 text-lg font-black">{(versionHistorySummary.storedSnapshotBytes / 1024).toFixed(1)} KB</div><div className="text-[8px] font-bold text-slate-500">{versionHistorySummary.snapshotCount} egyedi állapot</div></div><div className="rounded-xl border border-emerald-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-emerald-700">Becsült megtakarítás</div><div className="mt-1 text-lg font-black">{(versionHistorySummary.estimatedSavedBytes / 1024).toFixed(1)} KB</div><div className="text-[8px] font-bold text-slate-500">duplikáció nélkül</div></div></div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-violet-200 bg-white p-3" data-plan-version-graph-nodes><div className="text-xs font-black">Dokumentumverziók</div><div className="mt-2 grid max-h-72 gap-2 overflow-y-auto">{versionGraph.nodes.map((node) => <button key={node.documentId} type="button" data-plan-version-graph-node={node.documentId} onClick={() => selectDocument(node.documentId)} className={`rounded-xl border p-3 text-left ${node.documentId === activeDocument?.id ? "border-violet-500 bg-violet-50 ring-2 ring-violet-200" : node.orphaned ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"}`} style={{ marginLeft: `${Math.min(3, node.depth) * 12}px` }}><div className="flex items-start justify-between gap-2"><div><div className="text-xs font-black">{node.revisionCode || node.fileName}</div><div className="mt-1 text-[9px] font-semibold text-slate-500">{node.revisionDate || "dátum nélkül"} · szint {node.depth + 1}</div></div><span className={`rounded-lg border px-2 py-1 text-[8px] font-black uppercase ${node.isCurrentVersion ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{node.isCurrentVersion ? "aktuális" : "előzmény"}</span></div><div className="mt-2 text-[8px] font-bold text-slate-500">előd: {node.parentDocumentIds.length} · utód: {node.childDocumentIds.length} · alkalmazás: {node.applicationIds.length}</div></button>)}</div></div>
            <div className="rounded-xl border border-violet-200 bg-white p-3" data-plan-version-application-history><div className="text-xs font-black">Alkalmazási előzmények</div><div className="mt-2 grid max-h-72 gap-2 overflow-y-auto">{versionModelHistory.length ? versionModelHistory.map((record) => { const base = normalizedWorkspace.documents.find((document) => document.id === record.baseDocumentId); const target = normalizedWorkspace.documents.find((document) => document.id === record.targetDocumentId); const rollbackAvailable = Boolean(record.rollbackSnapshotId && normalizedWorkspace.versionComparison.modelSnapshotStore.snapshots[record.rollbackSnapshotId]); return <button key={record.id} type="button" data-plan-version-application-record={record.id} data-plan-version-application-status={record.status} onClick={() => { setSelectedVersionModelApplicationId(record.id); setVersionModelRollbackConfirmed(false); selectVersionComparison(record.comparisonId); }} className={`rounded-xl border p-3 text-left ${selectedVersionModelApplication?.id === record.id ? "border-violet-500 bg-violet-50 ring-2 ring-violet-200" : "border-slate-200 bg-white"}`}><div className="flex items-start justify-between gap-2"><div><div className="text-xs font-black">#{record.sequenceNumber} · {base?.revisionCode || "Alap"} → {target?.revisionCode || "Cél"}</div><div className="mt-1 text-[9px] font-semibold text-slate-500">{record.appliedAt ? new Date(record.appliedAt).toLocaleString("hu-HU") : "nem alkalmazott"} · {(record.rollbackSnapshotBytes / 1024).toFixed(1)} KB</div></div><span className={`rounded-lg border px-2 py-1 text-[8px] font-black uppercase ${record.status === "applied" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : record.status === "rolledBack" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{record.status}</span></div><div className="mt-2 text-[8px] font-bold text-slate-500">{rollbackAvailable ? "visszaállítható" : "csak audit"} · központi ID: {record.counts.preservedCentralIdCount}</div></button>; }) : <div className="rounded-lg border border-dashed border-violet-300 p-3 text-center text-[10px] font-semibold text-slate-500">Még nincs alkalmazási előzmény.</div>}</div></div>
          </div>
          <div className="mt-3 rounded-xl border border-cyan-300 bg-cyan-50 p-3" data-plan-version-export-panel data-plan-version-publish-ready={versionExportManifest.sharedRevisionEnvelope.publishReady ? "true" : "false"}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-xs font-black"><Archive size={16} className="text-cyan-800" /> Revíziós dokumentumcsomag</div><div className="mt-1 text-[9px] font-semibold leading-5 text-slate-600">Helyi, hordozható ZIP csomag manifesttel, változáslistával, PDF összefoglalóval, ellenőrző lenyomatokkal és deduplikált rollback-snapshotokkal.</div></div><span className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase ${versionExportManifest.sharedRevisionEnvelope.publishReady ? "border-emerald-300 bg-white text-emerald-800" : "border-rose-300 bg-rose-50 text-rose-800"}`}>{versionExportManifest.sharedRevisionEnvelope.publishReady ? "publikálásra előkészítve" : `${versionExportManifest.sharedRevisionEnvelope.blockers.length} blokkoló feltétel`}</span></div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-lg border border-cyan-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-cyan-700">Dokumentum</div><div className="mt-1 text-lg font-black">{versionExportManifest.documents.length}</div></div><div className="rounded-lg border border-fuchsia-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-fuchsia-700">Összehasonlítás</div><div className="mt-1 text-lg font-black">{versionExportManifest.comparisons.length}</div></div><div className="rounded-lg border border-amber-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-amber-700">Változott elem</div><div className="mt-1 text-lg font-black">{versionExportManifest.comparisons.reduce((sum, comparison) => sum + comparison.totals.changedElementCount, 0)}</div></div><div className="rounded-lg border border-violet-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-violet-700">Csomagfájl</div><div className="mt-1 text-lg font-black">{6 + versionExportManifest.snapshots.length}</div></div></div>
            <div className="mt-3 rounded-lg border border-cyan-200 bg-white p-2 text-[9px] font-semibold leading-4 text-slate-600" data-plan-version-export-envelope><div className="font-black text-slate-900">Megosztott revíziós szerződés</div><div className="mt-1 break-all">Revízió: {versionExportManifest.sharedRevisionEnvelope.revisionId}</div><div>Szülő: {versionExportManifest.sharedRevisionEnvelope.parentRevisionId || "nincs"} · zárolás: tartalmi lenyomat eltérésénél elutasítás</div><div>Szerverkapcsolat: <strong>nincs konfigurálva</strong> · helyi export biztonságosan használható</div></div>
            {versionExportManifest.warnings.length ? <div className="mt-3 grid gap-1.5" data-plan-version-export-warnings>{versionExportManifest.warnings.map((warning) => <div key={`${warning.code}-${warning.entityId}`} data-plan-version-export-warning={warning.code} className={`rounded-lg border px-2.5 py-2 text-[9px] font-bold leading-4 ${warning.severity === "error" ? "border-rose-300 bg-rose-50 text-rose-900" : warning.severity === "warning" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-blue-300 bg-blue-50 text-blue-900"}`}>{warning.message}</div>)}</div> : <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-2 text-[9px] font-bold text-emerald-900">A verziógráf exportálható, nincs publikálást blokkoló gráfhiba.</div>}
            <div className="mt-3 grid gap-2 sm:grid-cols-3"><button type="button" data-plan-version-export-package disabled={versionExportState === "working" || !versionExportManifest.documents.length} onClick={() => void exportVersionPackageZip()} className="survey-action-primary disabled:opacity-40"><Archive size={16} /> {versionExportState === "working" ? "Csomag készül..." : "REVÍZIÓCSOMAG ZIP"}</button><button type="button" data-plan-version-export-pdf disabled={versionExportState === "working" || !versionExportManifest.documents.length} onClick={() => void exportVersionSummaryPdf()} className="survey-action-secondary disabled:opacity-40"><Download size={16} /> Összefoglaló PDF</button><button type="button" data-plan-version-export-json disabled={versionExportState === "working" || !versionExportManifest.documents.length} onClick={exportVersionManifestJson} className="survey-action-secondary disabled:opacity-40"><FileJson size={16} /> Manifest JSON</button></div>
            <button type="button" data-plan-version-server-publish-disabled disabled className="survey-action-secondary mt-2 w-full cursor-not-allowed opacity-50" title="A szerveres megosztott revíziókezelés későbbi fejlesztési szint."><ServerCog size={16} /> SZERVERES PUBLIKÁLÁS · ELŐKÉSZÍTVE, MÉG INAKTÍV</button>
            {versionExportMessage ? <div data-plan-version-export-message data-plan-version-export-state={versionExportState} className={`mt-3 rounded-lg border bg-white p-3 text-[10px] font-black ${versionExportState === "error" ? "border-rose-300 text-rose-900" : "border-cyan-200 text-cyan-950"}`}>{versionExportMessage}</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-300 bg-slate-50 p-3 text-slate-950" data-plan-transfer-registry>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-sm font-black"><History size={17} className="text-slate-700" /> Több tervlapos átadási nyilvántartás</div><div className="mt-1 text-[10px] font-semibold leading-5 text-slate-600">Minden dokumentum minden oldala külön forrás- és modell-lenyomatot, állapotot és auditnaplót kap.</div></div><span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${transferRegistrySummary.totals.attentionCount ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>{transferRegistrySummary.totals.attentionCount ? `${transferRegistrySummary.totals.attentionCount} figyelmet kér` : "Nincs konfliktus"}</span></div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-xl border border-slate-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-slate-500">Tervlap</div><div className="mt-1 text-lg font-black">{transferRegistrySummary.totals.pageCount}</div></div><div className="rounded-xl border border-emerald-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-emerald-700">Szinkronban</div><div className="mt-1 text-lg font-black">{transferRegistrySummary.totals.syncedCount}</div></div><div className="rounded-xl border border-amber-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-amber-700">Változott</div><div className="mt-1 text-lg font-black">{transferRegistrySummary.totals.sourceChangedCount + transferRegistrySummary.totals.modelChangedCount}</div></div><div className="rounded-xl border border-rose-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-rose-700">Konfliktus</div><div className="mt-1 text-lg font-black">{transferRegistrySummary.totals.conflictCount}</div></div></div>
          <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1">{transferRegistrySummary.pages.map((pageStatus) => {
            const active = pageStatus.pageId === activePage?.id;
            const attention = pageStatus.state === "sourceChanged" || pageStatus.state === "modelChanged" || pageStatus.state === "conflict" || pageStatus.state === "sourceRemoved" || pageStatus.state === "modelRemoved";
            return <button key={pageStatus.pageId} type="button" data-plan-transfer-page-status={pageStatus.pageId} data-plan-transfer-state={pageStatus.state} onClick={() => selectTransferRegistryPage(pageStatus.documentId, pageStatus.pageId)} className={`rounded-xl border p-3 text-left transition ${active ? "border-cyan-600 bg-cyan-50 ring-2 ring-cyan-200" : attention ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white hover:border-cyan-300"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-xs font-black">{pageStatus.fileName}</div><div className="mt-1 text-[9px] font-bold text-slate-500">{pageStatus.pageLabel} · {pageStatus.levelId}</div></div><span className={`shrink-0 rounded-lg border px-2 py-1 text-[8px] font-black uppercase ${pageStatus.state === "synced" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : pageStatus.state === "conflict" || pageStatus.state === "modelRemoved" ? "border-rose-300 bg-rose-50 text-rose-800" : attention ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{surveyPlanTransferStateLabels[pageStatus.state]}</span></div><div className="mt-2 flex flex-wrap gap-2 text-[9px] font-bold text-slate-600"><span>{pageStatus.source.wallCount} tervfal</span><span>{pageStatus.source.openingCount} tervnyílászáró</span><span>{pageStatus.model.wallCount} központi fal</span>{pageStatus.lastTransferredAt ? <span>{new Date(pageStatus.lastTransferredAt).toLocaleString("hu-HU")}</span> : null}</div></button>;
          })}</div>
        </div>

        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-slate-950" data-plan-energy-transfer-panel>
          <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-black"><Database size={17} className="text-emerald-700" /> Átadás a központi energetikai modellbe</div><div className="mt-1 text-[10px] font-semibold leading-5 text-slate-600">Csak a jóváhagyott elemek kerülnek át. A forrás és a központi modell tartalmi lenyomata megakadályozza a kézi módosítások csendes felülírását.</div></div><span data-plan-active-transfer-state={activeTransferStatus?.state || "notTransferred"} className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${activeTransferStatus?.state === "synced" ? "border-emerald-400 bg-white text-emerald-800" : activeTransferStatus?.requiresConflictResolution ? "border-rose-300 bg-rose-50 text-rose-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{surveyPlanTransferStateLabels[activeTransferStatus?.state || "notTransferred"]}</span></div>
          {activeTransferStatus?.record ? <div className="mt-3 rounded-xl border border-emerald-200 bg-white p-3 text-[10px] font-semibold leading-5 text-slate-600"><strong>Utolsó művelet:</strong> {activeTransferStatus.record.lastAction} · {new Date(activeTransferStatus.record.lastTransferredAt).toLocaleString("hu-HU")}<br /><strong>Utolsó átadás:</strong> {activeTransferStatus.record.wallCount} fal · {activeTransferStatus.record.openingCount} nyílászáró · {activeTransferStatus.record.thermalBridgeCount} hőhíd<br /><strong>Védett központi elem:</strong> {activeTransferStatus.model.lockedElementCount}</div> : null}
          {energyTransferPreview ? <><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-xl border border-emerald-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-emerald-700">Fal</div><div className="mt-1 text-lg font-black">{energyTransferPreview.approvedWallCount}</div><div className="text-[8px] font-bold text-slate-500">+{energyTransferPreview.wallCreateCount} / ↻{energyTransferPreview.wallUpdateCount}</div></div><div className="rounded-xl border border-cyan-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-cyan-700">Nyílászáró</div><div className="mt-1 text-lg font-black">{energyTransferPreview.approvedOpeningCount}</div><div className="text-[8px] font-bold text-slate-500">+{energyTransferPreview.openingCreateCount} / ↻{energyTransferPreview.openingUpdateCount}</div></div><div className="rounded-xl border border-violet-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-violet-700">Hőhíd</div><div className="mt-1 text-lg font-black">{energyTransferPreview.generatedThermalBridgeCount}</div><div className="text-[8px] font-bold text-slate-500">külön élkapcsolat</div></div><div className="rounded-xl border border-amber-200 bg-white p-2 text-center"><div className="text-[8px] font-black uppercase text-amber-700">Figyelmeztetés</div><div className="mt-1 text-lg font-black">{energyTransferPreview.warningCount}</div><div className="text-[8px] font-bold text-slate-500">ellenőrzendő</div></div></div>
          {energyTransferPreview.issues.length ? <div className="mt-3 grid max-h-48 gap-1.5 overflow-y-auto">{energyTransferPreview.issues.map((issue) => <div key={`${issue.code}-${issue.entityId}`} data-plan-transfer-issue={issue.code} className={`rounded-lg border px-2.5 py-2 text-[10px] font-bold leading-4 ${issue.blocking ? "border-rose-300 bg-rose-50 text-rose-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{issue.message}</div>)}</div> : <div className="mt-3 rounded-xl border border-emerald-200 bg-white p-3 text-xs font-bold text-emerald-900">A fal-, zóna-, rétegrend-, Uw-, árnyékolás- és hőhíd-adatok átadhatók.</div>}
          <button type="button" data-plan-transfer-energy-model disabled={!energyTransferPreview.canTransfer} onClick={() => transferActivePageToEnergyModel("block")} className="survey-action-primary mt-3 w-full disabled:cursor-not-allowed disabled:opacity-40"><GitBranch size={17} /> {activeTransferStatus?.record ? "ENERGETIKAI MODELL FRISSÍTÉSE" : "ELSŐ ENERGETIKAI ÁTADÁS"}</button>
          {activeTransferStatus?.requiresConflictResolution ? <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3" data-plan-transfer-conflict-panel><div className="flex items-start gap-2"><ShieldAlert size={18} className="mt-0.5 shrink-0 text-rose-700" /><div><div className="text-xs font-black text-rose-900">Központi modellvédelem aktív</div><div className="mt-1 text-[10px] font-semibold leading-5 text-rose-800">A rendszer nem írja felül automatikusan a kézzel módosított vagy hiányzó központi elemeket.</div></div></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" data-plan-transfer-accept-model onClick={acknowledgeActivePageModelChanges} className="survey-action-secondary"><ShieldCheck size={16} /> Központi módosítás megtartása</button><label className="flex min-h-11 items-center gap-2 rounded-xl border border-rose-300 bg-white px-3 text-[10px] font-black text-rose-900"><input data-plan-transfer-overwrite-confirm type="checkbox" checked={transferOverwriteConfirmed} onChange={(event) => setTransferOverwriteConfirmed(event.target.checked)} className="h-5 w-5 accent-rose-700" /> Tudomásul veszem a felülírást</label></div><button type="button" data-plan-transfer-overwrite disabled={!transferOverwriteConfirmed} onClick={() => transferActivePageToEnergyModel("overwrite")} className="survey-action-danger mt-2 w-full disabled:opacity-40"><RefreshCcw size={16} /> TERVVEL FELÜLÍRÁS ÉS ÚJRASZINKRONIZÁLÁS</button></div> : null}
          {energyTransferMessage ? <div data-plan-energy-transfer-message className="mt-3 rounded-xl border border-emerald-300 bg-white p-3 text-xs font-black text-emerald-900">{energyTransferMessage}</div> : null}</> : null}

          {removalPreview?.canRemove ? <div className="mt-4 border-t border-emerald-200 pt-3"><button type="button" data-plan-transfer-remove-toggle onClick={() => setTransferRemovalOpen((current) => !current)} className="survey-action-secondary w-full"><Trash2 size={16} /> {transferRemovalOpen ? "Eltávolítás bezárása" : "Tervlap átadásának eltávolítása"}</button>{transferRemovalOpen ? <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3" data-plan-transfer-removal-panel><div className="text-xs font-black text-rose-900">Eltávolítási előnézet</div><div className="mt-1 text-[10px] font-semibold leading-5 text-rose-800">{removalPreview.wallCount} fal, {removalPreview.openingCount} nyílászáró és {removalPreview.thermalBridgeCount} hőhíd törlődik a központi modellből. A tervlapi javaslatok megmaradnak, az automatikus helyiségfalak helyreállnak.</div><label className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-rose-300 bg-white px-3 text-[10px] font-black text-rose-900"><input data-plan-transfer-remove-confirm type="checkbox" checked={transferRemovalConfirmed} onChange={(event) => setTransferRemovalConfirmed(event.target.checked)} className="h-5 w-5 accent-rose-700" /> Megerősítem az átadott elemek eltávolítását</label>{removalPreview.requiresForce ? <label className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-rose-400 bg-white px-3 text-[10px] font-black text-rose-900"><input data-plan-transfer-remove-force-confirm type="checkbox" checked={transferRemovalForceConfirmed} onChange={(event) => setTransferRemovalForceConfirmed(event.target.checked)} className="h-5 w-5 accent-rose-700" /> A kézi központi módosítások törlését is megerősítem</label> : null}<button type="button" data-plan-transfer-remove disabled={!transferRemovalConfirmed || (removalPreview.requiresForce && !transferRemovalForceConfirmed)} onClick={removeActivePageEnergyTransfer} className="survey-action-danger mt-3 w-full disabled:opacity-40"><Trash2 size={16} /> ÁTADÁS ELTÁVOLÍTÁSA</button></div> : null}</div> : null}

          <div className="mt-4 border-t border-emerald-200 pt-3"><div className="flex items-center gap-2 text-xs font-black"><History size={15} /> Aktív tervlap auditnaplója</div><div className="mt-2 grid max-h-48 gap-2 overflow-y-auto" data-plan-transfer-audit-log>{activeTransferAuditEntries.length ? activeTransferAuditEntries.map((entry) => <div key={entry.id} data-plan-transfer-audit-entry={entry.action} className={`rounded-lg border bg-white p-2 text-[9px] font-semibold leading-4 ${entry.result === "blocked" ? "border-rose-300 text-rose-900" : "border-emerald-200 text-slate-700"}`}><div className="flex items-center justify-between gap-2"><strong>{entry.action}</strong><span>{new Date(entry.createdAt).toLocaleString("hu-HU")}</span></div><div className="mt-1">{entry.message}</div><div className="mt-1 text-slate-500">{entry.stateBefore} → {entry.stateAfter} · {entry.wallCount} fal · {entry.openingCount} nyílászáró</div></div>) : <div className="rounded-lg border border-dashed border-emerald-300 bg-white p-3 text-center text-[10px] font-semibold text-slate-500">Még nincs átadási esemény ezen a tervlapon.</div>}</div></div>
        </div>

        <div className="rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-3">
          <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-black">Jóváhagyási lista</div><div className="mt-1 text-[10px] font-semibold text-[var(--survey-muted)]">{activePage.suggestions.length} javaslat · {activePage.suggestions.filter((item) => item.status === "approved").length} jóváhagyva · egy kattintás: kijelölés · dupla kattintás: nagyítás/vissza</div></div><button type="button" onClick={() => { setTool("manualRoom"); setManualPoints([]); onViewModeChange("plan"); }} className="survey-action-secondary"><PencilRuler size={16} /> Hiányzó helyiség kézi rajza</button></div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" data-plan-suggestion-filters>
            {([['all', 'Mind'], ['review', 'Ellenőrzendő'], ['approved', 'Jóváhagyott'], ['ignored', 'Kihagyott']] as Array<[SuggestionFilter, string]>).map(([value, label]) => <button key={value} type="button" data-plan-suggestion-filter={value} onClick={() => setSuggestionFilter(value)} className={`min-h-11 rounded-xl border px-2 text-[9px] font-black uppercase ${suggestionFilter === value ? "border-cyan-600 bg-cyan-700 text-white" : "border-[var(--survey-border)] bg-[var(--survey-panel)] text-[var(--survey-muted)] hover:border-cyan-400"}`}>{label}<span className="ml-1 opacity-75">{value === 'all' ? activePage.suggestions.length : activePage.suggestions.filter((item) => item.status === value).length}</span></button>)}
          </div>
          <div className="mt-3 grid max-h-[520px] gap-2 overflow-y-auto pr-1">
            {filteredSuggestions.length ? filteredSuggestions.map((suggestion) => {
              const visual = getSuggestionVisual(suggestion);
              const selected = activeSuggestionId === suggestion.id;
              return <article key={suggestion.id} className={`rounded-xl border bg-[var(--survey-panel)] p-3 ${selected ? "border-cyan-500 ring-2 ring-cyan-200" : "border-[var(--survey-border)]"}`} data-plan-suggestion={suggestion.id}>
                <button type="button" onClick={() => selectSuggestion(suggestion)} onDoubleClick={() => toggleSuggestionFocus(suggestion)} className="w-full text-left" title="Egy kattintás: kijelölés. Dupla kattintás: nagyítás vagy visszaállítás."><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-black">{suggestion.name}</div><div className="mt-1 text-[9px] font-black uppercase" style={{ color: visual.stroke }}>{visual.label} · {suggestion.source}</div></div><span className="rounded-lg border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-2 py-1 text-[10px] font-black">{Math.round(suggestion.confidenceScore * 100)}%</span></div><div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-bold text-[var(--survey-muted)]"><span>Számított: {formatSquareMeters(suggestion.calculatedAreaSquareMeters)}</span><span>Tervfelirat: {formatSquareMeters(suggestion.labeledAreaSquareMeters)}</span><span>Eltérés: {formatSquareMeters(suggestion.areaDifferenceSquareMeters)}</span><span>Kontúr: {suggestion.contourClosed ? "zárt" : "nyitott"}</span></div></button>
                {selected ? <div className="mt-3 grid gap-2 border-t border-[var(--survey-border)] pt-3"><button type="button" data-plan-focus-suggestion onClick={() => toggleSuggestionFocus(suggestion)} className="survey-action-secondary w-full"><LocateFixed size={16} /> {zoomedSuggestionId === suggestion.id ? "Nézet visszaállítása" : "Rajzon mutat és nagyít"}</button><div className="rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-[10px] font-bold leading-4 text-cyan-950">A rajzon a helyiség kontúrja húzással mozgatható. A fehér felirat külön húzható, így kis helyiséget sem takar el.</div><button type="button" data-plan-edit-vertices onClick={() => { setTool(tool === "editRoomVertices" ? "select" : "editRoomVertices"); setSelectedVertexIndex(null); onViewModeChange("plan"); }} className={tool === "editRoomVertices" ? "survey-action-primary w-full" : "survey-action-secondary w-full"}><MousePointer2 size={16} /> {tool === "editRoomVertices" ? "Poligonpont-szerkesztés befejezése" : "Poligonpontok egyenkénti javítása"}</button><div className="grid grid-cols-2 gap-2"><button type="button" data-plan-split-room onClick={() => { setActiveSuggestionId(suggestion.id); setSplitRoomSuggestionId(suggestion.id); setTool("splitRoom"); setSplitRoomPoints([]); setGeometryMessage(""); onViewModeChange("plan"); }} className="survey-action-secondary"><Crop size={16} /> Helyiség kettévágása</button><button type="button" data-plan-merge-room disabled={!mergeTargetSuggestionId} onClick={() => mergeSelectedRoom(suggestion.id)} className="survey-action-secondary disabled:opacity-40"><Check size={16} /> Helyiségek összevonása</button></div><div><FieldLabel>Összevonandó másik helyiség</FieldLabel><select data-plan-merge-target className={inputClass} value={mergeTargetSuggestionId} onChange={(event) => setMergeTargetSuggestionId(event.target.value)}><option value="">Válassz helyiséget…</option>{activePage.suggestions.filter((candidate) => candidate.id !== suggestion.id && candidate.status !== "ignored" && candidate.levelId === suggestion.levelId).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></div>{geometryMessage ? <div data-plan-geometry-message className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-[10px] font-bold leading-4 text-blue-950">{geometryMessage}</div> : null}<input className={inputClass} value={suggestion.name} onChange={(event) => patchSuggestion(suggestion.id, { name: event.target.value, source: "userCorrected" })} aria-label="Helyiségnév módosítása" /><div className="grid grid-cols-2 gap-2"><input className={inputClass} value={suggestion.function} onChange={(event) => patchSuggestion(suggestion.id, { function: event.target.value, source: "userCorrected" })} aria-label="Helyiségfunkció" /><input type="number" min="0.1" step="0.01" className={inputClass} value={suggestion.roomHeightMeters} onChange={(event) => patchSuggestion(suggestion.id, { roomHeightMeters: Math.max(0.1, Number(event.target.value) || 2.7), source: "userCorrected" })} aria-label="Belmagasság" /></div><label className="flex min-h-11 items-center justify-between rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] px-3 text-xs font-black"><span>Fűtött helyiség</span><input type="checkbox" checked={suggestion.heated} onChange={(event) => patchSuggestion(suggestion.id, { heated: event.target.checked, source: "userCorrected" })} className="h-5 w-5 accent-cyan-700" /></label><div className="grid grid-cols-2 gap-2"><button type="button" disabled={suggestion.status === "approved"} data-plan-suggestion-approve onClick={() => approveSuggestion(suggestion)} className="survey-action-primary disabled:opacity-40"><CheckCircle2 size={16} /> {suggestion.status === "approved" ? "Jóváhagyva" : "Elfogadás"}</button><button type="button" onClick={() => patchSuggestion(suggestion.id, { status: suggestion.status === "ignored" ? "review" : "ignored", userModified: suggestion.userModified })} className="survey-action-secondary"><Trash2 size={16} /> {suggestion.status === "ignored" ? "Visszaállítás" : "Figyelmen kívül"}</button></div><div className="rounded-lg border border-[var(--survey-border)] bg-[var(--survey-panel-strong)] p-2 text-[10px] font-semibold leading-4 text-[var(--survey-muted)]">Adatforrás: <strong>{suggestion.source}</strong><br />{suggestion.sourceDetails}</div></div> : null}
              </article>;
            }) : <div className="rounded-xl border border-dashed border-[var(--survey-border)] p-5 text-center text-xs font-semibold text-[var(--survey-muted)]">Ebben a szűrésben nincs helyiségjavaslat.</div>}
          </div>
        </div>
      </div>}
    </section>;
  }

  return <div className="grid min-w-0 gap-4" data-plan-document-workspace data-plan-document-view={viewMode}>
    <header className="survey-no-print flex flex-col gap-3 rounded-2xl border border-[var(--survey-border)] bg-[var(--survey-panel)] p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><div className="text-[9px] font-black uppercase tracking-[0.13em] text-cyan-700">v0.8.4.4.7 · Revíziócsomag és megosztási előkészítés</div><div className="mt-1 text-lg font-black">Tervdokumentáció-alapú munkatér</div><div className="mt-1 text-[10px] font-semibold text-[var(--survey-muted)]">Rajz / Adatok / Osztott nézet · zárolt PDF-háttér · külön DIMPRO overlay</div></div>{renderViewSwitch()}</header>
    {effectiveViewMode === "plan" ? renderPlanCanvas() : null}
    {effectiveViewMode === "data" ? renderDataPanel() : null}
    {effectiveViewMode === "split" ? <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1.08fr)_minmax(500px,.92fr)]" data-plan-document-split><div className="min-w-0">{renderPlanCanvas()}</div><div className="min-w-0 2xl:max-h-[820px] 2xl:overflow-y-auto">{renderDataPanel()}</div></div> : null}
    {isPortraitTablet && viewMode === "split" ? <div className="survey-no-print rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-900"><AlertTriangle size={15} className="mr-2 inline" />Tablet álló nézetben az osztott mód helyett a Rajz nézet jelenik meg. Az Adatok külön gombbal nyitható.</div> : null}
  </div>;
}
