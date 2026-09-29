-- DIMPRO Drive V0.6.6 - optional CsomagBOX internal folder structure
-- Additive migration: the existing flat CsomagBOX remains operational if this migration is not applied.
begin;

create table if not exists public.drive_core_box_folders (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  box_id text not null references public.drive_core_boxes(id) on delete cascade,
  parent_id text null references public.drive_core_box_folders(id) on delete cascade,
  name text not null,
  sort_order integer not null default 100,
  status text not null default 'ACTIVE',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drive_core_box_folders_name_check
    check (length(btrim(name)) between 1 and 120 and name !~ '[\\/]'),
  constraint drive_core_box_folders_sort_check
    check (sort_order between 0 and 999999),
  constraint drive_core_box_folders_status_check
    check (status in ('ACTIVE','ARCHIVED')),
  constraint drive_core_box_folders_parent_self_check
    check (parent_id is null or parent_id <> id)
);

create index if not exists drive_core_box_folders_project_box_idx
  on public.drive_core_box_folders (project_id, box_id, parent_id, sort_order, created_at);

create unique index if not exists drive_core_box_folders_active_name_unique
  on public.drive_core_box_folders (
    box_id,
    coalesce(parent_id,''),
    lower(btrim(name))
  )
  where status = 'ACTIVE';

alter table public.drive_core_box_items
  add column if not exists folder_id text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'drive_core_box_items_folder_fk'
      and conrelid = 'public.drive_core_box_items'::regclass
  ) then
    alter table public.drive_core_box_items
      add constraint drive_core_box_items_folder_fk
      foreign key (folder_id)
      references public.drive_core_box_folders(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists drive_core_box_items_folder_idx
  on public.drive_core_box_items (project_id, box_id, folder_id, sort_order, added_at);

alter table public.drive_core_box_folders enable row level security;

revoke all on public.drive_core_box_folders from public, anon, authenticated;
grant select, insert, update, delete on public.drive_core_box_folders to service_role;

-- A CsomagBOX belső mappa új auditált Drive objektumtípus.
alter table public.drive_core_change_events drop constraint if exists drive_core_changes_entity_type_check;
alter table public.drive_core_change_events add constraint drive_core_changes_entity_type_check
  check (entity_type in (
    'folder','document','document_version','sync',
    'metadata','note','qr','box','box_item','box_folder','saved_view',
    'compare_job','compare_finding','ai_job'
  ));

alter table public.project_core_audit_events drop constraint if exists project_core_audit_entity_type_check;
alter table public.project_core_audit_events add constraint project_core_audit_entity_type_check
  check (entity_type in (
    'project','membership','lifecycle','folder','document','document_version','sync',
    'calendar_event','dialog_thread','dialog_message',
    'decide_request','decide_approver','decide_note',
    'diary_entry','diary_event',
    'metadata','note','qr','box','box_item','box_folder','saved_view',
    'compare_job','compare_finding','issue','ai_job'
  ));

create or replace function public.drive_workspace_create_box_folder_atomic(
  p_project_id text,
  p_box_id text,
  p_parent_id text,
  p_name text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box public.drive_core_boxes;
  v_parent public.drive_core_box_folders;
  v_row public.drive_core_box_folders;
  v_sort integer;
  v_name text;
begin
  select * into v_box
  from public.drive_core_boxes
  where id = p_box_id
    and project_id = p_project_id
    and status = 'ACTIVE';

  if v_box.id is null then
    raise exception 'DRIVE_BOX_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_name := left(btrim(coalesce(p_name,'')),120);
  if length(v_name) = 0 or v_name ~ '[\\/]' then
    raise exception 'DRIVE_BOX_FOLDER_NAME_INVALID' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_parent_id,'')),'') is not null then
    select * into v_parent
    from public.drive_core_box_folders
    where id = p_parent_id
      and project_id = p_project_id
      and box_id = p_box_id
      and status = 'ACTIVE';

    if v_parent.id is null then
      raise exception 'DRIVE_BOX_FOLDER_PARENT_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  select coalesce(max(sort_order),0) + 100 into v_sort
  from public.drive_core_box_folders
  where project_id = p_project_id
    and box_id = p_box_id
    and coalesce(parent_id,'') = coalesce(nullif(btrim(coalesce(p_parent_id,'')),''),'')
    and status = 'ACTIVE';

  insert into public.drive_core_box_folders (
    id, project_id, box_id, parent_id, name, sort_order, status,
    created_by, created_at, updated_at
  ) values (
    'drive-boxfolder-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,
    p_box_id,
    nullif(btrim(coalesce(p_parent_id,'')),''),
    v_name,
    least(v_sort,999999),
    'ACTIVE',
    p_actor_user_id,
    now(),
    now()
  )
  returning * into v_row;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,
    p_actor_user_id,
    'DRIVE_BOX_FOLDER_CREATED',
    'box_folder',
    v_row.id,
    'CsomagBOX mappa létrehozva: ' || v_row.name || ' → ' || v_box.name,
    jsonb_build_object(
      'boxId', p_box_id,
      'folderId', v_row.id,
      'parentId', v_row.parent_id,
      'name', v_row.name
    )
  );

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,
    'BOX_FOLDER_CREATED',
    'box_folder',
    v_row.id,
    jsonb_build_object('boxId',p_box_id,'folder',to_jsonb(v_row)),
    p_actor_user_id
  );

  return to_jsonb(v_row);
