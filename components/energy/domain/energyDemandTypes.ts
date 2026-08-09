import type { SurveyMechanicalDevice } from "@/components/property-survey/propertySurveyEnergyModel";
import type { EnergyZoneSetResult, EnergyZoneWorkspace } from "@/components/energy/domain/energyZoneTypes";

export const ENERGY_DEMAND_WORKSPACE_SCHEMA_VERSION = 1 as const;

export type EnergyVentilationCalculationMode = "airChange" | "designAirflow";
export type EnergyBoundarySide = "lower" | "upper";
export type EnergyBoundaryTargetKind = "externalAir" | "unheatedSpace" | "adjacentHeated";
export type EnergySystemService = "heating" | "cooling" | "ventilation" | "dhw" | "renewable";
export type EnergySystemType =
  | "boiler"
  | "heatPump"
  | "directElectric"
  | "districtHeating"
  | "roomHeater"
  | "airConditioner"
  | "ventilationUnit"
  | "waterHeater"
  | "solarThermal"
  | "photovoltaic"
  | "other";

export type EnergyZoneDemandSettings = {
  zoneId: string;
  ventilationMode: EnergyVentilationCalculationMode;
  airChangePerHour?: number;
  designAirflowM3h?: number;
  heatRecoveryEfficiency?: number;
  ventilationSourceReference: string;
  note: string;
  updatedAt: string;
};

export type EnergyBoundaryCondition = {
  targetKind: EnergyBoundaryTargetKind;
  targetTemperatureC?: number;
  sourceReference: string;
  note: string;
  updatedAt: string;
};

