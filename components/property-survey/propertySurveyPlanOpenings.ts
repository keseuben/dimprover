import type {
  SurveyNormalizedPoint,
  SurveyPlanOpeningKind,
  SurveyPlanOpeningSuggestion,
  SurveyPlanPage,
  SurveyPlanWallSuggestion,
} from "@/components/property-survey/propertySurveyPlanDocumentTypes";

type PlanVectorContour = {
  points: SurveyNormalizedPoint[];
  closed: boolean;
  normalizedArea: number;
  bounds: { x: number; y: number; width: number; height: number };
};

type PlanTextItem = { text: string; x: number; y: number; width: number; height: number };

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function pointDistancePixels(left: SurveyNormalizedPoint, right: SurveyNormalizedPoint, viewportWidth: number, viewportHeight: number) {
  return Math.hypot((right.x - left.x) * viewportWidth, (right.y - left.y) * viewportHeight);
}

export function projectPointToWall(point: SurveyNormalizedPoint, wall: Pick<SurveyPlanWallSuggestion, "start" | "end">) {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const lengthSquared = dx * dx + dy * dy;
  const rawRatio = lengthSquared > 0 ? ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lengthSquared : 0;
  const ratio = clamp(rawRatio, 0, 1);
  const projected = { x: wall.start.x + dx * ratio, y: wall.start.y + dy * ratio };
  return { ratio, projected };
}

export function openingCenterOnWall(wall: Pick<SurveyPlanWallSuggestion, "start" | "end">, offsetRatio: number): SurveyNormalizedPoint {
  const ratio = clamp(offsetRatio, 0, 1);
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * ratio,
    y: wall.start.y + (wall.end.y - wall.start.y) * ratio,
  };
}

export function openingKindLabel(kind: SurveyPlanOpeningKind) {
  if (kind === "window") return "Ablak";
  if (kind === "door") return "Ajtó";
  if (kind === "balconyDoor") return "Erkélyajtó";
  if (kind === "garageDoor") return "Garázskapu";
  return "Nyílászáró";
}

function inferOpeningKind(text: string, widthMeters: number): SurveyPlanOpeningKind {
  const normalized = text.normalize("NFKC").toLocaleUpperCase("hu-HU");
  if (/GARÁZS|GARAZS|KAPU/.test(normalized) || widthMeters >= 2.8) return "garageDoor";
  if (/ERKÉLY|ERKELY|TERASZ/.test(normalized)) return "balconyDoor";
  if (/AJTÓ|AJTO|DOOR/.test(normalized)) return "door";
  if (/ABLAK|WINDOW/.test(normalized)) return "window";
  return "window";
}

function defaultOpeningHeight(kind: SurveyPlanOpeningKind) {
  if (kind === "garageDoor") return 2.25;
  if (kind === "door" || kind === "balconyDoor") return 2.1;
  return 1.5;
}

function defaultSillHeight(kind: SurveyPlanOpeningKind) {
  return kind === "window" ? 0.9 : 0;
}

function contourCenter(contour: PlanVectorContour): SurveyNormalizedPoint {
  return {
    x: contour.bounds.x + contour.bounds.width / 2,
    y: contour.bounds.y + contour.bounds.height / 2,
  };
}

function nearbyOpeningText(center: SurveyNormalizedPoint, items: PlanTextItem[]) {
  return items
    .filter((item) => Math.hypot(item.x + item.width / 2 - center.x, item.y + item.height / 2 - center.y) <= 0.08)
    .map((item) => item.text)
    .join(" ");
}

function contourSpanAlongWallPixels(contour: PlanVectorContour, wall: SurveyPlanWallSuggestion, viewportWidth: number, viewportHeight: number) {
  const wallDx = (wall.end.x - wall.start.x) * viewportWidth;
  const wallDy = (wall.end.y - wall.start.y) * viewportHeight;
  const wallLength = Math.hypot(wallDx, wallDy);
  if (wallLength <= 0) return 0;
  const unitX = wallDx / wallLength;
  const unitY = wallDy / wallLength;
  const corners = [
    { x: contour.bounds.x, y: contour.bounds.y },
    { x: contour.bounds.x + contour.bounds.width, y: contour.bounds.y },
    { x: contour.bounds.x + contour.bounds.width, y: contour.bounds.y + contour.bounds.height },
    { x: contour.bounds.x, y: contour.bounds.y + contour.bounds.height },
  ];
  const projections = corners.map((corner) => corner.x * viewportWidth * unitX + corner.y * viewportHeight * unitY);
  return Math.max(...projections) - Math.min(...projections);
}

