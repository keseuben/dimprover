import type { EnergyRuleSetMetadata } from "@/components/energy/regulations/energyRuleSetTypes";

export const huEkm20231101Metadata: EnergyRuleSetMetadata = {
  id: "HU_EKM_2023_11_01",
  name: "Magyar épületenergetikai szabálycsomag – 2023.11.01.",
  jurisdiction: "HU",
  version: "0.7.2-assembly-u",
  status: "active",
  validFrom: "2023-11-01",
  supportedPurposes: ["existingAssessment", "designCompliance", "significantRenovation", "renovationProposal", "certificatePreparation", "legacyComparison"],
  supportedRequirementLevels: ["existingNoRequirement", "newBuildingNearlyZero", "significantRenovation", "affectedElementOnly", "customComparison"],
  calculationAvailable: true,
  availableCalculationModules: ["geometry", "assemblyUValue"],
  professionalReviewRequired: true,
  sourceReferenceIds: ["HU-EKM-9-2023", "HU-EKM-9-2023-ANNEX-1", "HU-EM-CALCULATION-METHOD", "HU-EM-CALCULATION-METHOD-APPENDIX-1", "HU-ENERGY-CERTIFICATION-RULES"],
  note: "A geometriai és homogén rétegrendi U-érték modul ellenőrzött forrásadatokkal működik. A zóna-, gépészeti, primerenergia- és hiteles tanúsítói modul még nem érhető el.",
};
