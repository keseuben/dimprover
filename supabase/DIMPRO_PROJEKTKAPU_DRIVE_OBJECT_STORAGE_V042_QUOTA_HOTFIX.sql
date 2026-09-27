begin;

do $$
begin
  if to_regclass('public.drive_storage_schema_meta') is null
    or to_regclass('public.drive_core_upload_sessions') is null
    or to_regclass('public.drive_core_documents') is null
    or to_regclass('public.drive_core_document_versions') is null then
    raise exception 'DRIVE_OBJECT_STORAGE_V040_REQUIRED' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.drive_core_create_upload_session_atomic(
  p_project_id text,
  p_session jsonb,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_document public.drive_core_documents;
  v_session public.drive_core_upload_sessions;
  v_quota_bytes bigint := coalesce((p_session->>'quota_bytes')::bigint,0);
  v_new_size_bytes bigint := coalesce((p_session->>'size_bytes')::bigint,0);
  v_used_bytes bigint := 0;
  v_reserved_bytes bigint := 0;
begin
  if not exists (
    select 1 from public.project_core_projects
    where id = p_project_id and status <> 'DELETED'
  ) then
    raise exception 'DRIVE_CORE_PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_quota_bytes <= 0 then
    raise exception 'DRIVE_PROJECT_QUOTA_REQUIRED' using errcode = 'P0001';
  end if;
  if v_new_size_bytes <= 0 then
    raise exception 'DRIVE_UPLOAD_SIZE_REQUIRED' using errcode = '22023';
  end if;

  -- Serializes quota reservations per project so concurrent upload-init requests
  -- cannot both pass against the same stale used/reserved snapshot.
  perform pg_advisory_xact_lock(hashtext('drive-project-quota-v042'), hashtext(p_project_id));

  update public.drive_core_upload_sessions set
    status = 'EXPIRED',
    completed_at = coalesce(completed_at,now()),
    updated_at = now(),
    metadata = metadata || jsonb_build_object('expiredAt',now())
  where project_id = p_project_id and status = 'INITIATED' and expires_at <= now();

  select coalesce(sum(size_bytes),0)::bigint into v_used_bytes
  from public.drive_core_document_versions
  where project_id = p_project_id
    and storage_provider = 'S3'
    and status in ('AVAILABLE','QUARANTINED');

  select coalesce(sum(size_bytes),0)::bigint into v_reserved_bytes
  from public.drive_core_upload_sessions
  where project_id = p_project_id
    and status = 'INITIATED'
    and expires_at > now();

  if v_used_bytes + v_reserved_bytes + v_new_size_bytes > v_quota_bytes then
    raise exception 'DRIVE_PROJECT_QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;

  v_kind := p_session->>'upload_kind';
  if v_kind = 'NEW_DOCUMENT' then
    if not exists (
      select 1 from public.drive_core_folders
      where id = p_session->>'folder_id' and project_id = p_project_id and status = 'ACTIVE'
    ) then
      raise exception 'DRIVE_CORE_FOLDER_NOT_FOUND' using errcode = 'P0002';
    end if;
    if exists (
      select 1 from public.drive_core_documents
      where project_id = p_project_id
        and folder_id = p_session->>'folder_id'
        and lower(name) = lower(p_session->>'document_name')
        and status = 'ACTIVE'
    ) then
      raise exception 'DRIVE_DOCUMENT_NAME_CONFLICT' using errcode = '23505';
    end if;
  elsif v_kind = 'NEW_VERSION' then
    select * into v_document from public.drive_core_documents
      where id = p_session->>'document_id' and project_id = p_project_id and status = 'ACTIVE';
    if v_document.id is null then
      raise exception 'DRIVE_CORE_DOCUMENT_NOT_FOUND' using errcode = 'P0002';
    end if;
    if coalesce((p_session->>'expected_current_version')::integer,0) > 0
      and coalesce((p_session->>'expected_current_version')::integer,0) <> v_document.current_version_number then
      raise exception 'DRIVE_CORE_VERSION_CONFLICT' using errcode = 'P0001';
    end if;
  else
    raise exception 'DRIVE_UPLOAD_KIND_INVALID' using errcode = '22023';
  end if;

  insert into public.drive_core_upload_sessions (
    id, project_id, folder_id, document_id, upload_kind, document_name, original_name, mime_type,
    size_bytes, sha256, expected_current_version, source, client_id, storage_provider, storage_bucket,
    storage_key, final_version_status, status, expires_at, created_by, created_at, updated_at, metadata
  ) values (
    p_session->>'id', p_project_id, nullif(p_session->>'folder_id',''), nullif(p_session->>'document_id',''),
    v_kind, p_session->>'document_name', p_session->>'original_name',
    coalesce(p_session->>'mime_type','application/octet-stream'), v_new_size_bytes,
    nullif(p_session->>'sha256',''), coalesce((p_session->>'expected_current_version')::integer,0),
    coalesce(p_session->>'source','WEB'), nullif(p_session->>'client_id',''), 'S3',
    p_session->>'storage_bucket', p_session->>'storage_key',
    coalesce(p_session->>'final_version_status','QUARANTINED'), 'INITIATED',
    (p_session->>'expires_at')::timestamptz, p_actor_user_id,
    coalesce(nullif(p_session->>'created_at','')::timestamptz,now()),
    coalesce(nullif(p_session->>'updated_at','')::timestamptz,now()),
    coalesce(p_session->'metadata','{}'::jsonb)
  ) returning * into v_session;

  return to_jsonb(v_session);
end;
$$;

revoke all on function public.drive_core_create_upload_session_atomic(text,jsonb,text) from public, anon, authenticated;
grant execute on function public.drive_core_create_upload_session_atomic(text,jsonb,text) to service_role;

insert into public.drive_storage_schema_meta(component,schema_version,migration_count,bootstrap_id,applied_at,updated_at)
values('drive-object-storage','0.4.2',2,'drive-object-storage-v042-quota-20260927',now(),now())
on conflict(component) do update set
  schema_version=excluded.schema_version,
  migration_count=excluded.migration_count,
  bootstrap_id=excluded.bootstrap_id,
  applied_at=excluded.applied_at,
  updated_at=excluded.updated_at;

commit;
