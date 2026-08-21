-- DIMPRO Commerce Storefront Product Mapping P1 rollback — DEV only

drop trigger if exists commerce_storefront_mapping_validate_trigger on public.commerce_storefront_product_mappings;
drop trigger if exists commerce_storefront_product_mappings_updated_at_trigger on public.commerce_storefront_product_mappings;
drop trigger if exists commerce_soft_delete_sync_trigger on public.commerce_storefront_product_mappings;
drop trigger if exists commerce_storefront_default_source_validate_trigger on public.commerce_storefronts;

drop function if exists public.commerce_validate_storefront_product_mapping();
drop function if exists public.commerce_validate_storefront_default_fulfillment_source();

drop table if exists public.commerce_storefront_product_mappings;
drop index if exists public.commerce_storefronts_default_fulfillment_source_idx;
alter table public.commerce_storefronts drop column if exists default_fulfillment_source_id;

update public.commerce_schema_meta
set schema_version='0.1.13',migration_count=14,bootstrap_id='commerce-storefront-queue-idempotency-m1-20260819',updated_at=now()
where component='commerce-core';
