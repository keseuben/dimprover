import type { EnergyRenovationMeasureCategory, EnergyRenovationScenarioStatus } from "@/components/energy/domain/energyRenovationTypes";

export type EnergyRenovationComparisonCalculationStatus =
  | "baseline"
  | "calculated"
  | "partial"
  | "unavailable"
  | "blocked";

export type EnergyRenovationComparisonValidationSeverity = "info" | "warning" | "error";

export type EnergyRenovationComparisonValidationMessage = {
  code:
    | "BASE_DEMAND_NOT_AVAILABLE"
    | "SCENARIO_WITHOUT_INCLUDED_MEASURES"
    | "MEASURE_TARGET_MISSING"
    | "MEASURE_TARGET_INVALID"
    | "MEASURE_ENTITY_MISSING"
    | "MEASURE_ENTITY_NOT_IN_DEMAND"
    | "MEASURE_DUPLICATE_TARGET"
    | "MEASURE_PARTIAL_CONNECTION_EFFECT"
    | "MEASURE_METHOD_NOT_AVAILABLE"
    | "RENEWABLE_REFERENCE_NOT_AVAILABLE"
    | "HEATING_CAPACITY_INSUFFICIENT"
    | "HEATING_CAPACITY_SUFFICIENT";
  severity: EnergyRenovationComparisonValidationSeverity;
  blocking: boolean;
  scenarioId: string;
  measureId?: string;
  message: string;
};

export type EnergyRenovationMeasureComparisonResult = {
  measureId: string;
  category: EnergyRenovationMeasureCategory;
  title: string;
  targetEntityId?: string;
  status: Exclude<EnergyRenovationComparisonCalculationStatus, "baseline">;
  currentValue: number | null;
  targetValue: number | null;
  unit: string;
  currentHeatLossCoefficientWK: number | null;
  projectedHeatLossCoefficientWK: number | null;
  savedHeatLossCoefficientWK: number | null;
  savedDesignHeatingPowerKw: number | null;
  projectedAnnualEnergyKwh: number | null;
  projectedCapacityValue: number | null;
  projectedCapacityUnit: string;
  sourceReference: string;
  message: string;
};

export type EnergyRenovationScenarioComparisonResult = {
  scenarioId: string;
  scenarioCode: string;
  scenarioName: string;
  scenarioStatus: EnergyRenovationScenarioStatus;
  kind: "existing" | "proposal";
  calculationStatus: EnergyRenovationComparisonCalculationStatus;
  includedMeasureCount: number;
  calculatedMeasureCount: number;
  partialMeasureCount: number;
  unavailableMeasureCount: number;
  baseline: {
    transmissionHeatLossCoefficientWK: number | null;
    ventilationHeatLossCoefficientWK: number | null;
    totalHeatLossCoefficientWK: number | null;
    designHeatingPowerKw: number | null;
    designHeatingPowerPerAreaWm2: number | null;
    allocatedHeatingCapacityKw: number | null;
  };
  projected: {
    transmissionHeatLossCoefficientWK: number | null;
    ventilationHeatLossCoefficientWK: number | null;
    totalHeatLossCoefficientWK: number | null;
    designHeatingPowerKw: number | null;
    designHeatingPowerPerAreaWm2: number | null;
    plannedHeatingCapacityKw: number | null;
    heatingCapacityCoverageRatio: number | null;
    heatingCapacityStatus: "unknown" | "insufficient" | "sufficient";
  };
  change: {
    transmissionHeatLossCoefficientWK: number | null;
    transmissionReductionPercent: number | null;
    totalHeatLossCoefficientWK: number | null;
    totalHeatLossReductionPercent: number | null;
    designHeatingPowerKw: number | null;
    designHeatingPowerReductionPercent: number | null;
  };
  renewables: {
    pvCapacityKwp: number | null;
    pvAnnualYieldKwh: number | null;
    solarThermalAreaSquareMeters: number | null;
    solarThermalAnnualYieldKwh: number | null;
    batteryCapacityKwh: number | null;
    evChargerPowerKw: number | null;
    evAnnualHomeChargingEnergyKwh: number | null;
  };
  measures: EnergyRenovationMeasureComparisonResult[];
  validationMessages: EnergyRenovationComparisonValidationMessage[];
};

export type EnergyRenovationComparisonSetResult = {
  schema: "dimpro.energy-renovation-comparison.v0.8.2";
  engineVersion: "0.8.2";
  calculatedAt: string;
  baseScenarioId: "scenario-existing";
  baselineDemandAvailable: boolean;
  scenarios: EnergyRenovationScenarioComparisonResult[];
  totals: {
    scenarioCount: number;
    proposalCount: number;
    calculatedScenarioCount: number;
    partialScenarioCount: number;
    unavailableScenarioCount: number;
    blockedScenarioCount: number;
  };
  limitation: "Preliminary scenario comparison based on validated current DIMPRO geometry, U-values and design heating load. It is not monthly or annual certification energy demand and does not replace WinWatt finalization.";
};

export const energyRenovationComparisonStatusLabels: Record<EnergyRenovationComparisonCalculationStatus, string> = {
  baseline: "Meglévő alapállapot",
  calculated: "Számítható",
  partial: "Részben számítható",
  unavailable: "Még nem számítható",
  blocked: "Javítandó adat",
};
