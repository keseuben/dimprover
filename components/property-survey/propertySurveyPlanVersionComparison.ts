import type {
  PropertySurveyPlanDocumentWorkspace,
  SurveyNormalizedPoint,
  SurveyPlanDiffChangeType,
  SurveyPlanDiffDecision,
  SurveyPlanDiffKind,
  SurveyPlanDocument,
  SurveyPlanElementDiff,
  SurveyPlanOpeningSuggestion,
  SurveyPlanPage,
  SurveyPlanPagePair,
  SurveyPlanSuggestion,
  SurveyPlanVersionComparison,
  SurveyPlanWallSuggestion,
} from "@/components/property-survey/propertySurveyPlanDocumentTypes";

export type SurveyPlanVersionComparisonSummary = {
  comparison: SurveyPlanVersionComparison;
  baseDocument: SurveyPlanDocument;
  targetDocument: SurveyPlanDocument;
  totals: {
    basePageCount: number;
    targetPageCount: number;
    pairedPageCount: number;
    unpairedBasePageCount: number;
    unpairedTargetPageCount: number;
    diffCount: number;
    unchangedCount: number;
    addedCount: number;
    removedCount: number;
    modifiedCount: number;
    pendingCount: number;
    acceptedCount: number;
    rejectedCount: number;
  };
};

export type SurveyPlanVersionComparisonApplyResult = {
  workspace: PropertySurveyPlanDocumentWorkspace;
  comparison: SurveyPlanVersionComparison;
  acceptedCount: number;
  rejectedCount: number;
  pendingCount: number;
  targetApprovedCount: number;
  targetIgnoredCount: number;
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function rounded(value: unknown, digits = 4) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Number(number.toFixed(digits));
}

function normalizedText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stableId(prefix: string, values: string[]) {
  const text = values.join("|");
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${prefix}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function polygonCenter(points: SurveyNormalizedPoint[]) {
  if (!points.length) return { x: 0.5, y: 0.5 };
  return points.reduce((result, point) => ({ x: result.x + point.x / points.length, y: result.y + point.y / points.length }), { x: 0, y: 0 });
}

function pointDistance(left: SurveyNormalizedPoint, right: SurveyNormalizedPoint) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function similarity(left: number, right: number, tolerance: number) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
  return clamp01(1 - Math.abs(left - right) / Math.max(tolerance, Math.abs(left), Math.abs(right), 0.0001));
}

