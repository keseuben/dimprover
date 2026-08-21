-- DIMPRO Commerce Storefront Product Mapping P1 v0.1.14 — DEV migration
-- Explicit Storefront pilot product -> Commerce Product/ProductVariant mapping and fulfillment source preferences.

alter table public.commerce_storefronts
  add column if not exists default_fulfillment_source_id uuid null
  references public.commerce_inventory_sources(id) on delete restrict;

create index if not exists commerce_storefronts_default_fulfillment_source_idx
  on public.commerce_storefronts (organization_id, default_fulfillment_source_id)
  where deleted_at is null and default_fulfillment_source_id is not null;

create table if not exists public.commerce_storefront_product_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  storefront_id uuid not null references public.commerce_storefronts(id) on delete cascade,
  external_product_id text not null,
  external_sku text null,
  product_id uuid not null references public.commerce_products(id) on delete restrict,
  variant_id uuid not null references public.commerce_product_variants(id) on delete restrict,
  fulfillment_source_id uuid null references public.commerce_inventory_sources(id) on delete restrict,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  archived_at timestamptz null,
  check (length(btrim(external_product_id)) between 1 and 180),
  check (external_sku is null or length(btrim(external_sku)) between 1 and 180),
  check (deleted_at is not distinct from archived_at)
);

create unique index if not exists commerce_storefront_mapping_external_product_unique
  on public.commerce_storefront_product_mappings (organization_id, storefront_id, external_product_id)
  where deleted_at is null;

create unique index if not exists commerce_storefront_mapping_external_sku_unique
  on public.commerce_storefront_product_mappings (organization_id, storefront_id, upper(external_sku))
  where deleted_at is null and external_sku is not null;

create index if not exists commerce_storefront_mapping_variant_idx
  on public.commerce_storefront_product_mappings (organization_id, variant_id)
  where deleted_at is null and active;

create or replace function public.commerce_validate_storefront_product_mapping()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_storefront public.commerce_storefronts%rowtype;
  v_variant public.commerce_product_variants%rowtype;
  v_source public.commerce_inventory_sources%rowtype;
begin
  select * into v_storefront from public.commerce_storefronts
  where id=new.storefront_id and organization_id=new.organization_id and deleted_at is null;
  if not found then raise exception 'COMMERCE_STOREFRONT_MAPPING_STOREFRONT_SCOPE_MISMATCH'; end if;

  if not exists(
    select 1 from public.commerce_products p
    where p.id=new.product_id and p.organization_id=new.organization_id and p.deleted_at is null
  ) then raise exception 'COMMERCE_STOREFRONT_MAPPING_PRODUCT_SCOPE_MISMATCH'; end if;

  select * into v_variant from public.commerce_product_variants
  where id=new.variant_id and organization_id=new.organization_id and deleted_at is null;
  if not found then raise exception 'COMMERCE_STOREFRONT_MAPPING_VARIANT_SCOPE_MISMATCH'; end if;
  if v_variant.product_id<>new.product_id then raise exception 'COMMERCE_STOREFRONT_MAPPING_PRODUCT_VARIANT_MISMATCH'; end if;

  if new.fulfillment_source_id is not null then
    select * into v_source from public.commerce_inventory_sources
    where id=new.fulfillment_source_id and organization_id=new.organization_id
      and source_type='INTERNAL' and active and deleted_at is null;
    if not found then raise exception 'COMMERCE_STOREFRONT_MAPPING_FULFILLMENT_SOURCE_INVALID'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.commerce_validate_storefront_default_fulfillment_source()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.default_fulfillment_source_id is null then return new; end if;
  if not exists(
    select 1 from public.commerce_inventory_sources s
    where s.id=new.default_fulfillment_source_id
      and s.organization_id=new.organization_id
      and s.source_type='INTERNAL'
      and s.active
      and s.deleted_at is null
  ) then raise exception 'COMMERCE_STOREFRONT_DEFAULT_FULFILLMENT_SOURCE_INVALID'; end if;
  return new;
end;
$$;

drop trigger if exists commerce_storefront_mapping_validate_trigger on public.commerce_storefront_product_mappings;
create trigger commerce_storefront_mapping_validate_trigger
before insert or update of organization_id,storefront_id,product_id,variant_id,fulfillment_source_id
on public.commerce_storefront_product_mappings
for each row execute function public.commerce_validate_storefront_product_mapping();

drop trigger if exists commerce_storefront_default_source_validate_trigger on public.commerce_storefronts;
create trigger commerce_storefront_default_source_validate_trigger
before insert or update of organization_id,default_fulfillment_source_id
on public.commerce_storefronts
for each row execute function public.commerce_validate_storefront_default_fulfillment_source();

drop trigger if exists commerce_storefront_product_mappings_updated_at_trigger on public.commerce_storefront_product_mappings;
create trigger commerce_storefront_product_mappings_updated_at_trigger
before update on public.commerce_storefront_product_mappings
for each row execute function public.dimpro_set_updated_at();

drop trigger if exists commerce_soft_delete_sync_trigger on public.commerce_storefront_product_mappings;
create trigger commerce_soft_delete_sync_trigger
before insert or update of deleted_at, archived_at on public.commerce_storefront_product_mappings
for each row execute function public.commerce_sync_soft_delete_columns();

alter table public.commerce_storefront_product_mappings enable row level security;
revoke all on table public.commerce_storefront_product_mappings from anon, authenticated, service_role;
grant select,insert,update,delete on table public.commerce_storefront_product_mappings to service_role;

comment on table public.commerce_storefront_product_mappings is
  'Maps Storefront/external product identities to canonical DIMPRO Commerce Product + ProductVariant records.';
comment on column public.commerce_storefront_product_mappings.fulfillment_source_id is
  'Optional product-level internal fulfillment source preference; order-level resolver still enforces one source per order.';
comment on column public.commerce_storefronts.default_fulfillment_source_id is
  'Optional Storefront-level internal fulfillment source used after explicit runtime configuration and product mapping preferences.';

update public.commerce_schema_meta
set schema_version='0.1.14',migration_count=15,bootstrap_id='commerce-storefront-product-mapping-p1-20260821',updated_at=now()
where component='commerce-core';
