import type {
  SurveyNormalizedPoint,
  SurveyPlanPage,
  SurveyPlanSuggestion,
  SurveyPlanWallBoundaryType,
  SurveyPlanWallSuggestion,
} from "@/components/property-survey/propertySurveyPlanDocumentTypes";

export const surveyPlanWallBoundaryTypeLabels: Record<SurveyPlanWallBoundaryType, string> = {
  externalAir: "Külső levegővel határos",
  ground: "Talajjal érintkező",
  unheatedSpace: "Fűtetlen térrel határos",
  adjacentBuilding: "Szomszédos épülettel / egységgel határos",
  internal: "Belső fal",
  unknown: "Még nem eldöntött",
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedDistance(pointA: SurveyNormalizedPoint, pointB: SurveyNormalizedPoint) {
  return Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y);
}

export function segmentLengthPixels(
  pointA: SurveyNormalizedPoint,
  pointB: SurveyNormalizedPoint,
  viewportWidth: number,
  viewportHeight: number,
) {
  return Math.hypot((pointB.x - pointA.x) * viewportWidth, (pointB.y - pointA.y) * viewportHeight);
}

export function polygonAreaPixels(points: SurveyNormalizedPoint[], viewportWidth: number, viewportHeight: number) {
  if (points.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * viewportWidth * next.y * viewportHeight - next.x * viewportWidth * current.y * viewportHeight;
  }
  return Math.abs(area) / 2;
}

export function polygonSignedArea(points: SurveyNormalizedPoint[]) {
  if (points.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

export function polygonCentroid(points: SurveyNormalizedPoint[]) {
  if (!points.length) return { x: 0.5, y: 0.5 };
  const signedArea = polygonSignedArea(points);
  if (Math.abs(signedArea) < 1e-9) {
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
  }
  let x = 0;
  let y = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;
    x += (current.x + next.x) * cross;
    y += (current.y + next.y) * cross;
  }
  return {
    x: x / (6 * signedArea),
    y: y / (6 * signedArea),
  };
}

export function calculateSuggestionAreaSquareMeters(
  polygon: SurveyNormalizedPoint[],
  page: SurveyPlanPage,
  viewportWidth: number,
  viewportHeight: number,
) {
  const pixelsPerMeter = page.calibration.primary.pixelsPerMeter;
  if (pixelsPerMeter <= 0) return 0;
  return polygonAreaPixels(polygon, viewportWidth, viewportHeight) / (pixelsPerMeter * pixelsPerMeter);
}

export function recalculateSuggestionGeometry(
  suggestion: SurveyPlanSuggestion,
  polygon: SurveyNormalizedPoint[],
  page: SurveyPlanPage,
  viewportWidth: number,
  viewportHeight: number,
): Pick<SurveyPlanSuggestion, "polygon" | "calculatedAreaSquareMeters" | "areaDifferenceSquareMeters" | "areaDifferencePercent" | "source" | "userModified"> {
  const calculatedAreaSquareMeters = calculateSuggestionAreaSquareMeters(polygon, page, viewportWidth, viewportHeight);
  const labeledArea = suggestion.labeledAreaSquareMeters;
  const areaDifferenceSquareMeters = labeledArea != null && calculatedAreaSquareMeters > 0
    ? calculatedAreaSquareMeters - labeledArea
    : null;
  const areaDifferencePercent = labeledArea != null && labeledArea > 0 && areaDifferenceSquareMeters != null
    ? areaDifferenceSquareMeters / labeledArea * 100
    : null;
  return {
    polygon,
    calculatedAreaSquareMeters,
    areaDifferenceSquareMeters,
    areaDifferencePercent,
    source: "userCorrected",
    userModified: true,
  };
}

function pointsNear(left: SurveyNormalizedPoint, right: SurveyNormalizedPoint, tolerance: number) {
  return normalizedDistance(left, right) <= tolerance;
}

function removeSequentialDuplicatePoints(points: SurveyNormalizedPoint[], tolerance = 1e-6) {
  const result: SurveyNormalizedPoint[] = [];
  for (const point of points) {
    if (!result.length || !pointsNear(result[result.length - 1], point, tolerance)) result.push({ ...point });
  }
  if (result.length > 1 && pointsNear(result[0], result[result.length - 1], tolerance)) result.pop();
  return result;
}

function ensureCounterClockwise(points: SurveyNormalizedPoint[]) {
  const normalized = removeSequentialDuplicatePoints(points);
  return polygonSignedArea(normalized) >= 0 ? normalized : [...normalized].reverse();
}

function polygonPathWithoutEdge(points: SurveyNormalizedPoint[], edgeIndex: number) {
  const result: SurveyNormalizedPoint[] = [];
  const count = points.length;
  let index = (edgeIndex + 1) % count;
  result.push({ ...points[index] });
  while (index !== edgeIndex) {
    index = (index + 1) % count;
    result.push({ ...points[index] });
  }
  return result;
}

export function mergeAdjacentPolygons(
  leftPolygon: SurveyNormalizedPoint[],
  rightPolygon: SurveyNormalizedPoint[],
  tolerance = 0.012,
) {
  const left = ensureCounterClockwise(leftPolygon);
  const right = ensureCounterClockwise(rightPolygon);
  if (left.length < 3 || right.length < 3) return null;

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const leftStart = left[leftIndex];
    const leftEnd = left[(leftIndex + 1) % left.length];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const rightStart = right[rightIndex];
      const rightEnd = right[(rightIndex + 1) % right.length];
      if (!pointsNear(leftStart, rightEnd, tolerance) || !pointsNear(leftEnd, rightStart, tolerance)) continue;
      const leftPath = polygonPathWithoutEdge(left, leftIndex);
      const rightPath = polygonPathWithoutEdge(right, rightIndex);
      const merged = removeSequentialDuplicatePoints([
        ...leftPath,
        ...rightPath.slice(1, -1),
      ], tolerance / 2);
      if (merged.length < 3 || Math.abs(polygonSignedArea(merged)) < 1e-7) return null;
      return ensureCounterClockwise(merged);
    }
  }
  return null;
}