exception
  when unique_violation then
    raise exception 'DRIVE_BOX_FOLDER_NAME_EXISTS' using errcode = '23505';
end;
$$;

create or replace function public.drive_workspace_move_box_item_atomic(
  p_project_id text,
  p_box_id text,
  p_item_id text,
  p_folder_id text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box public.drive_core_boxes;
  v_item public.drive_core_box_items;
  v_folder public.drive_core_box_folders;
  v_sort integer;
  v_target_folder_id text;
begin
  select * into v_box
  from public.drive_core_boxes
  where id = p_box_id
    and project_id = p_project_id
    and status = 'ACTIVE';

  if v_box.id is null then
    raise exception 'DRIVE_BOX_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_item
  from public.drive_core_box_items
  where id = p_item_id
    and project_id = p_project_id
    and box_id = p_box_id
  for update;

  if v_item.id is null then
    raise exception 'DRIVE_BOX_ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_target_folder_id := nullif(btrim(coalesce(p_folder_id,'')),'');

  if v_target_folder_id is not null then
    select * into v_folder
    from public.drive_core_box_folders
    where id = v_target_folder_id
      and project_id = p_project_id
      and box_id = p_box_id
      and status = 'ACTIVE';

    if v_folder.id is null then
      raise exception 'DRIVE_BOX_FOLDER_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  select coalesce(max(sort_order),0) + 100 into v_sort
  from public.drive_core_box_items
  where project_id = p_project_id
    and box_id = p_box_id
    and coalesce(folder_id,'') = coalesce(v_target_folder_id,'');

  update public.drive_core_box_items
  set folder_id = v_target_folder_id,
      sort_order = least(v_sort,999999)
  where id = v_item.id
  returning * into v_item;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,
    p_actor_user_id,
    'DRIVE_BOX_ITEM_MOVED',
    'box_item',
    v_item.id,
    'CsomagBOX elem áthelyezve: ' || v_item.document_id || ' → ' || coalesce(v_folder.name,'BOX gyökér'),
    jsonb_build_object(
      'boxId', p_box_id,
      'boxItemId', v_item.id,
      'documentId', v_item.document_id,
      'folderId', v_target_folder_id
    )
  );

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,
    'BOX_ITEM_MOVED',
    'box_item',
    v_item.id,
    jsonb_build_object(
      'boxId',p_box_id,
      'item',to_jsonb(v_item),
      'folderId',v_target_folder_id
    ),
    p_actor_user_id
  );

  return to_jsonb(v_item);
end;
$$;

revoke all on function public.drive_workspace_create_box_folder_atomic(text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.drive_workspace_create_box_folder_atomic(text,text,text,text,text)
  to service_role;

revoke all on function public.drive_workspace_move_box_item_atomic(text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.drive_workspace_move_box_item_atomic(text,text,text,text,text)
  to service_role;

commit;
