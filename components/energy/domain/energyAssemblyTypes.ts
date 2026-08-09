export type EnergyHeatFlowDirection = "upward" | "horizontal" | "downward";
export type EnergyAssemblyBoundaryMode = "externalAir" | "internalUnheated" | "groundEquivalentRequired";
export type EnergyAssemblyCalculationMode = "calculated" | "declared";
export type EnergyAssemblyComplexity = "homogeneous" | "variableThicknessAverage" | "inhomogeneous";
export type EnergyAssemblyCorrectionPolicy = "applyAll" | "omitBelowThreePercent";

export type EnergyAssemblyRequirementType =
  | "externalWall"
  | "flatRoof"
  | "heatedAtticBoundary"
  | "atticFloor"
  | "arcadeFloor"
  | "lowerFloorUnheated"
  | "wallToUnheated"
  | "adjacentHeatedWall"
  | "plinthWall"
  | "groundWall"
  | "groundFloor"
  | "custom";

export type EnergyLayerKind = "solid" | "closedAirGap" | "ventilatedAirGap" | "fixedResistance";
export type EnergyAirGapVentilation = "closed" | "slightlyVentilated" | "wellVentilated";

export type EnergyAssemblyAirVoidCorrection = {
  level: "none" | "level1" | "level2";
  insulationLayerId?: string;
};

export type EnergyAssemblyMechanicalFastenerCorrection = {
  enabled: boolean;
  insulationLayerId?: string;
  fastenerLambdaWmK: number;
  fastenerCountPerSquareMeter: number;
  fastenerCrossSectionSquareMeters: number;
  insulationThicknessMeters: number;
  penetrationLengthMeters: number;
  embedded: boolean;
  passesAirLayer: boolean;
  pointFastener: boolean;
};

export type EnergyAssemblyCorrectionSettings = {
  policy: EnergyAssemblyCorrectionPolicy;
  airVoid: EnergyAssemblyAirVoidCorrection;
  mechanicalFastener: EnergyAssemblyMechanicalFastenerCorrection;
  invertedRoofDeltaUWm2K: number;
  invertedRoofSource: string;
};

export type EnergyAssemblyRuleRequirement = {
  type: EnergyAssemblyRequirementType;
  label: string;
  maximumUValueWm2K: number | null;
  equivalentGroundValue: boolean;
  sourceReferenceId: string;
  note?: string;
};

export type EnergySurfaceResistanceRule = {
  direction: EnergyHeatFlowDirection;
  rsiM2KPerW: number;
  rseM2KPerW: number;
};

export type EnergyAirGapResistanceRow = {
  thicknessMm: number;
  upwardM2KPerW: number;
  horizontalM2KPerW: number;
  downwardM2KPerW: number;
};

export type EnergyAssemblyRuleData = {
  sourceReferenceId: string;
  checkedAt: string;
  surfaceResistance: Record<EnergyHeatFlowDirection, EnergySurfaceResistanceRule>;
  closedAirGapResistanceRows: EnergyAirGapResistanceRow[];
  requirements: Record<EnergyAssemblyRequirementType, EnergyAssemblyRuleRequirement>;
};

export type EnergyAssemblyValidationMessage = {
  code:
    | "ASSEMBLY_NAME_REQUIRED"
    | "NO_LAYERS"
    | "LAYER_NAME_REQUIRED"
    | "LAYER_THICKNESS_INVALID"
    | "LAYER_LAMBDA_MISSING"
    | "LAYER_LAMBDA_INVALID"
    | "LAYER_OVERRIDE_REASON_REQUIRED"
    | "LAYER_RESISTANCE_INVALID"
    | "AIR_GAP_TOO_THICK"
    | "VENTILATED_AIR_GAP_UNSUPPORTED"
    | "INHOMOGENEOUS_REQUIRES_DETAILED_METHOD"
    | "VARIABLE_THICKNESS_AVERAGE_WARNING"
    | "DECLARED_U_VALUE_INVALID"
    | "DECLARED_U_SOURCE_REQUIRED"
    | "CUSTOM_SURFACE_RESISTANCE_INVALID"
    | "AIR_VOID_LAYER_REQUIRED"
    | "MECHANICAL_FASTENER_INPUT_INVALID"
    | "MECHANICAL_FASTENER_DETAILED_METHOD_REQUIRED"
    | "INVERTED_ROOF_SOURCE_REQUIRED"
    | "GROUND_EQUIVALENT_CALCULATION_REQUIRED"
    | "UNVERIFIED_MATERIAL"
    | "REQUIREMENT_NOT_APPLICABLE";
  severity: "info" | "warning" | "error";
  blocking: boolean;
  assemblyId: string;
  assemblyName: string;
  layerId?: string;
  layerName?: string;
  field?: string;
  message: string;
};