function contourSpanPerpendicularPixels(contour: PlanVectorContour, wall: SurveyPlanWallSuggestion, viewportWidth: number, viewportHeight: number) {
  const wallDx = (wall.end.x - wall.start.x) * viewportWidth;
  const wallDy = (wall.end.y - wall.start.y) * viewportHeight;
  const wallLength = Math.hypot(wallDx, wallDy);
  if (wallLength <= 0) return Number.POSITIVE_INFINITY;
  const unitX = -wallDy / wallLength;
  const unitY = wallDx / wallLength;
  const corners = [
    { x: contour.bounds.x, y: contour.bounds.y },
    { x: contour.bounds.x + contour.bounds.width, y: contour.bounds.y },
    { x: contour.bounds.x + contour.bounds.width, y: contour.bounds.y + contour.bounds.height },
    { x: contour.bounds.x, y: contour.bounds.y + contour.bounds.height },
  ];
  const projections = corners.map((corner) => corner.x * viewportWidth * unitX + corner.y * viewportHeight * unitY);
  return Math.max(...projections) - Math.min(...projections);
}

export function recalculatePlanWallAreas(wall: SurveyPlanWallSuggestion, openings: SurveyPlanOpeningSuggestion[]) {
  const grossAreaSquareMeters = Math.max(0, wall.lengthMeters) * Math.max(0.1, wall.heightMeters);
  const openingAreaSquareMeters = openings
    .filter((opening) => opening.wallSuggestionId === wall.id && opening.status !== "ignored")
    .reduce((sum, opening) => sum + Math.max(0, opening.widthMeters) * Math.max(0, opening.heightMeters), 0);
  return {
    ...wall,
    grossAreaSquareMeters,
    openingAreaSquareMeters,
    netAreaSquareMeters: Math.max(0, grossAreaSquareMeters - openingAreaSquareMeters),
  };
}

export function recalculateAllPlanWallAreas(walls: SurveyPlanWallSuggestion[], openings: SurveyPlanOpeningSuggestion[]) {
  return walls.map((wall) => recalculatePlanWallAreas(wall, openings));
}

