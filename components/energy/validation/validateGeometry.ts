import { detectSurveyRoomOverlaps, getWallSegmentGeometry, getWallSegmentHeightMeters, getWallSegmentLengthMeters, type SurveyBuildingLevel, type SurveyWallOpening, type SurveyWallSegment } from "@/components/property-survey/propertySurveyBuildingModel";
import { getRoomUsableHeight } from "@/components/property-survey/propertySurveyEnergyModel";
import type { EnergyGeometryValidationMessage } from "@/components/energy/domain/energyGeometryTypes";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";

function wallLabel(segment: SurveyWallSegment, room?: SurveyRoom) {
  return `${room?.name || segment.roomId} · ${segment.side} · ${segment.id}`;
}

function canonicalWallKey(segment: SurveyWallSegment, room: SurveyRoom) {
  const geometry = getWallSegmentGeometry(room, segment);
  const first = `${geometry.x1.toFixed(2)},${geometry.y1.toFixed(2)}`;
  const second = `${geometry.x2.toFixed(2)},${geometry.y2.toFixed(2)}`;
  return `${segment.levelId}|${[first, second].sort().join("|")}|${segment.boundaryType}`;
}

export function validateEnvelopeGeometry(input: {
  rooms: SurveyRoom[];
  levels: SurveyBuildingLevel[];
  wallSegments: SurveyWallSegment[];
  wallOpenings: SurveyWallOpening[];
}) {
  const messages: EnergyGeometryValidationMessage[] = [];
  const roomMap = new Map(input.rooms.map((room) => [room.id, room]));
  const levelMap = new Map(input.levels.map((level) => [level.id, level]));
  const conditionedRooms = input.rooms.filter((room) => room.heated);

  if (!conditionedRooms.length) messages.push({ code: "NO_CONDITIONED_ROOM", severity: "error", blocking: true, message: "Nincs fűtött vagy kondicionált helyiség, ezért energetikai geometria nem számítható." });

  for (const room of input.rooms) {
    const levelId = room.levelId || input.levels[0]?.id;
    if (!(Number(room.area) > 0) || !(Number(room.width) > 0) || !(Number(room.depth) > 0)) {
      messages.push({ code: "ROOM_DIMENSION_INVALID", severity: "error", blocking: true, levelId, entityType: "room", entityId: room.id, entityName: room.name, message: `${room.name}: az alapterület vagy az alaprajzi méret nem pozitív.` });
    }
    if (!(getRoomUsableHeight(room) > 0)) {
      messages.push({ code: "ROOM_HEIGHT_INVALID", severity: "error", blocking: true, levelId, entityType: "room", entityId: room.id, entityName: room.name, message: `${room.name}: a hasznos belmagasság nem pozitív.` });
    }
  }

  for (const level of input.levels) {
    const rooms = input.rooms.filter((room) => (room.levelId || input.levels[0]?.id) === level.id);
    for (const overlap of detectSurveyRoomOverlaps(rooms)) {
      const first = roomMap.get(overlap.roomAId);
      const second = roomMap.get(overlap.roomBId);
      messages.push({
        code: "ROOM_OVERLAP",
        severity: "error",
        blocking: true,
        levelId: level.id,
        entityType: "room",
        entityId: first?.id,
        entityName: first?.name,
        relatedEntityIds: [overlap.roomAId, overlap.roomBId],
        message: `${level.name}: a(z) ${first?.name || overlap.roomAId} és ${second?.name || overlap.roomBId} helyiség ${overlap.overlapAreaSquareMeters.toFixed(2).replace(".", ",")} m² területen átfedi egymást.`,
      });
    }
  }

  const wallGroups = new Map<string, SurveyWallSegment[]>();
  const envelopeSegments = input.wallSegments.filter((segment) => ["external", "unheated", "adjacent", "ground"].includes(segment.boundaryType));
  for (const segment of envelopeSegments) {
    const room = roomMap.get(segment.roomId);
    if (!room) {
      messages.push({ code: "WALL_ROOM_MISSING", severity: "error", blocking: true, levelId: segment.levelId, entityType: "wall", entityId: segment.id, entityName: segment.id, message: `${segment.id}: a falszakaszhoz tartozó helyiség nem található.` });
      continue;
    }
    if (!room.heated) continue;
    const key = canonicalWallKey(segment, room);
    wallGroups.set(key, [...(wallGroups.get(key) || []), segment]);
  }

  for (const segments of wallGroups.values()) {
    if (segments.length <= 1) continue;
    const names = segments.map((segment) => wallLabel(segment, roomMap.get(segment.roomId)));
    messages.push({ code: "DUPLICATE_ENVELOPE_WALL", severity: "warning", blocking: false, levelId: segments[0].levelId, entityType: "wall", entityId: segments[0].id, entityName: names[0], relatedEntityIds: segments.map((segment) => segment.id), message: `Duplán ábrázolt energetikai falszakasz: ${names.join(" / ")}. A számítás csak az első példányt veszi figyelembe.` });
  }

  for (const room of conditionedRooms) {
    const walls = envelopeSegments.filter((segment) => segment.roomId === room.id);
    if (!walls.length) messages.push({ code: "HEATED_ROOM_WITHOUT_ENVELOPE_WALL", severity: "warning", blocking: false, levelId: room.levelId, entityType: "room", entityId: room.id, entityName: room.name, message: `${room.name}: nincs külső, fűtetlen, talaj- vagy szomszédos térrel határos falszakasz.` });
  }

  for (const opening of input.wallOpenings) {
    const segment = input.wallSegments.find((wall) => wall.id === opening.wallSegmentId);
    const room = roomMap.get(opening.roomId || segment?.roomId || "");
    const name = opening.name || opening.id;
    if (!(Number(opening.widthMeters) > 0) || !(Number(opening.heightMeters) > 0)) messages.push({ code: "OPENING_DIMENSION_INVALID", severity: "error", blocking: true, levelId: opening.levelId, entityType: "opening", entityId: opening.id, entityName: name, message: `${name}: a nyílászáró szélessége és magassága legyen pozitív.` });
    if (segment && room && Number(opening.widthMeters) > getWallSegmentLengthMeters(room, segment) + 0.001) messages.push({ code: "OPENING_WIDER_THAN_WALL", severity: "error", blocking: true, levelId: opening.levelId, entityType: "opening", entityId: opening.id, entityName: name, relatedEntityIds: [segment.id], message: `${name}: a ${Number(opening.widthMeters).toFixed(2)} m szélesség nagyobb a(z) ${wallLabel(segment, room)} falszakasz hosszánál.` });
  }

  for (const segment of envelopeSegments) {
    const room = roomMap.get(segment.roomId);
    if (!room || !room.heated) continue;
    const wallHeight = segment.heightMeters ? getWallSegmentHeightMeters(room, segment) : getRoomUsableHeight(room);
    const wallArea = getWallSegmentLengthMeters(room, segment) * wallHeight;
    const openings = input.wallOpenings.filter((opening) => opening.wallSegmentId === segment.id);
    const openingArea = openings.reduce((sum, opening) => sum + Math.max(0, Number(opening.widthMeters) || 0) * Math.max(0, Number(opening.heightMeters) || 0), 0);
    if (openingArea > wallArea + 0.001) messages.push({ code: "OPENING_AREA_EXCEEDS_WALL", severity: "error", blocking: true, levelId: segment.levelId, entityType: "wall", entityId: segment.id, entityName: wallLabel(segment, room), relatedEntityIds: openings.map((opening) => opening.id), message: `${wallLabel(segment, room)}: a nyílászárók ${openingArea.toFixed(2).replace(".", ",")} m² összfelülete meghaladja a fal ${wallArea.toFixed(2).replace(".", ",")} m² bruttó felületét.` });
  }

  void levelMap;
  return { messages, canonicalWallKey };
}
