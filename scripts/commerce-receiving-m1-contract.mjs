import fs from "node:fs";
import assert from "node:assert/strict";
const sql=fs.readFileSync("supabase/migrations/20260818224000_dimpro_commerce_receiving_m1.sql","utf8");
const conformance=fs.readFileSync("supabase/migrations/20260819104500_dimpro_commerce_schema_conformance_v019.sql","utf8");
const repo=fs.readFileSync("app/lib/commerce/receiving/repository.ts","utf8");
const types=fs.readFileSync("app/lib/commerce/receiving/types.ts","utf8");
const permissions=fs.readFileSync("app/lib/commerce/core/permissions.ts","utf8");
const coreTypes=fs.readFileSync("app/lib/commerce/core/types.ts","utf8");
const mediaService=fs.readFileSync("app/lib/commerce/media/uploadService.ts","utf8");
const mediaToken=fs.readFileSync("app/lib/commerce/media/uploadToken.ts","utf8");
const rootRoute=fs.readFileSync("app/api/v1/commerce/receiving/route.ts","utf8");
const itemRoute=fs.readFileSync("app/api/v1/commerce/receiving/[receiptId]/items/[itemId]/route.ts","utf8");
const postRoute=fs.readFileSync("app/api/v1/commerce/receiving/[receiptId]/post/route.ts","utf8");
const checks=[
 ["01 goods receipt table exists",sql.includes("create table if not exists public.commerce_goods_receipts")],
 ["02 goods receipt item table exists",sql.includes("create table if not exists public.commerce_goods_receipt_items")],
 ["03 receipt state machine is draft/post/cancel",sql.includes("'DRAFT','POSTED','CANCELLED'")&&types.includes('"DRAFT" | "POSTED" | "CANCELLED"')],
 ["04 receipt number is tenant unique",sql.includes("unique (organization_id, receipt_number)")],
 ["05 receipt is warehouse + internal source scoped",sql.includes("warehouse_id uuid not null")&&sql.includes("source_id uuid not null")&&repo.includes("verifySourceWarehouse")],
 ["06 item quantity is canonical NUMERIC(19,6)",conformance.includes("commerce_goods_receipt_items")&&conformance.includes("quantity type numeric(19,6)")&&repo.includes("normalizeQuantity")],
 ["07 item supports sellable/quarantine/damaged/outlet",types.includes('"SELLABLE" | "QUARANTINE" | "DAMAGED" | "OUTLET"')],
 ["08 item supports NUMERIC(19,4) cost and currency",conformance.includes("unit_cost type numeric(19,4)")&&sql.includes("currency text")&&repo.includes("unit_cost:cost")],
 ["09 item supports LOT metadata seed",sql.includes("lot_code")&&sql.includes("expiry_date")],
 ["10 posting RPC exists",sql.includes("commerce_goods_receipt_post")],
 ["11 posting RPC uses advisory transaction lock",sql.includes("pg_advisory_xact_lock")],
 ["12 posting is idempotent",sql.includes("post_idempotency_key")&&sql.includes("COMMERCE_RECEIPT_ALREADY_POSTED")],
 ["13 posting rejects empty receipts",sql.includes("COMMERCE_RECEIPT_EMPTY")],
 ["14 posting writes inventory through ledger RPC",sql.includes("public.commerce_inventory_apply_movement")&&sql.includes("'RECEIPT'")],
 ["15 posting references receipt item in stock ledger",sql.includes("'GOODS_RECEIPT_ITEM'")],
 ["16 posting emits audit and outbox",sql.includes("GOODS_RECEIPT_POSTED")&&sql.includes("commerce_outbox_events")],
 ["17 posting RPC is service-only",sql.includes("grant execute on function public.commerce_goods_receipt_post")&&sql.includes("from public, anon, authenticated")],
 ["18 receiving permissions are explicit",coreTypes.includes("commerce.receiving.read")&&coreTypes.includes("commerce.receiving.write")&&coreTypes.includes("commerce.receiving.post")],
 ["19 manager inherits receiving while adjustment stays excluded",permissions.includes("MANAGER_PERMISSIONS")&&permissions.includes('permission !== "commerce.inventory.adjust"')&&permissions.includes("commerce.receiving.post")],
 ["20 repository mutations require receiving permission",repo.includes("requireWrite(context)")&&repo.includes("requirePost(context)")],
 ["21 repository queries remain organization scoped",(repo.match(/\.eq\("organization_id",context\.organizationId\)/g)||[]).length>=10],
 ["22 API list/create resolves Commerce context",rootRoute.includes("resolveCommerceContext")&&rootRoute.includes("export async function GET")&&rootRoute.includes("export async function POST")],
 ["23 item API supports patch + soft delete",itemRoute.includes("export async function PATCH")&&itemRoute.includes("export async function DELETE")&&repo.includes("deleted_at:new Date().toISOString()")],
 ["24 post API requires idempotency-key support",postRoute.includes('request.headers.get("idempotency-key")')],
 ["25 receipt and receipt-item media targets are ticketed",mediaToken.includes('"GOODS_RECEIPT" | "GOODS_RECEIPT_ITEM"')],
 ["26 media upload verifies receipt target tenant scope",mediaService.includes('targetType === "GOODS_RECEIPT"')&&mediaService.includes('"commerce_goods_receipts"')&&mediaService.includes('"commerce_goods_receipt_items"')],
 ["27 DB media finalizer supports receipt header",sql.includes("v_link_type='GOODS_RECEIPT'")&&sql.includes("COMMERCE_MEDIA_RECEIPT_SCOPE_MISMATCH")],
 ["28 DB media finalizer supports receipt item",sql.includes("v_link_type='GOODS_RECEIPT_ITEM'")&&sql.includes("COMMERCE_MEDIA_RECEIPT_ITEM_SCOPE_MISMATCH")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
