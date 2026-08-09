import { roomProjectedOverlapRatio } from "@/components/energy/calculations/geometry/geometryRectangleMath";
import type { EnergyAssemblySetResult, EnergyAssemblyThermalResult } from "@/components/energy/domain/energyAssemblyTypes";
import type {
  EnergyBoundaryCondition,
  EnergyDemandComponentRow,
  EnergyDemandSetResult,
  EnergyDemandTraceItem,
  EnergyDemandValidationMessage,
  EnergyDemandWorkspace,
  EnergySystem,
  EnergySystemResult,
  EnergyZoneDemandResult,
} from "@/components/energy/domain/energyDemandTypes";
import { roomBoundaryConditionKey } from "@/components/energy/domain/energyDemandTypes";
import type { EnergyEnvelopeGeometryResult } from "@/components/energy/domain/energyGeometryTypes";
import type { EnergyOpeningSetResult, EnergyOpeningWorkspace, EnergyThermalBridge } from "@/components/energy/domain/energyOpeningTypes";
import type { EnergyZoneResultRow, EnergyZoneSetResult, EnergyZoneWorkspace } from "@/components/energy/domain/energyZoneTypes";
import type { SurveyBuildingLevel, SurveyWallOpening, SurveyWallSegment } from "@/components/property-survey/propertySurveyBuildingModel";
import type { SurveyConstructionAssembly, SurveyMechanicalDevice } from "@/components/property-survey/propertySurveyEnergyModel";
import type { SurveySectionLine } from "@/components/property-survey/propertySurveySectionModel";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
function sum<T>(rows: T[], selector: (row: T) => number) {
  return rows.reduce((total, row) => total + selector(row), 0);
}
function traceItem(input: Omit<EnergyDemandTraceItem, "id" | "value"> & { digits?: number }): EnergyDemandTraceItem {
  return {
    ...input,
    id: `demand-trace-${input.ruleId}-${input.entityRefs.map((ref) => ref.id).join("-")}`,
    value: round(input.unroundedValue, input.digits ?? 4),
  };
}
function message(input: EnergyDemandValidationMessage) {
  return input;
}
function finite(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
function positive(value: unknown) {
  const parsed = finite(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}
function nonNegative(value: unknown) {
  const parsed = finite(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}
function zoneRef(zone: EnergyZoneResultRow) {
  return [{ type: "zone" as const, id: zone.zoneId, name: zone.zoneName }];
}

function roofSlopeFactor(section?: SurveySectionLine | null) {
  if (!section || section.roofShape === "flat") return 1;
  if (section.roofShape === "singleSlope") {
    const degrees = Math.max(0, Math.min(80, Number(section.leftRoofPitchDegrees) || Number(section.rightRoofPitchDegrees) || 0));
    return Math.min(4, 1 / Math.max(0.25, Math.cos(degrees * Math.PI / 180)));
  }
  if (section.roofShape === "gable") {
    const leftDegrees = Math.max(0, Math.min(80, Number(section.leftRoofPitchDegrees) || 0));
    const rightDegrees = Math.max(0, Math.min(80, Number(section.rightRoofPitchDegrees) || 0));
    const left = 1 / Math.max(0.25, Math.cos(leftDegrees * Math.PI / 180));
    const right = 1 / Math.max(0.25, Math.cos(rightDegrees * Math.PI / 180));
    return Math.min(4, (left + right) / 2);
  }
  return 1;
}
function usesSlopedUpperBoundary(level: SurveyBuildingLevel, room: SurveyRoom) {
  if (level.kind === "attic") return true;
  const value = `${room.ceilingType || ""} ${room.note || ""}`.toLocaleLowerCase("hu-HU");
  return (value.includes("tetősík") || value.includes("magastető")) && !value.includes("padlásfödém");
}

function assemblyEffectiveU(result: EnergyAssemblyThermalResult | undefined, assembly: SurveyConstructionAssembly | undefined) {
  if (!result || !assembly || result.blocked || result.effectiveUValueWm2K === null) return null;
  if (assembly.boundaryMode === "groundEquivalentRequired" && assembly.calculationMode !== "declared") return null;
  return result.effectiveUValueWm2K;
}

function boundaryFactor(input: {
  zone: EnergyZoneResultRow;
  externalTemperatureC: number;
  condition: EnergyBoundaryCondition | undefined;
  defaultTargetKind?: EnergyBoundaryCondition["targetKind"];
  defaultTargetTemperatureC?: number | null;
  defaultSourceReference?: string;
  messages: EnergyDemandValidationMessage[];
  messageContext: Omit<EnergyDemandValidationMessage, "code" | "severity" | "blocking" | "message">;
  entityName: string;
}) {
  const delta = input.zone.heatingSetpointC - input.externalTemperatureC;
  if (!(delta > 0)) {
    input.messages.push(message({ ...input.messageContext, code: "ZONE_TEMPERATURE_DIFFERENCE_INVALID", severity: "error", blocking: true, entityName: input.entityName, message: `${input.zone.zoneName}: a fűtési alapértéknek magasabbnak kell lennie a külső méretezési hőmérsékletnél.` }));
    return null;
  }
  const kind = input.condition?.targetKind || input.defaultTargetKind || "externalAir";
  if (kind === "externalAir") return { factor: 1, targetTemperatureC: input.externalTemperatureC, sourceReference: input.condition?.sourceReference || input.defaultSourceReference || "Külső méretezési hőmérséklet" };
  const target = finite(input.condition?.targetTemperatureC ?? input.defaultTargetTemperatureC);
  const source = input.condition?.sourceReference?.trim() || input.defaultSourceReference?.trim() || "";
  if (target === null) {
    input.messages.push(message({ ...input.messageContext, code: "BOUNDARY_TARGET_TEMPERATURE_REQUIRED", severity: "error", blocking: true, entityName: input.entityName, message: `${input.entityName}: a kapcsolódó tér méretezési hőmérséklete kötelező.` }));
    return null;
  }
  if (!source) input.messages.push(message({ ...input.messageContext, code: "BOUNDARY_SOURCE_REQUIRED", severity: "error", blocking: true, entityName: input.entityName, message: `${input.entityName}: a kapcsolódó tér hőmérsékletének forráshivatkozása kötelező.` }));
  if (target < input.externalTemperatureC || target > input.zone.heatingSetpointC) {
    input.messages.push(message({ ...input.messageContext, code: "BOUNDARY_TARGET_TEMPERATURE_INVALID", severity: "error", blocking: true, entityName: input.entityName, message: `${input.entityName}: a kapcsolódó tér hőmérséklete a külső és a zóna belső méretezési hőmérséklete közé essen.` }));
    return null;
  }
  return { factor: (input.zone.heatingSetpointC - target) / delta, targetTemperatureC: target, sourceReference: source };
}

function resolveWallBoundary(input: {
  zone: EnergyZoneResultRow;
  segment: SurveyWallSegment;
  zoneSet: EnergyZoneSetResult;
  workspace: EnergyDemandWorkspace;
  externalTemperatureC: number;
  messages: EnergyDemandValidationMessage[];
}) {
  const context = { zoneId: input.zone.zoneId, wallSegmentId: input.segment.id };
  if (input.segment.boundaryType === "external" || input.segment.boundaryType === "ground") {
    return boundaryFactor({ zone: input.zone, externalTemperatureC: input.externalTemperatureC, condition: undefined, defaultTargetKind: "externalAir", defaultSourceReference: input.workspace.externalTemperatureSourceReference, messages: input.messages, messageContext: context, entityName: input.segment.wallType || input.segment.id });
  }
  const connection = input.zoneSet.connections.find((row) => row.wallSegmentId === input.segment.id && (row.sourceZoneId === input.zone.zoneId || row.targetZoneId === input.zone.zoneId));
  if (connection?.kind === "zoneToUnheatedSpace") {
    const space = input.zoneSet.unheatedSpaces.find((row) => row.unheatedSpaceId === connection.targetUnheatedSpaceId);
    if (space?.designTemperatureC === null || space?.designTemperatureC === undefined) input.messages.push(message({ ...context, code: "UNHEATED_SPACE_TEMPERATURE_REQUIRED", severity: "error", blocking: true, entityName: space?.unheatedSpaceName || connection.targetUnheatedSpaceName, message: `${space?.unheatedSpaceName || connection.targetUnheatedSpaceName || "Fűtetlen tér"}: a zónaterheléshez méretezési hőmérséklet szükséges.` }));
    return boundaryFactor({ zone: input.zone, externalTemperatureC: input.externalTemperatureC, condition: input.workspace.wallBoundaryConditions[input.segment.id], defaultTargetKind: "unheatedSpace", defaultTargetTemperatureC: space?.designTemperatureC, defaultSourceReference: space?.temperatureSourceReference, messages: input.messages, messageContext: context, entityName: `${input.zone.zoneName} – ${space?.unheatedSpaceName || "fűtetlen tér"}` });
  }
  if (connection?.kind === "zoneToZone") {
    const otherId = connection.sourceZoneId === input.zone.zoneId ? connection.targetZoneId : connection.sourceZoneId;
    const other = input.zoneSet.zones.find((row) => row.zoneId === otherId);
    if (!other || input.zone.heatingSetpointC <= other.heatingSetpointC) return { factor: 0, targetTemperatureC: other?.heatingSetpointC ?? input.zone.heatingSetpointC, sourceReference: "Zónák fűtési alapértékei" };
    return boundaryFactor({ zone: input.zone, externalTemperatureC: input.externalTemperatureC, condition: undefined, defaultTargetKind: "adjacentHeated", defaultTargetTemperatureC: other.heatingSetpointC, defaultSourceReference: "Zónák fűtési alapértékei", messages: input.messages, messageContext: context, entityName: `${input.zone.zoneName} – ${other.zoneName}` });
  }
  if (input.segment.boundaryType === "unheated" || input.segment.boundaryType === "adjacent") {
    return boundaryFactor({ zone: input.zone, externalTemperatureC: input.externalTemperatureC, condition: input.workspace.wallBoundaryConditions[input.segment.id], defaultTargetKind: input.segment.boundaryType === "unheated" ? "unheatedSpace" : "adjacentHeated", messages: input.messages, messageContext: context, entityName: input.segment.wallType || input.segment.id });
  }
  return { factor: 0, targetTemperatureC: input.zone.heatingSetpointC, sourceReference: "Azonos hőmérsékletű belső tér" };
}

function addComponent(input: {
  components: EnergyDemandComponentRow[];
  trace: EnergyDemandTraceItem[];
  zone: EnergyZoneResultRow;
  kind: EnergyDemandComponentRow["kind"];
  entityId: string;
  entityName: string;
  areaSquareMeters: number | null;
  uValueWm2K: number | null;
  baseHeatLossCoefficientWK: number;
  temperatureFactor: number;
  sourceReference: string;
  ruleId: string;
  formula: string;
}) {
  const effective = input.baseHeatLossCoefficientWK * input.temperatureFactor;
  const row: EnergyDemandComponentRow = {
    id: `demand-component-${input.kind}-${input.entityId}-${input.zone.zoneId}`,
    zoneId: input.zone.zoneId,
    zoneName: input.zone.zoneName,
    kind: input.kind,
    entityId: input.entityId,
    entityName: input.entityName,
    areaSquareMeters: input.areaSquareMeters === null ? null : round(input.areaSquareMeters),
    uValueWm2K: input.uValueWm2K === null ? null : round(input.uValueWm2K, 6),
    baseHeatLossCoefficientWK: round(input.baseHeatLossCoefficientWK),
    temperatureFactor: round(input.temperatureFactor, 6),
    effectiveHeatLossCoefficientWK: round(effective),
    sourceReference: input.sourceReference,
  };
  input.components.push(row);
  input.trace.push(traceItem({
    ruleId: input.ruleId,
    label: `${input.zone.zoneName} · ${input.entityName}`,
    formula: input.formula,
    inputs: { areaSquareMeters: input.areaSquareMeters, uValueWm2K: input.uValueWm2K, baseHeatLossCoefficientWK: input.baseHeatLossCoefficientWK, temperatureFactor: input.temperatureFactor },
    unroundedValue: effective,
    unit: "W/K",
    entityRefs: [...zoneRef(input.zone), { type: input.kind === "wall" ? "wall" as const : input.kind === "opening" || input.kind === "installationBridge" ? "opening" as const : input.kind === "thermalBridge" ? "thermalBridge" as const : "room" as const, id: input.entityId, name: input.entityName }],
  }));
  return row;
}

function validateSystems(input: { systems: EnergySystem[]; zones: EnergyZoneResultRow[]; devices: SurveyMechanicalDevice[] }) {
  const zoneIds = new Set(input.zones.map((zone) => zone.zoneId));
  const deviceIds = new Set(input.devices.map((device) => device.id));
  const messages: EnergyDemandValidationMessage[] = [];
  const results: EnergySystemResult[] = input.systems.map((system) => {
    const local: EnergyDemandValidationMessage[] = [];
    if (!system.name.trim()) local.push(message({ code: "SYSTEM_NAME_REQUIRED", severity: "error", blocking: true, systemId: system.id, message: "Az energetikai rendszer megnevezése kötelező." }));
    if (!system.servedZoneIds.length && (system.service === "heating" || system.service === "cooling" || system.service === "ventilation")) local.push(message({ code: "SYSTEM_ZONE_REQUIRED", severity: "error", blocking: true, systemId: system.id, entityName: system.name, message: `${system.name}: legalább egy kiszolgált zóna szükséges.` }));
    for (const zoneId of system.servedZoneIds) if (!zoneIds.has(zoneId)) local.push(message({ code: "SYSTEM_ZONE_MISSING", severity: "error", blocking: true, systemId: system.id, zoneId, entityName: system.name, message: `${system.name}: nem létező zónakapcsolat.` }));
    for (const deviceId of system.linkedSurveyDeviceIds) if (!deviceIds.has(deviceId)) local.push(message({ code: "SYSTEM_DEVICE_MISSING", severity: "error", blocking: true, systemId: system.id, entityName: system.name, message: `${system.name}: a kapcsolt helyszíni berendezés nem található.` }));
    const nominal = positive(system.nominalCapacityKw);
    if (system.nominalCapacityKw !== undefined && nominal === null) local.push(message({ code: "SYSTEM_CAPACITY_INVALID", severity: "error", blocking: true, systemId: system.id, entityName: system.name, message: `${system.name}: a névleges kapacitás legyen pozitív.` }));
    if (nominal !== null && !system.sourceReference.trim()) local.push(message({ code: "SYSTEM_SOURCE_REQUIRED", severity: "error", blocking: true, systemId: system.id, entityName: system.name, message: `${system.name}: a névleges kapacitás forráshivatkozása kötelező.` }));
    for (const [zoneId, value] of Object.entries(system.zoneCapacityAllocationsKw)) {
      if (!system.servedZoneIds.includes(zoneId) || !(value > 0)) local.push(message({ code: "SYSTEM_ALLOCATION_INVALID", severity: "error", blocking: true, systemId: system.id, zoneId, entityName: system.name, message: `${system.name}: a zónakapacitás-kiosztás hibás vagy nem kiszolgált zónára mutat.` }));
    }
    const allocated = sum(Object.values(system.zoneCapacityAllocationsKw), (value) => value);
    if (nominal !== null && allocated > nominal + 1e-9) local.push(message({ code: "SYSTEM_ALLOCATION_EXCEEDS_CAPACITY", severity: "error", blocking: true, systemId: system.id, entityName: system.name, message: `${system.name}: a zónákra kiosztott ${round(allocated)} kW meghaladja a ${round(nominal)} kW névleges kapacitást.` }));
    messages.push(...local);
    return {
      systemId: system.id,
      systemName: system.name,
      service: system.service,
      type: system.type,
      servedZoneIds: system.servedZoneIds,
      linkedSurveyDeviceIds: system.linkedSurveyDeviceIds,
      nominalCapacityKw: nominal === null ? null : round(nominal),
      allocatedCapacityKw: round(allocated),
      remainingCapacityKw: nominal === null ? null : round(nominal - allocated),
      blocked: local.some((item) => item.blocking),
      validationMessages: local,
    };
  });
  return { messages, results };
}

function assignedThermalBridgeZone(input: {
  bridge: EnergyThermalBridge;
  zoneWorkspace: EnergyZoneWorkspace;
  wallSegments: SurveyWallSegment[];
  wallOpenings: SurveyWallOpening[];
}) {
  if (input.bridge.zoneId) return input.bridge.zoneId;
  if (input.bridge.roomId) return input.zoneWorkspace.roomAssignments[input.bridge.roomId] || null;
  if (input.bridge.wallSegmentId) {
    const segment = input.wallSegments.find((item) => item.id === input.bridge.wallSegmentId);
    return segment ? input.zoneWorkspace.roomAssignments[segment.roomId] || null : null;
  }
  if (input.bridge.openingId) {
    const opening = input.wallOpenings.find((item) => item.id === input.bridge.openingId);
    return opening ? input.zoneWorkspace.roomAssignments[opening.roomId] || null : null;
  }
  return null;
}

export function calculateEnergyDemand(input: {
  workspace: EnergyDemandWorkspace;
  geometry: EnergyEnvelopeGeometryResult;
  zoneWorkspace: EnergyZoneWorkspace;
  zoneSet: EnergyZoneSetResult;
  rooms: SurveyRoom[];
  levels: SurveyBuildingLevel[];
  wallSegments: SurveyWallSegment[];
  wallOpenings: SurveyWallOpening[];
  assemblies: SurveyConstructionAssembly[];
  assemblySet: EnergyAssemblySetResult;
  openingWorkspace: EnergyOpeningWorkspace;
  openingSet: EnergyOpeningSetResult;
  sectionLines: SurveySectionLine[];
  mechanicalDevices: SurveyMechanicalDevice[];
  calculatedAt?: string;
}): EnergyDemandSetResult {
  const globalMessages: EnergyDemandValidationMessage[] = [];
  if (!input.workspace.enabled) {
    globalMessages.push(message({ code: "DEMAND_DISABLED", severity: "info", blocking: false, message: "A zónaterhelési számítás nincs bekapcsolva." }));
    return {
      schema: "dimpro.energy-demand-set.v0.7.5", engineVersion: "0.7.5", calculatedAt: input.calculatedAt || new Date().toISOString(), enabled: false, valid: true, blocked: false, zones: [], systems: [], components: [],
      totals: { zoneCount: input.zoneSet.zones.length, calculatedZoneCount: 0, blockedZoneCount: 0, conditionedFloorAreaSquareMeters: input.zoneSet.totals.conditionedFloorAreaSquareMeters, conditionedVolumeCubicMeters: input.zoneSet.totals.conditionedVolumeCubicMeters, transmissionHeatLossCoefficientWK: 0, ventilationHeatLossCoefficientWK: 0, totalHeatLossCoefficientWK: 0, designHeatingPowerKw: null, allocatedHeatingCapacityKw: 0, sufficientZoneCount: 0, insufficientZoneCount: 0, missingSystemZoneCount: 0 },
      validationMessages: globalMessages, trace: [], sourceReferenceIds: ["EN-ISO-52016-1-ZONE-LOAD", "HU-EKM-9-2023-MONTHLY-METHOD", "AIR-HEAT-CAPACITY-USER-SOURCE"], sourceCheckedAt: "2026-07-29", limitation: "Design heating load preparation only; not monthly or annual certification energy demand.",
    };
  }

  const external = finite(input.workspace.externalDesignTemperatureC);
  if (external === null) globalMessages.push(message({ code: "EXTERNAL_DESIGN_TEMPERATURE_REQUIRED", severity: "error", blocking: true, message: "A külső méretezési hőmérséklet kötelező." }));
  if (!input.workspace.externalTemperatureSourceReference.trim()) globalMessages.push(message({ code: "EXTERNAL_TEMPERATURE_SOURCE_REQUIRED", severity: "error", blocking: true, message: "A külső méretezési hőmérséklet forráshivatkozása kötelező." }));
  const airCapacity = positive(input.workspace.airHeatCapacityWhM3K);
  if (airCapacity === null) globalMessages.push(message({ code: "AIR_HEAT_CAPACITY_INVALID", severity: "error", blocking: true, message: "A levegő térfogati hőkapacitása legyen pozitív." }));
  if (!input.workspace.airHeatCapacitySourceReference.trim()) globalMessages.push(message({ code: "AIR_HEAT_CAPACITY_SOURCE_REQUIRED", severity: "error", blocking: true, message: "A levegő térfogati hőkapacitásának forráshivatkozása kötelező." }));

  const levelMap = new Map(input.levels.map((level) => [level.id, level]));
  const sortedLevels = [...input.levels].sort((left, right) => left.order - right.order);
  const segmentMap = new Map(input.wallSegments.map((segment) => [segment.id, segment]));
  const openingMap = new Map(input.wallOpenings.map((opening) => [opening.id, opening]));
  const assemblyMap = new Map(input.assemblies.map((assembly) => [assembly.id, assembly]));
  const assemblyResultMap = new Map(input.assemblySet.results.map((result) => [result.assemblyId, result]));
  const systemValidation = validateSystems({ systems: input.workspace.systems, zones: input.zoneSet.zones, devices: input.mechanicalDevices });
  globalMessages.push(...systemValidation.messages);
  const validZoneIds = new Set(input.zoneSet.zones.map((zone) => zone.zoneId));
  const thermalBridgeZoneAssignments = new Map<string, string>();
  for (const bridge of input.openingWorkspace.thermalBridges) {
    const assignedZoneId = assignedThermalBridgeZone({ bridge, zoneWorkspace: input.zoneWorkspace, wallSegments: input.wallSegments, wallOpenings: input.wallOpenings });
    if (!assignedZoneId || !validZoneIds.has(assignedZoneId)) globalMessages.push(message({ code: "THERMAL_BRIDGE_ZONE_UNASSIGNED", severity: "error", blocking: true, thermalBridgeId: bridge.id, entityName: bridge.name, message: `${bridge.name}: a hőhíd nem rendelhető egyértelműen létező energetikai zónához.` }));
    else thermalBridgeZoneAssignments.set(bridge.id, assignedZoneId);
  }

  const zoneResults: EnergyZoneDemandResult[] = [];
  for (const zone of input.zoneSet.zones) {
    const messages: EnergyDemandValidationMessage[] = [];
    const components: EnergyDemandComponentRow[] = [];
    const trace: EnergyDemandTraceItem[] = [];
    const delta = external === null ? null : zone.heatingSetpointC - external;
    if (delta !== null && !(delta > 0)) messages.push(message({ code: "ZONE_TEMPERATURE_DIFFERENCE_INVALID", severity: "error", blocking: true, zoneId: zone.zoneId, entityName: zone.zoneName, message: `${zone.zoneName}: a fűtési alapérték nem magasabb a külső méretezési hőmérsékletnél.` }));
    if (delta !== null && delta > 0) trace.push(traceItem({ ruleId: "DEMAND-DESIGN-DELTA-T-001", label: `${zone.zoneName} méretezési hőmérséklet-különbsége`, formula: "ΔT = θint − θe", inputs: { heatingSetpointC: zone.heatingSetpointC, externalDesignTemperatureC: external }, unroundedValue: delta, unit: "K", entityRefs: zoneRef(zone) }));

    const zoneRoomIds = new Set(zone.roomIds);
    const zoneWalls = input.geometry.wallRows.filter((row) => zoneRoomIds.has(row.roomId));
    for (const row of zoneWalls) {
      const segment = segmentMap.get(row.wallSegmentId);
      if (!segment) continue;
      const assembly = segment.assemblyId ? assemblyMap.get(segment.assemblyId) : undefined;
      const result = segment.assemblyId ? assemblyResultMap.get(segment.assemblyId) : undefined;
      if (!segment.assemblyId) messages.push(message({ code: "WALL_ASSEMBLY_REQUIRED", severity: "error", blocking: true, zoneId: zone.zoneId, roomId: row.roomId, wallSegmentId: segment.id, entityName: row.wallName, message: `${row.wallName}: a zónaterheléshez rétegrend-hozzárendelés szükséges.` }));
      const u = assemblyEffectiveU(result, assembly);
      if (segment.assemblyId && u === null) messages.push(message({ code: "WALL_ASSEMBLY_RESULT_INVALID", severity: "error", blocking: true, zoneId: zone.zoneId, roomId: row.roomId, wallSegmentId: segment.id, entityName: row.wallName, message: `${row.wallName}: nincs használható U-érték. Talajjal érintkező szerkezetnél dokumentált, deklarált egyenértékű U szükséges.` }));
      if (u === null || external === null) continue;
      const boundary = resolveWallBoundary({ zone, segment, zoneSet: input.zoneSet, workspace: input.workspace, externalTemperatureC: external, messages });
      if (!boundary) continue;
      addComponent({ components, trace, zone, kind: "wall", entityId: segment.id, entityName: row.wallName, areaSquareMeters: row.netAreaSquareMeters, uValueWm2K: u, baseHeatLossCoefficientWK: row.netAreaSquareMeters * u, temperatureFactor: boundary.factor, sourceReference: `${result?.assemblyName || assembly?.name || "Rétegrend"}; ${boundary.sourceReference}`, ruleId: "DEMAND-WALL-TRANSMISSION-002", formula: "Htr,fal = A × U × b" });
    }

    for (const connection of input.zoneSet.connections.filter((item) => item.kind === "zoneToZone" && (item.sourceZoneId === zone.zoneId || item.targetZoneId === zone.zoneId))) {
      const otherZoneId = connection.sourceZoneId === zone.zoneId ? connection.targetZoneId : connection.sourceZoneId;
      const otherZone = input.zoneSet.zones.find((item) => item.zoneId === otherZoneId);
      if (!otherZone || zone.heatingSetpointC <= otherZone.heatingSetpointC) continue;
      const segment = segmentMap.get(connection.wallSegmentId);
      if (!segment) continue;
      const assembly = segment.assemblyId ? assemblyMap.get(segment.assemblyId) : undefined;
      const result = segment.assemblyId ? assemblyResultMap.get(segment.assemblyId) : undefined;
      if (!segment.assemblyId) messages.push(message({ code: "WALL_ASSEMBLY_REQUIRED", severity: "error", blocking: true, zoneId: zone.zoneId, roomId: connection.sourceRoomId, wallSegmentId: segment.id, entityName: `${zone.zoneName} – ${otherZone.zoneName}`, message: `${zone.zoneName} és ${otherZone.zoneName} zónaközi falához rétegrend-hozzárendelés szükséges.` }));
      const u = assemblyEffectiveU(result, assembly);
      if (segment.assemblyId && u === null) messages.push(message({ code: "WALL_ASSEMBLY_RESULT_INVALID", severity: "error", blocking: true, zoneId: zone.zoneId, roomId: connection.sourceRoomId, wallSegmentId: segment.id, entityName: `${zone.zoneName} – ${otherZone.zoneName}`, message: `${zone.zoneName} és ${otherZone.zoneName} zónaközi falához nincs használható U-érték.` }));
      if (u === null || external === null) continue;
      const boundary = boundaryFactor({ zone, externalTemperatureC: external, condition: undefined, defaultTargetKind: "adjacentHeated", defaultTargetTemperatureC: otherZone.heatingSetpointC, defaultSourceReference: "Zónák fűtési alapértékei", messages, messageContext: { zoneId: zone.zoneId, wallSegmentId: segment.id }, entityName: `${zone.zoneName} – ${otherZone.zoneName}` });
      if (!boundary) continue;
      addComponent({ components, trace, zone, kind: "wall", entityId: `interzone-${connection.id}`, entityName: `${zone.zoneName} – ${otherZone.zoneName} zónaközi fal`, areaSquareMeters: connection.netAreaSquareMeters, uValueWm2K: u, baseHeatLossCoefficientWK: connection.netAreaSquareMeters * u, temperatureFactor: boundary.factor, sourceReference: `${result?.assemblyName || assembly?.name || "Rétegrend"}; ${boundary.sourceReference}`, ruleId: "DEMAND-INTERZONE-WALL-002B", formula: "Htr,zónaköz = A × U × (θmelegebb − θhűvösebb) / (θmelegebb − θe)" });
    }

    const zoneRooms = input.rooms.filter((room) => zoneRoomIds.has(room.id));
    for (const room of zoneRooms) {
      const level = levelMap.get(room.levelId || sortedLevels[0]?.id || "");
      if (!level) continue;
      const levelIndex = sortedLevels.findIndex((item) => item.id === level.id);
      const lowerLevel = sortedLevels[levelIndex - 1];
      const upperLevel = sortedLevels[levelIndex + 1];
      const lowerRooms = lowerLevel ? input.rooms.filter((candidate) => candidate.heated && (candidate.levelId || sortedLevels[0]?.id) === lowerLevel.id) : [];
      const upperRooms = upperLevel ? input.rooms.filter((candidate) => candidate.heated && (candidate.levelId || sortedLevels[0]?.id) === upperLevel.id) : [];
      const roomArea = Math.max(0, Number(room.area) || 0);
      const lowerArea = roomArea * (1 - (lowerRooms.length ? roomProjectedOverlapRatio(room, lowerRooms) : 0));
      const upperProjected = roomArea * (1 - (upperRooms.length ? roomProjectedOverlapRatio(room, upperRooms) : 0));
      const section = input.sectionLines.find((line) => line.levelId === level.id) || null;
      const upperArea = upperProjected * (usesSlopedUpperBoundary(level, room) ? roofSlopeFactor(section) : 1);

      for (const side of ["lower", "upper"] as const) {
        const area = side === "lower" ? lowerArea : upperArea;
        if (!(area > 0.0001)) continue;
        const assemblyId = side === "lower" ? room.floorAssemblyId : room.ceilingAssemblyId;
        const assembly = assemblyId ? assemblyMap.get(assemblyId) : undefined;
        const result = assemblyId ? assemblyResultMap.get(assemblyId) : undefined;
        if (!assemblyId) messages.push(message({ code: side === "lower" ? "ROOM_LOWER_ASSEMBLY_REQUIRED" : "ROOM_UPPER_ASSEMBLY_REQUIRED", severity: "error", blocking: true, zoneId: zone.zoneId, roomId: room.id, entityName: room.name, message: `${room.name}: a ${side === "lower" ? "lehűlő alsó" : "lehűlő felső"} határhoz rétegrend-hozzárendelés szükséges.` }));
        const u = assemblyEffectiveU(result, assembly);
        if (assemblyId && u === null) messages.push(message({ code: "ROOM_BOUNDARY_ASSEMBLY_RESULT_INVALID", severity: "error", blocking: true, zoneId: zone.zoneId, roomId: room.id, entityName: room.name, message: `${room.name}: a ${side === "lower" ? "padló" : "födém/tető"} rétegrendhez nincs használható U-érték. Talajjal érintkező szerkezetnél dokumentált, deklarált egyenértékű U szükséges.` }));
        if (u === null || external === null || !assembly) continue;
        const editableCondition = assembly.boundaryMode === "internalUnheated" ? input.workspace.roomBoundaryConditions[roomBoundaryConditionKey(room.id, side)] : undefined;
        const defaultKind = assembly.boundaryMode === "internalUnheated" ? "unheatedSpace" : "externalAir";
        const boundary = boundaryFactor({ zone, externalTemperatureC: external, condition: editableCondition, defaultTargetKind: defaultKind, defaultSourceReference: defaultKind === "externalAir" ? input.workspace.externalTemperatureSourceReference : undefined, messages, messageContext: { zoneId: zone.zoneId, roomId: room.id }, entityName: `${room.name} · ${side === "lower" ? "alsó határ" : "felső határ"}` });
        if (!boundary) continue;
        addComponent({ components, trace, zone, kind: side === "lower" ? "lowerBoundary" : "upperBoundary", entityId: `${room.id}:${side}`, entityName: `${room.name} · ${side === "lower" ? "alsó határ" : "felső határ"}`, areaSquareMeters: area, uValueWm2K: u, baseHeatLossCoefficientWK: area * u, temperatureFactor: boundary.factor, sourceReference: `${result?.assemblyName || assembly.name}; ${boundary.sourceReference}`, ruleId: side === "lower" ? "DEMAND-LOWER-BOUNDARY-003" : "DEMAND-UPPER-BOUNDARY-004", formula: side === "lower" ? "Htr,alsó = Aalsó × U × b" : "Htr,felső = Afelső × U × b" });
      }

      if (upperArea > 0.0001 && section && section.roofWindowCount > 0 && section.roofWindowWidthMeters > 0 && section.roofWindowHeightMeters > 0) messages.push(message({ code: "ROOF_OPENING_THERMAL_DATA_REQUIRED", severity: "error", blocking: true, zoneId: zone.zoneId, roomId: room.id, entityName: section.name, message: `${section.name}: ${section.roofWindowCount} tetőablak geometria szerepel, de nincs hozzá teljes Uw-adat és külön energetikai nyílászárórekord.` }));
    }

    for (const openingResult of input.openingSet.openings) {
      const opening = openingMap.get(openingResult.openingId);
      if (!opening || !zoneRoomIds.has(opening.roomId)) continue;
      if (openingResult.blocked || openingResult.openingHeatLossCoefficientWK === null) {
        messages.push(message({ code: "OPENING_RESULT_INVALID", severity: "error", blocking: true, zoneId: zone.zoneId, roomId: opening.roomId, openingId: opening.id, entityName: opening.name, message: `${opening.name}: nincs használható teljes Uw-eredmény.` }));
        continue;
      }
      const segment = segmentMap.get(opening.wallSegmentId);
      if (!segment || external === null) continue;
      const boundary = resolveWallBoundary({ zone, segment, zoneSet: input.zoneSet, workspace: input.workspace, externalTemperatureC: external, messages });
      if (!boundary) continue;
      addComponent({ components, trace, zone, kind: "opening", entityId: opening.id, entityName: opening.name, areaSquareMeters: openingResult.areaSquareMeters, uValueWm2K: openingResult.effectiveUwWm2K, baseHeatLossCoefficientWK: openingResult.openingHeatLossCoefficientWK, temperatureFactor: boundary.factor, sourceReference: input.openingWorkspace.openingDetails[opening.id]?.declaredSourceReference || input.openingWorkspace.openingDetails[opening.id]?.glazingEdgeSourceReference || "Nyílászáró Uw-számítás", ruleId: "DEMAND-OPENING-TRANSMISSION-005", formula: "Htr,ny = Aw × Uw × b" });
      if (openingResult.installationHeatLossCoefficientWK > 0) addComponent({ components, trace, zone, kind: "installationBridge", entityId: opening.id, entityName: `${opening.name} beépítési pereme`, areaSquareMeters: null, uValueWm2K: null, baseHeatLossCoefficientWK: openingResult.installationHeatLossCoefficientWK, temperatureFactor: boundary.factor, sourceReference: input.openingWorkspace.openingDetails[opening.id]?.installationPsiSourceReference || "Beépítési perem Ψ", ruleId: "DEMAND-INSTALLATION-BRIDGE-006", formula: "HΨ,beép = l × Ψ × b" });
    }

    for (const bridgeResult of input.openingSet.thermalBridges) {
      const bridge = input.openingWorkspace.thermalBridges.find((item) => item.id === bridgeResult.id);
      if (!bridge) continue;
      const assignedZoneId = thermalBridgeZoneAssignments.get(bridge.id);
      if (!assignedZoneId || assignedZoneId !== zone.zoneId) continue;
      if (bridgeResult.blocked || bridgeResult.heatLossCoefficientWK === null) continue;
      let factor = 1;
      let sourceReference = bridge.sourceReference;
      const segment = bridge.wallSegmentId ? segmentMap.get(bridge.wallSegmentId) : bridge.openingId ? segmentMap.get(openingMap.get(bridge.openingId)?.wallSegmentId || "") : undefined;
      if (segment && external !== null) {
        const boundary = resolveWallBoundary({ zone, segment, zoneSet: input.zoneSet, workspace: input.workspace, externalTemperatureC: external, messages });
        if (!boundary) continue;
        factor = boundary.factor;
        sourceReference = `${sourceReference}; ${boundary.sourceReference}`;
      }
      addComponent({ components, trace, zone, kind: "thermalBridge", entityId: bridge.id, entityName: bridge.name, areaSquareMeters: null, uValueWm2K: null, baseHeatLossCoefficientWK: bridgeResult.heatLossCoefficientWK, temperatureFactor: factor, sourceReference, ruleId: "DEMAND-THERMAL-BRIDGE-007", formula: "HΨ/χ = dokumentált hőhíd-tényező × b" });
    }

    const zoneSettings = input.workspace.zoneSettings[zone.zoneId];
    if (!zoneSettings) messages.push(message({ code: "ZONE_DEMAND_SETTINGS_MISSING", severity: "error", blocking: true, zoneId: zone.zoneId, entityName: zone.zoneName, message: `${zone.zoneName}: hiányzik a terhelési beállítás.` }));
    let ventilationH = 0;
    if (zoneSettings && airCapacity !== null) {
      let airflow: number | null = null;
      if (zoneSettings.ventilationMode === "airChange") {
        const airChange = positive(zoneSettings.airChangePerHour);
        if (airChange === null) messages.push(message({ code: "VENTILATION_AIR_CHANGE_REQUIRED", severity: "error", blocking: true, zoneId: zone.zoneId, entityName: zone.zoneName, message: `${zone.zoneName}: légcsereszám szükséges.` }));
        else airflow = airChange * zone.volumeCubicMeters;
      } else {
        airflow = positive(zoneSettings.designAirflowM3h);
        if (airflow === null) messages.push(message({ code: "VENTILATION_AIRFLOW_REQUIRED", severity: "error", blocking: true, zoneId: zone.zoneId, entityName: zone.zoneName, message: `${zone.zoneName}: méretezési légmennyiség szükséges.` }));
      }
      const recovery = zoneSettings.heatRecoveryEfficiency === undefined ? 0 : nonNegative(zoneSettings.heatRecoveryEfficiency);
      if (recovery === null || recovery > 1) messages.push(message({ code: "VENTILATION_HEAT_RECOVERY_INVALID", severity: "error", blocking: true, zoneId: zone.zoneId, entityName: zone.zoneName, message: `${zone.zoneName}: a hővisszanyerési hatásfok 0 és 1 közötti legyen.` }));
      if (!zoneSettings.ventilationSourceReference.trim()) messages.push(message({ code: "VENTILATION_SOURCE_REQUIRED", severity: "error", blocking: true, zoneId: zone.zoneId, entityName: zone.zoneName, message: `${zone.zoneName}: a légcsere vagy légmennyiség forráshivatkozása kötelező.` }));
      if (airflow !== null && recovery !== null && recovery <= 1) {
        ventilationH = airCapacity * airflow * (1 - recovery);
        addComponent({ components, trace, zone, kind: "ventilation", entityId: zone.zoneId, entityName: `${zone.zoneName} szellőzése`, areaSquareMeters: null, uValueWm2K: null, baseHeatLossCoefficientWK: ventilationH, temperatureFactor: 1, sourceReference: `${zoneSettings.ventilationSourceReference}; ${input.workspace.airHeatCapacitySourceReference}`, ruleId: "DEMAND-VENTILATION-008", formula: "Hve = cair × qv × (1 − ηHR)" });
        trace.push(traceItem({ ruleId: "DEMAND-VENTILATION-AIRFLOW-009", label: `${zone.zoneName} méretezési légmennyisége`, formula: zoneSettings.ventilationMode === "airChange" ? "qv = n × V" : "qv = megadott méretezési légmennyiség", inputs: { mode: zoneSettings.ventilationMode, airChangePerHour: zoneSettings.airChangePerHour ?? null, volumeCubicMeters: zone.volumeCubicMeters, designAirflowM3h: zoneSettings.designAirflowM3h ?? null }, unroundedValue: airflow, unit: "m3/h", entityRefs: zoneRef(zone) }));
      }
    }

    const wallH = sum(components.filter((row) => row.kind === "wall"), (row) => row.effectiveHeatLossCoefficientWK);
    const lowerH = sum(components.filter((row) => row.kind === "lowerBoundary"), (row) => row.effectiveHeatLossCoefficientWK);
    const upperH = sum(components.filter((row) => row.kind === "upperBoundary"), (row) => row.effectiveHeatLossCoefficientWK);
    const openingH = sum(components.filter((row) => row.kind === "opening"), (row) => row.effectiveHeatLossCoefficientWK);
    const installationH = sum(components.filter((row) => row.kind === "installationBridge"), (row) => row.effectiveHeatLossCoefficientWK);
    const bridgeH = sum(components.filter((row) => row.kind === "thermalBridge"), (row) => row.effectiveHeatLossCoefficientWK);
    const transmissionH = wallH + lowerH + upperH + openingH + installationH + bridgeH;
    const totalH = transmissionH + ventilationH;
    const blocked = messages.some((item) => item.blocking) || globalMessages.some((item) => item.blocking && !item.systemId);
    const power = !blocked && delta !== null && delta > 0 ? totalH * delta / 1000 : null;
    if (power !== null) trace.push(traceItem({ ruleId: "DEMAND-DESIGN-HEATING-POWER-010", label: `${zone.zoneName} méretezési fűtési teljesítménye`, formula: "ΦH,design = (Htr + Hve) × ΔT / 1000", inputs: { transmissionHeatLossCoefficientWK: transmissionH, ventilationHeatLossCoefficientWK: ventilationH, designTemperatureDifferenceK: delta }, unroundedValue: power, unit: "kW", entityRefs: zoneRef(zone) }));

    const heatingSystems = input.workspace.systems.filter((system) => system.service === "heating" && system.servedZoneIds.includes(zone.zoneId));
    const allocations = heatingSystems.flatMap((system) => {
      const explicit = positive(system.zoneCapacityAllocationsKw[zone.zoneId]);
      if (explicit !== null) return [explicit];
      const nominal = positive(system.nominalCapacityKw);
      return nominal !== null && system.servedZoneIds.length === 1 ? [nominal] : [];
    });
    const allocated = allocations.length ? sum(allocations, (value) => value) : null;
    let coverage: EnergyZoneDemandResult["systemCoverageStatus"] = "notRequired";
    if (!heatingSystems.length) {
      coverage = "missing";
      messages.push(message({ code: "ZONE_HEATING_SYSTEM_MISSING", severity: "warning", blocking: false, zoneId: zone.zoneId, entityName: zone.zoneName, message: `${zone.zoneName}: nincs fűtési rendszerhez kapcsolva.` }));
    } else if (allocated === null) {
      coverage = "unknownCapacity";
      messages.push(message({ code: "ZONE_SYSTEM_CAPACITY_UNKNOWN", severity: "warning", blocking: false, zoneId: zone.zoneId, entityName: zone.zoneName, message: `${zone.zoneName}: a kapcsolt fűtési rendszer zónára jutó kapacitása nincs meghatározva.` }));
    } else if (power !== null && allocated + 1e-9 < power) {
      coverage = "insufficient";
      messages.push(message({ code: "ZONE_SYSTEM_CAPACITY_INSUFFICIENT", severity: "warning", blocking: false, zoneId: zone.zoneId, entityName: zone.zoneName, message: `${zone.zoneName}: a ${round(allocated)} kW kapcsolt kapacitás kisebb a ${round(power)} kW méretezési igénynél.` }));
    } else if (power !== null) {
      coverage = "sufficient";
      messages.push(message({ code: "ZONE_SYSTEM_CAPACITY_SUFFICIENT", severity: "info", blocking: false, zoneId: zone.zoneId, entityName: zone.zoneName, message: `${zone.zoneName}: a ${round(allocated || 0)} kW kapcsolt kapacitás eléri a ${round(power)} kW méretezési igényt.` }));
    }

    zoneResults.push({
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      heatingSetpointC: zone.heatingSetpointC,
      externalDesignTemperatureC: external,
      designTemperatureDifferenceK: delta === null ? null : round(delta),
      floorAreaSquareMeters: zone.floorAreaSquareMeters,
      volumeCubicMeters: zone.volumeCubicMeters,
      wallHeatLossCoefficientWK: round(wallH),
      lowerBoundaryHeatLossCoefficientWK: round(lowerH),
      upperBoundaryHeatLossCoefficientWK: round(upperH),
      openingHeatLossCoefficientWK: round(openingH),
      installationHeatLossCoefficientWK: round(installationH),
      thermalBridgeHeatLossCoefficientWK: round(bridgeH),
      transmissionHeatLossCoefficientWK: round(transmissionH),
      ventilationHeatLossCoefficientWK: round(ventilationH),
      totalHeatLossCoefficientWK: round(totalH),
      designHeatingPowerKw: power === null ? null : round(power),
      designHeatingPowerPerAreaWm2: power === null || zone.floorAreaSquareMeters <= 0 ? null : round(power * 1000 / zone.floorAreaSquareMeters, 2),
      heatingSystemIds: heatingSystems.map((system) => system.id),
      allocatedHeatingCapacityKw: allocated === null ? null : round(allocated),
      capacityCoverageRatio: power === null || power <= 0 || allocated === null ? null : round(allocated / power, 4),
      systemCoverageStatus: coverage,
      blocked,
      validationMessages: messages,
      components,
      trace,
    });
  }

  const validationMessages = [...globalMessages, ...zoneResults.flatMap((zone) => zone.validationMessages)];
  const components = zoneResults.flatMap((zone) => zone.components);
  const trace = zoneResults.flatMap((zone) => zone.trace);
  const blocked = validationMessages.some((item) => item.blocking);
  const powers = zoneResults.map((zone) => zone.designHeatingPowerKw).filter((value): value is number => value !== null);
  return {
    schema: "dimpro.energy-demand-set.v0.7.5",
    engineVersion: "0.7.5",
    calculatedAt: input.calculatedAt || new Date().toISOString(),
    enabled: true,
    valid: !blocked && zoneResults.length > 0 && zoneResults.every((zone) => !zone.blocked && zone.designHeatingPowerKw !== null),
    blocked,
    zones: zoneResults,
    systems: systemValidation.results,
    components,
    totals: {
      zoneCount: zoneResults.length,
      calculatedZoneCount: zoneResults.filter((zone) => zone.designHeatingPowerKw !== null).length,
      blockedZoneCount: zoneResults.filter((zone) => zone.blocked).length,
      conditionedFloorAreaSquareMeters: round(sum(zoneResults, (zone) => zone.floorAreaSquareMeters)),
      conditionedVolumeCubicMeters: round(sum(zoneResults, (zone) => zone.volumeCubicMeters)),
      transmissionHeatLossCoefficientWK: round(sum(zoneResults, (zone) => zone.transmissionHeatLossCoefficientWK)),
      ventilationHeatLossCoefficientWK: round(sum(zoneResults, (zone) => zone.ventilationHeatLossCoefficientWK)),
      totalHeatLossCoefficientWK: round(sum(zoneResults, (zone) => zone.totalHeatLossCoefficientWK)),
      designHeatingPowerKw: powers.length === zoneResults.length ? round(sum(powers, (value) => value)) : null,
      allocatedHeatingCapacityKw: round(sum(zoneResults, (zone) => zone.allocatedHeatingCapacityKw || 0)),
      sufficientZoneCount: zoneResults.filter((zone) => zone.systemCoverageStatus === "sufficient").length,
      insufficientZoneCount: zoneResults.filter((zone) => zone.systemCoverageStatus === "insufficient").length,
      missingSystemZoneCount: zoneResults.filter((zone) => zone.systemCoverageStatus === "missing").length,
    },
    validationMessages,
    trace,
    sourceReferenceIds: ["EN-ISO-52016-1-ZONE-LOAD", "HU-EKM-9-2023-MONTHLY-METHOD", "AIR-HEAT-CAPACITY-USER-SOURCE"],
    sourceCheckedAt: "2026-07-29",
    limitation: "Design heating load preparation only; not monthly or annual certification energy demand.",
  };
}
