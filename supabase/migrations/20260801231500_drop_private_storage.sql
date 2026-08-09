-- DIMPRO Drop private storage and quarantine upload workflow
-- DROP 0.3.3 staged migration – apply only after pre-SQL validation.

begin;

alter table public.drop_files
  add column if not exists uploaded_by_membership_id uuid references public.drop_space_memberships(id) on delete set null,
  add column if not exists security_status varchar(24) not null default 'pending',
  add column if not exists quarantine_reason text,
  add column if not exists ready_at timestamptz;

alter table public.drop_upload_sessions
  add column if not exists created_by_membership_id uuid references public.drop_space_memberships(id) on delete set null,
  add column if not exists authorization_mode varchar(24) not null default 'capability_token',
  add column if not exists storage_provider text not null default '',
  add column if not exists storage_bucket text not null default '',
  add column if not exists storage_key text not null default '',
  add column if not exists failure_code text,
  add column if not exists failure_message text,
  add column if not exists reservation_released boolean not null default false,
  add column if not exists received_sha256 text,
  add column if not exists received_mime_type text,
  add column if not exists received_at timestamptz,
  add column if not exists finalized_at timestamptz;

create index if not exists drop_files_membership_idx
  on public.drop_files (uploaded_by_membership_id, created_at desc);
create index if not exists drop_files_security_idx
  on public.drop_files (security_status, virus_scan_status, upload_status, created_at);
create index if not exists drop_upload_sessions_membership_idx
  on public.drop_upload_sessions (created_by_membership_id, status, created_at desc);
create index if not exists drop_upload_sessions_storage_idx
  on public.drop_upload_sessions (storage_provider, storage_bucket, storage_key);

