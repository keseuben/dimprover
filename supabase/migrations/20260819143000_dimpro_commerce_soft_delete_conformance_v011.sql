-- DIMPRO Commerce Soft Delete Conformance v0.1.11 — DEV forward migration
-- Canonical soft delete: deleted_at timestamptz. archived_at remains a deprecated compatibility alias.

create or replace function public.commerce_sync_soft_delete_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is null and new.archived_at is not null then
      new.deleted_at := new.archived_at;
    elsif new.archived_at is null and new.deleted_at is not null then
      new.archived_at := new.deleted_at;
    elsif new.deleted_at is distinct from new.archived_at then
      raise exception 'COMMERCE_SOFT_DELETE_TIMESTAMP_MISMATCH';
    end if;
    return new;
  end if;

  if new.deleted_at is distinct from old.deleted_at
     and new.archived_at is not distinct from old.archived_at then
    new.archived_at := new.deleted_at;
  elsif new.archived_at is distinct from old.archived_at
        and new.deleted_at is not distinct from old.deleted_at then
    new.deleted_at := new.archived_at;
  elsif new.deleted_at is distinct from old.deleted_at
        and new.archived_at is distinct from old.archived_at
        and new.deleted_at is distinct from new.archived_at then
    raise exception 'COMMERCE_SOFT_DELETE_TIMESTAMP_MISMATCH';
  end if;

  return new;
end;
$$;

comment on function public.commerce_sync_soft_delete_columns() is
  'Keeps canonical deleted_at and deprecated archived_at soft-delete timestamps identical during migration compatibility.';

do $$
declare
  v_table text;
  v_tables text[] := array[
    'commerce_brands',
    'commerce_categories',
    'commerce_goods_receipt_items',
    'commerce_goods_receipts',
    'commerce_inventory_balances',
    'commerce_inventory_reservations',
    'commerce_inventory_sources',
    'commerce_manufacturers',
    'commerce_media_assets',
    'commerce_media_links',
    'commerce_media_overlays',
    'commerce_media_variants',
    'commerce_order_items',
    'commerce_order_mirror_attempts',
    'commerce_orders',
    'commerce_prices',
    'commerce_product_identifiers',
    'commerce_product_variants',
    'commerce_products',
    'commerce_storefronts',
    'commerce_warehouses'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'COMMERCE_SOFT_DELETE_TABLE_MISSING:%', v_table;
    end if;

    execute format('alter table public.%I add column if not exists deleted_at timestamptz null', v_table);
    execute format('comment on column public.%I.deleted_at is %L', v_table, 'Canonical DIMPRO Commerce soft-delete timestamp (UTC timestamptz).');
    execute format('comment on column public.%I.archived_at is %L', v_table, 'Deprecated compatibility alias for deleted_at; maintained by commerce_sync_soft_delete_columns().');

    execute format('update public.%I set deleted_at=archived_at where deleted_at is null and archived_at is not null', v_table);
    execute format('update public.%I set archived_at=deleted_at where archived_at is null and deleted_at is not null', v_table);

    execute format('drop trigger if exists commerce_soft_delete_sync_trigger on public.%I', v_table);
    execute format(
      'create trigger commerce_soft_delete_sync_trigger before insert or update of deleted_at, archived_at on public.%I for each row execute function public.commerce_sync_soft_delete_columns()',
      v_table
    );

    execute format('alter table public.%I drop constraint if exists commerce_soft_delete_sync_check', v_table);
    execute format(
      'alter table public.%I add constraint commerce_soft_delete_sync_check check (deleted_at is not distinct from archived_at)',
      v_table
    );
  end loop;
end $$;

update public.commerce_schema_meta
set schema_version='0.1.11',
    migration_count=12,
    bootstrap_id='commerce-soft-delete-conformance-v011-20260819',
    updated_at=now()
where component='commerce-core';
