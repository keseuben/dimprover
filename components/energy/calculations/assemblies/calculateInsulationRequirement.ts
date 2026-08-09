import type { EnergyRequirementLevel } from "@/components/energy/domain/energyProjectTypes";
import type { EnergyAssemblyRuleData, EnergyInsulationThicknessResult } from "@/components/energy/domain/energyAssemblyTypes";
import { calculateAssemblyThermalPerformance } from "@/components/energy/calculations/assemblies/calculateUValue";
import type { SurveyConstructionAssembly } from "@/components/property-survey/propertySurveyEnergyModel";

function cloneAssemblyWithThickness(assembly: SurveyConstructionAssembly, layerId: string, thicknessMeters: number): SurveyConstructionAssembly {
  const corrections = assembly.corrections.mechanicalFastener.insulationLayerId === layerId
    ? { ...assembly.corrections, mechanicalFastener: { ...assembly.corrections.mechanicalFastener, insulationThicknessMeters: thicknessMeters } }
    : assembly.corrections;
  return {
    ...assembly,
    calculationMode: "calculated",
    corrections,
    layers: assembly.layers.map((layer) => layer.id === layerId ? { ...layer, thicknessCm: thicknessMeters * 100 } : layer),
  };
}

function roundUpCentimeter(valueMeters: number) {
  return Math.ceil((valueMeters - 1e-10) * 100) / 100;
}

export function calculateRequiredInsulationThickness(input: {
  assembly: SurveyConstructionAssembly;
  insulationLayerId: string;
  rules: EnergyAssemblyRuleData;
  requirementLevel: EnergyRequirementLevel;
  targetUValueWm2K?: number;
  maximumTotalThicknessMeters?: number;
}): EnergyInsulationThicknessResult {
  const layer = input.assembly.layers.find((item) => item.id === input.insulationLayerId);
  const requirement = input.rules.requirements[input.assembly.requirementType];
  const target = input.targetUValueWm2K || (input.assembly.requirementType === "custom" ? Number(String(input.assembly.customRequirementUValueWm2K || "").replace(",", ".")) : requirement.maximumUValueWm2K) || 0;
  const currentThickness = Math.max(0, Number(layer?.thicknessCm) || 0) / 100;
  const lambda = Number(String(layer?.lambdaWmK || "").replace(",", "."));
  const current = calculateAssemblyThermalPerformance({ assembly: { ...input.assembly, calculationMode: "calculated" }, rules: input.rules, requirementLevel: input.requirementLevel });
  const invalidResult = (message: string): EnergyInsulationThicknessResult => ({ valid: false, targetUValueWm2K: target, currentUValueWm2K: current.calculatedUValueWm2K, requiredAdditionalResistanceM2KPerW: null, requiredTotalInsulationThicknessMeters: null, requiredAdditionalThicknessMeters: null, roundedRecommendedAdditionalThicknessMeters: null, message });

  if (!layer) return invalidResult("A kiválasztott hőszigetelő réteg nem található.");
  if (layer.kind !== "solid") return invalidResult("A vastagságkereső csak szilárd, d/λ alapján számított rétegen használható.");
  if (!(lambda > 0)) return invalidResult("A kiválasztott réteghez pozitív λ-érték szükséges.");
  if (!(target > 0)) return invalidResult("A cél U-értéket vagy alkalmazandó követelményt meg kell adni.");
  if (requirement.equivalentGroundValue || input.assembly.boundaryMode === "groundEquivalentRequired") return invalidResult("Talajjal érintkező szerkezetnél előbb az egyenértékű talajszámítás szükséges.");
  if (input.assembly.complexity === "inhomogeneous") return invalidResult("Inhomogén szerkezetnél a részletes módszer szükséges.");
  if (current.blocked || current.calculatedUValueWm2K === null || current.totalResistanceM2KPerW === null) return invalidResult("A jelenlegi rétegrend hibás vagy hiányos; előbb javítsd a blokkoló adatokat.");
  if (current.calculatedUValueWm2K <= target) return { valid: true, targetUValueWm2K: target, currentUValueWm2K: current.calculatedUValueWm2K, requiredAdditionalResistanceM2KPerW: 0, requiredTotalInsulationThicknessMeters: currentThickness, requiredAdditionalThicknessMeters: 0, roundedRecommendedAdditionalThicknessMeters: 0, message: "A jelenlegi rétegrend már teljesíti a megadott cél U-értéket." };

  const maximum = Math.max(currentThickness + 0.01, input.maximumTotalThicknessMeters || 1);
  const highResult = calculateAssemblyThermalPerformance({ assembly: cloneAssemblyWithThickness(input.assembly, layer.id, maximum), rules: input.rules, requirementLevel: input.requirementLevel });
  if (highResult.calculatedUValueWm2K === null || highResult.calculatedUValueWm2K > target) return invalidResult(`A cél U-érték ${Math.round(maximum * 100)} cm teljes rétegvastagságig nem érhető el a megadott λ és korrekciók mellett.`);

  let low = currentThickness;
  let high = maximum;
  for (let index = 0; index < 80; index += 1) {
    const middle = (low + high) / 2;
    const result = calculateAssemblyThermalPerformance({ assembly: cloneAssemblyWithThickness(input.assembly, layer.id, middle), rules: input.rules, requirementLevel: input.requirementLevel });
    if (result.calculatedUValueWm2K !== null && result.calculatedUValueWm2K <= target) high = middle;
    else low = middle;
  }
  const requiredTotal = high;
  const additional = Math.max(0, requiredTotal - currentThickness);
  const roundedAdditional = roundUpCentimeter(additional);
  const currentInsulationResistance = currentThickness / lambda;
  const requiredInsulationResistance = requiredTotal / lambda;
  return {
    valid: true,
    targetUValueWm2K: target,
    currentUValueWm2K: current.calculatedUValueWm2K,
    requiredAdditionalResistanceM2KPerW: Math.max(0, requiredInsulationResistance - currentInsulationResistance),
    requiredTotalInsulationThicknessMeters: requiredTotal,
    requiredAdditionalThicknessMeters: additional,
    roundedRecommendedAdditionalThicknessMeters: roundedAdditional,
    message: `A számított minimális többlet ${Math.ceil(additional * 1000)} mm; gyakorlati javaslatként legalább ${Math.round(roundedAdditional * 100)} cm további hőszigetelés szükséges.`,
  };
}
