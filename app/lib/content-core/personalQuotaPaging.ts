/**
 * Legacy USER quota reader for deployments without the v011 aggregate RPC.
 *
 * Supabase/PostgREST may return at most 1,000 rows per request; a single
 * SELECT without pagination undercounts users with many uploaded photos.
 * Keyset pages avoid offset shifts after concurrent ref inserts/deletes.
 *
 * The SQL USER-ref insert RPC remains the authoritative atomic quota guard;
 * this page scan provides a complete fail-closed display/preflight estimate.
 */
export const PERSONAL_QUOTA_REF_PAGE_SIZE = 500;
export const PERSONAL_QUOTA_OBJECT_BATCH_SIZE = 100;
export const PERSONAL_QUOTA_MAX_REFS_TO_SCAN = 100_000;

export type QuotaRefPageRow = { id: string; content_object_id: string };
export type QuotaObjectRow = { id: string; size_bytes: number | string; status: string };

export async function collectPersonalQuotaUsedBytes(input: {
  readRefPage: (beforeId: string | null, limit: number) => Promise<QuotaRefPageRow[]>;
  readObjectBatch: (ids: string[]) => Promise<QuotaObjectRow[]>;
  pageSize?: number;
  objectBatchSize?: number;
  maxRefs?: number;
}): Promise<{ usedBytes: number; countedRefs: number; distinctObjects: number }> {
  const pageSize = input.pageSize ?? PERSONAL_QUOTA_REF_PAGE_SIZE;
  const batchSize = input.objectBatchSize ?? PERSONAL_QUOTA_OBJECT_BATCH_SIZE;
  const maxRefs = input.maxRefs ?? PERSONAL_QUOTA_MAX_REFS_TO_SCAN;
  if (![pageSize, batchSize, maxRefs].every(value => Number.isSafeInteger(value) && value > 0)
    || pageSize > PERSONAL_QUOTA_REF_PAGE_SIZE
    || batchSize > PERSONAL_QUOTA_OBJECT_BATCH_SIZE) {
    throw new Error("PERSONAL_QUOTA_PAGING_CONFIG_INVALID");
  }
  const objectIds = new Set<string>();
  let before: string | null = null;
  let countedRefs = 0;

  while (true) {
    const page = await input.readRefPage(before, pageSize);
    if (!Array.isArray(page) || page.length > pageSize) {
      throw new Error("PERSONAL_QUOTA_REF_PAGE_INVALID");
    }
    let previous: string | null = before;
    for (const ref of page) {
      const id = typeof ref?.id === "string" ? ref.id.toLowerCase() : "";
      const objectId = typeof ref?.content_object_id === "string"
        ? ref.content_object_id.toLowerCase() : "";
      if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9-]{36}$/.test(objectId)
        || (previous !== null && id >= previous)) {
        throw new Error("PERSONAL_QUOTA_REF_ORDER_INVALID");
      }
      objectIds.add(objectId);
      previous = id;
    }
    countedRefs += page.length;
    if (countedRefs > maxRefs) throw new Error("PERSONAL_QUOTA_TOO_MANY_REFS");
    if (page.length < pageSize) break;
    before = previous;
    if (!before) throw new Error("PERSONAL_QUOTA_CURSOR_INVALID");
  }

  const ids = [...objectIds];
  let usedBytes = 0;
  for (let start = 0; start < ids.length; start += batchSize) {
    const batch = ids.slice(start, start + batchSize);
    const objects = await input.readObjectBatch(batch);
    if (!Array.isArray(objects) || objects.length > batch.length) {
      throw new Error("PERSONAL_QUOTA_OBJECT_BATCH_INVALID");
    }
    const seen = new Set<string>();
    for (const object of objects) {
      const id = typeof object?.id === "string" ? object.id.toLowerCase() : "";
      const size = typeof object?.size_bytes === "string"
        && /^[0-9]+$/.test(object.size_bytes) ? Number(object.size_bytes) : object?.size_bytes;
      if (!batch.includes(id) || seen.has(id) || !["ACTIVE", "DELETING", "DELETED"].includes(object.status)
        || typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) {
        throw new Error("PERSONAL_QUOTA_OBJECT_INVALID");
      }
      seen.add(id);
      // Keep parity with the authoritative SQL: only ACTIVE content
      // objects retain quota, even if an old reference still exists.
      if (object.status === "ACTIVE") {
        usedBytes += size;
        if (!Number.isSafeInteger(usedBytes)) throw new Error("PERSONAL_QUOTA_SUM_OVERFLOW");
      }
    }
    if (seen.size !== batch.length) {
      // A truncated/missing DB object result must never understate usage.
      throw new Error("PERSONAL_QUOTA_OBJECT_BATCH_INCOMPLETE");
    }
  }
  return { usedBytes, countedRefs, distinctObjects: objectIds.size };
}
