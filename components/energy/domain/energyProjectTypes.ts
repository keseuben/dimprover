export const ENERGY_PROJECT_SETTINGS_SCHEMA_VERSION = 1 as const;

export type EnergyRuleSetId = "HU_EKM_2023_11_01";

export type EnergyCalculationPurpose =
  | "existingAssessment"
  | "designCompliance"
  | "significantRenovation"
  | "renovationProposal"
  | "certificatePreparation"
  | "legacyComparison";

export type EnergyRequirementLevel =
  | "existingNoRequirement"
  | "newBuildingNearlyZero"
  | "significantRenovation"
  | "affectedElementOnly"
  | "customComparison";

export type EnergyCertificationSubject = "wholeBuilding" | "independentUnit";

export type EnergyBuildingSymbol =
  | "familyHouse"
  | "semiDetachedWhole"
  | "semiDetachedUnit"
  | "rowHouseWhole"
  | "rowHouseEnd"
  | "rowHouseMiddle"
  | "apartmentBuildingWhole"
  | "apartmentEdgeLower"
  | "apartmentEdgeMiddle"
  | "apartmentEdgeUpper"
  | "apartmentMiddleLower"
  | "apartmentMiddleMiddle"
  | "apartmentMiddleUpper"
  | "otherBuilding";

export type EnergyCalculationMethod = "simplified" | "detailed" | "mixed";

export type EnergyProjectSettings = {
  schemaVersion: typeof ENERGY_PROJECT_SETTINGS_SCHEMA_VERSION;
  enabled: boolean;
  ruleSetId: EnergyRuleSetId;
  calculationPurpose: EnergyCalculationPurpose;
  requirementLevel: EnergyRequirementLevel;
  certificationSubject: EnergyCertificationSubject;
  buildingSymbol: EnergyBuildingSymbol;
  permitOrNotificationDate?: string;
  constructionYear?: number;
  significantRenovationYear?: number;
  wholeBuildingDataAvailable: boolean;
  calculationMethod: EnergyCalculationMethod;
  createdAt: string;
  updatedAt: string;
};

export type EnergySettingsValidationCode =
  | "RULE_SET_REQUIRED"
  | "PURPOSE_REQUIRED"
  | "REQUIREMENT_LEVEL_REQUIRED"
  | "BUILDING_SYMBOL_REQUIRED"
  | "PERMIT_DATE_RECOMMENDED"
  | "CONSTRUCTION_YEAR_INVALID"
  | "RENOVATION_YEAR_REQUIRED"
  | "WHOLE_BUILDING_DATA_MISSING"
  | "CERTIFICATE_PREPARATION_ONLY";

export type EnergySettingsValidationMessage = {
  code: EnergySettingsValidationCode;
  severity: "info" | "warning" | "error";
  field?: keyof EnergyProjectSettings;
  message: string;
};

export const energyCalculationPurposeLabels: Record<EnergyCalculationPurpose, string> = {
  existingAssessment: "Meglévő állapot felmérése",
  designCompliance: "Tervezési megfelelőség",
  significantRenovation: "Jelentős felújítás",
  renovationProposal: "Korszerűsítési javaslat",
  certificatePreparation: "Tanúsítvány-előkészítés",
  legacyComparison: "Korábbi szabályállapot összehasonlítása",
};

export const energyRequirementLevelLabels: Record<EnergyRequirementLevel, string> = {
  existingNoRequirement: "Meglévő épület – követelményvizsgálat nélkül",
  newBuildingNearlyZero: "Új épület / közel nulla követelményszint",
  significantRenovation: "Jelentős felújítás követelményei",
  affectedElementOnly: "Csak az érintett szerkezet vizsgálata",
  customComparison: "Egyedi összehasonlítás",
};

export const energyCertificationSubjectLabels: Record<EnergyCertificationSubject, string> = {
  wholeBuilding: "Egész épület",
  independentUnit: "Önálló rendeltetési egység",
};

export const energyBuildingSymbolLabels: Record<EnergyBuildingSymbol, string> = {
  familyHouse: "Családi ház",
  semiDetachedWhole: "Ikerház – teljes épület",
  semiDetachedUnit: "Ikerház – önálló egység",
  rowHouseWhole: "Sorház – teljes épület",
  rowHouseEnd: "Sorház – szélső egység",
  rowHouseMiddle: "Sorház – közbenső egység",
  apartmentBuildingWhole: "Társasház – teljes épület",
  apartmentEdgeLower: "Társasházi lakás – szélső, alsó",
  apartmentEdgeMiddle: "Társasházi lakás – szélső, középső",
  apartmentEdgeUpper: "Társasházi lakás – szélső, felső",
  apartmentMiddleLower: "Társasházi lakás – közbenső, alsó",
  apartmentMiddleMiddle: "Társasházi lakás – közbenső, középső",
  apartmentMiddleUpper: "Társasházi lakás – közbenső, felső",
  otherBuilding: "Egyéb épület",
};

export const energyCalculationMethodLabels: Record<EnergyCalculationMethod, string> = {
  simplified: "Egyszerűsített",
  detailed: "Részletes",
  mixed: "Vegyes",
};

