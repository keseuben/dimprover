import type { SurveyIndustrialSettings } from "@/components/property-survey/propertySurveyIndustrialModel";
import { getWallSegmentGeometry, type SurveyWallSegment } from "@/components/property-survey/propertySurveyBuildingModel";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import type { PropertySurveyMode } from "@/components/property-survey/propertySurveyWorkspaceTypes";

export type SurveySectionKind = "building" | "attic" | "hall" | "custom";
export type SurveyRoofShape = "flat" | "gable" | "singleSlope" | "custom";
export type SurveyRoofWindowSide = "left" | "right" | "none";
export type SurveySectionDrawingConstraint = "free" | "horizontal" | "vertical";

export type SurveySectionLine = {
  id: string;
  levelId: string;
  serial: string;
  name: string;
  kind: SurveySectionKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  roofShape: SurveyRoofShape;
  floorElevationMeters: number;
  clearHeightMeters: number;
  floorSlabThicknessCm: number;
  ceilingSlabThicknessCm: number;
  eavesHeightMeters: number;
  ridgeHeightMeters: number;
  topSurfaceHeightMeters: number;
  leftKneeWallHeightMeters: number;
  rightKneeWallHeightMeters: number;
  leftRoofPitchDegrees: number;
  rightRoofPitchDegrees: number;
  roofWindowCount: number;
  roofWindowSide: SurveyRoofWindowSide;
  roofWindowWidthMeters: number;
  roofWindowHeightMeters: number;
  roofWindowSillHeightMeters: number;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export const SURVEY_SECTION_MODEL_BOUNDS = { x: 72, y: 72, width: 756, height: 455 } as const;

export const surveySectionKindLabels: Record<SurveySectionKind, string> = {
  building: "Általános épületmetszet",
  attic: "Padlástéri / tetősíkos metszet",
  hall: "Csarnokmetszet",
  custom: "Egyedi metszet",
};

export const surveyRoofShapeLabels: Record<SurveyRoofShape, string> = {
  flat: "Lapostető",
  gable: "Nyeregtető",
  singleSlope: "Félnyeregtető",
  custom: "Egyedi tetőforma",
};

function createSectionId() {
  return `section-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sectionLetterToIndex(value: string) {
  const normalized = value.toLocaleUpperCase("hu-HU").replace(/[^A-Z]/g, "");
  if (!normalized) return 0;
  return [...normalized].reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0);
}

function sectionIndexToLetter(index: number) {
  let remaining = Math.max(1, Math.floor(index));
  let value = "";
  while (remaining > 0) {
    remaining -= 1;
    value = String.fromCharCode(65 + remaining % 26) + value;
    remaining = Math.floor(remaining / 26);
  }
  return value;
}

function nextSectionSerial(lines: SurveySectionLine[]) {
  const nextIndex = lines.reduce((maximum, line) => {
    const firstPart = line.serial.split("-")[0] || "";
    return Math.max(maximum, sectionLetterToIndex(firstPart));
  }, 0) + 1;
  const letter = sectionIndexToLetter(nextIndex);
  return `${letter}-${letter}`;
}

function defaultsForMode(mode: PropertySurveyMode) {
  if (mode === "Épület- és csarnokfelmérés" || mode === "Térbeton- és burkolatfelmérés") {
    return {
      kind: "hall" as const,
      roofShape: "gable" as const,
      clearHeightMeters: 6,
      eavesHeightMeters: 6.5,
      ridgeHeightMeters: 8.5,
      topSurfaceHeightMeters: 8.5,
      leftKneeWallHeightMeters: 6.5,
      rightKneeWallHeightMeters: 6.5,
      leftRoofPitchDegrees: 15,
      rightRoofPitchDegrees: 15,
    };
  }
  if (mode === "Energetikai felmérés" || mode === "Felújítási felmérés") {
    return {
      kind: "attic" as const,
      roofShape: "gable" as const,
      clearHeightMeters: 2.7,
      eavesHeightMeters: 2.8,
      ridgeHeightMeters: 4.8,
      topSurfaceHeightMeters: 4.8,
      leftKneeWallHeightMeters: 1.1,
      rightKneeWallHeightMeters: 1.1,
      leftRoofPitchDegrees: 38,
      rightRoofPitchDegrees: 38,
    };
  }
  return {
    kind: "building" as const,
    roofShape: "gable" as const,
    clearHeightMeters: 2.8,
    eavesHeightMeters: 3,
    ridgeHeightMeters: 5,
    topSurfaceHeightMeters: 5,
    leftKneeWallHeightMeters: 0,
    rightKneeWallHeightMeters: 0,
    leftRoofPitchDegrees: 35,
    rightRoofPitchDegrees: 35,
  };
}

export function createSurveySectionLine(input: {
  levelId: string;
  lines: SurveySectionLine[];
  surveyMode: PropertySurveyMode;
  start: { x: number; y: number };
  end: { x: number; y: number };
}): SurveySectionLine {
  const now = new Date().toISOString();
  const serial = nextSectionSerial(input.lines);
  const defaults = defaultsForMode(input.surveyMode);
  return {
    id: createSectionId(),
    levelId: input.levelId,
    serial,
    name: `${serial} metszet`,
    ...defaults,
    x1: input.start.x,
    y1: input.start.y,
    x2: input.end.x,
    y2: input.end.y,
    floorElevationMeters: 0,
    floorSlabThicknessCm: defaults.kind === "hall" ? 20 : 15,
    ceilingSlabThicknessCm: defaults.kind === "hall" ? 20 : 18,
    roofWindowCount: defaults.kind === "attic" ? 1 : 0,
    roofWindowSide: defaults.kind === "attic" ? "right" : "none",
    roofWindowWidthMeters: 0.78,
    roofWindowHeightMeters: 1.18,
    roofWindowSillHeightMeters: 1.1,
    note: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeSurveySectionLines(lines: unknown): SurveySectionLine[] {
  if (!Array.isArray(lines)) return [];
  return lines.filter((line): line is Partial<SurveySectionLine> & { id: string; levelId: string } => Boolean(line && typeof line === "object" && "id" in line && "levelId" in line)).map((line, index) => {
    const now = new Date().toISOString();
    const kind: SurveySectionKind = line.kind === "attic" || line.kind === "hall" || line.kind === "custom" ? line.kind : "building";
    const roofShape: SurveyRoofShape = line.roofShape === "flat" || line.roofShape === "singleSlope" || line.roofShape === "custom" ? line.roofShape : "gable";
    const roofWindowSide: SurveyRoofWindowSide = line.roofWindowSide === "left" || line.roofWindowSide === "right" ? line.roofWindowSide : "none";
    return {
      id: line.id,
      levelId: line.levelId,
      serial: line.serial || `${String.fromCharCode(65 + Math.min(index, 25))}-${String.fromCharCode(65 + Math.min(index, 25))}`,
      name: line.name || `Metszet ${index + 1}`,
      kind,
      x1: Number(line.x1) || 140,
      y1: Number(line.y1) || 240,
      x2: Number(line.x2) || 700,
      y2: Number(line.y2) || 240,
      roofShape,
      floorElevationMeters: Number(line.floorElevationMeters) || 0,
      floorSlabThicknessCm: Number.isFinite(Number(line.floorSlabThicknessCm)) ? Math.max(0, Number(line.floorSlabThicknessCm)) : 15,
      ceilingSlabThicknessCm: Number.isFinite(Number(line.ceilingSlabThicknessCm)) ? Math.max(0, Number(line.ceilingSlabThicknessCm)) : 18,
      clearHeightMeters: Math.max(0.1, Number(line.clearHeightMeters) || 2.7),
      eavesHeightMeters: Math.max(0.1, Number(line.eavesHeightMeters) || 3),
      ridgeHeightMeters: Math.max(0.1, Number(line.ridgeHeightMeters) || 5),
      topSurfaceHeightMeters: Math.max(0.1, Number(line.topSurfaceHeightMeters) || Number(line.ridgeHeightMeters) || 5),
      leftKneeWallHeightMeters: Math.max(0, Number(line.leftKneeWallHeightMeters) || 0),
      rightKneeWallHeightMeters: Math.max(0, Number(line.rightKneeWallHeightMeters) || 0),
      leftRoofPitchDegrees: Math.max(0, Math.min(89, Number(line.leftRoofPitchDegrees) || 35)),
      rightRoofPitchDegrees: Math.max(0, Math.min(89, Number(line.rightRoofPitchDegrees) || 35)),
      roofWindowCount: Math.max(0, Math.round(Number(line.roofWindowCount) || 0)),
      roofWindowSide,
      roofWindowWidthMeters: Math.max(0, Number(line.roofWindowWidthMeters) || 0.78),
      roofWindowHeightMeters: Math.max(0, Number(line.roofWindowHeightMeters) || 1.18),
      roofWindowSillHeightMeters: Math.max(0, Number(line.roofWindowSillHeightMeters) || 1.1),
      note: line.note || "",
      createdAt: line.createdAt || now,
      updatedAt: line.updatedAt || now,
    };
  });
}

export type SurveySectionInternalWallPosition = {
  wallSegmentId: string;
  ratio: number;
  thicknessCm: number;
};

function segmentIntersectionRatio(
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number },
  wallStart: { x: number; y: number },
  wallEnd: { x: number; y: number },
) {
  const rx = lineEnd.x - lineStart.x;
  const ry = lineEnd.y - lineStart.y;
  const sx = wallEnd.x - wallStart.x;
  const sy = wallEnd.y - wallStart.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 0.000001) return null;
  const qpx = wallStart.x - lineStart.x;
  const qpy = wallStart.y - lineStart.y;
  const lineRatio = (qpx * sy - qpy * sx) / denominator;
  const wallRatio = (qpx * ry - qpy * rx) / denominator;
  if (lineRatio <= 0.015 || lineRatio >= 0.985 || wallRatio < -0.001 || wallRatio > 1.001) return null;
  return lineRatio;
}

export function getSurveySectionInternalWallPositions(input: {
  line: SurveySectionLine;
  rooms: SurveyRoom[];
  wallSegments: SurveyWallSegment[];
}) {
  const candidates: SurveySectionInternalWallPosition[] = [];
  for (const segment of input.wallSegments) {
    if (segment.boundaryType !== "internal") continue;
    const room = input.rooms.find((item) => item.id === segment.roomId);
    if (!room) continue;
    const geometry = getWallSegmentGeometry(room, segment);
    const ratio = segmentIntersectionRatio(
      { x: input.line.x1, y: input.line.y1 },
      { x: input.line.x2, y: input.line.y2 },
      { x: geometry.x1, y: geometry.y1 },
      { x: geometry.x2, y: geometry.y2 },
    );
    if (ratio === null) continue;
    candidates.push({ wallSegmentId: segment.id, ratio, thicknessCm: Math.max(5, Number(segment.thicknessCm) || 10) });
  }
  candidates.sort((left, right) => left.ratio - right.ratio);
  const deduplicated: SurveySectionInternalWallPosition[] = [];
  for (const candidate of candidates) {
    const previous = deduplicated[deduplicated.length - 1];
    if (previous && Math.abs(previous.ratio - candidate.ratio) < 0.018) {
      previous.ratio = Number(((previous.ratio + candidate.ratio) / 2).toFixed(4));
      previous.thicknessCm = Math.max(previous.thicknessCm, candidate.thicknessCm);
      continue;
    }
    deduplicated.push({ ...candidate, ratio: Number(candidate.ratio.toFixed(4)) });
  }
  return deduplicated;
}

export function getSurveySectionLengthMeters(input: {
  line: SurveySectionLine;
  industrialMode: boolean;
  industrialSettings?: SurveyIndustrialSettings;
}) {
  const dx = input.line.x2 - input.line.x1;
  const dy = input.line.y2 - input.line.y1;
  if (!input.industrialMode || !input.industrialSettings) return Number((Math.hypot(dx, dy) / 60).toFixed(2));
  const xMeters = dx / SURVEY_SECTION_MODEL_BOUNDS.width * input.industrialSettings.planWidthMeters;
  const yMeters = dy / SURVEY_SECTION_MODEL_BOUNDS.height * input.industrialSettings.planHeightMeters;
  return Number(Math.hypot(xMeters, yMeters).toFixed(2));
}
