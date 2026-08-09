begin;

do $$
begin
  if to_regclass('public.project_core_projects') is null
    or to_regclass('public.drive_core_documents') is null
    or to_regclass('public.drive_core_document_versions') is null
    or to_regclass('public.drive_core_change_events') is null then
    raise exception 'DRIVE_CORE_V030_REQUIRED' using errcode = 'P0001';
  end if;
end;
$$;

create table if not exists public.drive_storage_schema_meta (
  component text primary key,
  schema_version text not null,
  migration_count integer not null default 0,
  bootstrap_id text not null,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drive_core_upload_sessions (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  folder_id text null references public.drive_core_folders(id) on delete cascade,
  document_id text null references public.drive_core_documents(id) on delete cascade,
  upload_kind text not null,
  document_name text not null,
  original_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null,
  sha256 text null,
  expected_current_version integer not null default 0,
  source text not null default 'WEB',
  client_id text null,
  storage_provider text not null default 'S3',
  storage_bucket text not null,
  storage_key text not null,
  final_version_status text not null default 'QUARANTINED',
  status text not null default 'INITIATED',
  expires_at timestamptz not null,
  finalized_document_id text null references public.drive_core_documents(id) on delete set null,
  finalized_version_id text null references public.drive_core_document_versions(id) on delete set null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  constraint drive_core_upload_kind_check check (upload_kind in ('NEW_DOCUMENT','NEW_VERSION')),
  constraint drive_core_upload_target_check check (
    (upload_kind = 'NEW_DOCUMENT' and folder_id is not null and document_id is null)
    or (upload_kind = 'NEW_VERSION' and document_id is not null)
  ),
  constraint drive_core_upload_name_check check (
    length(btrim(document_name)) between 1 and 240
    and length(btrim(original_name)) between 1 and 240
    and document_name !~ '[\\/]'
    and original_name !~ '[\\/]'
  ),
  constraint drive_core_upload_size_check check (size_bytes > 0),
  constraint drive_core_upload_sha_check check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  constraint drive_core_upload_expected_version_check check (expected_current_version >= 0),
  constraint drive_core_upload_source_check check (source in ('WEB','DESKTOP')),
  constraint drive_core_upload_provider_check check (storage_provider = 'S3'),
  constraint drive_core_upload_final_status_check check (final_version_status in ('AVAILABLE','QUARANTINED')),
  constraint drive_core_upload_status_check check (status in ('INITIATED','FINALIZED','ABORTED','EXPIRED','FAILED'))
);

create unique index if not exists drive_core_upload_storage_key_unique
  on public.drive_core_upload_sessions (storage_provider, storage_bucket, storage_key);
create unique index if not exists drive_core_upload_active_new_document_unique
  on public.drive_core_upload_sessions (project_id, folder_id, lower(document_name))
  where status = 'INITIATED' and upload_kind = 'NEW_DOCUMENT';
create unique index if not exists drive_core_upload_active_new_version_unique
  on public.drive_core_upload_sessions (project_id, document_id)
  where status = 'INITIATED' and upload_kind = 'NEW_VERSION';
create index if not exists drive_core_upload_project_status_idx
  on public.drive_core_upload_sessions (project_id, status, created_at desc);
create index if not exists drive_core_upload_expiry_idx
  on public.drive_core_upload_sessions (status, expires_at)
  where status = 'INITIATED';

alter table public.drive_storage_schema_meta enable row level security;
alter table public.drive_core_upload_sessions enable row level security;

revoke all on table public.drive_storage_schema_meta from public, anon, authenticated;
revoke all on table public.drive_core_upload_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.drive_storage_schema_meta to service_role;
grant select, insert, update, delete on table public.drive_core_upload_sessions to service_role;

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
begin
  if not exists (
    select 1 from public.project_core_projects
    where id = p_project_id and status <> 'DELETED'
  ) then
    raise exception 'DRIVE_CORE_PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.drive_core_upload_sessions set
    status = 'EXPIRED',
    completed_at = coalesce(completed_at,now()),
    updated_at = now(),
    metadata = metadata || jsonb_build_object('expiredAt',now())
  where project_id = p_project_id and status = 'INITIATED' and expires_at <= now();

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
    coalesce(p_session->>'mime_type','application/octet-stream'), (p_session->>'size_bytes')::bigint,
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

create or replace function public.drive_core_finalize_upload_atomic(
  p_project_id text,
  p_upload_id text,
  p_received_size_bytes bigint,
  p_storage_etag text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.drive_core_upload_sessions;
  v_document public.drive_core_documents;
  v_version public.drive_core_document_versions;
  v_next integer;
  v_extension text;
  v_event_type text;
  v_entity_type text;
  v_summary text;
begin
  select * into v_session from public.drive_core_upload_sessions
    where id = p_upload_id and project_id = p_project_id for update;
  if v_session.id is null then
    raise exception 'DRIVE_UPLOAD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_session.status = 'FINALIZED' then
    select * into v_document from public.drive_core_documents where id = v_session.finalized_document_id;
    select * into v_version from public.drive_core_document_versions where id = v_session.finalized_version_id;
    return jsonb_build_object('session',to_jsonb(v_session),'document',to_jsonb(v_document),'version',to_jsonb(v_version));
  end if;
  if v_session.status <> 'INITIATED' then
    raise exception 'DRIVE_UPLOAD_INVALID_STATE' using errcode = 'P0001';
  end if;
  if v_session.expires_at <= now() then
    raise exception 'DRIVE_UPLOAD_EXPIRED' using errcode = 'P0001';
  end if;
  if p_received_size_bytes <> v_session.size_bytes then
    raise exception 'DRIVE_UPLOAD_SIZE_MISMATCH' using errcode = 'P0001';
  end if;

  if v_session.upload_kind = 'NEW_DOCUMENT' then
    v_extension := coalesce(lower(substring(v_session.document_name from '[.]([^.]+)$')),'');
    insert into public.drive_core_documents (
      id, project_id, folder_id, name, extension, mime_type, description, status, source,
      current_version_number, created_by, created_at, updated_at
    ) values (
      'drive-document-' || substr(replace(gen_random_uuid()::text,'-',''),1,12), p_project_id,
      v_session.folder_id, v_session.document_name, left(v_extension,24), v_session.mime_type,
      coalesce(v_session.metadata->>'description',''), 'ACTIVE', v_session.source, 1,
      p_actor_user_id, now(), now()
    ) returning * into v_document;

    insert into public.drive_core_document_versions (
      id, project_id, document_id, version_number, revision_code, original_name, mime_type, size_bytes,
      sha256, storage_provider, storage_bucket, storage_key, status, change_note, created_by, created_at
    ) values (
      'drive-version-' || substr(replace(gen_random_uuid()::text,'-',''),1,12), p_project_id, v_document.id, 1,
      coalesce(nullif(v_session.metadata->>'revisionCode',''),'V1'), v_session.original_name,
      v_session.mime_type, v_session.size_bytes, v_session.sha256, 'S3', v_session.storage_bucket,
      v_session.storage_key, v_session.final_version_status,
      coalesce(nullif(v_session.metadata->>'changeNote',''),'Első fájlverzió feltöltve.'),
      p_actor_user_id, now()
    ) returning * into v_version;

    v_event_type := 'DOCUMENT_UPLOADED';
    v_entity_type := 'document';
    v_summary := 'DRIVE dokumentum feltöltve: ' || v_document.name;
  else
    select * into v_document from public.drive_core_documents
      where id = v_session.document_id and project_id = p_project_id and status = 'ACTIVE' for update;
    if v_document.id is null then
      raise exception 'DRIVE_CORE_DOCUMENT_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_session.expected_current_version > 0
      and v_session.expected_current_version <> v_document.current_version_number then
      raise exception 'DRIVE_CORE_VERSION_CONFLICT' using errcode = 'P0001';
    end if;
    v_next := v_document.current_version_number + 1;

    insert into public.drive_core_document_versions (
      id, project_id, document_id, version_number, revision_code, original_name, mime_type, size_bytes,
      sha256, storage_provider, storage_bucket, storage_key, status, change_note, created_by, created_at
    ) values (
      'drive-version-' || substr(replace(gen_random_uuid()::text,'-',''),1,12), p_project_id, v_document.id, v_next,
      coalesce(nullif(v_session.metadata->>'revisionCode',''),'V' || v_next::text), v_session.original_name,
      v_session.mime_type, v_session.size_bytes, v_session.sha256, 'S3', v_session.storage_bucket,
      v_session.storage_key, v_session.final_version_status,
      coalesce(nullif(v_session.metadata->>'changeNote',''),'Új fájlverzió feltöltve.'),
      p_actor_user_id, now()
    ) returning * into v_version;

    update public.drive_core_documents set
      current_version_number = v_next,
      mime_type = v_session.mime_type,
      updated_at = now()
    where id = v_document.id
    returning * into v_document;

    v_event_type := 'DOCUMENT_VERSION_UPLOADED';
    v_entity_type := 'document_version';
    v_summary := 'Új DRIVE fájlverzió feltöltve: ' || v_document.name || ' · V' || v_next::text;
  end if;

  update public.drive_core_upload_sessions set
    status = 'FINALIZED',
    finalized_document_id = v_document.id,
    finalized_version_id = v_version.id,
    completed_at = now(),
    updated_at = now(),
    metadata = metadata || jsonb_build_object(
      'storageEtag',nullif(p_storage_etag,''),
      'receivedSizeBytes',p_received_size_bytes,
      'checksumVerified',false
    )
  where id = v_session.id
  returning * into v_session;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12), p_project_id, p_actor_user_id,
    'DRIVE_' || v_event_type, v_entity_type,
    case when v_entity_type = 'document' then v_document.id else v_version.id end,
    v_summary,
    jsonb_build_object(
      'documentId',v_document.id,
      'versionId',v_version.id,
      'version',v_version.version_number,
      'storageProvider','S3',
      'versionStatus',v_version.status,
      'uploadId',v_session.id,
      'checksumVerified',false
    )
  );

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16), p_project_id,
    v_event_type, v_entity_type,
    case when v_entity_type = 'document' then v_document.id else v_version.id end,
    jsonb_build_object('document',to_jsonb(v_document),'version',to_jsonb(v_version),'uploadId',v_session.id),
    p_actor_user_id
  );

  return jsonb_build_object('session',to_jsonb(v_session),'document',to_jsonb(v_document),'version',to_jsonb(v_version));
