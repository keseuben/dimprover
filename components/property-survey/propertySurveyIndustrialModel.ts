import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import type { SurveySectionLine } from "@/components/property-survey/propertySurveySectionModel";

export type SurveyIndustrialTool =
  | "select"
  | "buildingContour"
  | "pillar"
  | "crack"
  | "repairArea"
  | "freehand"
  | "transformBackground"
  | "calibrateBackground";

export type SurveyIndustrialPoint = { xMeters: number; yMeters: number };
export type SurveyPillarShape = "circle" | "rectangle";

export type SurveyIndustrialSettings = {
  planWidthMeters: number;
  planHeightMeters: number;
  gridSpacingXMeters: number;
  gridSpacingYMeters: number;
  showAxisGrid: boolean;
  snapToGrid: boolean;
  snapToRightAngle: boolean;
  snapToleranceMeters: number;
  updatedAt: string;
};

export type SurveyIndustrialBackgroundPage = {
  pageNumber: number;
  dataUrl: string;
  widthPixels: number;
  heightPixels: number;
};

export type SurveyIndustrialBackground = {
  id: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  sourceWidthPixels: number;
  sourceHeightPixels: number;
  pages: SurveyIndustrialBackgroundPage[];
  activePageIndex: number;
  pageCount: number;
  sourcePageCount: number;
  visible: boolean;
  opacity: number;
  grayscale: boolean;
  offsetXMeters: number;
  offsetYMeters: number;
  rotationDegrees: number;
  scalePercent: number;
  calibrationDistanceMeters: number;
  calibrationPoints: SurveyIndustrialPoint[];
  calibrationScaleFactor?: number;
  calibratedAt?: string;
  importedAt: string;
  updatedAt: string;
};

export type SurveyIndustrialBuildingContour = {
  id: string;
  levelId: string;
  serial: string;
  title: string;
  note: string;
  points: SurveyIndustrialPoint[];
  createdAt: string;
  updatedAt: string;
};

