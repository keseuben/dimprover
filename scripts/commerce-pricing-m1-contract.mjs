import fs from "node:fs";
import assert from "node:assert/strict";
const sql=fs.readFileSync("supabase/migrations/20260818203000_dimpro_commerce_pricing_m1.sql","utf8");
const conformance=fs.readFileSync("supabase/migrations/20260819104500_dimpro_commerce_schema_conformance_v019.sql","utf8");
const repo=fs.readFileSync("app/lib/commerce/pricing/repository.ts","utf8");
const route=fs.readFileSync("app/api/v1/commerce/prices/route.ts","utf8");
const ui=fs.readFileSync("components/aruter/CommerceProductsAdmin.tsx","utf8");
const checks=[
 ["01 pricing RPC exists",sql.includes("commerce_price_set_active")],
 ["02 variant tenant scope is validated",sql.includes("COMMERCE_PRICE_VARIANT_SCOPE_MISMATCH")],
 ["03 price mutation uses advisory transaction lock",sql.includes("pg_advisory_xact_lock")],
 ["04 previous active price becomes inactive",sql.includes("set status='INACTIVE'")],
 ["05 new active price is append-inserted",sql.includes("insert into public.commerce_prices")&&sql.includes("'ACTIVE'")],
 ["06 direct service price mutation is revoked",sql.includes("revoke insert, update, delete on table public.commerce_prices from service_role")],
 ["07 RPC is service-only",sql.includes("grant execute on function public.commerce_price_set_active")],
 ["08 pricing mutation writes audit",sql.includes("PRICE_SET_ACTIVE")],
 ["09 pricing mutation writes outbox",sql.includes("PRICE_CHANGED")],
 ["10 repository list is organization scoped",repo.includes('.eq("organization_id",context.organizationId)')],
 ["11 repository validates NUMERIC(19,4) money",repo.includes("normalizeMoney")&&repo.includes("compareDecimal")&&conformance.includes("amount type numeric(19,4)")],
 ["12 repository writes through RPC",repo.includes('client.rpc("commerce_price_set_active"')],
 ["13 API GET + POST use Commerce context",route.includes("export async function GET")&&route.includes("export async function POST")&&route.includes("resolveCommerceContext")],
 ["14 UI labels price as net HUF",ui.includes("Új nettó egységár (Ft)")&&ui.includes("27% ÁFA")],
 ["15 UI states price history preservation",ui.includes("korábbi ár az ártörténetben megmarad")],
 ["16 UI saves against variantId",ui.includes('body: JSON.stringify({ variantId, currency: "HUF"')],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`RESULT ${pass}/${checks.length} PASS`);assert.equal(pass,checks.length);
