import type { EnergyDataStatus } from "@/components/energy/domain/energyFieldWorkflowTypes";

export type EnergyRenewableValidationSeverity = "info" | "warning" | "blocking";
export type EnergyRoofSurfaceStatus = "candidate" | "selected" | "excluded";
export type EnergyPvConnectionMode = "gridConnected" | "hybrid" | "offGrid";
export type EnergyBatteryPurpose = "selfConsumption" | "backup" | "combined";
export type EnergyEvPhaseMode = "singlePhase" | "threePhase";

export type EnergyRoofSurface = {
  id: string;
  name: string;
  levelId?: string;
  sectionLineId?: string;
  status: EnergyRoofSurfaceStatus;
  azimuthDegrees: number;
  tiltDegrees: number;
  grossAreaSquareMeters: number;
  usableAreaSquareMeters: number;
  shadingFactor: number;
  roofCovering: string;
  structuralAssessment: string;
  dataStatus: EnergyDataStatus;
  sourceReference: string;
  note: string;
};

export type EnergyElectricityProfile = {
  annualConsumptionKwh: number;
  daytimeConsumptionSharePercent: number;
  simultaneousBaseLoadKw: number;
  phaseMode: EnergyEvPhaseMode;
  connectionAmpsPerPhase: number;
  connectionVoltageV: number;
  sourceReference: string;
  dataStatus: EnergyDataStatus;
};

export type EnergyPvPlan = {
  enabled: boolean;
  name: string;
  roofSurfaceIds: string[];
  modulePowerWp: number;
  moduleAreaSquareMeters: number;
  panelCount: number;
  inverterAcPowerKw: number;
  specificYieldKwhPerKwpYear: number;
  systemLossPercent: number;
  connectionMode: EnergyPvConnectionMode;
  sourceReference: string;
  dataStatus: EnergyDataStatus;
  note: string;
};

export type EnergySolarThermalPlan = {
  enabled: boolean;
  name: string;
  roofSurfaceId?: string;
  collectorType: "flatPlate" | "vacuumTube";
  collectorAreaSquareMeters: number;
  persons: number;
  dailyHotWaterLitersPerPerson: number;
  coldWaterTemperatureC: number;
  hotWaterTemperatureC: number;
  specificYieldKwhPerSquareMeterYear: number;
  systemLossPercent: number;
  storageLitersPerSquareMeter: number;
  sourceReference: string;
  dataStatus: EnergyDataStatus;
  note: string;
};

export type EnergyBatteryPlan = {
  enabled: boolean;
  name: string;
  purpose: EnergyBatteryPurpose;
  nominalCapacityKwh: number;
  usableCapacityKwh: number;
  usableFraction: number;
  roundTripEfficiency: number;
  maxChargePowerKw: number;
  maxDischargePowerKw: number;
  reservePercent: number;
  criticalLoadKw: number;
  backupHours: number;
  sourceReference: string;
  dataStatus: EnergyDataStatus;
  note: string;
};

export type EnergyEvChargingPlan = {
  enabled: boolean;
  name: string;
  annualDistanceKm: number;
  vehicleConsumptionKwhPer100Km: number;
  homeChargingSharePercent: number;
  chargerPowerKw: number;
  phaseMode: EnergyEvPhaseMode;
  dynamicLoadBalancing: boolean;
  smartPvCharging: boolean;
  vehicles: number;
  sourceReference: string;
  dataStatus: EnergyDataStatus;
  note: string;
};

export type EnergyRenewableWorkspace = {
  schemaVersion: 1;
  enabled: boolean;
  roofSurfaces: EnergyRoofSurface[];
  electricityProfile: EnergyElectricityProfile;
  pv: EnergyPvPlan;
  solarThermal: EnergySolarThermalPlan;
  battery: EnergyBatteryPlan;
  evCharging: EnergyEvChargingPlan;
  updatedAt: string;
};

export type EnergyRenewableValidationMessage = {
  code: string;
  severity: EnergyRenewableValidationSeverity;
  message: string;
  entityId?: string;
};