function lineSide(point: SurveyNormalizedPoint, lineStart: SurveyNormalizedPoint, lineEnd: SurveyNormalizedPoint) {
  return (lineEnd.x - lineStart.x) * (point.y - lineStart.y) - (lineEnd.y - lineStart.y) * (point.x - lineStart.x);
}

function lineIntersection(
  segmentStart: SurveyNormalizedPoint,
  segmentEnd: SurveyNormalizedPoint,
  startSide: number,
  endSide: number,
) {
  const denominator = startSide - endSide;
  const ratio = Math.abs(denominator) < 1e-12 ? 0.5 : clamp(startSide / denominator, 0, 1);
  return {
    x: segmentStart.x + (segmentEnd.x - segmentStart.x) * ratio,
    y: segmentStart.y + (segmentEnd.y - segmentStart.y) * ratio,
  };
}

function clipPolygonToLineSide(
  polygon: SurveyNormalizedPoint[],
  lineStart: SurveyNormalizedPoint,
  lineEnd: SurveyNormalizedPoint,
  keepPositive: boolean,
) {
  const result: SurveyNormalizedPoint[] = [];
  const epsilon = 1e-8;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const currentSide = lineSide(current, lineStart, lineEnd);
    const previousSide = lineSide(previous, lineStart, lineEnd);
    const currentInside = keepPositive ? currentSide >= -epsilon : currentSide <= epsilon;
    const previousInside = keepPositive ? previousSide >= -epsilon : previousSide <= epsilon;
    if (currentInside !== previousInside) result.push(lineIntersection(previous, current, previousSide, currentSide));
    if (currentInside) result.push({ ...current });
  }
  return removeSequentialDuplicatePoints(result, 1e-7);
}

export function splitPolygonByLine(
  polygon: SurveyNormalizedPoint[],
  lineStart: SurveyNormalizedPoint,
  lineEnd: SurveyNormalizedPoint,
) {
  if (polygon.length < 3 || normalizedDistance(lineStart, lineEnd) < 0.006) return null;
  const normalized = ensureCounterClockwise(polygon);
  const positive = clipPolygonToLineSide(normalized, lineStart, lineEnd, true);
  const negative = clipPolygonToLineSide(normalized, lineStart, lineEnd, false);
  if (positive.length < 3 || negative.length < 3) return null;
  if (Math.abs(polygonSignedArea(positive)) < 1e-7 || Math.abs(polygonSignedArea(negative)) < 1e-7) return null;
  return [ensureCounterClockwise(positive), ensureCounterClockwise(negative)] as const;
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

export function orientationLabelFromDegrees(value: number) {
  const labels = ["É", "ÉK", "K", "DK", "D", "DNy", "Ny", "ÉNy"];
  return labels[Math.round(normalizeDegrees(value) / 45) % 8];
}

function outwardNormalForSegment(
  start: SurveyNormalizedPoint,
  end: SurveyNormalizedPoint,
  polygon: SurveyNormalizedPoint[],
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1e-9, Math.hypot(dx, dy));
  const left = { x: -dy / length, y: dx / length };
  const right = { x: dy / length, y: -dx / length };
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const centroid = polygonCentroid(polygon);
  const toCenter = { x: centroid.x - midpoint.x, y: centroid.y - midpoint.y };
  const leftDot = left.x * toCenter.x + left.y * toCenter.y;
  return leftDot < 0 ? left : right;
}

