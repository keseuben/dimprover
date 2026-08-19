import fs from "node:fs";
import assert from "node:assert/strict";
const sql=fs.readFileSync("supabase/migrations/20260818235500_dimpro_commerce_order_inventory_bridge_m1.sql","utf8");
const rollback=fs.readFileSync("supabase/rollback/DIMPRO_COMMERCE_ORDER_INVENTORY_BRIDGE_M1_ROLLBACK.sql","utf8");
const repo=fs.readFileSync("app/lib/commerce/order/repository.ts","utf8");
const types=fs.readFileSync("app/lib/commerce/order/types.ts","utf8");
const route=fs.readFileSync("app/api/v1/commerce/orders/[orderId]/reserve/route.ts","utf8");
const checks=[
 ["01 fulfillment source added to order",sql.includes("fulfillment_source_id")&&types.includes("fulfillmentSourceId")],
 ["02 order inventory event ledger exists",sql.includes("commerce_order_inventory_events")],
 ["03 reserve RPC exists",sql.includes("commerce_order_reserve_inventory")],
 ["04 reserve RPC uses advisory lock",sql.includes("order-reserve")&&sql.includes("pg_advisory_xact_lock")],
 ["05 reserve operation is idempotent",sql.includes("COMMERCE_ORDER_RESERVATION_IDEMPOTENCY_PAYLOAD_MISMATCH")],
 ["06 reserve accepts SENT_TO_CASHIER and PAID",sql.includes("v_order.status not in ('SENT_TO_CASHIER','PAID')")],
 ["07 reserve only uses internal active source",sql.includes("source_type='INTERNAL'")&&sql.includes("COMMERCE_INTERNAL_SOURCE_NOT_FOUND")],
 ["08 unresolved legacy items are skipped not rejected",sql.includes("if v_item.variant_id is null")&&sql.includes("v_unresolved:=v_unresolved+1")],
 ["09 mapped items create inventory reservations",sql.includes("commerce_inventory_reservation_create")],
 ["10 reservation references ORDER_ITEM",sql.includes("'ORDER_ITEM',v_item.id")],
 ["11 item stores reservation id and RESERVED state",sql.includes("reservation_id=v_reservation_id,inventory_status='RESERVED'")],
 ["12 order stores fulfillment source",sql.includes("set fulfillment_source_id=p_source_id")],
 ["13 reserve emits audit",sql.includes("ORDER_INVENTORY_RESERVED")&&sql.includes("commerce_audit_events")],
 ["14 reserve emits outbox",sql.includes("ORDER_INVENTORY_RESERVED")&&sql.includes("commerce_outbox_events")],
 ["15 PAID does not consume reservation",!sql.includes("v_target='PAID' then\n    for v_item")],
 ["16 ISSUED requires reservation for mapped variants",sql.includes("COMMERCE_ORDER_RESERVATION_REQUIRED")],
 ["17 ISSUED verifies full reservation quantity",sql.includes("COMMERCE_ORDER_RESERVATION_INCOMPLETE")&&sql.includes("v_res.remaining_quantity<>v_item.quantity")],
 ["18 ISSUED consumes reservation",sql.includes("'CONSUME',v_item.quantity")&&sql.includes("inventory_status='CONSUMED'")],
 ["19 CANCELLED releases active reservation",sql.includes("'RELEASE',v_res.remaining_quantity")&&sql.includes("inventory_status='RELEASED'")],
 ["20 legacy unresolved items do not participate in issue guard",sql.includes("i.variant_id is not null and (i.reservation_id is null")],
 ["21 reserve RPC is service-only",sql.includes("revoke all on function public.commerce_order_reserve_inventory")&&sql.includes("to service_role")],
 ["22 repository requires order write",repo.includes("reserveCommerceOrderInventory")&&repo.includes("requireWrite(context)")],
 ["23 repository additionally requires inventory move",repo.includes('commerce.inventory.move')&&repo.includes("Nincs készletfoglalási jogosultság")],
 ["24 reserve API supports idempotency-key",route.includes('request.headers.get("idempotency-key")')],
 ["25 reserve API resolves Commerce context",route.includes("resolveCommerceContext")],
 ["26 status error mapping includes missing/incomplete reservation",repo.includes("COMMERCE_ORDER_RESERVATION_REQUIRED")&&repo.includes("COMMERCE_ORDER_RESERVATION_INCOMPLETE")],
 ["27 rollback restores prior status function and schema",rollback.includes("create or replace function public.commerce_order_set_status")&&rollback.includes("schema_version='0.1.6'")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
