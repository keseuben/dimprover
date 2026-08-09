import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";

export const ENERGY_ZONE_WORKSPACE_SCHEMA_VERSION = 1 as const;

export type EnergyZoneUsageProfile =
  | "residential"
  | "office"
  | "education"
  | "healthcare"
  | "retail"
  | "hospitality"
  | "industrial"
  | "warehouse"
  | "sports"
  | "other";

export type EnergyZoneServiceLevel =
  | "heatedNaturalVentilation"
  | "heatedMechanicalVentilation"
  | "cooled"
  | "airConditioned";

export type EnergyUnheatedSpaceType = "attic" | "basement" | "garage" | "stairwell" | "storage" | "corridor" | "other";
export type EnergyUnheatedVentilation = "unknown" | "sealed" | "natural" | "mechanical";
export type EnergyTemperatureSource = "notCalculated" | "manual" | "laterDetailedCalculation";

export type EnergyZone = {
  id: string;
  name: string;
  usageProfile: EnergyZoneUsageProfile;
  serviceLevel: EnergyZoneServiceLevel;
  heatingSetpointC: number;
  coolingSetpointC?: number;
  airChangePerHour?: number;
  internalGainWm2?: number;
  lightingPowerWm2?: number;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type EnergyUnheatedSpace = {
  id: string;
  name: string;
  type: EnergyUnheatedSpaceType;
  ventilation: EnergyUnheatedVentilation;
  designTemperatureC?: number;
  temperatureSource: EnergyTemperatureSource;
  temperatureSourceReference: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type EnergyZoneWorkspace = {
  schemaVersion: typeof ENERGY_ZONE_WORKSPACE_SCHEMA_VERSION;
  zones: EnergyZone[];
  unheatedSpaces: EnergyUnheatedSpace[];
  roomAssignments: Record<string, string>;
  unheatedRoomAssignments: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type EnergyZoneValidationCode =
  | "NO_ZONE"
  | "ZONE_NAME_REQUIRED"
  | "ZONE_EMPTY"
  | "ZONE_ROOM_NOT_HEATED"
  | "HEATED_ROOM_UNASSIGNED"
  | "UNHEATED_ROOM_ASSIGNED_TO_ZONE"
  | "HEATED_ROOM_ASSIGNED_TO_UNHEATED_SPACE"
  | "ROOM_DOUBLE_ASSIGNED"
  | "UNHEATED_ROOM_UNASSIGNED"
  | "UNHEATED_SPACE_NAME_REQUIRED"
  | "UNHEATED_SPACE_EMPTY"
  | "ASSIGNMENT_ROOM_MISSING"
  | "ASSIGNMENT_TARGET_MISSING"
  | "UNHEATED_BOUNDARY_TARGET_UNASSIGNED"
  | "INTERZONE_BOUNDARY_DETECTED"
  | "MANUAL_UNHEATED_TEMPERATURE_REVIEW";

export type EnergyZoneValidationMessage = {
  code: EnergyZoneValidationCode;
  severity: "info" | "warning" | "error";
  blocking: boolean;
  zoneId?: string;
  unheatedSpaceId?: string;
  roomId?: string;
  entityName?: string;
  message: string;
};

export type EnergyZoneTraceItem = {
  id: string;
  ruleId: string;
  label: string;
  formula: string;
  inputs: Record<string, number | string | boolean | null>;
  unroundedValue: number;
  value: number;
  unit: "m2" | "m3" | "count";
  entityRefs: Array<{ type: "zone" | "unheatedSpace" | "room" | "wall"; id: string; name: string }>;
};

export type EnergyZoneBoundaryConnection = {
  id: string;
  kind: "zoneToZone" | "zoneToUnheatedSpace";
  levelId: string;
  wallSegmentId: string;
  sourceZoneId: string;
  sourceZoneName: string;
  targetZoneId?: string;
  targetZoneName?: string;
  targetUnheatedSpaceId?: string;
  targetUnheatedSpaceName?: string;
  sourceRoomId: string;
  sourceRoomName: string;
  adjacentRoomId: string;
  adjacentRoomName: string;
  grossAreaSquareMeters: number;
  openingAreaSquareMeters: number;
  netAreaSquareMeters: number;
};

export type EnergyZoneResultRow = {
  zoneId: string;
  zoneName: string;
  usageProfile: EnergyZoneUsageProfile;
  serviceLevel: EnergyZoneServiceLevel;
  heatingSetpointC: number;
  coolingSetpointC: number | null;
  roomIds: string[];
  roomCount: number;
  floorAreaSquareMeters: number;
  volumeCubicMeters: number;
  externalWallAreaSquareMeters: number;
  groundWallAreaSquareMeters: number;
  adjacentBuildingWallAreaSquareMeters: number;
  unheatedBoundaryAreaSquareMeters: number;
  interzoneBoundaryAreaSquareMeters: number;
};

export type EnergyUnheatedSpaceResultRow = {
  unheatedSpaceId: string;
  unheatedSpaceName: string;
  type: EnergyUnheatedSpaceType;
  ventilation: EnergyUnheatedVentilation;
  designTemperatureC: number | null;
  temperatureSourceReference: string;
  roomIds: string[];
  roomCount: number;
  floorAreaSquareMeters: number;
  volumeCubicMeters: number;
  connectedZoneIds: string[];
  connectedBoundaryAreaSquareMeters: number;
};

export type EnergyZoneSetResult = {
  schema: "dimpro.energy-zone-set.v0.7.3";
  engineVersion: "0.7.3";
  calculatedAt: string;
  valid: boolean;
  blocked: boolean;
  zones: EnergyZoneResultRow[];
  unheatedSpaces: EnergyUnheatedSpaceResultRow[];
  connections: EnergyZoneBoundaryConnection[];
  totals: {
    zoneCount: number;
    unheatedSpaceCount: number;
    assignedConditionedRoomCount: number;
    assignedUnheatedRoomCount: number;
    conditionedFloorAreaSquareMeters: number;
    conditionedVolumeCubicMeters: number;
    externalWallAreaSquareMeters: number;
    unheatedBoundaryAreaSquareMeters: number;
    interzoneBoundaryAreaSquareMeters: number;
  };
  validationMessages: EnergyZoneValidationMessage[];
  trace: EnergyZoneTraceItem[];
  sourceReferenceId: "HU-EKM-ZONE-BOUNDARIES-1.7.5-1.7.6";
  sourceCheckedAt: "2026-07-29";
};

export const energyZoneUsageProfileLabels: Record<EnergyZoneUsageProfile, string> = {
  residential: "Lakóépület",
  office: "Iroda",
  education: "Oktatási",
  healthcare: "Egészségügyi",
  retail: "Kereskedelmi",
  hospitality: "Szállás / vendéglátás",
  industrial: "Ipari",
  warehouse: "Raktár",
  sports: "Sport",
  other: "Egyéb",
};

export const energyZoneServiceLevelLabels: Record<EnergyZoneServiceLevel, string> = {
  heatedNaturalVentilation: "Fűtött, természetes szellőzéssel",
  heatedMechanicalVentilation: "Fűtött, gépi szellőzéssel",
  cooled: "Fűtött és hűtött",
  airConditioned: "Légkondicionált",
};

export const energyUnheatedSpaceTypeLabels: Record<EnergyUnheatedSpaceType, string> = {
  attic: "Fűtetlen padlás",
  basement: "Fűtetlen pince",
  garage: "Garázs",
  stairwell: "Lépcsőház",
  storage: "Tároló",
  corridor: "Közlekedő",
  other: "Egyéb fűtetlen tér",
};

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEnergyZone(input?: Partial<EnergyZone>): EnergyZone {
  const now = new Date().toISOString();
  return {
    id: input?.id || id("energy-zone"),
    name: input?.name || "Fűtött zóna",
    usageProfile: input?.usageProfile || "residential",
    serviceLevel: input?.serviceLevel || "heatedNaturalVentilation",
    heatingSetpointC: Number.isFinite(Number(input?.heatingSetpointC)) ? Number(input?.heatingSetpointC) : 20,
    coolingSetpointC: Number.isFinite(Number(input?.coolingSetpointC)) ? Number(input?.coolingSetpointC) : undefined,
    airChangePerHour: Number.isFinite(Number(input?.airChangePerHour)) ? Number(input?.airChangePerHour) : undefined,
    internalGainWm2: Number.isFinite(Number(input?.internalGainWm2)) ? Number(input?.internalGainWm2) : undefined,
    lightingPowerWm2: Number.isFinite(Number(input?.lightingPowerWm2)) ? Number(input?.lightingPowerWm2) : undefined,
    note: input?.note || "",
    createdAt: input?.createdAt || now,
    updatedAt: input?.updatedAt || now,
  };
}

export function createEnergyUnheatedSpace(input?: Partial<EnergyUnheatedSpace>): EnergyUnheatedSpace {
  const now = new Date().toISOString();
  return {
    id: input?.id || id("energy-unheated"),
    name: input?.name || "Kapcsolódó fűtetlen tér",
    type: input?.type || "other",
    ventilation: input?.ventilation || "unknown",
    designTemperatureC: Number.isFinite(Number(input?.designTemperatureC)) ? Number(input?.designTemperatureC) : undefined,
    temperatureSource: input?.temperatureSource || "notCalculated",
    temperatureSourceReference: input?.temperatureSourceReference || "",
    note: input?.note || "",
    createdAt: input?.createdAt || now,
    updatedAt: input?.updatedAt || now,
  };
}

export function createDefaultEnergyZoneWorkspace(rooms: SurveyRoom[] = [], input?: Partial<EnergyZoneWorkspace>): EnergyZoneWorkspace {
  const now = new Date().toISOString();
  const zone = createEnergyZone(input?.zones?.[0]);
  const unheatedRooms = rooms.filter((room) => !room.heated);
  const unheatedSpace = unheatedRooms.length ? createEnergyUnheatedSpace(input?.unheatedSpaces?.[0]) : null;
  return {
    schemaVersion: ENERGY_ZONE_WORKSPACE_SCHEMA_VERSION,
    zones: input?.zones?.length ? input.zones.map((item) => createEnergyZone(item)) : [zone],
    unheatedSpaces: input?.unheatedSpaces?.length ? input.unheatedSpaces.map((item) => createEnergyUnheatedSpace(item)) : unheatedSpace ? [unheatedSpace] : [],
    roomAssignments: input?.roomAssignments || Object.fromEntries(rooms.filter((room) => room.heated).map((room) => [room.id, zone.id])),
    unheatedRoomAssignments: input?.unheatedRoomAssignments || (unheatedSpace ? Object.fromEntries(unheatedRooms.map((room) => [room.id, unheatedSpace.id])) : {}),
    createdAt: input?.createdAt || now,
    updatedAt: input?.updatedAt || now,
  };
}

export function normalizeEnergyZoneWorkspace(input: Partial<EnergyZoneWorkspace> | null | undefined, rooms: SurveyRoom[]): EnergyZoneWorkspace {
  if (!input) return createDefaultEnergyZoneWorkspace(rooms);
  const base = createDefaultEnergyZoneWorkspace([], input);
  const roomIds = new Set(rooms.map((room) => room.id));
  const zoneIds = new Set(base.zones.map((zone) => zone.id));
  const unheatedIds = new Set(base.unheatedSpaces.map((space) => space.id));
  const roomAssignments = Object.fromEntries(Object.entries(base.roomAssignments).filter(([roomId, zoneId]) => roomIds.has(roomId) && zoneIds.has(zoneId)));
  const unheatedRoomAssignments = Object.fromEntries(Object.entries(base.unheatedRoomAssignments).filter(([roomId, spaceId]) => roomIds.has(roomId) && unheatedIds.has(spaceId)));
  for (const room of rooms) {
    if (room.heated) delete unheatedRoomAssignments[room.id];
    else delete roomAssignments[room.id];
  }
  return { ...base, roomAssignments, unheatedRoomAssignments, updatedAt: input.updatedAt || base.updatedAt };
}

export function createAutomaticEnergyZoneWorkspace(rooms: SurveyRoom[]): EnergyZoneWorkspace {
  return createDefaultEnergyZoneWorkspace(rooms);
}
