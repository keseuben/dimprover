import type { EnergyEnvelopeGeometryResult } from "@/components/energy/domain/energyGeometryTypes";
import type {
  EnergyZoneBoundaryConnection,
  EnergyZoneSetResult,
  EnergyZoneTraceItem,
  EnergyZoneValidationMessage,
  EnergyZoneWorkspace,
} from "@/components/energy/domain/energyZoneTypes";
import { getWallSegmentGeometry, getWallSegmentHeightMeters, getWallSegmentLengthMeters, type SurveyBuildingLevel, type SurveyWallOpening, type SurveyWallSegment } from "@/components/property-survey/propertySurveyBuildingModel";
import { getRoomUsableHeight } from "@/components/property-survey/propertySurveyEnergyModel";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
function sum<T>(rows: T[], selector: (row: T) => number) { return rows.reduce((total, row) => total + selector(row), 0); }
function openingArea(opening: SurveyWallOpening) { return Math.max(0, Number(opening.widthMeters) || 0) * Math.max(0, Number(opening.heightMeters) || 0); }
function traceItem(input: Omit<EnergyZoneTraceItem, "id" | "value">): EnergyZoneTraceItem {
  return { ...input, id: `zone-trace-${input.ruleId}-${input.entityRefs.map((ref) => ref.id).join("-")}`, value: round(input.unroundedValue) };
}
function canonicalWallKey(room: SurveyRoom, segment: SurveyWallSegment) {
  const geometry = getWallSegmentGeometry(room, segment);
  const a = `${round(geometry.x1, 2)},${round(geometry.y1, 2)}`;
  const b = `${round(geometry.x2, 2)},${round(geometry.y2, 2)}`;
  return `${segment.levelId}|${[a, b].sort().join("|")}`;
}

