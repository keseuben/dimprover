-- DIMPRO Drive Core 0.8.0
-- Stable document identity + separate technical version / official revision model.
-- DEV migration source only. Apply only through the guarded migration gate.

begin;

do $$
declare
  v_schema_version text;
  v_migration_count integer;
  v_bootstrap_id text;
begin
  select schema_version, migration_count, bootstrap_id
    into v_schema_version, v_migration_count, v_bootstrap_id
  from public.drive_core_schema_meta
  where component = 'drive-core';

  if not (
    (v_schema_version = '0.7.0' and v_migration_count = 4 and v_bootstrap_id = 'drive-core-v070-folder-acl-20261001')
    or
    (v_schema_version = '0.8.0' and v_migration_count = 5 and v_bootstrap_id = 'drive-core-v080-revision-model-20261002')
  ) then
    raise exception 'DRIVE_CORE_V080_UNEXPECTED_SCHEMA_MARKER';
  end if;
end;
$$;

alter table public.drive_core_documents
  add column if not exists export_alias text not null default '';

alter table public.drive_core_document_versions
  add column if not exists revision_number integer not null default 0,
  add column if not exists version_kind text not null default 'VERSION',
  add column if not exists revision_reason text not null default '',
  add column if not exists revision_date date null;

-- Preserve historical revision_code text. Derive numeric revision only from R<number>.
update public.drive_core_document_versions
set revision_number = case
  when revision_code ~ '^R[0-9]+$' then substring(revision_code from 2)::integer
  else 0
end
where revision_number = 0;

update public.drive_core_document_versions
set version_kind = case when version_number = 1 then 'INITIAL' else 'VERSION' end
where version_kind not in ('INITIAL','VERSION','REVISION')
   or (version_number = 1 and version_kind = 'VERSION');

with revision_dates as (
  select id, min(created_at::date) over (
    partition by document_id, revision_number
  ) as first_revision_date
  from public.drive_core_document_versions
)
update public.drive_core_document_versions v
set revision_date = d.first_revision_date
from revision_dates d
where d.id = v.id and v.revision_date is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drive_core_documents_export_alias_check') then
    alter table public.drive_core_documents
      add constraint drive_core_documents_export_alias_check check (
        export_alias = '' or (
          length(export_alias) between 1 and 40
          and export_alias ~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'
        )
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'drive_core_versions_revision_number_check') then
    alter table public.drive_core_document_versions
      add constraint drive_core_versions_revision_number_check check (revision_number >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'drive_core_versions_kind_check') then
    alter table public.drive_core_document_versions
      add constraint drive_core_versions_kind_check check (version_kind in ('INITIAL','VERSION','REVISION'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'drive_core_versions_revision_reason_check') then
    alter table public.drive_core_document_versions
      add constraint drive_core_versions_revision_reason_check check (length(revision_reason) <= 1000);
  end if;
end;
$$;

create index if not exists drive_core_versions_revision_idx
  on public.drive_core_document_versions (document_id, revision_number, version_number desc);

comment on column public.drive_core_documents.export_alias is
  'Stable user-editable ASCII-safe export alias. Empty means not generated yet.';
comment on column public.drive_core_document_versions.revision_number is
  'Official revision counter independent from technical version_number.';
comment on column public.drive_core_document_versions.version_kind is
  'INITIAL=first file; VERSION=new file in same revision; REVISION=official revision increment.';
comment on column public.drive_core_document_versions.revision_reason is
  'Reason of official revision. VERSION rows inherit current revision reason.';
comment on column public.drive_core_document_versions.revision_date is
  'Official revision date. VERSION rows inherit current revision date.';

create or replace function public.drive_core_create_document_atomic(
  p_project_id text,
  p_document jsonb,
  p_version jsonb,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.drive_core_documents;
  v_version public.drive_core_document_versions;
begin
  if not exists (
    select 1 from public.drive_core_folders
    where id = p_document->>'folder_id'
      and project_id = p_project_id
      and status = 'ACTIVE'
  ) then
    raise exception 'DRIVE_CORE_FOLDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.drive_core_documents (
    id, project_id, folder_id, name, extension, mime_type, description, status, source,
    current_version_number, export_alias, created_by, created_at, updated_at
  ) values (
    p_document->>'id', p_project_id, p_document->>'folder_id', p_document->>'name',
    coalesce(p_document->>'extension',''),
    coalesce(p_document->>'mime_type','application/octet-stream'),
    coalesce(p_document->>'description',''), 'ACTIVE',
    coalesce(p_document->>'source','WEB'), 1,
    coalesce(p_document->>'export_alias',''), p_actor_user_id,
    coalesce(nullif(p_document->>'created_at','')::timestamptz,now()),
    coalesce(nullif(p_document->>'updated_at','')::timestamptz,now())
  ) returning * into v_document;

  insert into public.drive_core_document_versions (
    id, project_id, document_id, version_number,
    revision_number, revision_code, version_kind, revision_reason, revision_date,
    original_name, mime_type, size_bytes, sha256,
    storage_provider, storage_bucket, storage_key, status, change_note,
    created_by, created_at
  ) values (
    p_version->>'id', p_project_id, v_document.id, 1,
    0, 'R00', 'INITIAL',
    coalesce(p_version->>'revision_reason',''),
    coalesce(nullif(p_version->>'revision_date','')::date,current_date),
    p_version->>'original_name',
    coalesce(p_version->>'mime_type',v_document.mime_type),
    coalesce((p_version->>'size_bytes')::bigint,0),
    nullif(p_version->>'sha256',''),
    'METADATA_ONLY', null, null, 'METADATA_ONLY',
    coalesce(p_version->>'change_note',''),
    p_actor_user_id,
    coalesce(nullif(p_version->>'created_at','')::timestamptz,now())
  ) returning * into v_version;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id, p_actor_user_id,
    'DRIVE_DOCUMENT_CREATED','document',v_document.id,
    'DRIVE dokumentum létrehozva: ' || v_document.name,
    jsonb_build_object(
      'folderId',v_document.folder_id,
      'version',1,
      'revisionNumber',0,
      'revisionCode','R00',
      'versionKind','INITIAL',
      'storageMode','METADATA_ONLY'
    )
  );

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,'DOCUMENT_CREATED','document',v_document.id,
    jsonb_build_object('document',to_jsonb(v_document),'version',to_jsonb(v_version)),
    p_actor_user_id
  );

  return jsonb_build_object('document',to_jsonb(v_document),'version',to_jsonb(v_version));
