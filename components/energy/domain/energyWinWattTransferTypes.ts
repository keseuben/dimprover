export type WinWattTransferRequirement = "required" | "conditional" | "optional";
export type WinWattTransferMode = "directCopy" | "manualReview" | "referenceOnly" | "futureNativeImport";
export type WinWattTargetVerification = "referenceAligned" | "dimproExtension" | "trialRequired";
export type WinWattTransferDataType = "text" | "number" | "boolean" | "status";
export type WinWattFieldReadinessStatus = "ready" | "reviewRequired" | "blocked" | "notApplicable";

export type WinWattFieldMapEntry = {
  id: string;
  sourceTableId: string;
  sourceTableLabel: string;
  sourceColumnKey: string;
  sourceColumnLabel: string;
  sourceUnit?: string;
  sourcePath: string;
  targetGroupId: string;
  targetGroupLabel: string;
  targetFieldKey: string;
  targetFieldLabel: string;
  targetUnit?: string;
  requirement: WinWattTransferRequirement;
  transferMode: WinWattTransferMode;
  targetVerification: WinWattTargetVerification;
  dataType: WinWattTransferDataType;
  note: string;
};

export type WinWattFieldCoverage = WinWattFieldMapEntry & {
  recordCount: number;
  populatedCount: number;
  missingCount: number;
  invalidCount: number;
  readiness: WinWattFieldReadinessStatus;
  readinessMessage: string;
};

export type WinWattTransferRecord = {
  id: string;
  sourceTableId: string;
  sourceRowId: string;
  sourceColumnKey: string;
  targetGroupId: string;
  targetFieldKey: string;
  targetFieldLabel: string;
  value: string | number | boolean | null;
  unit?: string;
  requirement: WinWattTransferRequirement;
  transferMode: WinWattTransferMode;
  targetVerification: WinWattTargetVerification;
  readiness: WinWattFieldReadinessStatus;
  message: string;
};

export type WinWattTransferTableSummary = {
  tableId: string;
  tableLabel: string;
  targetGroupLabel: string;
  fieldCount: number;
  recordCount: number;
  readyFieldCount: number;
  reviewFieldCount: number;
  blockedFieldCount: number;
  missingRequiredValueCount: number;
  invalidValueCount: number;
  readiness: WinWattFieldReadinessStatus;
};

export type WinWattTransferValidationMessage = {
  id: string;
  severity: "blocking" | "warning" | "info";
  code: string;
  tableId?: string;
  rowId?: string;
  fieldId?: string;
  message: string;
};

export type WinWattFieldMapResult = {
  schema: "dimpro.winwatt-field-map.v0.8.3";
  generatedAt: string;
  disclaimer: string;
  fields: WinWattFieldCoverage[];
  records: WinWattTransferRecord[];
  tables: WinWattTransferTableSummary[];
  validationMessages: WinWattTransferValidationMessage[];
  totals: {
    tableCount: number;
    mappedFieldCount: number;
    transferRecordCount: number;
    readyFieldCount: number;
    reviewFieldCount: number;
    blockedFieldCount: number;
    requiredFieldCount: number;
    missingRequiredValueCount: number;
    invalidValueCount: number;
    referenceAlignedFieldCount: number;
    dimproExtensionFieldCount: number;
    trialRequiredFieldCount: number;
  };
  readyForTrialTransfer: boolean;
};

export const winWattTransferRequirementLabels: Record<WinWattTransferRequirement, string> = {
  required: "Kötelező",
  conditional: "Feltételes",
  optional: "Opcionális",
};

export const winWattTransferModeLabels: Record<WinWattTransferMode, string> = {
  directCopy: "Közvetlen másolás",
  manualReview: "Kézi ellenőrzés",
  referenceOnly: "Referenciaadat",
  futureNativeImport: "Későbbi natív import",
};

export const winWattTargetVerificationLabels: Record<WinWattTargetVerification, string> = {
  referenceAligned: "WinWatt-logikához igazított",
  dimproExtension: "DIMPRO kiegészítő adat",
  trialRequired: "Valós próba szükséges",
};

export const winWattFieldReadinessLabels: Record<WinWattFieldReadinessStatus, string> = {
  ready: "Átadásra kész",
  reviewRequired: "Ellenőrzendő",
  blocked: "Blokkolt",
  notApplicable: "Nem alkalmazandó",
};
