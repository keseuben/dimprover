#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const apply = process.argv.includes("--apply");
const org=(process.env.ARUTER_STOREFRONT_COMMERCE_ORGANIZATION_ID||"").trim();
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(org)){
  console.error(JSON.stringify({ok:false,code:"P2_PILOT_ORGANIZATION_REQUIRED"}));
  process.exit(2);
}
const args=["-w","-h","aws-0-eu-central-1.pooler.supabase.com","-p","5432","-U","postgres.pbgyuznivqvestuksvif","-d","postgres","-X","-v","ON_ERROR_STOP=1"];
function run(sql){
  const r=spawnSync("psql",[...args,"-Atc",sql],{encoding:"utf8",maxBuffer:8*1024*1024});
  if(r.status!==0){console.error(r.stdout||"");console.error(r.stderr||"");process.exit(r.status||2);}
  return (r.stdout||"").trim();
}
function state(){
  const out=run(`select json_build_object(
    'schemaVersion',(select schema_version from public.commerce_schema_meta where component='commerce-core'),
    'storefronts',(select count(*) from public.commerce_storefronts where organization_id='${org}'::uuid and slug='kovacs-kerteszet' and deleted_at is null and status='ACTIVE'),
    'sources',(select count(*) from public.commerce_inventory_sources where organization_id='${org}'::uuid and code='KOVACS-KERT-PILOT-INTERNAL' and deleted_at is null and active and source_type='INTERNAL'),
    'products',(select count(*) from public.commerce_product_variants where organization_id='${org}'::uuid and deleted_at is null and status='ACTIVE' and upper(sku) in ('KERT-TUJA-120','KERT-MULCS-50')),
    'mappings',(select count(*) from public.commerce_storefront_product_mappings m join public.commerce_storefronts s on s.id=m.storefront_id where m.organization_id='${org}'::uuid and s.slug='kovacs-kerteszet' and m.deleted_at is null and m.active and m.external_product_id in ('prod-001','prod-002')),
    'balances',(select json_object_agg(v.sku,b.available_quantity order by v.sku) from public.commerce_inventory_balances b join public.commerce_product_variants v on v.id=b.variant_id join public.commerce_inventory_sources s on s.id=b.source_id where b.organization_id='${org}'::uuid and b.deleted_at is null and b.stock_status='SELLABLE' and s.code='KOVACS-KERT-PILOT-INTERNAL' and upper(v.sku) in ('KERT-TUJA-120','KERT-MULCS-50')),
    'units',(select json_object_agg(v.sku,v.unit order by v.sku) from public.commerce_product_variants v where v.organization_id='${org}'::uuid and v.deleted_at is null and upper(v.sku) in ('KERT-TUJA-120','KERT-MULCS-50'))
  )::text;`);
  return JSON.parse(out);
}
const before=state();
const ready=before.schemaVersion==="0.1.15"&&Number(before.storefronts)===1&&Number(before.sources)===1&&Number(before.products)===2&&Number(before.mappings)===2&&before.units?.["KERT-TUJA-120"]==="DB"&&before.units?.["KERT-MULCS-50"]==="ZSAK";
if(!apply){console.log(JSON.stringify({ok:true,mode:"check",ready,organizationId:org,state:before},null,2));process.exit(0);}
if(before.schemaVersion!=="0.1.15"){console.error(JSON.stringify({ok:false,code:"P2_PILOT_SCHEMA_NOT_READY",state:before},null,2));process.exit(2);}

