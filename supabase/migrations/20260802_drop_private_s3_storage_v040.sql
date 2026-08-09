begin;

do $$
begin
  if to_regclass('public.drop_files') is null
    or to_regclass('public.drop_upload_sessions') is null
    or to_regclass('public.drop_upload_parts') is null
    or to_regclass('public.drop_events') is null
    or to_regclass('public.drop_schema_meta') is null then
    raise exception 'DROP_034_SCHEMA_REQUIRED' using errcode = 'P0001';
  end if;
end;
$$;

alter table public.drop_files
  add column if not exists integrity_type text not null default 'FILE_SHA256',
  add column if not exists integrity_manifest_sha256 text null,
  add column if not exists object_etag text null,
  add column if not exists object_verified_at timestamptz null;

alter table public.drop_upload_sessions
  add column if not exists integrity_type text not null default 'FILE_SHA256',
  add column if not exists integrity_manifest_sha256 text null,
  add column if not exists object_etag text null,
  add column if not exists object_verified_at timestamptz null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'drop_files_integrity_type_check'
  ) then
    alter table public.drop_files
      add constraint drop_files_integrity_type_check
      check (integrity_type in ('FILE_SHA256','PART_MANIFEST_SHA256'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'drop_upload_sessions_integrity_type_check'
  ) then
    alter table public.drop_upload_sessions
      add constraint drop_upload_sessions_integrity_type_check
      check (integrity_type in ('FILE_SHA256','PART_MANIFEST_SHA256'));
  end if;
end;
$$;

create table if not exists public.drop_object_cleanup_tasks (
  id uuid primary key default gen_random_uuid(),
  package_id uuid null,
  file_id uuid null,
  session_id uuid null,
  storage_provider text not null default 's3-compatible',
  storage_bucket text not null,
  storage_key text not null,
  storage_multipart_id text null,
  operation text not null,
  reason text not null default '',
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text null,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint drop_object_cleanup_provider_check check (storage_provider = 's3-compatible'),
  constraint drop_object_cleanup_operation_check check (operation in ('DELETE_OBJECT','ABORT_MULTIPART')),
  constraint drop_object_cleanup_status_check check (status in ('pending','failed','completed')),
  constraint drop_object_cleanup_attempts_check check (attempts between 0 and 100),
  constraint drop_object_cleanup_bucket_check check (length(btrim(storage_bucket)) between 1 and 255),
  constraint drop_object_cleanup_key_check check (length(btrim(storage_key)) between 1 and 1024)
);

create unique index if not exists drop_object_cleanup_unique_idx
  on public.drop_object_cleanup_tasks (
    storage_bucket,
    storage_key,
    operation,
    coalesce(storage_multipart_id, '')
  );

create index if not exists drop_object_cleanup_pending_idx
  on public.drop_object_cleanup_tasks (status, attempts, requested_at)
  where status in ('pending','failed');

alter table public.drop_object_cleanup_tasks enable row level security;
revoke all on table public.drop_object_cleanup_tasks from public, anon, authenticated;
grant select, insert, update, delete on table public.drop_object_cleanup_tasks to service_role;

create or replace function public.drop_finalize_s3_quarantine_upload(
  p_session_id uuid,
  p_stored_bytes bigint,
  p_manifest_sha256 text,
  p_object_etag text,
  p_detected_mime_type text,
  p_quarantine_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.drop_upload_sessions%rowtype;
  v_file public.drop_files%rowtype;
  v_completed_parts integer;
  v_sum_bytes bigint;
  v_now timestamptz := now();
begin
  select * into v_session
    from public.drop_upload_sessions
   where id = p_session_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'DROP_UPLOAD_SESSION_NOT_FOUND';
  end if;
  if v_session.storage_provider <> 's3-compatible'
     or v_session.storage_multipart_id is null
     or v_session.status <> 'parts_received'
     or v_session.reservation_released then
    raise exception using errcode = '55000', message = 'DROP_S3_SESSION_NOT_FINALIZABLE';
  end if;
  if p_stored_bytes <> v_session.total_bytes then
    raise exception using errcode = '22023', message = 'DROP_S3_OBJECT_SIZE_MISMATCH';
  end if;
  if p_manifest_sha256 is null or p_manifest_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'DROP_S3_MANIFEST_SHA256_INVALID';
  end if;
  if length(btrim(coalesce(p_object_etag,''))) < 3 then
    raise exception using errcode = '22023', message = 'DROP_S3_OBJECT_ETAG_INVALID';
  end if;

  select count(*)::integer, coalesce(sum(size_bytes), 0)::bigint
    into v_completed_parts, v_sum_bytes
    from public.drop_upload_parts
   where session_id = p_session_id
     and status = 'completed'
     and etag is not null
     and checksum ~ '^[0-9a-f]{64}$';

  if v_completed_parts <> v_session.total_parts or v_sum_bytes <> v_session.total_bytes then
    raise exception using errcode = '22023', message = 'DROP_UPLOAD_PARTS_INCOMPLETE';
  end if;

  update public.drop_upload_sessions
     set status = 'completed',
         uploaded_bytes = p_stored_bytes,
         completed_parts = total_parts,
         received_sha256 = p_manifest_sha256,
         integrity_type = 'PART_MANIFEST_SHA256',
         integrity_manifest_sha256 = p_manifest_sha256,
         object_etag = btrim(p_object_etag),
         object_verified_at = v_now,
         received_mime_type = nullif(p_detected_mime_type,''),
         received_at = coalesce(received_at, v_now),
         completed_at = v_now,
         finalized_at = v_now,
         updated_at = v_now
   where id = p_session_id
   returning * into v_session;

  update public.drop_files
     set detected_mime_type = nullif(p_detected_mime_type,''),
         size_stored_bytes = p_stored_bytes,
         sha256 = null,
         integrity_type = 'PART_MANIFEST_SHA256',
         integrity_manifest_sha256 = p_manifest_sha256,
         object_etag = btrim(p_object_etag),
         object_verified_at = v_now,
         upload_status = 'processing',
         processing_status = 'quarantined',
         virus_scan_status = 'scanner_required',
         zip_scan_status = case when is_zip then 'scanner_required' else 'not_applicable' end,
         security_status = 'scanner_required',
         quarantine_reason = coalesce(nullif(p_quarantine_reason,''),'A fájl S3 karanténban van; víruskereső ellenőrzés szükséges.'),
         updated_at = v_now
   where id = v_session.file_id
   returning * into v_file;

  insert into public.drop_events (
    package_id, file_id, event_type, severity, actor_name, actor_email, payload
  ) values (
    v_session.package_id,
    v_session.file_id,
    'upload.s3_quarantined',
    'warning',
    v_file.uploaded_by_name,
    v_file.uploaded_by_email,
    jsonb_build_object(
      'sessionId', v_session.id,
      'sizeBytes', p_stored_bytes,
      'integrityType', 'PART_MANIFEST_SHA256',
      'manifestSha256', p_manifest_sha256,
      'objectEtag', btrim(p_object_etag),
      'storageProvider', 's3-compatible',
      'virusScanStatus', 'scanner_required'
    )
  );

  return jsonb_build_object('file', to_jsonb(v_file), 'session', to_jsonb(v_session));
end;
$$;

create or replace function public.drop_queue_object_cleanup(
  p_package_id uuid,
  p_file_id uuid,
  p_session_id uuid,
  p_storage_bucket text,
  p_storage_key text,
  p_storage_multipart_id text,
  p_operation text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation text := upper(btrim(coalesce(p_operation,'')));
  v_task public.drop_object_cleanup_tasks%rowtype;
begin
  if v_operation not in ('DELETE_OBJECT','ABORT_MULTIPART') then
    raise exception using errcode = '22023', message = 'DROP_CLEANUP_OPERATION_INVALID';
  end if;
  if length(btrim(coalesce(p_storage_bucket,''))) < 1 or length(btrim(coalesce(p_storage_key,''))) < 1 then
    raise exception using errcode = '22023', message = 'DROP_CLEANUP_STORAGE_REFERENCE_INVALID';
  end if;
  if v_operation = 'ABORT_MULTIPART' and length(btrim(coalesce(p_storage_multipart_id,''))) < 1 then
    raise exception using errcode = '22023', message = 'DROP_CLEANUP_MULTIPART_ID_REQUIRED';
  end if;

  select * into v_task
    from public.drop_object_cleanup_tasks
   where storage_bucket = btrim(p_storage_bucket)
     and storage_key = btrim(p_storage_key)
     and operation = v_operation
     and coalesce(storage_multipart_id,'') = coalesce(btrim(p_storage_multipart_id),'')
   for update;

  if found then
    if v_task.status <> 'completed' then
      update public.drop_object_cleanup_tasks
         set status = 'pending',
             reason = left(btrim(coalesce(p_reason,'')),2000),
             last_error = null,
             updated_at = now()
       where id = v_task.id
       returning * into v_task;
    end if;
    return to_jsonb(v_task);
  end if;

  insert into public.drop_object_cleanup_tasks (
    package_id, file_id, session_id, storage_bucket, storage_key,
    storage_multipart_id, operation, reason
  ) values (
    p_package_id, p_file_id, p_session_id, btrim(p_storage_bucket), btrim(p_storage_key),
    nullif(btrim(coalesce(p_storage_multipart_id,'')),''), v_operation,
    left(btrim(coalesce(p_reason,'')),2000)
  ) returning * into v_task;

  return to_jsonb(v_task);
end;
$$;

create or replace function public.drop_complete_object_cleanup(
  p_task_id uuid,
  p_success boolean,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.drop_object_cleanup_tasks%rowtype;
begin
  select * into v_task
    from public.drop_object_cleanup_tasks
   where id = p_task_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'DROP_CLEANUP_TASK_NOT_FOUND';
  end if;
  if v_task.status = 'completed' then
    return to_jsonb(v_task);
  end if;

  update public.drop_object_cleanup_tasks
     set status = case when p_success then 'completed' else 'failed' end,
         attempts = attempts + 1,
         last_error = case when p_success then null else left(btrim(coalesce(p_error,'Ismeretlen S3 takarítási hiba.')),2000) end,
         updated_at = now(),
         completed_at = case when p_success then now() else null end
   where id = p_task_id
   returning * into v_task;

  return to_jsonb(v_task);
end;
$$;

revoke all on function public.drop_finalize_s3_quarantine_upload(uuid,bigint,text,text,text,text) from public, anon, authenticated;
revoke all on function public.drop_queue_object_cleanup(uuid,uuid,uuid,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.drop_complete_object_cleanup(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.drop_finalize_s3_quarantine_upload(uuid,bigint,text,text,text,text) to service_role;
grant execute on function public.drop_queue_object_cleanup(uuid,uuid,uuid,text,text,text,text,text) to service_role;
grant execute on function public.drop_complete_object_cleanup(uuid,boolean,text) to service_role;

insert into public.drop_schema_meta (
  component, schema_version, migration_count, bootstrap_id, metadata, installed_at, updated_at
) values (
  'drop-storage',
  'DROP 0.4.0',
  3,
  'drop-040-private-s3-storage-20260802',
  jsonb_build_object(
    'privateS3Storage', true,
    'directMultipartUpload', true,
    'partManifestIntegrity', true,
    'durableObjectCleanup', true,
    'driveCredentialReuseForbidden', true,
    'maxFileSizeBytes', 524288000,
    'defaultChunkSizeBytes', 67108864
  ),
  now(),
  now()
)
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = excluded.migration_count,
  bootstrap_id = excluded.bootstrap_id,
  metadata = excluded.metadata,
  updated_at = now();

commit;
