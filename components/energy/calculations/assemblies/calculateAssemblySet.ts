import type { EnergyRequirementLevel } from "@/components/energy/domain/energyProjectTypes";
import type { EnergyAssemblyRuleData, EnergyAssemblySetResult } from "@/components/energy/domain/energyAssemblyTypes";
import { calculateAssemblyThermalPerformance } from "@/components/energy/calculations/assemblies/calculateUValue";
import type { SurveyConstructionAssembly } from "@/components/property-survey/propertySurveyEnergyModel";

export function calculateAssemblySet(input: {
  assemblies: SurveyConstructionAssembly[];
  rules: EnergyAssemblyRuleData;
  requirementLevel: EnergyRequirementLevel;
  calculatedAt?: string;
}): EnergyAssemblySetResult {
  const results = input.assemblies.map((assembly) => calculateAssemblyThermalPerformance({ assembly, rules: input.rules, requirementLevel: input.requirementLevel }));
  return {
    schema: "dimpro.energy-assembly-set.v0.7.2",
    engineVersion: "0.7.2",
    calculatedAt: input.calculatedAt || new Date().toISOString(),
    ruleSourceReferenceId: input.rules.sourceReferenceId,
    ruleCheckedAt: input.rules.checkedAt,
    results,
    totals: {
      assemblyCount: results.length,
      validCount: results.filter((result) => result.valid).length,
      blockedCount: results.filter((result) => result.blocked).length,
      compliantCount: results.filter((result) => result.compliance === "compliant").length,
      notCompliantCount: results.filter((result) => result.compliance === "notCompliant").length,
      groundCalculationRequiredCount: results.filter((result) => result.compliance === "groundCalculationRequired").length,
      warningCount: results.reduce((sum, result) => sum + result.validationMessages.filter((message) => message.severity === "warning").length, 0),
      errorCount: results.reduce((sum, result) => sum + result.validationMessages.filter((message) => message.severity === "error").length, 0),
    },
  };
}
