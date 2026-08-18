#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { join } from "node:path";
const root=process.cwd();
const migration=join(root,"supabase/migrations/20260818220500_dimpro_commerce_media_management_m1.sql");
const args=["-w","-h","aws-0-eu-central-1.pooler.supabase.com","-p","5432","-U","postgres.pbgyuznivqvestuksvif","-d","postgres","-X","-v","ON_ERROR_STOP=1"];
const script=String.raw`
begin;
\i ${migration}
do $$
declare
 v_org uuid; v_product uuid:=gen_random_uuid(); v_a uuid:=gen_random_uuid(); v_b uuid:=gen_random_uuid(); v_result jsonb; v_primary int; v_first int; v_second int; v_audit int; v_outbox int;
begin
 select id into v_org from public.dimpro_organizations where status='active' order by created_at limit 1;
 if v_org is null then raise exception 'MEDIA_MGMT_QA_ORG_MISSING'; end if;
 insert into public.commerce_products(id,organization_id,name,slug,status) values(v_product,v_org,'Media management QA','media-management-qa-'||substr(v_product::text,1,8),'ACTIVE');
 insert into public.commerce_media_assets(id,organization_id,storage_key,mime_type,size_bytes,visibility,processing_status,retain_original) values
 (v_a,v_org,'commerce/'||v_org::text||'/media/'||v_a::text||'/web.jpg','image/jpeg',100,'INTERNAL_ONLY','READY',false),
 (v_b,v_org,'commerce/'||v_org::text||'/media/'||v_b::text||'/web.jpg','image/jpeg',100,'INTERNAL_ONLY','READY',false);
 insert into public.commerce_media_links(organization_id,asset_id,link_type,linked_entity_id,sort_order,is_primary) values
 (v_org,v_a,'PRODUCT',v_product,0,true),(v_org,v_b,'PRODUCT',v_product,1,false);
 v_result:=public.commerce_media_set_product_order(v_org,v_product,array[v_b,v_a],v_b);
 if (v_result->>'primaryAssetId')::uuid<>v_b then raise exception 'MEDIA_MGMT_QA_RESULT'; end if;
 select count(*) into v_primary from public.commerce_media_links where organization_id=v_org and linked_entity_id=v_product and link_type='PRODUCT' and archived_at is null and is_primary;
 select sort_order into v_first from public.commerce_media_links where organization_id=v_org and linked_entity_id=v_product and asset_id=v_b;
 select sort_order into v_second from public.commerce_media_links where organization_id=v_org and linked_entity_id=v_product and asset_id=v_a;
 if v_primary<>1 or v_first<>0 or v_second<>1 then raise exception 'MEDIA_MGMT_QA_ORDER'; end if;
 begin perform public.commerce_media_set_product_order(v_org,v_product,array[v_a,v_a],v_a); raise exception 'MEDIA_MGMT_QA_DUP_NOT_BLOCKED'; exception when others then if sqlerrm='MEDIA_MGMT_QA_DUP_NOT_BLOCKED' then raise; end if; end;
 select count(*) into v_audit from public.commerce_audit_events where organization_id=v_org and action='PRODUCT_MEDIA_ORDER_CHANGED' and entity_id=v_product;
 select count(*) into v_outbox from public.commerce_outbox_events where organization_id=v_org and event_type='PRODUCT_MEDIA_CHANGED' and aggregate_id=v_product;
 if v_audit<>1 or v_outbox<>1 then raise exception 'MEDIA_MGMT_QA_EVENTS'; end if;
 if has_function_privilege('authenticated','public.commerce_media_set_product_order(uuid,uuid,uuid[],uuid)','EXECUTE') then raise exception 'MEDIA_MGMT_QA_AUTH_RPC'; end if;
 if not has_function_privilege('service_role','public.commerce_media_set_product_order(uuid,uuid,uuid[],uuid)','EXECUTE') then raise exception 'MEDIA_MGMT_QA_SERVICE_RPC'; end if;
end;
$$;
rollback;`;
const r=spawnSync("psql",args,{cwd:root,encoding:"utf8",input:script});if(r.status!==0){console.error(r.stdout);console.error(r.stderr);process.exit(r.status||2);}
const p=spawnSync("psql",[...args,"-Atc","select json_build_object('version',(select schema_version from public.commerce_schema_meta where component='commerce-core'),'rpc',to_regprocedure('public.commerce_media_set_product_order(uuid,uuid,uuid[],uuid)') is not null)::text;"],{cwd:root,encoding:"utf8"});if(p.status!==0){console.error(p.stderr);process.exit(p.status||2);}
const after=JSON.parse(p.stdout.trim());if(after.version!=="0.1.3"||after.rpc!==false){console.error("FAIL rollback dirty",after);process.exit(2);}
for(const line of ["PASS 01 migration applies transactionally","PASS 02 two product media links created","PASS 03 order swapped atomically","PASS 04 primary image changed atomically","PASS 05 exactly one primary remains","PASS 06 duplicate order rejected","PASS 07 audit event generated","PASS 08 outbox event generated","PASS 09 authenticated RPC denied","PASS 10 service RPC allowed","PASS 11 rollback restores schema 0.1.3"])console.log(line);
console.log("RESULT 11/11 PASS");
