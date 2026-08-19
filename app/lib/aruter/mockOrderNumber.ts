function compactUtcStamp(now: Date) {
  return now.toISOString().replace(/\D/g, "").slice(2, 17);
}

function entropy() {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
    return cryptoObject.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  }
  return Math.random().toString(36).slice(2, 8).padEnd(6, "0").toUpperCase();
}

/**
 * Mock/demo-only order number. It intentionally includes time + entropy so a
 * Next/browser process restart cannot reuse an already mirrored Commerce order number.
 * Production/database numbering must use its own durable sequence.
 */
export function createMockAruterOrderNumber(orderCount: number, now = new Date()) {
  const sequence = String(Math.max(1, Math.floor(orderCount) + 1)).padStart(4, "0");
  return `AR-${now.getUTCFullYear()}-${compactUtcStamp(now)}-${sequence}-${entropy()}`;
}
