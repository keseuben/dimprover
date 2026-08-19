-- DIMPRO Commerce Core M0/M1 - STAGED DEV migration
-- Created by OutminAI, 2026-08-18.
-- IMPORTANT: do not apply to PROD. DEV application requires explicit migration gate.
-- Dependency: DIMPRO Identity Core V0.1+ (dimpro_organizations, dimpro_is_organization_member, dimpro_set_updated_at).

create extension if not exists pgcrypto;

create table if not exists public.commerce_schema_meta (
  component text primary key,
  schema_version text not null,
  migration_count integer not null default 0,
  bootstrap_id text not null,
  updated_at timestamptz not null default now()
);

insert into public.commerce_schema_meta(component,schema_version,migration_count,bootstrap_id,updated_at)
values ('commerce-core','0.1.0',1,'commerce-core-m0-m1-20260818',now())
on conflict (component) do update set
  schema_version=excluded.schema_version,
  migration_count=excluded.migration_count,
  bootstrap_id=excluded.bootstrap_id,
  updated_at=now();

create table if not exists public.commerce_storefronts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  code text not null,
  name text not null,
  slug text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  unique (organization_id, code),
  unique (organization_id, slug)
);

create table if not exists public.commerce_warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  unique (organization_id, code)
);

create table if not exists public.commerce_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  parent_id uuid null references public.commerce_categories(id) on delete restrict,
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  unique (organization_id, slug)
);

create table if not exists public.commerce_brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  unique (organization_id, name)
);

create table if not exists public.commerce_manufacturers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  unique (organization_id, name)
);

create table if not exists public.commerce_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  category_id uuid null references public.commerce_categories(id) on delete set null,
  brand_id uuid null references public.commerce_brands(id) on delete set null,
  manufacturer_id uuid null references public.commerce_manufacturers(id) on delete set null,
  name text not null,
  slug text not null,
  description text null,
  type_model text null,
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','INACTIVE','ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  unique (organization_id, slug)
);

create table if not exists public.commerce_product_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  product_id uuid not null references public.commerce_products(id) on delete cascade,
  name text not null,
  sku text null,
  unit text not null check (unit in ('DB','KG','G','M','M2','M3','FM','L','CSOMAG','PAR','KESZLET')),
  attributes jsonb not null default '{}'::jsonb,
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','INACTIVE','ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null
);
create unique index if not exists commerce_variant_org_sku_unique
  on public.commerce_product_variants (organization_id, upper(sku)) where sku is not null and archived_at is null;

create table if not exists public.commerce_product_identifiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  product_id uuid not null references public.commerce_products(id) on delete cascade,
  variant_id uuid null references public.commerce_product_variants(id) on delete cascade,
  identifier_type text not null check (identifier_type in ('EAN_GTIN','DIMPRO_QR','DIMPRO_BARCODE','SKU','SUPPLIER_SKU')),
  value text not null,
  normalized_value text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null
);
create unique index if not exists commerce_identifier_org_type_value_unique
  on public.commerce_product_identifiers (organization_id, identifier_type, normalized_value)
  where archived_at is null;
create index if not exists commerce_identifier_resolve_idx
  on public.commerce_product_identifiers (organization_id, normalized_value)
  where archived_at is null;

create table if not exists public.commerce_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  variant_id uuid not null references public.commerce_product_variants(id) on delete cascade,
  currency text not null default 'HUF' check (currency in ('HUF','EUR','USD')),
  amount_minor bigint not null check (amount_minor >= 0),
  vat_rate_basis_points integer not null default 2700 check (vat_rate_basis_points between 0 and 10000),
  valid_from timestamptz null,
  valid_until timestamptz null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  check (valid_until is null or valid_from is null or valid_until > valid_from)
);
create index if not exists commerce_prices_variant_status_idx
  on public.commerce_prices (organization_id, variant_id, status, valid_from, valid_until);

create table if not exists public.commerce_media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  storage_key text not null,
  mime_type text not null,
  width integer null,
  height integer null,
  size_bytes bigint not null check (size_bytes >= 0),
  visibility text not null default 'INTERNAL_ONLY' check (visibility in ('INTERNAL_ONLY','PUBLIC')),
  processing_status text not null default 'UPLOADED' check (processing_status in ('UPLOADED','PROCESSING','READY','FAILED')),
  retain_original boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  unique (organization_id, storage_key)
);

