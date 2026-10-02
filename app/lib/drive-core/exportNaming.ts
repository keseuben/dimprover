export function normalizeDriveExportAlias(value: unknown, maxLength = 30) {
  const source = typeof value === "string" ? value.trim() : "";
  const ascii = source
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, Math.max(1, Math.min(40, maxLength)))
    .replace(/[-_]+$/g, "");
  return ascii || "document";
}