export type EnergySystem = {
  id: string;
  name: string;
  service: EnergySystemService;
  type: EnergySystemType;
  servedZoneIds: string[];
  linkedSurveyDeviceIds: string[];
  nominalCapacityKw?: number;
  zoneCapacityAllocationsKw: Record<string, number>;
  sourceReference: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type EnergyDemandWorkspace = {
  schemaVersion: typeof ENERGY_DEMAND_WORKSPACE_SCHEMA_VERSION;
  enabled: boolean;
  externalDesignTemperatureC?: number;
  externalTemperatureSourceReference: string;
  airHeatCapacityWhM3K: number;
  airHeatCapacitySourceReference: string;
  zoneSettings: Record<string, EnergyZoneDemandSettings>;
  wallBoundaryConditions: Record<string, EnergyBoundaryCondition>;
  roomBoundaryConditions: Record<string, EnergyBoundaryCondition>;
  systems: EnergySystem[];
  createdAt: string;
  updatedAt: string;
};

export type EnergyDemandComponentKind =
  | "wall"
  | "lowerBoundary"
  | "upperBoundary"
  | "opening"
  | "installationBridge"
  | "thermalBridge"
  | "ventilation";

export type EnergyDemandValidationCode =
  | "DEMAND_DISABLED"
  | "EXTERNAL_DESIGN_TEMPERATURE_REQUIRED"
  | "EXTERNAL_TEMPERATURE_SOURCE_REQUIRED"
  | "AIR_HEAT_CAPACITY_INVALID"
  | "AIR_HEAT_CAPACITY_SOURCE_REQUIRED"
  | "ZONE_DEMAND_SETTINGS_MISSING"
  | "ZONE_TEMPERATURE_DIFFERENCE_INVALID"
  | "VENTILATION_AIR_CHANGE_REQUIRED"
  | "VENTILATION_AIRFLOW_REQUIRED"
  | "VENTILATION_HEAT_RECOVERY_INVALID"
  | "VENTILATION_SOURCE_REQUIRED"
  | "WALL_ASSEMBLY_REQUIRED"
  | "WALL_ASSEMBLY_RESULT_INVALID"
  | "ROOM_LOWER_ASSEMBLY_REQUIRED"
  | "ROOM_UPPER_ASSEMBLY_REQUIRED"
  | "ROOM_BOUNDARY_ASSEMBLY_RESULT_INVALID"
  | "BOUNDARY_TARGET_TEMPERATURE_REQUIRED"
  | "BOUNDARY_TARGET_TEMPERATURE_INVALID"
  | "BOUNDARY_SOURCE_REQUIRED"
  | "UNHEATED_SPACE_TEMPERATURE_REQUIRED"
  | "OPENING_RESULT_INVALID"
  | "ROOF_OPENING_THERMAL_DATA_REQUIRED"
  | "THERMAL_BRIDGE_ZONE_UNASSIGNED"
  | "SYSTEM_NAME_REQUIRED"
  | "SYSTEM_ZONE_REQUIRED"
  | "SYSTEM_ZONE_MISSING"
  | "SYSTEM_DEVICE_MISSING"
  | "SYSTEM_CAPACITY_INVALID"
  | "SYSTEM_SOURCE_REQUIRED"
  | "SYSTEM_ALLOCATION_INVALID"
  | "SYSTEM_ALLOCATION_EXCEEDS_CAPACITY"
  | "ZONE_HEATING_SYSTEM_MISSING"
  | "ZONE_SYSTEM_CAPACITY_UNKNOWN"
  | "ZONE_SYSTEM_CAPACITY_INSUFFICIENT"
  | "ZONE_SYSTEM_CAPACITY_SUFFICIENT";

export type EnergyDemandValidationMessage = {
  code: EnergyDemandValidationCode;
  severity: "info" | "warning" | "error";
  blocking: boolean;
  zoneId?: string;
  roomId?: string;
  wallSegmentId?: string;
  openingId?: string;
  thermalBridgeId?: string;
  systemId?: string;
  entityName?: string;
  message: string;
};

export type EnergyDemandComponentRow = {
  id: string;
  zoneId: string;
  zoneName: string;
  kind: EnergyDemandComponentKind;
  entityId: string;
  entityName: string;
  areaSquareMeters: number | null;
  uValueWm2K: number | null;
  baseHeatLossCoefficientWK: number;
  temperatureFactor: number;
  effectiveHeatLossCoefficientWK: number;
  sourceReference: string;
};

export type EnergyDemandTraceItem = {
  id: string;
  ruleId: string;
  label: string;
  formula: string;
  inputs: Record<string, number | string | boolean | null>;
  unroundedValue: number;
  value: number;
  unit: "m2" | "m3" | "m3/h" | "W/K" | "kW" | "W/m2" | "1" | "K";
  entityRefs: Array<{ type: "zone" | "room" | "wall" | "opening" | "thermalBridge" | "system"; id: string; name: string }>;
};

export type EnergySystemCoverageStatus = "notRequired" | "missing" | "unknownCapacity" | "insufficient" | "sufficient";

export type EnergyZoneDemandResult = {
  zoneId: string;
  zoneName: string;
  heatingSetpointC: number;
  externalDesignTemperatureC: number | null;
  designTemperatureDifferenceK: number | null;
  floorAreaSquareMeters: number;
  volumeCubicMeters: number;
  wallHeatLossCoefficientWK: number;
  lowerBoundaryHeatLossCoefficientWK: number;
  upperBoundaryHeatLossCoefficientWK: number;
  openingHeatLossCoefficientWK: number;
  installationHeatLossCoefficientWK: number;
  thermalBridgeHeatLossCoefficientWK: number;
  transmissionHeatLossCoefficientWK: number;
  ventilationHeatLossCoefficientWK: number;
  totalHeatLossCoefficientWK: number;
  designHeatingPowerKw: number | null;
  designHeatingPowerPerAreaWm2: number | null;
  heatingSystemIds: string[];
  allocatedHeatingCapacityKw: number | null;
  capacityCoverageRatio: number | null;
  systemCoverageStatus: EnergySystemCoverageStatus;
  blocked: boolean;
  validationMessages: EnergyDemandValidationMessage[];
  components: EnergyDemandComponentRow[];
  trace: EnergyDemandTraceItem[];
};

export type EnergySystemResult = {
  systemId: string;
  systemName: string;
  service: EnergySystemService;
  type: EnergySystemType;
  servedZoneIds: string[];
  linkedSurveyDeviceIds: string[];
  nominalCapacityKw: number | null;
  allocatedCapacityKw: number;
  remainingCapacityKw: number | null;
  blocked: boolean;
  validationMessages: EnergyDemandValidationMessage[];
};

export type EnergyDemandSetResult = {
  schema: "dimpro.energy-demand-set.v0.7.5";
  engineVersion: "0.7.5";
  calculatedAt: string;
  enabled: boolean;
  valid: boolean;
  blocked: boolean;
  zones: EnergyZoneDemandResult[];
  systems: EnergySystemResult[];
  components: EnergyDemandComponentRow[];
  totals: {
    zoneCount: number;
    calculatedZoneCount: number;
    blockedZoneCount: number;
    conditionedFloorAreaSquareMeters: number;
    conditionedVolumeCubicMeters: number;
    transmissionHeatLossCoefficientWK: number;
    ventilationHeatLossCoefficientWK: number;
    totalHeatLossCoefficientWK: number;
    designHeatingPowerKw: number | null;
    allocatedHeatingCapacityKw: number;
    sufficientZoneCount: number;
    insufficientZoneCount: number;
    missingSystemZoneCount: number;
  };
  validationMessages: EnergyDemandValidationMessage[];
  trace: EnergyDemandTraceItem[];
  sourceReferenceIds: ["EN-ISO-52016-1-ZONE-LOAD", "HU-EKM-9-2023-MONTHLY-METHOD", "AIR-HEAT-CAPACITY-USER-SOURCE"];
  sourceCheckedAt: "2026-07-29";
  limitation: "Design heating load preparation only; not monthly or annual certification energy demand.";
};

export const energySystemServiceLabels: Record<EnergySystemService, string> = {
  heating: "Fűtés",
  cooling: "Hűtés",
  ventilation: "Szellőzés",
  dhw: "Használati meleg víz",
  renewable: "Megújuló energia",
};

export const energySystemTypeLabels: Record<EnergySystemType, string> = {
  boiler: "Kazán",
  heatPump: "Hőszivattyú",
  directElectric: "Közvetlen villamos fűtés",
  districtHeating: "Távhő",
  roomHeater: "Helyiségenkénti hőtermelő",
  airConditioner: "Klíma / hűtő-fűtő berendezés",
  ventilationUnit: "Szellőzőgép",
  waterHeater: "HMV-termelő / tároló",
  solarThermal: "Napkollektor",
  photovoltaic: "Napelem",
  other: "Egyéb rendszer",
};

export const energyBoundaryTargetKindLabels: Record<EnergyBoundaryTargetKind, string> = {
  externalAir: "Külső levegő",
  unheatedSpace: "Fűtetlen tér",
  adjacentHeated: "Szomszédos fűtött tér",
};

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function optionalNumber(value: unknown, allowZero = false) {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) return undefined;
  if (allowZero ? parsed < 0 : parsed <= 0) return undefined;
  return parsed;
}
function finiteNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function roomBoundaryConditionKey(roomId: string, side: EnergyBoundarySide) {
  return `${roomId}:${side}`;
}