export function calculateEnergyZones(input: {
  workspace: EnergyZoneWorkspace;
  rooms: SurveyRoom[];
  levels: SurveyBuildingLevel[];
  wallSegments: SurveyWallSegment[];
  wallOpenings: SurveyWallOpening[];
  geometry: EnergyEnvelopeGeometryResult;
  calculatedAt?: string;
}): EnergyZoneSetResult {
  const { workspace } = input;
  const roomMap = new Map(input.rooms.map((room) => [room.id, room]));
  const zoneMap = new Map(workspace.zones.map((zone) => [zone.id, zone]));
  const unheatedMap = new Map(workspace.unheatedSpaces.map((space) => [space.id, space]));
  const messages: EnergyZoneValidationMessage[] = [];
  const trace: EnergyZoneTraceItem[] = [];

  if (!workspace.zones.length) messages.push({ code: "NO_ZONE", severity: "error", blocking: true, message: "Legalább egy energetikai zóna szükséges." });
  for (const zone of workspace.zones) {
    if (!zone.name.trim()) messages.push({ code: "ZONE_NAME_REQUIRED", severity: "error", blocking: true, zoneId: zone.id, message: "A zóna neve kötelező." });
  }
  for (const space of workspace.unheatedSpaces) {
    if (!space.name.trim()) messages.push({ code: "UNHEATED_SPACE_NAME_REQUIRED", severity: "error", blocking: true, unheatedSpaceId: space.id, message: "A fűtetlen tér neve kötelező." });
    if (space.temperatureSource === "manual") messages.push({ code: "MANUAL_UNHEATED_TEMPERATURE_REVIEW", severity: "warning", blocking: false, unheatedSpaceId: space.id, entityName: space.name, message: `${space.name}: a kézzel megadott fűtetlen tér-hőmérséklet szakmai ellenőrzést igényel.` });
  }

  for (const [roomId, targetId] of Object.entries(workspace.roomAssignments)) {
    const room = roomMap.get(roomId);
    if (!room) messages.push({ code: "ASSIGNMENT_ROOM_MISSING", severity: "warning", blocking: false, roomId, message: `A zónahozzárendelés nem létező helyiségre mutat: ${roomId}.` });
    if (!zoneMap.has(targetId)) messages.push({ code: "ASSIGNMENT_TARGET_MISSING", severity: "error", blocking: true, roomId, message: `A helyiség nem létező zónára mutat: ${targetId}.` });
    if (room && !room.heated) messages.push({ code: "UNHEATED_ROOM_ASSIGNED_TO_ZONE", severity: "error", blocking: true, roomId, entityName: room.name, message: `${room.name}: fűtetlen helyiség nem rendelhető fűtött energetikai zónához.` });
  }
  for (const [roomId, targetId] of Object.entries(workspace.unheatedRoomAssignments)) {
    const room = roomMap.get(roomId);
    if (!room) messages.push({ code: "ASSIGNMENT_ROOM_MISSING", severity: "warning", blocking: false, roomId, message: `A fűtetlen tér hozzárendelése nem létező helyiségre mutat: ${roomId}.` });
    if (!unheatedMap.has(targetId)) messages.push({ code: "ASSIGNMENT_TARGET_MISSING", severity: "error", blocking: true, roomId, message: `A helyiség nem létező fűtetlen térre mutat: ${targetId}.` });
    if (room?.heated) messages.push({ code: "HEATED_ROOM_ASSIGNED_TO_UNHEATED_SPACE", severity: "error", blocking: true, roomId, entityName: room.name, message: `${room.name}: fűtött helyiség nem rendelhető fűtetlen térhez.` });
  }
  for (const room of input.rooms) {
    const inZone = Boolean(workspace.roomAssignments[room.id]);
    const inUnheated = Boolean(workspace.unheatedRoomAssignments[room.id]);
    if (inZone && inUnheated) messages.push({ code: "ROOM_DOUBLE_ASSIGNED", severity: "error", blocking: true, roomId: room.id, entityName: room.name, message: `${room.name}: egyszerre zónához és fűtetlen térhez is hozzá van rendelve.` });
    if (room.heated && !inZone) messages.push({ code: "HEATED_ROOM_UNASSIGNED", severity: "error", blocking: true, roomId: room.id, entityName: room.name, message: `${room.name}: a fűtött helyiséget energetikai zónához kell rendelni.` });
    if (!room.heated && !inUnheated) messages.push({ code: "UNHEATED_ROOM_UNASSIGNED", severity: "warning", blocking: false, roomId: room.id, entityName: room.name, message: `${room.name}: a fűtetlen helyiség nincs kapcsolódó fűtetlen térhez rendelve.` });
  }

  const connections: EnergyZoneBoundaryConnection[] = [];
  const seenConnections = new Set<string>();
  for (const segment of input.wallSegments) {
    const sourceRoom = roomMap.get(segment.roomId);
    const adjacentRoom = segment.adjacentRoomId ? roomMap.get(segment.adjacentRoomId) : null;
    if (!sourceRoom || !adjacentRoom) continue;
    const sourceZoneId = workspace.roomAssignments[sourceRoom.id];
    if (!sourceZoneId) continue;
    const sourceZone = zoneMap.get(sourceZoneId);
    if (!sourceZone) continue;
    const targetZoneId = workspace.roomAssignments[adjacentRoom.id];
    const targetUnheatedId = workspace.unheatedRoomAssignments[adjacentRoom.id];
    let kind: EnergyZoneBoundaryConnection["kind"] | null = null;
    if (targetZoneId && targetZoneId !== sourceZoneId) kind = "zoneToZone";
    else if (targetUnheatedId) kind = "zoneToUnheatedSpace";
    if (!kind) {
      if (segment.boundaryType === "unheated" && !targetUnheatedId) messages.push({ code: "UNHEATED_BOUNDARY_TARGET_UNASSIGNED", severity: "warning", blocking: false, zoneId: sourceZoneId, roomId: adjacentRoom.id, entityName: adjacentRoom.name, message: `${sourceRoom.name} és ${adjacentRoom.name} között fűtetlen határ található, de a célhelyiség nincs fűtetlen térhez rendelve.` });
      continue;
    }
    const key = `${canonicalWallKey(sourceRoom, segment)}|${kind}`;
    if (seenConnections.has(key)) continue;
    seenConnections.add(key);
    const length = getWallSegmentLengthMeters(sourceRoom, segment);
    const height = segment.heightMeters ? getWallSegmentHeightMeters(sourceRoom, segment) : getRoomUsableHeight(sourceRoom);
    const gross = length * height;
    const openings = input.wallOpenings.filter((opening) => opening.wallSegmentId === segment.id);
    const opening = sum(openings, openingArea);
    const net = Math.max(0, gross - opening);
    const targetZone = targetZoneId ? zoneMap.get(targetZoneId) : undefined;
    const targetUnheated = targetUnheatedId ? unheatedMap.get(targetUnheatedId) : undefined;
    connections.push({
      id: `zone-connection-${segment.id}`,
      kind,
      levelId: segment.levelId,
      wallSegmentId: segment.id,
      sourceZoneId,
      sourceZoneName: sourceZone.name,
      targetZoneId: targetZone?.id,
      targetZoneName: targetZone?.name,
      targetUnheatedSpaceId: targetUnheated?.id,
      targetUnheatedSpaceName: targetUnheated?.name,
      sourceRoomId: sourceRoom.id,
      sourceRoomName: sourceRoom.name,
      adjacentRoomId: adjacentRoom.id,
      adjacentRoomName: adjacentRoom.name,
      grossAreaSquareMeters: round(gross),
      openingAreaSquareMeters: round(opening),
      netAreaSquareMeters: round(net),
    });
    if (kind === "zoneToZone") messages.push({ code: "INTERZONE_BOUNDARY_DETECTED", severity: "info", blocking: false, zoneId: sourceZoneId, roomId: sourceRoom.id, entityName: sourceRoom.name, message: `${sourceZone.name} és ${targetZone?.name || "másik zóna"} között ${round(net)} m² zónaközi határ található.` });
  }

  const zoneRows = workspace.zones.map((zone) => {
    const rooms = input.rooms.filter((room) => workspace.roomAssignments[room.id] === zone.id);
    if (!rooms.length) messages.push({ code: "ZONE_EMPTY", severity: "warning", blocking: false, zoneId: zone.id, entityName: zone.name, message: `${zone.name}: a zónához nincs helyiség rendelve.` });
    if (rooms.some((room) => !room.heated)) messages.push({ code: "ZONE_ROOM_NOT_HEATED", severity: "error", blocking: true, zoneId: zone.id, entityName: zone.name, message: `${zone.name}: a zóna fűtetlen helyiséget tartalmaz.` });
    const floor = sum(rooms, (room) => Math.max(0, Number(room.area) || 0));
    const volume = sum(rooms, (room) => Math.max(0, Number(room.area) || 0) * getRoomUsableHeight(room));
    const external = sum(input.geometry.wallRows.filter((row) => rooms.some((room) => room.id === row.roomId) && row.boundaryType === "external"), (row) => row.netAreaSquareMeters);
    const ground = sum(input.geometry.wallRows.filter((row) => rooms.some((room) => room.id === row.roomId) && row.boundaryType === "ground"), (row) => row.netAreaSquareMeters);
    const adjacent = sum(input.geometry.wallRows.filter((row) => rooms.some((room) => room.id === row.roomId) && row.boundaryType === "adjacent"), (row) => row.netAreaSquareMeters);
    const unheated = sum(connections.filter((connection) => connection.sourceZoneId === zone.id && connection.kind === "zoneToUnheatedSpace"), (connection) => connection.netAreaSquareMeters);
    const interzone = sum(connections.filter((connection) => connection.sourceZoneId === zone.id || connection.targetZoneId === zone.id).filter((connection) => connection.kind === "zoneToZone"), (connection) => connection.netAreaSquareMeters);
    trace.push(traceItem({ ruleId: "ZONE-FLOOR-AREA-001", label: `${zone.name} kondicionált alapterülete`, formula: "Σ zónához rendelt fűtött helyiség alapterülete", inputs: { roomCount: rooms.length }, unroundedValue: floor, unit: "m2", entityRefs: [{ type: "zone", id: zone.id, name: zone.name }, ...rooms.map((room) => ({ type: "room" as const, id: room.id, name: room.name }))] }));
    trace.push(traceItem({ ruleId: "ZONE-VOLUME-002", label: `${zone.name} kondicionált térfogata`, formula: "Σ helyiség alapterület × hasznos belmagasság", inputs: { roomCount: rooms.length }, unroundedValue: volume, unit: "m3", entityRefs: [{ type: "zone", id: zone.id, name: zone.name }, ...rooms.map((room) => ({ type: "room" as const, id: room.id, name: room.name }))] }));
    trace.push(traceItem({ ruleId: "ZONE-EXTERNAL-WALL-003", label: `${zone.name} külső nettó falfelülete`, formula: "Σ zónához tartozó külső nettó falszakasz", inputs: { wallCount: input.geometry.wallRows.filter((row) => rooms.some((room) => room.id === row.roomId) && row.boundaryType === "external").length }, unroundedValue: external, unit: "m2", entityRefs: [{ type: "zone", id: zone.id, name: zone.name }] }));
    trace.push(traceItem({ ruleId: "ZONE-UNHEATED-BOUNDARY-004", label: `${zone.name} fűtetlen térrel határos felülete`, formula: "Σ zóna–fűtetlen tér nettó falszakasz", inputs: { connectionCount: connections.filter((connection) => connection.sourceZoneId === zone.id && connection.kind === "zoneToUnheatedSpace").length }, unroundedValue: unheated, unit: "m2", entityRefs: [{ type: "zone", id: zone.id, name: zone.name }] }));
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      usageProfile: zone.usageProfile,
      serviceLevel: zone.serviceLevel,
      heatingSetpointC: zone.heatingSetpointC,
      coolingSetpointC: zone.coolingSetpointC ?? null,
      roomIds: rooms.map((room) => room.id),
      roomCount: rooms.length,
      floorAreaSquareMeters: round(floor),
      volumeCubicMeters: round(volume),
      externalWallAreaSquareMeters: round(external),
      groundWallAreaSquareMeters: round(ground),
      adjacentBuildingWallAreaSquareMeters: round(adjacent),
      unheatedBoundaryAreaSquareMeters: round(unheated),
      interzoneBoundaryAreaSquareMeters: round(interzone),
    };
  });

  const unheatedRows = workspace.unheatedSpaces.map((space) => {
    const rooms = input.rooms.filter((room) => workspace.unheatedRoomAssignments[room.id] === space.id);
    if (!rooms.length) messages.push({ code: "UNHEATED_SPACE_EMPTY", severity: "warning", blocking: false, unheatedSpaceId: space.id, entityName: space.name, message: `${space.name}: nincs hozzá fűtetlen helyiség rendelve.` });
    const connected = connections.filter((connection) => connection.targetUnheatedSpaceId === space.id);
    return {
      unheatedSpaceId: space.id,
      unheatedSpaceName: space.name,
      type: space.type,
      ventilation: space.ventilation,
      designTemperatureC: space.designTemperatureC ?? null,
      temperatureSourceReference: space.temperatureSourceReference || "",
      roomIds: rooms.map((room) => room.id),
      roomCount: rooms.length,
      floorAreaSquareMeters: round(sum(rooms, (room) => Math.max(0, Number(room.area) || 0))),
      volumeCubicMeters: round(sum(rooms, (room) => Math.max(0, Number(room.area) || 0) * getRoomUsableHeight(room))),
      connectedZoneIds: [...new Set(connected.map((connection) => connection.sourceZoneId))],
      connectedBoundaryAreaSquareMeters: round(sum(connected, (connection) => connection.netAreaSquareMeters)),
    };
  });

  const blocked = messages.some((message) => message.blocking);
  return {
    schema: "dimpro.energy-zone-set.v0.7.3",
    engineVersion: "0.7.3",
    calculatedAt: input.calculatedAt || new Date().toISOString(),
    valid: !blocked && zoneRows.length > 0,
    blocked,
    zones: zoneRows,
    unheatedSpaces: unheatedRows,
    connections,
    totals: {
      zoneCount: zoneRows.length,
      unheatedSpaceCount: unheatedRows.length,
      assignedConditionedRoomCount: zoneRows.reduce((sum, zone) => sum + zone.roomCount, 0),
      assignedUnheatedRoomCount: unheatedRows.reduce((sum, space) => sum + space.roomCount, 0),
      conditionedFloorAreaSquareMeters: round(sum(zoneRows, (zone) => zone.floorAreaSquareMeters)),
      conditionedVolumeCubicMeters: round(sum(zoneRows, (zone) => zone.volumeCubicMeters)),
      externalWallAreaSquareMeters: round(sum(zoneRows, (zone) => zone.externalWallAreaSquareMeters)),
      unheatedBoundaryAreaSquareMeters: round(sum(connections.filter((connection) => connection.kind === "zoneToUnheatedSpace"), (connection) => connection.netAreaSquareMeters)),
      interzoneBoundaryAreaSquareMeters: round(sum(connections.filter((connection) => connection.kind === "zoneToZone"), (connection) => connection.netAreaSquareMeters)),
    },
    validationMessages: messages,
    trace,
    sourceReferenceId: "HU-EKM-ZONE-BOUNDARIES-1.7.5-1.7.6",
    sourceCheckedAt: "2026-07-29",
  };
}
