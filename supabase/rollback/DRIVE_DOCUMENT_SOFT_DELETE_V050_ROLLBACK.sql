begin;

drop function if exists public.drive_core_soft_delete_documents_atomic(text,text[],text);

update public.drive_core_schema_meta
set schema_version = '0.3.0',
    migration_count = 1,
    bootstrap_id = 'drive-core-v030-20260802',
    updated_at = now()
where component = 'drive-core'
  and schema_version = '0.5.0'
  and bootstrap_id = 'drive-core-v050-soft-delete-20260928';

commit;
