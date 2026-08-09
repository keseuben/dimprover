import {
  getWallSegmentHeightMeters,
  getWallSegmentLengthMeters,
  getWallSegmentOrientationLabel,
  type SurveyBuildingLevel,
  type SurveyWallOpening,
  type SurveyWallSegment,
} from "@/components/property-survey/propertySurveyBuildingModel";
import {
  getRoomUsableHeight,
  type SurveyConstructionAssembly,
} from "@/components/property-survey/propertySurveyEnergyModel";
import type { PropertySurveyDraft, PropertySurveyProject } from "@/components/property-survey/propertySurveyWorkspaceTypes";
import type { SurveyRoom } from "@/components/viewers/SurveyFloorPlanEngine";
import type { EnergyRequirementLevel } from "@/components/energy/domain/energyProjectTypes";
import type { EnergyZoneSetResult } from "@/components/energy/domain/energyZoneTypes";
import type { EnergyOpeningSetResult } from "@/components/energy/domain/energyOpeningTypes";
import type { EnergyDemandSetResult } from "@/components/energy/domain/energyDemandTypes";
import type { EnergyRenewableSizingResult } from "@/components/energy/domain/energyRenewableTypes";
import type { EnergyRenovationComparisonSetResult } from "@/components/energy/domain/energyRenovationComparisonTypes";
import type { WinWattFieldMapResult } from "@/components/energy/domain/energyWinWattTransferTypes";
import type { WinWattTrialFeedbackResult } from "@/components/energy/domain/energyWinWattTrialTypes";
import { calculateAssemblyThermalPerformance } from "@/components/energy/calculations/assemblies/calculateUValue";
import { huEkm20231101AssemblyRuleData } from "@/components/energy/regulations/HU_EKM_2023_11_01/factors";

export type SurveyAssemblyThermalResult = {
  assemblyId: string;
  assemblyName: string;
  validLayerCount: number;
  totalThicknessCm: number;
  thermalResistanceM2KPerW: number | null;
  uValueWm2K: number | null;
};

export type SurveyWallAreaRow = {
  levelId: string;
  levelName: string;
  roomId: string;
  roomName: string;
  wallSegmentId: string;
  boundaryType: SurveyWallSegment["boundaryType"];
  orientation: string;
  azimuth: number;
  lengthMeters: number;
  heightMeters: number;
  grossAreaSquareMeters: number;
  openingAreaSquareMeters: number;
  netAreaSquareMeters: number;
  assemblyId?: string;
  uValueWm2K: number | null;
};

export type SurveyOrientationEnergySummary = {
  orientation: string;
  azimuth: number;
  grossWallAreaSquareMeters: number;
  openingAreaSquareMeters: number;
  netWallAreaSquareMeters: number;
  openingCount: number;
};

export type SurveyLevelEnergySummary = {
  levelId: string;
  levelName: string;
  heatedFloorAreaSquareMeters: number;
  floorAreaSquareMeters: number;
  ceilingAreaSquareMeters: number;
  grossWallAreaSquareMeters: number;
  openingAreaSquareMeters: number;
  netWallAreaSquareMeters: number;
};

export type SurveyEnergySummary = {
  wallRows: SurveyWallAreaRow[];
  orientationRows: SurveyOrientationEnergySummary[];
  levelRows: SurveyLevelEnergySummary[];
  assemblyRows: SurveyAssemblyThermalResult[];
  totals: {
    grossWallAreaSquareMeters: number;
    openingAreaSquareMeters: number;
    netWallAreaSquareMeters: number;
    floorAreaSquareMeters: number;
    heatedFloorAreaSquareMeters: number;
    ceilingAreaSquareMeters: number;
  };
};

