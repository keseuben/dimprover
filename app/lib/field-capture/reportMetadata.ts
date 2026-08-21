"use client";

export const FIELD_CAPTURE_SURVEY_NATURES = [
  "Teljes körű",
  "Részleges",
  "Mintavételes / szemrevételezéses",
  "Kooperáció előkészítő fotódokumentáció",
  "Célzott munkaterületi ellenőrzés",
] as const;

export type FieldCaptureSurveyNature = (typeof FIELD_CAPTURE_SURVEY_NATURES)[number];

export type FieldCaptureReportMetadata = {
  reportTitle: string;
  surveyNature: FieldCaptureSurveyNature;
  coveragePercent: number;
};

export const DEFAULT_FIELD_CAPTURE_REPORT_METADATA: FieldCaptureReportMetadata = {
  reportTitle: "Terepi összesítő",
  surveyNature: "Részleges",
  coveragePercent: 30,
};

const REPORT_METADATA_PREFIX = "dimpro.fieldCapture.reportMetadata.v1.";

function key(sessionId: string) {
  return `${REPORT_METADATA_PREFIX}${sessionId}`;
}

function normalizeCoverage(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_FIELD_CAPTURE_REPORT_METADATA.coveragePercent;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

export function normalizeFieldCaptureReportMetadata(value: Partial<FieldCaptureReportMetadata> | null | undefined): FieldCaptureReportMetadata {
  const surveyNature = FIELD_CAPTURE_SURVEY_NATURES.includes(value?.surveyNature as FieldCaptureSurveyNature)
    ? value!.surveyNature as FieldCaptureSurveyNature
    : DEFAULT_FIELD_CAPTURE_REPORT_METADATA.surveyNature;
  const reportTitle = typeof value?.reportTitle === "string" && value.reportTitle.trim()
    ? value.reportTitle.trim().slice(0, 120)
    : DEFAULT_FIELD_CAPTURE_REPORT_METADATA.reportTitle;
  return {
    reportTitle,
    surveyNature,
    coveragePercent: normalizeCoverage(value?.coveragePercent),
  };
}

export function loadFieldCaptureReportMetadata(sessionId: string | null | undefined) {
  if (typeof window === "undefined" || !sessionId) return { ...DEFAULT_FIELD_CAPTURE_REPORT_METADATA };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key(sessionId)) || "null") as Partial<FieldCaptureReportMetadata> | null;
    return normalizeFieldCaptureReportMetadata(parsed);
  } catch {
    return { ...DEFAULT_FIELD_CAPTURE_REPORT_METADATA };
  }
}

export function saveFieldCaptureReportMetadata(sessionId: string | null | undefined, value: FieldCaptureReportMetadata) {
  const normalized = normalizeFieldCaptureReportMetadata(value);
  if (typeof window !== "undefined" && sessionId) {
    window.localStorage.setItem(key(sessionId), JSON.stringify(normalized));
  }
  return normalized;
}
