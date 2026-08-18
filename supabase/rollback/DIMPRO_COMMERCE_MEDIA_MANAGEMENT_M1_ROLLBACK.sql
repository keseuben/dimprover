drop function if exists public.commerce_media_set_product_order(uuid,uuid,uuid[],uuid);
drop index if exists public.commerce_media_links_one_primary_per_entity_idx;
update public.commerce_schema_meta
set schema_version='0.1.3', migration_count=4, bootstrap_id='commerce-inventory-reservations-m1-20260818', updated_at=now()
where component='commerce-core';
