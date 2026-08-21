-- DIMPRO Commerce Storefront Order Persistence P5 rollback — DEV only
-- Active Storefront order shells must be cleaned/archived explicitly before rollback.

do $$
begin
  if to_regclass('public.commerce_storefront_orders') is not null and exists(
    select 1 from public.commerce_storefront_orders where deleted_at is null
  ) then
    raise exception 'COMMERCE_P5_ROLLBACK_STOREFRONT_ORDERS_IN_USE';
  end if;
end;
$$;

drop function if exists public.commerce_storefront_order_set_status(uuid,text,text);
drop function if exists public.commerce_storefront_order_create(uuid,text,text,text,text,jsonb);
drop table if exists public.commerce_storefront_orders;
drop sequence if exists public.commerce_storefront_order_number_seq;

update public.commerce_schema_meta
set schema_version='0.1.15',migration_count=16,bootstrap_id='commerce-pilot-units-p2-20260821',updated_at=now()
where component='commerce-core';

notify pgrst, 'reload schema';
