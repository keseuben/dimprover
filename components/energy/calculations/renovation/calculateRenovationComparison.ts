import type { EnergyDemandComponentRow, EnergyDemandSetResult } from "@/components/energy/domain/energyDemandTypes";
import type { EnergyOpeningWorkspace } from "@/components/energy/domain/energyOpeningTypes";
import type {
  EnergyRenovationComparisonSetResult,
  EnergyRenovationComparisonValidationMessage,
  EnergyRenovationMeasureComparisonResult,
  EnergyRenovationScenarioComparisonResult,
} from "@/components/energy/domain/energyRenovationComparisonTypes";
import type { EnergyRenovationMeasure, EnergyRenovationWorkspace } from "@/components/energy/domain/energyRenovationTypes";
import type { EnergyRenewableSizingResult, EnergyRenewableWorkspace } from "@/components/energy/domain/energyRenewableTypes";
import type { EnergyZoneSetResult } from "@/components/energy/domain/energyZoneTypes";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import type { SurveyWallSegment } from "@/components/property-survey/propertySurveyBuildingModel";

const ENVELOPE_CATEGORIES = new Set([
  "externalWall",
  "plinth",
  "atticFloor",
  "roof",
  "basementWall",
  "basementCeiling",
  "groundFloor",
]);

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function finitePositive(value: unknown) {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function percentReduction(current: number | null, projected: number | null) {
  if (current === null || projected === null || current <= 0) return null;
  return round((current - projected) / current * 100, 2);
}

function validation(input: EnergyRenovationComparisonValidationMessage): EnergyRenovationComparisonValidationMessage {
  return input;
}

function resultForUnavailable(measure: EnergyRenovationMeasure, message: string): EnergyRenovationMeasureComparisonResult {
  return {
    measureId: measure.id,
    category: measure.category,
    title: measure.title,
    targetEntityId: measure.targetEntityId,
    status: "unavailable",
    currentValue: finitePositive(measure.currentValue),
    targetValue: finitePositive(measure.targetValue),
    unit: measure.unit || "",
    currentHeatLossCoefficientWK: null,
    projectedHeatLossCoefficientWK: null,
    savedHeatLossCoefficientWK: null,
    savedDesignHeatingPowerKw: null,
    projectedAnnualEnergyKwh: null,
    projectedCapacityValue: null,
    projectedCapacityUnit: "",
    sourceReference: measure.sourceReference,
    message,
  };
}

function assemblyIdForComponent(input: {
  component: EnergyDemandComponentRow;
  wallById: Map<string, SurveyWallSegment>;
  roomById: Map<string, SurveyRoom>;
  interzoneWallByComponentId: Map<string, string>;
}) {
  const { component, wallById, roomById, interzoneWallByComponentId } = input;
  if (component.kind === "wall") {
    const direct = wallById.get(component.entityId);
    if (direct?.assemblyId) return direct.assemblyId;
    const interzoneWallId = interzoneWallByComponentId.get(component.entityId);
    return interzoneWallId ? wallById.get(interzoneWallId)?.assemblyId : undefined;
  }
  if (component.kind === "lowerBoundary" || component.kind === "upperBoundary") {
    const roomId = component.entityId.split(":")[0];
    const room = roomById.get(roomId);
    return component.kind === "lowerBoundary" ? room?.floorAssemblyId : room?.ceilingAssemblyId;
  }
  return undefined;
}

function baselineMetrics(demand: EnergyDemandSetResult) {
  const area = demand.totals.conditionedFloorAreaSquareMeters;
  return {
    transmissionHeatLossCoefficientWK: demand.enabled ? demand.totals.transmissionHeatLossCoefficientWK : null,
    ventilationHeatLossCoefficientWK: demand.enabled ? demand.totals.ventilationHeatLossCoefficientWK : null,
    totalHeatLossCoefficientWK: demand.enabled ? demand.totals.totalHeatLossCoefficientWK : null,
    designHeatingPowerKw: demand.enabled ? demand.totals.designHeatingPowerKw : null,
    designHeatingPowerPerAreaWm2: demand.enabled && demand.totals.designHeatingPowerKw !== null && area > 0
      ? round(demand.totals.designHeatingPowerKw * 1000 / area, 2)
      : null,
    allocatedHeatingCapacityKw: demand.enabled ? demand.totals.allocatedHeatingCapacityKw : null,
  };
}

export function calculateRenovationComparison(input: {
  workspace: EnergyRenovationWorkspace;
  demand: EnergyDemandSetResult;
  zones: EnergyZoneSetResult;
  wallSegments: SurveyWallSegment[];
  rooms: SurveyRoom[];
  openingWorkspace: EnergyOpeningWorkspace;
  renewableWorkspace: EnergyRenewableWorkspace;
  renewables: EnergyRenewableSizingResult;
  calculatedAt?: string;
}): EnergyRenovationComparisonSetResult {
  const baselineAvailable = input.demand.enabled && input.demand.valid && input.demand.totals.designHeatingPowerKw !== null;
  const baseline = baselineMetrics(input.demand);
  const wallById = new Map(input.wallSegments.map((wall) => [wall.id, wall]));
  const roomById = new Map(input.rooms.map((room) => [room.id, room]));
  const interzoneWallByComponentId = new Map(input.zones.connections
    .filter((connection) => connection.kind === "zoneToZone")
    .map((connection) => [`interzone-${connection.id}`, connection.wallSegmentId]));
  const zoneById = new Map(input.demand.zones.map((zone) => [zone.zoneId, zone]));
  const yieldPerKwp = input.renewables.pv.installedPowerKwp > 0 && input.renewables.pv.estimatedAnnualYieldKwh !== null
    ? input.renewables.pv.estimatedAnnualYieldKwh / input.renewables.pv.installedPowerKwp
    : null;
  const solarYieldPerSquareMeter = input.renewableWorkspace.solarThermal.collectorAreaSquareMeters > 0 && input.renewables.solarThermal.estimatedAnnualYieldKwh !== null
    ? input.renewables.solarThermal.estimatedAnnualYieldKwh / input.renewableWorkspace.solarThermal.collectorAreaSquareMeters
    : null;

  const scenarioResults: EnergyRenovationScenarioComparisonResult[] = input.workspace.scenarios.map((scenario) => {
    const messages: EnergyRenovationComparisonValidationMessage[] = [];
    const includedMeasures = scenario.kind === "proposal" ? scenario.measures.filter((measure) => measure.included) : [];
    if (!baselineAvailable) messages.push(validation({
      code: "BASE_DEMAND_NOT_AVAILABLE",
      severity: "warning",
      blocking: false,
      scenarioId: scenario.id,
      message: "A zónaterhelési alapállapot még nem teljesen számítható. A szerkezeti megtakarítás ezért nem jeleníthető meg.",
    }));
    if (scenario.kind === "proposal" && !includedMeasures.length) messages.push(validation({
      code: "SCENARIO_WITHOUT_INCLUDED_MEASURES",
      severity: "warning",
      blocking: false,
      scenarioId: scenario.id,
      message: "A tervezett változatban nincs beválasztott intézkedés.",
    }));

    const projectedComponentH = new Map(input.demand.components.map((component) => [component.id, component.effectiveHeatLossCoefficientWK]));
    const usedTargets = new Set<string>();
    const measureResults: EnergyRenovationMeasureComparisonResult[] = [];
    let plannedHeatingCapacityKw: number | null = null;
    let pvCapacityKwp: number | null = null;
    let pvAnnualYieldKwh: number | null = null;
    let solarAreaSquareMeters: number | null = null;
    let solarAnnualYieldKwh: number | null = null;
    let batteryCapacityKwh: number | null = null;
    let evChargerPowerKw: number | null = null;
    let evAnnualHomeChargingEnergyKwh: number | null = null;

    for (const measure of includedMeasures) {
      const target = finitePositive(measure.targetValue);
      const targetKey = `${measure.category}:${measure.targetEntityId || "general"}`;
      if (usedTargets.has(targetKey)) {
        messages.push(validation({ code: "MEASURE_DUPLICATE_TARGET", severity: "error", blocking: true, scenarioId: scenario.id, measureId: measure.id, message: `${measure.title}: ugyanaz a cél több beválasztott intézkedésben szerepel.` }));
        measureResults.push({ ...resultForUnavailable(measure, "Azonos cél kétszer szerepel; a kettős elszámolás miatt nem számítható."), status: "blocked" });
        continue;
      }
      usedTargets.add(targetKey);

      if (ENVELOPE_CATEGORIES.has(measure.category)) {
        if (!baselineAvailable) {
          measureResults.push(resultForUnavailable(measure, "A jelenlegi zónaterhelési alapállapot nélkül a szerkezeti hatás nem számítható."));
          continue;
        }
        if (!measure.targetEntityId) {
          messages.push(validation({ code: "MEASURE_ENTITY_MISSING", severity: "warning", blocking: false, scenarioId: scenario.id, measureId: measure.id, message: `${measure.title}: nincs konkrét rétegrendhez kapcsolva.` }));
          measureResults.push(resultForUnavailable(measure, "Konkrét rétegrend-hozzárendelés szükséges."));
          continue;
        }
        if (target === null) {
          messages.push(validation({ code: "MEASURE_TARGET_MISSING", severity: "warning", blocking: false, scenarioId: scenario.id, measureId: measure.id, message: `${measure.title}: hiányzik a cél-U-érték.` }));
          measureResults.push(resultForUnavailable(measure, "Pozitív cél-U-érték szükséges."));
          continue;
        }
        const matching = input.demand.components.filter((component) => assemblyIdForComponent({ component, wallById, roomById, interzoneWallByComponentId }) === measure.targetEntityId && component.areaSquareMeters !== null);
        if (!matching.length) {
          messages.push(validation({ code: "MEASURE_ENTITY_NOT_IN_DEMAND", severity: "warning", blocking: false, scenarioId: scenario.id, measureId: measure.id, message: `${measure.title}: a kapcsolt rétegrendhez nincs zónaterhelési felület.` }));
          measureResults.push(resultForUnavailable(measure, "A kapcsolt rétegrend nem szerepel a számítható lehűlő felületek között."));
          continue;
        }
        let currentH = 0;
        let projectedH = 0;
        let savedPower = 0;
        for (const component of matching) {
          const nextH = (component.areaSquareMeters || 0) * target * component.temperatureFactor;
          currentH += component.effectiveHeatLossCoefficientWK;
          projectedH += nextH;
          projectedComponentH.set(component.id, nextH);
          const zone = zoneById.get(component.zoneId);
          if (zone?.designTemperatureDifferenceK !== null && zone?.designTemperatureDifferenceK !== undefined) savedPower += (component.effectiveHeatLossCoefficientWK - nextH) * zone.designTemperatureDifferenceK / 1000;
        }
        measureResults.push({
          measureId: measure.id, category: measure.category, title: measure.title, targetEntityId: measure.targetEntityId,
          status: "calculated", currentValue: finitePositive(measure.currentValue), targetValue: target, unit: measure.unit || "W/m²K",
          currentHeatLossCoefficientWK: round(currentH), projectedHeatLossCoefficientWK: round(projectedH), savedHeatLossCoefficientWK: round(currentH - projectedH), savedDesignHeatingPowerKw: round(savedPower),
          projectedAnnualEnergyKwh: null, projectedCapacityValue: null, projectedCapacityUnit: "", sourceReference: measure.sourceReference,
          message: "A változás a kapcsolt felületek, a cél-U-érték és a zónánkénti hőmérsékleti tényező alapján számított.",
        });
        continue;
      }

      if (measure.category === "opening") {
        if (!baselineAvailable) {
          measureResults.push(resultForUnavailable(measure, "A jelenlegi zónaterhelési alapállapot nélkül a nyílászáró hatása nem számítható."));
          continue;
        }
        if (!measure.targetEntityId || target === null) {
          messages.push(validation({ code: measure.targetEntityId ? "MEASURE_TARGET_MISSING" : "MEASURE_ENTITY_MISSING", severity: "warning", blocking: false, scenarioId: scenario.id, measureId: measure.id, message: `${measure.title}: nyílászáró-azonosító és pozitív cél-Uw szükséges.` }));
          measureResults.push(resultForUnavailable(measure, "Konkrét nyílászáró és cél-Uw szükséges."));
          continue;
        }
        const component = input.demand.components.find((row) => row.kind === "opening" && row.entityId === measure.targetEntityId && row.areaSquareMeters !== null);
        if (!component) {
          messages.push(validation({ code: "MEASURE_ENTITY_NOT_IN_DEMAND", severity: "warning", blocking: false, scenarioId: scenario.id, measureId: measure.id, message: `${measure.title}: a kapcsolt nyílászáró nincs a zónaterhelési komponensek között.` }));
          measureResults.push(resultForUnavailable(measure, "A nyílászáró nincs számítható zónaterhelési komponenshez kapcsolva."));
          continue;
        }
        const projectedH = (component.areaSquareMeters || 0) * target * component.temperatureFactor;
        projectedComponentH.set(component.id, projectedH);
        const zone = zoneById.get(component.zoneId);
        const savedPower = zone?.designTemperatureDifferenceK === null || zone?.designTemperatureDifferenceK === undefined ? null : (component.effectiveHeatLossCoefficientWK - projectedH) * zone.designTemperatureDifferenceK / 1000;
        const connectionUnchanged = input.demand.components.some((row) => row.kind === "installationBridge" && row.entityId === measure.targetEntityId && row.effectiveHeatLossCoefficientWK > 0)
          || input.openingWorkspace.thermalBridges.some((bridge) => bridge.openingId === measure.targetEntityId);
        if (connectionUnchanged) messages.push(validation({ code: "MEASURE_PARTIAL_CONNECTION_EFFECT", severity: "info", blocking: false, scenarioId: scenario.id, measureId: measure.id, message: `${measure.title}: az Uw változása számított, a beépítési és csatlakozási hőhidak célértéke változatlan maradt.` }));
        measureResults.push({
          measureId: measure.id, category: measure.category, title: measure.title, targetEntityId: measure.targetEntityId,
          status: connectionUnchanged ? "partial" : "calculated", currentValue: finitePositive(measure.currentValue), targetValue: target, unit: measure.unit || "W/m²K",
          currentHeatLossCoefficientWK: round(component.effectiveHeatLossCoefficientWK), projectedHeatLossCoefficientWK: round(projectedH), savedHeatLossCoefficientWK: round(component.effectiveHeatLossCoefficientWK - projectedH), savedDesignHeatingPowerKw: savedPower === null ? null : round(savedPower),
          projectedAnnualEnergyKwh: null, projectedCapacityValue: null, projectedCapacityUnit: "", sourceReference: measure.sourceReference,
          message: connectionUnchanged ? "Az Uw-változás számított; a beépítési perem és külön hőhidak változatlanok." : "A nyílászáró cél-Uw értékéből számított változás.",
        });
        continue;
      }

      if (measure.category === "heating") {
        if (target === null || !String(measure.unit || "").toLocaleLowerCase("hu-HU").includes("kw")) {
          messages.push(validation({ code: "MEASURE_TARGET_MISSING", severity: "warning", blocking: false, scenarioId: scenario.id, measureId: measure.id, message: `${measure.title}: a kapacitás-összehasonlításhoz kW célérték szükséges.` }));
          measureResults.push(resultForUnavailable(measure, "A rendszer energetikai megtakarítása még nem számítható; kW célértékkel a kapacitás lefedettsége ellenőrizhető."));
          continue;
        }
        plannedHeatingCapacityKw = target;
        measureResults.push({ ...resultForUnavailable(measure, "A tervezett fűtési kapacitás a méretezési hőigénnyel összevethető; éves energiahatás még nem számítható."), status: "partial", projectedCapacityValue: target, projectedCapacityUnit: "kW" });
        continue;
      }

      if (measure.category === "pv") {
        if (target === null) {
          measureResults.push(resultForUnavailable(measure, "A napelemes rendszerhez kWp célérték szükséges."));
          continue;
        }
        pvCapacityKwp = target;
        pvAnnualYieldKwh = yieldPerKwp === null ? null : round(target * yieldPerKwp, 1);
        if (yieldPerKwp === null) messages.push(validation({ code: "RENEWABLE_REFERENCE_NOT_AVAILABLE", severity: "warning", blocking: false, scenarioId: scenario.id, measureId: measure.id, message: `${measure.title}: nincs használható fajlagos hozamhivatkozás.` }));
        measureResults.push({ ...resultForUnavailable(measure, pvAnnualYieldKwh === null ? "A kapacitás rögzített, az éves hozamhoz még nincs használható referencia." : "A hozam a jelenlegi tetősík- és hozamfeltételek fajlagos értékével arányosított előzetes eredmény."), status: pvAnnualYieldKwh === null ? "partial" : "calculated", projectedAnnualEnergyKwh: pvAnnualYieldKwh, projectedCapacityValue: target, projectedCapacityUnit: "kWp" });
        continue;
      }

      if (measure.category === "solarThermal") {
        if (target === null) {
          measureResults.push(resultForUnavailable(measure, "A napkollektorhoz m² célfelület szükséges."));
          continue;
        }
        solarAreaSquareMeters = target;
        solarAnnualYieldKwh = solarYieldPerSquareMeter === null ? null : round(target * solarYieldPerSquareMeter, 1);
        if (solarYieldPerSquareMeter === null) messages.push(validation({ code: "RENEWABLE_REFERENCE_NOT_AVAILABLE", severity: "warning", blocking: false, scenarioId: scenario.id, measureId: measure.id, message: `${measure.title}: nincs használható fajlagos kollektorhozam.` }));
        measureResults.push({ ...resultForUnavailable(measure, solarAnnualYieldKwh === null ? "A kollektorfelület rögzített, az éves hozam még nem számítható." : "A hozam a jelenlegi tetősík- és kollektoradatok fajlagos értékével arányosított előzetes eredmény."), status: solarAnnualYieldKwh === null ? "partial" : "calculated", projectedAnnualEnergyKwh: solarAnnualYieldKwh, projectedCapacityValue: target, projectedCapacityUnit: "m²" });
        continue;
      }

      if (measure.category === "battery") {
        if (target === null) {
          measureResults.push(resultForUnavailable(measure, "Az energiatárolóhoz kWh célkapacitás szükséges."));
          continue;
        }
        batteryCapacityKwh = target;
        measureResults.push({ ...resultForUnavailable(measure, "A névleges kapacitás összehasonlítható; az éves pénzügyi és energiahatás órás profil nélkül még nem számítható."), status: "partial", projectedCapacityValue: target, projectedCapacityUnit: "kWh" });
        continue;
      }

      if (measure.category === "evCharging") {
        if (target === null) {
          measureResults.push(resultForUnavailable(measure, "Az autótöltőhöz kW célkapacitás szükséges."));
          continue;
        }
        evChargerPowerKw = target;
        evAnnualHomeChargingEnergyKwh = input.renewables.evCharging.annualHomeChargingEnergyKwh;
        measureResults.push({ ...resultForUnavailable(measure, "A töltőteljesítmény és a jelenlegi járműhasználatból származó éves töltési igény összehasonlítható; megtakarítás nem értelmezhető."), status: "partial", projectedAnnualEnergyKwh: evAnnualHomeChargingEnergyKwh, projectedCapacityValue: target, projectedCapacityUnit: "kW" });
        continue;
      }

      messages.push(validation({ code: "MEASURE_METHOD_NOT_AVAILABLE", severity: "info", blocking: false, scenarioId: scenario.id, measureId: measure.id, message: `${measure.title}: ehhez az intézkedéshez még nincs validált összehasonlító számítási módszer.` }));
      measureResults.push(resultForUnavailable(measure, "A beavatkozás megmarad a változatban, de számszerű energetikai hatása még nem számítható."));
    }

    const projectedZoneRows = input.demand.zones.map((zone) => {
      const transmission = zone.components.filter((component) => component.kind !== "ventilation").reduce((sum, component) => sum + (projectedComponentH.get(component.id) ?? component.effectiveHeatLossCoefficientWK), 0);
      const total = transmission + zone.ventilationHeatLossCoefficientWK;
      const power = zone.designTemperatureDifferenceK === null || zone.blocked ? null : total * zone.designTemperatureDifferenceK / 1000;
      return { zoneId: zone.zoneId, transmission, total, power };
    });
    const projectedTransmission = baselineAvailable ? round(projectedZoneRows.reduce((sum, zone) => sum + zone.transmission, 0)) : null;
    const projectedVentilation = baselineAvailable ? baseline.ventilationHeatLossCoefficientWK : null;
    const projectedTotal = projectedTransmission === null || projectedVentilation === null ? null : round(projectedTransmission + projectedVentilation);
    const projectedPowers = projectedZoneRows.map((zone) => zone.power).filter((value): value is number => value !== null);
    const projectedPower = baselineAvailable && projectedPowers.length === input.demand.zones.length ? round(projectedPowers.reduce((sum, value) => sum + value, 0)) : null;
    const area = input.demand.totals.conditionedFloorAreaSquareMeters;
    const projectedPowerPerArea = projectedPower !== null && area > 0 ? round(projectedPower * 1000 / area, 2) : null;
    const effectiveHeatingCapacity = plannedHeatingCapacityKw ?? baseline.allocatedHeatingCapacityKw;
    const heatingCoverageRatio = projectedPower !== null && projectedPower > 0 && effectiveHeatingCapacity !== null ? round(effectiveHeatingCapacity / projectedPower, 4) : null;
    const heatingCapacityStatus: EnergyRenovationScenarioComparisonResult["projected"]["heatingCapacityStatus"] = heatingCoverageRatio === null ? "unknown" : heatingCoverageRatio + 1e-9 < 1 ? "insufficient" : "sufficient";
    if (scenario.kind === "proposal" && heatingCapacityStatus === "insufficient") messages.push(validation({ code: "HEATING_CAPACITY_INSUFFICIENT", severity: "warning", blocking: false, scenarioId: scenario.id, message: `${scenario.code}: a ${effectiveHeatingCapacity?.toFixed(2)} kW tervezett/kapcsolt kapacitás kisebb a ${projectedPower?.toFixed(2)} kW méretezési igénynél.` }));
    if (scenario.kind === "proposal" && heatingCapacityStatus === "sufficient") messages.push(validation({ code: "HEATING_CAPACITY_SUFFICIENT", severity: "info", blocking: false, scenarioId: scenario.id, message: `${scenario.code}: a tervezett/kapcsolt fűtési kapacitás eléri a méretezési igényt.` }));

    const calculatedCount = measureResults.filter((measure) => measure.status === "calculated").length;
    const partialCount = measureResults.filter((measure) => measure.status === "partial").length;
    const unavailableCount = measureResults.filter((measure) => measure.status === "unavailable").length;
    const blockedCount = measureResults.filter((measure) => measure.status === "blocked").length;
    const calculationStatus: EnergyRenovationScenarioComparisonResult["calculationStatus"] = scenario.kind === "existing"
      ? "baseline"
      : blockedCount > 0 || messages.some((message) => message.blocking)
        ? "blocked"
        : includedMeasures.length === 0 || calculatedCount + partialCount === 0
          ? "unavailable"
          : unavailableCount > 0 || partialCount > 0
            ? "partial"
            : "calculated";

    return {
      scenarioId: scenario.id,
      scenarioCode: scenario.code,
      scenarioName: scenario.name,
      scenarioStatus: scenario.status,
      kind: scenario.kind,
      calculationStatus,
      includedMeasureCount: includedMeasures.length,
      calculatedMeasureCount: calculatedCount,
      partialMeasureCount: partialCount,
      unavailableMeasureCount: unavailableCount + blockedCount,
      baseline,
      projected: {
        transmissionHeatLossCoefficientWK: scenario.kind === "existing" ? baseline.transmissionHeatLossCoefficientWK : projectedTransmission,
        ventilationHeatLossCoefficientWK: scenario.kind === "existing" ? baseline.ventilationHeatLossCoefficientWK : projectedVentilation,
        totalHeatLossCoefficientWK: scenario.kind === "existing" ? baseline.totalHeatLossCoefficientWK : projectedTotal,
        designHeatingPowerKw: scenario.kind === "existing" ? baseline.designHeatingPowerKw : projectedPower,
        designHeatingPowerPerAreaWm2: scenario.kind === "existing" ? baseline.designHeatingPowerPerAreaWm2 : projectedPowerPerArea,
        plannedHeatingCapacityKw: scenario.kind === "existing" ? baseline.allocatedHeatingCapacityKw : effectiveHeatingCapacity,
        heatingCapacityCoverageRatio: scenario.kind === "existing" && baseline.designHeatingPowerKw && baseline.allocatedHeatingCapacityKw !== null ? round(baseline.allocatedHeatingCapacityKw / baseline.designHeatingPowerKw, 4) : heatingCoverageRatio,
        heatingCapacityStatus: scenario.kind === "existing" ? (baseline.designHeatingPowerKw && baseline.allocatedHeatingCapacityKw !== null ? baseline.allocatedHeatingCapacityKw + 1e-9 < baseline.designHeatingPowerKw ? "insufficient" : "sufficient" : "unknown") : heatingCapacityStatus,
      },
      change: {
        transmissionHeatLossCoefficientWK: scenario.kind === "existing" || baseline.transmissionHeatLossCoefficientWK === null || projectedTransmission === null ? 0 : round(baseline.transmissionHeatLossCoefficientWK - projectedTransmission),
        transmissionReductionPercent: scenario.kind === "existing" ? 0 : percentReduction(baseline.transmissionHeatLossCoefficientWK, projectedTransmission),
        totalHeatLossCoefficientWK: scenario.kind === "existing" || baseline.totalHeatLossCoefficientWK === null || projectedTotal === null ? 0 : round(baseline.totalHeatLossCoefficientWK - projectedTotal),
        totalHeatLossReductionPercent: scenario.kind === "existing" ? 0 : percentReduction(baseline.totalHeatLossCoefficientWK, projectedTotal),
        designHeatingPowerKw: scenario.kind === "existing" || baseline.designHeatingPowerKw === null || projectedPower === null ? 0 : round(baseline.designHeatingPowerKw - projectedPower),
        designHeatingPowerReductionPercent: scenario.kind === "existing" ? 0 : percentReduction(baseline.designHeatingPowerKw, projectedPower),
      },
      renewables: {
        pvCapacityKwp: scenario.kind === "existing" ? null : pvCapacityKwp,
        pvAnnualYieldKwh: scenario.kind === "existing" ? null : pvAnnualYieldKwh,
        solarThermalAreaSquareMeters: scenario.kind === "existing" ? null : solarAreaSquareMeters,
        solarThermalAnnualYieldKwh: scenario.kind === "existing" ? null : solarAnnualYieldKwh,
        batteryCapacityKwh: scenario.kind === "existing" ? null : batteryCapacityKwh,
        evChargerPowerKw: scenario.kind === "existing" ? null : evChargerPowerKw,
        evAnnualHomeChargingEnergyKwh: scenario.kind === "existing" ? null : evAnnualHomeChargingEnergyKwh,
      },
      measures: measureResults,
      validationMessages: messages,
    };
  });

  return {
    schema: "dimpro.energy-renovation-comparison.v0.8.2",
    engineVersion: "0.8.2",
    calculatedAt: input.calculatedAt || new Date().toISOString(),
    baseScenarioId: "scenario-existing",
    baselineDemandAvailable: baselineAvailable,
    scenarios: scenarioResults,
    totals: {
      scenarioCount: scenarioResults.length,
      proposalCount: scenarioResults.filter((scenario) => scenario.kind === "proposal").length,
      calculatedScenarioCount: scenarioResults.filter((scenario) => scenario.calculationStatus === "calculated").length,
      partialScenarioCount: scenarioResults.filter((scenario) => scenario.calculationStatus === "partial").length,
      unavailableScenarioCount: scenarioResults.filter((scenario) => scenario.calculationStatus === "unavailable").length,
      blockedScenarioCount: scenarioResults.filter((scenario) => scenario.calculationStatus === "blocked").length,
    },
    limitation: "Preliminary scenario comparison based on validated current DIMPRO geometry, U-values and design heating load. It is not monthly or annual certification energy demand and does not replace WinWatt finalization.",
  };
}