export function createEnergyZoneDemandSettings(zoneId: string, input?: Partial<EnergyZoneDemandSettings>): EnergyZoneDemandSettings {
  return {
    zoneId,
    ventilationMode: input?.ventilationMode === "designAirflow" ? "designAirflow" : "airChange",
    airChangePerHour: optionalNumber(input?.airChangePerHour),
    designAirflowM3h: optionalNumber(input?.designAirflowM3h),
    heatRecoveryEfficiency: finiteNumber(input?.heatRecoveryEfficiency),
    ventilationSourceReference: input?.ventilationSourceReference || "",
    note: input?.note || "",
    updatedAt: input?.updatedAt || new Date().toISOString(),
  };
}

export function createEnergyBoundaryCondition(input?: Partial<EnergyBoundaryCondition>): EnergyBoundaryCondition {
  return {
    targetKind: input?.targetKind === "unheatedSpace" || input?.targetKind === "adjacentHeated" ? input.targetKind : "externalAir",
    targetTemperatureC: finiteNumber(input?.targetTemperatureC),
    sourceReference: input?.sourceReference || "",
    note: input?.note || "",
    updatedAt: input?.updatedAt || new Date().toISOString(),
  };
}

export function createEnergySystem(input?: Partial<EnergySystem>): EnergySystem {
  const now = new Date().toISOString();
  return {
    id: input?.id || id("energy-system"),
    name: input?.name || "Új energetikai rendszer",
    service: input?.service || "heating",
    type: input?.type || "other",
    servedZoneIds: Array.isArray(input?.servedZoneIds) ? [...new Set(input.servedZoneIds.filter(Boolean))] : [],
    linkedSurveyDeviceIds: Array.isArray(input?.linkedSurveyDeviceIds) ? [...new Set(input.linkedSurveyDeviceIds.filter(Boolean))] : [],
    nominalCapacityKw: optionalNumber(input?.nominalCapacityKw),
    zoneCapacityAllocationsKw: Object.fromEntries(Object.entries(input?.zoneCapacityAllocationsKw || {}).flatMap(([zoneId, value]) => {
      const normalized = optionalNumber(value);
      return normalized ? [[zoneId, normalized] as const] : [];
    })),
    sourceReference: input?.sourceReference || "",
    note: input?.note || "",
    createdAt: input?.createdAt || now,
    updatedAt: input?.updatedAt || now,
  };
}

