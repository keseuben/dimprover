import type { EnergyRuleSetId } from "@/components/energy/domain/energyProjectTypes";
import type { EnergyRuleSetDefinition } from "@/components/energy/regulations/energyRuleSetTypes";
import { huEkm20231101Metadata } from "@/components/energy/regulations/HU_EKM_2023_11_01/metadata";
import { huEkm20231101SourceReferences } from "@/components/energy/regulations/HU_EKM_2023_11_01/sourceReferences";
import { huEkm20231101AssemblyRuleData } from "@/components/energy/regulations/HU_EKM_2023_11_01/factors";

export const energyRuleSetRegistry: Record<EnergyRuleSetId, EnergyRuleSetDefinition> = {
  HU_EKM_2023_11_01: {
    metadata: huEkm20231101Metadata,
    sourceReferences: huEkm20231101SourceReferences,
    assemblyRules: huEkm20231101AssemblyRuleData,
  },
};

export function getEnergyRuleSet(ruleSetId: EnergyRuleSetId) {
  return energyRuleSetRegistry[ruleSetId];
}

export function listEnergyRuleSets() {
  return Object.values(energyRuleSetRegistry);
}
