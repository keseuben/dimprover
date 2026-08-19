import fs from "node:fs";
import assert from "node:assert/strict";
const migration=fs.readFileSync("supabase/migrations/20260819104500_dimpro_commerce_schema_conformance_v019.sql","utf8");
const rollback=fs.readFileSync("supabase/rollback/DIMPRO_COMMERCE_SCHEMA_CONFORMANCE_V019_ROLLBACK.sql","utf8");
const decimal=fs.readFileSync("app/lib/commerce/core/decimal.ts","utf8");
const pricing=fs.readFileSync("app/lib/commerce/pricing/repository.ts","utf8");
const product=fs.readFileSync("app/lib/commerce/product/repository.ts","utf8");
const receiving=fs.readFileSync("app/lib/commerce/receiving/repository.ts","utf8");
const order=fs.readFileSync("app/lib/commerce/order/repository.ts","utf8");
const bridge=fs.readFileSync("app/lib/commerce/order/legacyBridge.ts","utf8");
const checks=[
 ["01 schema advances to 0.1.9 / 10",migration.includes("schema_version='0.1.9'")&&migration.includes("migration_count=10")],
 ["02 price amount is NUMERIC(19,4)",migration.includes("rename column amount_minor to amount")&&migration.includes("alter column amount type numeric(19,4)")],
 ["03 receiving unit_cost is NUMERIC(19,4)",migration.includes("rename column unit_cost_minor to unit_cost")&&migration.includes("alter column unit_cost type numeric(19,4)")],
 ["04 order price_net is NUMERIC(19,4)",migration.includes("rename column price_net_minor to price_net")&&migration.includes("alter column price_net type numeric(19,4)")],
 ["05 inventory balances are NUMERIC(19,6)",migration.includes("physical_quantity type numeric(19,6)")&&migration.includes("reserved_quantity type numeric(19,6)")&&migration.includes("incoming_quantity type numeric(19,6)")],
 ["06 generated available is NUMERIC(19,6)",migration.includes("available_quantity numeric(19,6) generated always as")],
 ["07 reservation quantities are NUMERIC(19,6)",migration.includes("requested_quantity type numeric(19,6)")&&migration.includes("released_quantity type numeric(19,6)")&&migration.includes("consumed_quantity type numeric(19,6)")],
 ["08 generated remaining is NUMERIC(19,6)",migration.includes("remaining_quantity numeric(19,6) generated always as")],
 ["09 receipt/order/external quantities are NUMERIC(19,6)",migration.includes("commerce_external_inventory_snapshots")&&migration.includes("commerce_goods_receipt_items")&&migration.includes("commerce_order_items")],
 ["10 stock ledger deltas are NUMERIC(19,6)",migration.includes("physical_delta type numeric(19,6)")&&migration.includes("reserved_delta type numeric(19,6)")&&migration.includes("incoming_delta type numeric(19,6)")],
 ["11 migration has overflow guards",migration.includes("COMMERCE_SCHEMA_QUANTITY_NUMERIC_19_6_OVERFLOW")&&migration.includes("COMMERCE_SCHEMA_MONEY_NUMERIC_19_4_OVERFLOW")],
 ["12 inventory function locals use 19,6",migration.includes("v_physical numeric(19,6)")&&migration.includes("v_reserved numeric(19,6)")&&migration.includes("v_incoming numeric(19,6)")],
 ["13 receiving total uses 19,6",migration.includes("v_total numeric(19,6)")],
 ["14 order create uses canonical numeric types",migration.includes("v_quantity numeric(19,6)")&&migration.includes("v_price numeric(19,4)")&&migration.includes("price_net,vat_rate_basis_points")],
 ["15 price RPC uses canonical amount",migration.includes("p_amount numeric")&&migration.includes("v_amount numeric(19,4)")&&migration.includes("jsonb_build_object('priceId',v_price_id,'variantId',p_variant_id,'currency',v_currency,'amount',v_amount")],
 ["16 price RPC remains service-only",migration.includes("revoke all on function public.commerce_price_set_active(uuid,uuid,text,numeric,integer,timestamptz)")&&migration.includes("to service_role")],
 ["17 exact decimal helpers expose quantity and money",decimal.includes("normalizeQuantity")&&decimal.includes("normalizeMoney")&&decimal.includes("assertPrecision")],
 ["18 pricing repository reads canonical amount",pricing.includes('select("id,organization_id,variant_id,currency,amount,')&&pricing.includes("p_amount:amount")],
 ["19 product summary reads canonical amount",product.includes('.select("variant_id,currency,amount,')&&product.includes("price: price?.price")],
 ["20 receiving repository writes canonical unit_cost",receiving.includes("unit_cost:cost(")&&receiving.includes("normalizeMoney(text(row.unit_cost))")],
 ["21 order repository writes canonical priceNet",order.includes("priceNet:money(")&&order.includes("priceNet:normalizeMoney(text(row.price_net))")],
 ["22 legacy bridge preserves whole monetary unit",bridge.includes("priceNet:String(Math.max(0,item.priceNet))")],
 ["23 rollback fails closed for fractional money",rollback.includes("COMMERCE_SCHEMA_ROLLBACK_FRACTIONAL_MONEY_PRESENT")],
 ["24 rollback restores old monetary columns",rollback.includes("rename column amount to amount_minor")&&rollback.includes("rename column unit_cost to unit_cost_minor")&&rollback.includes("rename column price_net to price_net_minor")],
 ["25 rollback restores 0.1.8 / 9",rollback.includes("schema_version='0.1.8'")&&rollback.includes("migration_count=9")],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
