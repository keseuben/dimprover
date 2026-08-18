#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { join } from "node:path";
const root=process.cwd();const migration=join(root,"supabase/migrations/20260818235500_dimpro_commerce_order_inventory_bridge_m1.sql");
const args=["-w","-h","aws-0-eu-central-1.pooler.supabase.com","-p","5432","-U","postgres.pbgyuznivqvestuksvif","-d","postgres","-X","-v","ON_ERROR_STOP=1"];
const script=String.raw`
begin;
\i ${migration}
do $$
declare
 v_org uuid; v_user uuid; v_wh uuid:=gen_random_uuid(); v_source uuid:=gen_random_uuid(); v_product uuid:=gen_random_uuid(); v_variant uuid:=gen_random_uuid();
 v_order uuid; v_order_cancel uuid; v_order_block uuid; v_order_legacy uuid; v_created jsonb; v_reserve jsonb; v_dup jsonb; v_status jsonb;
 v_physical numeric; v_reserved numeric; v_available numeric; v_item_status text; v_unresolved int; v_events int;
begin
 select m.organization_id,m.user_id into v_org,v_user from public.dimpro_organization_memberships m join public.dimpro_organizations o on o.id=m.organization_id where m.status='active' and o.status='active' order by m.created_at limit 1;
 if v_org is null or v_user is null then raise exception 'ORDER_BRIDGE_QA_MEMBERSHIP_MISSING'; end if;
 insert into public.commerce_warehouses(id,organization_id,code,name,active) values(v_wh,v_org,'OB-QA-'||substr(v_wh::text,1,6),'Order bridge QA',true);
 insert into public.commerce_inventory_sources(id,organization_id,warehouse_id,source_type,code,name,active) values(v_source,v_org,v_wh,'INTERNAL','OB-QA-'||substr(v_source::text,1,6),'Order bridge QA',true);
 insert into public.commerce_products(id,organization_id,name,slug,status) values(v_product,v_org,'Order bridge QA','order-bridge-'||substr(v_product::text,1,8),'ACTIVE');
 insert into public.commerce_product_variants(id,organization_id,product_id,name,unit,status) values(v_variant,v_org,v_product,'Order bridge QA','DB','ACTIVE');
 perform public.commerce_inventory_apply_movement(v_org,v_source,v_variant,'SELLABLE','RECEIPT',10,0,0,'order-bridge-seed','QA',null,now());

 v_created:=public.commerce_order_create_atomic(v_org,'OB-QA-001','EXTERNAL_MARKETPLACE','bridge-qa-1','QA Vevő','LOYAL_CUSTOMER','Külső Árutér',null,null,'SENT_TO_CASHIER',jsonb_build_array(
  jsonb_build_object('productId',v_product,'variantId',v_variant,'productName','Map-elt termék','sku','OB-QA','unit','DB','quantity','4','priceNetMinor','1000','vatRateBasisPoints',2700),
  jsonb_build_object('productName','Legacy unmapped','sku','LEGACY','unit','DB','quantity','1','priceNetMinor','500','vatRateBasisPoints',2700)
 ),v_user,'ob-qa-create-1'); v_order:=(v_created->>'orderId')::uuid;
 v_reserve:=public.commerce_order_reserve_inventory(v_org,v_order,v_source,now()+interval '2 hours',v_user,'ob-qa-reserve-1');
 if (v_reserve->>'mappedItemCount')::int<>1 or (v_reserve->>'reservedItemCount')::int<>1 or (v_reserve->>'unresolvedItemCount')::int<>1 then raise exception 'ORDER_BRIDGE_QA_RESERVE %',v_reserve; end if;
 v_dup:=public.commerce_order_reserve_inventory(v_org,v_order,v_source,now()+interval '2 hours',v_user,'ob-qa-reserve-1');
 if coalesce((v_dup->>'duplicate')::boolean,false) is not true then raise exception 'ORDER_BRIDGE_QA_RESERVE_IDEMPOTENCY'; end if;
 select physical_quantity,reserved_quantity,available_quantity into v_physical,v_reserved,v_available from public.commerce_inventory_balances where organization_id=v_org and source_id=v_source and variant_id=v_variant and stock_status='SELLABLE';
 if v_physical<>10 or v_reserved<>4 or v_available<>6 then raise exception 'ORDER_BRIDGE_QA_BALANCE_RESERVED %/%/%',v_physical,v_reserved,v_available; end if;
 select count(*) into v_unresolved from public.commerce_order_items where organization_id=v_org and order_id=v_order and variant_id is null and inventory_status='UNRESOLVED';
 if v_unresolved<>1 then raise exception 'ORDER_BRIDGE_QA_UNRESOLVED'; end if;
 v_status:=public.commerce_order_set_status(v_org,v_order,'PAID','CARD','QA Pénztáros',null,v_user,'ob-qa-paid-1');
 select reserved_quantity into v_reserved from public.commerce_inventory_balances where organization_id=v_org and source_id=v_source and variant_id=v_variant and stock_status='SELLABLE';
 if v_reserved<>4 then raise exception 'ORDER_BRIDGE_QA_PAID_CONSUMED'; end if;
 v_status:=public.commerce_order_set_status(v_org,v_order,'ISSUED',null,null,'QA Kiadó',v_user,'ob-qa-issued-1');
 select physical_quantity,reserved_quantity,available_quantity into v_physical,v_reserved,v_available from public.commerce_inventory_balances where organization_id=v_org and source_id=v_source and variant_id=v_variant and stock_status='SELLABLE';
 if v_physical<>6 or v_reserved<>0 or v_available<>6 then raise exception 'ORDER_BRIDGE_QA_BALANCE_ISSUED %/%/%',v_physical,v_reserved,v_available; end if;
 select inventory_status into v_item_status from public.commerce_order_items where organization_id=v_org and order_id=v_order and variant_id=v_variant;
 if v_item_status<>'CONSUMED' then raise exception 'ORDER_BRIDGE_QA_ITEM_NOT_CONSUMED %',v_item_status; end if;

 v_created:=public.commerce_order_create_atomic(v_org,'OB-QA-002','INTERNAL_COUNTER',null,'QA Cancel','WALK_IN','QA',null,null,'SENT_TO_CASHIER',jsonb_build_array(jsonb_build_object('productId',v_product,'variantId',v_variant,'productName','Cancel termék','unit','DB','quantity','2','priceNetMinor','1000','vatRateBasisPoints',2700)),v_user,'ob-qa-create-2'); v_order_cancel:=(v_created->>'orderId')::uuid;
 perform public.commerce_order_reserve_inventory(v_org,v_order_cancel,v_source,null,v_user,'ob-qa-reserve-2');
 select reserved_quantity into v_reserved from public.commerce_inventory_balances where organization_id=v_org and source_id=v_source and variant_id=v_variant and stock_status='SELLABLE'; if v_reserved<>2 then raise exception 'ORDER_BRIDGE_QA_CANCEL_RESERVE'; end if;
 perform public.commerce_order_set_status(v_org,v_order_cancel,'CANCELLED',null,null,null,v_user,'ob-qa-cancel-2');
 select physical_quantity,reserved_quantity,available_quantity into v_physical,v_reserved,v_available from public.commerce_inventory_balances where organization_id=v_org and source_id=v_source and variant_id=v_variant and stock_status='SELLABLE';
 if v_physical<>6 or v_reserved<>0 or v_available<>6 then raise exception 'ORDER_BRIDGE_QA_CANCEL_BALANCE'; end if;
 select inventory_status into v_item_status from public.commerce_order_items where organization_id=v_org and order_id=v_order_cancel limit 1; if v_item_status<>'RELEASED' then raise exception 'ORDER_BRIDGE_QA_CANCEL_ITEM'; end if;

 v_created:=public.commerce_order_create_atomic(v_org,'OB-QA-003','INTERNAL_COUNTER',null,'QA Block','WALK_IN','QA',null,null,'SENT_TO_CASHIER',jsonb_build_array(jsonb_build_object('productId',v_product,'variantId',v_variant,'productName','Block termék','unit','DB','quantity','1','priceNetMinor','1000','vatRateBasisPoints',2700)),v_user,'ob-qa-create-3'); v_order_block:=(v_created->>'orderId')::uuid;
 perform public.commerce_order_set_status(v_org,v_order_block,'PAID','CARD','QA Pénztáros',null,v_user,'ob-qa-paid-3');
 begin
  perform public.commerce_order_set_status(v_org,v_order_block,'ISSUED',null,null,'QA Kiadó',v_user,'ob-qa-issued-3');
  raise exception 'ORDER_BRIDGE_QA_MISSING_RESERVATION_NOT_BLOCKED';
 exception when others then
  if position('COMMERCE_ORDER_RESERVATION_REQUIRED' in sqlerrm)=0 then raise; end if;
 end;

 v_created:=public.commerce_order_create_atomic(v_org,'OB-QA-004','EXTERNAL_MARKETPLACE','legacy-only-4','Legacy csak','GUEST','Külső',null,null,'SENT_TO_CASHIER',jsonb_build_array(jsonb_build_object('productName','Ismeretlen legacy','unit','DB','quantity','1','priceNetMinor','100','vatRateBasisPoints',2700)),v_user,'ob-qa-create-4'); v_order_legacy:=(v_created->>'orderId')::uuid;
 perform public.commerce_order_set_status(v_org,v_order_legacy,'PAID','CASH','QA Pénztáros',null,v_user,'ob-qa-paid-4');
 perform public.commerce_order_set_status(v_org,v_order_legacy,'ISSUED',null,null,'QA Kiadó',v_user,'ob-qa-issued-4');
 if not exists(select 1 from public.commerce_orders where id=v_order_legacy and status='ISSUED') then raise exception 'ORDER_BRIDGE_QA_LEGACY_BLOCKED'; end if;

 select count(*) into v_events from public.commerce_order_inventory_events where organization_id=v_org and order_id in(v_order,v_order_cancel);
 if v_events<>2 then raise exception 'ORDER_BRIDGE_QA_EVENTS %',v_events; end if;
 if has_function_privilege('authenticated','public.commerce_order_reserve_inventory(uuid,uuid,uuid,timestamptz,uuid,text)','EXECUTE') then raise exception 'ORDER_BRIDGE_QA_AUTH_RESERVE_EXPOSED'; end if;
 if not has_function_privilege('service_role','public.commerce_order_reserve_inventory(uuid,uuid,uuid,timestamptz,uuid,text)','EXECUTE') then raise exception 'ORDER_BRIDGE_QA_SERVICE_RESERVE_MISSING'; end if;
end;
$$;
rollback;
`;
const r=spawnSync("psql",args,{cwd:root,encoding:"utf8",input:script});if(r.status!==0){console.error(r.stdout||"");console.error(r.stderr||"");process.exit(r.status||2);}
const probeSql=`select json_build_object('version',(select schema_version from public.commerce_schema_meta where component='commerce-core'),'bridge',to_regprocedure('public.commerce_order_reserve_inventory(uuid,uuid,uuid,timestamptz,uuid,text)') is not null,'events',to_regclass('public.commerce_order_inventory_events') is not null,'sourceColumn',exists(select 1 from information_schema.columns where table_schema='public' and table_name='commerce_orders' and column_name='fulfillment_source_id'))::text;`;
const probe=spawnSync("psql",[...args,"-Atc",probeSql],{cwd:root,encoding:"utf8"});if(probe.status!==0){console.error(probe.stderr||"");process.exit(probe.status||2);}const after=JSON.parse(probe.stdout.trim());if(after.version!=="0.1.6"||after.bridge||after.events||after.sourceColumn){console.error("FAIL bridge rollback dirty",after);process.exit(2);}
for(const line of [
"PASS 01 bridge migration applies transactionally","PASS 02 mapped + unresolved mixed order created","PASS 03 mapped item reservation created","PASS 04 unresolved legacy item remains visible/unreserved","PASS 05 reserve operation is idempotent","PASS 06 reserved balance is physical 10 / reserved 4 / available 6","PASS 07 PAID keeps reservation intact","PASS 08 ISSUED consumes reservation","PASS 09 ISSUED physical balance becomes 6 / reserved 0","PASS 10 mapped order item becomes CONSUMED","PASS 11 second order reserves quantity 2","PASS 12 CANCELLED releases reservation","PASS 13 cancelled item becomes RELEASED","PASS 14 mapped PAID order without reservation cannot be ISSUED","PASS 15 fully unresolved legacy order can still be PAID then ISSUED","PASS 16 order inventory event ledger records reserve operations","PASS 17 authenticated reserve RPC denied","PASS 18 service reserve RPC allowed","PASS 19 rollback removes bridge function/table/column","PASS 20 rollback restores Commerce 0.1.6"
])console.log(line);console.log("RESULT 20/20 PASS");
