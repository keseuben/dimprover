#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { join } from "node:path";
const root=process.cwd();const migration=join(root,"supabase/migrations/20260818234500_dimpro_commerce_order_core_m1.sql");
const args=["-w","-h","aws-0-eu-central-1.pooler.supabase.com","-p","5432","-U","postgres.pbgyuznivqvestuksvif","-d","postgres","-X","-v","ON_ERROR_STOP=1"];
const script=String.raw`
begin;
\i ${migration}
do $$
declare
 v_org uuid; v_user uuid; v_created jsonb; v_dup jsonb; v_paid jsonb; v_paid_dup jsonb; v_issued jsonb; v_order uuid; v_items int; v_events int; v_audit int; v_outbox int;
begin
 select m.organization_id,m.user_id into v_org,v_user from public.dimpro_organization_memberships m join public.dimpro_organizations o on o.id=m.organization_id where m.status='active' and o.status='active' order by m.created_at limit 1;
 if v_org is null or v_user is null then raise exception 'ORDER_QA_MEMBERSHIP_MISSING'; end if;
 v_created:=public.commerce_order_create_atomic(v_org,'ORDER-QA-001','EXTERNAL_MARKETPLACE','legacy-aruter:qa-1','QA Vevő','LOYAL_CUSTOMER','Külső piactér',null,'QA','SENT_TO_CASHIER',jsonb_build_array(
  jsonb_build_object('productName','QA alma','sku','QA-ALMA','unit','KG','quantity','2.5','priceNetMinor','590','vatRateBasisPoints',2700,'storageZone','A-01'),
  jsonb_build_object('productName','QA láda','sku','QA-LADA','unit','LADA','quantity','1','priceNetMinor','2500','vatRateBasisPoints',2700)
 ),v_user,'order-qa-create');
 v_order:=(v_created->>'orderId')::uuid;
 if (v_created->>'status')<>'SENT_TO_CASHIER' or (v_created->>'itemCount')::int<>2 then raise exception 'ORDER_QA_CREATE %',v_created; end if;
 v_dup:=public.commerce_order_create_atomic(v_org,'ORDER-QA-001','EXTERNAL_MARKETPLACE','legacy-aruter:qa-1','QA Vevő','LOYAL_CUSTOMER','Külső piactér',null,'QA','SENT_TO_CASHIER',jsonb_build_array(
  jsonb_build_object('productName','QA alma','sku','QA-ALMA','unit','KG','quantity','2.5','priceNetMinor','590','vatRateBasisPoints',2700,'storageZone','A-01'),
  jsonb_build_object('productName','QA láda','sku','QA-LADA','unit','LADA','quantity','1','priceNetMinor','2500','vatRateBasisPoints',2700)
 ),v_user,'order-qa-create');
 if coalesce((v_dup->>'duplicate')::boolean,false) is not true or (v_dup->>'orderId')::uuid<>v_order then raise exception 'ORDER_QA_CREATE_IDEMPOTENCY'; end if;
 begin
   perform public.commerce_order_create_atomic(v_org,'ORDER-QA-001','EXTERNAL_MARKETPLACE','legacy-aruter:qa-1','QA Vevő','LOYAL_CUSTOMER','Külső piactér',null,'QA','SENT_TO_CASHIER',jsonb_build_array(jsonb_build_object('productName','MÓDOSÍTOTT TÉTEL','unit','KG','quantity','99','priceNetMinor','1','vatRateBasisPoints',2700)),v_user,'order-qa-create');
   raise exception 'ORDER_QA_PAYLOAD_MISMATCH_NOT_REJECTED';
 exception when others then
   if position('COMMERCE_ORDER_IDEMPOTENCY_PAYLOAD_MISMATCH' in sqlerrm)=0 then raise; end if;
 end;
 select count(*) into v_items from public.commerce_order_items where organization_id=v_org and order_id=v_order;
 if v_items<>2 then raise exception 'ORDER_QA_ITEMS %',v_items; end if;
 if exists(select 1 from public.commerce_order_items where organization_id=v_org and order_id=v_order and inventory_status<>'UNRESOLVED') then raise exception 'ORDER_QA_UNRESOLVED_STATUS'; end if;
 v_paid:=public.commerce_order_set_status(v_org,v_order,'PAID','CARD','QA Pénztáros',null,v_user,'order-qa-paid');
 if (v_paid->>'status')<>'PAID' then raise exception 'ORDER_QA_PAID %',v_paid; end if;
 v_paid_dup:=public.commerce_order_set_status(v_org,v_order,'PAID','CARD','QA Pénztáros',null,v_user,'order-qa-paid');
 if coalesce((v_paid_dup->>'duplicate')::boolean,false) is not true then raise exception 'ORDER_QA_PAID_IDEMPOTENCY'; end if;
 v_issued:=public.commerce_order_set_status(v_org,v_order,'ISSUED',null,null,'QA Kiadó',v_user,'order-qa-issued');
 if (v_issued->>'status')<>'ISSUED' then raise exception 'ORDER_QA_ISSUED %',v_issued; end if;
 if not exists(select 1 from public.commerce_orders where id=v_order and status='ISSUED' and payment_method='CARD' and cashier_name='QA Pénztáros' and issuer_name='QA Kiadó' and paid_at is not null and issued_at is not null) then raise exception 'ORDER_QA_STATUS_PERSIST'; end if;
 select count(*) into v_events from public.commerce_order_status_events where organization_id=v_org and order_id=v_order;
 if v_events<>3 then raise exception 'ORDER_QA_STATUS_EVENTS %',v_events; end if;
 select count(*) into v_audit from public.commerce_audit_events where organization_id=v_org and entity_type='ORDER' and entity_id=v_order;
 select count(*) into v_outbox from public.commerce_outbox_events where organization_id=v_org and aggregate_type='ORDER' and aggregate_id=v_order;
 if v_audit<>3 or v_outbox<>3 then raise exception 'ORDER_QA_AUDIT_OUTBOX audit=% outbox=%',v_audit,v_outbox; end if;
 if has_function_privilege('authenticated','public.commerce_order_create_atomic(uuid,text,text,text,text,text,text,timestamptz,text,text,jsonb,uuid,text)','EXECUTE') then raise exception 'ORDER_QA_AUTH_CREATE_EXPOSED'; end if;
 if has_function_privilege('authenticated','public.commerce_order_set_status(uuid,uuid,text,text,text,text,uuid,text)','EXECUTE') then raise exception 'ORDER_QA_AUTH_STATUS_EXPOSED'; end if;
 if not has_function_privilege('service_role','public.commerce_order_create_atomic(uuid,text,text,text,text,text,text,timestamptz,text,text,jsonb,uuid,text)','EXECUTE') then raise exception 'ORDER_QA_SERVICE_CREATE_MISSING'; end if;
end;
$$;
rollback;
`;
const r=spawnSync("psql",args,{cwd:root,encoding:"utf8",input:script});if(r.status!==0){console.error(r.stdout||"");console.error(r.stderr||"");process.exit(r.status||2);}
const probe=spawnSync("psql",[...args,"-Atc","select json_build_object('version',(select schema_version from public.commerce_schema_meta where component='commerce-core'),'orders',to_regclass('public.commerce_orders') is not null,'items',to_regclass('public.commerce_order_items') is not null,'events',to_regclass('public.commerce_order_status_events') is not null,'createRpc',to_regprocedure('public.commerce_order_create_atomic(uuid,text,text,text,text,text,text,timestamptz,text,text,jsonb,uuid,text)') is not null)::text;"],{cwd:root,encoding:"utf8"});if(probe.status!==0){console.error(probe.stderr||"");process.exit(probe.status||2);}const after=JSON.parse(probe.stdout.trim());if(after.version!=="0.1.5"||after.orders||after.items||after.events||after.createRpc){console.error("FAIL order rollback dirty",after);process.exit(2);}
for(const line of ["PASS 01 Order Core migration applies transactionally","PASS 02 external marketplace SENT_TO_CASHIER order created","PASS 03 two legacy snapshot items created","PASS 04 unresolved inventory state preserves legacy items without Commerce mapping","PASS 05 exact create replay is idempotent","PASS 06 same key with changed payload is rejected","PASS 07 SENT_TO_CASHIER -> PAID transition works","PASS 08 PAID status is idempotent","PASS 09 PAID -> ISSUED transition works","PASS 10 cashier/payment/issuer timestamps persist","PASS 11 status event ledger records create+paid+issued","PASS 12 audit events emitted","PASS 13 outbox events emitted","PASS 14 authenticated create RPC denied","PASS 15 authenticated status RPC denied","PASS 16 service create RPC allowed","PASS 17 rollback restores Commerce 0.1.5"])console.log(line);console.log("RESULT 17/17 PASS");
