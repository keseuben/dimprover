import type { EnergyRequirementLevel } from "@/components/energy/domain/energyProjectTypes";
import type { SurveyOpeningKind, SurveyWallOpening } from "@/components/property-survey/propertySurveyBuildingModel";

export const ENERGY_OPENING_WORKSPACE_SCHEMA_VERSION = 1 as const;

export type EnergyOpeningCalculationMode = "declared" | "detailed";
export type EnergyOpeningRequirementType =
  | "glazing"
  | "specialGlazing"
  | "woodPvcFacadeGlazed"
  | "metalFacadeGlazed"
  | "curtainWall"
  | "glassRoof"
  | "rooflight"
  | "roofWindow"
  | "industrialFireDoorGate"
  | "facadeDoor"
  | "facadeGate"
  | "custom";

export type EnergyOpeningFrameMaterial = "wood" | "pvc" | "metal" | "composite" | "other";
export type EnergyOpeningSourceType = "manufacturerDeclaration" | "calculation" | "catalog" | "manual" | "legacyMigration";
export type EnergyThermalBridgeKind = "linear" | "point";
export type EnergyThermalBridgeCategory =
  | "externalCorner"
  | "internalCorner"
  | "wallFloor"
  | "wallRoof"
  | "plinth"
  | "balcony"
  | "openingReveal"
  | "openingSill"
  | "openingHead"
  | "structuralPenetration"
  | "other";

