#!/usr/bin/env node
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const types = read("app/lib/commerce/product/types.ts");
const productRepo = read("app/lib/commerce/product/repository.ts");
const catalogRepo = read("app/lib/commerce/catalog/repository.ts");
const receivingRepo = read("app/lib/commerce/receiving/repository.ts");
const statusRoute = read("app/api/aruter/orders/[orderId]/status/route.ts");
const pilot = read("app/lib/aruter/storefrontPilot.ts");
const migration = read("supabase/migrations/20260821143000_dimpro_commerce_pilot_units_p2.sql");
const rollback = read("supabase/rollback/DIMPRO_COMMERCE_PILOT_UNITS_P2_ROLLBACK.sql");

const checks = [];
function check(name, condition) {
  if (!condition) {
    console.error(`FAIL ${String(checks.length + 1).padStart(2, "0")} ${name}`);
    process.exit(2);
  }
  checks.push(name);
  console.log(`PASS ${String(checks.length).padStart(2, "0")} ${name}`);
}

const extended = ["RAKLAP", "ZSAK", "LADA"];
check("UnitOfMeasure exposes pallet bag crate", extended.every((unit) => types.includes(`"${unit}"`)));
check("product repository accepts extended units", extended.every((unit) => productRepo.includes(`"${unit}"`)));
check("catalog variant repository accepts extended units", extended.every((unit) => catalogRepo.includes(`"${unit}"`)));
check("receiving repository accepts extended units", extended.every((unit) => receivingRepo.includes(`"${unit}"`)));
check("migration extends ProductVariant constraint", migration.includes("commerce_product_variants_unit_check") && extended.every((unit) => migration.includes(`'${unit}'`)));
check("migration extends GoodsReceiptItem constraint", migration.includes("commerce_goods_receipt_items_unit_check") && extended.every((unit) => migration.includes(`'${unit}'`)));
check("migration updates product create RPC", migration.includes("commerce_product_create_atomic") && migration.includes("'RAKLAP','ZSAK','LADA'"));
check("migration advances Commerce schema to 0.1.15 / 16", migration.includes("schema_version='0.1.15'") && migration.includes("migration_count=16"));
check("rollback guards active extended product units", rollback.includes("COMMERCE_P2_ROLLBACK_EXTENDED_PRODUCT_UNITS_IN_USE"));
check("rollback guards active extended receiving units", rollback.includes("COMMERCE_P2_ROLLBACK_EXTENDED_RECEIVING_UNITS_IN_USE"));
check("rollback restores Commerce schema to 0.1.14 / 15", rollback.includes("schema_version='0.1.14'") && rollback.includes("migration_count=15"));
check("Storefront origin resolver recognizes public checkout", pilot.includes('note.includes("[PUBLIC_CHECKOUT:")'));
check("Storefront origin resolver recognizes public reservation", pilot.includes('note.includes("[PUBLIC_RESERVATION:")'));
check("Storefront origin resolver requires configured Commerce business slug", pilot.includes("ARUTER_STOREFRONT_COMMERCE_BUSINESS_SLUG"));
check("Storefront resolver validates configured template", pilot.includes("template !== order.template"));
check("legacy status route queues Storefront-origin updates", statusRoute.includes("queueStorefrontCommerceMirrorFailOpen(storefrontBusinessSlug, order)"));
check("legacy status route keeps non-Storefront direct mirror fallback", statusRoute.includes("await mirrorAruterOrderToCommerceFailOpen(request, order)"));
const afterIndex = statusRoute.indexOf("after(async");
const queueIndex = statusRoute.indexOf("queueStorefrontCommerceMirrorFailOpen(storefrontBusinessSlug, order)", afterIndex);
const directIndex = statusRoute.indexOf("mirrorAruterOrderToCommerceFailOpen(request, order)", afterIndex);
check("Storefront queue branch returns before direct mirror", queueIndex >= 0 && directIndex > queueIndex && statusRoute.slice(queueIndex, directIndex).includes("return;"));

console.log(`RESULT ${checks.length}/${checks.length} PASS`);