export function wallOrientationDegrees(
  start: SurveyNormalizedPoint,
  end: SurveyNormalizedPoint,
  polygon: SurveyNormalizedPoint[],
  northAngle: number,
) {
  const normal = outwardNormalForSegment(start, end, polygon);
  const screenNorthDegrees = Math.atan2(normal.x, -normal.y) * 180 / Math.PI;
  return normalizeDegrees(screenNorthDegrees - northAngle);
}

function segmentsMatch(
  leftStart: SurveyNormalizedPoint,
  leftEnd: SurveyNormalizedPoint,
  rightStart: SurveyNormalizedPoint,
  rightEnd: SurveyNormalizedPoint,
  tolerance: number,
) {
  const direct = normalizedDistance(leftStart, rightStart) + normalizedDistance(leftEnd, rightEnd);
  const reversed = normalizedDistance(leftStart, rightEnd) + normalizedDistance(leftEnd, rightStart);
  if (Math.min(direct, reversed) <= tolerance * 2) return true;

  const leftMidpoint = { x: (leftStart.x + leftEnd.x) / 2, y: (leftStart.y + leftEnd.y) / 2 };
  const rightMidpoint = { x: (rightStart.x + rightEnd.x) / 2, y: (rightStart.y + rightEnd.y) / 2 };
  const midpointDistance = normalizedDistance(leftMidpoint, rightMidpoint);
  const leftAngle = Math.atan2(leftEnd.y - leftStart.y, leftEnd.x - leftStart.x);
  const rightAngle = Math.atan2(rightEnd.y - rightStart.y, rightEnd.x - rightStart.x);
  const angleDifference = Math.abs(Math.sin(leftAngle - rightAngle));
  const leftLength = normalizedDistance(leftStart, leftEnd);
  const rightLength = normalizedDistance(rightStart, rightEnd);
  const lengthRatio = Math.min(leftLength, rightLength) / Math.max(1e-9, Math.max(leftLength, rightLength));
  return midpointDistance <= tolerance && angleDifference <= 0.12 && lengthRatio >= 0.72;
}

type RoomEdge = {
  suggestion: SurveyPlanSuggestion;
  edgeIndex: number;
  start: SurveyNormalizedPoint;
  end: SurveyNormalizedPoint;
};