function angularSimilarity(left: number, right: number) {
  const difference = Math.abs((((left - right) % 360) + 540) % 360 - 180);
  return clamp01(1 - difference / 45);
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function pointsEqual(left: SurveyNormalizedPoint[], right: SurveyNormalizedPoint[]) {
  if (left.length !== right.length) return false;
  return left.every((point, index) => Math.abs(point.x - right[index].x) <= 0.002 && Math.abs(point.y - right[index].y) <= 0.002);
}

function changedRoomFields(base: SurveyPlanSuggestion, target: SurveyPlanSuggestion) {
  const fields: string[] = [];
  if (base.name !== target.name) fields.push("name");
  if (base.function !== target.function) fields.push("function");
  if (!pointsEqual(base.polygon, target.polygon)) fields.push("geometry");
  if (Math.abs(base.calculatedAreaSquareMeters - target.calculatedAreaSquareMeters) > 0.05) fields.push("area");
  if (Math.abs(base.roomHeightMeters - target.roomHeightMeters) > 0.01) fields.push("height");
  if (base.heated !== target.heated) fields.push("heated");
  return fields;
}

function changedWallFields(base: SurveyPlanWallSuggestion, target: SurveyPlanWallSuggestion, matchedRoomIds: Map<string, string>) {
  const fields: string[] = [];
  if (pointDistance(base.start, target.start) > 0.003 || pointDistance(base.end, target.end) > 0.003) fields.push("geometry");
  if (base.boundaryType !== target.boundaryType) fields.push("boundaryType");
  if (Math.abs(base.orientationDegrees - target.orientationDegrees) > 1) fields.push("orientation");
  if (Math.abs(base.lengthMeters - target.lengthMeters) > 0.02) fields.push("length");
  if (Math.abs(base.heightMeters - target.heightMeters) > 0.01) fields.push("height");
  if (Math.abs(base.thicknessMeters - target.thicknessMeters) > 0.005) fields.push("thickness");
  if (base.assemblyId !== target.assemblyId) fields.push("assembly");
  if (base.zoneId !== target.zoneId) fields.push("zone");
  if (base.adjacentZoneId !== target.adjacentZoneId) fields.push("adjacentZone");
  const mappedBaseRooms = base.connectedRoomSuggestionIds.map((id) => matchedRoomIds.get(id) || id).sort();
  if (!arraysEqual(mappedBaseRooms, [...target.connectedRoomSuggestionIds].sort())) fields.push("rooms");
  return fields;
}

function changedOpeningFields(base: SurveyPlanOpeningSuggestion, target: SurveyPlanOpeningSuggestion, matchedWallIds: Map<string, string>) {
  const fields: string[] = [];
  if ((matchedWallIds.get(base.wallSuggestionId) || base.wallSuggestionId) !== target.wallSuggestionId) fields.push("wall");
  if (base.name !== target.name) fields.push("name");
  if (base.kind !== target.kind) fields.push("kind");
  if (Math.abs(base.offsetRatio - target.offsetRatio) > 0.01) fields.push("offset");
  if (Math.abs(base.widthMeters - target.widthMeters) > 0.01) fields.push("width");
  if (Math.abs(base.heightMeters - target.heightMeters) > 0.01) fields.push("height");
  if (Math.abs(base.sillHeightMeters - target.sillHeightMeters) > 0.01) fields.push("sillHeight");
  if (base.frame !== target.frame) fields.push("frame");
  if (base.glazing !== target.glazing) fields.push("glazing");
  if (base.uValueWm2K !== target.uValueWm2K) fields.push("uValue");
  if (base.sourceReference !== target.sourceReference) fields.push("sourceReference");
  if (base.solarGValue !== target.solarGValue) fields.push("solarGValue");
  if (base.shading !== target.shading) fields.push("shading");
  if (base.thermalBridgeMode !== target.thermalBridgeMode || base.installationPsiWmK !== target.installationPsiWmK || base.installationPsiSourceReference !== target.installationPsiSourceReference) fields.push("thermalBridge");
  if (base.zoneId !== target.zoneId) fields.push("zone");
  return fields;
}

function pagePairScore(base: SurveyPlanPage, target: SurveyPlanPage) {
  const baseLabel = normalizedText(base.pageLabel);
  const targetLabel = normalizedText(target.pageLabel);
  if (base.levelId !== target.levelId && baseLabel !== targetLabel) return 0;
  if (base.planType !== target.planType && baseLabel !== targetLabel) return 0;
  let score = 0;
  if (base.levelId === target.levelId) score += 0.32;
  if (base.planType === target.planType) score += 0.22;
  if (baseLabel && baseLabel === targetLabel) score += 0.2;
  if (base.pageNumber === target.pageNumber) score += 0.16;
  if (base.contentKind === target.contentKind) score += 0.05;
  if (base.recognitionMode === target.recognitionMode) score += 0.05;
  return clamp01(score);
}

function roomMatchScore(base: SurveyPlanSuggestion, target: SurveyPlanSuggestion) {
  const baseCenter = polygonCenter(base.polygon);
  const targetCenter = polygonCenter(target.polygon);
  const nameScore = normalizedText(base.name) && normalizedText(base.name) === normalizedText(target.name) ? 1 : 0;
  const functionScore = normalizedText(base.function) && normalizedText(base.function) === normalizedText(target.function) ? 1 : 0;
  const centerScore = clamp01(1 - pointDistance(baseCenter, targetCenter) / 0.3);
  const areaScore = similarity(base.calculatedAreaSquareMeters, target.calculatedAreaSquareMeters, 5);
  return clamp01(nameScore * 0.38 + functionScore * 0.14 + centerScore * 0.24 + areaScore * 0.24);
}

function wallMidpoint(wall: SurveyPlanWallSuggestion) {
  return { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
}

function wallMatchScore(base: SurveyPlanWallSuggestion, target: SurveyPlanWallSuggestion, matchedRoomIds: Map<string, string>) {
  const mappedRooms = base.connectedRoomSuggestionIds.map((id) => matchedRoomIds.get(id)).filter((id): id is string => Boolean(id));
  const targetRooms = new Set(target.connectedRoomSuggestionIds);
  const hasMappedRoomRelation = mappedRooms.some((id) => targetRooms.has(id));
  if (base.connectedRoomSuggestionIds.length && target.connectedRoomSuggestionIds.length && !hasMappedRoomRelation) return 0;
  const midpointScore = clamp01(1 - pointDistance(wallMidpoint(base), wallMidpoint(target)) / 0.25);
  const orientationScore = angularSimilarity(base.orientationDegrees, target.orientationDegrees);
  const lengthScore = similarity(base.lengthMeters, target.lengthMeters, 2);
  const typeScore = base.boundaryType === target.boundaryType ? 1 : 0;
  const levelScore = base.levelId === target.levelId ? 1 : 0;
  const roomScore = hasMappedRoomRelation ? 1 : 0.35;
  return clamp01(midpointScore * 0.22 + orientationScore * 0.2 + lengthScore * 0.18 + typeScore * 0.1 + levelScore * 0.1 + roomScore * 0.2);
}

function openingMatchScore(base: SurveyPlanOpeningSuggestion, target: SurveyPlanOpeningSuggestion, matchedWallIds: Map<string, string>) {
  const mappedWallId = matchedWallIds.get(base.wallSuggestionId);
  if (base.wallSuggestionId && target.wallSuggestionId && mappedWallId !== target.wallSuggestionId) return 0;
  const wallScore = mappedWallId === target.wallSuggestionId ? 1 : 0;
  const kindScore = base.kind === target.kind ? 1 : 0;
  const offsetScore = similarity(base.offsetRatio, target.offsetRatio, 0.25);
  const widthScore = similarity(base.widthMeters, target.widthMeters, 0.5);
  const heightScore = similarity(base.heightMeters, target.heightMeters, 0.5);
  const nameScore = normalizedText(base.name) && normalizedText(base.name) === normalizedText(target.name) ? 1 : 0;
  return clamp01(wallScore * 0.28 + kindScore * 0.2 + offsetScore * 0.2 + widthScore * 0.13 + heightScore * 0.13 + nameScore * 0.06);
}

function pairElements<TBase extends { id: string }, TTarget extends { id: string }>(input: {
  kind: SurveyPlanDiffKind;
  baseElements: TBase[];
  targetElements: TTarget[];
  score: (base: TBase, target: TTarget) => number;
  changedFields: (base: TBase, target: TTarget) => string[];
  threshold: number;
  previousDecisions: Map<string, SurveyPlanDiffDecision>;
  now: string;
}) {
  const candidates = input.baseElements.flatMap((base) => input.targetElements.map((target) => ({ base, target, score: input.score(base, target) })))
    .filter((candidate) => candidate.score >= input.threshold)
    .sort((left, right) => right.score - left.score);
  const usedBase = new Set<string>();
  const usedTarget = new Set<string>();
  const diffs: SurveyPlanElementDiff[] = [];
  for (const candidate of candidates) {
    if (usedBase.has(candidate.base.id) || usedTarget.has(candidate.target.id)) continue;
    usedBase.add(candidate.base.id);
    usedTarget.add(candidate.target.id);
    const fields = input.changedFields(candidate.base, candidate.target);
    const changeType: SurveyPlanDiffChangeType = fields.length ? "modified" : "unchanged";
    const id = stableId(`plan-diff-${input.kind}`, [candidate.base.id, candidate.target.id]);
    diffs.push({
      id,
      kind: input.kind,
      baseElementId: candidate.base.id,
      targetElementId: candidate.target.id,
      changeType,
      changedFields: fields,
      matchScore: rounded(candidate.score, 4),
      decision: changeType === "unchanged" ? "accepted" : input.previousDecisions.get(id) || "pending",
      updatedAt: input.now,
    });
  }
  input.baseElements.filter((element) => !usedBase.has(element.id)).forEach((element) => {
    const id = stableId(`plan-diff-${input.kind}`, [element.id, "removed"]);
    diffs.push({ id, kind: input.kind, baseElementId: element.id, targetElementId: "", changeType: "removed", changedFields: ["removed"], matchScore: 0, decision: input.previousDecisions.get(id) || "pending", updatedAt: input.now });
  });
  input.targetElements.filter((element) => !usedTarget.has(element.id)).forEach((element) => {
    const id = stableId(`plan-diff-${input.kind}`, ["added", element.id]);
    diffs.push({ id, kind: input.kind, baseElementId: "", targetElementId: element.id, changeType: "added", changedFields: ["added"], matchScore: 0, decision: input.previousDecisions.get(id) || "pending", updatedAt: input.now });
  });
  return diffs.sort((left, right) => `${left.kind}-${left.changeType}-${left.id}`.localeCompare(`${right.kind}-${right.changeType}-${right.id}`));
}

function buildElementDiffs(basePage: SurveyPlanPage, targetPage: SurveyPlanPage, previousDiffs: SurveyPlanElementDiff[], now: string) {
  const previousDecisions = new Map(previousDiffs.map((diff) => [diff.id, diff.decision]));
  const roomDiffs = pairElements({
    kind: "room",
    baseElements: basePage.suggestions.filter((item) => item.status !== "ignored"),
    targetElements: targetPage.suggestions.filter((item) => item.status !== "ignored"),
    score: roomMatchScore,
    changedFields: changedRoomFields,
    threshold: 0.42,
    previousDecisions,
    now,
  });
  const roomMap = new Map(roomDiffs.filter((diff) => diff.baseElementId && diff.targetElementId).map((diff) => [diff.baseElementId, diff.targetElementId]));
  const wallDiffs = pairElements({
    kind: "wall",
    baseElements: basePage.wallSuggestions.filter((item) => item.status !== "ignored"),
    targetElements: targetPage.wallSuggestions.filter((item) => item.status !== "ignored"),
    score: (base, target) => wallMatchScore(base, target, roomMap),
    changedFields: (base, target) => changedWallFields(base, target, roomMap),
    threshold: 0.48,
    previousDecisions,
    now,
  });
  const wallMap = new Map(wallDiffs.filter((diff) => diff.baseElementId && diff.targetElementId).map((diff) => [diff.baseElementId, diff.targetElementId]));
  const openingDiffs = pairElements({
    kind: "opening",
    baseElements: basePage.openingSuggestions.filter((item) => item.status !== "ignored"),
    targetElements: targetPage.openingSuggestions.filter((item) => item.status !== "ignored"),
    score: (base, target) => openingMatchScore(base, target, wallMap),
    changedFields: (base, target) => changedOpeningFields(base, target, wallMap),
    threshold: 0.48,
    previousDecisions,
    now,
  });
  return [...roomDiffs, ...wallDiffs, ...openingDiffs];
}

function buildUnpairedSurveyPlanPagePair(input: {
  basePage?: SurveyPlanPage | null;
  targetPage?: SurveyPlanPage | null;
  method?: SurveyPlanPagePair["method"];
  previousPair?: SurveyPlanPagePair | null;
  now?: string;
}) {
  if (!input.basePage && !input.targetPage) throw new Error("Az oldal-diffhez legalább egy tervlap szükséges.");
  const now = input.now || new Date().toISOString();
  const previousDecisions = new Map((input.previousPair?.elementDiffs || []).map((diff) => [diff.id, diff.decision]));
  const changeType: SurveyPlanDiffChangeType = input.targetPage ? "added" : "removed";
  const createDiff = (kind: SurveyPlanDiffKind, elementId: string): SurveyPlanElementDiff => {
    const baseElementId = input.basePage ? elementId : "";
    const targetElementId = input.targetPage ? elementId : "";
    const id = stableId(`plan-diff-${kind}`, input.targetPage ? ["added", elementId] : [elementId, "removed"]);
    return { id, kind, baseElementId, targetElementId, changeType, changedFields: [changeType], matchScore: 0, decision: previousDecisions.get(id) || "pending", updatedAt: now };
  };
  const page = input.targetPage || input.basePage;
  if (!page) throw new Error("Az oldal-diff forrásterve hiányzik.");
  const elementDiffs = [
    ...page.suggestions.filter((item) => item.status !== "ignored").map((item) => createDiff("room", item.id)),
    ...page.wallSuggestions.filter((item) => item.status !== "ignored").map((item) => createDiff("wall", item.id)),
    ...page.openingSuggestions.filter((item) => item.status !== "ignored").map((item) => createDiff("opening", item.id)),
  ];
  return {
    id: input.previousPair?.id || stableId("plan-page-pair", [input.basePage?.id || "added", input.targetPage?.id || "removed"]),
    basePageId: input.basePage?.id || "",
    targetPageId: input.targetPage?.id || "",
    method: input.method || input.previousPair?.method || "automatic",
    confidenceScore: 0,
    elementDiffs,
    updatedAt: now,
  } satisfies SurveyPlanPagePair;
}

export function buildSurveyPlanPagePair(input: {
  basePage: SurveyPlanPage;
  targetPage: SurveyPlanPage;
  method?: SurveyPlanPagePair["method"];
  previousPair?: SurveyPlanPagePair | null;
  now?: string;
}): SurveyPlanPagePair {
  const now = input.now || new Date().toISOString();
  return {
    id: input.previousPair?.id || stableId("plan-page-pair", [input.basePage.id, input.targetPage.id]),
    basePageId: input.basePage.id,
    targetPageId: input.targetPage.id,
    method: input.method || input.previousPair?.method || "automatic",
    confidenceScore: rounded(pagePairScore(input.basePage, input.targetPage), 4),
    elementDiffs: buildElementDiffs(input.basePage, input.targetPage, input.previousPair?.elementDiffs || [], now),
    updatedAt: now,
  };
}

export function autoPairSurveyPlanPages(input: {
  baseDocument: SurveyPlanDocument;
  targetDocument: SurveyPlanDocument;
  previousPairs?: SurveyPlanPagePair[];
  now?: string;
}) {
  const now = input.now || new Date().toISOString();
  const previousByPages = new Map((input.previousPairs || []).map((pair) => [`${pair.basePageId}|${pair.targetPageId}`, pair]));
  const manualPairs = (input.previousPairs || []).filter((pair) => pair.method === "manual").flatMap((pair) => {
    const basePage = input.baseDocument.pages.find((page) => page.id === pair.basePageId) || null;
    const targetPage = input.targetDocument.pages.find((page) => page.id === pair.targetPageId) || null;
    if (basePage && targetPage) return [buildSurveyPlanPagePair({ basePage, targetPage, method: "manual", previousPair: pair, now })];
    if (basePage || targetPage) return [buildUnpairedSurveyPlanPagePair({ basePage, targetPage, method: "manual", previousPair: pair, now })];
    return [];
  });
  const usedBase = new Set(manualPairs.map((pair) => pair.basePageId));
  const usedTarget = new Set(manualPairs.map((pair) => pair.targetPageId));
  const candidates = input.baseDocument.pages.flatMap((basePage) => input.targetDocument.pages.map((targetPage) => ({ basePage, targetPage, score: pagePairScore(basePage, targetPage) })))
    .filter((candidate) => !usedBase.has(candidate.basePage.id) && !usedTarget.has(candidate.targetPage.id) && candidate.score >= 0.42)
    .sort((left, right) => right.score - left.score);
  const automaticPairs: SurveyPlanPagePair[] = [];
  for (const candidate of candidates) {
    if (usedBase.has(candidate.basePage.id) || usedTarget.has(candidate.targetPage.id)) continue;
    usedBase.add(candidate.basePage.id);
    usedTarget.add(candidate.targetPage.id);
    const previousPair = previousByPages.get(`${candidate.basePage.id}|${candidate.targetPage.id}`) || null;
    automaticPairs.push(buildSurveyPlanPagePair({ basePage: candidate.basePage, targetPage: candidate.targetPage, previousPair, method: "automatic", now }));
  }
  const unpairedPairs = [
    ...input.baseDocument.pages.filter((page) => !usedBase.has(page.id)).map((basePage) => buildUnpairedSurveyPlanPagePair({ basePage, previousPair: previousByPages.get(`${basePage.id}|`) || null, now })),
    ...input.targetDocument.pages.filter((page) => !usedTarget.has(page.id)).map((targetPage) => buildUnpairedSurveyPlanPagePair({ targetPage, previousPair: previousByPages.get(`|${targetPage.id}`) || null, now })),
  ];
  return [...manualPairs, ...automaticPairs, ...unpairedPairs].sort((left, right) => {
    const leftTarget = input.targetDocument.pages.find((page) => page.id === left.targetPageId)?.pageNumber;
    const rightTarget = input.targetDocument.pages.find((page) => page.id === right.targetPageId)?.pageNumber;
    if (leftTarget != null || rightTarget != null) return (leftTarget ?? 10000) - (rightTarget ?? 10000);
    const leftBase = input.baseDocument.pages.find((page) => page.id === left.basePageId)?.pageNumber || 0;
    const rightBase = input.baseDocument.pages.find((page) => page.id === right.basePageId)?.pageNumber || 0;
    return leftBase - rightBase;
  });
}

export function createSurveyPlanVersionComparison(input: {
  workspace: PropertySurveyPlanDocumentWorkspace;
  baseDocumentId: string;
  targetDocumentId: string;
  now?: string;
}) {
  if (input.baseDocumentId === input.targetDocumentId) throw new Error("Ugyanaz a dokumentum nem hasonlítható önmagához.");
  const baseDocument = input.workspace.documents.find((document) => document.id === input.baseDocumentId);
  const targetDocument = input.workspace.documents.find((document) => document.id === input.targetDocumentId);
  if (!baseDocument || !targetDocument) throw new Error("A kiválasztott tervdokumentum-verzió nem található.");
  const now = input.now || new Date().toISOString();
  const id = stableId("plan-version-comparison", [baseDocument.id, targetDocument.id]);
  const previous = input.workspace.versionComparison.comparisons[id] || null;
  const comparison: SurveyPlanVersionComparison = {
    id,
    baseDocumentId: baseDocument.id,
    targetDocumentId: targetDocument.id,
    status: previous?.status === "applied" ? "review" : previous?.status || "draft",
    pagePairs: autoPairSurveyPlanPages({ baseDocument, targetDocument, previousPairs: previous?.pagePairs, now }),
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    appliedAt: previous?.appliedAt || "",
  };
  const versionGroupId = baseDocument.versionGroupId || targetDocument.versionGroupId || stableId("plan-version-group", [baseDocument.id, targetDocument.id]);
  const documents = input.workspace.documents.map((document) => {
    if (document.id === baseDocument.id) return { ...document, versionGroupId, isCurrentVersion: false, updatedAt: now };
    if (document.id === targetDocument.id) return { ...document, versionGroupId, supersedesDocumentId: baseDocument.id, isCurrentVersion: true, updatedAt: now };
    return document.versionGroupId === versionGroupId ? { ...document, isCurrentVersion: false } : document;
  });
  return {
    ...input.workspace,
    documents,
    versionComparison: {
      ...input.workspace.versionComparison,
      version: "1" as const,
      comparisons: { ...input.workspace.versionComparison.comparisons, [comparison.id]: comparison },
      activeComparisonId: comparison.id,
      updatedAt: now,
    },
    updatedAt: now,
  };
}

export function rebuildSurveyPlanVersionComparison(input: {
  workspace: PropertySurveyPlanDocumentWorkspace;
  comparisonId: string;
  now?: string;
}) {
  const comparison = input.workspace.versionComparison.comparisons[input.comparisonId];
  if (!comparison) return input.workspace;
  return createSurveyPlanVersionComparison({ workspace: input.workspace, baseDocumentId: comparison.baseDocumentId, targetDocumentId: comparison.targetDocumentId, now: input.now });
}

export function setSurveyPlanPagePair(input: {
  workspace: PropertySurveyPlanDocumentWorkspace;
  comparisonId: string;
  targetPageId: string;
  basePageId: string;
  now?: string;
}) {
  const comparison = input.workspace.versionComparison.comparisons[input.comparisonId];
  if (!comparison) return input.workspace;
  const baseDocument = input.workspace.documents.find((document) => document.id === comparison.baseDocumentId);
  const targetDocument = input.workspace.documents.find((document) => document.id === comparison.targetDocumentId);
  const targetPage = targetDocument?.pages.find((page) => page.id === input.targetPageId);
  const basePage = baseDocument?.pages.find((page) => page.id === input.basePageId) || null;
  if (!baseDocument || !targetDocument || !targetPage) return input.workspace;
  const now = input.now || new Date().toISOString();
  const remainingPairs = comparison.pagePairs.filter((pair) => pair.targetPageId !== targetPage.id && (!basePage || pair.basePageId !== basePage.id));
  const previousPair = comparison.pagePairs.find((pair) => pair.targetPageId === targetPage.id && pair.basePageId === (basePage?.id || "")) || null;
  const manualPair = basePage
    ? buildSurveyPlanPagePair({ basePage, targetPage, method: "manual", previousPair, now })
    : buildUnpairedSurveyPlanPagePair({ targetPage, method: "manual", previousPair, now });
  const pagePairs = autoPairSurveyPlanPages({ baseDocument, targetDocument, previousPairs: [...remainingPairs, manualPair], now });
  const updatedComparison = { ...comparison, status: "review" as const, pagePairs, updatedAt: now, appliedAt: "" };
  return {
    ...input.workspace,
    versionComparison: {
      ...input.workspace.versionComparison,
      comparisons: { ...input.workspace.versionComparison.comparisons, [comparison.id]: updatedComparison },
      activeComparisonId: comparison.id,
      updatedAt: now,
    },
    updatedAt: now,
  };
}

export function removeSurveyPlanPagePair(input: {
  workspace: PropertySurveyPlanDocumentWorkspace;
  comparisonId: string;
  targetPageId: string;
  now?: string;
}) {
  const comparison = input.workspace.versionComparison.comparisons[input.comparisonId];
  if (!comparison) return input.workspace;
  const now = input.now || new Date().toISOString();
  const updatedComparison = { ...comparison, status: "review" as const, pagePairs: comparison.pagePairs.filter((pair) => pair.targetPageId !== input.targetPageId), updatedAt: now, appliedAt: "" };
  return {
    ...input.workspace,
    versionComparison: { ...input.workspace.versionComparison, comparisons: { ...input.workspace.versionComparison.comparisons, [comparison.id]: updatedComparison }, updatedAt: now },
    updatedAt: now,
  };
}

export function setSurveyPlanElementDiffDecision(input: {
  workspace: PropertySurveyPlanDocumentWorkspace;
  comparisonId: string;
  pairId: string;
  diffId: string;
  decision: SurveyPlanDiffDecision;
  now?: string;
}) {
  const comparison = input.workspace.versionComparison.comparisons[input.comparisonId];
  if (!comparison) return input.workspace;
  const now = input.now || new Date().toISOString();
  const pagePairs = comparison.pagePairs.map((pair) => pair.id === input.pairId ? {
    ...pair,
    elementDiffs: pair.elementDiffs.map((diff) => diff.id === input.diffId ? { ...diff, decision: input.decision, updatedAt: now } : diff),
    updatedAt: now,
  } : pair);
  const updatedComparison = { ...comparison, status: "review" as const, pagePairs, updatedAt: now, appliedAt: "" };
  return {
    ...input.workspace,
    versionComparison: { ...input.workspace.versionComparison, comparisons: { ...input.workspace.versionComparison.comparisons, [comparison.id]: updatedComparison }, updatedAt: now },
    updatedAt: now,
  };
}

export function setSurveyPlanDiffDecisions(input: {
  workspace: PropertySurveyPlanDocumentWorkspace;
  comparisonId: string;
  pairId?: string;
  decision: SurveyPlanDiffDecision;
  onlyChangeTypes?: SurveyPlanDiffChangeType[];
  now?: string;
}) {
  const comparison = input.workspace.versionComparison.comparisons[input.comparisonId];
  if (!comparison) return input.workspace;
  const now = input.now || new Date().toISOString();
  const allowed = input.onlyChangeTypes ? new Set(input.onlyChangeTypes) : null;
  const pagePairs = comparison.pagePairs.map((pair) => input.pairId && pair.id !== input.pairId ? pair : {
    ...pair,
    elementDiffs: pair.elementDiffs.map((diff) => diff.changeType === "unchanged" || (allowed && !allowed.has(diff.changeType)) ? diff : { ...diff, decision: input.decision, updatedAt: now }),
    updatedAt: now,
  });
  const updatedComparison = { ...comparison, status: "review" as const, pagePairs, updatedAt: now, appliedAt: "" };
  return {
    ...input.workspace,
    versionComparison: { ...input.workspace.versionComparison, comparisons: { ...input.workspace.versionComparison.comparisons, [comparison.id]: updatedComparison }, updatedAt: now },
    updatedAt: now,
  };
}

function applyTargetDecision<T extends { id: string; status: string; updatedAt: string }>(elements: T[], diffs: SurveyPlanElementDiff[], kind: SurveyPlanDiffKind, now: string) {
  const decisions = new Map(diffs.filter((diff) => diff.kind === kind && diff.targetElementId && diff.changeType !== "unchanged").map((diff) => [diff.targetElementId, diff.decision]));
  return elements.map((element) => {
    const decision = decisions.get(element.id);
    if (decision === "accepted") return { ...element, status: "approved", updatedAt: now } as T;
    if (decision === "rejected") return { ...element, status: "ignored", updatedAt: now } as T;
    return element;
  });
}

export function applySurveyPlanVersionComparisonDecisions(input: {
  workspace: PropertySurveyPlanDocumentWorkspace;
  comparisonId: string;
  now?: string;
}): SurveyPlanVersionComparisonApplyResult {
  const comparison = input.workspace.versionComparison.comparisons[input.comparisonId];
  if (!comparison) throw new Error("A tervverzió-összehasonlítás nem található.");
  const targetDocument = input.workspace.documents.find((document) => document.id === comparison.targetDocumentId);
  if (!targetDocument) throw new Error("Az új tervverzió dokumentuma nem található.");
  const now = input.now || new Date().toISOString();
  const diffs = comparison.pagePairs.flatMap((pair) => pair.elementDiffs);
  const acceptedCount = diffs.filter((diff) => diff.changeType !== "unchanged" && diff.decision === "accepted").length;
  const rejectedCount = diffs.filter((diff) => diff.changeType !== "unchanged" && diff.decision === "rejected").length;
  const pendingCount = diffs.filter((diff) => diff.changeType !== "unchanged" && diff.decision === "pending").length;
  const targetPageDiffs = new Map(comparison.pagePairs.map((pair) => [pair.targetPageId, pair.elementDiffs]));
  let targetApprovedCount = 0;
  let targetIgnoredCount = 0;
  const documents = input.workspace.documents.map((document) => document.id !== targetDocument.id ? document : {
    ...document,
    pages: document.pages.map((page) => {
      const pageDiffs = targetPageDiffs.get(page.id) || [];
      const suggestions = applyTargetDecision(page.suggestions, pageDiffs, "room", now);
      const wallSuggestions = applyTargetDecision(page.wallSuggestions, pageDiffs, "wall", now);
      const openingSuggestions = applyTargetDecision(page.openingSuggestions, pageDiffs, "opening", now);
      targetApprovedCount += suggestions.filter((item) => item.status === "approved").length + wallSuggestions.filter((item) => item.status === "approved").length + openingSuggestions.filter((item) => item.status === "approved").length;
      targetIgnoredCount += suggestions.filter((item) => item.status === "ignored").length + wallSuggestions.filter((item) => item.status === "ignored").length + openingSuggestions.filter((item) => item.status === "ignored").length;
      return { ...page, suggestions, wallSuggestions, openingSuggestions, updatedAt: now };
    }),
    isCurrentVersion: true,
    updatedAt: now,
  });
  const updatedComparison: SurveyPlanVersionComparison = { ...comparison, status: pendingCount ? "review" : "applied", updatedAt: now, appliedAt: pendingCount ? "" : now };
  const workspace: PropertySurveyPlanDocumentWorkspace = {
    ...input.workspace,
    documents,
    activeDocumentId: targetDocument.id,
    activePageId: targetDocument.pages[0]?.id || input.workspace.activePageId,
    versionComparison: {
      ...input.workspace.versionComparison,
      comparisons: { ...input.workspace.versionComparison.comparisons, [comparison.id]: updatedComparison },
      activeComparisonId: comparison.id,
      updatedAt: now,
    },
    updatedAt: now,
  };
  return { workspace, comparison: updatedComparison, acceptedCount, rejectedCount, pendingCount, targetApprovedCount, targetIgnoredCount };
}

export function buildSurveyPlanVersionComparisonSummary(input: {
  workspace: PropertySurveyPlanDocumentWorkspace;
  comparisonId?: string | null;
}): SurveyPlanVersionComparisonSummary | null {
  const comparisonId = input.comparisonId || input.workspace.versionComparison.activeComparisonId;
  const comparison = comparisonId ? input.workspace.versionComparison.comparisons[comparisonId] : null;
  if (!comparison) return null;
  const baseDocument = input.workspace.documents.find((document) => document.id === comparison.baseDocumentId);
  const targetDocument = input.workspace.documents.find((document) => document.id === comparison.targetDocumentId);
  if (!baseDocument || !targetDocument) return null;
  const diffs = comparison.pagePairs.flatMap((pair) => pair.elementDiffs);
  const pairedBasePageIds = new Set(comparison.pagePairs.map((pair) => pair.basePageId));
  const pairedTargetPageIds = new Set(comparison.pagePairs.map((pair) => pair.targetPageId));
  return {
    comparison,
    baseDocument,
    targetDocument,
    totals: {
      basePageCount: baseDocument.pages.length,
      targetPageCount: targetDocument.pages.length,
      pairedPageCount: comparison.pagePairs.length,
      unpairedBasePageCount: baseDocument.pages.filter((page) => !pairedBasePageIds.has(page.id)).length,
      unpairedTargetPageCount: targetDocument.pages.filter((page) => !pairedTargetPageIds.has(page.id)).length,
      diffCount: diffs.length,
      unchangedCount: diffs.filter((diff) => diff.changeType === "unchanged").length,
      addedCount: diffs.filter((diff) => diff.changeType === "added").length,
      removedCount: diffs.filter((diff) => diff.changeType === "removed").length,
      modifiedCount: diffs.filter((diff) => diff.changeType === "modified").length,
      pendingCount: diffs.filter((diff) => diff.changeType !== "unchanged" && diff.decision === "pending").length,
      acceptedCount: diffs.filter((diff) => diff.changeType !== "unchanged" && diff.decision === "accepted").length,
      rejectedCount: diffs.filter((diff) => diff.changeType !== "unchanged" && diff.decision === "rejected").length,
    },
  };
}

export const surveyPlanDiffChangeTypeLabels: Record<SurveyPlanDiffChangeType, string> = {
  unchanged: "Változatlan",
  added: "Új elem",
  removed: "Törölt elem",
  modified: "Módosított elem",
};

export const surveyPlanDiffDecisionLabels: Record<SurveyPlanDiffDecision, string> = {
  pending: "Függőben",
  accepted: "Elfogadva",
  rejected: "Elutasítva",
};

export const surveyPlanDiffKindLabels: Record<SurveyPlanDiffKind, string> = {
  room: "Helyiség",
  wall: "Fal",
  opening: "Nyílászáró",
};
