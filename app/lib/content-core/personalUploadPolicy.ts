/**
 * Personal Drive browser uploads are a separate explicitly gated capability.
 * Source-only until scanner, DB atomics, CSRF, S3 and browser E2E pass on DEV.
 */
/** One browser selection, NOT one server-side multipart request. Files are sent individually. */
export const PERSONAL_UPLOAD_MAX_FILES_PER_SELECTION = 500;
export function isPersonalUploadSelectionAllowed(count: number): boolean {
  return Number.isSafeInteger(count) && count >= 1 && count <= PERSONAL_UPLOAD_MAX_FILES_PER_SELECTION;
}
export const PERSONAL_UPLOAD_MAX_BYTES = 16 * 1024 * 1024;
export const PERSONAL_UPLOAD_REQUEST_OVERHEAD_BYTES = 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function personalUploadFeatureEnabled(env: Record<string, string | undefined>): boolean {
  return env.DIMPRO_DRIVE_PERSONAL_UPLOAD_ENABLED === "true"
    && env.DIMPRO_PRODUCTION_ACCESS === "DENY"
    && env.DIMPRO_AUTH_ENVIRONMENT === "DEV";
}

export function normalizePersonalUploadFileName(name: unknown): string {
  const value = typeof name === "string" ? name.trim() : "";
  if (!value || value.length > 180 || value === "." || value === ".."
    || /[\/\\\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("PERSONAL_UPLOAD_FILENAME_INVALID");
  }
  return value;
}

export function validPersonalUploadRequestId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function personalUploadEffectiveMaxBytes(scanLimitBytes: number, storageMaxBytes: number): number {
  return Math.max(0, Math.min(PERSONAL_UPLOAD_MAX_BYTES, scanLimitBytes, storageMaxBytes));
}

export function isPersonalUploadSafeToParse(bodyLength: number | null, maxBytes: number): boolean {
  return Number.isSafeInteger(bodyLength) && bodyLength !== null && bodyLength > 0
    && bodyLength <= maxBytes + PERSONAL_UPLOAD_REQUEST_OVERHEAD_BYTES;
}
