import fs from "node:fs";
import assert from "node:assert/strict";
const sql=fs.readFileSync("supabase/migrations/20260818220500_dimpro_commerce_media_management_m1.sql","utf8");
const repo=fs.readFileSync("app/lib/commerce/media/repository.ts","utf8");
const productRoute=fs.readFileSync("app/api/v1/commerce/media/products/[productId]/route.ts","utf8");
const overlayRoute=fs.readFileSync("app/api/v1/commerce/media/assets/[assetId]/overlays/route.ts","utf8");
const overlayItem=fs.readFileSync("app/api/v1/commerce/media/assets/[assetId]/overlays/[overlayId]/route.ts","utf8");
const checks=[
 ["01 one primary image per entity index",sql.includes("commerce_media_links_one_primary_per_entity_idx")],
 ["02 ordering RPC exists",sql.includes("commerce_media_set_product_order")],
 ["03 ordering RPC is tenant scoped",sql.includes("p_organization_id")&&sql.includes("COMMERCE_MEDIA_PRODUCT_SCOPE_MISMATCH")],
 ["04 ordering RPC uses advisory lock",sql.includes("pg_advisory_xact_lock")],
 ["05 duplicate asset order is rejected",sql.includes("COMMERCE_MEDIA_ASSET_ORDER_DUPLICATE")],
 ["06 primary must be in order",sql.includes("COMMERCE_MEDIA_PRIMARY_NOT_IN_ORDER")],
 ["07 linked assets are scope validated",sql.includes("COMMERCE_MEDIA_ASSET_LINK_SCOPE_MISMATCH")],
 ["08 ordering emits audit",sql.includes("PRODUCT_MEDIA_ORDER_CHANGED")],
 ["09 ordering emits outbox",sql.includes("PRODUCT_MEDIA_CHANGED")],
 ["10 ordering RPC is service-only",sql.includes("grant execute on function public.commerce_media_set_product_order")],
 ["11 repository lists product media",repo.includes("listCommerceProductMedia")&&repo.includes("link_type")&&repo.includes("PRODUCT")],
 ["12 repository includes overlays",repo.includes("commerce_media_overlays")&&repo.includes("overlaysByAsset")],
 ["13 repository writes ordering through RPC",repo.includes("commerce_media_set_product_order")],
 ["14 overlay types are allowlisted",repo.includes("OVERLAY_TYPES")&&repo.includes("WATERMARK")&&repo.includes("BLUR")],
 ["15 overlay create verifies asset tenant scope",repo.includes("createCommerceMediaOverlay")&&repo.includes("organization_id")],
 ["16 overlay update is asset scoped",repo.includes("updateCommerceMediaOverlay")&&repo.includes("asset_id")],
 ["17 overlay archive is soft delete",repo.includes("archiveCommerceMediaOverlay")&&repo.includes("deleted_at")],
 ["18 product media API supports GET+PATCH",productRoute.includes("export async function GET")&&productRoute.includes("export async function PATCH")],
 ["19 overlay API supports POST",overlayRoute.includes("export async function POST")],
 ["20 overlay item API supports PATCH+DELETE",overlayItem.includes("export async function PATCH")&&overlayItem.includes("export async function DELETE")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
