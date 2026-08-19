import fs from "node:fs";
import assert from "node:assert/strict";
const sql=fs.readFileSync("supabase/migrations/20260819112500_dimpro_commerce_reservation_expiry_m1.sql","utf8");
const rollback=fs.readFileSync("supabase/rollback/DIMPRO_COMMERCE_RESERVATION_EXPIRY_M1_ROLLBACK.sql","utf8");
const repo=fs.readFileSync("app/lib/commerce/inventory/repository.ts","utf8");
const route=fs.readFileSync("app/api/v1/commerce/inventory/reservations/expire-due/route.ts","utf8");
const checks=[
 ["01 expiry event is explicitly modeled",sql.includes("'EXPIRE'")&&sql.includes("commerce_inventory_reservation_events_action_check")],
 ["02 due-expiry partial index exists",sql.includes("commerce_inventory_reservations_due_expiry_idx")&&sql.includes("status in ('ACTIVE','PARTIAL')")],
 ["03 cleanup RPC exists",sql.includes("commerce_inventory_expire_due_reservations")],
 ["04 cleanup is tenant scoped",sql.includes("organization_id=p_organization_id")],
 ["05 only due non-archived reservations are selected",sql.includes("archived_at is null")&&sql.includes("expires_at <= v_now")&&sql.includes("remaining_quantity > 0")],
 ["06 cleanup batch is bounded to 100",sql.includes("least(coalesce(p_limit,100),100)")],
 ["07 tenant cleanup uses advisory lock",sql.includes("reservation-expiry-cleanup")&&sql.includes("pg_advisory_xact_lock")],
 ["08 due rows use FOR UPDATE SKIP LOCKED",sql.includes("for update skip locked")],
 ["09 expiry releases reserved quantity only",sql.includes("'RESERVATION_RELEASE'")&&sql.includes("0,-v_remaining,0")],
 ["10 release movement idempotency is stable per reservation",sql.includes("reservation:expire-movement:")],
 ["11 expired reservation closes with full released quantity",sql.includes("released_quantity=released_quantity+v_remaining")&&sql.includes("status='EXPIRED'")],
 ["12 expiry event has stable idempotency",sql.includes("reservation:expire-event:")&&sql.includes("on conflict (organization_id,idempotency_key) do nothing")],
 ["13 linked reserved order item becomes RELEASED",sql.includes("commerce_order_items")&&sql.includes("inventory_status='RELEASED'")&&sql.includes("inventory_status='RESERVED'")],
 ["14 cleanup writes audit",sql.includes("INVENTORY_RESERVATION_EXPIRED")&&sql.includes("commerce_audit_events")],
 ["15 cleanup writes transactional outbox",sql.includes("commerce_outbox_events")&&sql.includes("reservation-expired:")],
 ["16 released total remains NUMERIC(19,6)",sql.includes("v_released numeric(19,6)")&&sql.includes("v_remaining numeric(19,6)")],
 ["17 cleanup RPC is service-only",sql.includes("revoke all on function public.commerce_inventory_expire_due_reservations")&&sql.includes("to service_role")],
 ["18 schema advances to 0.1.10 / 11",sql.includes("schema_version='0.1.10'")&&sql.includes("migration_count=11")],
 ["19 repository requires move + adjust",repo.includes("requireReservationCleanup")&&repo.includes('commerce.inventory.move')&&repo.includes('commerce.inventory.adjust')],
 ["20 repository uses cleanup RPC",repo.includes('client.rpc("commerce_inventory_expire_due_reservations"')],
 ["21 repository bounds limit to 100",repo.includes("Math.min(100")],
 ["22 API resolves Commerce session context",route.includes("resolveCommerceContext")],
 ["23 API never accepts organization from body",!route.includes("body.organizationId")],
 ["24 API exposes POST only",route.includes("export async function POST")&&!route.includes("export async function GET")],
 ["25 rollback drops cleanup RPC/index",rollback.includes("drop function if exists public.commerce_inventory_expire_due_reservations")&&rollback.includes("drop index if exists public.commerce_inventory_reservations_due_expiry_idx")],
 ["26 rollback removes EXPIRE action",rollback.includes("check (action in ('RESERVE','RELEASE','CONSUME'))")],
 ["27 rollback restores 0.1.9 / 10",rollback.includes("schema_version='0.1.9'")&&rollback.includes("migration_count=10")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
