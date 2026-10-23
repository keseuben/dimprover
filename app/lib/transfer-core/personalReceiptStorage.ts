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
export const PERSONAL_RECEIPT_STORAGE_VERSION = 2;
export const PERSONAL_RECEIPT_STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PERSONAL_RECEIPT_STORAGE_MAX = 500;
const STORAGE_PREFIX = "dimpro-drive-personal-upload-receipt-v2:";
const LEGACY_PREFIX = "dimpro-drive-personal-upload-receipts-v1:";
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
type Entry = PersonalReceiptRecord & { version: 2 };
type MinimalStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

export function personalReceiptStorageKey(scope: string): string | null {
  return SCOPE_RE.test(scope) ? STORAGE_PREFIX + scope + ":" : null;
}

function validReceipt(record: unknown, now: number): record is PersonalReceiptRecord {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  const row = record as Record<string, unknown>;
  return typeof row.requestId === "string" && UUID_RE.test(row.requestId)
    && Number.isSafeInteger(row.sizeBytes) && Number(row.sizeBytes) > 0
    && Number(row.sizeBytes) <= 100 * 1024 * 1024
    && Number.isSafeInteger(row.startedAt)
    && Number(row.startedAt) <= now
    && Number(row.startedAt) >= now - PERSONAL_RECEIPT_STORAGE_TTL_MS;
}

/**
 * A tab may write only its own receipt key. This guarantees that an update to
 * upload A never rewrites the stored state of upload B (even across tabs).
 */
function itemKey(scope: string, requestId: string): string | null {
  const prefix = personalReceiptStorageKey(scope);
  return prefix && UUID_RE.test(requestId) ? prefix + requestId.toLowerCase() : null;
}

function legacyRecords(storage: MinimalStorage, scope: string, now: number): PersonalReceiptRecord[] {
  const raw = storage.getItem(LEGACY_PREFIX + scope);
  if (raw === null) return [];
  if (raw.length > 90_000) throw new Error("PERSONAL_RECEIPT_LEGACY_OVERSIZE");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("PERSONAL_RECEIPT_LEGACY_INVALID");
  }
  const value = parsed as Partial<StoredReceipts>;
  if (value.version !== 1 || value.scope !== scope || !Array.isArray(value.records)
    || value.records.length > PERSONAL_RECEIPT_STORAGE_MAX) {
    throw new Error("PERSONAL_RECEIPT_LEGACY_INVALID");
  }
  const result = new Map<string, PersonalReceiptRecord>();
  for (const record of value.records) {
    if (!validReceipt(record, now) || Object.keys(record).length !== 3) continue;
    result.set(record.requestId.toLowerCase(), {
      requestId: record.requestId.toLowerCase(), sizeBytes: record.sizeBytes,
      startedAt: record.startedAt,
    });
  }
  return [...result.values()];
}

function scan(storage: MinimalStorage, scope: string, now: number) {
  const prefix = personalReceiptStorageKey(scope);
  if (!prefix || !Number.isSafeInteger(storage.length) || storage.length > 25_000) {
    throw new Error("PERSONAL_RECEIPT_STORAGE_SCAN_UNAVAILABLE");
  }
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  if (keys.length > PERSONAL_RECEIPT_STORAGE_MAX + 100) {
    throw new Error("PERSONAL_RECEIPT_STORAGE_SCAN_LIMIT");
  }
  const records: PersonalReceiptRecord[] = [];
  const invalid: string[] = [];
  for (const key of keys) {
    const raw = storage.getItem(key);
    if (!raw || raw.length > 300) { invalid.push(key); continue; }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        invalid.push(key); continue;
      }
      const entry = parsed as Entry;
      if (entry.version !== 2 || Object.keys(entry).length !== 4
        || !validReceipt(entry, now) || itemKey(scope, entry.requestId) !== key) {
        invalid.push(key); continue;
      }
      records.push({
        requestId: entry.requestId.toLowerCase(),
        sizeBytes: entry.sizeBytes, startedAt: entry.startedAt,
      });
    } catch { invalid.push(key); }
  }
  return { records, invalid };
}

function readAll(storage: MinimalStorage, scope: string, now: number): PersonalReceiptRecord[] {
  const records = scan(storage, scope, now).records;
  const unique = new Map(records.map(row => [row.requestId, row]));
  for (const row of legacyRecords(storage, scope, now)) {
    const existing = unique.get(row.requestId);
    if (existing && (existing.sizeBytes !== row.sizeBytes
      || existing.startedAt !== row.startedAt)) {
      // Old/new values must never be silently reconciled when they disagree.
      throw new Error("PERSONAL_RECEIPT_MIGRATION_CONFLICT");
    }
    if (!existing) unique.set(row.requestId, row);
  }
  if (unique.size > PERSONAL_RECEIPT_STORAGE_MAX) {
    // Do not silently truncate unresolved receipts if two tabs hit the cap.
    throw new Error("PERSONAL_RECEIPT_CAPACITY_CONFLICT");
  }
  return [...unique.values()].sort((a, b) => a.startedAt - b.startedAt);
}

