export type MaterialPropertySource =
  | "standard"
  | "officialMethod"
  | "manufacturerDatasheet"
  | "declarationOfPerformance"
  | "epd"
  | "approvedOpenDatabase"
  | "winwattUserImport"
  | "userInput"
  | "estimated";

export type MaterialVerificationStatus = "unverified" | "machineMapped" | "reviewed" | "verified";

export type MaterialPropertyValue = {
  value?: number;
  unit: string;
  condition?: string;
  minValue?: number;
  maxValue?: number;
  sourceField?: string;
  verified: boolean;
  note?: string;
};

export type MaterialVersion = {
  id: string;
  materialId: string;
  versionNumber: number;
  validFrom?: string;
  validTo?: string;
  densityKgM3?: MaterialPropertyValue;
  specificHeatJkgK?: MaterialPropertyValue;
  declaredLambdaWmK?: MaterialPropertyValue;
  designLambdaWmK?: MaterialPropertyValue;
  vaporResistanceFactorMu?: MaterialPropertyValue;
  vaporPermeability?: MaterialPropertyValue;
  moistureContentReference?: MaterialPropertyValue;
  moistureContentMax?: MaterialPropertyValue;
  fireClass?: string;
  compressiveStrength?: MaterialPropertyValue;
  defaultThicknessMm?: number;
  availableThicknessesMm?: number[];
  rawProperties: Record<string, unknown>;
  sourcePackageId: string;
  verificationStatus: MaterialVerificationStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
};

export type EnergyMaterialSnapshot = {
  materialId: string;
  materialVersionId: string;
  displayName: string;
  manufacturer?: string;
  productCode?: string;
  densityKgM3?: number;
  specificHeatJkgK?: number;
  lambdaUsedWmK: number;
  lambdaSource: "declared" | "design" | "custom" | "corrected";
  mu?: number;
  sourcePackageId: string;
  sourceDocument?: string;
  verificationStatus: MaterialVerificationStatus;
  capturedAt: string;
};
