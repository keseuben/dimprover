begin;

alter table public.drive_core_folders
  add column if not exists original_name text not null default '',
  add column if not exists display_name text not null default '';

update public.drive_core_folders
set original_name = case when btrim(original_name) = '' then name else original_name end,
    display_name = case when btrim(display_name) = '' then name else display_name end
where btrim(original_name) = '' or btrim(display_name) = '';

comment on column public.drive_core_folders.original_name is
  'Immutable human source name captured when the folder first enters DIMPRO. Existing legacy folders are backfilled from name.';
comment on column public.drive_core_folders.display_name is
  'Human-facing editable folder name. Technical name/path remain unchanged when this value is edited.';

create or replace function public.drive_core_create_folder_atomic(
  p_project_id text,
  p_folder jsonb,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_folder public.drive_core_folders;
  v_parent public.drive_core_folders;
  v_path text;
  v_original_name text;
  v_display_name text;
begin
  if not exists (select 1 from public.project_core_projects where id = p_project_id and status <> 'DELETED') then
    raise exception 'DRIVE_CORE_PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_original_name := left(btrim(coalesce(nullif(p_folder->>'original_name',''), p_folder->>'name', '')), 1000);
  v_display_name := left(btrim(coalesce(nullif(p_folder->>'display_name',''), v_original_name, p_folder->>'name', '')), 240);

  if v_original_name = '' or v_display_name = '' then
    raise exception 'DRIVE_CORE_FOLDER_NAME_REQUIRED' using errcode = '22023';
  end if;

  if nullif(p_folder->>'parent_id','') is not null then
    select * into v_parent from public.drive_core_folders
      where id = p_folder->>'parent_id' and project_id = p_project_id and status = 'ACTIVE';
    if v_parent.id is null then
      raise exception 'DRIVE_CORE_PARENT_NOT_FOUND' using errcode = 'P0002';
    end if;
    v_path := v_parent.path || '/' || btrim(p_folder->>'name');
  else
    v_path := btrim(p_folder->>'name');
  end if;

  insert into public.drive_core_folders (
    id, project_id, parent_id, name, path, original_name, display_name,
    sort_order, status, created_by, created_at, updated_at
  ) values (
    p_folder->>'id', p_project_id, nullif(p_folder->>'parent_id',''), btrim(p_folder->>'name'), v_path,
    v_original_name, v_display_name,
    coalesce((p_folder->>'sort_order')::integer,100), 'ACTIVE', p_actor_user_id, now(), now()
  ) returning * into v_folder;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12), p_project_id, p_actor_user_id,
    'DRIVE_FOLDER_CREATED','folder',v_folder.id,'DRIVE mappa létrehozva: ' || v_folder.display_name,
    jsonb_build_object(
      'path',v_folder.path,
      'parentId',v_folder.parent_id,
      'originalName',v_folder.original_name,
      'displayName',v_folder.display_name,
      'safeName',v_folder.name
    )
  );

  insert into public.drive_core_change_events (id, project_id, event_type, entity_type, entity_id, payload, actor_user_id)
  values ('drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16), p_project_id,
    'FOLDER_CREATED','folder',v_folder.id,to_jsonb(v_folder),p_actor_user_id);

  return to_jsonb(v_folder);
end;
$$;

create or replace function public.drive_core_update_folder_display_name(
  p_project_id text,
  p_folder_id text,
  p_display_name text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_folder public.drive_core_folders;
  v_previous_name text;
  v_display_name text;
begin
  v_display_name := left(btrim(coalesce(p_display_name,'')), 240);
  if v_display_name = '' then
    raise exception 'DRIVE_CORE_FOLDER_DISPLAY_NAME_REQUIRED' using errcode = '22023';
  end if;

  select display_name into v_previous_name
  from public.drive_core_folders
  where id = p_folder_id and project_id = p_project_id and status = 'ACTIVE'
  for update;

  if v_previous_name is null then
    raise exception 'DRIVE_CORE_FOLDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.drive_core_folders
  set display_name = v_display_name,
      updated_at = now()
  where id = p_folder_id and project_id = p_project_id and status = 'ACTIVE'
  returning * into v_folder;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12), p_project_id, p_actor_user_id,
    'DRIVE_FOLDER_DISPLAY_NAME_UPDATED','folder',v_folder.id,'DRIVE mappa megjelenítési neve módosítva: ' || v_folder.display_name,
    jsonb_build_object(
      'previousDisplayName',v_previous_name,
      'displayName',v_folder.display_name,
      'originalName',v_folder.original_name,
      'safeName',v_folder.name,
      'technicalPath',v_folder.path
    )
  );

  insert into public.drive_core_change_events (id, project_id, event_type, entity_type, entity_id, payload, actor_user_id)
  values ('drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16), p_project_id,
    'FOLDER_DISPLAY_NAME_UPDATED','folder',v_folder.id,to_jsonb(v_folder),p_actor_user_id);

  return to_jsonb(v_folder);
end;
$$;

revoke all on function public.drive_core_update_folder_display_name(text,text,text,text) from public, anon, authenticated;
grant execute on function public.drive_core_update_folder_display_name(text,text,text,text) to service_role;

update public.drive_core_schema_meta
set schema_version = '0.6.0',
    migration_count = 3,
    bootstrap_id = 'drive-core-v060-safe-folder-names-20260928',
    updated_at = now()
where component = 'drive-core'
  and schema_version = '0.5.0'
  and migration_count = 2
  and bootstrap_id = 'drive-core-v050-soft-delete-20260928';

commit;
