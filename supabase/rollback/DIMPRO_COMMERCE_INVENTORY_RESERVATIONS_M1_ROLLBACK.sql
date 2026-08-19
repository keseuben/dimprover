drop function if exists public.commerce_inventory_reservation_apply(uuid,uuid,text,numeric,text);
drop function if exists public.commerce_inventory_reservation_create(uuid,uuid,uuid,numeric,text,text,text,uuid,timestamptz);
drop table if exists public.commerce_inventory_reservation_events cascade;
drop table if exists public.commerce_inventory_reservations cascade;
update public.commerce_schema_meta
set schema_version='0.1.2', migration_count=3, bootstrap_id='commerce-pricing-m1-20260818', updated_at=now()
where component='commerce-core';