end;
$$;

create or replace function public.drive_core_add_version_atomic(
  p_project_id text,
  p_document_id text,
  p_version jsonb,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.drive_core_documents;
  v_current_version public.drive_core_document_versions;
  v_version public.drive_core_document_versions;
  v_expected integer;
  v_next integer;
  v_kind text;
  v_revision_number integer;
  v_revision_code text;
  v_revision_reason text;
  v_revision_date date;
begin
  select * into v_document
  from public.drive_core_documents
  where id = p_document_id and project_id = p_project_id and status = 'ACTIVE'
  for update;
  if v_document.id is null then
    raise exception 'DRIVE_CORE_DOCUMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_current_version
  from public.drive_core_document_versions
  where document_id = p_document_id
    and project_id = p_project_id
    and version_number = v_document.current_version_number;
  if v_current_version.id is null then
    raise exception 'DRIVE_CORE_CURRENT_VERSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_expected := coalesce((p_version->>'expected_current_version')::integer,0);
  if v_expected > 0 and v_expected <> v_document.current_version_number then
    raise exception 'DRIVE_CORE_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  v_next := v_document.current_version_number + 1;
  v_kind := case upper(coalesce(nullif(p_version->>'version_kind',''),'VERSION'))
    when 'REVISION' then 'REVISION'
    else 'VERSION'
  end;

  if v_kind = 'REVISION' then
    v_revision_number := coalesce(v_current_version.revision_number,0) + 1;
    v_revision_code := 'R' || lpad(v_revision_number::text,2,'0');
    v_revision_reason := btrim(coalesce(p_version->>'revision_reason',''));
    if v_revision_reason = '' then
      raise exception 'DRIVE_REVISION_REASON_REQUIRED' using errcode = 'P0001';
    end if;
    v_revision_date := coalesce(nullif(p_version->>'revision_date','')::date,current_date);
  else
    v_revision_number := coalesce(v_current_version.revision_number,0);
    v_revision_code := 'R' || lpad(v_revision_number::text,2,'0');
    v_revision_reason := coalesce(v_current_version.revision_reason,'');
    v_revision_date := coalesce(v_current_version.revision_date,current_date);
  end if;

  insert into public.drive_core_document_versions (
    id, project_id, document_id, version_number,
    revision_number, revision_code, version_kind, revision_reason, revision_date,
    original_name, mime_type, size_bytes, sha256,
    storage_provider, storage_bucket, storage_key, status, change_note,
    created_by, created_at
  ) values (
    p_version->>'id', p_project_id, p_document_id, v_next,
    v_revision_number, v_revision_code, v_kind,
    v_revision_reason, v_revision_date,
    p_version->>'original_name',
    coalesce(p_version->>'mime_type',v_document.mime_type),
    coalesce((p_version->>'size_bytes')::bigint,0),
    nullif(p_version->>'sha256',''),
    'METADATA_ONLY', null, null, 'METADATA_ONLY',
    coalesce(p_version->>'change_note',''),
    p_actor_user_id,
    coalesce(nullif(p_version->>'created_at','')::timestamptz,now())
  ) returning * into v_version;

  update public.drive_core_documents
  set current_version_number = v_next,
      mime_type = v_version.mime_type,
      updated_at = now()
  where id = p_document_id
  returning * into v_document;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,
    case when v_kind = 'REVISION'
      then 'DRIVE_DOCUMENT_REVISION_CREATED'
      else 'DRIVE_DOCUMENT_VERSION_CREATED'
    end,
    'document_version',v_version.id,
    case when v_kind = 'REVISION'
      then 'Új DRIVE dokumentumrevízió: ' || v_document.name || ' · ' || v_revision_code || ' · V' || v_next::text
      else 'Új DRIVE dokumentumverzió: ' || v_document.name || ' · ' || v_revision_code || ' · V' || v_next::text
    end,
    jsonb_build_object(
      'documentId',v_document.id,
      'version',v_next,
      'revisionNumber',v_revision_number,
      'revisionCode',v_revision_code,
      'versionKind',v_kind,
      'storageMode','METADATA_ONLY'
    )
  );

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,
    case when v_kind = 'REVISION'
      then 'DOCUMENT_REVISION_CREATED'
      else 'DOCUMENT_VERSION_CREATED'
    end,
    'document_version',v_version.id,
    jsonb_build_object('document',to_jsonb(v_document),'version',to_jsonb(v_version)),
    p_actor_user_id
  );

  return jsonb_build_object('document',to_jsonb(v_document),'version',to_jsonb(v_version));
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
  v_current_version public.drive_core_document_versions;
  v_version public.drive_core_document_versions;
  v_next integer;
  v_extension text;
  v_event_type text;
  v_entity_type text;
  v_summary text;
  v_kind text;
  v_revision_number integer;
  v_revision_code text;
  v_revision_reason text;
  v_revision_date date;
