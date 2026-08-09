import type { EnergyCalculationPurpose, EnergyRequirementLevel, EnergyRuleSetId } from "@/components/energy/domain/energyProjectTypes";
import type { EnergyAssemblyRuleData } from "@/components/energy/domain/energyAssemblyTypes";

export type EnergyRuleSetStatus = "draft" | "reviewRequired" | "active" | "superseded" | "archived";

export type EnergyRuleSourceReference = {
  id: string;
  title: string;
  publisher: string;
  documentDate?: string;
  documentVersion?: string;
  referenceNote: string;
  verificationStatus: "unverified" | "reviewRequired" | "verified";
};

export type EnergyRuleSetMetadata = {
  id: EnergyRuleSetId;
  name: string;
  jurisdiction: "HU";
  version: string;
  status: EnergyRuleSetStatus;
  validFrom?: string;
  validTo?: string;
  supportedPurposes: EnergyCalculationPurpose[];
  supportedRequirementLevels: EnergyRequirementLevel[];
  calculationAvailable: boolean;
  availableCalculationModules?: Array<"geometry" | "assemblyUValue" | "zones" | "systems" | "primaryEnergy" | "certificate">;
  professionalReviewRequired: boolean;
  sourceReferenceIds: string[];
  note: string;
};

export type EnergyRuleSetDefinition = {
  metadata: EnergyRuleSetMetadata;
  sourceReferences: EnergyRuleSourceReference[];
  assemblyRules?: EnergyAssemblyRuleData;
};