export type SurveyPillar = {
  id: string;
  levelId: string;
  serial: string;
  label: string;
  shape: SurveyPillarShape;
  xMeters: number;
  yMeters: number;
  widthMeters: number;
  depthMeters: number;
  diameterMeters: number;
  rotationDegrees: number;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type SurveyIndustrialMarkupKind = "crack" | "repairArea" | "freehand";
export type SurveyCrackSeverity = "hairline" | "minor" | "moderate" | "severe";
export type SurveyCrackStatus = "observed" | "monitoring" | "repair_planned" | "repaired";
export type SurveyIndustrialDrawKind = SurveyIndustrialMarkupKind | "buildingContour";

export type SurveyIndustrialMarkup = {
  id: string;
  levelId: string;
  serial: string;
  kind: SurveyIndustrialMarkupKind;
  title: string;
  note: string;
  points: SurveyIndustrialPoint[];
  closed: boolean;
  strokeWidthMillimeters: number;
  crackSeverity: SurveyCrackSeverity;
  crackStatus: SurveyCrackStatus;
  crackWidthMillimeters: number;
  crackDepthMillimeters: number;
  locationDescription: string;
  causeAssessment: string;
  repairMethod: string;
  requiresStructuralReview: boolean;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type SurveyIndustrialSummary = {
  buildingContourCount: number;
  pillarCount: number;
  crackCount: number;
  crackLengthMeters: number;
  repairAreaCount: number;
  repairAreaSquareMeters: number;
  freehandCount: number;
};

export const surveyIndustrialToolLabels: Record<SurveyIndustrialTool, string> = {
  select: "Kijelölés",
  buildingContour: "Épületkontúr",
  pillar: "Pillér",
  crack: "Repedés",
  repairArea: "Hibás térbeton",
  freehand: "Szabadkézi rajz",
  transformBackground: "Háttér mozgatása",
  calibrateBackground: "Háttér kalibrálása",
};

export const surveyIndustrialMarkupLabels: Record<SurveyIndustrialMarkupKind, string> = {
  crack: "Repedés",
  repairArea: "Hibás térbetonfelület",
  freehand: "Szabadkézi jelölés",
};

export function createDefaultIndustrialSettings(): SurveyIndustrialSettings {
  return {
    planWidthMeters: 25.3,
    planHeightMeters: 41.8,
    gridSpacingXMeters: 3,
    gridSpacingYMeters: 3,
    showAxisGrid: true,
    snapToGrid: false,
    snapToRightAngle: true,
    snapToleranceMeters: 0.25,
    updatedAt: new Date().toISOString(),
  };
}

function createIndustrialId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nextSerial(items: Array<{ serial: string }>, prefix: string) {
  const maximum = items.reduce((current, item) => {
    const match = item.serial.match(/(\d+)$/);
    return Math.max(current, match ? Number(match[1]) : 0);
  }, 0);
  return `${prefix}-${String(maximum + 1).padStart(3, "0")}`;
}

export function createSurveyPillar(input: {
  levelId: string;
  xMeters: number;
  yMeters: number;
  pillars: SurveyPillar[];
}): SurveyPillar {
  const now = new Date().toISOString();
  const serial = nextSerial(input.pillars, "P");
  return {
    id: createIndustrialId("pillar"),
    levelId: input.levelId,
    serial,
    label: serial,
    shape: "rectangle",
    xMeters: input.xMeters,
    yMeters: input.yMeters,
    widthMeters: 0.4,
    depthMeters: 0.4,
    diameterMeters: 0.4,
    rotationDegrees: 0,
    note: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function createIndustrialBuildingContour(input: {
  levelId: string;
  points: SurveyIndustrialPoint[];
  contours: SurveyIndustrialBuildingContour[];
  title?: string;
}): SurveyIndustrialBuildingContour {
  const now = new Date().toISOString();
  const serial = nextSerial(input.contours, "ÉP");
  return {
    id: createIndustrialId("industrial-building"),
    levelId: input.levelId,
    serial,
    title: input.title?.trim() || `Épületkontúr ${serial}`,
    note: "",
    points: normalizeClosedIndustrialPoints(input.points),
    createdAt: now,
    updatedAt: now,
  };
}

export function createIndustrialMarkup(input: {
  levelId: string;
  kind: SurveyIndustrialMarkupKind;
  points: SurveyIndustrialPoint[];
  markups: SurveyIndustrialMarkup[];
}): SurveyIndustrialMarkup {
  const now = new Date().toISOString();
  const prefix = input.kind === "crack" ? "R" : input.kind === "repairArea" ? "TB" : "SZ";
  const serial = nextSerial(input.markups, prefix);
  return {
    id: createIndustrialId("industrial-markup"),
    levelId: input.levelId,
    serial,
    kind: input.kind,
    title: `${surveyIndustrialMarkupLabels[input.kind]} ${serial}`,
    note: "",
    points: input.kind === "repairArea" ? normalizeClosedIndustrialPoints(input.points) : simplifyIndustrialPoints(input.points),
    closed: input.kind === "repairArea",
    strokeWidthMillimeters: input.kind === "crack" ? 2 : 1,
    crackSeverity: "minor",
    crackStatus: "observed",
    crackWidthMillimeters: input.kind === "crack" ? 1 : 0,
    crackDepthMillimeters: 0,
    locationDescription: "",
    causeAssessment: "",
    repairMethod: "",
    requiresStructuralReview: false,
    recordedAt: now.slice(0, 10),
    createdAt: now,
    updatedAt: now,
  };
}

export function simplifyIndustrialPoints(points: SurveyIndustrialPoint[], minimumDistanceMeters = 0.04) {
  if (points.length <= 2) return points.map((point) => ({ ...point }));
  const simplified = [{ ...points[0] }];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = points[index];
    if (Math.hypot(current.xMeters - previous.xMeters, current.yMeters - previous.yMeters) >= minimumDistanceMeters) simplified.push({ ...current });
  }
  simplified.push({ ...points[points.length - 1] });
  return simplified;
}

export function normalizeClosedIndustrialPoints(points: SurveyIndustrialPoint[]) {
  const normalized = simplifyIndustrialPoints(points);
  if (normalized.length > 3) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if (Math.hypot(first.xMeters - last.xMeters, first.yMeters - last.yMeters) <= 0.2) normalized.pop();
  }
  return normalized;
}

export function clampIndustrialPoint(point: SurveyIndustrialPoint, settings: SurveyIndustrialSettings): SurveyIndustrialPoint {
  return {
    xMeters: Math.min(settings.planWidthMeters, Math.max(0, point.xMeters)),
    yMeters: Math.min(settings.planHeightMeters, Math.max(0, point.yMeters)),
  };
}

export function snapIndustrialPoint(input: {
  point: SurveyIndustrialPoint;
  settings: SurveyIndustrialSettings;
  previousPoint?: SurveyIndustrialPoint | null;
  nextPoint?: SurveyIndustrialPoint | null;
}) {
  let point = clampIndustrialPoint(input.point, input.settings);
  if (input.settings.snapToGrid) {
    point = {
      xMeters: Math.round(point.xMeters / input.settings.gridSpacingXMeters) * input.settings.gridSpacingXMeters,
      yMeters: Math.round(point.yMeters / input.settings.gridSpacingYMeters) * input.settings.gridSpacingYMeters,
    };
  }
  if (input.settings.snapToRightAngle) {
    const tolerance = Math.max(0.01, input.settings.snapToleranceMeters);
    const anchors = [input.previousPoint, input.nextPoint].filter((value): value is SurveyIndustrialPoint => Boolean(value));
    let bestX: number | null = null;
    let bestY: number | null = null;
    let bestXDistance = Number.POSITIVE_INFINITY;
    let bestYDistance = Number.POSITIVE_INFINITY;
    for (const anchor of anchors) {
      const xDistance = Math.abs(point.xMeters - anchor.xMeters);
      const yDistance = Math.abs(point.yMeters - anchor.yMeters);
      if (xDistance <= tolerance && xDistance < bestXDistance) { bestX = anchor.xMeters; bestXDistance = xDistance; }
      if (yDistance <= tolerance && yDistance < bestYDistance) { bestY = anchor.yMeters; bestYDistance = yDistance; }
    }
    point = { xMeters: bestX ?? point.xMeters, yMeters: bestY ?? point.yMeters };
  }
  return clampIndustrialPoint({ xMeters: Number(point.xMeters.toFixed(3)), yMeters: Number(point.yMeters.toFixed(3)) }, input.settings);
}

export function insertIndustrialPoint(points: SurveyIndustrialPoint[], afterIndex?: number | null, closed = false) {
  if (points.length < 2) return { points: points.map((point) => ({ ...point })), insertedIndex: -1 };
  let index = typeof afterIndex === "number" && afterIndex >= 0 && afterIndex < points.length ? afterIndex : -1;
  if (index < 0) {
    let longest = -1;
    const segmentCount = closed ? points.length : points.length - 1;
    for (let current = 0; current < segmentCount; current += 1) {
      const next = (current + 1) % points.length;
      const length = Math.hypot(points[next].xMeters - points[current].xMeters, points[next].yMeters - points[current].yMeters);
      if (length > longest) { longest = length; index = current; }
    }
  }
  const nextIndex = (index + 1) % points.length;
  const current = points[index];
  const next = points[nextIndex];
  const midpoint = { xMeters: Number(((current.xMeters + next.xMeters) / 2).toFixed(3)), yMeters: Number(((current.yMeters + next.yMeters) / 2).toFixed(3)) };
  const result = points.map((point) => ({ ...point }));
  result.splice(index + 1, 0, midpoint);
  return { points: result, insertedIndex: index + 1 };
}

export function deleteIndustrialPoint(points: SurveyIndustrialPoint[], pointIndex: number, closed = false) {
  const minimum = closed ? 3 : 2;
  if (points.length <= minimum || pointIndex < 0 || pointIndex >= points.length) return points.map((point) => ({ ...point }));
  return points.filter((_, index) => index !== pointIndex).map((point) => ({ ...point }));
}

export type SurveyPillarGridInput = {
  levelId: string;
  startXMeters: number;
  startYMeters: number;
  columns: number;
  rows: number;
  spacingXMeters: number;
  spacingYMeters: number;
  shape: SurveyPillarShape;
  widthMeters: number;
  depthMeters: number;
  diameterMeters: number;
  rotationDegrees: number;
};

export function createSurveyPillarGrid(input: SurveyPillarGridInput, existingPillars: SurveyPillar[], settings: SurveyIndustrialSettings) {
  const columns = Math.min(40, Math.max(1, Math.round(input.columns)));
  const rows = Math.min(40, Math.max(1, Math.round(input.rows)));
  const generated: SurveyPillar[] = [];
  let all = [...existingPillars];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (generated.length >= 400) break;
      const position = clampIndustrialPoint({
        xMeters: input.startXMeters + column * input.spacingXMeters,
        yMeters: input.startYMeters + row * input.spacingYMeters,
      }, settings);
      const pillar = createSurveyPillar({ levelId: input.levelId, ...position, pillars: all });
      const customized: SurveyPillar = {
        ...pillar,
        shape: input.shape,
        widthMeters: Math.max(0.05, input.widthMeters),
        depthMeters: Math.max(0.05, input.depthMeters),
        diameterMeters: Math.max(0.05, input.diameterMeters),
        rotationDegrees: input.rotationDegrees,
      };
      generated.push(customized);
      all = [...all, customized];
    }
  }
  return generated;
}

