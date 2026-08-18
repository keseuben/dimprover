import fs from "node:fs";
import assert from "node:assert/strict";
const sql=fs.readFileSync("supabase/migrations/20260818234500_dimpro_commerce_order_core_m1.sql","utf8");
const repo=fs.readFileSync("app/lib/commerce/order/repository.ts","utf8");
const types=fs.readFileSync("app/lib/commerce/order/types.ts","utf8");
const bridge=fs.readFileSync("app/lib/commerce/order/legacyBridge.ts","utf8");
const root=fs.readFileSync("app/api/v1/commerce/orders/route.ts","utf8");
const detail=fs.readFileSync("app/api/v1/commerce/orders/[orderId]/route.ts","utf8");
const status=fs.readFileSync("app/api/v1/commerce/orders/[orderId]/status/route.ts","utf8");
const legacy=fs.readFileSync("app/api/v1/commerce/orders/legacy-bridge/route.ts","utf8");
const permissions=fs.readFileSync("app/lib/commerce/core/permissions.ts","utf8");
const checks=[
 ["01 shared Commerce orders table exists",sql.includes("create table if not exists public.commerce_orders")],
 ["02 order items table exists",sql.includes("create table if not exists public.commerce_order_items")],
 ["03 order status event ledger exists",sql.includes("create table if not exists public.commerce_order_status_events")],
 ["04 status model preserves cashier flow",sql.includes("'DRAFT','SENT_TO_CASHIER','PAID','ISSUED','CANCELLED'")&&types.includes("SENT_TO_CASHIER")],
 ["05 external marketplace is explicit source",sql.includes("EXTERNAL_MARKETPLACE")&&types.includes("EXTERNAL_MARKETPLACE")],
 ["06 external source reference is tenant unique",sql.includes("commerce_orders_external_reference_idx")],
 ["07 cashier queue has dedicated index",sql.includes("commerce_orders_cashier_queue_idx")],
 ["08 order item supports snapshot without Commerce product id",sql.includes("product_id uuid null")&&sql.includes("variant_id uuid null")],
 ["09 unresolved inventory state is explicit",sql.includes("UNRESOLVED")&&types.includes("CommerceOrderInventoryStatus")],
 ["10 optional reservation bridge field exists",sql.includes("reservation_id uuid null references public.commerce_inventory_reservations")],
 ["11 legacy units include pallet/bag/crate",sql.includes("RAKLAP")&&sql.includes("ZSAK")&&sql.includes("LADA")],
 ["12 atomic create RPC exists",sql.includes("commerce_order_create_atomic")],
 ["13 atomic create uses advisory lock",sql.includes("order-create")&&sql.includes("pg_advisory_xact_lock")],
 ["14 full create payload hash guards idempotency mismatch",sql.includes("create_payload_hash")&&sql.includes("v_payload_hash:=md5")&&sql.includes("COMMERCE_ORDER_IDEMPOTENCY_PAYLOAD_MISMATCH")],
 ["15 create requires non-empty items",sql.includes("COMMERCE_ORDER_ITEMS_REQUIRED")],
 ["16 optional Product/Variant ids are tenant scoped",sql.includes("COMMERCE_ORDER_PRODUCT_SCOPE_MISMATCH")&&sql.includes("COMMERCE_ORDER_VARIANT_SCOPE_MISMATCH")],
 ["17 create emits audit + outbox",sql.includes("ORDER_SENT_TO_CASHIER")&&sql.includes("commerce_outbox_events")],
 ["18 status RPC exists",sql.includes("commerce_order_set_status")],
 ["19 status state machine allows sent->paid->issued",sql.includes("v_order.status='SENT_TO_CASHIER'")&&sql.includes("v_order.status='PAID'")],
 ["20 status event is idempotent",sql.includes("v_existing_event")&&sql.includes("COMMERCE_ORDER_STATUS_IDEMPOTENCY_REQUIRED")],
 ["21 order RPCs are service-only",sql.includes("grant execute on function public.commerce_order_create_atomic")&&sql.includes("grant execute on function public.commerce_order_set_status")],
 ["22 repository reads are organization scoped",(repo.match(/\.eq\("organization_id",context\.organizationId\)/g)||[]).length>=3],
 ["23 cashier queue selects SENT_TO_CASHIER + PAID",repo.includes('query.in("status",["SENT_TO_CASHIER","PAID"])')],
 ["24 create API supports idempotency-key",root.includes('request.headers.get("idempotency-key")')],
 ["25 detail API resolves Commerce context",detail.includes("resolveCommerceContext")&&detail.includes("getCommerceOrder")],
 ["26 status API supports idempotency-key",status.includes('request.headers.get("idempotency-key")')],
 ["27 cashier/pay/issuer permissions are separated",permissions.includes("CASHIER_PERMISSIONS")&&permissions.includes("WAREHOUSE_ISSUER_PERMISSIONS")&&permissions.includes("commerce.order.pay")&&permissions.includes("commerce.order.issue")],
 ["28 legacy bridge maps sent_to_cashier",bridge.includes('status==="sent_to_cashier"?"SENT_TO_CASHIER"')],
 ["29 legacy bridge maps current cart item snapshots",bridge.includes("priceNetMinor")&&bridge.includes("vatRateBasisPoints")&&bridge.includes("storageZone")],
 ["30 legacy bridge route creates then replays paid/issued transitions",legacy.includes("legacyAruterOrderRequiredTransitions")&&legacy.includes("setCommerceOrderStatus")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