export function createDefaultEnergyDemandWorkspace(zoneWorkspace?: EnergyZoneWorkspace | null, input?: Partial<EnergyDemandWorkspace>): EnergyDemandWorkspace {
  const now = new Date().toISOString();
  const zones = zoneWorkspace?.zones || [];
  const sourceZoneSettings = input?.zoneSettings || {};
  return {
    schemaVersion: ENERGY_DEMAND_WORKSPACE_SCHEMA_VERSION,
    enabled: input?.enabled ?? false,
    externalDesignTemperatureC: finiteNumber(input?.externalDesignTemperatureC),
    externalTemperatureSourceReference: input?.externalTemperatureSourceReference || "",
    airHeatCapacityWhM3K: optionalNumber(input?.airHeatCapacityWhM3K) || 0.34,
    airHeatCapacitySourceReference: input?.airHeatCapacitySourceReference || "",
    zoneSettings: Object.fromEntries(zones.map((zone) => [zone.id, createEnergyZoneDemandSettings(zone.id, sourceZoneSettings[zone.id] || { airChangePerHour: zone.airChangePerHour })])),
    wallBoundaryConditions: Object.fromEntries(Object.entries(input?.wallBoundaryConditions || {}).map(([key, value]) => [key, createEnergyBoundaryCondition(value)])),
    roomBoundaryConditions: Object.fromEntries(Object.entries(input?.roomBoundaryConditions || {}).map(([key, value]) => [key, createEnergyBoundaryCondition(value)])),
    systems: Array.isArray(input?.systems) ? input.systems.map(createEnergySystem) : [],
    createdAt: input?.createdAt || now,
    updatedAt: input?.updatedAt || now,
  };
}

export function normalizeEnergyDemandWorkspace(input: Partial<EnergyDemandWorkspace> | null | undefined, zoneWorkspace: EnergyZoneWorkspace, zoneResult?: EnergyZoneSetResult | null, devices: SurveyMechanicalDevice[] = []): EnergyDemandWorkspace {
  const base = createDefaultEnergyDemandWorkspace(zoneWorkspace, input || undefined);
  const zoneIds = new Set(zoneWorkspace.zones.map((zone) => zone.id));
  const deviceIds = new Set(devices.map((device) => device.id));
  const zoneSettings = Object.fromEntries(zoneWorkspace.zones.map((zone) => [zone.id, createEnergyZoneDemandSettings(zone.id, base.zoneSettings[zone.id] || { airChangePerHour: zone.airChangePerHour })]));
  const systems = base.systems.map((system) => createEnergySystem({
    ...system,
    servedZoneIds: system.servedZoneIds.filter((zoneId) => zoneIds.has(zoneId)),
    linkedSurveyDeviceIds: system.linkedSurveyDeviceIds.filter((deviceId) => deviceIds.has(deviceId)),
    zoneCapacityAllocationsKw: Object.fromEntries(Object.entries(system.zoneCapacityAllocationsKw).filter(([zoneId]) => zoneIds.has(zoneId))),
  }));
  if (zoneResult) {
    for (const zone of zoneResult.zones) if (!zoneSettings[zone.zoneId]) zoneSettings[zone.zoneId] = createEnergyZoneDemandSettings(zone.zoneId);
  }
  return { ...base, zoneSettings, systems, updatedAt: input?.updatedAt || base.updatedAt };
}
