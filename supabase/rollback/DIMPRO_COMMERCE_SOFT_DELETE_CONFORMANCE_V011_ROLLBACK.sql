-- Rollback: Commerce Soft Delete Conformance v0.1.11 -> v0.1.10 (DEV only)
-- Fail closed if canonical and compatibility timestamps diverged.

do $$
declare
  v_table text;
  v_mismatch bigint;
  v_tables text[] := array[
    'commerce_brands','commerce_categories','commerce_goods_receipt_items','commerce_goods_receipts',
    'commerce_inventory_balances','commerce_inventory_reservations','commerce_inventory_sources','commerce_manufacturers',
    'commerce_media_assets','commerce_media_links','commerce_media_overlays','commerce_media_variants',
    'commerce_order_items','commerce_order_mirror_attempts','commerce_orders','commerce_prices',
    'commerce_product_identifiers','commerce_product_variants','commerce_products','commerce_storefronts','commerce_warehouses'
  ];
begin
  foreach v_table in array v_tables loop
    execute format('select count(*) from public.%I where deleted_at is distinct from archived_at', v_table) into v_mismatch;
    if v_mismatch <> 0 then
      raise exception 'COMMERCE_SOFT_DELETE_ROLLBACK_MISMATCH:%:%', v_table, v_mismatch;
    end if;
  end loop;
end $$;

do $$
declare
  v_table text;
  v_tables text[] := array[
    'commerce_brands','commerce_categories','commerce_goods_receipt_items','commerce_goods_receipts',
    'commerce_inventory_balances','commerce_inventory_reservations','commerce_inventory_sources','commerce_manufacturers',
    'commerce_media_assets','commerce_media_links','commerce_media_overlays','commerce_media_variants',
    'commerce_order_items','commerce_order_mirror_attempts','commerce_orders','commerce_prices',
    'commerce_product_identifiers','commerce_product_variants','commerce_products','commerce_storefronts','commerce_warehouses'
  ];
begin
  foreach v_table in array v_tables loop
    execute format('drop trigger if exists commerce_soft_delete_sync_trigger on public.%I', v_table);
    execute format('alter table public.%I drop constraint if exists commerce_soft_delete_sync_check', v_table);
    execute format('alter table public.%I drop column if exists deleted_at', v_table);
    execute format('comment on column public.%I.archived_at is %L', v_table, 'Legacy Commerce archive timestamp.');
  end loop;
end $$;

drop function if exists public.commerce_sync_soft_delete_columns();

update public.commerce_schema_meta
set schema_version='0.1.10',
    migration_count=11,
    bootstrap_id='commerce-reservation-expiry-m1-20260819',
    updated_at=now()
where component='commerce-core';