create table if not exists public.commerce_media_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  asset_id uuid not null references public.commerce_media_assets(id) on delete cascade,
  link_type text not null check (link_type in ('PRODUCT','PRODUCT_VARIANT','GOODS_RECEIPT','GOODS_RECEIPT_ITEM','LOT','QUALITY_CHECK','RETURN','CLAIM')),
  linked_entity_id uuid not null,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null
);
create index if not exists commerce_media_links_entity_idx
  on public.commerce_media_links (organization_id, link_type, linked_entity_id)
  where archived_at is null;

create table if not exists public.commerce_inventory_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  warehouse_id uuid null references public.commerce_warehouses(id) on delete restrict,
  source_type text not null check (source_type in ('INTERNAL','EXTERNAL')),
  code text not null,
  name text not null,
  external_system text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  unique (organization_id, code),
  check ((source_type = 'INTERNAL' and warehouse_id is not null) or source_type = 'EXTERNAL')
);

create table if not exists public.commerce_external_inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  source_id uuid not null references public.commerce_inventory_sources(id) on delete cascade,
  variant_id uuid not null references public.commerce_product_variants(id) on delete cascade,
  external_product_id text not null,
  quantity numeric(20,6) not null default 0,
  last_sync_at timestamptz not null,
  sync_status text not null check (sync_status in ('LIVE','FRESH','STALE','ERROR','OFFLINE')),
  created_at timestamptz not null default now(),
  unique (organization_id, source_id, variant_id)
);

create table if not exists public.commerce_inventory_balances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  source_id uuid not null references public.commerce_inventory_sources(id) on delete cascade,
  warehouse_id uuid null references public.commerce_warehouses(id) on delete restrict,
  variant_id uuid not null references public.commerce_product_variants(id) on delete cascade,
  stock_status text not null default 'SELLABLE' check (stock_status in ('SELLABLE','RESERVED','QUARANTINE','DAMAGED','OUTLET','BLOCKED','IN_TRANSIT','RETURNED','SCRAP')),
  physical_quantity numeric(20,6) not null default 0,
  reserved_quantity numeric(20,6) not null default 0,
  available_quantity numeric(20,6) generated always as (physical_quantity - reserved_quantity) stored,
  incoming_quantity numeric(20,6) not null default 0,
  last_movement_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  unique (organization_id, source_id, variant_id, stock_status),
  check (physical_quantity >= 0),
  check (reserved_quantity >= 0),
  check (incoming_quantity >= 0)
);

create table if not exists public.commerce_stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  source_id uuid not null references public.commerce_inventory_sources(id) on delete restrict,
  warehouse_id uuid null references public.commerce_warehouses(id) on delete restrict,
  variant_id uuid not null references public.commerce_product_variants(id) on delete restrict,
  stock_status text not null default 'SELLABLE' check (stock_status in ('SELLABLE','RESERVED','QUARANTINE','DAMAGED','OUTLET','BLOCKED','IN_TRANSIT','RETURNED','SCRAP')),
  movement_type text not null check (movement_type in ('RECEIPT','SALE','RESERVATION_COMMIT','RESERVATION_RELEASE','TRANSFER_OUT','TRANSFER_IN','ADJUSTMENT','RETURN')),
  physical_delta numeric(20,6) not null default 0,
  reserved_delta numeric(20,6) not null default 0,
  incoming_delta numeric(20,6) not null default 0,
  idempotency_key text not null,
  reference_type text null,
  reference_id uuid null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (physical_delta <> 0 or reserved_delta <> 0 or incoming_delta <> 0),
  unique (organization_id, idempotency_key)
);
create index if not exists commerce_stock_movement_ledger_idx
  on public.commerce_stock_movements (organization_id, variant_id, source_id, occurred_at, id);

create table if not exists public.commerce_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  actor_user_id uuid null references public.dimpro_users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists commerce_audit_org_created_idx on public.commerce_audit_events (organization_id, created_at desc);

create table if not exists public.commerce_outbox_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  occurred_at timestamptz not null default now(),
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);
create index if not exists commerce_outbox_pending_idx on public.commerce_outbox_events (created_at) where published_at is null;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'commerce_storefronts','commerce_warehouses','commerce_categories','commerce_brands','commerce_manufacturers',
    'commerce_products','commerce_product_variants','commerce_product_identifiers','commerce_prices',
    'commerce_media_assets','commerce_media_links','commerce_inventory_sources','commerce_inventory_balances'
  ] loop
    execute format('drop trigger if exists %I_updated_at_trigger on public.%I', v_table, v_table);
    execute format('create trigger %I_updated_at_trigger before update on public.%I for each row execute function public.dimpro_set_updated_at()', v_table, v_table);
  end loop;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'commerce_schema_meta','commerce_storefronts','commerce_warehouses','commerce_categories','commerce_brands','commerce_manufacturers',
    'commerce_products','commerce_product_variants','commerce_product_identifiers','commerce_prices',
    'commerce_media_assets','commerce_media_links','commerce_inventory_sources','commerce_external_inventory_snapshots',
    'commerce_inventory_balances','commerce_stock_movements','commerce_audit_events','commerce_outbox_events'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on table public.%I from anon, authenticated, service_role', v_table);
  end loop;
