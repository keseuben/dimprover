begin;

-- DIMPRO Projektkapu DRIVE DROP Incoming Source V0.1.0
-- DEV candidate. Extends the technical DRIVE upload-session source channel
-- so first-class DROP imports preserve provenance instead of masquerading as WEB.

do $$
begin
  if to_regclass('public.drive_storage_schema_meta') is null
    or to_regclass('public.drive_core_upload_sessions') is null
    or to_regclass('public.drive_core_documents') is null then
    raise exception 'DRIVE_DROP_INCOMING_SOURCE_PREREQUISITES_MISSING' using errcode='P0001';
  end if;
end;
$$;

alter table public.drive_core_upload_sessions
  drop constraint if exists drive_core_upload_source_check;

alter table public.drive_core_upload_sessions
  add constraint drive_core_upload_source_check
  check (source in ('WEB','DESKTOP','DROP','SYSTEM'));

insert into public.drive_storage_schema_meta (
  component, schema_version, migration_count, bootstrap_id, applied_at, updated_at
) values (
  'drive-drop-incoming-source','0.1.0',1,'drive-drop-incoming-source-v010-20260926',now(),now()
)
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = excluded.migration_count,
  bootstrap_id = excluded.bootstrap_id,
  applied_at = excluded.applied_at,
  updated_at = now();

commit;