export type EnergyOpeningDetail = {
  openingId: string;
  calculationMode: EnergyOpeningCalculationMode;
  requirementType: EnergyOpeningRequirementType;
  declaredUwWm2K?: number;
  declaredSourceType?: EnergyOpeningSourceType;
  declaredSourceReference?: string;
  frameMaterial: EnergyOpeningFrameMaterial;
  frameWidthMeters?: number;
  glazingUgWm2K?: number;
  frameUfWm2K?: number;
  glazingEdgePsiWmK?: number;
  glazingEdgeSourceReference?: string;
  solarGValue?: number;
  installationPsiWmK?: number;
  installationPsiSourceReference?: string;
  customRequirementMaximumUwWm2K?: number;
  note: string;
  catalogProfileId?: string;
  shading?: string;
  planPageId?: string;
  planOpeningSuggestionId?: string;
  planTransferUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type EnergyThermalBridge = {
  id: string;
  kind: EnergyThermalBridgeKind;
  category: EnergyThermalBridgeCategory;
  name: string;
  levelId?: string;
  zoneId?: string;
  roomId?: string;
  wallSegmentId?: string;
  openingId?: string;
  lengthMeters?: number;
  quantity?: number;
  psiWmK?: number;
  chiWK?: number;
  sourceType: EnergyOpeningSourceType;
  sourceReference: string;
  note: string;
  planPageId?: string;
  planOpeningSuggestionId?: string;
  planTransferUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type EnergyOpeningWorkspace = {
  schemaVersion: typeof ENERGY_OPENING_WORKSPACE_SCHEMA_VERSION;
  openingDetails: Record<string, EnergyOpeningDetail>;
  thermalBridges: EnergyThermalBridge[];
  createdAt: string;
  updatedAt: string;
};

export type EnergyOpeningValidationCode =
  | "OPENING_GEOMETRY_INVALID"
  | "OPENING_DETAIL_MISSING"
  | "DECLARED_U_REQUIRED"
  | "DECLARED_SOURCE_REQUIRED"
  | "FRAME_WIDTH_INVALID"
  | "GLAZING_AREA_INVALID"
  | "UG_REQUIRED"
  | "UF_REQUIRED"
  | "GLAZING_EDGE_PSI_REQUIRED"
  | "GLAZING_EDGE_SOURCE_REQUIRED"
  | "SOLAR_G_VALUE_INVALID"
  | "INSTALLATION_PSI_INVALID"
  | "INSTALLATION_SOURCE_REQUIRED"
  | "CUSTOM_REQUIREMENT_REQUIRED"
  | "THERMAL_BRIDGE_NAME_REQUIRED"
  | "THERMAL_BRIDGE_LENGTH_REQUIRED"
  | "THERMAL_BRIDGE_PSI_REQUIRED"
  | "THERMAL_BRIDGE_QUANTITY_REQUIRED"
  | "THERMAL_BRIDGE_CHI_REQUIRED"
  | "THERMAL_BRIDGE_SOURCE_REQUIRED"
  | "THERMAL_BRIDGE_OPENING_MISSING"
  | "OPENING_INSTALLATION_DOUBLE_COUNT"
  | "SMALL_OPENING_REQUIREMENT_NOT_APPLICABLE";

export type EnergyOpeningValidationMessage = {
  code: EnergyOpeningValidationCode;
  severity: "info" | "warning" | "error";
  blocking: boolean;
  openingId?: string;
  thermalBridgeId?: string;
  entityName?: string;
  message: string;
};

export type EnergyOpeningCompliance = "compliant" | "notCompliant" | "notApplicable" | "notApplicableSmallArea" | "notCalculated";

export type EnergyOpeningTraceItem = {
  id: string;
  ruleId: string;
  label: string;
  formula: string;
  inputs: Record<string, number | string | boolean | null>;
  unroundedValue: number;
  value: number;
  unit: "m" | "m2" | "W/K" | "W/m2K" | "1";
  entityRefs: Array<{ type: "opening" | "thermalBridge" | "wall" | "room"; id: string; name: string }>;
};

export type EnergyOpeningResult = {
  openingId: string;
  openingName: string;
  kind: SurveyOpeningKind;
  calculationMode: EnergyOpeningCalculationMode;
  requirementType: EnergyOpeningRequirementType;
  widthMeters: number;
  heightMeters: number;
  areaSquareMeters: number;
  perimeterMeters: number;
  glazingAreaSquareMeters: number | null;
  frameAreaSquareMeters: number | null;
  glazingEdgeLengthMeters: number | null;
  effectiveUwWm2K: number | null;
  requirementMaximumUwWm2K: number | null;
  compliance: EnergyOpeningCompliance;
  openingHeatLossCoefficientWK: number | null;
  installationHeatLossCoefficientWK: number;
  totalHeatLossCoefficientWK: number | null;
  blocked: boolean;
  validationMessages: EnergyOpeningValidationMessage[];
  trace: EnergyOpeningTraceItem[];
};

export type EnergyThermalBridgeResult = {
  id: string;
  name: string;
  kind: EnergyThermalBridgeKind;
  category: EnergyThermalBridgeCategory;
  openingId?: string;
  heatLossCoefficientWK: number | null;
  blocked: boolean;
  validationMessages: EnergyOpeningValidationMessage[];
  trace: EnergyOpeningTraceItem[];
};

export type EnergyOpeningSetResult = {
  schema: "dimpro.energy-opening-set.v0.7.4";
  engineVersion: "0.7.4";
  calculatedAt: string;
  valid: boolean;
  blocked: boolean;
  requirementLevel: EnergyRequirementLevel;
  openings: EnergyOpeningResult[];
  thermalBridges: EnergyThermalBridgeResult[];
  totals: {
    openingCount: number;
    validOpeningCount: number;
    blockedOpeningCount: number;
    compliantOpeningCount: number;
    notCompliantOpeningCount: number;
    totalOpeningAreaSquareMeters: number;
    openingHeatLossCoefficientWK: number;
    installationHeatLossCoefficientWK: number;
    otherThermalBridgeHeatLossCoefficientWK: number;
    totalHeatLossCoefficientWK: number;
  };
  validationMessages: EnergyOpeningValidationMessage[];
  trace: EnergyOpeningTraceItem[];
  openingFormulaSourceReferenceId: "EN-ISO-10077-1-UW";
  requirementSourceReferenceId: "HU-EKM-9-2023-ANNEX-1-OPENINGS";
  thermalBridgeSourceReferenceId: "EN-ISO-10211-14683-THERMAL-BRIDGES";
  sourceCheckedAt: "2026-07-29";
};

export const energyOpeningRequirementTypeLabels: Record<EnergyOpeningRequirementType, string> = {
  glazing: "Üvegezés",
  specialGlazing: "Különleges üvegezés",
  woodPvcFacadeGlazed: "Fa/PVC keretszerkezetű homlokzati üvegezett nyílászáró",
  metalFacadeGlazed: "Fém keretszerkezetű homlokzati üvegezett nyílászáró",
  curtainWall: "Függönyfal",
  glassRoof: "Üvegtető",
  rooflight: "Felülvilágító / füstelvezető kupola",
  roofWindow: "Tetősík ablak",
  industrialFireDoorGate: "Ipari / tűzgátló ajtó vagy kapu",
  facadeDoor: "Homlokzati vagy fűtött–fűtetlen ajtó",
  facadeGate: "Homlokzati vagy fűtött–fűtetlen kapu",
  custom: "Egyedi követelmény",
};

export const energyThermalBridgeCategoryLabels: Record<EnergyThermalBridgeCategory, string> = {
  externalCorner: "Külső falsarok",
  internalCorner: "Belső falsarok",
  wallFloor: "Fal–födém csatlakozás",
  wallRoof: "Fal–tető csatlakozás",
  plinth: "Lábazati csatlakozás",
  balcony: "Erkély / konzol",
  openingReveal: "Nyílászáró káva",
  openingSill: "Nyílászáró parapet",
  openingHead: "Nyílászáró szemöldök",
  structuralPenetration: "Szerkezeti áttörés",
  other: "Egyéb hőhíd",
};

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function finitePositive(value: unknown) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function finiteNonNegative(value: unknown) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function inferOpeningRequirementType(opening: Pick<SurveyWallOpening, "kind" | "frame">): EnergyOpeningRequirementType {
  if (opening.kind === "door") return "facadeDoor";
  if (opening.kind === "garageDoor") return "facadeGate";
  const frame = String(opening.frame || "").toLocaleLowerCase("hu-HU");
  if (frame.includes("fém") || frame.includes("alum") || frame.includes("acél")) return "metalFacadeGlazed";
  return "woodPvcFacadeGlazed";
}

export function createEnergyOpeningDetail(opening: SurveyWallOpening, input?: Partial<EnergyOpeningDetail>): EnergyOpeningDetail {
  const now = new Date().toISOString();
  const legacyUw = finitePositive(opening.uValue);
  const declaredUw = finitePositive(input?.declaredUwWm2K) ?? legacyUw;
  return {
    openingId: opening.id,
    calculationMode: input?.calculationMode || (declaredUw ? "declared" : "detailed"),
    requirementType: input?.requirementType || inferOpeningRequirementType(opening),
    declaredUwWm2K: declaredUw,
    declaredSourceType: input?.declaredSourceType || (legacyUw ? "legacyMigration" : undefined),
    declaredSourceReference: input?.declaredSourceReference || (legacyUw ? "Korábbi DIMPRO U-érték mező – forrás ellenőrizendő" : undefined),
    frameMaterial: input?.frameMaterial || (inferOpeningRequirementType(opening) === "metalFacadeGlazed" ? "metal" : "pvc"),
    frameWidthMeters: finitePositive(input?.frameWidthMeters),
    glazingUgWm2K: finitePositive(input?.glazingUgWm2K),
    frameUfWm2K: finitePositive(input?.frameUfWm2K),
    glazingEdgePsiWmK: finiteNonNegative(input?.glazingEdgePsiWmK),
    glazingEdgeSourceReference: input?.glazingEdgeSourceReference || undefined,
    solarGValue: finiteNonNegative(input?.solarGValue),
    installationPsiWmK: finiteNonNegative(input?.installationPsiWmK),
    installationPsiSourceReference: input?.installationPsiSourceReference || undefined,
    customRequirementMaximumUwWm2K: finitePositive(input?.customRequirementMaximumUwWm2K),
    note: input?.note || "",
    catalogProfileId: input?.catalogProfileId || undefined,
    shading: input?.shading || undefined,
    planPageId: input?.planPageId || undefined,
    planOpeningSuggestionId: input?.planOpeningSuggestionId || undefined,
    planTransferUpdatedAt: input?.planTransferUpdatedAt || undefined,
    createdAt: input?.createdAt || now,
    updatedAt: input?.updatedAt || now,
  };
}

export function createEnergyThermalBridge(input?: Partial<EnergyThermalBridge>): EnergyThermalBridge {
  const now = new Date().toISOString();
  return {
    id: input?.id || id("energy-thermal-bridge"),
    kind: input?.kind || "linear",
    category: input?.category || "other",
    name: input?.name || "Új hőhíd",
    levelId: input?.levelId || undefined,
    zoneId: input?.zoneId || undefined,
    roomId: input?.roomId || undefined,
    wallSegmentId: input?.wallSegmentId || undefined,
    openingId: input?.openingId || undefined,
    lengthMeters: finitePositive(input?.lengthMeters),
    quantity: finitePositive(input?.quantity),
    psiWmK: finiteNonNegative(input?.psiWmK),
    chiWK: finiteNonNegative(input?.chiWK),
    sourceType: input?.sourceType || "manual",
    sourceReference: input?.sourceReference || "",
    note: input?.note || "",
    planPageId: input?.planPageId || undefined,
    planOpeningSuggestionId: input?.planOpeningSuggestionId || undefined,
    planTransferUpdatedAt: input?.planTransferUpdatedAt || undefined,
    createdAt: input?.createdAt || now,
    updatedAt: input?.updatedAt || now,
  };
}

export function createDefaultEnergyOpeningWorkspace(openings: SurveyWallOpening[] = [], input?: Partial<EnergyOpeningWorkspace>): EnergyOpeningWorkspace {
  const now = new Date().toISOString();
  const sourceDetails = input?.openingDetails || {};
  return {
    schemaVersion: ENERGY_OPENING_WORKSPACE_SCHEMA_VERSION,
    openingDetails: Object.fromEntries(openings.map((opening) => [opening.id, createEnergyOpeningDetail(opening, sourceDetails[opening.id])])),
    thermalBridges: Array.isArray(input?.thermalBridges) ? input.thermalBridges.map((bridge) => createEnergyThermalBridge(bridge)) : [],
    createdAt: input?.createdAt || now,
    updatedAt: input?.updatedAt || now,
  };
}

export function normalizeEnergyOpeningWorkspace(input: Partial<EnergyOpeningWorkspace> | null | undefined, openings: SurveyWallOpening[]): EnergyOpeningWorkspace {
  const base = createDefaultEnergyOpeningWorkspace(openings, input || undefined);
  const openingIds = new Set(openings.map((opening) => opening.id));
  return {
    ...base,
    openingDetails: Object.fromEntries(openings.map((opening) => [opening.id, createEnergyOpeningDetail(opening, base.openingDetails[opening.id])])),
    thermalBridges: base.thermalBridges.filter((bridge) => !bridge.openingId || openingIds.has(bridge.openingId)),
    updatedAt: input?.updatedAt || base.updatedAt,
  };
}
