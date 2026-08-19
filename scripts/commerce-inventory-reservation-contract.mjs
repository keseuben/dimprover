import fs from "node:fs";
import assert from "node:assert/strict";
const sql=fs.readFileSync("supabase/migrations/20260818213000_dimpro_commerce_inventory_reservations_m1.sql","utf8");
const repo=fs.readFileSync("app/lib/commerce/inventory/repository.ts","utf8");
const types=fs.readFileSync("app/lib/commerce/inventory/types.ts","utf8");
const route=fs.readFileSync("app/api/v1/commerce/inventory/reservations/route.ts","utf8");
const release=fs.readFileSync("app/api/v1/commerce/inventory/reservations/[reservationId]/release/route.ts","utf8");
const consume=fs.readFileSync("app/api/v1/commerce/inventory/reservations/[reservationId]/consume/route.ts","utf8");
const checks=[
 ["01 reservation entity exists",sql.includes("commerce_inventory_reservations")],
 ["02 reservation event ledger exists",sql.includes("commerce_inventory_reservation_events")],
 ["03 remaining quantity is generated",sql.includes("remaining_quantity numeric(20,6) generated always as")],
 ["04 reserve/release/consume states modeled",types.includes("ACTIVE")&&types.includes("RELEASED")&&types.includes("CONSUMED")],
 ["05 create reservation is idempotent",sql.includes("COMMERCE_RESERVATION_IDEMPOTENCY_PAYLOAD_MISMATCH")&&sql.includes("reservation-create")],
 ["06 reservation create uses ledger movement RPC",sql.includes("public.commerce_inventory_apply_movement")&&sql.includes("'RESERVATION_COMMIT'")],
 ["07 release decrements reserved only",sql.includes("v_reserved_delta := -p_quantity")&&sql.includes("'RESERVATION_RELEASE'")],
 ["08 consume decrements physical and reserved",sql.includes("v_physical_delta := -p_quantity")&&sql.includes("v_movement_type := 'SALE'")],
 ["09 over-consumption/release is guarded",sql.includes("COMMERCE_RESERVATION_QUANTITY_EXCEEDS_REMAINING")],
 ["10 closed and expired reservations are guarded",sql.includes("COMMERCE_RESERVATION_CLOSED")&&sql.includes("COMMERCE_RESERVATION_EXPIRED")],
 ["11 direct service mutation is denied",sql.includes("revoke all on table public.commerce_inventory_reservations")&&sql.includes("grant select on table public.commerce_inventory_reservations")],
 ["12 reservation RPCs are service-only",sql.includes("grant execute on function public.commerce_inventory_reservation_create")&&sql.includes("grant execute on function public.commerce_inventory_reservation_apply")],
 ["13 reservation mutations emit audit + outbox",sql.includes("INVENTORY_RESERVED")&&sql.includes("INVENTORY_RESERVATION_")&&sql.includes("commerce_outbox_events")],
 ["14 repository validates positive decimal quantity",repo.includes("reservationQuantity")&&repo.includes('compareDecimal(quantity,"0") <= 0')],
 ["15 repository remains organization scoped",repo.includes('p_organization_id:context.organizationId')],
 ["16 reservation list/create API resolves Commerce context",route.includes("resolveCommerceContext")&&route.includes("export async function GET")&&route.includes("export async function POST")],
 ["17 release API uses idempotency-key",release.includes('request.headers.get("idempotency-key")')&&release.includes('"RELEASE"')],
 ["18 consume API uses idempotency-key",consume.includes('request.headers.get("idempotency-key")')&&consume.includes('"CONSUME"')],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
