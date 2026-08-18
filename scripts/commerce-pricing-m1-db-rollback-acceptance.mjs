#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { join } from "node:path";
const root=process.cwd();
const migration=join(root,"supabase/migrations/20260818203000_dimpro_commerce_pricing_m1.sql");
const args=["-w","-h","aws-0-eu-central-1.pooler.supabase.com","-p","5432","-U","postgres.pbgyuznivqvestuksvif","-d","postgres","-X","-v","ON_ERROR_STOP=1"];
const script=String.raw`
begin;
\i ${migration}
do $$
declare
 v_org uuid; v_product uuid:=gen_random_uuid(); v_variant uuid:=gen_random_uuid(); v_first jsonb; v_second jsonb;
 v_active int; v_inactive int; v_audit int; v_outbox int;
begin
 select id into v_org from public.dimpro_organizations where status='active' order by created_at limit 1;
 if v_org is null then raise exception 'PRICE_QA_ORG_MISSING'; end if;
 insert into public.commerce_products(id,organization_id,name,slug,status) values(v_product,v_org,'Price QA','price-qa-'||substr(v_product::text,1,8),'ACTIVE');
 insert into public.commerce_product_variants(id,organization_id,product_id,name,unit,status) values(v_variant,v_org,v_product,'Price QA','DB','ACTIVE');
 v_first:=public.commerce_price_set_active(v_org,v_variant,'HUF',1000,2700,now()-interval '1 minute');
 v_second:=public.commerce_price_set_active(v_org,v_variant,'HUF',1250,2700,now());
 if (v_first->>'amountMinor')::bigint<>1000 then raise exception 'PRICE_QA_FIRST'; end if;
 if (v_second->>'amountMinor')::bigint<>1250 or (v_second->>'previousDeactivated')::int<>1 then raise exception 'PRICE_QA_SECOND'; end if;
 select count(*) into v_active from public.commerce_prices where organization_id=v_org and variant_id=v_variant and currency='HUF' and status='ACTIVE';
 select count(*) into v_inactive from public.commerce_prices where organization_id=v_org and variant_id=v_variant and currency='HUF' and status='INACTIVE';
 if v_active<>1 or v_inactive<>1 then raise exception 'PRICE_QA_HISTORY'; end if;
 select count(*) into v_audit from public.commerce_audit_events where organization_id=v_org and action='PRICE_SET_ACTIVE' and metadata->>'variantId'=v_variant::text;
 select count(*) into v_outbox from public.commerce_outbox_events where organization_id=v_org and event_type='PRICE_CHANGED' and aggregate_id=v_variant;
 if v_audit<>2 or v_outbox<>2 then raise exception 'PRICE_QA_EVENTS'; end if;
 if has_table_privilege('service_role','public.commerce_prices','UPDATE') then raise exception 'PRICE_QA_DIRECT_MUTATION'; end if;
 if has_function_privilege('authenticated','public.commerce_price_set_active(uuid,uuid,text,bigint,integer,timestamptz)','EXECUTE') then raise exception 'PRICE_QA_AUTH_RPC'; end if;
 if not has_function_privilege('service_role','public.commerce_price_set_active(uuid,uuid,text,bigint,integer,timestamptz)','EXECUTE') then raise exception 'PRICE_QA_SERVICE_RPC'; end if;
end;
$$;
rollback;
`;
const result=spawnSync("psql",args,{cwd:root,encoding:"utf8",input:script});
if(result.status!==0){console.error(result.stdout);console.error(result.stderr);process.exit(result.status||2);}
const probe=spawnSync("psql",[...args,"-Atc","select json_build_object('version',(select schema_version from public.commerce_schema_meta where component='commerce-core'),'rpc',to_regprocedure('public.commerce_price_set_active(uuid,uuid,text,bigint,integer,timestamptz)') is not null)::text;"],{cwd:root,encoding:"utf8"});
if(probe.status!==0){console.error(probe.stderr);process.exit(probe.status||2);}
const after=JSON.parse(probe.stdout.trim());
if(after.version!=="0.1.1"||after.rpc!==false){console.error("FAIL rollback dirty",after);process.exit(2);}
for(const line of [
 "PASS 01 pricing migration applies transactionally","PASS 02 first active price insert","PASS 03 second price deactivates previous","PASS 04 one active + one inactive history","PASS 05 audit events generated","PASS 06 outbox events generated","PASS 07 direct service UPDATE denied","PASS 08 authenticated RPC denied","PASS 09 service RPC allowed","PASS 10 rollback restores schema 0.1.1",
])console.log(line);
console.log("RESULT 10/10 PASS");