begin
  select * into v_session
  from public.drive_core_upload_sessions
  where id = p_upload_id and project_id = p_project_id
  for update;

  if v_session.id is null then
    raise exception 'DRIVE_UPLOAD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_session.status = 'FINALIZED' then
    select * into v_document from public.drive_core_documents
      where id = v_session.finalized_document_id;
    select * into v_version from public.drive_core_document_versions
      where id = v_session.finalized_version_id;
    return jsonb_build_object(
      'session',to_jsonb(v_session),
      'document',to_jsonb(v_document),
      'version',to_jsonb(v_version)
    );
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
      current_version_number, export_alias, created_by, created_at, updated_at
    ) values (
      'drive-document-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
      p_project_id,v_session.folder_id,v_session.document_name,left(v_extension,24),
      v_session.mime_type,coalesce(v_session.metadata->>'description',''),
      'ACTIVE',v_session.source,1,
      coalesce(v_session.metadata->>'exportAlias',''),
      p_actor_user_id,now(),now()
    ) returning * into v_document;

    insert into public.drive_core_document_versions (
      id, project_id, document_id, version_number,
      revision_number, revision_code, version_kind, revision_reason, revision_date,
      original_name, mime_type, size_bytes, sha256,
      storage_provider, storage_bucket, storage_key, status, change_note,
      created_by, created_at
    ) values (
      'drive-version-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
      p_project_id,v_document.id,1,
      0,'R00','INITIAL',
      coalesce(v_session.metadata->>'revisionReason',''),current_date,
      v_session.original_name,v_session.mime_type,v_session.size_bytes,v_session.sha256,
      'S3',v_session.storage_bucket,v_session.storage_key,v_session.final_version_status,
      coalesce(nullif(v_session.metadata->>'changeNote',''),'Első fájlverzió feltöltve.'),
      p_actor_user_id,now()
    ) returning * into v_version;

    v_event_type := 'DOCUMENT_UPLOADED';
    v_entity_type := 'document';
    v_summary := 'DRIVE dokumentum feltöltve: ' || v_document.name || ' · R00 · V1';
  else
    select * into v_document
    from public.drive_core_documents
    where id = v_session.document_id
      and project_id = p_project_id
      and status = 'ACTIVE'
    for update;
    if v_document.id is null then
      raise exception 'DRIVE_CORE_DOCUMENT_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_session.expected_current_version > 0
      and v_session.expected_current_version <> v_document.current_version_number then
      raise exception 'DRIVE_CORE_VERSION_CONFLICT' using errcode = 'P0001';
    end if;

    select * into v_current_version
    from public.drive_core_document_versions
    where project_id = p_project_id
      and document_id = v_document.id
      and version_number = v_document.current_version_number;
    if v_current_version.id is null then
      raise exception 'DRIVE_CORE_CURRENT_VERSION_NOT_FOUND' using errcode = 'P0002';
    end if;

    v_next := v_document.current_version_number + 1;
    v_kind := case upper(coalesce(nullif(v_session.metadata->>'versionKind',''),'VERSION'))
      when 'REVISION' then 'REVISION'
      else 'VERSION'
    end;

    if v_kind = 'REVISION' then
      v_revision_number := coalesce(v_current_version.revision_number,0) + 1;
      v_revision_code := 'R' || lpad(v_revision_number::text,2,'0');
      v_revision_reason := btrim(coalesce(v_session.metadata->>'revisionReason',''));
      if v_revision_reason = '' then
        raise exception 'DRIVE_REVISION_REASON_REQUIRED' using errcode = 'P0001';
      end if;
      v_revision_date := coalesce(
        nullif(v_session.metadata->>'revisionDate','')::date,
        current_date
      );
    else
      v_revision_number := coalesce(v_current_version.revision_number,0);
      v_revision_code := 'R' || lpad(v_revision_number::text,2,'0');
      v_revision_reason := coalesce(v_current_version.revision_reason,'');
      v_revision_date := coalesce(v_current_version.revision_date,current_date);
    end if;

    insert into public.drive_core_document_versions (
      id, project_id, document_id, version_number,
      revision_number, revision_code, version_kind, revision_reason, revision_date,
      original_name, mime_type, size_bytes, sha256,
      storage_provider, storage_bucket, storage_key, status, change_note,
      created_by, created_at
    ) values (
      'drive-version-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
      p_project_id,v_document.id,v_next,
      v_revision_number,v_revision_code,v_kind,v_revision_reason,v_revision_date,
      v_session.original_name,v_session.mime_type,v_session.size_bytes,v_session.sha256,
      'S3',v_session.storage_bucket,v_session.storage_key,v_session.final_version_status,
      coalesce(nullif(v_session.metadata->>'changeNote',''),'Új fájlverzió feltöltve.'),
      p_actor_user_id,now()
    ) returning * into v_version;

    update public.drive_core_documents
    set current_version_number = v_next,
        mime_type = v_session.mime_type,
        updated_at = now()
    where id = v_document.id
    returning * into v_document;

    v_event_type := case when v_kind = 'REVISION'
      then 'DOCUMENT_REVISION_UPLOADED'
      else 'DOCUMENT_VERSION_UPLOADED'
    end;
    v_entity_type := 'document_version';
    v_summary := case when v_kind = 'REVISION'
      then 'Új DRIVE revízió feltöltve: ' || v_document.name || ' · ' || v_revision_code || ' · V' || v_next::text
      else 'Új DRIVE fájlverzió feltöltve: ' || v_document.name || ' · ' || v_revision_code || ' · V' || v_next::text
    end;
  end if;

  update public.drive_core_upload_sessions
  set status = 'FINALIZED',
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
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,
    'DRIVE_' || v_event_type,
    v_entity_type,
    case when v_entity_type = 'document' then v_document.id else v_version.id end,
    v_summary,
    jsonb_build_object(
      'documentId',v_document.id,
      'versionId',v_version.id,
      'version',v_version.version_number,
      'revisionNumber',v_version.revision_number,
      'revisionCode',v_version.revision_code,
      'versionKind',v_version.version_kind,
      'storageProvider','S3',
      'versionStatus',v_version.status,
      'uploadId',v_session.id,
      'checksumVerified',false
    )
  );

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,v_event_type,v_entity_type,
    case when v_entity_type = 'document' then v_document.id else v_version.id end,
    jsonb_build_object(
      'document',to_jsonb(v_document),
      'version',to_jsonb(v_version),
      'uploadId',v_session.id
    ),
    p_actor_user_id
  );

  return jsonb_build_object(
    'session',to_jsonb(v_session),
    'document',to_jsonb(v_document),
    'version',to_jsonb(v_version)
  );
end;
$$;

update public.drive_core_schema_meta
set schema_version = '0.8.0',
    migration_count = 5,
    bootstrap_id = 'drive-core-v080-revision-model-20261002',
    updated_at = now()
where component = 'drive-core'
  and schema_version = '0.7.0'
  and migration_count = 4
  and bootstrap_id = 'drive-core-v070-folder-acl-20261001';

commit;
