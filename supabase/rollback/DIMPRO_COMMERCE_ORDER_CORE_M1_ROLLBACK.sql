drop function if exists public.commerce_order_set_status(uuid,uuid,text,text,text,text,uuid,text);
drop function if exists public.commerce_order_create_atomic(uuid,text,text,text,text,text,text,timestamptz,text,text,jsonb,uuid,text);
drop table if exists public.commerce_order_status_events cascade;
drop table if exists public.commerce_order_items cascade;
drop table if exists public.commerce_orders cascade;
update public.commerce_schema_meta
set schema_version='0.1.5',migration_count=6,bootstrap_id='commerce-receiving-m1-20260818',updated_at=now()
where component='commerce-core';
