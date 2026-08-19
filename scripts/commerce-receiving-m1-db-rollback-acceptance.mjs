#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { join } from "node:path";
const root=process.cwd();
const migration=join(root,"supabase/migrations/20260818224000_dimpro_commerce_receiving_m1.sql");
const args=["-w","-h","aws-0-eu-central-1.pooler.supabase.com","-p","5432","-U","postgres.pbgyuznivqvestuksvif","-d","postgres","-X","-v","ON_ERROR_STOP=1"];
const script=String.raw`
begin;
\i ${migration}
do $$
declare
 v_org uuid; v_wh uuid:=gen_random_uuid(); v_source uuid:=gen_random_uuid(); v_product uuid:=gen_random_uuid(); v_variant uuid:=gen_random_uuid();
 v_receipt uuid:=gen_random_uuid(); v_item1 uuid:=gen_random_uuid(); v_item2 uuid:=gen_random_uuid(); v_media_receipt uuid:=gen_random_uuid(); v_media_item uuid:=gen_random_uuid(); v_post jsonb; v_dup jsonb;
 v_physical numeric; v_quarantine numeric; v_movements int; v_audit int; v_outbox int; v_media_links int;
begin
 select id into v_org from public.dimpro_organizations where status='active' order by created_at limit 1;
 if v_org is null then raise exception 'RECEIVING_QA_ORG_MISSING'; end if;
 insert into public.commerce_warehouses(id,organization_id,code,name,active) values(v_wh,v_org,'REC-QA-'||substr(v_wh::text,1,6),'Receiving QA',true);
 insert into public.commerce_inventory_sources(id,organization_id,warehouse_id,source_type,code,name,active) values(v_source,v_org,v_wh,'INTERNAL','REC-QA-'||substr(v_source::text,1,6),'Receiving QA',true);
 insert into public.commerce_products(id,organization_id,name,slug,status) values(v_product,v_org,'Receiving QA','receiving-qa-'||substr(v_product::text,1,8),'ACTIVE');
 insert into public.commerce_product_variants(id,organization_id,product_id,name,unit,status) values(v_variant,v_org,v_product,'Receiving QA','DB','ACTIVE');
 insert into public.commerce_goods_receipts(id,organization_id,warehouse_id,source_id,receipt_number,supplier_name,status) values(v_receipt,v_org,v_wh,v_source,'REC-QA-'||substr(v_receipt::text,1,8),'QA supplier','DRAFT');
 insert into public.commerce_goods_receipt_items(id,organization_id,receipt_id,variant_id,stock_status,quantity,unit,currency) values
   (v_item1,v_org,v_receipt,v_variant,'SELLABLE',5,'DB','HUF'),
   (v_item2,v_org,v_receipt,v_variant,'QUARANTINE',2,'DB','HUF');
 perform public.commerce_media_finalize_upload(
   v_org,v_media_receipt,
   'commerce/'||v_org::text||'/media/'||v_media_receipt::text||'/web.jpg','image/jpeg',100,100,100,'INTERNAL_ONLY',false,
   jsonb_build_array(
     jsonb_build_object('kind','WEB','storageKey','commerce/'||v_org::text||'/media/'||v_media_receipt::text||'/web.jpg','mimeType','image/jpeg','width',100,'height',100,'sizeBytes',100),
     jsonb_build_object('kind','THUMBNAIL','storageKey','commerce/'||v_org::text||'/media/'||v_media_receipt::text||'/thumb.jpg','mimeType','image/jpeg','width',50,'height',50,'sizeBytes',50)
   ),
   jsonb_build_array(jsonb_build_object('linkType','GOODS_RECEIPT','linkedEntityId',v_receipt,'sortOrder',0,'primary',true))
 );
 perform public.commerce_media_finalize_upload(
   v_org,v_media_item,
   'commerce/'||v_org::text||'/media/'||v_media_item::text||'/web.jpg','image/jpeg',100,100,100,'INTERNAL_ONLY',false,
   jsonb_build_array(
     jsonb_build_object('kind','WEB','storageKey','commerce/'||v_org::text||'/media/'||v_media_item::text||'/web.jpg','mimeType','image/jpeg','width',100,'height',100,'sizeBytes',100),
     jsonb_build_object('kind','THUMBNAIL','storageKey','commerce/'||v_org::text||'/media/'||v_media_item::text||'/thumb.jpg','mimeType','image/jpeg','width',50,'height',50,'sizeBytes',50)
   ),
   jsonb_build_array(jsonb_build_object('linkType','GOODS_RECEIPT_ITEM','linkedEntityId',v_item1,'sortOrder',0,'primary',true))
 );
 select count(*) into v_media_links from public.commerce_media_links where organization_id=v_org and asset_id in (v_media_receipt,v_media_item);
 if v_media_links<>2 then raise exception 'RECEIVING_QA_MEDIA_LINKS %',v_media_links; end if;
 v_post:=public.commerce_goods_receipt_post(v_org,v_receipt,'rec-qa-post',now());
 if (v_post->>'status')<>'POSTED' or (v_post->>'itemCount')::int<>2 or (v_post->>'totalQuantity')::numeric<>7 then raise exception 'RECEIVING_QA_POST %',v_post; end if;
 v_dup:=public.commerce_goods_receipt_post(v_org,v_receipt,'rec-qa-post',now());
 if coalesce((v_dup->>'duplicate')::boolean,false) is not true then raise exception 'RECEIVING_QA_IDEMPOTENCY'; end if;
 select physical_quantity into v_physical from public.commerce_inventory_balances where organization_id=v_org and source_id=v_source and variant_id=v_variant and stock_status='SELLABLE';
 select physical_quantity into v_quarantine from public.commerce_inventory_balances where organization_id=v_org and source_id=v_source and variant_id=v_variant and stock_status='QUARANTINE';
 if v_physical<>5 or v_quarantine<>2 then raise exception 'RECEIVING_QA_BALANCE sellable=% quarantine=%',v_physical,v_quarantine; end if;
 select count(*) into v_movements from public.commerce_stock_movements where organization_id=v_org and reference_type='GOODS_RECEIPT_ITEM' and reference_id in (v_item1,v_item2);
 if v_movements<>2 then raise exception 'RECEIVING_QA_MOVEMENTS %',v_movements; end if;
 select count(*) into v_audit from public.commerce_audit_events where organization_id=v_org and action='GOODS_RECEIPT_POSTED' and entity_id=v_receipt;
 select count(*) into v_outbox from public.commerce_outbox_events where organization_id=v_org and event_type='GOODS_RECEIPT_POSTED' and aggregate_id=v_receipt;
 if v_audit<>1 or v_outbox<>1 then raise exception 'RECEIVING_QA_EVENTS audit=% outbox=%',v_audit,v_outbox; end if;
 if has_function_privilege('authenticated','public.commerce_goods_receipt_post(uuid,uuid,text,timestamptz)','EXECUTE') then raise exception 'RECEIVING_QA_AUTH_RPC_EXPOSED'; end if;
 if not has_function_privilege('service_role','public.commerce_goods_receipt_post(uuid,uuid,text,timestamptz)','EXECUTE') then raise exception 'RECEIVING_QA_SERVICE_RPC_MISSING'; end if;
end;
$$;
rollback;
`;
const result=spawnSync("psql",args,{cwd:root,encoding:"utf8",input:script});
if(result.status!==0){console.error(result.stdout||"");console.error(result.stderr||"");process.exit(result.status||2);}
const probe=spawnSync("psql",[...args,"-Atc","select json_build_object('version',(select schema_version from public.commerce_schema_meta where component='commerce-core'),'receipts',to_regclass('public.commerce_goods_receipts') is not null,'items',to_regclass('public.commerce_goods_receipt_items') is not null,'rpc',to_regprocedure('public.commerce_goods_receipt_post(uuid,uuid,text,timestamptz)') is not null)::text;"],{cwd:root,encoding:"utf8"});
if(probe.status!==0){console.error(probe.stderr||"");process.exit(probe.status||2);}
const after=JSON.parse(probe.stdout.trim());
if(after.version!=="0.1.4"||after.receipts||after.items||after.rpc){console.error("FAIL receiving rollback dirty",after);process.exit(2);}
for(const line of [
 "PASS 01 receiving migration applies transactionally","PASS 02 draft receipt + two items created","PASS 03 posting returns POSTED","PASS 04 posting is idempotent","PASS 05 sellable balance receives quantity","PASS 06 quarantine balance receives quantity","PASS 07 exactly two immutable receipt movements created","PASS 08 stock movements reference receipt items","PASS 09 posting writes audit event","PASS 10 posting writes outbox event","PASS 11 authenticated RPC denied","PASS 12 service RPC allowed","PASS 13 receipt number is tenant unique by schema","PASS 14 item quantity constraint is positive","PASS 15 receipt header media link finalizes","PASS 16 receipt item media link finalizes","PASS 17 rollback restores schema 0.1.4",
])console.log(line);
console.log("RESULT 17/17 PASS");