export function buildExternalWallSuggestions(input: {
  page: SurveyPlanPage;
  roomSuggestions: SurveyPlanSuggestion[];
  viewportWidth: number;
  viewportHeight: number;
  idFactory: (prefix: string) => string;
}) {
  const now = new Date().toISOString();
  const roomSuggestions = input.roomSuggestions.filter((suggestion) => suggestion.status !== "ignored" && suggestion.polygon.length >= 3);
  const edges: RoomEdge[] = roomSuggestions.flatMap((suggestion) => suggestion.polygon.map((start, edgeIndex) => ({
    suggestion,
    edgeIndex,
    start,
    end: suggestion.polygon[(edgeIndex + 1) % suggestion.polygon.length],
  })).filter((edge) => normalizedDistance(edge.start, edge.end) >= 0.006));
  const pixelsPerMeter = input.page.calibration.primary.pixelsPerMeter;
  const tolerance = clamp(9 / Math.max(700, Math.max(input.viewportWidth, input.viewportHeight)), 0.006, 0.014);

  const exteriorEdges = edges.filter((edge, edgeIndex) => !edges.some((other, otherIndex) => {
    if (edgeIndex === otherIndex || edge.suggestion.id === other.suggestion.id) return false;
    return segmentsMatch(edge.start, edge.end, other.start, other.end, tolerance);
  }));

  const uniqueExteriorEdges = exteriorEdges.filter((edge, edgeIndex, allEdges) => allEdges.findIndex((other) => {
    if (other.suggestion.id !== edge.suggestion.id) return false;
    return segmentsMatch(edge.start, edge.end, other.start, other.end, tolerance / 2);
  }) === edgeIndex);

  return uniqueExteriorEdges.map((edge) => {
    const lengthPixels = segmentLengthPixels(edge.start, edge.end, input.viewportWidth, input.viewportHeight);
    const lengthMeters = pixelsPerMeter > 0 ? lengthPixels / pixelsPerMeter : 0;
    const orientationDegrees = wallOrientationDegrees(edge.start, edge.end, edge.suggestion.polygon, input.page.northAngle);
    const confidenceScore = edge.suggestion.status === "approved" ? 0.9 : edge.suggestion.confidence === "high" || edge.suggestion.confidence === "manual" ? 0.82 : 0.7;
    return {
      id: input.idFactory("wall-suggestion"),
      pageId: input.page.id,
      levelId: input.page.levelId,
      start: { ...edge.start },
      end: { ...edge.end },
      boundaryType: "externalAir",
      orientationDegrees,
      orientationLabel: orientationLabelFromDegrees(orientationDegrees),
      lengthMeters,
      heightMeters: edge.suggestion.roomHeightMeters || 2.7,
      thicknessMeters: 0.3,
      assemblyId: "",
      zoneId: "",
      adjacentZoneId: "",
      grossAreaSquareMeters: lengthMeters * (edge.suggestion.roomHeightMeters || 2.7),
      openingAreaSquareMeters: 0,
      netAreaSquareMeters: lengthMeters * (edge.suggestion.roomHeightMeters || 2.7),
      connectedRoomSuggestionIds: [edge.suggestion.id],
      confidence: confidenceScore >= 0.88 ? "high" : confidenceScore >= 0.62 ? "medium" : "low",
      confidenceScore,
      source: "vectorPdfRecognition",
      sourceDetails: "A jóváhagyott vagy ellenőrzendő helyiségpoligon olyan peremszakasza, amelyhez nem található szomszédos helyiség az ellenkező oldalon. Külső határolásként jóváhagyás előtt ellenőrzendő.",
      status: "review",
      userModified: false,
      createdAt: now,
      updatedAt: now,
    } satisfies SurveyPlanWallSuggestion;
  });
}

export function recalculateWallGeometry(
  wall: SurveyPlanWallSuggestion,
  input: {
    start?: SurveyNormalizedPoint;
    end?: SurveyNormalizedPoint;
    page: SurveyPlanPage;
    viewportWidth: number;
    viewportHeight: number;
    connectedRoom?: SurveyPlanSuggestion | null;
  },
): SurveyPlanWallSuggestion {
  const start = input.start || wall.start;
  const end = input.end || wall.end;
  const pixelsPerMeter = input.page.calibration.primary.pixelsPerMeter;
  const lengthPixels = segmentLengthPixels(start, end, input.viewportWidth, input.viewportHeight);
  const orientationDegrees = input.connectedRoom
    ? wallOrientationDegrees(start, end, input.connectedRoom.polygon, input.page.northAngle)
    : normalizeDegrees(Math.atan2(end.x - start.x, -(end.y - start.y)) * 180 / Math.PI - input.page.northAngle);
  const lengthMeters = pixelsPerMeter > 0 ? lengthPixels / pixelsPerMeter : 0;
  const grossAreaSquareMeters = lengthMeters * Math.max(0.1, wall.heightMeters || 2.7);
  const openingAreaSquareMeters = Math.max(0, wall.openingAreaSquareMeters || 0);
  return {
    ...wall,
    start,
    end,
    lengthMeters,
    grossAreaSquareMeters,
    openingAreaSquareMeters,
    netAreaSquareMeters: Math.max(0, grossAreaSquareMeters - openingAreaSquareMeters),
    orientationDegrees,
    orientationLabel: orientationLabelFromDegrees(orientationDegrees),
    source: "userCorrected",
    userModified: true,
    updatedAt: new Date().toISOString(),
  };
}

export function wallMidpoint(wall: Pick<SurveyPlanWallSuggestion, "start" | "end">) {
  return {
    x: (wall.start.x + wall.end.x) / 2,
    y: (wall.start.y + wall.end.y) / 2,
  };
}
