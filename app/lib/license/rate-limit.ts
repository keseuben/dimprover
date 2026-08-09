type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type LicenseRateLimitStore = {
  buckets: Map<string, RateLimitBucket>;
};

const globalLicenseRateLimitStore = globalThis as typeof globalThis & {
  dimproLicenseRateLimitStore?: LicenseRateLimitStore;
};

function getStore() {
  if (!globalLicenseRateLimitStore.dimproLicenseRateLimitStore) {
    globalLicenseRateLimitStore.dimproLicenseRateLimitStore = {
      buckets: new Map<string, RateLimitBucket>(),
    };
  }
  return globalLicenseRateLimitStore.dimproLicenseRateLimitStore;
}

export function checkLicenseRateLimit(
  key: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();
  const store = getStore();
  const existing = store.buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    store.buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(limit - 1, 0), resetAt: now + windowMs };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  store.buckets.set(key, existing);
  return {
    allowed: true,
    remaining: Math.max(limit - existing.count, 0),
    resetAt: existing.resetAt,
  };
}

export function getRateLimitRetryAfterSeconds(resetAt: number) {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}