export function calculateIndustrialPolylineLength(points: SurveyIndustrialPoint[]) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index].xMeters - points[index - 1].xMeters, points[index].yMeters - points[index - 1].yMeters);
  }
  return length;
}

export function calculateIndustrialPolygonArea(points: SurveyIndustrialPoint[]) {
  if (points.length < 3) return 0;
  let doubleArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    doubleArea += current.xMeters * next.yMeters - next.xMeters * current.yMeters;
  }
  return Math.abs(doubleArea) / 2;
}

export function getIndustrialSummary(
  pillars: SurveyPillar[],
  markups: SurveyIndustrialMarkup[],
  buildingContours: SurveyIndustrialBuildingContour[] = [],
): SurveyIndustrialSummary {
  const cracks = markups.filter((markup) => markup.kind === "crack");
  const repairAreas = markups.filter((markup) => markup.kind === "repairArea");
  return {
    buildingContourCount: buildingContours.length,
    pillarCount: pillars.length,
    crackCount: cracks.length,
    crackLengthMeters: cracks.reduce((sum, markup) => sum + calculateIndustrialPolylineLength(markup.points), 0),
    repairAreaCount: repairAreas.length,
    repairAreaSquareMeters: repairAreas.reduce((sum, markup) => sum + calculateIndustrialPolygonArea(markup.points), 0),
    freehandCount: markups.filter((markup) => markup.kind === "freehand").length,
  };
}

