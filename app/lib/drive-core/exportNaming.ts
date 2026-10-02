function transliterateDriveExportValue(value: unknown) {
  return (typeof value === "string" ? value : String(value ?? ""))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeDriveExportAlias(value: unknown, maxLength = 30) {
  const source = typeof value === "string" ? value.trim() : "";
  const ascii = transliterateDriveExportValue(source)
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, Math.max(1, Math.min(40, maxLength)))
    .replace(/[-_]+$/g, "");
  return ascii || "document";
}

export function normalizeDriveExportToken(value: unknown, fallback: string, maxLength = 24) {
  const token = transliterateDriveExportValue(value)
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, Math.max(1, Math.min(40, maxLength)))
    .replace(/[-_]+$/g, "");
  return token || fallback;
}

export function normalizeDriveExportStatusCode(value: unknown) {
  return normalizeDriveExportToken(value, "NA", 12).toUpperCase();
}

function exportCounter(value: unknown) {
  const number = Number(value);
  const normalized = Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
  return String(normalized).padStart(2, "0");
}

function exportExtension(value: unknown) {
  return normalizeDriveExportToken(value, "bin", 16).toLowerCase();
}

export function buildDriveExportFileName(input: {
  planNo?: string | null;
  exportAlias?: string | null;
  documentName?: string | null;
  versionNumber?: number | null;
  revisionNumber?: number | null;
  statusCode?: string | null;
  extension?: string | null;
}) {
  const planNo = normalizeDriveExportToken(input.planNo, "DOK", 30);
  const alias = normalizeDriveExportAlias(input.exportAlias || input.documentName || "document", 30);
  const version = exportCounter(input.versionNumber);
  const revision = exportCounter(input.revisionNumber);
  const status = normalizeDriveExportStatusCode(input.statusCode);
  const extension = exportExtension(input.extension);
  return planNo + "_" + alias + "_V" + version + "_R" + revision + "_" + status + "." + extension;
}