export type EnergyRenewableSizingResult = {
  schema: "dimpro.energy-renewable-sizing.v0.8.0";
  enabled: boolean;
  roof: {
    selectedSurfaceCount: number;
    grossAreaSquareMeters: number;
    usableAreaSquareMeters: number;
  };
  pv: {
    maxPanelCount: number;
    selectedPanelCount: number;
    installedPowerKwp: number;
    inverterDcAcRatio: number | null;
    estimatedAnnualYieldKwh: number | null;
    estimatedDirectSelfConsumptionKwh: number | null;
    estimatedSurplusKwh: number | null;
    estimatedSelfConsumptionRatePercent: number | null;
  };
  solarThermal: {
    annualHotWaterDemandKwh: number | null;
    estimatedAnnualYieldKwh: number | null;
    estimatedCoveragePercent: number | null;
    suggestedStorageVolumeLiters: number | null;
  };
  battery: {
    estimatedEveningDemandKwhPerDay: number | null;
    estimatedPvSurplusKwhPerDay: number | null;
    backupUsableCapacityKwh: number | null;
    suggestedUsableCapacityKwh: number | null;
    suggestedNominalCapacityKwh: number | null;
    selectedNominalCapacityKwh: number;
    selectedUsableCapacityKwh: number;
  };
  evCharging: {
    annualHomeChargingEnergyKwh: number | null;
    averageDailyChargingEnergyKwh: number | null;
    averageDailyChargingHours: number | null;
    chargerCurrentAmps: number | null;
    availableCurrentHeadroomAmps: number | null;
    connectionSufficient: boolean | null;
  };
  totals: {
    annualBuildingAndEvElectricityKwh: number;
    estimatedPvCoveragePercent: number | null;
  };
  validationMessages: EnergyRenewableValidationMessage[];
  limitation: string;
};

