drop function if exists public.commerce_price_set_active(uuid,uuid,text,bigint,integer,timestamptz);
drop index if exists public.commerce_prices_current_lookup_idx;
grant select,insert,update,delete on table public.commerce_prices to service_role;
update public.commerce_schema_meta
set schema_version='0.1.1', migration_count=2, bootstrap_id='commerce-media-m1-20260818', updated_at=now()
where component='commerce-core';
