drop function if exists public.commerce_order_mirror_record(uuid,uuid,text,text,text,jsonb,text,uuid,integer,integer,text,text);
drop table if exists public.commerce_order_mirror_attempts cascade;
update public.commerce_schema_meta
set schema_version='0.1.7',migration_count=8,bootstrap_id='commerce-order-inventory-bridge-m1-20260818',updated_at=now()
where component='commerce-core';