end;
$$;

-- Service API privileges. Inventory ledger mutation is RPC-only.
grant select on table public.commerce_schema_meta to service_role;
grant select,insert,update,delete on table
  public.commerce_storefronts, public.commerce_warehouses, public.commerce_categories, public.commerce_brands,
  public.commerce_manufacturers, public.commerce_products, public.commerce_product_variants,
  public.commerce_product_identifiers, public.commerce_prices, public.commerce_media_assets,
  public.commerce_media_links, public.commerce_inventory_sources, public.commerce_external_inventory_snapshots
to service_role;
grant select on table public.commerce_inventory_balances, public.commerce_stock_movements, public.commerce_audit_events, public.commerce_outbox_events to service_role;




create or replace function public.commerce_product_create_atomic(
  p_organization_id uuid,
  p_name text,
  p_slug text,
  p_description text default null,
  p_type_model text default null,
  p_category_id uuid default null,
  p_brand_id uuid default null,
  p_manufacturer_id uuid default null,
  p_status text default 'DRAFT',
  p_default_variant jsonb default '{}'::jsonb,
  p_identifiers jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  if v_unit not in ('DB','KG','G','M','M2','M3','FM','L','CSOMAG','PAR','KESZLET') then raise exception 'COMMERCE_VARIANT_UNIT_INVALID'; end if;
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
$$;

create or replace function public.commerce_inventory_apply_movement(
  p_organization_id uuid,
  p_source_id uuid,
  p_variant_id uuid,
  p_stock_status text,
  p_movement_type text,
  p_physical_delta numeric,
  p_reserved_delta numeric,
  p_incoming_delta numeric,
  p_idempotency_key text,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_occurred_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.commerce_inventory_sources%rowtype;
  v_existing public.commerce_stock_movements%rowtype;
  v_balance public.commerce_inventory_balances%rowtype;
  v_movement_id uuid;
  v_physical numeric(20,6);
  v_reserved numeric(20,6);
  v_incoming numeric(20,6);
begin
  if nullif(btrim(p_idempotency_key),'') is null then raise exception 'COMMERCE_IDEMPOTENCY_KEY_REQUIRED'; end if;
  if upper(p_stock_status) not in ('SELLABLE','RESERVED','QUARANTINE','DAMAGED','OUTLET','BLOCKED','IN_TRANSIT','RETURNED','SCRAP') then raise exception 'COMMERCE_STOCK_STATUS_INVALID'; end if;
  if upper(p_movement_type) not in ('RECEIPT','SALE','RESERVATION_COMMIT','RESERVATION_RELEASE','TRANSFER_OUT','TRANSFER_IN','ADJUSTMENT','RETURN') then raise exception 'COMMERCE_MOVEMENT_TYPE_INVALID'; end if;
  if coalesce(p_physical_delta,0)=0 and coalesce(p_reserved_delta,0)=0 and coalesce(p_incoming_delta,0)=0 then raise exception 'COMMERCE_MOVEMENT_ZERO_DELTA'; end if;

  select * into v_source from public.commerce_inventory_sources
  where id=p_source_id and organization_id=p_organization_id and source_type='INTERNAL' and active and archived_at is null;
  if not found then raise exception 'COMMERCE_INTERNAL_SOURCE_NOT_FOUND'; end if;
  if not exists (select 1 from public.commerce_product_variants v where v.id=p_variant_id and v.organization_id=p_organization_id and v.archived_at is null) then raise exception 'COMMERCE_VARIANT_SCOPE_MISMATCH'; end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_organization_id::text,p_source_id::text,p_variant_id::text,upper(p_stock_status)),0));

  select * into v_existing from public.commerce_stock_movements
  where organization_id=p_organization_id and idempotency_key=btrim(p_idempotency_key);
  if found then
    if v_existing.source_id<>p_source_id or v_existing.variant_id<>p_variant_id or v_existing.stock_status<>upper(p_stock_status)
      or v_existing.movement_type<>upper(p_movement_type) or v_existing.physical_delta<>coalesce(p_physical_delta,0)
      or v_existing.reserved_delta<>coalesce(p_reserved_delta,0) or v_existing.incoming_delta<>coalesce(p_incoming_delta,0) then
      raise exception 'COMMERCE_IDEMPOTENCY_PAYLOAD_MISMATCH';
    end if;
    select * into v_balance from public.commerce_inventory_balances
    where organization_id=p_organization_id and source_id=p_source_id and variant_id=p_variant_id and stock_status=upper(p_stock_status) and archived_at is null;
    return jsonb_build_object('duplicate',true,'movementId',v_existing.id,'balanceId',v_balance.id,'physicalQuantity',v_balance.physical_quantity,'reservedQuantity',v_balance.reserved_quantity,'availableQuantity',v_balance.available_quantity,'incomingQuantity',v_balance.incoming_quantity);
  end if;

  insert into public.commerce_inventory_balances(organization_id,source_id,warehouse_id,variant_id,stock_status,physical_quantity,reserved_quantity,incoming_quantity)
  values (p_organization_id,p_source_id,v_source.warehouse_id,p_variant_id,upper(p_stock_status),0,0,0)
  on conflict (organization_id,source_id,variant_id,stock_status) do nothing;

  select * into v_balance from public.commerce_inventory_balances
  where organization_id=p_organization_id and source_id=p_source_id and variant_id=p_variant_id and stock_status=upper(p_stock_status) and archived_at is null
  for update;

  v_physical := v_balance.physical_quantity + coalesce(p_physical_delta,0);
  v_reserved := v_balance.reserved_quantity + coalesce(p_reserved_delta,0);
  v_incoming := v_balance.incoming_quantity + coalesce(p_incoming_delta,0);
  if v_physical < 0 then raise exception 'COMMERCE_PHYSICAL_NEGATIVE'; end if;
  if v_reserved < 0 then raise exception 'COMMERCE_RESERVED_NEGATIVE'; end if;
  if v_incoming < 0 then raise exception 'COMMERCE_INCOMING_NEGATIVE'; end if;
  if v_reserved > v_physical then raise exception 'COMMERCE_RESERVED_EXCEEDS_PHYSICAL'; end if;

  update public.commerce_inventory_balances set
    physical_quantity=v_physical, reserved_quantity=v_reserved, incoming_quantity=v_incoming, last_movement_at=coalesce(p_occurred_at,now()), updated_at=now()
  where id=v_balance.id
  returning * into v_balance;

  insert into public.commerce_stock_movements(organization_id,source_id,warehouse_id,variant_id,stock_status,movement_type,physical_delta,reserved_delta,incoming_delta,idempotency_key,reference_type,reference_id,occurred_at)
  values (p_organization_id,p_source_id,v_source.warehouse_id,p_variant_id,upper(p_stock_status),upper(p_movement_type),coalesce(p_physical_delta,0),coalesce(p_reserved_delta,0),coalesce(p_incoming_delta,0),btrim(p_idempotency_key),nullif(btrim(p_reference_type),''),p_reference_id,coalesce(p_occurred_at,now()))
  returning id into v_movement_id;

  insert into public.commerce_audit_events(organization_id,action,entity_type,entity_id,metadata)
  values (p_organization_id,'STOCK_MOVEMENT_APPLIED','STOCK_MOVEMENT',v_movement_id,jsonb_build_object('sourceId',p_source_id,'variantId',p_variant_id,'movementType',upper(p_movement_type)));
  insert into public.commerce_outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values (p_organization_id,'PRODUCT_VARIANT',p_variant_id,'STOCK_MOVEMENT_APPLIED',jsonb_build_object('movementId',v_movement_id,'sourceId',p_source_id),'stock-movement:'||btrim(p_idempotency_key));

  return jsonb_build_object('duplicate',false,'movementId',v_movement_id,'balanceId',v_balance.id,'physicalQuantity',v_balance.physical_quantity,'reservedQuantity',v_balance.reserved_quantity,'availableQuantity',v_balance.available_quantity,'incomingQuantity',v_balance.incoming_quantity);
end;
$$;

revoke all on function public.commerce_product_create_atomic(uuid,text,text,text,text,uuid,uuid,uuid,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.commerce_product_create_atomic(uuid,text,text,text,text,uuid,uuid,uuid,text,jsonb,jsonb) to service_role;
revoke all on function public.commerce_inventory_apply_movement(uuid,uuid,uuid,text,text,numeric,numeric,numeric,text,text,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.commerce_inventory_apply_movement(uuid,uuid,uuid,text,text,numeric,numeric,numeric,text,text,uuid,timestamptz) to service_role;

comment on table public.commerce_stock_movements is 'Append-only Commerce inventory ledger. API must not expose UPDATE/DELETE.';
comment on column public.commerce_inventory_balances.available_quantity is 'Generated read model: physical_quantity - reserved_quantity.';
