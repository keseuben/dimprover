-- DIMPRO Drive Core 0.8.4
-- Numbering origin/audited correction + project-level metadata option lists.
-- DEV migration source only. Apply only through guarded migration gate.

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
    (v_schema_version = '0.8.0' and v_migration_count = 5 and v_bootstrap_id = 'drive-core-v080-revision-model-20261002')
    or
    (v_schema_version = '0.8.4' and v_migration_count = 6 and v_bootstrap_id = 'drive-core-v084-metadata-controls-20261002')
  ) then
    raise exception 'DRIVE_CORE_V084_UNEXPECTED_SCHEMA_MARKER';
  end if;
end;
$$;

alter table public.drive_core_document_versions
  add column if not exists numbering_origin text not null default 'SYSTEM',
  add column if not exists numbering_correction_reason text not null default '',
  add column if not exists numbering_corrected_by text null,
  add column if not exists numbering_corrected_at timestamptz null;

update public.drive_core_document_versions
set numbering_origin = 'SYSTEM'
where numbering_origin not in ('SYSTEM','IMPORTED','CORRECTED');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drive_core_versions_numbering_origin_check') then
    alter table public.drive_core_document_versions
      add constraint drive_core_versions_numbering_origin_check
      check (numbering_origin in ('SYSTEM','IMPORTED','CORRECTED'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'drive_core_versions_numbering_reason_check') then
    alter table public.drive_core_document_versions
      add constraint drive_core_versions_numbering_reason_check
      check (length(numbering_correction_reason) <= 1000);
  end if;
end;
$$;

create table if not exists public.drive_core_project_settings (
  project_id text primary key references public.project_core_projects(id) on delete cascade,
  metadata_options jsonb not null default '{}'::jsonb,
  updated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drive_core_project_settings_metadata_options_object_check
    check (jsonb_typeof(metadata_options) = 'object'),
  constraint drive_core_project_settings_metadata_options_size_check
    check (octet_length(metadata_options::text) <= 30000)
);

alter table public.drive_core_project_settings enable row level security;

create or replace function public.drive_core_update_version_numbering_atomic(
  p_project_id text,
  p_document_id text,
  p_version_id text,
  p_mode text,
  p_version_number integer,
  p_revision_number integer,
  p_reason text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.drive_core_documents;
  v_version public.drive_core_document_versions;
  v_previous_version integer;
  v_previous_revision integer;
  v_mode text := upper(btrim(coalesce(p_mode,'')));
  v_reason text := left(btrim(coalesce(p_reason,'')),1000);
  v_version_count integer;
  v_issued boolean := false;
begin
  if v_mode not in ('IMPORT','CORRECT') then
    raise exception 'DRIVE_NUMBERING_MODE_INVALID' using errcode = 'P0001';
  end if;
  if p_version_number is null or p_version_number < 1 or p_version_number > 9999 then
    raise exception 'DRIVE_VERSION_NUMBER_INVALID' using errcode = 'P0001';
  end if;
  if p_revision_number is null or p_revision_number < 0 or p_revision_number > 9999 then
    raise exception 'DRIVE_REVISION_NUMBER_INVALID' using errcode = 'P0001';
  end if;
  if v_mode = 'CORRECT' and v_reason = '' then
    raise exception 'DRIVE_NUMBERING_CORRECTION_REASON_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_document
  from public.drive_core_documents
  where id = p_document_id and project_id = p_project_id and status = 'ACTIVE'
  for update;
  if v_document.id is null then
    raise exception 'DRIVE_CORE_DOCUMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_version
  from public.drive_core_document_versions
  where id = p_version_id and document_id = p_document_id and project_id = p_project_id
  for update;
  if v_version.id is null then
    raise exception 'DRIVE_CORE_VERSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_version.version_number <> v_document.current_version_number then
    raise exception 'DRIVE_NUMBERING_CURRENT_VERSION_REQUIRED' using errcode = 'P0001';
  end if;

  if to_regclass('public.drive_core_document_version_governance') is not null then
    execute 'select exists(select 1 from public.drive_core_document_version_governance where project_id=$1 and document_id=$2 and version_id=$3 and issue_status=''ISSUED'')'
      into v_issued using p_project_id,p_document_id,p_version_id;
    if v_issued then
      raise exception 'DRIVE_NUMBERING_ISSUED_VERSION_LOCKED' using errcode = 'P0001';
    end if;
  end if;

  if exists (
    select 1 from public.drive_core_upload_sessions
    where project_id = p_project_id and document_id = p_document_id
      and status = 'INITIATED' and expires_at > now()
  ) then
    raise exception 'DRIVE_NUMBERING_ACTIVE_UPLOAD_CONFLICT' using errcode = 'P0001';
  end if;

  if v_mode = 'IMPORT' then
    select count(*) into v_version_count
    from public.drive_core_document_versions
    where project_id = p_project_id and document_id = p_document_id;
    if v_version_count <> 1 or v_version.version_kind <> 'INITIAL' then
      raise exception 'DRIVE_NUMBERING_IMPORT_INITIAL_ONLY' using errcode = 'P0001';
    end if;
  end if;

  if exists (
    select 1 from public.drive_core_document_versions
    where document_id = p_document_id and version_number = p_version_number and id <> p_version_id
  ) then
    raise exception 'DRIVE_NUMBERING_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  v_previous_version := v_version.version_number;
  v_previous_revision := coalesce(v_version.revision_number,0);

  update public.drive_core_document_versions
  set version_number = p_version_number,
      revision_number = p_revision_number,
      revision_code = 'R' || lpad(p_revision_number::text,2,'0'),
      numbering_origin = case when v_mode = 'IMPORT' then 'IMPORTED' else 'CORRECTED' end,
      numbering_correction_reason = v_reason,
      numbering_corrected_by = p_actor_user_id,
      numbering_corrected_at = now()
  where id = p_version_id
  returning * into v_version;

  update public.drive_core_documents
  set current_version_number = p_version_number, updated_at = now()
  where id = p_document_id
  returning * into v_document;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,
    case when v_mode = 'IMPORT' then 'DRIVE_DOCUMENT_NUMBERING_IMPORTED' else 'DRIVE_DOCUMENT_NUMBERING_CORRECTED' end,
    'document_version',p_version_id,
    case when v_mode = 'IMPORT'
      then 'Hozott dokumentum számozása rögzítve: ' || v_document.name
      else 'DRIVE számozás korrigálva: ' || v_document.name
    end,
    jsonb_build_object(
      'documentId',p_document_id,'versionId',p_version_id,'mode',v_mode,
      'numberingOrigin',v_version.numbering_origin,
      'previousVersionNumber',v_previous_version,'previousRevisionNumber',v_previous_revision,
      'versionNumber',p_version_number,'revisionNumber',p_revision_number,
      'revisionCode',v_version.revision_code,'reason',v_reason
    )
  );

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,
    case when v_mode = 'IMPORT' then 'DOCUMENT_NUMBERING_IMPORTED' else 'DOCUMENT_NUMBERING_CORRECTED' end,
    'document_version',p_version_id,
    jsonb_build_object(
      'document',to_jsonb(v_document),'version',to_jsonb(v_version),
      'previousVersionNumber',v_previous_version,'previousRevisionNumber',v_previous_revision
    ),
    p_actor_user_id
  );

  return jsonb_build_object('document',to_jsonb(v_document),'version',to_jsonb(v_version));
