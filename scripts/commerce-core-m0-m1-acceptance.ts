import fs from "node:fs";
import assert from "node:assert/strict";
import { addDecimal, normalizeDecimal, subtractDecimal } from "../app/lib/commerce/core/decimal";
import { calculateInventoryQuantities } from "../app/lib/commerce/inventory/math";
import { isValidGtin, normalizeProductIdentifier, resolveIdentifier } from "../app/lib/commerce/product/identifier";
import type { ProductIdentifier } from "../app/lib/commerce/product/types";
import { resolveCommercePermissions } from "../app/lib/commerce/core/permissions";

const results: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, fn: () => void) {
  try { fn(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) }); }
}
function throws(fn: () => unknown) { assert.throws(fn); }

check("01 decimal subtraction is exact", () => assert.equal(subtractDecimal("12.5", "2.25"), "10.25"));
check("02 decimal addition keeps fractional quantity", () => assert.equal(addDecimal("0.001", "0.009"), "0.01"));
check("03 decimal normalization avoids float storage", () => assert.equal(normalizeDecimal("0012.340000"), "12.34"));
check("04 excessive quantity precision is rejected", () => throws(() => normalizeDecimal("1.0000001")));
check("05 inventory available = physical - reserved", () => assert.deepEqual(calculateInventoryQuantities({ physicalQuantity: "12", reservedQuantity: "3.5", incomingQuantity: "4" }), { physicalQuantity: "12", reservedQuantity: "3.5", availableQuantity: "8.5", incomingQuantity: "4" }));
check("06 negative physical inventory is rejected", () => throws(() => calculateInventoryQuantities({ physicalQuantity: "-1", reservedQuantity: "0" })));
check("07 reservation above physical is rejected by default", () => throws(() => calculateInventoryQuantities({ physicalQuantity: "2", reservedQuantity: "3" })));
check("08 negative available may be policy-enabled", () => assert.equal(calculateInventoryQuantities({ physicalQuantity: "2", reservedQuantity: "3", allowNegativeAvailable: true }).availableQuantity, "-1"));
check("09 known EAN-13 passes check digit validation", () => assert.equal(isValidGtin("4006381333931"), true));
check("10 invalid EAN-13 fails check digit validation", () => assert.equal(isValidGtin("4006381333932"), false));
check("11 EAN normalization strips spaces and dashes", () => assert.equal(normalizeProductIdentifier("EAN_GTIN", "400-6381 333931"), "4006381333931"));
check("12 DIMPRO QR normalization is compact uppercase", () => assert.equal(normalizeProductIdentifier("DIMPRO_QR", " dimpro: abc 123 "), "DIMPRO:ABC123"));
const now = "2026-08-18T00:00:00.000Z";
const identifiers: ProductIdentifier[] = [
  { id: "qr", organizationId: "o1", productId: "p2", type: "DIMPRO_QR", value: "4006381333931", normalizedValue: "4006381333931", primary: true, createdAt: now, updatedAt: now },
  { id: "ean", organizationId: "o1", productId: "p1", type: "EAN_GTIN", value: "4006381333931", normalizedValue: "4006381333931", primary: true, createdAt: now, updatedAt: now },
];
check("13 identifier resolver follows EAN before DIMPRO QR", () => assert.equal(resolveIdentifier("4006381333931", identifiers)?.id, "ean"));
const sql = fs.readFileSync("supabase/DIMPRO_COMMERCE_CORE_M0_M1_BOOTSTRAP.sql", "utf8");
check("14 schema is organization-scoped", () => assert.ok((sql.match(/organization_id uuid not null/g) || []).length >= 12));
check("15 schema contains tenant RLS policy", () => assert.ok(sql.includes("dimpro_is_organization_member(organization_id)")));
check("16 stock ledger is idempotent per organization", () => assert.ok(sql.includes("unique (organization_id, idempotency_key)")));
check("17 balance exposes generated available quantity", () => assert.ok(sql.includes("available_quantity numeric(20,6) generated always as (physical_quantity - reserved_quantity) stored")));
check("18 legacy product stock_quantity is not used by Commerce Core", () => assert.equal(sql.includes("stock_quantity"), false));
check("19 unknown organization role fails closed to context-only", () => assert.deepEqual(resolveCommercePermissions("UNMAPPED_ROLE"), ["commerce.context.read"]));
check("20 admin role can adjust inventory", () => assert.ok(resolveCommercePermissions("ADMIN").includes("commerce.inventory.adjust")));
check("21 manager role cannot adjust inventory", () => assert.equal(resolveCommercePermissions("MANAGER").includes("commerce.inventory.adjust"), false));
const failed = results.filter((item) => !item.ok);
for (const item of results) console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}${item.detail ? ` :: ${item.detail}` : ""}`);
console.log(`RESULT ${results.length - failed.length}/${results.length} PASS`);
if (failed.length) throw new Error(`${failed.length} acceptance checks failed`);
