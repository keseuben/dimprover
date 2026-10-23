/**
 * Client-only, no-content upload receipt recovery.
 *
 * The server returns a stable per-user opaque scope. This store is NOT an
 * authentication or upload source of truth and never confers access to files.
 * No filenames, emails, access tokens, presigned URLs, folder paths or
 * document content may be serialized.
 *
 * A persisted request ID means MAY HAVE BEEN SENT, not success/failure;
 * recovery can perform only a manual owner-scoped GET confirmation.
 */
export const PERSONAL_RECEIPT_STORAGE_VERSION = 1;
export const PERSONAL_RECEIPT_STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PERSONAL_RECEIPT_STORAGE_MAX = 500;
const STORAGE_PREFIX = "dimpro-drive-personal-upload-receipts-v1:";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE_RE = /^[a-f0-9]{64}$/;

export type PersonalReceiptRecord = {
  requestId: string;
  sizeBytes: number;
  startedAt: number;
};
type StoredReceipts = {
  version: 1;
  scope: string;
  records: PersonalReceiptRecord[];
};
type MinimalStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function personalReceiptStorageKey(scope: string): string | null {
  return SCOPE_RE.test(scope) ? STORAGE_PREFIX + scope : null;
}

function validReceipt(record: unknown, now: number): record is PersonalReceiptRecord {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  const row = record as Record<string, unknown>;
  return Object.keys(row).length === 3
    && typeof row.requestId === "string" && UUID_RE.test(row.requestId)
    && Number.isSafeInteger(row.sizeBytes) && Number(row.sizeBytes) > 0
    && Number(row.sizeBytes) <= 100 * 1024 * 1024
    && Number.isSafeInteger(row.startedAt)
    && Number(row.startedAt) <= now
    && Number(row.startedAt) >= now - PERSONAL_RECEIPT_STORAGE_TTL_MS;
}

export function loadPersonalReceipts(storage: MinimalStorage, scope: string, now: number): PersonalReceiptRecord[] {
  const key = personalReceiptStorageKey(scope);
  if (!key || !Number.isSafeInteger(now) || now <= 0) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw || raw.length > 90_000) return [];
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const parsed = value as Partial<StoredReceipts>;
    if (parsed.version !== 1 || parsed.scope !== scope || !Array.isArray(parsed.records)
      || parsed.records.length > PERSONAL_RECEIPT_STORAGE_MAX) return [];
    const seen = new Set<string>();
    const receipts: PersonalReceiptRecord[] = [];
    for (const record of parsed.records) {
      if (!validReceipt(record, now)) continue;
      const requestId = record.requestId.toLowerCase();
      if (seen.has(requestId)) continue;
      seen.add(requestId);
      receipts.push({ requestId, sizeBytes: record.sizeBytes, startedAt: record.startedAt });
    }
    return receipts.sort((a, b) => a.startedAt - b.startedAt);
  } catch {
    return [];
  }
}

/** Remove expired/invalid hints when the authenticated user opens the Drive.
 * This only clears local browser metadata, never a remote file or DB row.
 */
export function prunePersonalReceipts(
  storage: MinimalStorage, scope: string, now: number,
): PersonalReceiptRecord[] {
  const key = personalReceiptStorageKey(scope);
  if (!key) return [];
  const records = loadPersonalReceipts(storage, scope, now);
  try {
    if (!records.length) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({
      version: 1, scope, records,
    } satisfies StoredReceipts));
  } catch { /* read-only recovery may still be possible when writes are blocked */ }
  return records;
}

/** Saves ONLY the allowlisted three fields, even if the caller passes more. */
export function addPersonalReceipt(
  storage: MinimalStorage, scope: string, record: PersonalReceiptRecord, now: number,
): boolean {
  const key = personalReceiptStorageKey(scope);
  if (!key || !validReceipt(record, now)) return false;
  try {
    const prior = loadPersonalReceipts(storage, scope, now)
      .filter(entry => entry.requestId !== record.requestId.toLowerCase());
    // Never discard an unresolved receipt silently to make room for a new one.
    if (prior.length >= PERSONAL_RECEIPT_STORAGE_MAX) return false;
    const records = [...prior, {
      requestId: record.requestId.toLowerCase(), sizeBytes: record.sizeBytes,
      startedAt: record.startedAt,
    }];
    storage.setItem(key, JSON.stringify({
      version: 1, scope, records,
    } satisfies StoredReceipts));
    return true;
  } catch { return false; }
}

/** A successful ACK or definitely unsent failure may remove this local hint. */
export function dropPersonalReceipt(
  storage: MinimalStorage, scope: string, requestId: string, now: number,
): boolean {
  const key = personalReceiptStorageKey(scope);
  if (!key || !UUID_RE.test(requestId)) return false;
  try {
    const records = loadPersonalReceipts(storage, scope, now)
      .filter(row => row.requestId !== requestId.toLowerCase());
    if (records.length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ version: 1, scope, records } satisfies StoredReceipts));
    return true;
  } catch { return false; }
}