end;
$$;

create or replace function public.drive_core_upsert_project_settings_atomic(
  p_project_id text,
  p_metadata_options jsonb,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_options jsonb := coalesce(p_metadata_options,'{}'::jsonb);
  v_settings public.drive_core_project_settings;
begin
  if not exists (select 1 from public.project_core_projects where id=p_project_id and status <> 'DELETED') then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if jsonb_typeof(v_options) <> 'object' or octet_length(v_options::text) > 30000 then
    raise exception 'DRIVE_PROJECT_SETTINGS_INVALID' using errcode = 'P0001';
  end if;

  insert into public.drive_core_project_settings (
    project_id,metadata_options,updated_by,created_at,updated_at
  ) values (
    p_project_id,v_options,p_actor_user_id,now(),now()
  )
  on conflict (project_id) do update set
    metadata_options=excluded.metadata_options,updated_by=excluded.updated_by,updated_at=now()
  returning * into v_settings;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'DRIVE_PROJECT_METADATA_OPTIONS_UPDATED','metadata',p_project_id,
    'DRIVE metaadat-listák módosítva',
    jsonb_build_object('metadataOptions',v_settings.metadata_options)
  );

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,'PROJECT_METADATA_OPTIONS_UPDATED','metadata',p_project_id,
    jsonb_build_object('projectSettings',to_jsonb(v_settings)),p_actor_user_id
  );

  return to_jsonb(v_settings);
end;
$$;

update public.drive_core_schema_meta
set schema_version = '0.8.4',
    migration_count = 6,
    bootstrap_id = 'drive-core-v084-metadata-controls-20261002',
    updated_at = now()
where component = 'drive-core'
  and schema_version = '0.8.0'
  and migration_count = 5
  and bootstrap_id = 'drive-core-v080-revision-model-20261002';

commit;
