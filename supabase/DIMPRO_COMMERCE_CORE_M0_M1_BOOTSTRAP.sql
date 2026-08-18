-- DIMPRO Commerce Core M0/M1 - STAGED DEV migration
-- Created by OutminAI, 2026-08-18.
-- IMPORTANT: do not apply to PROD. DEV application requires explicit migration gate.
-- Dependency: DIMPRO Identity Core V0.1+ (dimpro_organizations, dimpro_is_organization_member, dimpro_set_updated_at).

create extension if not exists pgcrypto;

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
    'commerce_storefronts','commerce_warehouses','commerce_categories','commerce_brands','commerce_manufacturers',
    'commerce_products','commerce_product_variants','commerce_product_identifiers','commerce_prices',
    'commerce_media_assets','commerce_media_links','commerce_inventory_sources','commerce_external_inventory_snapshots',
    'commerce_inventory_balances','commerce_stock_movements','commerce_audit_events','commerce_outbox_events'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('drop policy if exists %I_org_select on public.%I', v_table, v_table);
    execute format(
      'create policy %I_org_select on public.%I for select to authenticated using (public.dimpro_is_organization_member(organization_id))',
      v_table, v_table
    );
  end loop;
end;
$$;

comment on table public.commerce_stock_movements is 'Append-only Commerce inventory ledger. API must not expose UPDATE/DELETE.';
comment on column public.commerce_inventory_balances.available_quantity is 'Generated read model: physical_quantity - reserved_quantity.';
