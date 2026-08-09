export type EnergyCertificateStorageMode = "temporary_processing_only" | "user_archive";

export type EnergyCertificateConsentPurpose =
  | "process_and_delete_original_pdf"
  | "save_original_pdf_to_user_account"
  | "use_anonymized_technical_data_for_internal_improvement";

export type EnergyCertificateAuditEventType =
  | "certificate_uploaded"
  | "certificate_processed"
  | "certificate_original_pdf_deleted"
  | "certificate_original_pdf_saved_with_consent"
  | "certificate_anonymized_summary_saved"
  | "certificate_ai_summary_created"
  | "certificate_user_deleted_saved_pdf";

export type EnergyCertificateConsentState = {
  processAndDeleteOriginalPdf: boolean;
  saveOriginalPdfToUserAccount: boolean;
  useAnonymizedTechnicalDataForInternalImprovement: boolean;
  consentCapturedAt?: string;
  consentVersion: "energy-certificate-privacy-v1";
};

export type EnergyCertificateMinimalSummary = {
  hetId?: string;
  validUntil?: string;
  propertyType?: string;
  usefulFloorArea?: number;
  roomCount?: number;
  energyRating?: string;
  co2Rating?: string;
  aggregatedEnergyPerformance?: number;
  co2Emission?: number;
  specificHeatLossCoefficient?: number;
  modernizationSuggestions: string[];
  recommendedRenovationOrder: string[];
};

export type EnergyCertificateArchiveRecord = {
  id: string;
  userId: string;
  calculationId: string;
  storageMode: EnergyCertificateStorageMode;
  minimalSummary: EnergyCertificateMinimalSummary;
  originalPdfStoragePath?: string;
  originalPdfEncrypted: boolean;
  originalPdfSavedWithExplicitConsent: boolean;
  temporaryFileDeleteAfterMinutes: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type EnergyCertificateAuditLogEntry = {
  id: string;
  userId?: string;
  calculationId?: string;
  certificateArchiveRecordId?: string;
  eventType: EnergyCertificateAuditEventType;
  eventAt: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type EnergyCertificateAiPayload = {
  source: "energy_certificate_minimal_summary";
  summary: EnergyCertificateMinimalSummary;
  personalDataRemoved: true;
  originalPdfIncluded: false;
};

export const ENERGY_CERTIFICATE_PRIVACY_NOTICE =
  "A feltöltött energetikai tanúsítvány személyes adatokat tartalmazhat. A DIMPRO alapértelmezés szerint az eredeti PDF-et nem tárolja el, csak ideiglenesen feldolgozza, majd törli. A rendszer kizárólag a kalkulációhoz szükséges, személyes adatoktól megtisztított energetikai adatokat menti. Az eredeti tanúsítvány PDF tárolása csak külön felhasználói hozzájárulással történhet.";

export const ENERGY_CERTIFICATE_AI_RULE =
  "Az AI nem kaphatja meg az eredeti energetikai tanúsítvány teljes PDF tartalmát. Az AI csak személyes adatoktól megtisztított, tömörített energetikai JSON összesítőt kaphat.";

export const DEFAULT_ENERGY_CERTIFICATE_RETENTION_POLICY = {
  temporaryProcessingFileDeleteAfterMinutes: 5,
  originalPdfStorageDefault: "disabled",
  savedPdfRequiresExplicitConsent: true,
  userCanDeleteSavedPdfAnytime: true,
  aiMayReceiveOriginalPdf: false,
  aiMayReceiveOnlyAnonymizedSummary: true,
} as const;

export const energyCertificateConsentOptions: Array<{
  id: EnergyCertificateConsentPurpose;
  label: string;
  defaultChecked: boolean;
  requiredForDefaultProcessing: boolean;
}> = [
  {
    id: "process_and_delete_original_pdf",
    label: "Kérem, hogy a DIMPRO csak feldolgozza a tanúsítványt, majd törölje az eredeti PDF-et.",
    defaultChecked: true,
    requiredForDefaultProcessing: true,
  },
  {
    id: "save_original_pdf_to_user_account",
    label: "Kérem, hogy a DIMPRO mentse el a tanúsítványt a saját fiókomban későbbi visszanézéshez.",
    defaultChecked: false,
    requiredForDefaultProcessing: false,
  },
  {
    id: "use_anonymized_technical_data_for_internal_improvement",
    label:
      "Hozzájárulok, hogy a tanúsítvány személyes adatoktól megtisztított, anonimizált műszaki adatai belső fejlesztési és kalkulációpontosítási célra felhasználhatók legyenek.",
    defaultChecked: false,
    requiredForDefaultProcessing: false,
  },
];

export const energyCertificateForbiddenStoredFields = [
  "eredeti energetikai tanúsítvány PDF",
  "megrendelő neve",
  "pontos cím",
  "helyrajzi szám",
  "telefonszám",
  "e-mail cím",
  "aláírás",
  "bélyegző",
  "fotódokumentáció képei",
] as const;

export const energyCertificateAllowedMinimalFields = [
  "HET azonosító",
  "érvényességi dátum",
  "ingatlan típusa",
  "hasznos alapterület",
  "helyiségek száma",
  "energetikai besorolás",
  "CO2 besorolás",
  "összesített energetikai jellemző",
  "CO2 kibocsátás",
  "fajlagos hőveszteség-tényező",
  "fő korszerűsítési javaslatok",
  "javasolt felújítási sorrend",
] as const;

export function resolveEnergyCertificateStorageMode(
  consent: EnergyCertificateConsentState,
): EnergyCertificateStorageMode {
  return consent.saveOriginalPdfToUserAccount ? "user_archive" : "temporary_processing_only";
}

export function buildEnergyCertificateAiPayload(
  summary: EnergyCertificateMinimalSummary,
): EnergyCertificateAiPayload {
  return {
    source: "energy_certificate_minimal_summary",
    summary,
    personalDataRemoved: true,
    originalPdfIncluded: false,
  };
}
