import type { ProductIdentifier, ProductIdentifierType } from "./types";

export const IDENTIFIER_PRIORITY: Record<ProductIdentifierType, number> = {
  EAN_GTIN: 1,
  DIMPRO_QR: 2,
  DIMPRO_BARCODE: 3,
  SKU: 4,
  SUPPLIER_SKU: 4,
};

function normalizeCompact(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function normalizeProductIdentifier(type: ProductIdentifierType, value: string) {
  if (type === "EAN_GTIN") return value.replace(/[\s-]/g, "");
  return normalizeCompact(value);
}

export function isValidGtin(value: string) {
  const digits = value.replace(/[\s-]/g, "");
  if (![8, 12, 13, 14].includes(digits.length) || !/^\d+$/.test(digits)) return false;
  const numbers = [...digits].map(Number);
  const expected = numbers.pop();
  if (expected == null) return false;
  const sum = numbers
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  const check = (10 - (sum % 10)) % 10;
  return check === expected;
}

export function validateProductIdentifier(type: ProductIdentifierType, value: string) {
  const normalized = normalizeProductIdentifier(type, value);
  if (!normalized) return { ok: false as const, normalized, reason: "EMPTY_IDENTIFIER" };
  if (type === "EAN_GTIN" && !isValidGtin(normalized)) {
    return { ok: false as const, normalized, reason: "INVALID_GTIN" };
  }
  return { ok: true as const, normalized };
}

export function resolveIdentifier(code: string, identifiers: ProductIdentifier[]) {
  const candidates = identifiers
    .map((identifier) => ({ identifier, normalized: normalizeProductIdentifier(identifier.type, code) }))
    .filter(({ identifier, normalized }) => normalized === identifier.normalizedValue)
    .sort((a, b) => IDENTIFIER_PRIORITY[a.identifier.type] - IDENTIFIER_PRIORITY[b.identifier.type]);
  return candidates[0]?.identifier ?? null;
}
