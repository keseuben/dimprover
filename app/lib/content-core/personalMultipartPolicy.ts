/**
 * Personal Drive multipart policy V0.9.57.
 * Source-only contract: an accepted S3 multipart upload is NOT a clean file.
 * Independently gated from the currently deployed <=100 MiB upload route.
 */
// Keep the 100 MiB lower boundary aligned with personalUploadPolicy.ts.
// Avoid importing server-side configuration into this pure protocol module.
const PERSONAL_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

export const PERSONAL_MULTIPART_MAX_BYTES = 5 * 1024 ** 3;
export const PERSONAL_MULTIPART_DEFAULT_CHUNK_BYTES = 64 * 1024 ** 2;
export const PERSONAL_MULTIPART_MIN_CHUNK_BYTES = 5 * 1024 ** 2;
export const PERSONAL_MULTIPART_MAX_CHUNK_BYTES = 512 * 1024 ** 2;
export const PERSONAL_MULTIPART_MAX_PARTS = 10_000;
export const PERSONAL_MULTIPART_SESSION_TTL_MS = 24 * 60 * 60_000;

export type PersonalMultipartStatus =
  | "INITIATED" | "UPLOADING" | "QUARANTINED" | "SCANNING"
  | "CLEAN" | "REJECTED" | "ABORTED" | "EXPIRED";

export type PersonalMultipartPart = {
  partNumber: number;
  sizeBytes: number;
  etag: string;
  sha256: string;
};

/** This is a second independent flag, not an implicit increase in scanner authority. */
export function personalMultipartFeatureEnabled(env: Record<string, string | undefined>) {
  return env.DIMPRO_DRIVE_PERSONAL_UPLOAD_ENABLED === "true"
    && env.DIMPRO_PRODUCTION_ACCESS === "DENY"
    && env.DIMPRO_AUTH_ENVIRONMENT === "DEV"
    && env.DIMPRO_DRIVE_PERSONAL_MULTIPART_ENABLED === "true";
}

export function planPersonalMultipart(sizeBytes: number, chunkBytes = PERSONAL_MULTIPART_DEFAULT_CHUNK_BYTES) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= PERSONAL_UPLOAD_MAX_BYTES
    || sizeBytes > PERSONAL_MULTIPART_MAX_BYTES) {
    throw new Error("PERSONAL_MULTIPART_SIZE_OUT_OF_RANGE");
  }
  if (!Number.isSafeInteger(chunkBytes)
    || chunkBytes < PERSONAL_MULTIPART_MIN_CHUNK_BYTES
    || chunkBytes > PERSONAL_MULTIPART_MAX_CHUNK_BYTES) {
    throw new Error("PERSONAL_MULTIPART_CHUNK_INVALID");
  }
  const totalParts = Math.ceil(sizeBytes / chunkBytes);
  if (totalParts < 1 || totalParts > PERSONAL_MULTIPART_MAX_PARTS) {
    throw new Error("PERSONAL_MULTIPART_TOO_MANY_PARTS");
  }
  return { sizeBytes, chunkSizeBytes: chunkBytes, totalParts,
    expiresAfterMs: PERSONAL_MULTIPART_SESSION_TTL_MS };
}

export function personalMultipartExpectedPartSize(plan: { sizeBytes: number; chunkSizeBytes: number; totalParts: number },
  partNumber: number) {
  if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > plan.totalParts) {
    throw new Error("PERSONAL_MULTIPART_PART_INVALID");
  }
  const remaining = plan.sizeBytes - (partNumber - 1) * plan.chunkSizeBytes;
  return Math.min(plan.chunkSizeBytes, remaining);
}

export function validatePersonalMultipartParts(plan: { sizeBytes: number; chunkSizeBytes: number; totalParts: number },
  parts: readonly PersonalMultipartPart[]) {
  if (!Array.isArray(parts) || parts.length !== plan.totalParts) {
    throw new Error("PERSONAL_MULTIPART_PARTS_INCOMPLETE");
  }
  const seen = new Set<number>();
  let total = 0;
  for (const part of parts) {
    if (!Number.isSafeInteger(part.partNumber) || seen.has(part.partNumber)
      || part.partNumber < 1 || part.partNumber > plan.totalParts
      || !/^[a-f0-9]{64}$/i.test(part.sha256)
      || !/^[a-f0-9-]{16,128}$/i.test(part.etag)
      || part.sizeBytes !== personalMultipartExpectedPartSize(plan, part.partNumber)) {
      throw new Error("PERSONAL_MULTIPART_PART_INVALID");
    }
    seen.add(part.partNumber);
    total += part.sizeBytes;
  }
  if (total !== plan.sizeBytes) throw new Error("PERSONAL_MULTIPART_SIZE_MISMATCH");
  return [...parts].sort((a, b) => a.partNumber - b.partNumber);
}

/**
 * Only a verified whole-object digest AND full-file malware scan may release
 * quarantine. Neither part ETags, part SHA values nor successful S3 completion
 * prove malware safety.
 */
export function personalMultipartMayBecomeClean(input: {
  currentStatus: PersonalMultipartStatus;
  expectedSha256: string;
  actualSha256: string;
  sizeMatches: boolean;
  fullFileScanStatus: "CLEAN" | "INFECTED" | "ERROR" | "NOT_SCANNED";
}) {
  return input.currentStatus === "SCANNING"
    && /^[a-f0-9]{64}$/i.test(input.expectedSha256)
    && input.expectedSha256.toLowerCase() === input.actualSha256.toLowerCase()
    && input.sizeMatches
    && input.fullFileScanStatus === "CLEAN";
}

export function canAbortPersonalMultipart(status: PersonalMultipartStatus) {
  return status === "INITIATED" || status === "UPLOADING";
}