export type EnergyAssemblyLayerResult = {
  layerId: string;
  layerName: string;
  kind: EnergyLayerKind;
  thicknessMeters: number | null;
  lambdaWmK: number | null;
  resistanceM2KPerW: number | null;
  resistanceSource: "d/lambda" | "airGapTable" | "fixed" | "missing";
  materialVersionId?: string;
  materialVerificationStatus?: string;
  valid: boolean;
};

export type EnergyAssemblyCorrectionResult = {
  airVoidDeltaUWm2K: number;
  mechanicalFastenerDeltaUWm2K: number;
  invertedRoofDeltaUWm2K: number;
  totalDeltaUWm2K: number;
  correctionRatioPercent: number;
  negligibleBelowThreePercent: boolean;
  appliedDeltaUWm2K: number;
};

export type EnergyAssemblyThermalResult = {
  schema: "dimpro.energy-assembly.v0.7.2";
  engineVersion: "0.7.2";
  assemblyId: string;
  assemblyName: string;
  category: string;
  calculationMode: EnergyAssemblyCalculationMode;
  heatFlowDirection: EnergyHeatFlowDirection;
  boundaryMode: EnergyAssemblyBoundaryMode;
  requirementType: EnergyAssemblyRequirementType;
  valid: boolean;
  blocked: boolean;
  layerResults: EnergyAssemblyLayerResult[];
  layerResistanceM2KPerW: number | null;
  rsiM2KPerW: number | null;
  rseM2KPerW: number | null;
  totalResistanceM2KPerW: number | null;
  baseUValueWm2K: number | null;
  correction: EnergyAssemblyCorrectionResult;
  calculatedUValueWm2K: number | null;
  declaredUValueWm2K: number | null;
  effectiveUValueWm2K: number | null;
  calculatedDeclaredDifferenceWm2K: number | null;
  calculatedDeclaredDifferencePercent: number | null;
  requirementMaximumUValueWm2K: number | null;
  requirementApplicable: boolean;
  compliance: "compliant" | "notCompliant" | "notApplicable" | "notCalculated" | "groundCalculationRequired";
  complianceDifferenceWm2K: number | null;
  validationMessages: EnergyAssemblyValidationMessage[];
  trace: Array<{
    id: string;
    ruleId: string;
    label: string;
    formula: string;
    inputs: Record<string, number | string | boolean | null>;
    unroundedValue: number;
    value: number;
    unit: "m2K/W" | "W/m2K" | "%" | "m";
    layerId?: string;
  }>;
};

export type EnergyInsulationThicknessResult = {
  valid: boolean;
  targetUValueWm2K: number;
  currentUValueWm2K: number | null;
  requiredAdditionalResistanceM2KPerW: number | null;
  requiredTotalInsulationThicknessMeters: number | null;
  requiredAdditionalThicknessMeters: number | null;
  roundedRecommendedAdditionalThicknessMeters: number | null;
  message: string;
};

export type EnergyAssemblySetResult = {
  schema: "dimpro.energy-assembly-set.v0.7.2";
  engineVersion: "0.7.2";
  calculatedAt: string;
  ruleSourceReferenceId: string;
  ruleCheckedAt: string;
  results: EnergyAssemblyThermalResult[];
  totals: {
    assemblyCount: number;
    validCount: number;
    blockedCount: number;
    compliantCount: number;
    notCompliantCount: number;
    groundCalculationRequiredCount: number;
    warningCount: number;
    errorCount: number;
  };
};
