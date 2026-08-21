#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const migration = join(root, "supabase/migrations/20260821143000_dimpro_commerce_pilot_units_p2.sql");
const rollback = join(root, "supabase/rollback/DIMPRO_COMMERCE_PILOT_UNITS_P2_ROLLBACK.sql");
const args = ["-w","-h","aws-0-eu-central-1.pooler.supabase.com","-p","5432","-U","postgres.pbgyuznivqvestuksvif","-d","postgres","-X","-v","ON_ERROR_STOP=1"];

const script = String.raw`
begin;
\i ${migration}
do $$
declare
  v_org uuid;
  v_wh uuid := gen_random_uuid();
  v_source uuid := gen_random_uuid();
  v_receipt uuid := gen_random_uuid();
  v_product uuid;
  v_variant uuid;
  v_created jsonb;
  v_marker text := substr(gen_random_uuid()::text,1,8);
  v_sku text;
  v_unit text;
  v_meta text;
begin
  select id into v_org from public.dimpro_organizations where status='active' order by created_at limit 1;
  if v_org is null then raise exception 'P2_UNIT_QA_ORG_MISSING'; end if;

  select schema_version||'/'||migration_count into v_meta
  from public.commerce_schema_meta where component='commerce-core';
  if v_meta <> '0.1.15/16' then raise exception 'P2_UNIT_QA_META_AFTER_MIGRATION %',v_meta; end if;

  v_sku := 'P2-ZSAK-'||upper(v_marker);
  insert into public.commerce_warehouses(id,organization_id,code,name,active)
  values(v_wh,v_org,'P2-WH-'||upper(v_marker),'P2 unit QA warehouse',true);
  insert into public.commerce_inventory_sources(id,organization_id,warehouse_id,source_type,code,name,active)
  values(v_source,v_org,v_wh,'INTERNAL','P2-SRC-'||upper(v_marker),'P2 unit QA source',true);

  v_created := public.commerce_product_create_atomic(
    v_org,
    'P2 zsák QA '||v_marker,
    'p2-zsak-qa-'||v_marker,
    'transactional P2 unit QA',
    null,null,null,null,'ACTIVE',
    jsonb_build_object('name','P2 zsák','sku',v_sku,'unit','ZSAK','attributes',jsonb_build_object('qa',true)),
    jsonb_build_array(jsonb_build_object('type','SKU','value',v_sku,'normalizedValue',upper(v_sku),'primary',true))
  );
  v_product := (v_created->>'productId')::uuid;
  v_variant := (v_created->>'variantId')::uuid;
  select unit into v_unit from public.commerce_product_variants where id=v_variant;
  if v_unit <> 'ZSAK' then raise exception 'P2_UNIT_QA_PRODUCT_RPC %',v_unit; end if;

  insert into public.commerce_goods_receipts(id,organization_id,warehouse_id,source_id,receipt_number,status,received_at)
  values(v_receipt,v_org,v_wh,v_source,'P2-REC-'||upper(v_marker),'DRAFT',now());
  insert into public.commerce_goods_receipt_items(organization_id,receipt_id,variant_id,stock_status,quantity,unit,currency)
  values(v_org,v_receipt,v_variant,'SELLABLE',2,'ZSAK','HUF');

  if not exists(select 1 from public.commerce_goods_receipt_items where receipt_id=v_receipt and unit='ZSAK') then
    raise exception 'P2_UNIT_QA_RECEIVING_ZSAK_MISSING';
  end if;

  delete from public.commerce_goods_receipt_items where receipt_id=v_receipt;
  delete from public.commerce_goods_receipts where id=v_receipt;
  delete from public.commerce_product_identifiers where product_id=v_product;
  delete from public.commerce_product_variants where product_id=v_product;
  delete from public.commerce_products where id=v_product;
  delete from public.commerce_inventory_sources where id=v_source;
  delete from public.commerce_warehouses where id=v_wh;
end;
$$;
\i ${rollback}
do $$
declare
  v_meta text;
  v_constraint text;
  v_function text;
begin
  select schema_version||'/'||migration_count into v_meta
  from public.commerce_schema_meta where component='commerce-core';
  if v_meta <> '0.1.14/15' then raise exception 'P2_UNIT_QA_META_AFTER_ROLLBACK %',v_meta; end if;
  select pg_get_constraintdef(oid) into v_constraint
  from pg_constraint
  where conrelid='public.commerce_product_variants'::regclass
    and conname='commerce_product_variants_unit_check';
  if position('ZSAK' in coalesce(v_constraint,'')) > 0 then raise exception 'P2_UNIT_QA_PRODUCT_CONSTRAINT_DIRTY'; end if;
  select pg_get_functiondef('public.commerce_product_create_atomic(uuid,text,text,text,text,uuid,uuid,uuid,text,jsonb,jsonb)'::regprocedure) into v_function;
  if position('ZSAK' in coalesce(v_function,'')) > 0 then raise exception 'P2_UNIT_QA_PRODUCT_RPC_DIRTY'; end if;
end;
$$;
rollback;
`;

const run = spawnSync("psql", args, { cwd: root, encoding: "utf8", input: script, maxBuffer: 8 * 1024 * 1024 });
if (run.status !== 0) {
  console.error(run.stdout || "");
  console.error(run.stderr || "");
  process.exit(run.status || 2);
}

const probeSql = `select json_build_object(
  'version',(select schema_version from public.commerce_schema_meta where component='commerce-core'),
  'count',(select migration_count from public.commerce_schema_meta where component='commerce-core'),
  'productConstraint',pg_get_constraintdef((select oid from pg_constraint where conrelid='public.commerce_product_variants'::regclass and conname='commerce_product_variants_unit_check')),
  'receiptConstraint',pg_get_constraintdef((select oid from pg_constraint where conrelid='public.commerce_goods_receipt_items'::regclass and conname='commerce_goods_receipt_items_unit_check'))
)::text;`;
const probe = spawnSync("psql", [...args, "-Atc", probeSql], { cwd: root, encoding: "utf8" });
if (probe.status !== 0) {
  console.error(probe.stderr || "");
  process.exit(probe.status || 2);
}
const after = JSON.parse(probe.stdout.trim());
if (after.version !== "0.1.14" || Number(after.count) !== 15 || String(after.productConstraint).includes("ZSAK") || String(after.receiptConstraint).includes("ZSAK")) {
  console.error("FAIL P2 unit rollback dirty", after);
  process.exit(2);
}

[
  "migration applies transactionally",
  "Commerce schema advances to 0.1.15 / 16 inside transaction",
  "product create RPC accepts ZSAK",
  "ProductVariant persists ZSAK",
  "GoodsReceiptItem accepts ZSAK",
  "fixture is removed before rollback gate",
  "explicit P2 rollback SQL executes",
  "rollback restores Commerce 0.1.14 / 15",
  "rollback restores old ProductVariant unit constraint",
  "rollback restores old product create RPC",
  "outer transaction leaves DEV baseline unchanged",
].forEach((name,index)=>console.log(`PASS ${String(index+1).padStart(2,"0")} ${name}`));
console.log("RESULT 11/11 PASS");
