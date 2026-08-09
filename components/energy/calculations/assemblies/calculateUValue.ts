import type { EnergyRequirementLevel } from "@/components/energy/domain/energyProjectTypes";
import type { EnergyAssemblyRuleData, EnergyAssemblyThermalResult, EnergyAssemblyValidationMessage } from "@/components/energy/domain/energyAssemblyTypes";
import { calculateAssemblyLayerResistance } from "@/components/energy/calculations/assemblies/calculateThermalResistance";
import { calculateAssemblyCorrections } from "@/components/energy/calculations/assemblies/calculateAssemblyCorrections";
import { validateAssemblyDefinition } from "@/components/energy/validation/validateAssemblies";
import type { SurveyConstructionAssembly } from "@/components/property-survey/propertySurveyEnergyModel";

function round(value: number, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function emptyCorrection(): EnergyAssemblyThermalResult["correction"] {
  return { airVoidDeltaUWm2K: 0, mechanicalFastenerDeltaUWm2K: 0, invertedRoofDeltaUWm2K: 0, totalDeltaUWm2K: 0, correctionRatioPercent: 0, negligibleBelowThreePercent: false, appliedDeltaUWm2K: 0 };
}

export function calculateAssemblyThermalPerformance(input: {
  assembly: SurveyConstructionAssembly;
  rules: EnergyAssemblyRuleData;
  requirementLevel: EnergyRequirementLevel;
}): EnergyAssemblyThermalResult {
  const { assembly, rules } = input;
  const declaredMode = assembly.calculationMode === "declared";
  const rawDefinitionMessages = validateAssemblyDefinition(assembly);
  const rawLayerMessages: EnergyAssemblyValidationMessage[] = [];
  const trace: EnergyAssemblyThermalResult["trace"] = [];
  const layerOutputs = assembly.layers.map((layer) => calculateAssemblyLayerResistance({ assembly, layer, airGapRows: rules.closedAirGapResistanceRows }));
  const layerResults = layerOutputs.map((output) => output.result);
  rawLayerMessages.push(...layerOutputs.flatMap((output) => output.messages));
  const declaredBlockingCodes = new Set<EnergyAssemblyValidationMessage["code"]>(["ASSEMBLY_NAME_REQUIRED", "DECLARED_U_VALUE_INVALID", "DECLARED_U_SOURCE_REQUIRED"]);
  const downgradeForDeclared = (message: EnergyAssemblyValidationMessage): EnergyAssemblyValidationMessage => declaredMode && !declaredBlockingCodes.has(message.code)
    ? { ...message, severity: "warning", blocking: false, message: `Deklarált U-mód: ${message.message}` }
    : message;
  const validationMessages: EnergyAssemblyValidationMessage[] = [...rawDefinitionMessages.map(downgradeForDeclared), ...rawLayerMessages.map(downgradeForDeclared)];
  const calculationBlockedBeforeCorrections = [...rawDefinitionMessages, ...rawLayerMessages].some((message) => message.blocking);

  const ruleSurface = rules.surfaceResistance[assembly.heatFlowDirection];
  let rsi = ruleSurface.rsiM2KPerW;
  let rse = assembly.boundaryMode === "internalUnheated" ? ruleSurface.rsiM2KPerW : assembly.boundaryMode === "groundEquivalentRequired" ? 0 : ruleSurface.rseM2KPerW;
  if (assembly.surfaceResistanceMode === "custom") {
    rsi = numberValue(assembly.customRsiM2KPerW) ?? Number.NaN;
    rse = numberValue(assembly.customRseM2KPerW) ?? Number.NaN;
  }

  const layerResistance = layerResults.every((layer) => layer.resistanceM2KPerW !== null)
    ? layerResults.reduce((sum, layer) => sum + (layer.resistanceM2KPerW || 0), 0)
    : null;
  const surfaceValid = Number.isFinite(rsi) && Number.isFinite(rse) && rsi >= 0 && rse >= 0;
  const totalResistance = !calculationBlockedBeforeCorrections && layerResistance !== null && surfaceValid ? rsi + layerResistance + rse : null;
  const baseU = totalResistance && totalResistance > 0 ? 1 / totalResistance : null;

  for (const layer of layerResults) {
    if (layer.resistanceM2KPerW === null) continue;
    trace.push({
      id: `assembly-trace-${assembly.id}-layer-${layer.layerId}`,
      ruleId: layer.resistanceSource === "d/lambda" ? "U-LAYER-R-D-LAMBDA-4.1" : layer.resistanceSource === "airGapTable" ? "U-LAYER-AIR-GAP-4.2" : "U-LAYER-FIXED-R",
      label: `${assembly.name} · ${layer.layerName} ellenállása`,
      formula: layer.resistanceSource === "d/lambda" ? "R = d / λ" : layer.resistanceSource === "airGapTable" ? "4.2. táblázat, lineáris interpoláció" : "dokumentált, megadott R-érték",
      inputs: { thicknessMeters: layer.thicknessMeters, lambdaWmK: layer.lambdaWmK, resistanceSource: layer.resistanceSource },
      unroundedValue: layer.resistanceM2KPerW,
      value: round(layer.resistanceM2KPerW, 6),
      unit: "m2K/W",
      layerId: layer.layerId,
    });
  }
  if (surfaceValid) trace.push({
    id: `assembly-trace-${assembly.id}-surface-resistance`,
    ruleId: assembly.surfaceResistanceMode === "custom" ? "U-SURFACE-CUSTOM" : "U-SURFACE-RSI-RSE-4.1",
    label: `${assembly.name} felületi ellenállásai`,
    formula: assembly.boundaryMode === "internalUnheated" ? "Rsi,1 + Rsi,2" : assembly.boundaryMode === "groundEquivalentRequired" ? "Rsi + rétegek; talajszámítás külön szükséges" : "Rsi + Rse",
    inputs: { rsiM2KPerW: rsi, rseM2KPerW: rse, heatFlowDirection: assembly.heatFlowDirection, boundaryMode: assembly.boundaryMode, source: assembly.surfaceResistanceMode },
    unroundedValue: rsi + rse,
    value: round(rsi + rse, 6),
    unit: "m2K/W",
  });
  if (totalResistance !== null) trace.push({
    id: `assembly-trace-${assembly.id}-rtot`,
    ruleId: "U-RTOT-SUM-4.1",
    label: `${assembly.name} eredő hővezetési ellenállása`,
    formula: "Rtot = Rsi + ΣRi + Rse",
    inputs: { rsiM2KPerW: rsi, layerResistanceM2KPerW: layerResistance, rseM2KPerW: rse },
    unroundedValue: totalResistance,
    value: round(totalResistance, 6),
    unit: "m2K/W",
  });
  if (baseU !== null) trace.push({
    id: `assembly-trace-${assembly.id}-u0`,
    ruleId: "U-BASE-INVERSE-RTOT-4.1",
    label: `${assembly.name} korrigálatlan U₀-értéke`,
    formula: "U₀ = 1 / Rtot",
    inputs: { totalResistanceM2KPerW: totalResistance },
    unroundedValue: baseU,
    value: round(baseU, 6),
    unit: "W/m2K",
  });

  let correction = emptyCorrection();
  let correctionCalculationBlocked = false;
  if (baseU !== null && totalResistance !== null) {
    const correctionOutput = calculateAssemblyCorrections({ assembly, layerResults, totalResistanceM2KPerW: totalResistance, baseUValueWm2K: baseU });
    correction = correctionOutput.result;
    correctionCalculationBlocked = correctionOutput.messages.some((message) => message.blocking);
    validationMessages.push(...correctionOutput.messages.map(downgradeForDeclared));
    trace.push(...correctionOutput.trace);
  }

  const blocked = validationMessages.some((message) => message.blocking);
  const calculatedU = !calculationBlockedBeforeCorrections && !correctionCalculationBlocked && baseU !== null ? baseU + correction.appliedDeltaUWm2K : null;
  const declaredU = numberValue(assembly.declaredUValueWm2K);
  const effectiveU = assembly.calculationMode === "declared" ? (declaredU && declaredU > 0 && !blocked ? declaredU : null) : calculatedU;
  const difference = calculatedU !== null && declaredU !== null && declaredU > 0 ? calculatedU - declaredU : null;
  const differencePercent = difference !== null && declaredU ? difference / declaredU * 100 : null;
  if (calculatedU !== null) trace.push({
    id: `assembly-trace-${assembly.id}-corrected-u`,
    ruleId: "U-CORRECTED-4.10",
    label: `${assembly.name} korrigált U-értéke`,
    formula: "U = U₀ + alkalmazott ΔU",
    inputs: { baseUValueWm2K: baseU, appliedDeltaUWm2K: correction.appliedDeltaUWm2K, correctionPolicy: assembly.corrections.policy },
    unroundedValue: calculatedU,
    value: round(calculatedU, 6),
    unit: "W/m2K",
  });

  const requirement = rules.requirements[assembly.requirementType];
  const customRequirement = assembly.requirementType === "custom" ? numberValue(assembly.customRequirementUValueWm2K) : null;
  const requirementMaximum = customRequirement && customRequirement > 0 ? customRequirement : requirement.maximumUValueWm2K;
  const levelApplicable = input.requirementLevel !== "existingNoRequirement";
  let requirementApplicable = levelApplicable && requirementMaximum !== null;
  let compliance: EnergyAssemblyThermalResult["compliance"] = "notCalculated";
  let complianceDifference: number | null = null;

  if (!levelApplicable) {
    requirementApplicable = false;
    compliance = "notApplicable";
    validationMessages.push({ assemblyId: assembly.id, assemblyName: assembly.name, code: "REQUIREMENT_NOT_APPLICABLE", severity: "info", blocking: false, message: `${assembly.name}: a projekt követelményszintje alapján csak állapotértékelés készül, rendeleti megfelelőség nem.` });
  } else if (requirement.equivalentGroundValue || assembly.boundaryMode === "groundEquivalentRequired") {
    compliance = "groundCalculationRequired";
    validationMessages.push({ assemblyId: assembly.id, assemblyName: assembly.name, code: "GROUND_EQUIVALENT_CALCULATION_REQUIRED", severity: "warning", blocking: false, message: `${assembly.name}: a talajjal érintkező szerkezet követelménye egyenértékű U-értékre vonatkozik; a rétegrendi 1/R eredmény önmagában nem minősíthető megfelelőségnek.` });
  } else if (!requirementApplicable) {
    compliance = "notApplicable";
  } else if (effectiveU === null) {
    compliance = "notCalculated";
  } else {
    complianceDifference = effectiveU - (requirementMaximum || 0);
    compliance = complianceDifference <= 0 ? "compliant" : "notCompliant";
  }

  return {
    schema: "dimpro.energy-assembly.v0.7.2",
    engineVersion: "0.7.2",
    assemblyId: assembly.id,
    assemblyName: assembly.name,
    category: assembly.category,
    calculationMode: assembly.calculationMode,
    heatFlowDirection: assembly.heatFlowDirection,
    boundaryMode: assembly.boundaryMode,
    requirementType: assembly.requirementType,
    valid: !blocked && effectiveU !== null,
    blocked,
    layerResults,
    layerResistanceM2KPerW: layerResistance === null ? null : round(layerResistance, 8),
    rsiM2KPerW: surfaceValid ? round(rsi, 8) : null,
    rseM2KPerW: surfaceValid ? round(rse, 8) : null,
    totalResistanceM2KPerW: totalResistance === null ? null : round(totalResistance, 8),
    baseUValueWm2K: baseU === null ? null : round(baseU, 8),
    correction,
    calculatedUValueWm2K: calculatedU === null ? null : round(calculatedU, 8),
    declaredUValueWm2K: declaredU && declaredU > 0 ? round(declaredU, 8) : null,
    effectiveUValueWm2K: effectiveU === null ? null : round(effectiveU, 8),
    calculatedDeclaredDifferenceWm2K: difference === null ? null : round(difference, 8),
    calculatedDeclaredDifferencePercent: differencePercent === null ? null : round(differencePercent, 6),
    requirementMaximumUValueWm2K: requirementMaximum,
    requirementApplicable,
    compliance,
    complianceDifferenceWm2K: complianceDifference === null ? null : round(complianceDifference, 8),
    validationMessages,
    trace,
  };
}