function numberOr(value: unknown, fallback = 0) {
  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function createDefaultEnergyRenewableWorkspace(): EnergyRenewableWorkspace {
  return {
    schemaVersion: 1,
    enabled: false,
    roofSurfaces: [],
    electricityProfile: {
      annualConsumptionKwh: 0,
      daytimeConsumptionSharePercent: 35,
      simultaneousBaseLoadKw: 2,
      phaseMode: "threePhase",
      connectionAmpsPerPhase: 16,
      connectionVoltageV: 400,
      sourceReference: "",
      dataStatus: "estimated",
    },
    pv: {
      enabled: false,
      name: "Napelemrendszer",
      roofSurfaceIds: [],
      modulePowerWp: 450,
      moduleAreaSquareMeters: 2,
      panelCount: 0,
      inverterAcPowerKw: 0,
      specificYieldKwhPerKwpYear: 0,
      systemLossPercent: 14,
      connectionMode: "gridConnected",
      sourceReference: "",
      dataStatus: "estimated",
      note: "",
    },
    solarThermal: {
      enabled: false,
      name: "Napkollektoros HMV-rásegítés",
      collectorType: "flatPlate",
      collectorAreaSquareMeters: 0,
      persons: 2,
      dailyHotWaterLitersPerPerson: 50,
      coldWaterTemperatureC: 10,
      hotWaterTemperatureC: 45,
      specificYieldKwhPerSquareMeterYear: 0,
      systemLossPercent: 20,
      storageLitersPerSquareMeter: 60,
      sourceReference: "",
      dataStatus: "estimated",
      note: "",
    },
    battery: {
      enabled: false,
      name: "Akkumulátoros energiatároló",
      purpose: "combined",
      nominalCapacityKwh: 0,
      usableCapacityKwh: 0,
      usableFraction: 0.9,
      roundTripEfficiency: 0.9,
      maxChargePowerKw: 0,
      maxDischargePowerKw: 0,
      reservePercent: 10,
      criticalLoadKw: 1,
      backupHours: 4,
      sourceReference: "",
      dataStatus: "estimated",
      note: "",
    },
    evCharging: {
      enabled: false,
      name: "Elektromosautó-töltő",
      annualDistanceKm: 15000,
      vehicleConsumptionKwhPer100Km: 18,
      homeChargingSharePercent: 80,
      chargerPowerKw: 11,
      phaseMode: "threePhase",
      dynamicLoadBalancing: true,
      smartPvCharging: true,
      vehicles: 1,
      sourceReference: "",
      dataStatus: "estimated",
      note: "",
    },
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeEnergyRenewableWorkspace(input?: Partial<EnergyRenewableWorkspace> | null): EnergyRenewableWorkspace {
  const base = createDefaultEnergyRenewableWorkspace();
  const profile = { ...base.electricityProfile, ...(input?.electricityProfile || {}) };
  const pv = { ...base.pv, ...(input?.pv || {}) };
  const solarThermal = { ...base.solarThermal, ...(input?.solarThermal || {}) };
  const battery = { ...base.battery, ...(input?.battery || {}) };
  const evCharging = { ...base.evCharging, ...(input?.evCharging || {}) };
  return {
    schemaVersion: 1,
    enabled: Boolean(input?.enabled),
    roofSurfaces: Array.isArray(input?.roofSurfaces) ? input.roofSurfaces.map((surface, index) => ({
      id: surface.id || `roof-surface-${index + 1}`,
      name: surface.name || `Tetősík ${index + 1}`,
      levelId: surface.levelId,
      sectionLineId: surface.sectionLineId,
      status: surface.status === "selected" || surface.status === "excluded" ? surface.status : "candidate",
      azimuthDegrees: ((numberOr(surface.azimuthDegrees) % 360) + 360) % 360,
      tiltDegrees: clamp(numberOr(surface.tiltDegrees), 0, 90),
      grossAreaSquareMeters: Math.max(0, numberOr(surface.grossAreaSquareMeters)),
      usableAreaSquareMeters: Math.max(0, numberOr(surface.usableAreaSquareMeters)),
      shadingFactor: clamp(numberOr(surface.shadingFactor, 1), 0, 1),
      roofCovering: surface.roofCovering || "",
      structuralAssessment: surface.structuralAssessment || "",
      dataStatus: surface.dataStatus || "estimated",
      sourceReference: surface.sourceReference || "",
      note: surface.note || "",
    })) : [],
    electricityProfile: {
      ...profile,
      annualConsumptionKwh: Math.max(0, numberOr(profile.annualConsumptionKwh)),
      daytimeConsumptionSharePercent: clamp(numberOr(profile.daytimeConsumptionSharePercent, 35), 0, 100),
      simultaneousBaseLoadKw: Math.max(0, numberOr(profile.simultaneousBaseLoadKw)),
      phaseMode: profile.phaseMode === "singlePhase" ? "singlePhase" : "threePhase",
      connectionAmpsPerPhase: Math.max(0, numberOr(profile.connectionAmpsPerPhase)),
      connectionVoltageV: Math.max(1, numberOr(profile.connectionVoltageV, profile.phaseMode === "singlePhase" ? 230 : 400)),
      sourceReference: profile.sourceReference || "",
      dataStatus: profile.dataStatus || "estimated",
    },
    pv: {
      ...pv,
      roofSurfaceIds: Array.isArray(pv.roofSurfaceIds) ? pv.roofSurfaceIds.filter((id): id is string => typeof id === "string") : [],
      modulePowerWp: Math.max(0, numberOr(pv.modulePowerWp)),
      moduleAreaSquareMeters: Math.max(0, numberOr(pv.moduleAreaSquareMeters)),
      panelCount: Math.max(0, Math.floor(numberOr(pv.panelCount))),
      inverterAcPowerKw: Math.max(0, numberOr(pv.inverterAcPowerKw)),
      specificYieldKwhPerKwpYear: Math.max(0, numberOr(pv.specificYieldKwhPerKwpYear)),
      systemLossPercent: clamp(numberOr(pv.systemLossPercent), 0, 100),
      connectionMode: pv.connectionMode === "hybrid" || pv.connectionMode === "offGrid" ? pv.connectionMode : "gridConnected",
      sourceReference: pv.sourceReference || "",
      dataStatus: pv.dataStatus || "estimated",
      note: pv.note || "",
    },
    solarThermal: {
      ...solarThermal,
      collectorType: solarThermal.collectorType === "vacuumTube" ? "vacuumTube" : "flatPlate",
      collectorAreaSquareMeters: Math.max(0, numberOr(solarThermal.collectorAreaSquareMeters)),
      persons: Math.max(0, Math.floor(numberOr(solarThermal.persons))),
      dailyHotWaterLitersPerPerson: Math.max(0, numberOr(solarThermal.dailyHotWaterLitersPerPerson)),
      coldWaterTemperatureC: numberOr(solarThermal.coldWaterTemperatureC),
      hotWaterTemperatureC: numberOr(solarThermal.hotWaterTemperatureC),
      specificYieldKwhPerSquareMeterYear: Math.max(0, numberOr(solarThermal.specificYieldKwhPerSquareMeterYear)),
      systemLossPercent: clamp(numberOr(solarThermal.systemLossPercent), 0, 100),
      storageLitersPerSquareMeter: Math.max(0, numberOr(solarThermal.storageLitersPerSquareMeter)),
      sourceReference: solarThermal.sourceReference || "",
      dataStatus: solarThermal.dataStatus || "estimated",
      note: solarThermal.note || "",
    },
    battery: {
      ...battery,
      purpose: battery.purpose === "selfConsumption" || battery.purpose === "backup" ? battery.purpose : "combined",
      nominalCapacityKwh: Math.max(0, numberOr(battery.nominalCapacityKwh)),
      usableCapacityKwh: Math.max(0, numberOr(battery.usableCapacityKwh)),
      usableFraction: clamp(numberOr(battery.usableFraction, 0.9), 0.01, 1),
      roundTripEfficiency: clamp(numberOr(battery.roundTripEfficiency, 0.9), 0.01, 1),
      maxChargePowerKw: Math.max(0, numberOr(battery.maxChargePowerKw)),
      maxDischargePowerKw: Math.max(0, numberOr(battery.maxDischargePowerKw)),
      reservePercent: clamp(numberOr(battery.reservePercent, 10), 0, 100),
      criticalLoadKw: Math.max(0, numberOr(battery.criticalLoadKw)),
      backupHours: Math.max(0, numberOr(battery.backupHours)),
      sourceReference: battery.sourceReference || "",
      dataStatus: battery.dataStatus || "estimated",
      note: battery.note || "",
    },
    evCharging: {
      ...evCharging,
      annualDistanceKm: Math.max(0, numberOr(evCharging.annualDistanceKm)),
      vehicleConsumptionKwhPer100Km: Math.max(0, numberOr(evCharging.vehicleConsumptionKwhPer100Km)),
      homeChargingSharePercent: clamp(numberOr(evCharging.homeChargingSharePercent, 80), 0, 100),
      chargerPowerKw: Math.max(0, numberOr(evCharging.chargerPowerKw)),
      phaseMode: evCharging.phaseMode === "singlePhase" ? "singlePhase" : "threePhase",
      vehicles: Math.max(1, Math.floor(numberOr(evCharging.vehicles, 1))),
      sourceReference: evCharging.sourceReference || "",
      dataStatus: evCharging.dataStatus || "estimated",
      note: evCharging.note || "",
    },
    updatedAt: typeof input?.updatedAt === "string" && input.updatedAt ? input.updatedAt : new Date().toISOString(),
  };
}

export function createEnergyRoofSurface(input: Partial<EnergyRoofSurface> = {}, index = 0): EnergyRoofSurface {
  return normalizeEnergyRenewableWorkspace({ roofSurfaces: [{
    id: input.id || `roof-surface-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: input.name || `Tetősík ${index + 1}`,
    status: input.status || "candidate",
    azimuthDegrees: input.azimuthDegrees ?? 180,
    tiltDegrees: input.tiltDegrees ?? 35,
    grossAreaSquareMeters: input.grossAreaSquareMeters ?? 0,
    usableAreaSquareMeters: input.usableAreaSquareMeters ?? 0,
    shadingFactor: input.shadingFactor ?? 1,
    roofCovering: input.roofCovering || "",
    structuralAssessment: input.structuralAssessment || "Ellenőrizendő",
    dataStatus: input.dataStatus || "measured",
    sourceReference: input.sourceReference || "Helyszíni tetőfelmérés",
    note: input.note || "",
  }] }).roofSurfaces[0];
}
