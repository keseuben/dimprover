import { createEnergyOpeningDetail, createEnergyThermalBridge, type EnergyOpeningWorkspace } from "@/components/energy/domain/energyOpeningTypes";
import type { EnergyZoneWorkspace } from "@/components/energy/domain/energyZoneTypes";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import type { SurveyConstructionAssembly } from "@/components/property-survey/propertySurveyEnergyModel";
import {
  type SurveyOpeningKind,
  type SurveyWallBoundaryType,
  type SurveyWallOpening,
  type SurveyWallSegment,
  type SurveyWallSide,
} from "@/components/property-survey/propertySurveyBuildingModel";
import type {
  SurveyPlanOpeningSuggestion,
  SurveyPlanPage,
  SurveyPlanWallBoundaryType,
  SurveyPlanWallSuggestion,
} from "@/components/property-survey/propertySurveyPlanDocumentTypes";

export type SurveyPlanEnergyTransferIssue = {
  code: string;
  severity: "warning" | "error";
  blocking: boolean;
  entityType: "page" | "wall" | "opening";
  entityId: string;
  message: string;
};

export type SurveyPlanEnergyTransferPreview = {
  pageId: string;
  approvedWallCount: number;
  approvedOpeningCount: number;
  wallCreateCount: number;
  wallUpdateCount: number;
  openingCreateCount: number;
  openingUpdateCount: number;
  generatedThermalBridgeCount: number;
  affectedRoomIds: string[];
  issues: SurveyPlanEnergyTransferIssue[];
  blockingIssueCount: number;
  warningCount: number;
  canTransfer: boolean;
};

export type SurveyPlanEnergyTransferResult = SurveyPlanEnergyTransferPreview & {
  transferredAt: string;
  wallSegments: SurveyWallSegment[];
  wallOpenings: SurveyWallOpening[];
  rooms: SurveyRoom[];
  zoneWorkspace: EnergyZoneWorkspace;
  openingWorkspace: EnergyOpeningWorkspace;
};

type TransferInput = {
  page: SurveyPlanPage;
  rooms: SurveyRoom[];
  wallSegments: SurveyWallSegment[];
  wallOpenings: SurveyWallOpening[];
  assemblies: SurveyConstructionAssembly[];
  zoneWorkspace: EnergyZoneWorkspace;
  openingWorkspace: EnergyOpeningWorkspace;
};

