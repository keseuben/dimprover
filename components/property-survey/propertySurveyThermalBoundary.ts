import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import {
  getWallSegmentGeometry,
  type SurveyWallSegment,
  type SurveyWallSide,
} from "@/components/property-survey/propertySurveyBuildingModel";
import type { SurveyThermalBoundarySettings } from "@/components/property-survey/propertySurveyEnergyModel";

export type SurveyThermalBoundarySegment = {
  id: string;
  sourceWallSegmentId?: string;
  roomId?: string;
  side?: SurveyWallSide;
  boundaryKind: "external" | "unheated" | "adjacent" | "manual";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lengthMeters: number;
};

function offsetWallGeometry(side: SurveyWallSide, offsetPlanUnits: number, geometry: ReturnType<typeof getWallSegmentGeometry>) {
  if (!offsetPlanUnits) return geometry;
  if (side === "top") return { ...geometry, y1: geometry.y1 - offsetPlanUnits, y2: geometry.y2 - offsetPlanUnits };
  if (side === "right") return { ...geometry, x1: geometry.x1 + offsetPlanUnits, x2: geometry.x2 + offsetPlanUnits };
  if (side === "bottom") return { ...geometry, y1: geometry.y1 + offsetPlanUnits, y2: geometry.y2 + offsetPlanUnits };
  return { ...geometry, x1: geometry.x1 - offsetPlanUnits, x2: geometry.x2 - offsetPlanUnits };
}

function manualThermalSegments(settings: SurveyThermalBoundarySettings): SurveyThermalBoundarySegment[] {
  const x = settings.manualX;
  const y = settings.manualY;
  const width = Math.max(6, settings.manualWidth);
  const height = Math.max(6, settings.manualHeight);
  return [
    { id: `${settings.levelId}-manual-top`, boundaryKind: "manual", x1: x, y1: y, x2: x + width, y2: y, lengthMeters: width / 60 },
    { id: `${settings.levelId}-manual-right`, boundaryKind: "manual", x1: x + width, y1: y, x2: x + width, y2: y + height, lengthMeters: height / 60 },
    { id: `${settings.levelId}-manual-bottom`, boundaryKind: "manual", x1: x + width, y1: y + height, x2: x, y2: y + height, lengthMeters: width / 60 },
    { id: `${settings.levelId}-manual-left`, boundaryKind: "manual", x1: x, y1: y + height, x2: x, y2: y, lengthMeters: height / 60 },
  ];
}

export function getSurveyThermalBoundarySegments(input: {
  rooms: SurveyRoom[];
  wallSegments: SurveyWallSegment[];
  settings?: SurveyThermalBoundarySettings;
}) {
  const { rooms, wallSegments, settings } = input;
  if (!settings || !rooms.length) return [] as SurveyThermalBoundarySegment[];
  if (settings.mode === "manual") return manualThermalSegments(settings);

  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const includedRoomIds = new Set(
    (settings.mode === "allRooms" ? rooms : rooms.filter((room) => room.heated)).map((room) => room.id),
  );
  const offsetPlanUnits = ((settings.offsetCm || 0) / 100) * 60;
  const result: SurveyThermalBoundarySegment[] = [];

  for (const segment of wallSegments) {
    const room = roomById.get(segment.roomId);
    if (!room || !includedRoomIds.has(room.id)) continue;

    const include = settings.mode === "allRooms"
      ? segment.boundaryType === "external" || segment.boundaryType === "adjacent" || segment.boundaryType === "ground"
      : segment.boundaryType === "external" || segment.boundaryType === "unheated" || segment.boundaryType === "adjacent" || segment.boundaryType === "ground";
    if (!include) continue;

    const geometry = offsetWallGeometry(segment.side, offsetPlanUnits, getWallSegmentGeometry(room, segment));
    result.push({
      id: `thermal-${segment.id}`,
      sourceWallSegmentId: segment.id,
      roomId: room.id,
      side: segment.side,
      boundaryKind: segment.boundaryType === "unheated" ? "unheated" : segment.boundaryType === "adjacent" ? "adjacent" : "external",
      x1: geometry.x1,
      y1: geometry.y1,
      x2: geometry.x2,
      y2: geometry.y2,
      lengthMeters: geometry.lengthMeters,
    });
  }

  return result;
}

export function getSurveyThermalBoundarySummary(segments: SurveyThermalBoundarySegment[]) {
  return segments.reduce(
    (summary, segment) => {
      summary.totalMeters += segment.lengthMeters;
      summary.segmentCount += 1;
      summary.byKind[segment.boundaryKind] += segment.lengthMeters;
      return summary;
    },
    {
      totalMeters: 0,
      segmentCount: 0,
      byKind: { external: 0, unheated: 0, adjacent: 0, manual: 0 },
    },
  );
}
