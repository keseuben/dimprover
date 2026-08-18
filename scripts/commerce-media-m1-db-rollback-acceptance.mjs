#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root=process.cwd();
const migration=join(root,"supabase/migrations/20260818193000_dimpro_commerce_media_m1.sql");
const args=["-w","-h","aws-0-eu-central-1.pooler.supabase.com","-p","5432","-U","postgres.pbgyuznivqvestuksvif","-d","postgres","-X","-v","ON_ERROR_STOP=1"];
const sql=String.raw`
begin;
\i ${migration}
do $$
declare
  v_org uuid;
  v_product jsonb;
  v_product_id uuid;
  v_asset uuid := gen_random_uuid();
  v_prefix text;
  v_result jsonb;
  v_count integer;
begin
  select id into v_org from public.dimpro_organizations where status='active' order by created_at limit 1;
  if v_org is null then raise exception 'MEDIA_QA_ORG_MISSING'; end if;
  v_product := public.commerce_product_create_atomic(
    v_org,'Media QA product','media-qa-'||substr(gen_random_uuid()::text,1,8),null,null,null,null,null,'ACTIVE',
    jsonb_build_object('name','Media QA','unit','DB'), '[]'::jsonb
  );
  v_product_id := (v_product->>'productId')::uuid;
  v_prefix := 'commerce/'||v_org::text||'/media/'||v_asset::text||'/';
  v_result := public.commerce_media_finalize_upload(
    v_org,v_asset,v_prefix||'web.webp','image/webp',1600,1200,100000,'PUBLIC',false,
    jsonb_build_array(
      jsonb_build_object('kind','WEB','storageKey',v_prefix||'web.webp','mimeType','image/webp','width',1600,'height',1200,'sizeBytes',100000,'sha256',repeat('a',64)),
      jsonb_build_object('kind','THUMBNAIL','storageKey',v_prefix||'thumb.webp','mimeType','image/webp','width',512,'height',384,'sizeBytes',12000,'sha256',repeat('b',64))
    ),
    jsonb_build_array(jsonb_build_object('linkType','PRODUCT','linkedEntityId',v_product_id,'sortOrder',0,'primary',true))
  );
  if (v_result->>'status') <> 'READY' or (v_result->>'variantCount')::int<>2 or (v_result->>'linkCount')::int<>1 then raise exception 'MEDIA_QA_FINALIZE_INVALID %',v_result; end if;
  select count(*) into v_count from public.commerce_media_variants where organization_id=v_org and asset_id=v_asset;
  if v_count<>2 then raise exception 'MEDIA_QA_VARIANT_COUNT %',v_count; end if;
  if exists(select 1 from public.commerce_media_variants where asset_id=v_asset and variant_kind='ORIGINAL') then raise exception 'MEDIA_QA_ORIGINAL_RETAINED'; end if;
  insert into public.commerce_media_overlays(organization_id,asset_id,overlay_type,payload,sort_order)
  values (v_org,v_asset,'STAMP',jsonb_build_object('text','SÉRÜLT'),10);
  select count(*) into v_count from public.commerce_media_overlays where organization_id=v_org and asset_id=v_asset and overlay_type='STAMP';
  if v_count<>1 then raise exception 'MEDIA_QA_OVERLAY_MISSING'; end if;
  if has_table_privilege('anon','public.commerce_media_variants','SELECT') then raise exception 'MEDIA_QA_ANON_VARIANTS_EXPOSED'; end if;
  if has_table_privilege('authenticated','public.commerce_media_overlays','SELECT') then raise exception 'MEDIA_QA_AUTH_OVERLAYS_EXPOSED'; end if;
  if not has_function_privilege('service_role','public.commerce_media_finalize_upload(uuid,uuid,text,text,integer,integer,bigint,text,boolean,jsonb,jsonb)','EXECUTE') then raise exception 'MEDIA_QA_SERVICE_RPC_MISSING'; end if;
  begin
    perform public.commerce_media_finalize_upload(
      v_org,gen_random_uuid(),'wrong/prefix.webp','image/webp',100,100,1000,'PUBLIC',false,
      jsonb_build_array(jsonb_build_object('kind','WEB','storageKey','wrong/web.webp','mimeType','image/webp','sizeBytes',1000),jsonb_build_object('kind','THUMBNAIL','storageKey','wrong/thumb.webp','mimeType','image/webp','sizeBytes',500)),
      '[]'::jsonb
    );
    raise exception 'MEDIA_QA_EXPECTED_SCOPE_FAILURE';
  exception when others then
    if sqlerrm='MEDIA_QA_EXPECTED_SCOPE_FAILURE' or position('COMMERCE_MEDIA_STORAGE_SCOPE_INVALID' in sqlerrm)=0 then raise; end if;
  end;
end;
$$;
rollback;
`;
const result=spawnSync("psql",args,{cwd:root,encoding:"utf8",input:sql});
if(result.status!==0){console.error(result.stdout||"");console.error(result.stderr||"");process.exit(result.status||2);}
const probe=spawnSync("psql",[...args,"-Atc","select json_build_object('variants',to_regclass('public.commerce_media_variants') is not null,'overlays',to_regclass('public.commerce_media_overlays') is not null,'version',(select schema_version from public.commerce_schema_meta where component='commerce-core'))::text;"],{cwd:root,encoding:"utf8"});
if(probe.status!==0){console.error(probe.stderr);process.exit(probe.status||2);}
const after=JSON.parse(probe.stdout.trim());
if(after.variants||after.overlays||after.version!=="0.1.0"){console.error("FAIL media rollback dirty",after);process.exit(2);}
for(const line of [
  "PASS 01 media migration applies transactionally",
  "PASS 02 atomic finalize creates WEB + THUMBNAIL",
  "PASS 03 original is not retained by default",
  "PASS 04 product link is created",
  "PASS 05 non-destructive overlay record works",
  "PASS 06 anon variant access is denied",
  "PASS 07 authenticated overlay access is denied",
  "PASS 08 service-only finalize RPC is available",
  "PASS 09 organization/asset storage prefix is enforced",
  "PASS 10 transaction rolls back to schema 0.1.0 cleanly",
]) console.log(line);
console.log("RESULT 10/10 PASS");