create or replace function public.drop_initialize_upload_atomic(
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_package public.drop_packages%rowtype;
  v_space public.drop_spaces%rowtype;
  v_membership public.drop_space_memberships%rowtype;
  v_member_access public.drop_package_members%rowtype;
  v_file public.drop_files%rowtype;
  v_session public.drop_upload_sessions%rowtype;
  v_file_id uuid;
  v_session_id uuid;
  v_package_id uuid;
  v_membership_id uuid;
  v_group_id uuid;
  v_size bigint;
  v_authorization_mode text;
  v_now timestamptz := now();
  v_space_access_end timestamptz;
  v_membership_access_end timestamptz;
  v_role_can_upload boolean := false;
  v_package_can_upload boolean := false;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception using errcode = '22023', message = 'DROP_UPLOAD_INPUT_INVALID';
  end if;

  begin
    v_package_id := nullif(p_input->>'package_id', '')::uuid;
    v_file_id := nullif(p_input->>'file_id', '')::uuid;
    v_session_id := nullif(p_input->>'session_id', '')::uuid;
    v_membership_id := nullif(p_input->>'created_by_membership_id', '')::uuid;
    v_group_id := nullif(p_input->>'group_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'DROP_UPLOAD_UUID_INVALID';
  end;

  if v_package_id is null or v_file_id is null or v_session_id is null then
    raise exception using errcode = '22023', message = 'DROP_UPLOAD_CONTEXT_INCOMPLETE';
  end if;

  v_size := coalesce((p_input->>'size_bytes')::bigint, -1);
  if v_size <= 0 then
    raise exception using errcode = '22023', message = 'DROP_UPLOAD_SIZE_INVALID';
  end if;

  v_authorization_mode := coalesce(nullif(p_input->>'authorization_mode', ''), 'capability_token');
  if v_authorization_mode not in ('space_session', 'capability_token', 'admin') then
    raise exception using errcode = '22023', message = 'DROP_UPLOAD_AUTHORIZATION_MODE_INVALID';
  end if;

  select * into v_package
    from public.drop_packages
   where id = v_package_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'DROP_PACKAGE_NOT_FOUND';
  end if;

  if v_package.status <> 'active'
     or v_package.expires_at <= v_now
     or (v_package.upload_opens_at is not null and v_package.upload_opens_at > v_now)
     or (v_package.upload_closes_at is not null and v_package.upload_closes_at <= v_now) then
    raise exception using errcode = '55000', message = 'DROP_PACKAGE_UPLOAD_UNAVAILABLE';
  end if;

  if v_size > v_package.max_file_size_bytes then
    raise exception using errcode = '22023', message = 'DROP_UPLOAD_FILE_TOO_LARGE';
  end if;
  if v_package.current_file_count + 1 > v_package.max_file_count then
    raise exception using errcode = '54000', message = 'DROP_PACKAGE_FILE_LIMIT_REACHED';
  end if;
  if v_package.current_total_size_bytes + v_size > v_package.max_total_size_bytes then
    raise exception using errcode = '54000', message = 'DROP_PACKAGE_STORAGE_LIMIT_REACHED';
  end if;

  if v_group_id is not null and not exists (
    select 1 from public.drop_groups where id = v_group_id and package_id = v_package.id
  ) then
    raise exception using errcode = '42501', message = 'DROP_UPLOAD_GROUP_INVALID';
  end if;

  if v_package.space_id is not null then
    select * into v_space
      from public.drop_spaces
     where id = v_package.space_id
     for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'DROP_SPACE_NOT_FOUND';
    end if;

    v_space_access_end := least(
      v_space.license_ends_at,
      case v_space.access_expiry_mode
        when 'fixed' then coalesce(v_space.access_ends_at, v_space.license_ends_at)
        when 'project' then coalesce(v_space.project_ends_at, v_space.license_ends_at)
        when 'license' then v_space.license_ends_at
        else v_space.license_ends_at
      end
    );
    if v_space.status <> 'active' or v_space_access_end <= v_now then
      raise exception using errcode = '55000', message = 'DROP_SPACE_NOT_WRITABLE';
    end if;
    if v_space.current_storage_bytes + v_size > v_space.storage_quota_bytes then
      raise exception using errcode = '54000', message = 'DROP_SPACE_STORAGE_LIMIT_REACHED';
    end if;

    if v_authorization_mode = 'space_session' then
      if v_membership_id is null then
        raise exception using errcode = '22023', message = 'DROP_UPLOAD_MEMBERSHIP_REQUIRED';
      end if;
      select * into v_membership
        from public.drop_space_memberships
       where id = v_membership_id
         and space_id = v_space.id
       for update;
      if not found or v_membership.status <> 'active' or v_membership.accepted_at is null then
        raise exception using errcode = '42501', message = 'DROP_SPACE_MEMBERSHIP_NOT_ACTIVE';
      end if;
      v_membership_access_end := least(v_space_access_end, coalesce(v_membership.access_ends_at, v_space_access_end));
      if v_membership_access_end <= v_now then
        raise exception using errcode = '55000', message = 'DROP_SPACE_ACCESS_EXPIRED';
      end if;
      v_role_can_upload := v_membership.role in ('owner', 'space_admin', 'contributor', 'uploader');
      if not v_role_can_upload then
        raise exception using errcode = '42501', message = 'DROP_SPACE_UPLOAD_FORBIDDEN';
      end if;

      if v_membership.role in ('owner', 'space_admin') or v_package.created_by_membership_id = v_membership.id then
        v_package_can_upload := true;
      elsif v_package.visibility = 'space_members' then
        v_package_can_upload := true;
      else
        select * into v_member_access
          from public.drop_package_members
         where package_id = v_package.id
           and membership_id = v_membership.id;
        v_package_can_upload := found and v_member_access.can_upload;
      end if;
      if not v_package_can_upload then
        raise exception using errcode = '42501', message = 'DROP_PACKAGE_UPLOAD_FORBIDDEN';
      end if;
    end if;
  elsif v_authorization_mode = 'space_session' then
    raise exception using errcode = '42501', message = 'DROP_UPLOAD_SPACE_SESSION_INVALID';
  end if;

  insert into public.drop_files (
    id,
    package_id,
    group_id,
    original_name,
    display_name,
    generated_name,
    extension,
    mime_type,
    size_original_bytes,
    size_stored_bytes,
    storage_provider,
    storage_bucket,
    storage_key,
    upload_status,
    processing_status,
    virus_scan_status,
    zip_scan_status,
    is_image,
    is_zip,
    uploaded_by_name,
    uploaded_by_email,
    uploaded_by_membership_id,
    security_status
  ) values (
    v_file_id,
    v_package.id,
    v_group_id,
    p_input->>'original_name',
    p_input->>'display_name',
    p_input->>'generated_name',
    coalesce(p_input->>'extension', ''),
    coalesce(nullif(p_input->>'mime_type', ''), 'application/octet-stream'),
    v_size,
    0,
    p_input->>'storage_provider',
    p_input->>'storage_bucket',
    p_input->>'storage_key',
    'uploading',
    'not_started',
    'pending',
    case when coalesce((p_input->>'is_zip')::boolean, false) then 'pending' else 'not_applicable' end,
    coalesce((p_input->>'is_image')::boolean, false),
    coalesce((p_input->>'is_zip')::boolean, false),
    nullif(p_input->>'uploaded_by_name', ''),
    nullif(p_input->>'uploaded_by_email', ''),
    v_membership_id,
    'pending'
  ) returning * into v_file;

  insert into public.drop_upload_sessions (
    id,
    package_id,
    file_id,
    client_upload_id,
    status,
    total_bytes,
    uploaded_bytes,
    chunk_size_bytes,
    total_parts,
    completed_parts,
    expires_at,
    created_by_membership_id,
    authorization_mode,
    storage_provider,
    storage_bucket,
    storage_key
  ) values (
    v_session_id,
    v_package.id,
    v_file.id,
    p_input->>'client_upload_id',
    'initialized',
    v_size,
    0,
    v_size::integer,
    1,
    0,
    (p_input->>'expires_at')::timestamptz,
    v_membership_id,
    v_authorization_mode,
    p_input->>'storage_provider',
    p_input->>'storage_bucket',
    p_input->>'storage_key'
  ) returning * into v_session;

  insert into public.drop_upload_parts (session_id, part_number, size_bytes, status)
  values (v_session.id, 1, v_size::integer, 'pending');

  update public.drop_packages
     set current_file_count = current_file_count + 1,
         current_total_size_bytes = current_total_size_bytes + v_size,
         updated_at = v_now
   where id = v_package.id;

  if v_package.space_id is not null then
    update public.drop_spaces
       set current_storage_bytes = current_storage_bytes + v_size,
           updated_at = v_now
     where id = v_package.space_id;
  end if;

  insert into public.drop_events (
    package_id, file_id, event_type, actor_name, actor_email, payload
  ) values (
    v_package.id,
    v_file.id,
    'upload.initialized',
    nullif(p_input->>'uploaded_by_name', ''),
    nullif(p_input->>'uploaded_by_email', ''),
    jsonb_build_object(
      'sessionId', v_session.id,
      'authorizationMode', v_authorization_mode,
      'sizeBytes', v_size,
      'storageProvider', p_input->>'storage_provider',
      'tokenPersisted', false
    )
  );

  return jsonb_build_object('file', to_jsonb(v_file), 'session', to_jsonb(v_session));
end;
$$;

create or replace function public.drop_mark_upload_received(
  p_session_id uuid,
  p_received_bytes bigint,
  p_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.drop_upload_sessions%rowtype;
  v_file public.drop_files%rowtype;
  v_now timestamptz := now();
begin
  select * into v_session
    from public.drop_upload_sessions
   where id = p_session_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'DROP_UPLOAD_SESSION_NOT_FOUND';
  end if;
  if v_session.status not in ('initialized', 'uploading') or v_session.reservation_released then
    raise exception using errcode = '55000', message = 'DROP_UPLOAD_SESSION_UNAVAILABLE';
  end if;
  if v_session.expires_at <= v_now then
    raise exception using errcode = '55000', message = 'DROP_UPLOAD_SESSION_EXPIRED';
  end if;
  if p_received_bytes <> v_session.total_bytes then
    raise exception using errcode = '22023', message = 'DROP_UPLOAD_SIZE_MISMATCH';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'DROP_UPLOAD_SHA256_INVALID';
  end if;

  update public.drop_upload_sessions
     set status = 'uploaded',
         uploaded_bytes = p_received_bytes,
         completed_parts = 1,
         received_sha256 = p_sha256,
         received_at = v_now,
         updated_at = v_now
   where id = v_session.id
   returning * into v_session;

  update public.drop_upload_parts
     set size_bytes = p_received_bytes::integer,
         checksum = p_sha256,
         status = 'completed',
         completed_at = v_now
   where session_id = v_session.id and part_number = 1;

  select * into v_file from public.drop_files where id = v_session.file_id;
  return jsonb_build_object('file', to_jsonb(v_file), 'session', to_jsonb(v_session));
end;
$$;

create or replace function public.drop_finalize_quarantine_upload(
  p_session_id uuid,
  p_detected_mime_type text,
  p_stored_bytes bigint,
  p_sha256 text,
  p_zip_scan_status text,
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
  v_now timestamptz := now();
begin
  select * into v_session
    from public.drop_upload_sessions
   where id = p_session_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'DROP_UPLOAD_SESSION_NOT_FOUND';
  end if;
  if v_session.status <> 'uploaded' or v_session.reservation_released then
    raise exception using errcode = '55000', message = 'DROP_UPLOAD_SESSION_NOT_FINALIZABLE';
  end if;
  if p_stored_bytes <> v_session.total_bytes or p_sha256 <> v_session.received_sha256 then
    raise exception using errcode = '22023', message = 'DROP_UPLOAD_FINALIZE_MISMATCH';
  end if;

  update public.drop_files
     set detected_mime_type = nullif(p_detected_mime_type, ''),
         size_stored_bytes = p_stored_bytes,
         sha256 = p_sha256,
         upload_status = 'processing',
         processing_status = 'quarantined',
         virus_scan_status = 'scanner_required',
         zip_scan_status = coalesce(nullif(p_zip_scan_status, ''), zip_scan_status),
         security_status = 'scanner_required',
         quarantine_reason = coalesce(nullif(p_quarantine_reason, ''), 'Víruskereső ellenőrzés szükséges.'),
         updated_at = v_now
   where id = v_session.file_id
   returning * into v_file;

  update public.drop_upload_sessions
     set status = 'completed',
         completed_at = v_now,
         finalized_at = v_now,
         received_mime_type = nullif(p_detected_mime_type, ''),
         updated_at = v_now
   where id = v_session.id
   returning * into v_session;

  insert into public.drop_events (
    package_id, file_id, event_type, severity, actor_name, actor_email, payload
  ) values (
    v_session.package_id,
    v_session.file_id,
    'upload.quarantined',
    'warning',
    v_file.uploaded_by_name,
    v_file.uploaded_by_email,
    jsonb_build_object(
      'sessionId', v_session.id,
      'sizeBytes', p_stored_bytes,
      'sha256', p_sha256,
      'detectedMimeType', p_detected_mime_type,
      'zipScanStatus', p_zip_scan_status,
      'virusScanStatus', 'scanner_required'
    )
  );

  return jsonb_build_object('file', to_jsonb(v_file), 'session', to_jsonb(v_session));
end;
$$;

create or replace function public.drop_abort_upload_atomic(
  p_session_id uuid,
  p_failure_code text,
  p_failure_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.drop_upload_sessions%rowtype;
  v_file public.drop_files%rowtype;
  v_package public.drop_packages%rowtype;
  v_released boolean := false;
  v_now timestamptz := now();
begin
  select * into v_session
    from public.drop_upload_sessions
   where id = p_session_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'DROP_UPLOAD_SESSION_NOT_FOUND';
  end if;

  select * into v_file from public.drop_files where id = v_session.file_id for update;
  select * into v_package from public.drop_packages where id = v_session.package_id for update;

  if not v_session.reservation_released and v_session.status <> 'completed' then
    update public.drop_packages
       set current_file_count = greatest(0, current_file_count - 1),
           current_total_size_bytes = greatest(0, current_total_size_bytes - v_session.total_bytes),
           updated_at = v_now
     where id = v_session.package_id;

    if v_package.space_id is not null then
      update public.drop_spaces
         set current_storage_bytes = greatest(0, current_storage_bytes - v_session.total_bytes),
             updated_at = v_now
       where id = v_package.space_id;
    end if;
    v_released := true;
  end if;

  update public.drop_upload_sessions
     set status = case when status = 'completed' then status else 'failed' end,
         failure_code = nullif(p_failure_code, ''),
         failure_message = left(nullif(p_failure_message, ''), 2000),
         reservation_released = reservation_released or v_released,
         updated_at = v_now
   where id = v_session.id
   returning * into v_session;

  if v_session.status <> 'completed' then
    update public.drop_files
       set upload_status = 'failed',
           processing_status = 'failed',
           security_status = 'rejected',
           quarantine_reason = left(coalesce(nullif(p_failure_message, ''), 'A feltöltés megszakadt.'), 2000),
           deleted_at = v_now,
           updated_at = v_now
     where id = v_session.file_id
     returning * into v_file;
  end if;

  insert into public.drop_events (
    package_id, file_id, event_type, severity, actor_name, actor_email, payload
  ) values (
    v_session.package_id,
    v_session.file_id,
    'upload.failed',
    'error',
    v_file.uploaded_by_name,
    v_file.uploaded_by_email,
    jsonb_build_object(
      'sessionId', v_session.id,
      'failureCode', p_failure_code,
      'reservationReleased', v_released
    )
  );

  return jsonb_build_object('file', to_jsonb(v_file), 'session', to_jsonb(v_session), 'reservationReleased', v_released);
end;
$$;

grant execute on function public.drop_initialize_upload_atomic(jsonb) to service_role;
grant execute on function public.drop_mark_upload_received(uuid, bigint, text) to service_role;
grant execute on function public.drop_finalize_quarantine_upload(uuid, text, bigint, text, text, text) to service_role;
grant execute on function public.drop_abort_upload_atomic(uuid, text, text) to service_role;

insert into public.drop_schema_meta (
  component,
  schema_version,
  migration_count,
  bootstrap_id,
  metadata,
  installed_at,
  updated_at
) values (
  'drop-storage',
  'DROP 0.3.3',
  1,
  'drop-033-private-storage-quarantine-20260801',
  jsonb_build_object(
    'providerAbstraction', true,
    'localPrivateAdapter', true,
    's3CompatiblePrepared', true,
    'streamingUpload', true,
    'atomicQuotaReservation', true,
    'sha256Required', true,
    'mimeDetectionRequired', true,
    'zipSafetyRequired', true,
    'virusScannerRequiredForRelease', true,
    'publicDownloadEnabled', false
  ),
  now(),
  now()
)
on conflict (component) do update
set schema_version = excluded.schema_version,
    migration_count = excluded.migration_count,
    bootstrap_id = excluded.bootstrap_id,
    metadata = excluded.metadata,
    updated_at = excluded.updated_at;

commit;