function dxfPair(code: number, value: string | number) {
  return `${code}\n${value}\n`;
}

function dxfPoint(point: SurveyIndustrialPoint) {
  return { x: point.xMeters * 1000, y: -point.yMeters * 1000 };
}

function dxfPolyline(layer: string, points: SurveyIndustrialPoint[], closed: boolean) {
  let output = dxfPair(0, "LWPOLYLINE") + dxfPair(8, layer) + dxfPair(90, points.length) + dxfPair(70, closed ? 1 : 0);
  for (const point of points) {
    const converted = dxfPoint(point);
    output += dxfPair(10, converted.x.toFixed(3)) + dxfPair(20, converted.y.toFixed(3));
  }
  return output;
}

function dxfHatch(layer: string, points: SurveyIndustrialPoint[]) {
  if (points.length < 3) return "";
  let output = dxfPair(0, "HATCH") + dxfPair(8, layer);
  output += dxfPair(10, 0) + dxfPair(20, 0) + dxfPair(30, 0);
  output += dxfPair(210, 0) + dxfPair(220, 0) + dxfPair(230, 1);
  output += dxfPair(2, "ANSI31") + dxfPair(70, 0) + dxfPair(71, 0);
  output += dxfPair(91, 1);
  output += dxfPair(92, 2) + dxfPair(72, 0) + dxfPair(73, 1) + dxfPair(93, points.length);
  for (const point of points) {
    const converted = dxfPoint(point);
    output += dxfPair(10, converted.x.toFixed(3)) + dxfPair(20, converted.y.toFixed(3));
  }
  output += dxfPair(97, 0);
  output += dxfPair(75, 0) + dxfPair(76, 1) + dxfPair(52, 45) + dxfPair(41, 250) + dxfPair(77, 0);
  output += dxfPair(78, 1);
  output += dxfPair(53, 45) + dxfPair(43, 0) + dxfPair(44, 0) + dxfPair(45, 0) + dxfPair(46, 250) + dxfPair(79, 0);
  output += dxfPair(98, 0);
  return output;
}

