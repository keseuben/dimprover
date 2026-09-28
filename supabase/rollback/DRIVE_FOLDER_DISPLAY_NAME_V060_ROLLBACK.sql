begin;

drop function if exists public.drive_core_update_folder_display_name(text,text,text,text);

update public.drive_core_schema_meta
set schema_version = '0.5.0',
    migration_count = 2,
    bootstrap_id = 'drive-core-v050-soft-delete-20260928',
    updated_at = now()
where component = 'drive-core'
  and schema_version = '0.6.0'
  and migration_count = 3
  and bootstrap_id = 'drive-core-v060-safe-folder-names-20260928';

-- The additive original_name/display_name columns intentionally remain in place.
-- DRIVE Core 0.5.x ignores them, so rollback does not destroy captured folder naming data.

commit;
