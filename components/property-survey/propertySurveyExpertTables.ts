import type { EnergyAssemblySetResult } from "@/components/energy/domain/energyAssemblyTypes";
import type { EnergyDemandSetResult } from "@/components/energy/domain/energyDemandTypes";
import type { EnergyEnvelopeGeometryResult } from "@/components/energy/domain/energyGeometryTypes";
import type { EnergyOpeningSetResult } from "@/components/energy/domain/energyOpeningTypes";
import type { EnergyRenewableSizingResult } from "@/components/energy/domain/energyRenewableTypes";
import type { EnergyRenovationComparisonSetResult } from "@/components/energy/domain/energyRenovationComparisonTypes";
import type { EnergyZoneSetResult } from "@/components/energy/domain/energyZoneTypes";
import type { PropertySurveyDraft } from "@/components/property-survey/propertySurveyWorkspaceTypes";

export type EnergyExpertCellValue = string | number | boolean | null;
export type EnergyExpertTableRow = { id: string; [key: string]: EnergyExpertCellValue };
export type EnergyExpertTableColumn = { key: string; label: string; unit?: string; sticky?: boolean };
export type EnergyExpertTable = {
  id: string;
  label: string;
  description: string;
  columns: EnergyExpertTableColumn[];
  rows: EnergyExpertTableRow[];
};

export type EnergyExpertTablesInput = {
  draft: PropertySurveyDraft;
  geometry: EnergyEnvelopeGeometryResult;
  assemblies: EnergyAssemblySetResult;
  zones: EnergyZoneSetResult;
  openings: EnergyOpeningSetResult;
  demand: EnergyDemandSetResult;
  renewables: EnergyRenewableSizingResult;
  renovationComparison: EnergyRenovationComparisonSetResult;
};

function number(value: unknown, digits = 3): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(digits)) : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function statusFromBlocked(blocked: boolean, valid = true) {
  if (blocked) return "Blokkolt";
  return valid ? "Rendben" : "Ellenőrzendő";
}