function round(value: number, digits = 2) {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

export function calculateAssemblyUValue(assembly: SurveyConstructionAssembly, requirementLevel: EnergyRequirementLevel = "existingNoRequirement"): SurveyAssemblyThermalResult {
  const result = calculateAssemblyThermalPerformance({
    assembly,
    rules: huEkm20231101AssemblyRuleData,
    requirementLevel,
  });
  return {
    assemblyId: assembly.id,
    assemblyName: assembly.name,
    validLayerCount: result.layerResults.filter((layer) => layer.valid).length,
    totalThicknessCm: round(assembly.layers.reduce((sum, layer) => sum + Math.max(0, Number(layer.thicknessCm) || 0), 0)),
    thermalResistanceM2KPerW: result.totalResistanceM2KPerW === null ? null : round(result.totalResistanceM2KPerW, 3),
    uValueWm2K: result.effectiveUValueWm2K === null ? null : round(result.effectiveUValueWm2K, 3),
  };
}

function openingAreaForSegment(segmentId: string, openings: SurveyWallOpening[]) {
  return openings.filter((opening) => opening.wallSegmentId === segmentId).reduce((sum, opening) => sum + Math.max(0, Number(opening.widthMeters) || 0) * Math.max(0, Number(opening.heightMeters) || 0), 0);
}

export function calculateSurveyEnergySummary(input: {
  rooms: SurveyRoom[];
  levels: SurveyBuildingLevel[];
  wallSegments: SurveyWallSegment[];
  wallOpenings: SurveyWallOpening[];
  assemblies: SurveyConstructionAssembly[];
  northAngle: number;
}) : SurveyEnergySummary {
  const assemblyRows = input.assemblies.map((assembly) => calculateAssemblyUValue(assembly));
  const assemblyMap = new Map(assemblyRows.map((item) => [item.assemblyId, item]));
  const roomMap = new Map(input.rooms.map((room) => [room.id, room]));
  const levelMap = new Map(input.levels.map((level) => [level.id, level]));
  const relevantSegments = input.wallSegments.filter((segment) => segment.boundaryType === "external" || segment.boundaryType === "unheated" || segment.boundaryType === "adjacent" || segment.boundaryType === "ground");

  const wallRows = relevantSegments.flatMap((segment): SurveyWallAreaRow[] => {
    const room = roomMap.get(segment.roomId);
    if (!room) return [];
    const level = levelMap.get(segment.levelId);
    const lengthMeters = getWallSegmentLengthMeters(room, segment);
    const heightMeters = segment.heightMeters ? getWallSegmentHeightMeters(room, segment) : (getRoomUsableHeight(room) || Math.max(0, Number(room.height) || 0));
    const grossAreaSquareMeters = lengthMeters * heightMeters;
    const openingAreaSquareMeters = Math.min(grossAreaSquareMeters, openingAreaForSegment(segment.id, input.wallOpenings));
    const orientation = getWallSegmentOrientationLabel(segment, input.northAngle);
    return [{
      levelId: segment.levelId,
      levelName: level?.name || segment.levelId,
      roomId: room.id,
      roomName: room.name,
      wallSegmentId: segment.id,
      boundaryType: segment.boundaryType,
      orientation: orientation.label,
      azimuth: orientation.azimuth,
      lengthMeters: round(lengthMeters),
      heightMeters: round(heightMeters),
      grossAreaSquareMeters: round(grossAreaSquareMeters),
      openingAreaSquareMeters: round(openingAreaSquareMeters),
      netAreaSquareMeters: round(Math.max(0, grossAreaSquareMeters - openingAreaSquareMeters)),
      assemblyId: segment.assemblyId,
      uValueWm2K: segment.assemblyId ? assemblyMap.get(segment.assemblyId)?.uValueWm2K ?? null : null,
    }];
  });

  const orientationMap = new Map<string, SurveyOrientationEnergySummary>();
  for (const row of wallRows) {
    const key = row.orientation;
    const existing = orientationMap.get(key) || { orientation: row.orientation, azimuth: row.azimuth, grossWallAreaSquareMeters: 0, openingAreaSquareMeters: 0, netWallAreaSquareMeters: 0, openingCount: 0 };
    existing.grossWallAreaSquareMeters += row.grossAreaSquareMeters;
    existing.openingAreaSquareMeters += row.openingAreaSquareMeters;
    existing.netWallAreaSquareMeters += row.netAreaSquareMeters;
    existing.openingCount += input.wallOpenings.filter((opening) => opening.wallSegmentId === row.wallSegmentId).length;
    orientationMap.set(key, existing);
  }
  const orientationRows = [...orientationMap.values()].map((row) => ({ ...row, grossWallAreaSquareMeters: round(row.grossWallAreaSquareMeters), openingAreaSquareMeters: round(row.openingAreaSquareMeters), netWallAreaSquareMeters: round(row.netWallAreaSquareMeters) })).sort((left, right) => left.azimuth - right.azimuth);

  const levelRows = input.levels.map((level) => {
    const rooms = input.rooms.filter((room) => (room.levelId || input.levels[0]?.id) === level.id);
    const walls = wallRows.filter((row) => row.levelId === level.id);
    const floorAreaSquareMeters = rooms.reduce((sum, room) => sum + Math.max(0, Number(room.area) || 0), 0);
    const heatedFloorAreaSquareMeters = rooms.filter((room) => room.heated).reduce((sum, room) => sum + Math.max(0, Number(room.area) || 0), 0);
    return {
      levelId: level.id,
      levelName: level.name,
      heatedFloorAreaSquareMeters: round(heatedFloorAreaSquareMeters),
      floorAreaSquareMeters: round(floorAreaSquareMeters),
      ceilingAreaSquareMeters: round(floorAreaSquareMeters),
      grossWallAreaSquareMeters: round(walls.reduce((sum, row) => sum + row.grossAreaSquareMeters, 0)),
      openingAreaSquareMeters: round(walls.reduce((sum, row) => sum + row.openingAreaSquareMeters, 0)),
      netWallAreaSquareMeters: round(walls.reduce((sum, row) => sum + row.netAreaSquareMeters, 0)),
    };
  });

  return {
    wallRows,
    orientationRows,
    levelRows,
    assemblyRows,
    totals: {
      grossWallAreaSquareMeters: round(wallRows.reduce((sum, row) => sum + row.grossAreaSquareMeters, 0)),
      openingAreaSquareMeters: round(wallRows.reduce((sum, row) => sum + row.openingAreaSquareMeters, 0)),
      netWallAreaSquareMeters: round(wallRows.reduce((sum, row) => sum + row.netAreaSquareMeters, 0)),
      floorAreaSquareMeters: round(levelRows.reduce((sum, row) => sum + row.floorAreaSquareMeters, 0)),
      heatedFloorAreaSquareMeters: round(levelRows.reduce((sum, row) => sum + row.heatedFloorAreaSquareMeters, 0)),
      ceilingAreaSquareMeters: round(levelRows.reduce((sum, row) => sum + row.ceilingAreaSquareMeters, 0)),
    },
  };
}

export function createWinWattCompatiblePackage(input: {
  project: PropertySurveyProject | null;
  draft: PropertySurveyDraft;
  summary: SurveyEnergySummary;
  zones: EnergyZoneSetResult;
  openings: EnergyOpeningSetResult;
  demand: EnergyDemandSetResult;
  renewables: EnergyRenewableSizingResult;
  renovationComparison: EnergyRenovationComparisonSetResult;
  fieldMap: WinWattFieldMapResult;
  trialFeedback: WinWattTrialFeedbackResult;
}) {
  return {
    schema: "dimpro.winwatt-compatible.v0.8.4",
    disclaimer: "DIMPRO előkészítő adatcsomag. A WinWattban történő import és szakmai ellenőrzés a felhasználó feladata; nem natív WinWatt projektfájl.",
    exportedAt: new Date().toISOString(),
    project: input.project,
    building: {
      surveyName: input.draft.surveyName,
      surveyMode: input.draft.surveyMode,
      address: input.draft.property.address,
      parcelNumber: input.draft.property.parcelNumber,
      propertyType: input.draft.property.propertyType,
      constructionYear: input.draft.property.constructionYear,
      northAngle: input.draft.northAngle,
      orientationSource: input.draft.orientationSource,
    },
    levels: input.summary.levelRows,
    zones: input.zones.zones,
    unheatedSpaces: input.zones.unheatedSpaces,
    zoneConnections: input.zones.connections,
    zoneTotals: input.zones.totals,
    envelopeWalls: input.summary.wallRows,
    orientationSummary: input.summary.orientationRows,
    assemblies: input.summary.assemblyRows,
    openings: input.openings.openings.map((result) => {
      const opening = input.draft.wallOpenings.find((item) => item.id === result.openingId);
      const detail = input.draft.energyOpeningWorkspace.openingDetails[result.openingId];
      return {
        id: result.openingId,
        levelId: opening?.levelId || null,
        roomId: opening?.roomId || null,
        wallSegmentId: opening?.wallSegmentId || null,
        kind: result.kind,
        name: result.openingName,
        widthMeters: result.widthMeters,
        heightMeters: result.heightMeters,
        areaSquareMeters: result.areaSquareMeters,
        sillHeightMeters: opening?.sillHeightMeters ?? null,
        frame: opening?.frame || "",
        glazing: opening?.glazing || "",
        shading: opening?.shading || "",
        calculationMode: result.calculationMode,
        requirementType: result.requirementType,
        effectiveUwWm2K: result.effectiveUwWm2K,
        requirementMaximumUwWm2K: result.requirementMaximumUwWm2K,
        compliance: result.compliance,
        openingHeatLossCoefficientWK: result.openingHeatLossCoefficientWK,
        installationHeatLossCoefficientWK: result.installationHeatLossCoefficientWK,
        totalHeatLossCoefficientWK: result.totalHeatLossCoefficientWK,
        glazingAreaSquareMeters: result.glazingAreaSquareMeters,
        frameAreaSquareMeters: result.frameAreaSquareMeters,
        glazingEdgeLengthMeters: result.glazingEdgeLengthMeters,
        solarGValue: detail?.solarGValue ?? null,
        sourceReference: detail?.calculationMode === "declared" ? detail.declaredSourceReference || null : detail?.glazingEdgeSourceReference || null,
        blocked: result.blocked,
      };
    }),
    thermalBridges: input.openings.thermalBridges,
    openingThermalTotals: input.openings.totals,
    demandWorkspace: {
      enabled: input.demand.enabled,
      externalDesignTemperatureC: input.draft.energyDemandWorkspace.externalDesignTemperatureC ?? null,
      externalTemperatureSourceReference: input.draft.energyDemandWorkspace.externalTemperatureSourceReference,
      airHeatCapacityWhM3K: input.draft.energyDemandWorkspace.airHeatCapacityWhM3K,
      airHeatCapacitySourceReference: input.draft.energyDemandWorkspace.airHeatCapacitySourceReference,
      limitation: input.demand.limitation,
    },
    zoneDesignLoads: input.demand.zones,
    demandComponents: input.demand.components,
    energySystems: input.demand.systems,
    demandTotals: input.demand.totals,
    demandValidationMessages: input.demand.validationMessages,
    demandTrace: input.demand.trace,
    demandSourceReferenceIds: input.demand.sourceReferenceIds,
    fieldWorkflow: input.draft.energyFieldWorkflow,
    renovationScenarios: input.draft.energyRenovationWorkspace.scenarios,
    renovationComparison: input.renovationComparison,
    renewableWorkspace: input.draft.energyRenewableWorkspace,
    renewableSizing: input.renewables,
    winWattFieldMap: input.fieldMap,
    winWattTrialWorkspace: input.draft.energyWinWattTrialWorkspace,
    winWattTrialFeedback: input.trialFeedback,
    transferWorkbookSchema: "dimpro.winwatt-transfer.v0.8.4",
    trialPackageSchema: "dimpro.winwatt-trial-package.v0.8.4",
    totals: input.summary.totals,
  };
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function createWinWattCompatibleCsv(summary: SurveyEnergySummary) {
  const header = ["Szint", "Helyiség", "Tájolás", "Azimut", "Határolás", "Falhossz_m", "Magasság_m", "Bruttó_falfelület_m2", "Nyílászáró_m2", "Nettó_falfelület_m2", "U_Wm2K"];
  const rows = summary.wallRows.map((row) => [row.levelName, row.roomName, row.orientation, row.azimuth, row.boundaryType, row.lengthMeters, row.heightMeters, row.grossAreaSquareMeters, row.openingAreaSquareMeters, row.netAreaSquareMeters, row.uValueWm2K ?? ""]);
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
}