const PLAN_WIDTH = 900;
const PLAN_HEIGHT = 610;
const envelopeBoundaryTypes = new Set<SurveyWallBoundaryType>(["external", "unheated", "adjacent", "ground"]);

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function parsePositive(value: unknown) {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegative(value: unknown) {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function wallBoundaryType(boundaryType: SurveyPlanWallBoundaryType): SurveyWallBoundaryType | null {
  if (boundaryType === "externalAir") return "external";
  if (boundaryType === "ground") return "ground";
  if (boundaryType === "unheatedSpace") return "unheated";
  if (boundaryType === "adjacentBuilding") return "adjacent";
  if (boundaryType === "internal") return "internal";
  return null;
}

function openingKind(kind: SurveyPlanOpeningSuggestion["kind"]): SurveyOpeningKind | null {
  return kind === "window" || kind === "door" || kind === "balconyDoor" || kind === "garageDoor" ? kind : null;
}

function roomBySuggestionId(rooms: SurveyRoom[]) {
  return new Map(rooms.filter((room) => room.planSuggestionId).map((room) => [room.planSuggestionId as string, room]));
}

function wallRoom(wall: SurveyPlanWallSuggestion, roomMap: Map<string, SurveyRoom>) {
  for (const suggestionId of wall.connectedRoomSuggestionIds) {
    const room = roomMap.get(suggestionId);
    if (room) return room;
  }
  return null;
}

function secondaryWallRoom(wall: SurveyPlanWallSuggestion, primaryRoom: SurveyRoom, roomMap: Map<string, SurveyRoom>, zoneWorkspace: EnergyZoneWorkspace, rooms: SurveyRoom[]) {
  for (const suggestionId of wall.connectedRoomSuggestionIds) {
    const room = roomMap.get(suggestionId);
    if (room && room.id !== primaryRoom.id) return room;
  }
  if (!wall.adjacentZoneId) return null;
  return rooms.find((room) => room.id !== primaryRoom.id && (zoneWorkspace.roomAssignments[room.id] === wall.adjacentZoneId || zoneWorkspace.unheatedRoomAssignments[room.id] === wall.adjacentZoneId)) || null;
}

function projectedSide(room: SurveyRoom, wall: SurveyPlanWallSuggestion): { side: SurveyWallSide; startRatio: number; endRatio: number } {
  const midpointX = ((wall.start.x + wall.end.x) / 2) * PLAN_WIDTH;
  const midpointY = ((wall.start.y + wall.end.y) / 2) * PLAN_HEIGHT;
  const centerX = room.x + room.width / 2;
  const centerY = room.y + room.depth / 2;
  const normalizedDx = (midpointX - centerX) / Math.max(1, room.width);
  const normalizedDy = (midpointY - centerY) / Math.max(1, room.depth);
  let side: SurveyWallSide;
  if (Math.abs(normalizedDx) > Math.abs(normalizedDy)) side = normalizedDx >= 0 ? "right" : "left";
  else side = normalizedDy >= 0 ? "bottom" : "top";

  const firstX = wall.start.x * PLAN_WIDTH;
  const firstY = wall.start.y * PLAN_HEIGHT;
  const secondX = wall.end.x * PLAN_WIDTH;
  const secondY = wall.end.y * PLAN_HEIGHT;
  const ratios = side === "top"
    ? [(firstX - room.x) / Math.max(1, room.width), (secondX - room.x) / Math.max(1, room.width)]
    : side === "right"
      ? [(firstY - room.y) / Math.max(1, room.depth), (secondY - room.y) / Math.max(1, room.depth)]
      : side === "bottom"
        ? [(room.x + room.width - firstX) / Math.max(1, room.width), (room.x + room.width - secondX) / Math.max(1, room.width)]
        : [(room.y + room.depth - firstY) / Math.max(1, room.depth), (room.y + room.depth - secondY) / Math.max(1, room.depth)];
  const startRatio = clamp(Math.min(...ratios));
  const endRatio = clamp(Math.max(...ratios));
  return { side, startRatio, endRatio: Math.max(startRatio + 0.0001, endRatio) };
}

function centralWallId(pageId: string, suggestionId: string) {
  return `plan-wall-${pageId}-${suggestionId}`;
}

function centralOpeningId(pageId: string, suggestionId: string) {
  return `plan-opening-${pageId}-${suggestionId}`;
}

function addIssue(issues: SurveyPlanEnergyTransferIssue[], issue: SurveyPlanEnergyTransferIssue) {
  if (!issues.some((candidate) => candidate.code === issue.code && candidate.entityId === issue.entityId)) issues.push(issue);
}

function validateWall(input: TransferInput, wall: SurveyPlanWallSuggestion, roomMap: Map<string, SurveyRoom>, issues: SurveyPlanEnergyTransferIssue[]) {
  const room = wallRoom(wall, roomMap);
  const boundary = wallBoundaryType(wall.boundaryType);
  if (!room) addIssue(issues, { code: "PLAN_WALL_ROOM_NOT_APPROVED", severity: "error", blocking: true, entityType: "wall", entityId: wall.id, message: "A falszakaszhoz tartozó helyiség még nincs jóváhagyva a központi alaprajzban." });
  if (!boundary) addIssue(issues, { code: "PLAN_WALL_BOUNDARY_UNKNOWN", severity: "error", blocking: true, entityType: "wall", entityId: wall.id, message: "A falszakasz határolási típusa nincs véglegesítve." });
  if (!(wall.lengthMeters > 0) || !(wall.heightMeters > 0)) addIssue(issues, { code: "PLAN_WALL_GEOMETRY_INVALID", severity: "error", blocking: true, entityType: "wall", entityId: wall.id, message: "A falszakasz mért hossza vagy magassága nem pozitív." });
  if (boundary && envelopeBoundaryTypes.has(boundary) && !wall.assemblyId) addIssue(issues, { code: "PLAN_WALL_ASSEMBLY_REQUIRED", severity: "error", blocking: true, entityType: "wall", entityId: wall.id, message: "A határoló falszakaszhoz energetikai rétegrendet kell választani." });
  if (wall.assemblyId && !input.assemblies.some((assembly) => assembly.id === wall.assemblyId)) addIssue(issues, { code: "PLAN_WALL_ASSEMBLY_MISSING", severity: "error", blocking: true, entityType: "wall", entityId: wall.id, message: "A kiválasztott falszerkezet már nem található az energetikai rétegrendek között." });
  const validZoneIds = new Set([...input.zoneWorkspace.zones.map((zone) => zone.id), ...input.zoneWorkspace.unheatedSpaces.map((space) => space.id)]);
  if (!wall.zoneId || !validZoneIds.has(wall.zoneId)) addIssue(issues, { code: "PLAN_WALL_ZONE_REQUIRED", severity: "error", blocking: true, entityType: "wall", entityId: wall.id, message: "A falszakasz belső oldali energetikai zónája vagy tere nincs érvényesen megadva." });
  if (wall.adjacentZoneId && !validZoneIds.has(wall.adjacentZoneId)) addIssue(issues, { code: "PLAN_WALL_ADJACENT_ZONE_MISSING", severity: "error", blocking: true, entityType: "wall", entityId: wall.id, message: "A falszakasz másik oldali zónája vagy tere nem található." });
}

function validateOpening(page: SurveyPlanPage, opening: SurveyPlanOpeningSuggestion, approvedWallIds: Set<string>, issues: SurveyPlanEnergyTransferIssue[]) {
  if (!approvedWallIds.has(opening.wallSuggestionId)) addIssue(issues, { code: "PLAN_OPENING_WALL_NOT_APPROVED", severity: "error", blocking: true, entityType: "opening", entityId: opening.id, message: "A nyílászáró kapcsolt falszakasza nincs jóváhagyva." });
  if (!openingKind(opening.kind)) addIssue(issues, { code: "PLAN_OPENING_KIND_UNKNOWN", severity: "error", blocking: true, entityType: "opening", entityId: opening.id, message: "A nyílászáró típusa nincs véglegesítve." });
  if (!(opening.widthMeters > 0) || !(opening.heightMeters > 0)) addIssue(issues, { code: "PLAN_OPENING_GEOMETRY_INVALID", severity: "error", blocking: true, entityType: "opening", entityId: opening.id, message: "A nyílászáró szélessége vagy magassága nem pozitív." });
  const wall = page.wallSuggestions.find((candidate) => candidate.id === opening.wallSuggestionId);
  if (wall && opening.widthMeters > wall.lengthMeters + 0.001) addIssue(issues, { code: "PLAN_OPENING_WIDER_THAN_WALL", severity: "error", blocking: true, entityType: "opening", entityId: opening.id, message: "A nyílászáró szélessége nagyobb a kapcsolt falszakasz hosszánál." });
  if (!parsePositive(opening.uValueWm2K)) addIssue(issues, { code: "PLAN_OPENING_U_VALUE_REQUIRED", severity: "error", blocking: true, entityType: "opening", entityId: opening.id, message: "Az energetikai átadáshoz pozitív teljes Uw/U-érték szükséges." });
  if (!opening.sourceReference.trim()) addIssue(issues, { code: "PLAN_OPENING_SOURCE_REQUIRED", severity: "error", blocking: true, entityType: "opening", entityId: opening.id, message: "Az U-érték gyártói, katalógus- vagy kézi adatforrását rögzíteni kell." });
  if (opening.catalogProfileId && opening.catalogProfileId !== "custom") addIssue(issues, { code: "PLAN_OPENING_TEMPLATE_REVIEW", severity: "warning", blocking: false, entityType: "opening", entityId: opening.id, message: "A kiválasztott DIMPRO katalógussablon nem gyártóspecifikus; a végleges tanúsításhoz termékadatlappal ellenőrizendő." });
  if (opening.solarGValue.trim() && (parseNonNegative(opening.solarGValue) == null || Number(String(opening.solarGValue).replace(",", ".")) > 1)) addIssue(issues, { code: "PLAN_OPENING_G_VALUE_INVALID", severity: "error", blocking: true, entityType: "opening", entityId: opening.id, message: "A napenergia-átbocsátási tényező 0 és 1 közötti legyen." });
  if (opening.thermalBridgeMode !== "none") {
    if (parseNonNegative(opening.installationPsiWmK) == null) addIssue(issues, { code: "PLAN_OPENING_PSI_REQUIRED", severity: "error", blocking: true, entityType: "opening", entityId: opening.id, message: "A kiválasztott hőhíd-elszámolási módhoz nem negatív Ψ-érték szükséges." });
    if (!opening.installationPsiSourceReference.trim()) addIssue(issues, { code: "PLAN_OPENING_PSI_SOURCE_REQUIRED", severity: "error", blocking: true, entityType: "opening", entityId: opening.id, message: "A beépítési vagy külön élhőhíd Ψ-értékének forrása kötelező." });
  }
}

export function buildSurveyPlanEnergyTransferPreview(input: TransferInput): SurveyPlanEnergyTransferPreview {
  const approvedWalls = input.page.wallSuggestions.filter((wall) => wall.status === "approved");
  const approvedWallIds = new Set(approvedWalls.map((wall) => wall.id));
  const approvedOpenings = input.page.openingSuggestions.filter((opening) => opening.status === "approved" && approvedWallIds.has(opening.wallSuggestionId));
  const issues: SurveyPlanEnergyTransferIssue[] = [];
  const roomMap = roomBySuggestionId(input.rooms);
  if (!approvedWalls.length) addIssue(issues, { code: "PLAN_TRANSFER_NO_APPROVED_WALL", severity: "error", blocking: true, entityType: "page", entityId: input.page.id, message: "Nincs jóváhagyott falszakasz ezen a tervlapon." });
  for (const wall of approvedWalls) validateWall(input, wall, roomMap, issues);
  for (const opening of approvedOpenings) validateOpening(input.page, opening, approvedWallIds, issues);
  for (const wall of approvedWalls) {
    const openingArea = approvedOpenings.filter((opening) => opening.wallSuggestionId === wall.id).reduce((sum, opening) => sum + opening.widthMeters * opening.heightMeters, 0);
    if (openingArea > wall.lengthMeters * wall.heightMeters + 0.001) addIssue(issues, { code: "PLAN_OPENING_AREA_EXCEEDS_WALL", severity: "error", blocking: true, entityType: "wall", entityId: wall.id, message: "A jóváhagyott nyílászárók összfelülete meghaladja a falszakasz bruttó felületét." });
  }
  const existingWallIds = new Set(input.wallSegments.filter((wall) => wall.planPageId === input.page.id).map((wall) => wall.planWallSuggestionId));
  const existingOpeningIds = new Set(input.wallOpenings.filter((opening) => opening.planPageId === input.page.id).map((opening) => opening.planOpeningSuggestionId));
  const affectedRoomIds = [...new Set(approvedWalls.map((wall) => wallRoom(wall, roomMap)?.id).filter((id): id is string => Boolean(id)))];
  const generatedThermalBridgeCount = approvedOpenings.reduce((count, opening) => count + (opening.thermalBridgeMode === "separateEdges" ? 3 : 0), 0);
  const blockingIssueCount = issues.filter((issue) => issue.blocking).length;
  return {
    pageId: input.page.id,
    approvedWallCount: approvedWalls.length,
    approvedOpeningCount: approvedOpenings.length,
    wallCreateCount: approvedWalls.filter((wall) => !existingWallIds.has(wall.id)).length,
    wallUpdateCount: approvedWalls.filter((wall) => existingWallIds.has(wall.id)).length,
    openingCreateCount: approvedOpenings.filter((opening) => !existingOpeningIds.has(opening.id)).length,
    openingUpdateCount: approvedOpenings.filter((opening) => existingOpeningIds.has(opening.id)).length,
    generatedThermalBridgeCount,
    affectedRoomIds,
    issues,
    blockingIssueCount,
    warningCount: issues.filter((issue) => issue.severity === "warning").length,
    canTransfer: approvedWalls.length > 0 && blockingIssueCount === 0,
  };
}

function updateZoneAssignments(workspace: EnergyZoneWorkspace, rooms: SurveyRoom[], walls: SurveyPlanWallSuggestion[], roomMap: Map<string, SurveyRoom>, now: string) {
  const roomAssignments = { ...workspace.roomAssignments };
  const unheatedRoomAssignments = { ...workspace.unheatedRoomAssignments };
  const zoneIds = new Set(workspace.zones.map((zone) => zone.id));
  const unheatedIds = new Set(workspace.unheatedSpaces.map((space) => space.id));
  for (const wall of walls) {
    const primary = wallRoom(wall, roomMap);
    if (!primary || !wall.zoneId) continue;
    if (zoneIds.has(wall.zoneId) && primary.heated) {
      roomAssignments[primary.id] = wall.zoneId;
      delete unheatedRoomAssignments[primary.id];
    } else if (unheatedIds.has(wall.zoneId) && !primary.heated) {
      unheatedRoomAssignments[primary.id] = wall.zoneId;
      delete roomAssignments[primary.id];
    }
    const secondary = secondaryWallRoom(wall, primary, roomMap, workspace, rooms);
    if (!secondary || !wall.adjacentZoneId) continue;
    if (zoneIds.has(wall.adjacentZoneId) && secondary.heated) {
      roomAssignments[secondary.id] = wall.adjacentZoneId;
      delete unheatedRoomAssignments[secondary.id];
    } else if (unheatedIds.has(wall.adjacentZoneId) && !secondary.heated) {
      unheatedRoomAssignments[secondary.id] = wall.adjacentZoneId;
      delete roomAssignments[secondary.id];
    }
  }
  return { ...workspace, roomAssignments, unheatedRoomAssignments, updatedAt: now };
}

export function applySurveyPlanEnergyTransfer(input: TransferInput): SurveyPlanEnergyTransferResult {
  const preview = buildSurveyPlanEnergyTransferPreview(input);
  const transferredAt = new Date().toISOString();
  if (!preview.canTransfer) return { ...preview, transferredAt, wallSegments: input.wallSegments, wallOpenings: input.wallOpenings, rooms: input.rooms, zoneWorkspace: input.zoneWorkspace, openingWorkspace: input.openingWorkspace };

  const approvedWalls = input.page.wallSuggestions.filter((wall) => wall.status === "approved");
  const approvedWallIds = new Set(approvedWalls.map((wall) => wall.id));
  const approvedOpenings = input.page.openingSuggestions.filter((opening) => opening.status === "approved" && approvedWallIds.has(opening.wallSuggestionId));
  const roomMap = roomBySuggestionId(input.rooms);
  const existingWalls = new Map(input.wallSegments.filter((wall) => wall.planPageId === input.page.id && wall.planWallSuggestionId).map((wall) => [wall.planWallSuggestionId as string, wall]));
  const existingOpenings = new Map(input.wallOpenings.filter((opening) => opening.planPageId === input.page.id && opening.planOpeningSuggestionId).map((opening) => [opening.planOpeningSuggestionId as string, opening]));
  const assemblyMap = new Map(input.assemblies.map((assembly) => [assembly.id, assembly]));
  const affectedRoomIds = new Set(preview.affectedRoomIds);

  const transferredWalls: SurveyWallSegment[] = approvedWalls.flatMap((wall) => {
    const room = wallRoom(wall, roomMap);
    const boundaryType = wallBoundaryType(wall.boundaryType);
    if (!room || !boundaryType) return [];
    const existing = existingWalls.get(wall.id);
    const projected = projectedSide(room, wall);
    const adjacentRoom = secondaryWallRoom(wall, room, roomMap, input.zoneWorkspace, input.rooms);
    const assembly = wall.assemblyId ? assemblyMap.get(wall.assemblyId) : null;
    return [{
      id: existing?.id || centralWallId(input.page.id, wall.id),
      levelId: wall.levelId,
      roomId: room.id,
      side: projected.side,
      startRatio: projected.startRatio,
      endRatio: projected.endRatio,
      boundaryType,
      wallType: assembly?.name || existing?.wallType || "Tervlapról átadott falszerkezet",
      thicknessCm: Math.max(1, wall.thicknessMeters * 100),
      assemblyId: wall.assemblyId || undefined,
      adjacentRoomId: adjacentRoom?.id,
      note: `PDF tervlapról átadva. ${wall.sourceDetails}`.trim(),
      isAutoGenerated: false,
      measuredLengthMeters: wall.lengthMeters,
      heightMeters: wall.heightMeters,
      orientationDegrees: wall.orientationDegrees,
      zoneId: wall.zoneId || undefined,
      adjacentZoneId: wall.adjacentZoneId || undefined,
      dataSource: "planTransfer",
      planPageId: input.page.id,
      planWallSuggestionId: wall.id,
      planStart: { ...wall.start },
      planEnd: { ...wall.end },
      planTransferUpdatedAt: transferredAt,
      planTransferLocked: existing?.planTransferLocked || false,
      createdAt: existing?.createdAt || transferredAt,
      updatedAt: transferredAt,
    } satisfies SurveyWallSegment];
  });

  const retainedWalls = input.wallSegments.filter((wall) => {
    if (wall.planPageId === input.page.id && wall.dataSource === "planTransfer") return false;
    if (affectedRoomIds.has(wall.roomId) && wall.isAutoGenerated !== false && envelopeBoundaryTypes.has(wall.boundaryType)) return false;
    return true;
  });
  const wallBySuggestion = new Map(transferredWalls.map((wall) => [wall.planWallSuggestionId as string, wall]));

  const transferredOpenings: SurveyWallOpening[] = approvedOpenings.flatMap((opening) => {
    const wall = wallBySuggestion.get(opening.wallSuggestionId);
    const kind = openingKind(opening.kind);
    if (!wall || !kind) return [];
    const existing = existingOpenings.get(opening.id);
    return [{
      id: existing?.id || centralOpeningId(input.page.id, opening.id),
      levelId: opening.levelId,
      roomId: wall.roomId,
      wallSegmentId: wall.id,
      kind,
      name: opening.name,
      widthMeters: opening.widthMeters,
      heightMeters: opening.heightMeters,
      sillHeightMeters: opening.sillHeightMeters,
      offsetRatio: clamp(opening.offsetRatio),
      frame: opening.frame,
      glazing: opening.glazing,
      uValue: opening.uValueWm2K,
      shading: opening.shading || "Nincs megadva",
      note: `PDF tervlapról átadva. ${opening.sourceDetails}`.trim(),
      zoneId: opening.zoneId || wall.zoneId,
      catalogProfileId: opening.catalogProfileId || "custom",
      dataSource: "planTransfer",
      planPageId: input.page.id,
      planOpeningSuggestionId: opening.id,
      planTransferUpdatedAt: transferredAt,
      createdAt: existing?.createdAt || transferredAt,
      updatedAt: transferredAt,
    } satisfies SurveyWallOpening];
  });
  const retainedOpenings = input.wallOpenings.filter((opening) => !(opening.planPageId === input.page.id && opening.dataSource === "planTransfer"));
  const wallOpenings = [...retainedOpenings, ...transferredOpenings];

  const openingDetails = { ...input.openingWorkspace.openingDetails };
  for (const opening of input.wallOpenings.filter((candidate) => candidate.planPageId === input.page.id)) delete openingDetails[opening.id];
  const sourceSuggestionById = new Map(approvedOpenings.map((opening) => [opening.id, opening]));
  for (const opening of transferredOpenings) {
    const suggestion = sourceSuggestionById.get(opening.planOpeningSuggestionId || "");
    if (!suggestion) continue;
    const uw = parsePositive(suggestion.uValueWm2K) || undefined;
    const gValue = parseNonNegative(suggestion.solarGValue) ?? undefined;
    const installationPsi = suggestion.thermalBridgeMode === "installationPerimeter" ? parseNonNegative(suggestion.installationPsiWmK) ?? undefined : undefined;
    openingDetails[opening.id] = createEnergyOpeningDetail(opening, {
      calculationMode: "declared",
      declaredUwWm2K: uw,
      declaredSourceType: suggestion.catalogProfileId && suggestion.catalogProfileId !== "custom" ? "catalog" : "manual",
      declaredSourceReference: suggestion.sourceReference,
      solarGValue: gValue,
      installationPsiWmK: installationPsi,
      installationPsiSourceReference: installationPsi === undefined ? undefined : suggestion.installationPsiSourceReference,
      note: `PDF tervlap-átadás. Árnyékolás: ${suggestion.shading || "nincs megadva"}.`,
      catalogProfileId: suggestion.catalogProfileId || "custom",
      shading: suggestion.shading || "Nincs megadva",
      planPageId: input.page.id,
      planOpeningSuggestionId: suggestion.id,
      planTransferUpdatedAt: transferredAt,
      createdAt: input.openingWorkspace.openingDetails[opening.id]?.createdAt || transferredAt,
      updatedAt: transferredAt,
    });
  }

  const retainedBridges = input.openingWorkspace.thermalBridges.filter((bridge) => bridge.planPageId !== input.page.id);
  const generatedBridges = transferredOpenings.flatMap((opening) => {
    const suggestion = sourceSuggestionById.get(opening.planOpeningSuggestionId || "");
    const psi = suggestion ? parseNonNegative(suggestion.installationPsiWmK) : null;
    if (!suggestion || suggestion.thermalBridgeMode !== "separateEdges" || psi == null) return [];
    const common = {
      levelId: opening.levelId,
      zoneId: opening.zoneId,
      roomId: opening.roomId,
      wallSegmentId: opening.wallSegmentId,
      openingId: opening.id,
      psiWmK: psi,
      sourceType: suggestion.catalogProfileId && suggestion.catalogProfileId !== "custom" ? "catalog" as const : "manual" as const,
      sourceReference: suggestion.installationPsiSourceReference,
      note: "PDF tervlap-átadásból létrehozott külön nyílászáró élhőhíd.",
      planPageId: input.page.id,
      planOpeningSuggestionId: suggestion.id,
      planTransferUpdatedAt: transferredAt,
      createdAt: transferredAt,
      updatedAt: transferredAt,
    };
    return [
      createEnergyThermalBridge({ ...common, id: `plan-bridge-reveal-${suggestion.id}`, kind: "linear", category: "openingReveal", name: `${opening.name} – két oldalkáva`, lengthMeters: opening.heightMeters * 2 }),
      createEnergyThermalBridge({ ...common, id: `plan-bridge-sill-${suggestion.id}`, kind: "linear", category: "openingSill", name: `${opening.name} – parapet`, lengthMeters: opening.widthMeters }),
      createEnergyThermalBridge({ ...common, id: `plan-bridge-head-${suggestion.id}`, kind: "linear", category: "openingHead", name: `${opening.name} – szemöldök`, lengthMeters: opening.widthMeters }),
    ];
  });

  const rooms = input.rooms.map((room) => {
    const roomOpenings = wallOpenings.filter((opening) => opening.roomId === room.id);
    const windows = roomOpenings.filter((opening) => opening.kind === "window");
    return { ...room, windowCount: windows.length, windowType: windows[0]?.name || room.windowType };
  });
  const zoneWorkspace = updateZoneAssignments(input.zoneWorkspace, rooms, approvedWalls, roomMap, transferredAt);
  const openingWorkspace: EnergyOpeningWorkspace = {
    ...input.openingWorkspace,
    openingDetails,
    thermalBridges: [...retainedBridges, ...generatedBridges],
    updatedAt: transferredAt,
  };

  return {
    ...preview,
    transferredAt,
    wallSegments: [...retainedWalls, ...transferredWalls],
    wallOpenings,
    rooms,
    zoneWorkspace,
    openingWorkspace,
  };
}