export function buildPropertySurveyExpertTables(input: EnergyExpertTablesInput): EnergyExpertTable[] {
  const { draft, geometry, assemblies, zones, openings, demand, renewables, renovationComparison } = input;
  const levelById = new Map(draft.levels.map((level) => [level.id, level]));
  const roomById = new Map(draft.rooms.map((room) => [room.id, room]));
  const wallById = new Map(draft.wallSegments.map((wall) => [wall.id, wall]));
  const assemblyById = new Map(draft.assemblies.map((assembly) => [assembly.id, assembly]));
  const assemblyResultById = new Map(assemblies.results.map((result) => [result.assemblyId, result]));
  const zoneById = new Map(draft.energyZoneWorkspace.zones.map((zone) => [zone.id, zone]));
  const openingDetailById = new Map(Object.entries(draft.energyOpeningWorkspace.openingDetails));
  const openingResultById = new Map(openings.openings.map((result) => [result.openingId, result]));
  const mechanicalById = new Map(draft.mechanicalDevices.map((device) => [device.id, device]));

  const generalRows: EnergyExpertTableRow[] = [
    ["Felmérés neve", draft.surveyName, "", "Projektadat", "documented"],
    ["Felmérési mód", draft.surveyMode, "", "Projektadat", "documented"],
    ["Cím", draft.property.address, "", "Helyszíni / tulajdonosi adat", draft.property.address ? "documented" : "reviewRequired"],
    ["Helyrajzi szám", draft.property.parcelNumber, "", "Tulajdoni / térképi adat", draft.property.parcelNumber ? "documented" : "reviewRequired"],
    ["Rendeltetés", draft.property.propertyType, "", "Helyszíni adat", "documented"],
    ["Építés éve", draft.property.constructionYear, "év", "Tulajdonosi / dokumentumadat", draft.property.constructionYear ? "documented" : "reviewRequired"],
    ["Hasznos fűtött alapterület", geometry.totals.conditionedFloorAreaSquareMeters, "m²", "Geometriai motor", geometry.blocked ? "reviewRequired" : "validated"],
    ["Kondicionált térfogat", geometry.totals.conditionedVolumeCubicMeters, "m³", "Geometriai motor", geometry.blocked ? "reviewRequired" : "validated"],
    ["Felület/térfogat arány", geometry.totals.areaToVolumeRatioPerMeter, "m²/m³", "Geometriai motor", geometry.blocked ? "reviewRequired" : "validated"],
    ["Külső méretezési hőmérséklet", draft.energyDemandWorkspace.externalDesignTemperatureC ?? null, "°C", draft.energyDemandWorkspace.externalTemperatureSourceReference, draft.energyDemandWorkspace.externalTemperatureSourceReference ? "documented" : "reviewRequired"],
  ].map((row, index) => ({ id: `general-${index + 1}`, field: text(row[0]), value: row[1] as EnergyExpertCellValue, unit: text(row[2]), source: text(row[3]), status: text(row[4]) }));

  const projectMaterialRows = draft.materialWorkspace.projectMaterials.map((entry) => ({
    id: entry.material.id,
    name: entry.material.productName,
    category: entry.material.categoryId,
    lambda: number(entry.version.designLambdaWmK?.value ?? entry.version.declaredLambdaWmK?.value, 4),
    density: number(entry.version.densityKgM3?.value, 1),
    specificHeat: number(entry.version.specificHeatJkgK?.value, 1),
    thickness: number(entry.version.defaultThicknessMm, 1),
    source: entry.version.sourcePackageId,
    status: entry.version.verificationStatus,
  }));
  const snapshotMaterials = new Map<string, EnergyExpertTableRow>();
  draft.assemblies.forEach((assembly) => assembly.layers.forEach((layer) => {
    if (!layer.materialSnapshot?.materialId || snapshotMaterials.has(layer.materialSnapshot.materialId)) return;
    snapshotMaterials.set(layer.materialSnapshot.materialId, {
      id: layer.materialSnapshot.materialId,
      name: layer.materialSnapshot.displayName,
      category: "Rétegrendi pillanatkép",
      lambda: number(layer.materialSnapshot.lambdaUsedWmK, 4),
      density: null,
      specificHeat: null,
      thickness: number(layer.thicknessCm * 10, 1),
      source: layer.materialSnapshot.sourcePackageId || "Rétegrendi pillanatkép",
      status: layer.materialSnapshot.verificationStatus,
    });
  }));
  const materialRows = [...projectMaterialRows, ...snapshotMaterials.values()].filter((row, index, rows) => rows.findIndex((item) => item.id === row.id) === index);

  const structureRows = draft.assemblies.map((assembly) => {
    const result = assemblyResultById.get(assembly.id);
    return {
      id: assembly.id,
      name: assembly.name,
      category: assembly.category,
      calculationMode: assembly.calculationMode,
      boundaryMode: assembly.boundaryMode,
      heatFlow: assembly.heatFlowDirection,
      totalThicknessCm: number(assembly.layers.reduce((sum, layer) => sum + Number(layer.thicknessCm || 0), 0), 2),
      layerCount: assembly.layers.length,
      calculatedU: number(result?.calculatedUValueWm2K, 4),
      declaredU: number(result?.declaredUValueWm2K, 4),
      effectiveU: number(result?.effectiveUValueWm2K, 4),
      requirementU: number(result?.requirementMaximumUValueWm2K, 4),
      compliance: result?.compliance || "notCalculated",
      status: result ? statusFromBlocked(result.blocked, result.valid) : "Nincs számítás",
    };
  });

  const layerRows = draft.assemblies.flatMap((assembly) => assembly.layers.map((layer, index) => {
    const result = assemblyResultById.get(assembly.id)?.layerResults.find((item) => item.layerId === layer.id);
    return {
      id: layer.id,
      structure: assembly.name,
      order: index + 1,
      kind: layer.kind,
      material: layer.material,
      thicknessCm: number(layer.thicknessCm, 2),
      lambda: number(layer.lambdaWmK, 4),
      resistance: number(result?.resistanceM2KPerW, 4),
      source: layer.materialSnapshot?.sourcePackageId || layer.note || "",
      status: result?.valid === false ? "Ellenőrzendő" : layer.materialSnapshot?.verificationStatus || "Kézi adat",
    };
  }));

  const roomRows = draft.rooms.map((room) => ({
    id: room.id,
    level: levelById.get(room.levelId || draft.activeLevelId)?.name || room.levelId || "",
    name: room.name,
    function: room.function,
    heated: room.heated,
    area: number(room.area, 2),
    height: number(room.height, 2),
    volume: number(room.area * room.height, 2),
    orientation: room.orientation,
    zone: zoneById.get(draft.energyZoneWorkspace.roomAssignments[room.id])?.name || "",
    unheatedSpace: draft.energyZoneWorkspace.unheatedSpaces.find((space) => space.id === draft.energyZoneWorkspace.unheatedRoomAssignments[room.id])?.name || "",
    floorAssembly: assemblyById.get(room.floorAssemblyId || "")?.name || "",
    ceilingAssembly: assemblyById.get(room.ceilingAssemblyId || "")?.name || "",
    status: room.heated ? (draft.energyZoneWorkspace.roomAssignments[room.id] ? "Rendben" : "Zóna hiányzik") : (draft.energyZoneWorkspace.unheatedRoomAssignments[room.id] ? "Rendben" : "Fűtetlen tér hiányzik"),
  }));

  const levelRows = draft.levels.map((level) => {
    const result = geometry.levelRows.find((item) => item.levelId === level.id);
    return {
      id: level.id,
      name: level.name,
      shortName: level.shortName,
      kind: level.kind,
      order: level.order,
      elevation: number(level.elevationMeters, 2),
      roomCount: result?.roomCount || 0,
      conditionedRooms: result?.conditionedRoomCount || 0,
      floorArea: number(result?.floorAreaSquareMeters, 2),
      conditionedArea: number(result?.conditionedFloorAreaSquareMeters, 2),
      conditionedVolume: number(result?.conditionedVolumeCubicMeters, 2),
      status: result ? "Rendben" : "Ellenőrzendő",
    };
  });

  const zoneRows = [
    ...zones.zones.map((zone) => ({
      id: zone.zoneId,
      kind: "Fűtött zóna",
      name: zone.zoneName,
      usage: zone.usageProfile,
      service: zone.serviceLevel,
      heatingSetpoint: number(zone.heatingSetpointC, 1),
      coolingSetpoint: number(zone.coolingSetpointC, 1),
      rooms: zone.roomCount,
      area: number(zone.floorAreaSquareMeters, 2),
      volume: number(zone.volumeCubicMeters, 2),
      externalWall: number(zone.externalWallAreaSquareMeters, 2),
      unheatedBoundary: number(zone.unheatedBoundaryAreaSquareMeters, 2),
      interzoneBoundary: number(zone.interzoneBoundaryAreaSquareMeters, 2),
      status: zones.validationMessages.some((message) => message.zoneId === zone.zoneId && message.blocking) ? "Blokkolt" : "Rendben",
    })),
    ...zones.unheatedSpaces.map((space) => ({
      id: space.unheatedSpaceId,
      kind: "Fűtetlen tér",
      name: space.unheatedSpaceName,
      usage: space.type,
      service: space.ventilation,
      heatingSetpoint: number(space.designTemperatureC, 1),
      coolingSetpoint: null,
      rooms: space.roomCount,
      area: number(space.floorAreaSquareMeters, 2),
      volume: number(space.volumeCubicMeters, 2),
      externalWall: null,
      unheatedBoundary: number(space.connectedBoundaryAreaSquareMeters, 2),
      interzoneBoundary: null,
      status: space.temperatureSourceReference ? "Rendben" : "Forrás hiányzik",
    })),
  ];

  const boundaryRows = geometry.wallRows.map((row) => {
    const wall = wallById.get(row.wallSegmentId);
    const assembly = wall?.assemblyId ? assemblyById.get(wall.assemblyId) : null;
    const result = wall?.assemblyId ? assemblyResultById.get(wall.assemblyId) : null;
    return {
      id: row.wallSegmentId,
      level: row.levelName,
      room: row.roomName,
      name: row.wallName,
      boundary: row.boundaryType,
      orientation: row.orientation,
      azimuth: number(row.azimuth, 1),
      length: number(row.lengthMeters, 3),
      height: number(row.heightMeters, 3),
      grossArea: number(row.grossAreaSquareMeters, 3),
      openingArea: number(row.openingAreaSquareMeters, 3),
      netArea: number(row.netAreaSquareMeters, 3),
      assembly: assembly?.name || wall?.wallType || "",
      uValue: number(result?.effectiveUValueWm2K, 4),
      heatLoss: result?.effectiveUValueWm2K ? number(row.netAreaSquareMeters * result.effectiveUValueWm2K, 4) : null,
      status: result ? statusFromBlocked(result.blocked, result.valid) : "Rétegrend hiányzik",
    };
  });

  const openingRows = draft.wallOpenings.map((opening) => {
    const detail = openingDetailById.get(opening.id);
    const result = openingResultById.get(opening.id);
    const room = roomById.get(opening.roomId);
    const wall = wallById.get(opening.wallSegmentId);
    return {
      id: opening.id,
      level: levelById.get(opening.levelId)?.name || opening.levelId,
      room: room?.name || opening.roomId,
      wall: wall?.wallType || opening.wallSegmentId,
      name: opening.name,
      kind: opening.kind,
      width: number(opening.widthMeters, 3),
      height: number(opening.heightMeters, 3),
      area: number(opening.widthMeters * opening.heightMeters, 3),
      frame: opening.frame,
      glazing: opening.glazing,
      mode: detail?.calculationMode || "",
      uw: number(result?.effectiveUwWm2K, 4),
      requirementUw: number(result?.requirementMaximumUwWm2K, 4),
      gValue: number(detail?.solarGValue, 3),
      installationPsi: number(detail?.installationPsiWmK, 4),
      compliance: result?.compliance || "notCalculated",
      source: detail?.declaredSourceReference || detail?.glazingEdgeSourceReference || detail?.installationPsiSourceReference || "",
      status: result ? statusFromBlocked(result.blocked, !result.blocked) : "Nincs számítás",
    };
  });

  const thermalBridgeRows = draft.energyOpeningWorkspace.thermalBridges.map((bridge) => {
    const result = openings.thermalBridges.find((item) => item.id === bridge.id);
    return {
      id: bridge.id,
      name: bridge.name,
      kind: bridge.kind,
      category: bridge.category,
      zone: zoneById.get(bridge.zoneId || "")?.name || "",
      room: roomById.get(bridge.roomId || "")?.name || "",
      length: number(bridge.lengthMeters, 3),
      quantity: number(bridge.quantity, 1),
      psi: number(bridge.psiWmK, 4),
      chi: number(bridge.chiWK, 4),
      heatLoss: number(result?.heatLossCoefficientWK, 4),
      source: bridge.sourceReference,
      status: result ? statusFromBlocked(result.blocked, !result.blocked) : "Nincs számítás",
    };
  });

  const systemRows = draft.energyDemandWorkspace.systems.map((system) => {
    const result = demand.systems.find((item) => item.systemId === system.id);
    return {
      id: system.id,
      name: system.name,
      service: system.service,
      type: system.type,
      zones: system.servedZoneIds.map((id) => zoneById.get(id)?.name || id).join("; "),
      devices: system.linkedSurveyDeviceIds.map((id) => mechanicalById.get(id)?.name || id).join("; "),
      nominalCapacity: number(system.nominalCapacityKw, 3),
      allocatedCapacity: number(result?.allocatedCapacityKw, 3),
      remainingCapacity: number(result?.remainingCapacityKw, 3),
      source: system.sourceReference,
      status: result?.blocked ? "Blokkolt" : "Rendben",
    };
  });

  const scenarioRows: EnergyExpertTableRow[] = draft.energyRenovationWorkspace.scenarios.flatMap<EnergyExpertTableRow>((scenario) => scenario.kind === "existing"
    ? [{ id: scenario.id, scenario: scenario.code, scenarioName: scenario.name, category: "Meglévő állapot", measure: "Felmért állapot", existing: "", proposal: "", currentValue: null, targetValue: null, unit: "", effect: "", dataStatus: scenario.status, included: true, source: "Helyszíni felmérés" }]
    : scenario.measures.map<EnergyExpertTableRow>((measure) => ({
      id: `${scenario.id}-${measure.id}`,
      scenario: scenario.code,
      scenarioName: scenario.name,
      category: measure.category,
      measure: measure.title,
      existing: measure.existingDescription,
      proposal: measure.proposedDescription,
      currentValue: number(measure.currentValue, 4),
      targetValue: number(measure.targetValue, 4),
      unit: measure.unit || "",
      effect: measure.effectLevel,
      dataStatus: measure.dataStatus,
      included: measure.included,
      source: measure.sourceReference,
    })));

  const renovationComparisonRows: EnergyExpertTableRow[] = renovationComparison.scenarios.map((scenario) => ({
    id: scenario.scenarioId,
    scenario: scenario.scenarioCode,
    scenarioName: scenario.scenarioName,
    kind: scenario.kind === "existing" ? "Meglévő" : "Tervezett",
    calculationStatus: scenario.calculationStatus,
    includedMeasures: scenario.includedMeasureCount,
    calculatedMeasures: scenario.calculatedMeasureCount,
    partialMeasures: scenario.partialMeasureCount,
    unavailableMeasures: scenario.unavailableMeasureCount,
    baselineTransmissionH: number(scenario.baseline.transmissionHeatLossCoefficientWK, 4),
    projectedTransmissionH: number(scenario.projected.transmissionHeatLossCoefficientWK, 4),
    transmissionReduction: number(scenario.change.transmissionHeatLossCoefficientWK, 4),
    transmissionReductionPercent: number(scenario.change.transmissionReductionPercent, 2),
    baselineTotalH: number(scenario.baseline.totalHeatLossCoefficientWK, 4),
    projectedTotalH: number(scenario.projected.totalHeatLossCoefficientWK, 4),
    totalReductionPercent: number(scenario.change.totalHeatLossReductionPercent, 2),
    baselineHeatingPower: number(scenario.baseline.designHeatingPowerKw, 4),
    projectedHeatingPower: number(scenario.projected.designHeatingPowerKw, 4),
    heatingPowerReduction: number(scenario.change.designHeatingPowerKw, 4),
    heatingPowerReductionPercent: number(scenario.change.designHeatingPowerReductionPercent, 2),
    plannedHeatingCapacity: number(scenario.projected.plannedHeatingCapacityKw, 4),
    heatingCapacityStatus: scenario.projected.heatingCapacityStatus,
    pvCapacity: number(scenario.renewables.pvCapacityKwp, 3),
    pvAnnualYield: number(scenario.renewables.pvAnnualYieldKwh, 1),
    solarThermalArea: number(scenario.renewables.solarThermalAreaSquareMeters, 2),
    solarThermalAnnualYield: number(scenario.renewables.solarThermalAnnualYieldKwh, 1),
    batteryCapacity: number(scenario.renewables.batteryCapacityKwh, 2),
    evChargerPower: number(scenario.renewables.evChargerPowerKw, 2),
    evAnnualEnergy: number(scenario.renewables.evAnnualHomeChargingEnergyKwh, 1),
    warningCount: scenario.validationMessages.filter((message) => message.severity === "warning").length,
    errorCount: scenario.validationMessages.filter((message) => message.severity === "error").length,
  }));

  const renewableRows: EnergyExpertTableRow[] = [
    { id: "pv", system: "Napelem", enabled: draft.energyRenewableWorkspace.pv.enabled, size: renewables.pv.installedPowerKwp, unit: "kWp", annualEnergy: renewables.pv.estimatedAnnualYieldKwh, annualUnit: "kWh/év", secondaryValue: renewables.pv.selectedPanelCount, secondaryUnit: "db panel", source: draft.energyRenewableWorkspace.pv.sourceReference, status: renewables.validationMessages.some((message) => message.code.startsWith("PV_") && message.severity === "blocking") ? "Blokkolt" : "Előzetes" },
    { id: "solar-thermal", system: "Napkollektor", enabled: draft.energyRenewableWorkspace.solarThermal.enabled, size: draft.energyRenewableWorkspace.solarThermal.collectorAreaSquareMeters, unit: "m²", annualEnergy: renewables.solarThermal.estimatedAnnualYieldKwh, annualUnit: "kWh/év", secondaryValue: renewables.solarThermal.suggestedStorageVolumeLiters, secondaryUnit: "liter tároló", source: draft.energyRenewableWorkspace.solarThermal.sourceReference, status: renewables.validationMessages.some((message) => message.code.startsWith("SOLAR_THERMAL_") && message.severity === "blocking") ? "Blokkolt" : "Előzetes" },
    { id: "battery", system: "Akkumulátor", enabled: draft.energyRenewableWorkspace.battery.enabled, size: draft.energyRenewableWorkspace.battery.nominalCapacityKwh, unit: "kWh névleges", annualEnergy: null, annualUnit: "", secondaryValue: renewables.battery.suggestedNominalCapacityKwh, secondaryUnit: "kWh javasolt", source: draft.energyRenewableWorkspace.battery.sourceReference, status: renewables.validationMessages.some((message) => message.code.startsWith("BATTERY_") && message.severity === "blocking") ? "Blokkolt" : "Előzetes" },
    { id: "ev", system: "Elektromosautó-töltés", enabled: draft.energyRenewableWorkspace.evCharging.enabled, size: draft.energyRenewableWorkspace.evCharging.chargerPowerKw, unit: "kW", annualEnergy: renewables.evCharging.annualHomeChargingEnergyKwh, annualUnit: "kWh/év", secondaryValue: renewables.evCharging.chargerCurrentAmps, secondaryUnit: "A/fázis", source: draft.energyRenewableWorkspace.evCharging.sourceReference, status: renewables.evCharging.connectionSufficient === false ? "Hálózat ellenőrzendő" : "Előzetes" },
  ];

  const sourceRows: EnergyExpertTableRow[] = [
    { id: "geometry", domain: "Geometria", source: geometry.schema, status: statusFromBlocked(geometry.blocked, geometry.valid), records: geometry.trace.length },
    { id: "assemblies", domain: "Rétegrendek", source: assemblies.ruleSourceReferenceId, status: assemblies.totals.blockedCount ? "Blokkolt" : "Rendben", records: assemblies.results.length },
    { id: "zones", domain: "Zónák", source: zones.sourceReferenceId, status: statusFromBlocked(zones.blocked, zones.valid), records: zones.trace.length },
    { id: "openings", domain: "Nyílászárók és hőhidak", source: openings.requirementSourceReferenceId, status: statusFromBlocked(openings.blocked, openings.valid), records: openings.trace.length },
    { id: "demand", domain: "Zónaterhelés", source: demand.schema, status: demand.blocked ? "Blokkolt" : demand.enabled ? "Előzetes méretezés" : "Kikapcsolva", records: demand.trace.length },
    { id: "renewables", domain: "Megújuló és villamos", source: renewables.schema, status: renewables.validationMessages.some((message) => message.severity === "blocking") ? "Blokkolt" : renewables.enabled ? "Előzetes méretezés" : "Kikapcsolva", records: renewables.validationMessages.length },
  ];

  return [
    { id: "general", label: "Általános adatok", description: "A tanúsítási egység, geometria és számítási alapadatok.", columns: [{ key: "field", label: "Adat", sticky: true }, { key: "value", label: "Érték" }, { key: "unit", label: "Mértékegység" }, { key: "source", label: "Forrás" }, { key: "status", label: "Státusz" }], rows: generalRows },
    { id: "materials", label: "Anyagok", description: "Projektanyagok és a rétegrendekben rögzített anyagpillanatképek.", columns: [{ key: "name", label: "Megnevezés", sticky: true }, { key: "category", label: "Kategória" }, { key: "lambda", label: "λ", unit: "W/mK" }, { key: "density", label: "ρ", unit: "kg/m³" }, { key: "specificHeat", label: "c", unit: "J/kgK" }, { key: "thickness", label: "Alapvastagság", unit: "mm" }, { key: "source", label: "Forrás" }, { key: "status", label: "Ellenőrzöttség" }], rows: materialRows },
    { id: "structures", label: "Szerkezetek", description: "Rétegrendek, U-értékek és követelményvizsgálat.", columns: [{ key: "name", label: "Megnevezés", sticky: true }, { key: "category", label: "Típus" }, { key: "calculationMode", label: "Számítás" }, { key: "boundaryMode", label: "Határolás" }, { key: "heatFlow", label: "Hőáram" }, { key: "totalThicknessCm", label: "Vastagság", unit: "cm" }, { key: "layerCount", label: "Réteg" }, { key: "calculatedU", label: "U számított", unit: "W/m²K" }, { key: "declaredU", label: "U deklarált", unit: "W/m²K" }, { key: "effectiveU", label: "U eredő", unit: "W/m²K" }, { key: "requirementU", label: "Követelmény", unit: "W/m²K" }, { key: "compliance", label: "Megfelelőség" }, { key: "status", label: "Státusz" }], rows: structureRows },
    { id: "layers", label: "Szerkezeti rétegek", description: "WinWatt-szerű rétegsor vastagsággal, λ és R értékkel.", columns: [{ key: "structure", label: "Szerkezet", sticky: true }, { key: "order", label: "Sorszám" }, { key: "kind", label: "Rétegtípus" }, { key: "material", label: "Anyag" }, { key: "thicknessCm", label: "d", unit: "cm" }, { key: "lambda", label: "λ", unit: "W/mK" }, { key: "resistance", label: "R", unit: "m²K/W" }, { key: "source", label: "Forrás" }, { key: "status", label: "Státusz" }], rows: layerRows },
    { id: "rooms", label: "Helyiségek", description: "A helyszíni alaprajzból automatikusan felépített helyiségtábla.", columns: [{ key: "name", label: "Helyiség", sticky: true }, { key: "level", label: "Szint" }, { key: "function", label: "Funkció" }, { key: "heated", label: "Fűtött" }, { key: "area", label: "A", unit: "m²" }, { key: "height", label: "Magasság", unit: "m" }, { key: "volume", label: "V", unit: "m³" }, { key: "orientation", label: "Tájolás" }, { key: "zone", label: "Zóna" }, { key: "unheatedSpace", label: "Fűtetlen tér" }, { key: "floorAssembly", label: "Padló" }, { key: "ceilingAssembly", label: "Födém / tető" }, { key: "status", label: "Státusz" }], rows: roomRows },
    { id: "levels", label: "Épületszintek", description: "Szintek geometriai és kondicionált összesítése.", columns: [{ key: "name", label: "Szint", sticky: true }, { key: "shortName", label: "Jel" }, { key: "kind", label: "Típus" }, { key: "order", label: "Sorrend" }, { key: "elevation", label: "Szintmagasság", unit: "m" }, { key: "roomCount", label: "Helyiségek" }, { key: "conditionedRooms", label: "Fűtött helyiségek" }, { key: "floorArea", label: "Összes A", unit: "m²" }, { key: "conditionedArea", label: "Fűtött A", unit: "m²" }, { key: "conditionedVolume", label: "Fűtött V", unit: "m³" }, { key: "status", label: "Státusz" }], rows: levelRows },
    { id: "zones", label: "Zónák és fűtetlen terek", description: "Használati és számítási zónák a WinWatt-logika szerint.", columns: [{ key: "name", label: "Megnevezés", sticky: true }, { key: "kind", label: "Típus" }, { key: "usage", label: "Használat" }, { key: "service", label: "Szolgáltatás / szellőzés" }, { key: "heatingSetpoint", label: "θF", unit: "°C" }, { key: "coolingSetpoint", label: "θH", unit: "°C" }, { key: "rooms", label: "Helyiségek" }, { key: "area", label: "A", unit: "m²" }, { key: "volume", label: "V", unit: "m³" }, { key: "externalWall", label: "Külső fal", unit: "m²" }, { key: "unheatedBoundary", label: "Fűtetlen határ", unit: "m²" }, { key: "interzoneBoundary", label: "Zónaköz", unit: "m²" }, { key: "status", label: "Státusz" }], rows: zoneRows },
    { id: "boundaries", label: "Határoló szerkezetek", description: "Tájolás, felület, rétegrend és AU összesítés.", columns: [{ key: "name", label: "Szerkezet", sticky: true }, { key: "level", label: "Szint" }, { key: "room", label: "Helyiség" }, { key: "boundary", label: "Határ" }, { key: "orientation", label: "Tájolás" }, { key: "azimuth", label: "Azimut", unit: "°" }, { key: "length", label: "L", unit: "m" }, { key: "height", label: "H", unit: "m" }, { key: "grossArea", label: "A bruttó", unit: "m²" }, { key: "openingArea", label: "A nyílás", unit: "m²" }, { key: "netArea", label: "A nettó", unit: "m²" }, { key: "assembly", label: "Rétegrend" }, { key: "uValue", label: "U", unit: "W/m²K" }, { key: "heatLoss", label: "AU", unit: "W/K" }, { key: "status", label: "Státusz" }], rows: boundaryRows },
    { id: "openings", label: "Nyílászárók", description: "Geometria, Uw, g, beépítési Ψ és követelmény.", columns: [{ key: "name", label: "Nyílászáró", sticky: true }, { key: "level", label: "Szint" }, { key: "room", label: "Helyiség" }, { key: "kind", label: "Típus" }, { key: "width", label: "Szélesség", unit: "m" }, { key: "height", label: "Magasság", unit: "m" }, { key: "area", label: "A", unit: "m²" }, { key: "frame", label: "Keret" }, { key: "glazing", label: "Üvegezés" }, { key: "mode", label: "Számítás" }, { key: "uw", label: "Uw", unit: "W/m²K" }, { key: "requirementUw", label: "Követelmény", unit: "W/m²K" }, { key: "gValue", label: "g" }, { key: "installationPsi", label: "Ψ beépítés", unit: "W/mK" }, { key: "compliance", label: "Megfelelőség" }, { key: "source", label: "Forrás" }, { key: "status", label: "Státusz" }], rows: openingRows },
    { id: "thermalBridges", label: "Hőhidak", description: "Lineáris és pontszerű hőhídértékek, zónakapcsolattal.", columns: [{ key: "name", label: "Hőhíd", sticky: true }, { key: "kind", label: "Típus" }, { key: "category", label: "Kategória" }, { key: "zone", label: "Zóna" }, { key: "room", label: "Helyiség" }, { key: "length", label: "L", unit: "m" }, { key: "quantity", label: "Darab" }, { key: "psi", label: "Ψ", unit: "W/mK" }, { key: "chi", label: "χ", unit: "W/K" }, { key: "heatLoss", label: "H", unit: "W/K" }, { key: "source", label: "Forrás" }, { key: "status", label: "Státusz" }], rows: thermalBridgeRows },
    { id: "systems", label: "Épülettechnikai rendszerek", description: "Fűtés, hűtés, HMV, szellőzés és rendszerkapacitások.", columns: [{ key: "name", label: "Rendszer", sticky: true }, { key: "service", label: "Szolgáltatás" }, { key: "type", label: "Típus" }, { key: "zones", label: "Zónák" }, { key: "devices", label: "Helyszíni berendezések" }, { key: "nominalCapacity", label: "Névleges", unit: "kW" }, { key: "allocatedCapacity", label: "Kiosztott", unit: "kW" }, { key: "remainingCapacity", label: "Tartalék", unit: "kW" }, { key: "source", label: "Forrás" }, { key: "status", label: "Státusz" }], rows: systemRows },
    { id: "renovation", label: "Felújítási változatok", description: "Meglévő és tervezett állapotok intézkedéslistája.", columns: [{ key: "scenario", label: "Változat", sticky: true }, { key: "scenarioName", label: "Megnevezés" }, { key: "category", label: "Kategória" }, { key: "measure", label: "Intézkedés" }, { key: "existing", label: "Meglévő" }, { key: "proposal", label: "Tervezett" }, { key: "currentValue", label: "Jelenlegi érték" }, { key: "targetValue", label: "Célérték" }, { key: "unit", label: "Egység" }, { key: "effect", label: "Hatás" }, { key: "dataStatus", label: "Adatstátusz" }, { key: "included", label: "Beválasztva" }, { key: "source", label: "Forrás" }], rows: scenarioRows },
    { id: "renovationComparison", label: "Változat-összehasonlítás", description: "M0 és a tervezett változatok számítható hőveszteségi, teljesítmény- és rendszerkapacitás-eredményei.", columns: [{ key: "scenario", label: "Változat", sticky: true }, { key: "scenarioName", label: "Megnevezés" }, { key: "kind", label: "Típus" }, { key: "calculationStatus", label: "Számíthatóság" }, { key: "includedMeasures", label: "Beválasztott" }, { key: "calculatedMeasures", label: "Számított" }, { key: "partialMeasures", label: "Részleges" }, { key: "unavailableMeasures", label: "Nem számítható" }, { key: "baselineTransmissionH", label: "Htr M0", unit: "W/K" }, { key: "projectedTransmissionH", label: "Htr terv", unit: "W/K" }, { key: "transmissionReduction", label: "Htr csökkenés", unit: "W/K" }, { key: "transmissionReductionPercent", label: "Htr csökkenés", unit: "%" }, { key: "baselineTotalH", label: "Hössz M0", unit: "W/K" }, { key: "projectedTotalH", label: "Hössz terv", unit: "W/K" }, { key: "totalReductionPercent", label: "Hössz csökkenés", unit: "%" }, { key: "baselineHeatingPower", label: "Φ M0", unit: "kW" }, { key: "projectedHeatingPower", label: "Φ terv", unit: "kW" }, { key: "heatingPowerReduction", label: "Φ csökkenés", unit: "kW" }, { key: "heatingPowerReductionPercent", label: "Φ csökkenés", unit: "%" }, { key: "plannedHeatingCapacity", label: "Fűtési kapacitás", unit: "kW" }, { key: "heatingCapacityStatus", label: "Kapacitásállapot" }, { key: "pvCapacity", label: "PV", unit: "kWp" }, { key: "pvAnnualYield", label: "PV hozam", unit: "kWh/év" }, { key: "solarThermalArea", label: "Napkollektor", unit: "m²" }, { key: "solarThermalAnnualYield", label: "Napkollektor hozam", unit: "kWh/év" }, { key: "batteryCapacity", label: "Akkumulátor", unit: "kWh" }, { key: "evChargerPower", label: "Autótöltő", unit: "kW" }, { key: "evAnnualEnergy", label: "EV energia", unit: "kWh/év" }, { key: "warningCount", label: "Figyelmeztetés" }, { key: "errorCount", label: "Hiba" }], rows: renovationComparisonRows },
    { id: "renewables", label: "Megújuló és villamos rendszerek", description: "Napelem, napkollektor, akkumulátor és autótöltés előméretezése.", columns: [{ key: "system", label: "Rendszer", sticky: true }, { key: "enabled", label: "Aktív" }, { key: "size", label: "Méret" }, { key: "unit", label: "Egység" }, { key: "annualEnergy", label: "Éves energia" }, { key: "annualUnit", label: "Éves egység" }, { key: "secondaryValue", label: "Másodlagos érték" }, { key: "secondaryUnit", label: "Másodlagos egység" }, { key: "source", label: "Forrás" }, { key: "status", label: "Státusz" }], rows: renewableRows },
    { id: "sources", label: "Források és ellenőrzés", description: "A számítási motorok, adatsémák és hibastátuszok összesítése.", columns: [{ key: "domain", label: "Adatcsoport", sticky: true }, { key: "source", label: "Motor / forrás" }, { key: "records", label: "Rekordok" }, { key: "status", label: "Státusz" }], rows: sourceRows },
  ];
}