export function loadPersonalReceipts(
  storage: MinimalStorage, scope: string, now: number,
): PersonalReceiptRecord[] {
  if (!personalReceiptStorageKey(scope) || !Number.isSafeInteger(now) || now <= 0) return [];
  try { return readAll(storage, scope, now); } catch { return []; }
}

/**
 * Migrate V1 list only after every retained receipt has its own V2 key.
 * Never erase legacy hints on a storage quota failure or partial migration.
 */
export function prunePersonalReceipts(
  storage: MinimalStorage, scope: string, now: number,
): PersonalReceiptRecord[] {
  if (!personalReceiptStorageKey(scope) || !Number.isSafeInteger(now) || now <= 0) return [];
  try {
    const current = readAll(storage, scope, now);
    const before = scan(storage, scope, now);
    const old = legacyRecords(storage, scope, now);
    let migrated = true;
    const repairedKeys = new Set<string>();
    for (const row of old) {
      const key = itemKey(scope, row.requestId);
      if (!key) { migrated = false; break; }
      // A corrupt V2 entry with the same key is NOT a completed migration.
      // Restore it from validated V1 before old V1 metadata may be removed.
      const valid = before.records.find(item => item.requestId === row.requestId);
      if (valid) {
        if (valid.sizeBytes !== row.sizeBytes || valid.startedAt !== row.startedAt) {
          migrated = false; break;
        }
        continue;
      }
      const value = JSON.stringify({ version: 2, ...row } satisfies Entry);
      try {
        storage.setItem(key, value);
        if (storage.getItem(key) !== value) { migrated = false; break; }
        repairedKeys.add(key);
      } catch { migrated = false; break; }
    }
    if (migrated && storage.getItem(LEGACY_PREFIX + scope) !== null) {
      storage.removeItem(LEGACY_PREFIX + scope);
    }
    // Expired/malformed keys are local metadata only; no remote deletion.
    for (const key of before.invalid) {
      if (!repairedKeys.has(key)) storage.removeItem(key);
    }
    return current;
  } catch { return loadPersonalReceipts(storage, scope, now); }
}

/** Store before xhr.send(). A failed write means NO network upload. */
export function addPersonalReceipt(
  storage: MinimalStorage, scope: string, record: PersonalReceiptRecord, now: number,
): boolean {
  const key = itemKey(scope, record.requestId);
  if (!key || !validReceipt(record, now) || Object.keys(record).length !== 3) return false;
  let wroteNew = false;
  try {
    const current = readAll(storage, scope, now);
    const id = record.requestId.toLowerCase();
    const existing = current.find(row => row.requestId === id);
    if (existing) {
      return existing.sizeBytes === record.sizeBytes && existing.startedAt === record.startedAt;
    }
    if (current.length >= PERSONAL_RECEIPT_STORAGE_MAX || storage.getItem(key) !== null) return false;
    const value = JSON.stringify({
      version: 2, requestId: id, sizeBytes: record.sizeBytes, startedAt: record.startedAt,
    } satisfies Entry);
    storage.setItem(key, value);
    wroteNew = true;
    if (storage.getItem(key) !== value) {
      storage.removeItem(key);
      return false;
    }
    // Per-key writes prevent lost updates. Capacity checks are best-effort
    // under tabs racing at the limit; a race must not evict an older hint.
    readAll(storage, scope, now);
    return true;
  } catch {
    // A concurrent tab might have filled the 500 slots after our precheck.
    // Remove ONLY the entry we added; never erase another tab's receipts.
    if (wroteNew) {
      try { storage.removeItem(key); } catch { /* fail closed */ }
    }
    return false;
  }
}

/** Drop only this request. Never rewrite the V2 entries of other tabs. */
export function dropPersonalReceipt(
  storage: MinimalStorage, scope: string, requestId: string, now: number,
): boolean {
  const key = itemKey(scope, requestId);
  if (!key || !Number.isSafeInteger(now)) return false;
  try {
    storage.removeItem(key);
    const legacyKey = LEGACY_PREFIX + scope;
    if (storage.getItem(legacyKey) !== null) {
      const remaining = legacyRecords(storage, scope, now)
        .filter(row => row.requestId !== requestId.toLowerCase());
      if (!remaining.length) storage.removeItem(legacyKey);
      else storage.setItem(legacyKey, JSON.stringify({
        version: 1, scope, records: remaining,
      } satisfies StoredReceipts));
    }
    return true;
  } catch { return false; }
}
