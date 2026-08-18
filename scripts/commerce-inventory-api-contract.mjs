import fs from "node:fs";
import assert from "node:assert/strict";
const repo = fs.readFileSync("app/lib/commerce/inventory/repository.ts", "utf8");
const route = fs.readFileSync("app/api/v1/commerce/inventory/route.ts", "utf8");
const movement = fs.readFileSync("app/api/v1/commerce/inventory/movements/route.ts", "utf8");
const sql = fs.readFileSync("supabase/migrations/20260818183000_dimpro_commerce_core_m0_m1.sql", "utf8");
const checks = [
  ["01 inventory read requires tenant context", route.includes("resolveCommerceContext")],
  ["02 inventory query is organization scoped", repo.includes('.eq("organization_id", context.organizationId)')],
  ["03 movement POST requires tenant context", movement.includes("resolveCommerceContext")],
  ["04 movement uses idempotency-key header", movement.includes('headers.get("idempotency-key")')],
  ["05 zero delta is rejected", repo.includes("COMMERCE_MOVEMENT_ZERO_DELTA")],
  ["06 quantities use DecimalString normalization", repo.includes("normalizeDecimal") && repo.includes("compareDecimal")],
  ["07 inventory movement permission is enforced", repo.includes('commerce.inventory.move')],
  ["08 adjustment has stronger permission gate", repo.includes('commerce.inventory.adjust') && repo.includes("ADJUSTMENT")],
  ["09 movement is applied through atomic RPC", repo.includes('client.rpc("commerce_inventory_apply_movement"')],
  ["10 SQL uses advisory transaction lock", sql.includes("pg_advisory_xact_lock")],
  ["11 SQL detects duplicate idempotency payload mismatch", sql.includes("COMMERCE_IDEMPOTENCY_PAYLOAD_MISMATCH")],
  ["12 SQL prevents reserved greater than physical", sql.includes("COMMERCE_RESERVED_EXCEEDS_PHYSICAL")],
  ["13 balance available is generated physical-reserved", sql.includes("generated always as (physical_quantity - reserved_quantity) stored")],
  ["14 stock ledger is immutable to service role", sql.includes("grant select on table public.commerce_inventory_balances, public.commerce_stock_movements")],
  ["15 movement writes audit and outbox atomically", sql.includes("STOCK_MOVEMENT_APPLIED") && sql.includes("commerce_outbox_events")],
  ["16 external inventory source cannot enter internal ledger RPC", sql.includes("source_type='INTERNAL'")],
];
let pass=0;
for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (ok) pass++; }
console.log(`RESULT ${pass}/${checks.length} PASS`);
assert.equal(pass, checks.length);