function dxfText(layer: string, x: number, y: number, text: string, height = 180) {
  return dxfPair(0, "TEXT") + dxfPair(8, layer) + dxfPair(10, x.toFixed(3)) + dxfPair(20, y.toFixed(3)) + dxfPair(40, height) + dxfPair(1, text);
}

function roomDxfPoints(room: SurveyRoom, settings: SurveyIndustrialSettings): SurveyIndustrialPoint[] {
  const lengthMeters = room.lengthMeters || room.width / 60;
  const widthMeters = room.widthMeters || room.depth / 60;
  const xMeters = (room.x - 72) / 756 * settings.planWidthMeters;
  const yMeters = (room.y - 72) / 455 * settings.planHeightMeters;
  return [
    { xMeters, yMeters },
    { xMeters: xMeters + lengthMeters, yMeters },
    { xMeters: xMeters + lengthMeters, yMeters: yMeters + widthMeters },
    { xMeters, yMeters: yMeters + widthMeters },
  ];
}

function rotatePoint(point: SurveyIndustrialPoint, center: SurveyIndustrialPoint, degrees: number): SurveyIndustrialPoint {
  const radians = degrees * Math.PI / 180;
  const dx = point.xMeters - center.xMeters;
  const dy = point.yMeters - center.yMeters;
  return {
    xMeters: center.xMeters + dx * Math.cos(radians) - dy * Math.sin(radians),
    yMeters: center.yMeters + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

function pillarRectanglePoints(pillar: SurveyPillar) {
  const center = { xMeters: pillar.xMeters, yMeters: pillar.yMeters };
  const halfWidth = pillar.widthMeters / 2;
  const halfDepth = pillar.depthMeters / 2;
  return [
    { xMeters: pillar.xMeters - halfWidth, yMeters: pillar.yMeters - halfDepth },
    { xMeters: pillar.xMeters + halfWidth, yMeters: pillar.yMeters - halfDepth },
    { xMeters: pillar.xMeters + halfWidth, yMeters: pillar.yMeters + halfDepth },
    { xMeters: pillar.xMeters - halfWidth, yMeters: pillar.yMeters + halfDepth },
  ].map((point) => rotatePoint(point, center, pillar.rotationDegrees));
}

export function createIndustrialDxf(input: {
  projectName?: string;
  surveyName: string;
  levelName: string;
  settings: SurveyIndustrialSettings;
  rooms: SurveyRoom[];
  buildingContours?: SurveyIndustrialBuildingContour[];
  pillars: SurveyPillar[];
  markups: SurveyIndustrialMarkup[];
  sectionLines?: SurveySectionLine[];
}) {
  const layers = [
    ["DIMPRO_BUILDING", 7],
    ["DIMPRO_COLUMNS", 8],
    ["DIMPRO_CONCRETE_REPAIR", 30],
    ["DIMPRO_CRACKS", 1],
    ["DIMPRO_FREEHAND", 5],
    ["DIMPRO_SECTIONS", 6],
    ["DIMPRO_TEXT", 7],
  ] as const;
  let output = dxfPair(0, "SECTION") + dxfPair(2, "HEADER") + dxfPair(9, "$ACADVER") + dxfPair(1, "AC1015") + dxfPair(9, "$INSUNITS") + dxfPair(70, 4) + dxfPair(0, "ENDSEC");
  output += dxfPair(0, "SECTION") + dxfPair(2, "TABLES") + dxfPair(0, "TABLE") + dxfPair(2, "LAYER") + dxfPair(70, layers.length);
  for (const [name, color] of layers) output += dxfPair(0, "LAYER") + dxfPair(2, name) + dxfPair(70, 0) + dxfPair(62, color) + dxfPair(6, "CONTINUOUS");
  output += dxfPair(0, "ENDTAB") + dxfPair(0, "ENDSEC") + dxfPair(0, "SECTION") + dxfPair(2, "ENTITIES");

  const buildingContours = input.buildingContours || [];
  if (buildingContours.length) {
    for (const contour of buildingContours) {
      output += dxfPolyline("DIMPRO_BUILDING", contour.points, true);
      if (contour.points.length) {
        const centerX = contour.points.reduce((sum, point) => sum + point.xMeters, 0) / contour.points.length * 1000;
        const centerY = -contour.points.reduce((sum, point) => sum + point.yMeters, 0) / contour.points.length * 1000;
        output += dxfText("DIMPRO_TEXT", centerX, centerY, contour.title, 220);
      }
    }
  } else {
    for (const room of input.rooms) {
      const points = roomDxfPoints(room, input.settings);
      output += dxfPolyline("DIMPRO_BUILDING", points, true);
      const centerX = points.reduce((sum, point) => sum + point.xMeters, 0) / points.length * 1000;
      const centerY = -points.reduce((sum, point) => sum + point.yMeters, 0) / points.length * 1000;
      output += dxfText("DIMPRO_TEXT", centerX, centerY, room.name, 220);
    }
  }

  for (const pillar of input.pillars) {
    const center = dxfPoint({ xMeters: pillar.xMeters, yMeters: pillar.yMeters });
    if (pillar.shape === "circle") {
      output += dxfPair(0, "CIRCLE") + dxfPair(8, "DIMPRO_COLUMNS") + dxfPair(10, center.x.toFixed(3)) + dxfPair(20, center.y.toFixed(3)) + dxfPair(40, (pillar.diameterMeters * 500).toFixed(3));
    } else {
      output += dxfPolyline("DIMPRO_COLUMNS", pillarRectanglePoints(pillar), true);
    }
    output += dxfText("DIMPRO_TEXT", center.x + 250, center.y + 250, pillar.label, 160);
  }

  for (const line of input.sectionLines || []) {
    const x1 = (line.x1 - 72) / 756 * input.settings.planWidthMeters * 1000;
    const y1 = -((line.y1 - 72) / 455 * input.settings.planHeightMeters * 1000);
    const x2 = (line.x2 - 72) / 756 * input.settings.planWidthMeters * 1000;
    const y2 = -((line.y2 - 72) / 455 * input.settings.planHeightMeters * 1000);
    output += dxfPair(0, "LINE") + dxfPair(8, "DIMPRO_SECTIONS") + dxfPair(10, x1.toFixed(3)) + dxfPair(20, y1.toFixed(3)) + dxfPair(11, x2.toFixed(3)) + dxfPair(21, y2.toFixed(3));
    output += dxfText("DIMPRO_SECTIONS", (x1 + x2) / 2, (y1 + y2) / 2, `${line.serial} METSZET ${line.name}`, 180);
  }

  for (const markup of input.markups) {
    const layer = markup.kind === "crack" ? "DIMPRO_CRACKS" : markup.kind === "repairArea" ? "DIMPRO_CONCRETE_REPAIR" : "DIMPRO_FREEHAND";
    output += dxfPolyline(layer, markup.points, markup.closed);
    if (markup.kind === "repairArea") output += dxfHatch(layer, markup.points);
    if (markup.points.length) {
      const centerX = markup.points.reduce((sum, point) => sum + point.xMeters, 0) / markup.points.length * 1000;
      const centerY = -markup.points.reduce((sum, point) => sum + point.yMeters, 0) / markup.points.length * 1000;
      const quantity = markup.kind === "repairArea" ? `${calculateIndustrialPolygonArea(markup.points).toFixed(2)} m2` : `${calculateIndustrialPolylineLength(markup.points).toFixed(2)} m`;
      const detail = markup.kind === "crack" ? ` width=${markup.crackWidthMillimeters.toFixed(1)}mm severity=${markup.crackSeverity} status=${markup.crackStatus}${markup.requiresStructuralReview ? " STRUCTURAL_REVIEW" : ""}` : "";
      output += dxfText("DIMPRO_TEXT", centerX, centerY, `${markup.serial} ${quantity}${detail}`, 170);
    }
  }

  output += dxfText("DIMPRO_TEXT", 0, 1000, `${input.projectName || "DIMPRO"} - ${input.surveyName} - ${input.levelName}`, 260);
  output += dxfText("DIMPRO_TEXT", 0, 500, `Munkaterulet: ${input.settings.planWidthMeters.toFixed(2)} x ${input.settings.planHeightMeters.toFixed(2)} m`, 180);
  output += dxfPair(0, "ENDSEC") + dxfPair(0, "EOF");
  return output;
}