function normalizeOptionalYear(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1800 || parsed > 2200) return undefined;
  return parsed;
}

export function createDefaultEnergyProjectSettings(input?: Partial<EnergyProjectSettings>): EnergyProjectSettings {
  const now = new Date().toISOString();
  return {
    schemaVersion: ENERGY_PROJECT_SETTINGS_SCHEMA_VERSION,
    enabled: input?.enabled ?? true,
    ruleSetId: input?.ruleSetId === "HU_EKM_2023_11_01" ? input.ruleSetId : "HU_EKM_2023_11_01",
    calculationPurpose: input?.calculationPurpose || "existingAssessment",
    requirementLevel: input?.requirementLevel || "existingNoRequirement",
    certificationSubject: input?.certificationSubject || "wholeBuilding",
    buildingSymbol: input?.buildingSymbol || "familyHouse",
    permitOrNotificationDate: input?.permitOrNotificationDate || undefined,
    constructionYear: normalizeOptionalYear(input?.constructionYear),
    significantRenovationYear: normalizeOptionalYear(input?.significantRenovationYear),
    wholeBuildingDataAvailable: input?.wholeBuildingDataAvailable ?? true,
    calculationMethod: input?.calculationMethod || "simplified",
    createdAt: input?.createdAt || now,
    updatedAt: input?.updatedAt || now,
  };
}

export function normalizeEnergyProjectSettings(input?: Partial<EnergyProjectSettings> | null): EnergyProjectSettings {
  return createDefaultEnergyProjectSettings(input || undefined);
}

export function validateEnergyProjectSettings(settings: EnergyProjectSettings): EnergySettingsValidationMessage[] {
  const messages: EnergySettingsValidationMessage[] = [];
  const currentYear = new Date().getFullYear();

  if (!settings.ruleSetId) messages.push({ code: "RULE_SET_REQUIRED", severity: "error", field: "ruleSetId", message: "Szabálycsomag kiválasztása kötelező." });
  if (!settings.calculationPurpose) messages.push({ code: "PURPOSE_REQUIRED", severity: "error", field: "calculationPurpose", message: "A számítás célját meg kell adni." });
  if (!settings.requirementLevel) messages.push({ code: "REQUIREMENT_LEVEL_REQUIRED", severity: "error", field: "requirementLevel", message: "Az alkalmazandó követelményszintet meg kell adni." });
  if (!settings.buildingSymbol) messages.push({ code: "BUILDING_SYMBOL_REQUIRED", severity: "error", field: "buildingSymbol", message: "Az épületszimbólum kiválasztása kötelező." });

  if (settings.constructionYear && (settings.constructionYear < 1800 || settings.constructionYear > currentYear + 5)) {
    messages.push({ code: "CONSTRUCTION_YEAR_INVALID", severity: "error", field: "constructionYear", message: "Az építés éve a megengedett tartományon kívül van." });
  }

  if (settings.calculationPurpose === "significantRenovation" && !settings.significantRenovationYear) {
    messages.push({ code: "RENOVATION_YEAR_REQUIRED", severity: "warning", field: "significantRenovationYear", message: "Jelentős felújításnál célszerű megadni a felújítás évét." });
  }

  if ((settings.calculationPurpose === "designCompliance" || settings.calculationPurpose === "significantRenovation") && !settings.permitOrNotificationDate) {
    messages.push({ code: "PERMIT_DATE_RECOMMENDED", severity: "warning", field: "permitOrNotificationDate", message: "A szabályállapot pontosításához add meg az engedély vagy egyszerű bejelentés dátumát." });
  }

  if (settings.certificationSubject === "independentUnit" && !settings.wholeBuildingDataAvailable) {
    messages.push({ code: "WHOLE_BUILDING_DATA_MISSING", severity: "info", field: "wholeBuildingDataAvailable", message: "Önálló rendeltetési egységnél a teljes épület adatainak hiánya később korlátozhat egyes számításokat." });
  }

  if (settings.calculationPurpose === "certificatePreparation") {
    messages.push({ code: "CERTIFICATE_PREPARATION_ONLY", severity: "warning", message: "Ez a verzió kizárólag tanúsítvány-előkészítő munkatér; hiteles tanúsítványt még nem állít elő." });
  }

  return messages;
}

export function getEnergySettingsReadiness(settings: EnergyProjectSettings) {
  const messages = validateEnergyProjectSettings(settings);
  const errorCount = messages.filter((message) => message.severity === "error").length;
  const warningCount = messages.filter((message) => message.severity === "warning").length;
  const requiredChecks = [settings.ruleSetId, settings.calculationPurpose, settings.requirementLevel, settings.certificationSubject, settings.buildingSymbol, settings.calculationMethod];
  const completed = requiredChecks.filter(Boolean).length;
  return {
    ready: settings.enabled && errorCount === 0,
    percent: settings.enabled ? Math.round((completed / requiredChecks.length) * 100) : 0,
    errorCount,
    warningCount,
    messages,
  };
}
