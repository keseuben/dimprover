/**
 * Single source of truth for USER quota display and fail-closed RPC output.
 * The SQL summary returns already deduplicated content bytes and separate
 * reserved multipart bytes; callers must never double count either.
 */
export type PersonalQuotaTotals = {
  quotaBytes: number;
  usedBytes: number;
  reservedBytes: number;
  occupiedBytes: number;
  remainingBytes: number;
  hardLimit: boolean;
  source: "PERSONAL_DEFAULT" | "PLAN" | "OVERRIDE";
  usagePercent: number;
};

function safeNonnegativeInteger(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("PERSONAL_QUOTA_SUMMARY_INVALID_" + key);
  }
  return value;
}

export function parsePersonalQuotaSummary(value: unknown): PersonalQuotaTotals {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("PERSONAL_QUOTA_SUMMARY_NOT_OBJECT");
  }
  const row = value as Record<string, unknown>;
  const quotaBytes = safeNonnegativeInteger(row.quotaBytes, "QUOTA");
  if (quotaBytes < 1) throw new Error("PERSONAL_QUOTA_SUMMARY_QUOTA_EMPTY");
  const usedBytes = safeNonnegativeInteger(row.usedBytes, "USED");
  const reservedBytes = safeNonnegativeInteger(row.reservedBytes, "RESERVED");
  const occupiedBytes = safeNonnegativeInteger(row.occupiedBytes, "OCCUPIED");
  const remainingBytes = safeNonnegativeInteger(row.remainingBytes, "REMAINING");
  if (!Number.isSafeInteger(usedBytes + reservedBytes)
    || occupiedBytes !== usedBytes + reservedBytes
    || remainingBytes !== Math.max(0, quotaBytes - occupiedBytes)
    || typeof row.hardLimit !== "boolean") {
    throw new Error("PERSONAL_QUOTA_SUMMARY_MISMATCH");
  }
  const source = row.source === "PLAN" ? "PLAN"
    : row.source === "OVERRIDE" ? "OVERRIDE"
      : row.source === "DEFAULT" ? "PERSONAL_DEFAULT" : null;
  if (!source) throw new Error("PERSONAL_QUOTA_SUMMARY_SOURCE_INVALID");
  return {
    quotaBytes, usedBytes, reservedBytes, occupiedBytes, remainingBytes,
    hardLimit: row.hardLimit, source,
    usagePercent: Math.min(100, occupiedBytes / quotaBytes * 100),
  };
}

export function quotaOccupiedLabel(input: { usedBytes: number; reservedBytes: number }) {
  const occupied = input.usedBytes + input.reservedBytes;
  if (!Number.isSafeInteger(occupied) || occupied < 0) {
    throw new Error("PERSONAL_QUOTA_OVERFLOW");
  }
  return { occupied, hasReservations: input.reservedBytes > 0 };
}