const sql=String.raw`
begin;
do $$
declare
  v_org uuid := '${org}'::uuid;
  v_storefront uuid;
  v_wh uuid;
  v_source uuid;
  v_p1 uuid; v_v1 uuid; v_p2 uuid; v_v2 uuid;
  v_created jsonb;
begin
  if not exists(select 1 from public.dimpro_organizations where id=v_org and status='active') then
    raise exception 'P2_PILOT_ORGANIZATION_NOT_ACTIVE';
  end if;

  insert into public.commerce_warehouses(organization_id,code,name,active)
  values(v_org,'KOVACS-KERT-PILOT','Kovács Kertészet pilot raktár',true)
  on conflict (organization_id,code) do update set name=excluded.name,active=true,deleted_at=null,archived_at=null,updated_at=now()
  returning id into v_wh;

  insert into public.commerce_inventory_sources(organization_id,warehouse_id,source_type,code,name,active)
  values(v_org,v_wh,'INTERNAL','KOVACS-KERT-PILOT-INTERNAL','Kovács Kertészet belső készlet',true)
  on conflict (organization_id,code) do update set warehouse_id=excluded.warehouse_id,source_type='INTERNAL',name=excluded.name,active=true,deleted_at=null,archived_at=null,updated_at=now()
  returning id into v_source;

  insert into public.commerce_storefronts(organization_id,code,name,slug,status,default_fulfillment_source_id)
  values(v_org,'KOVACS-KERTESZET','Kovács Kertészet','kovacs-kerteszet','ACTIVE',v_source)
  on conflict (organization_id,slug) do update set code=excluded.code,name=excluded.name,status='ACTIVE',default_fulfillment_source_id=v_source,deleted_at=null,archived_at=null,updated_at=now()
  returning id into v_storefront;

  select p.id,v.id into v_p1,v_v1
  from public.commerce_product_variants v join public.commerce_products p on p.id=v.product_id
  where v.organization_id=v_org and upper(v.sku)='KERT-TUJA-120' and v.deleted_at is null limit 1;
  if v_v1 is null then
    v_created:=public.commerce_product_create_atomic(v_org,'Smaragd tuja 120–140 cm','kovacs-kerteszet-smaragd-tuja-120-140','Tömött, oszlopos örökzöld, sövényhez és szoliternek.',null,null,null,null,'ACTIVE',
      jsonb_build_object('name','Smaragd tuja 120–140 cm','sku','KERT-TUJA-120','unit','DB','attributes',jsonb_build_object('pilot','kovacs-kerteszet','externalProductId','prod-001')),
      jsonb_build_array(
        jsonb_build_object('type','SKU','value','KERT-TUJA-120','normalizedValue','KERT-TUJA-120','primary',true),
        jsonb_build_object('type','EAN_GTIN','value','5990000000011','normalizedValue','5990000000011','primary',false)
      ));
    v_p1:=(v_created->>'productId')::uuid; v_v1:=(v_created->>'variantId')::uuid;
  else
    update public.commerce_products set name='Smaragd tuja 120–140 cm',status='ACTIVE',deleted_at=null,archived_at=null,updated_at=now() where id=v_p1;
    update public.commerce_product_variants set name='Smaragd tuja 120–140 cm',unit='DB',status='ACTIVE',deleted_at=null,archived_at=null,updated_at=now() where id=v_v1;
  end if;

  select p.id,v.id into v_p2,v_v2
  from public.commerce_product_variants v join public.commerce_products p on p.id=v.product_id
  where v.organization_id=v_org and upper(v.sku)='KERT-MULCS-50' and v.deleted_at is null limit 1;
  if v_v2 is null then
    v_created:=public.commerce_product_create_atomic(v_org,'Fenyőkéreg mulcs 50 l','kovacs-kerteszet-fenyokereg-mulcs-50','Dekoratív talajtakaró, amely segít a gyomosodás visszaszorításában.',null,null,null,null,'ACTIVE',
      jsonb_build_object('name','Fenyőkéreg mulcs 50 l','sku','KERT-MULCS-50','unit','ZSAK','attributes',jsonb_build_object('pilot','kovacs-kerteszet','externalProductId','prod-002')),
      jsonb_build_array(jsonb_build_object('type','SKU','value','KERT-MULCS-50','normalizedValue','KERT-MULCS-50','primary',true)));
    v_p2:=(v_created->>'productId')::uuid; v_v2:=(v_created->>'variantId')::uuid;
  else
    update public.commerce_products set name='Fenyőkéreg mulcs 50 l',status='ACTIVE',deleted_at=null,archived_at=null,updated_at=now() where id=v_p2;
    update public.commerce_product_variants set name='Fenyőkéreg mulcs 50 l',unit='ZSAK',status='ACTIVE',deleted_at=null,archived_at=null,updated_at=now() where id=v_v2;
  end if;

  if not exists(select 1 from public.commerce_prices where organization_id=v_org and variant_id=v_v1 and currency='HUF' and amount=5490 and vat_rate_basis_points=2700 and status='ACTIVE' and deleted_at is null) then
    insert into public.commerce_prices(organization_id,variant_id,currency,amount,vat_rate_basis_points,status) values(v_org,v_v1,'HUF',5490,2700,'ACTIVE');
  end if;
  if not exists(select 1 from public.commerce_prices where organization_id=v_org and variant_id=v_v2 and currency='HUF' and amount=1890 and vat_rate_basis_points=2700 and status='ACTIVE' and deleted_at is null) then
    insert into public.commerce_prices(organization_id,variant_id,currency,amount,vat_rate_basis_points,status) values(v_org,v_v2,'HUF',1890,2700,'ACTIVE');
  end if;

  perform public.commerce_inventory_apply_movement(v_org,v_source,v_v1,'SELLABLE','RECEIPT',42,0,0,'pilot-p2-seed:kovacs-kerteszet:KERT-TUJA-120:v1','PILOT_BOOTSTRAP',null,now());
  perform public.commerce_inventory_apply_movement(v_org,v_source,v_v2,'SELLABLE','RECEIPT',130,0,0,'pilot-p2-seed:kovacs-kerteszet:KERT-MULCS-50:v1','PILOT_BOOTSTRAP',null,now());

  insert into public.commerce_storefront_product_mappings(organization_id,storefront_id,external_product_id,external_sku,product_id,variant_id,fulfillment_source_id,active,metadata)
  values(v_org,v_storefront,'prod-001','KERT-TUJA-120',v_p1,v_v1,v_source,true,jsonb_build_object('bootstrap','commerce-pilot-p2-20260821','source','aruter-mock'))
  on conflict (organization_id,storefront_id,external_product_id) where deleted_at is null
  do update set external_sku=excluded.external_sku,product_id=excluded.product_id,variant_id=excluded.variant_id,fulfillment_source_id=excluded.fulfillment_source_id,active=true,metadata=excluded.metadata,updated_at=now();

  insert into public.commerce_storefront_product_mappings(organization_id,storefront_id,external_product_id,external_sku,product_id,variant_id,fulfillment_source_id,active,metadata)
  values(v_org,v_storefront,'prod-002','KERT-MULCS-50',v_p2,v_v2,v_source,true,jsonb_build_object('bootstrap','commerce-pilot-p2-20260821','source','aruter-mock'))
  on conflict (organization_id,storefront_id,external_product_id) where deleted_at is null
  do update set external_sku=excluded.external_sku,product_id=excluded.product_id,variant_id=excluded.variant_id,fulfillment_source_id=excluded.fulfillment_source_id,active=true,metadata=excluded.metadata,updated_at=now();
end;
$$;
commit;`;
const applyRun=spawnSync("psql",args,{encoding:"utf8",input:sql,maxBuffer:12*1024*1024});
if(applyRun.status!==0){console.error(applyRun.stdout||"");console.error(applyRun.stderr||"");process.exit(applyRun.status||2);}
const after=state();
const readyAfter=after.schemaVersion==="0.1.15"&&Number(after.storefronts)===1&&Number(after.sources)===1&&Number(after.products)===2&&Number(after.mappings)===2&&after.units?.["KERT-TUJA-120"]==="DB"&&after.units?.["KERT-MULCS-50"]==="ZSAK"&&Number(after.balances?.["KERT-TUJA-120"])>=42&&Number(after.balances?.["KERT-MULCS-50"])>=130;
if(!readyAfter){console.error(JSON.stringify({ok:false,code:"P2_PILOT_BOOTSTRAP_VERIFY_FAILED",state:after},null,2));process.exit(2);}
console.log(JSON.stringify({ok:true,mode:"apply",ready:true,organizationId:org,state:after},null,2));