export function buildPlanOpeningSuggestions(input: {
  page: SurveyPlanPage;
  walls: SurveyPlanWallSuggestion[];
  vectorContours: PlanVectorContour[];
  textItems: PlanTextItem[];
  viewportWidth: number;
  viewportHeight: number;
  zoneByRoomSuggestionId?: Record<string, string>;
  idFactory: (prefix: string) => string;
}) {
  const now = new Date().toISOString();
  const pixelsPerMeter = input.page.calibration.primary.pixelsPerMeter;
  const usableWalls = input.walls.filter((wall) => wall.status !== "ignored" && wall.lengthMeters >= 0.4);
  const candidates = input.vectorContours.flatMap((contour) => {
    if (contour.points.length < 2) return [];
    const normalizedMaximum = Math.max(contour.bounds.width, contour.bounds.height);
    const normalizedMinimum = Math.min(contour.bounds.width, contour.bounds.height);
    if (normalizedMaximum < 0.003 || normalizedMaximum > 0.12 || normalizedMinimum > 0.055) return [];
    if (contour.normalizedArea > 0.006) return [];
    const center = contourCenter(contour);
    let best: { wall: SurveyPlanWallSuggestion; ratio: number; projected: SurveyNormalizedPoint; distancePixels: number; alongPixels: number; perpendicularPixels: number } | null = null;
    for (const wall of usableWalls) {
      const projection = projectPointToWall(center, wall);
      if (projection.ratio <= 0.015 || projection.ratio >= 0.985) continue;
      const distancePixels = pointDistancePixels(center, projection.projected, input.viewportWidth, input.viewportHeight);
      const alongPixels = contourSpanAlongWallPixels(contour, wall, input.viewportWidth, input.viewportHeight);
      const perpendicularPixels = contourSpanPerpendicularPixels(contour, wall, input.viewportWidth, input.viewportHeight);
      const maximumDistance = Math.max(10, perpendicularPixels * 1.8);
      if (distancePixels > maximumDistance) continue;
      if (!best || distancePixels < best.distancePixels) best = { wall, ratio: projection.ratio, projected: projection.projected, distancePixels, alongPixels, perpendicularPixels };
    }
    if (!best) return [];
    const fallbackWidth = Math.max(0.5, Math.min(5, best.wall.lengthMeters * Math.max(0.04, best.alongPixels / Math.max(1, pointDistancePixels(best.wall.start, best.wall.end, input.viewportWidth, input.viewportHeight)))));
    const widthMeters = pixelsPerMeter > 0 ? best.alongPixels / pixelsPerMeter : fallbackWidth;
    if (widthMeters < 0.45 || widthMeters > Math.min(6, best.wall.lengthMeters * 0.8)) return [];
    if (best.perpendicularPixels > Math.max(38, best.alongPixels * 0.75)) return [];
    const nearbyText = nearbyOpeningText(center, input.textItems);
    const kind = inferOpeningKind(nearbyText, widthMeters);
    const heightMeters = defaultOpeningHeight(kind);
    const confidenceScore = clamp(0.58 + (best.distancePixels <= 5 ? 0.18 : best.distancePixels <= 10 ? 0.1 : 0) + (pixelsPerMeter > 0 ? 0.08 : 0), 0, 0.88);
    const connectedRoomSuggestionIds = [...best.wall.connectedRoomSuggestionIds];
    const zoneId = connectedRoomSuggestionIds.map((id) => input.zoneByRoomSuggestionId?.[id] || "").find(Boolean) || best.wall.zoneId || "";
    return [{
      id: input.idFactory("opening-suggestion"),
      pageId: input.page.id,
      levelId: input.page.levelId,
      wallSuggestionId: best.wall.id,
      connectedRoomSuggestionIds,
      zoneId,
      name: `${openingKindLabel(kind)} ${Math.round(best.ratio * 100)}%`,
      kind,
      center: best.projected,
      offsetRatio: best.ratio,
      widthMeters: Number(widthMeters.toFixed(3)),
      heightMeters,
      sillHeightMeters: defaultSillHeight(kind),
      areaSquareMeters: Number((widthMeters * heightMeters).toFixed(3)),
      frame: "Ellenőrzendő",
      glazing: kind === "window" || kind === "balconyDoor" ? "Terv alapján ellenőrzendő" : "–",
      uValueWm2K: "",
      catalogProfileId: "custom",
      sourceReference: "",
      solarGValue: "",
      shading: "Nincs megadva",
      thermalBridgeMode: "none",
      installationPsiWmK: "",
      installationPsiSourceReference: "",
      confidence: confidenceScore >= 0.82 ? "high" : confidenceScore >= 0.62 ? "medium" : "low",
      confidenceScore,
      source: "vectorPdfRecognition",
      sourceDetails: `A fal közelében talált ${contour.closed ? "zárt" : "nyitott"} vektorgeometriából becsült nyílászáró. A típus, szélesség, magasság és parapet jóváhagyás előtt ellenőrzendő.${nearbyText ? ` Közeli felirat: ${nearbyText.slice(0, 80)}.` : ""}`,
      status: "review",
      userModified: false,
      createdAt: now,
      updatedAt: now,
    } satisfies SurveyPlanOpeningSuggestion];
  });

  return candidates.filter((candidate, index, allCandidates) => allCandidates.findIndex((other) => other.wallSuggestionId === candidate.wallSuggestionId && Math.abs(other.offsetRatio - candidate.offsetRatio) <= 0.035) === index);
}

export function createManualPlanOpening(input: {
  page: SurveyPlanPage;
  wall: SurveyPlanWallSuggestion;
  zoneId?: string;
  idFactory: (prefix: string) => string;
}) {
  const now = new Date().toISOString();
  const kind: SurveyPlanOpeningKind = "window";
  const widthMeters = Math.min(1.2, Math.max(0.5, input.wall.lengthMeters * 0.35));
  const heightMeters = 1.5;
  return {
    id: input.idFactory("manual-opening"),
    pageId: input.page.id,
    levelId: input.page.levelId,
    wallSuggestionId: input.wall.id,
    connectedRoomSuggestionIds: [...input.wall.connectedRoomSuggestionIds],
    zoneId: input.zoneId || input.wall.zoneId || "",
    name: "Új ablak",
    kind,
    center: openingCenterOnWall(input.wall, 0.5),
    offsetRatio: 0.5,
    widthMeters,
    heightMeters,
    sillHeightMeters: 0.9,
    areaSquareMeters: widthMeters * heightMeters,
    frame: "",
    glazing: "",
    uValueWm2K: "",
    catalogProfileId: "custom",
    sourceReference: "",
    solarGValue: "",
    shading: "Nincs megadva",
    thermalBridgeMode: "none",
    installationPsiWmK: "",
    installationPsiSourceReference: "",
    confidence: "manual",
    confidenceScore: 1,
    source: "manualDrawing",
    sourceDetails: "A felhasználó által kézzel, a kijelölt falszakaszhoz létrehozott nyílászáró.",
    status: "review",
    userModified: true,
    createdAt: now,
    updatedAt: now,
  } satisfies SurveyPlanOpeningSuggestion;
}
