#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { join } from "node:path";
const root=process.cwd();
const migration=join(root,"supabase/migrations/20260818213000_dimpro_commerce_inventory_reservations_m1.sql");
const args=["-w","-h","aws-0-eu-central-1.pooler.supabase.com","-p","5432","-U","postgres.pbgyuznivqvestuksvif","-d","postgres","-X","-v","ON_ERROR_STOP=1"];
const script=String.raw`
begin;
\i ${migration}
do $$
declare
 v_org uuid; v_wh uuid:=gen_random_uuid(); v_source uuid:=gen_random_uuid(); v_product uuid:=gen_random_uuid(); v_variant uuid:=gen_random_uuid();
 v_receipt jsonb; v_reserve jsonb; v_dup jsonb; v_release jsonb; v_consume jsonb; v_finish jsonb; v_res_id uuid;
 v_physical numeric; v_reserved numeric; v_available numeric; v_remaining numeric; v_events int; v_expiry timestamptz:=now()+interval '1 hour';
begin
 select id into v_org from public.dimpro_organizations where status='active' order by created_at limit 1;
 if v_org is null then raise exception 'RES_QA_ORG_MISSING'; end if;
 insert into public.commerce_warehouses(id,organization_id,code,name,active) values(v_wh,v_org,'RES-QA-'||substr(v_wh::text,1,6),'Reservation QA',true);
 insert into public.commerce_inventory_sources(id,organization_id,warehouse_id,source_type,code,name,active) values(v_source,v_org,v_wh,'INTERNAL','RES-QA-'||substr(v_source::text,1,6),'Reservation QA',true);
 insert into public.commerce_products(id,organization_id,name,slug,status) values(v_product,v_org,'Reservation QA','reservation-qa-'||substr(v_product::text,1,8),'ACTIVE');
 insert into public.commerce_product_variants(id,organization_id,product_id,name,unit,status) values(v_variant,v_org,v_product,'Reservation QA','DB','ACTIVE');
 v_receipt:=public.commerce_inventory_apply_movement(v_org,v_source,v_variant,'SELLABLE','RECEIPT',10,0,0,'res-qa-receipt',null,null,now());
 v_reserve:=public.commerce_inventory_reservation_create(v_org,v_source,v_variant,4,'res-qa-create','SELLABLE','ORDER',gen_random_uuid(),v_expiry);
 v_res_id:=(v_reserve->>'reservationId')::uuid;
 if (v_reserve->>'status')<>'ACTIVE' or (v_reserve->>'remainingQuantity')::numeric<>4 then raise exception 'RES_QA_CREATE %',v_reserve; end if;
 v_dup:=public.commerce_inventory_reservation_create(v_org,v_source,v_variant,4,'res-qa-create','SELLABLE','ORDER',(select reference_id from public.commerce_inventory_reservations where id=v_res_id),v_expiry);
 if coalesce((v_dup->>'duplicate')::boolean,false) is not true then raise exception 'RES_QA_CREATE_IDEMPOTENCY'; end if;
 select physical_quantity,reserved_quantity,available_quantity into v_physical,v_reserved,v_available from public.commerce_inventory_balances where organization_id=v_org and source_id=v_source and variant_id=v_variant and stock_status='SELLABLE';
 if v_physical<>10 or v_reserved<>4 or v_available<>6 then raise exception 'RES_QA_AFTER_RESERVE p=% r=% a=%',v_physical,v_reserved,v_available; end if;
 v_release:=public.commerce_inventory_reservation_apply(v_org,v_res_id,'RELEASE',1,'res-qa-release-1');
 if (v_release->>'remainingQuantity')::numeric<>3 then raise exception 'RES_QA_RELEASE'; end if;
 v_dup:=public.commerce_inventory_reservation_apply(v_org,v_res_id,'RELEASE',1,'res-qa-release-1');
 if coalesce((v_dup->>'duplicate')::boolean,false) is not true then raise exception 'RES_QA_RELEASE_IDEMPOTENCY'; end if;
 v_consume:=public.commerce_inventory_reservation_apply(v_org,v_res_id,'CONSUME',2,'res-qa-consume-2');
 if (v_consume->>'remainingQuantity')::numeric<>1 then raise exception 'RES_QA_CONSUME'; end if;
 v_finish:=public.commerce_inventory_reservation_apply(v_org,v_res_id,'CONSUME',1,'res-qa-consume-1');
 if (v_finish->>'status')<>'CONSUMED' or (v_finish->>'remainingQuantity')::numeric<>0 then raise exception 'RES_QA_FINISH %',v_finish; end if;
 select physical_quantity,reserved_quantity,available_quantity into v_physical,v_reserved,v_available from public.commerce_inventory_balances where organization_id=v_org and source_id=v_source and variant_id=v_variant and stock_status='SELLABLE';
 if v_physical<>7 or v_reserved<>0 or v_available<>7 then raise exception 'RES_QA_FINAL_BALANCE p=% r=% a=%',v_physical,v_reserved,v_available; end if;
 select remaining_quantity into v_remaining from public.commerce_inventory_reservations where id=v_res_id;
 if v_remaining<>0 then raise exception 'RES_QA_REMAINING'; end if;
 select count(*) into v_events from public.commerce_inventory_reservation_events where organization_id=v_org and reservation_id=v_res_id;
 if v_events<>4 then raise exception 'RES_QA_EVENTS %',v_events; end if;
 if has_table_privilege('service_role','public.commerce_inventory_reservations','INSERT') then raise exception 'RES_QA_DIRECT_INSERT_EXPOSED'; end if;
 if has_function_privilege('authenticated','public.commerce_inventory_reservation_create(uuid,uuid,uuid,numeric,text,text,text,uuid,timestamptz)','EXECUTE') then raise exception 'RES_QA_AUTH_RPC_EXPOSED'; end if;
 if not has_function_privilege('service_role','public.commerce_inventory_reservation_apply(uuid,uuid,text,numeric,text)','EXECUTE') then raise exception 'RES_QA_SERVICE_RPC_MISSING'; end if;
end;
$$;
rollback;
`;
const result=spawnSync("psql",args,{cwd:root,encoding:"utf8",input:script});
if(result.status!==0){console.error(result.stdout||"");console.error(result.stderr||"");process.exit(result.status||2);}
const probe=spawnSync("psql",[...args,"-Atc","select json_build_object('version',(select schema_version from public.commerce_schema_meta where component='commerce-core'),'reservations',to_regclass('public.commerce_inventory_reservations') is not null,'events',to_regclass('public.commerce_inventory_reservation_events') is not null)::text;"],{cwd:root,encoding:"utf8"});
if(probe.status!==0){console.error(probe.stderr||"");process.exit(probe.status||2);}
const after=JSON.parse(probe.stdout.trim());
if(after.version!=="0.1.2"||after.reservations||after.events){console.error("FAIL reservation rollback dirty",after);process.exit(2);}
for(const line of [
 "PASS 01 reservation migration applies transactionally","PASS 02 receipt baseline created","PASS 03 reserve creates active reservation","PASS 04 reserve changes reserved/available only","PASS 05 create idempotency works","PASS 06 partial release works","PASS 07 release idempotency works","PASS 08 partial consume works","PASS 09 final consume closes reservation","PASS 10 consume changes physical + reserved","PASS 11 reservation event ledger complete","PASS 12 direct service INSERT denied","PASS 13 authenticated RPC denied","PASS 14 service RPC allowed","PASS 15 rollback restores schema 0.1.2",
])console.log(line);
console.log("RESULT 15/15 PASS");
