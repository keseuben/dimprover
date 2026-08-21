import assert from "node:assert/strict";
import fs from "node:fs";

const migration=fs.readFileSync("supabase/migrations/20260821112500_dimpro_commerce_storefront_product_mapping_p1.sql","utf8");
const rollback=fs.readFileSync("supabase/rollback/DIMPRO_COMMERCE_STOREFRONT_PRODUCT_MAPPING_P1_ROLLBACK.sql","utf8");
const repository=fs.readFileSync("app/lib/commerce/storefront/repository.ts","utf8");
const legacyBridge=fs.readFileSync("app/lib/commerce/order/legacyBridge.ts","utf8");
const reconciliation=fs.readFileSync("app/lib/commerce/order/mirrorReconciliation.ts","utf8");
const mirror=fs.readFileSync("app/lib/aruter/commerceMirror.ts","utf8");
const pilot=fs.readFileSync("app/lib/aruter/storefrontPilot.ts","utf8");
const worker=fs.readFileSync("scripts/run-commerce-storefront-mirror-worker.mjs","utf8");
const envExample=fs.readFileSync("app/lib/aruter/aruter-env.example","utf8");
const route=fs.readFileSync("app/api/v1/commerce/storefront-mappings/route.ts","utf8");

const checks=[];
function check(name,condition){checks.push([name,Boolean(condition)]);console.log(`${condition?"PASS":"FAIL"} ${String(checks.length).padStart(2,"0")} ${name}`);}

check("schema advances to 0.1.14 / 15",migration.includes("schema_version='0.1.14'")&&migration.includes("migration_count=15"));
check("rollback returns to 0.1.13 / 14",rollback.includes("schema_version='0.1.13'")&&rollback.includes("migration_count=14"));
check("mapping table exists",migration.includes("commerce_storefront_product_mappings"));
check("mapping binds Storefront product id",migration.includes("external_product_id text not null"));
check("mapping binds Commerce product",migration.includes("product_id uuid not null references public.commerce_products"));
check("mapping binds Commerce variant",migration.includes("variant_id uuid not null references public.commerce_product_variants"));
check("mapping has optional source preference",migration.includes("fulfillment_source_id uuid null references public.commerce_inventory_sources"));
check("storefront has default source",migration.includes("default_fulfillment_source_id"));
check("DB validates product variant pair",migration.includes("COMMERCE_STOREFRONT_MAPPING_PRODUCT_VARIANT_MISMATCH"));
check("DB validates internal source",migration.includes("source_type='INTERNAL'")&&migration.includes("COMMERCE_STOREFRONT_MAPPING_FULFILLMENT_SOURCE_INVALID"));
check("mapping is tenant/storefront unique",migration.includes("commerce_storefront_mapping_external_product_unique"));
check("mapping supports case-insensitive SKU unique",migration.includes("upper(external_sku)"));
check("mapping uses canonical soft delete",migration.includes("commerce_sync_soft_delete_columns"));
check("service role only table access",migration.includes("revoke all on table public.commerce_storefront_product_mappings from anon, authenticated, service_role")&&migration.includes("grant select,insert,update,delete"));
check("repository resolves external product first",repository.indexOf('eq("external_product_id", externalProductId)')<repository.indexOf('ilike("external_sku", externalSku)'));
check("repository verifies active product",repository.includes('.eq("status", "ACTIVE")'));
check("source priority configured mapping storefront auto",repository.indexOf('pushCandidate(configuredSourceId, "CONFIGURED")')<repository.indexOf('pushCandidate(mappedSourceIds[0], "MAPPING")')&&repository.indexOf('pushCandidate(mappedSourceIds[0], "MAPPING")')<repository.indexOf('pushCandidate(storefront?.defaultFulfillmentSourceId, "STOREFRONT_DEFAULT")')&&repository.indexOf('pushCandidate(storefront?.defaultFulfillmentSourceId, "STOREFRONT_DEFAULT")')<repository.indexOf('pushCandidate(source.id, "AUTO_STOCK")'));
check("source selection verifies SELLABLE balance",repository.includes('.eq("stock_status", "SELLABLE")')&&repository.includes("available_quantity"));
check("source selection requires whole-order coverage",repository.includes("shortages")&&repository.includes("compareDecimal(item.available, item.required) < 0"));
check("legacy bridge resolves storefront mapping first",legacyBridge.indexOf("resolveCommerceStorefrontProductMapping")<legacyBridge.indexOf("resolveCommerceProductByCode(context, legacyItem.sku)"));
check("legacy bridge sends product and variant ids",legacyBridge.includes("productId: storefrontMapping.product.id")&&legacyBridge.includes("variantId: storefrontMapping.variant.id"));
check("legacy bridge returns fulfillment requirements",legacyBridge.includes("fulfillmentRequirements")&&legacyBridge.includes("preferredFulfillmentSourceIds"));
check("queue persists storefront slug context",reconciliation.includes("commerceContext")&&reconciliation.includes("storefrontSlug"));
check("pilot passes business slug to queue",pilot.includes("{ storefrontSlug: businessSlug }"));
check("mirror reads queued storefront slug",mirror.includes("order.commerceContext?.storefrontSlug"));
check("mirror calls fulfillment resolver",mirror.includes("resolveCommerceStorefrontFulfillmentSource"));
check("mirror preserves explicit source priority",mirror.includes("configuredSelection(explicitSourceId)"));
check("mirror reserves selected source",mirror.includes("reserveCommerceOrderInventory")&&mirror.includes("sourceId: fulfillmentSourceId"));
check("mapping source conflict fails safely",mirror.includes("COMMERCE_STOREFRONT_FULFILLMENT_SOURCE_CONFLICT"));
check("insufficient selected source fails safely",mirror.includes("COMMERCE_STOREFRONT_FULFILLMENT_NOT_READY"));
check("auto source resolution is opt-in",envExample.includes("ARUTER_COMMERCE_AUTO_FULFILLMENT_RESOLVE_ENABLED=0")&&mirror.includes("ARUTER_COMMERCE_AUTO_FULFILLMENT_RESOLVE_ENABLED"));
check("mirror worker has inventory read",worker.includes('"commerce.inventory.read"'));
check("mirror worker has inventory move",worker.includes('"commerce.inventory.move"'));
check("mapping API GET exists",route.includes("export async function GET"));
check("mapping API POST exists",route.includes("export async function POST"));
check("mapping API resolves tenant context",route.includes("resolveCommerceContext"));

const failed=checks.filter(([,ok])=>!ok);
console.log(`RESULT ${checks.length-failed.length}/${checks.length} PASS`);
assert.equal(failed.length,0,failed.map(([name])=>name).join(", "));