end;
$$;

create or replace function public.drive_core_abort_upload_session(
  p_project_id text,
  p_upload_id text,
  p_actor_user_id text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.drive_core_upload_sessions;
begin
  select * into v_session from public.drive_core_upload_sessions
    where id = p_upload_id and project_id = p_project_id for update;
  if v_session.id is null then
    raise exception 'DRIVE_UPLOAD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_session.status = 'FINALIZED' then
    raise exception 'DRIVE_UPLOAD_ALREADY_FINALIZED' using errcode = 'P0001';
  end if;
  update public.drive_core_upload_sessions set
    status = 'ABORTED',
    completed_at = coalesce(completed_at,now()),
    updated_at = now(),
    metadata = metadata || jsonb_build_object(
      'abortReason',coalesce(nullif(p_reason,''),'Feltöltés megszakítva.'),
      'abortedBy',p_actor_user_id,
      'abortedAt',now()
    )
  where id = v_session.id
  returning * into v_session;
  return to_jsonb(v_session);
end;
$$;

create or replace function public.drive_core_log_download(
  p_project_id text,
  p_document_id text,
  p_version_id text,
  p_actor_user_id text,
  p_client_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.drive_core_documents;
  v_version public.drive_core_document_versions;
  v_audit public.project_core_audit_events;
begin
  select * into v_document from public.drive_core_documents
    where id = p_document_id and project_id = p_project_id and status = 'ACTIVE';
  select * into v_version from public.drive_core_document_versions
    where id = p_version_id and document_id = p_document_id and project_id = p_project_id;
  if v_document.id is null or v_version.id is null then
    raise exception 'DRIVE_DOWNLOAD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_version.status <> 'AVAILABLE' or v_version.storage_provider <> 'S3' or v_version.storage_key is null then
    raise exception 'DRIVE_DOWNLOAD_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12), p_project_id, p_actor_user_id,
    'DRIVE_DOCUMENT_DOWNLOADED','document_version',v_version.id,
    'DRIVE dokumentum letöltési link kiadva: ' || v_document.name || ' · V' || v_version.version_number::text,
    jsonb_build_object(
      'documentId',v_document.id,
      'versionId',v_version.id,
      'version',v_version.version_number,
      'clientId',nullif(p_client_id,''),
      'signedUrlIssued',true
    )
  ) returning * into v_audit;

  return to_jsonb(v_audit);
end;
$$;

revoke all on function public.drive_core_create_upload_session_atomic(text,jsonb,text) from public, anon, authenticated;
revoke all on function public.drive_core_finalize_upload_atomic(text,text,bigint,text,text) from public, anon, authenticated;
revoke all on function public.drive_core_abort_upload_session(text,text,text,text) from public, anon, authenticated;
revoke all on function public.drive_core_log_download(text,text,text,text,text) from public, anon, authenticated;

grant execute on function public.drive_core_create_upload_session_atomic(text,jsonb,text) to service_role;
grant execute on function public.drive_core_finalize_upload_atomic(text,text,bigint,text,text) to service_role;
grant execute on function public.drive_core_abort_upload_session(text,text,text,text) to service_role;
grant execute on function public.drive_core_log_download(text,text,text,text,text) to service_role;

insert into public.drive_storage_schema_meta (
  component, schema_version, migration_count, bootstrap_id, applied_at, updated_at
) values (
  'drive-object-storage','0.4.0',1,'drive-object-storage-v040-20260802',now(),now()
)
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = excluded.migration_count,
  bootstrap_id = excluded.bootstrap_id,
  applied_at = excluded.applied_at,
  updated_at = now();

commit;
