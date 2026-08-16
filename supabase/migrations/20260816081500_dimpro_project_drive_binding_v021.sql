-- DIMPRO Identity Core 0.2.1 - Project Core <-> Drive folder binding
-- DEV-first migration. Existing UUID values remain valid textual values.

begin;

do $$
begin
  if to_regclass('public.dimpro_project_drop_settings') is null then
    raise exception 'DIMPRO_IDENTITY_PROJECT_DROP_SETTINGS_REQUIRED';
  end if;
  if to_regclass('public.dimpro_identity_schema_meta') is null then
    raise exception 'DIMPRO_IDENTITY_SCHEMA_META_REQUIRED';
  end if;
end
$$;

alter table public.dimpro_project_drop_settings
  alter column drive_folder_id type text
  using drive_folder_id::text;

alter table public.dimpro_project_drop_settings
  drop constraint if exists dimpro_project_drop_settings_drive_folder_id_check;

alter table public.dimpro_project_drop_settings
  add constraint dimpro_project_drop_settings_drive_folder_id_check
  check (drive_folder_id is null or length(trim(drive_folder_id)) between 1 and 180);

comment on column public.dimpro_project_drop_settings.drive_folder_id is
  'DIMPRO Drive Core folder identifier. Text because canonical Drive Core IDs use drive-folder-...; historical UUID values remain compatible as text.';

create or replace function public.dimpro_bind_project_core_atomic(
  p_project_core_id text,
  p_project_core_code text,
  p_name text,
  p_description text,
  p_status text,
  p_organization_id uuid default null,
  p_created_by uuid default null,
  p_drive_folder_id text default null,
  p_incoming_folder_name text default 'Beérkező Drop'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
set row_security = off
as $$
declare
  v_core public.project_core_projects;
  v_identity public.dimpro_projects;
  v_by_legacy public.dimpro_projects;
  v_settings public.dimpro_project_drop_settings;
  v_status text := lower(trim(coalesce(p_status, 'draft')));
  v_drop_enabled boolean;
begin
  if v_status not in ('draft','active','closing','read_only','archived','deletion_scheduled','deleted') then
    raise exception 'DIMPRO_PROJECT_BIND_STATUS_INVALID' using errcode='22023';
  end if;
  if p_drive_folder_id is null or trim(p_drive_folder_id) = '' then
    raise exception 'DIMPRO_PROJECT_BIND_DRIVE_FOLDER_REQUIRED' using errcode='22023';
  end if;

  select * into v_core
  from public.project_core_projects
  where id=p_project_core_id
  for update;
  if v_core.id is null then
    raise exception 'DIMPRO_PROJECT_BIND_CORE_NOT_FOUND' using errcode='P0002';
  end if;

  if not exists (
    select 1
    from public.drive_core_folders f
    where f.id=trim(p_drive_folder_id)
      and f.project_id=p_project_core_id
      and f.parent_id is null
      and f.status='ACTIVE'
      and lower(trim(f.name))=lower(trim(coalesce(p_incoming_folder_name,'Beérkező Drop')))
  ) then
    raise exception 'DIMPRO_PROJECT_BIND_DRIVE_FOLDER_INVALID' using errcode='23503';
  end if;

  if v_core.dimpro_project_id is not null then
    select * into v_identity from public.dimpro_projects where id=v_core.dimpro_project_id;
  end if;
  select * into v_by_legacy from public.dimpro_projects where legacy_project_core_id=p_project_core_id;
  if v_identity.id is not null and v_by_legacy.id is not null and v_identity.id <> v_by_legacy.id then
    raise exception 'DIMPRO_PROJECT_BIND_CONFLICT' using errcode='23505';
  end if;
  if v_identity.id is null then
    v_identity := v_by_legacy;
  end if;

  v_drop_enabled := v_status='active';
  if v_identity.id is null then
    insert into public.dimpro_projects (
      public_project_code,name,short_name,description,organization_id,status,project_drop_enabled,
      created_by,legacy_project_core_id,legacy_project_code
    ) values (
      public.dimpro_generate_project_code(),trim(p_name),null,coalesce(p_description,''),p_organization_id,
      v_status,v_drop_enabled,p_created_by,p_project_core_id,nullif(trim(p_project_core_code),'')
    ) returning * into v_identity;
  else
    update public.dimpro_projects set
      name=trim(p_name),
      description=coalesce(p_description,''),
      organization_id=p_organization_id,
      status=v_status,
      project_drop_enabled=v_drop_enabled,
      created_by=coalesce(created_by,p_created_by),
      legacy_project_core_id=p_project_core_id,
      legacy_project_code=nullif(trim(p_project_core_code),''),
      updated_at=now()
    where id=v_identity.id
    returning * into v_identity;
  end if;

  update public.project_core_projects
  set dimpro_project_id=v_identity.id
  where id=p_project_core_id and dimpro_project_id is distinct from v_identity.id;

  insert into public.dimpro_project_drop_settings (
    project_id,enabled,drive_folder_id,incoming_folder_name,preserve_groups,require_virus_scan,notify_project_admins
  ) values (
    v_identity.id,v_drop_enabled,trim(p_drive_folder_id),trim(coalesce(p_incoming_folder_name,'Beérkező Drop')),true,true,true
  )
  on conflict (project_id) do update set
    enabled=excluded.enabled,
    drive_folder_id=excluded.drive_folder_id,
    incoming_folder_name=excluded.incoming_folder_name,
    preserve_groups=excluded.preserve_groups,
    require_virus_scan=excluded.require_virus_scan,
    notify_project_admins=excluded.notify_project_admins,
    updated_at=now()
  returning * into v_settings;

  return jsonb_build_object(
    'ok',true,
    'project',jsonb_build_object(
      'id',v_identity.id,
      'publicCode',v_identity.public_project_code,
      'name',v_identity.name,
      'status',v_identity.status,
      'projectDropEnabled',v_identity.project_drop_enabled,
      'legacyProjectCoreId',v_identity.legacy_project_core_id
    ),
    'destination',jsonb_build_object(
      'driveFolderId',v_settings.drive_folder_id,
      'incomingFolderName',v_settings.incoming_folder_name,
      'enabled',v_settings.enabled,
      'preserveGroups',v_settings.preserve_groups,
      'requireVirusScan',v_settings.require_virus_scan,
      'notifyProjectAdmins',v_settings.notify_project_admins
    )
  );
end;
$$;

revoke all on function public.dimpro_bind_project_core_atomic(text,text,text,text,text,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.dimpro_bind_project_core_atomic(text,text,text,text,text,uuid,uuid,text,text) to service_role;

insert into public.dimpro_identity_schema_meta (
  component, schema_version, migration_count, bootstrap_id, metadata, updated_at
) values (
  'dimpro-identity-core',
  '0.2.1',
  5,
  'dimpro-identity-project-drive-v021-20260816',
  jsonb_build_object(
    'projectDriveFolderTextId', true,
    'projectRuntimeProvisioning', true,
    'projectLifecycleDropSync', true
  ),
  now()
)
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = greatest(public.dimpro_identity_schema_meta.migration_count, excluded.migration_count),
  bootstrap_id = excluded.bootstrap_id,
  metadata = coalesce(public.dimpro_identity_schema_meta.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

notify pgrst, 'reload schema';

commit;
