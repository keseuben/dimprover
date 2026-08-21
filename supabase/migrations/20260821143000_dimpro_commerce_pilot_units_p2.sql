-- DIMPRO Commerce P2 - pilot unit alignment (DEV only)
-- Extends ProductVariant / Receiving units to match the Commerce Order Core legacy unit set.

alter table public.commerce_product_variants
  drop constraint if exists commerce_product_variants_unit_check;
alter table public.commerce_product_variants
  add constraint commerce_product_variants_unit_check
  check (unit in ('DB','KG','G','M','M2','M3','FM','L','CSOMAG','PAR','KESZLET','RAKLAP','ZSAK','LADA'));

alter table public.commerce_goods_receipt_items
  drop constraint if exists commerce_goods_receipt_items_unit_check;
alter table public.commerce_goods_receipt_items
  add constraint commerce_goods_receipt_items_unit_check
  check (unit in ('DB','KG','G','M','M2','M3','FM','L','CSOMAG','PAR','KESZLET','RAKLAP','ZSAK','LADA'));

CREATE OR REPLACE FUNCTION public.commerce_product_create_atomic(p_organization_id uuid, p_name text, p_slug text, p_description text DEFAULT NULL::text, p_type_model text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_brand_id uuid DEFAULT NULL::uuid, p_manufacturer_id uuid DEFAULT NULL::uuid, p_status text DEFAULT 'DRAFT'::text, p_default_variant jsonb DEFAULT '{}'::jsonb, p_identifiers jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_product_id uuid;
  v_variant_id uuid;
  v_unit text;
  v_variant_name text;
  v_sku text;
  v_attributes jsonb;
  v_item jsonb;
  v_type text;
  v_value text;
  v_normalized text;
begin
  if p_organization_id is null or not exists (select 1 from public.dimpro_organizations o where o.id=p_organization_id and o.status='active') then
    raise exception 'COMMERCE_ORGANIZATION_NOT_ACTIVE';
  end if;
  if nullif(btrim(p_name),'') is null then raise exception 'COMMERCE_PRODUCT_NAME_REQUIRED'; end if;
  if nullif(btrim(p_slug),'') is null then raise exception 'COMMERCE_PRODUCT_SLUG_REQUIRED'; end if;
  if upper(p_status) not in ('DRAFT','ACTIVE','INACTIVE','ARCHIVED') then raise exception 'COMMERCE_PRODUCT_STATUS_INVALID'; end if;
  if p_category_id is not null and not exists (select 1 from public.commerce_categories c where c.id=p_category_id and c.organization_id=p_organization_id and c.archived_at is null) then raise exception 'COMMERCE_CATEGORY_SCOPE_MISMATCH'; end if;
  if p_brand_id is not null and not exists (select 1 from public.commerce_brands b where b.id=p_brand_id and b.organization_id=p_organization_id and b.archived_at is null) then raise exception 'COMMERCE_BRAND_SCOPE_MISMATCH'; end if;
  if p_manufacturer_id is not null and not exists (select 1 from public.commerce_manufacturers m where m.id=p_manufacturer_id and m.organization_id=p_organization_id and m.archived_at is null) then raise exception 'COMMERCE_MANUFACTURER_SCOPE_MISMATCH'; end if;

  v_unit := upper(coalesce(nullif(btrim(p_default_variant->>'unit'),''),'DB'));
  if v_unit not in ('DB','KG','G','M','M2','M3','FM','L','CSOMAG','PAR','KESZLET','RAKLAP','ZSAK','LADA') then raise exception 'COMMERCE_VARIANT_UNIT_INVALID'; end if;
  v_variant_name := coalesce(nullif(btrim(p_default_variant->>'name'),''),btrim(p_name));
  v_sku := nullif(btrim(p_default_variant->>'sku'),'');
  v_attributes := case when jsonb_typeof(p_default_variant->'attributes')='object' then p_default_variant->'attributes' else '{}'::jsonb end;

  insert into public.commerce_products(organization_id,category_id,brand_id,manufacturer_id,name,slug,description,type_model,status)
  values (p_organization_id,p_category_id,p_brand_id,p_manufacturer_id,btrim(p_name),btrim(p_slug),nullif(btrim(p_description),''),nullif(btrim(p_type_model),''),upper(p_status))
  returning id into v_product_id;

  insert into public.commerce_product_variants(organization_id,product_id,name,sku,unit,attributes,status)
  values (p_organization_id,v_product_id,v_variant_name,v_sku,v_unit,v_attributes,upper(p_status))
  returning id into v_variant_id;

  if jsonb_typeof(p_identifiers) <> 'array' then raise exception 'COMMERCE_IDENTIFIERS_ARRAY_REQUIRED'; end if;
  for v_item in select value from jsonb_array_elements(p_identifiers) loop
    v_type := upper(coalesce(v_item->>'type',''));
    v_value := btrim(coalesce(v_item->>'value',''));
    v_normalized := btrim(coalesce(v_item->>'normalizedValue',''));
    if v_type not in ('EAN_GTIN','DIMPRO_QR','DIMPRO_BARCODE','SKU','SUPPLIER_SKU') then raise exception 'COMMERCE_IDENTIFIER_TYPE_INVALID'; end if;
    if v_value='' or v_normalized='' then raise exception 'COMMERCE_IDENTIFIER_INVALID'; end if;
    insert into public.commerce_product_identifiers(organization_id,product_id,variant_id,identifier_type,value,normalized_value,is_primary)
    values (p_organization_id,v_product_id,v_variant_id,v_type,v_value,v_normalized,coalesce((v_item->>'primary')::boolean,false));
  end loop;

  insert into public.commerce_audit_events(organization_id,action,entity_type,entity_id,metadata)
  values (p_organization_id,'PRODUCT_CREATED','PRODUCT',v_product_id,jsonb_build_object('variantId',v_variant_id));
  insert into public.commerce_outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values (p_organization_id,'PRODUCT',v_product_id,'PRODUCT_CREATED',jsonb_build_object('productId',v_product_id,'variantId',v_variant_id),'product-created:'||v_product_id::text);

  return jsonb_build_object('productId',v_product_id,'variantId',v_variant_id);
end;
$function$;

update public.commerce_schema_meta
set schema_version='0.1.15',
    migration_count=16,
    bootstrap_id='commerce-pilot-units-p2-20260821',
    updated_at=now()
where component='commerce-core';
