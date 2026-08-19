#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const migration = join(root, "supabase/migrations/20260818183000_dimpro_commerce_core_m0_m1.sql");
const args = ["-w","-h","aws-0-eu-central-1.pooler.supabase.com","-p","5432","-U","postgres.pbgyuznivqvestuksvif","-d","postgres","-X","-v","ON_ERROR_STOP=1"];
const sql = String.raw`
begin;
\i ${migration}

do $$
declare
  v_org uuid;
  v_warehouse uuid;
  v_source uuid;
  v_external_source uuid;
  v_product jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_result jsonb;
  v_count integer;
begin
  select id into v_org from public.dimpro_organizations where status='active' order by created_at limit 1;
  if v_org is null then raise exception 'ACCEPTANCE_ACTIVE_ORG_MISSING'; end if;

  insert into public.commerce_warehouses(organization_id,code,name) values (v_org,'OUTMIN-QA-WH','Outmin QA warehouse') returning id into v_warehouse;
  insert into public.commerce_inventory_sources(organization_id,warehouse_id,source_type,code,name)
  values (v_org,v_warehouse,'INTERNAL','OUTMIN-QA-INTERNAL','Outmin QA internal') returning id into v_source;
  insert into public.commerce_inventory_sources(organization_id,warehouse_id,source_type,code,name,external_system)
  values (v_org,null,'EXTERNAL','OUTMIN-QA-EXTERNAL','Outmin QA external','QA') returning id into v_external_source;

  v_product := public.commerce_product_create_atomic(
    v_org,
    'Outmin Commerce QA termék',
    'outmin-commerce-qa-' || substr(gen_random_uuid()::text,1,8),
    'Rollback acceptance product',
    'QA-100',
    null,null,null,'ACTIVE',
    jsonb_build_object('name','Alapváltozat','sku','OUTMIN-QA-SKU-'||substr(gen_random_uuid()::text,1,6),'unit','DB','attributes',jsonb_build_object('qa',true)),
    jsonb_build_array(jsonb_build_object('type','EAN_GTIN','value','4006381333931','normalizedValue','4006381333931','primary',true))
  );
  v_product_id := (v_product->>'productId')::uuid;
  v_variant_id := (v_product->>'variantId')::uuid;
  if v_product_id is null or v_variant_id is null then raise exception 'ACCEPTANCE_PRODUCT_RPC_INVALID'; end if;

  v_result := public.commerce_inventory_apply_movement(v_org,v_source,v_variant_id,'SELLABLE','RECEIPT',10,0,0,'outmin-qa-receipt',null,null,now());
  if coalesce((v_result->>'duplicate')::boolean,true) or (v_result->>'physicalQuantity')::numeric<>10 or (v_result->>'availableQuantity')::numeric<>10 then
    raise exception 'ACCEPTANCE_RECEIPT_INVALID %', v_result;
  end if;

  v_result := public.commerce_inventory_apply_movement(v_org,v_source,v_variant_id,'SELLABLE','RECEIPT',10,0,0,'outmin-qa-receipt',null,null,now());
  if not coalesce((v_result->>'duplicate')::boolean,false) or (v_result->>'physicalQuantity')::numeric<>10 then
    raise exception 'ACCEPTANCE_IDEMPOTENCY_DUPLICATE_INVALID %', v_result;
  end if;

  v_result := public.commerce_inventory_apply_movement(v_org,v_source,v_variant_id,'SELLABLE','RESERVATION_COMMIT',0,3,0,'outmin-qa-reserve',null,null,now());
  if (v_result->>'reservedQuantity')::numeric<>3 or (v_result->>'availableQuantity')::numeric<>7 then raise exception 'ACCEPTANCE_RESERVATION_INVALID %',v_result; end if;

  v_result := public.commerce_inventory_apply_movement(v_org,v_source,v_variant_id,'SELLABLE','SALE',-2,-2,0,'outmin-qa-sale',null,null,now());
  if (v_result->>'physicalQuantity')::numeric<>8 or (v_result->>'reservedQuantity')::numeric<>1 or (v_result->>'availableQuantity')::numeric<>7 then
    raise exception 'ACCEPTANCE_SALE_INVALID %',v_result;
  end if;

  begin
    perform public.commerce_inventory_apply_movement(v_org,v_source,v_variant_id,'SELLABLE','RESERVATION_COMMIT',0,100,0,'outmin-qa-overreserve',null,null,now());
    raise exception 'ACCEPTANCE_EXPECTED_OVERRESERVE_FAILURE';
  exception when others then
    if sqlerrm='ACCEPTANCE_EXPECTED_OVERRESERVE_FAILURE' or position('COMMERCE_RESERVED_EXCEEDS_PHYSICAL' in sqlerrm)=0 then raise; end if;
  end;

  begin
    perform public.commerce_inventory_apply_movement(v_org,v_source,v_variant_id,'SELLABLE','RECEIPT',11,0,0,'outmin-qa-receipt',null,null,now());
    raise exception 'ACCEPTANCE_EXPECTED_IDEMPOTENCY_MISMATCH';
  exception when others then
    if sqlerrm='ACCEPTANCE_EXPECTED_IDEMPOTENCY_MISMATCH' or position('COMMERCE_IDEMPOTENCY_PAYLOAD_MISMATCH' in sqlerrm)=0 then raise; end if;
  end;

  begin
    perform public.commerce_inventory_apply_movement(v_org,v_external_source,v_variant_id,'SELLABLE','RECEIPT',1,0,0,'outmin-qa-external',null,null,now());
    raise exception 'ACCEPTANCE_EXPECTED_EXTERNAL_SOURCE_FAILURE';
  exception when others then
    if sqlerrm='ACCEPTANCE_EXPECTED_EXTERNAL_SOURCE_FAILURE' or position('COMMERCE_INTERNAL_SOURCE_NOT_FOUND' in sqlerrm)=0 then raise; end if;
  end;

  select count(*) into v_count from public.commerce_stock_movements where organization_id=v_org and variant_id=v_variant_id;
  if v_count<>3 then raise exception 'ACCEPTANCE_LEDGER_COUNT_INVALID %',v_count; end if;
  select count(*) into v_count from public.commerce_outbox_events where organization_id=v_org and aggregate_id in (v_product_id,v_variant_id);
  if v_count<>4 then raise exception 'ACCEPTANCE_OUTBOX_COUNT_INVALID %',v_count; end if;
  if has_table_privilege('anon','public.commerce_products','SELECT') then raise exception 'ACCEPTANCE_ANON_TABLE_ACCESS'; end if;
  if has_table_privilege('authenticated','public.commerce_products','SELECT') then raise exception 'ACCEPTANCE_AUTH_TABLE_ACCESS'; end if;
  if not has_table_privilege('service_role','public.commerce_products','SELECT') then raise exception 'ACCEPTANCE_SERVICE_PRODUCT_READ_MISSING'; end if;
  if has_table_privilege('service_role','public.commerce_stock_movements','UPDATE') then raise exception 'ACCEPTANCE_LEDGER_UPDATE_EXPOSED'; end if;
  if has_table_privilege('service_role','public.commerce_inventory_balances','UPDATE') then raise exception 'ACCEPTANCE_BALANCE_UPDATE_EXPOSED'; end if;
  if has_function_privilege('anon','public.commerce_inventory_apply_movement(uuid,uuid,uuid,text,text,numeric,numeric,numeric,text,text,uuid,timestamptz)','EXECUTE') then raise exception 'ACCEPTANCE_ANON_RPC_EXPOSED'; end if;
  if not has_function_privilege('service_role','public.commerce_inventory_apply_movement(uuid,uuid,uuid,text,text,numeric,numeric,numeric,text,text,uuid,timestamptz)','EXECUTE') then raise exception 'ACCEPTANCE_SERVICE_RPC_MISSING'; end if;
end;
$$;

rollback;
`;
const result = spawnSync("psql", args, { cwd:root, encoding:"utf8", input:sql });
if (result.status !== 0) {
  console.error(result.stdout || "");
  console.error(result.stderr || "");
  process.exit(result.status || 2);
}
const probe = spawnSync("psql", [...args,"-Atc","select json_build_object('commerce',to_regclass('public.commerce_products') is not null,'inventory',to_regclass('public.commerce_inventory_balances') is not null,'productRpc',to_regprocedure('public.commerce_product_create_atomic(uuid,text,text,text,text,uuid,uuid,uuid,text,jsonb,jsonb)') is not null)::text;"], { cwd:root, encoding:"utf8" });
if (probe.status !== 0) { console.error(probe.stderr); process.exit(probe.status || 2); }
const after = JSON.parse((probe.stdout || "{}").trim());
if (after.commerce || after.inventory || after.productRpc) {
  console.error("FAIL rollback left Commerce objects", after);
  process.exit(2);
}
console.log("PASS 01 atomic product RPC creates product + variant");
console.log("PASS 02 receipt writes inventory balance");
console.log("PASS 03 repeated idempotency key is a no-op duplicate");
console.log("PASS 04 reservation reduces available quantity");
console.log("PASS 05 sale updates physical and reserved quantities atomically");
console.log("PASS 06 over-reservation is rejected");
console.log("PASS 07 idempotency payload mismatch is rejected");
console.log("PASS 08 external source is rejected by internal ledger");
console.log("PASS 09 append-only ledger count is deterministic");
console.log("PASS 10 product + movement outbox events are generated");
console.log("PASS 11 anon/authenticated direct table access is denied");
console.log("PASS 12 service_role product read is available");
console.log("PASS 13 ledger/balance direct update is denied to service_role");
console.log("PASS 14 inventory RPC is service-only");
console.log("PASS 15 full acceptance transaction rolled back cleanly");
console.log("RESULT 15/15 PASS");
