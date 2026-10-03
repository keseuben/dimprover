-- DIMPRO Drive Core 0.9.1 – folder tree soft delete / Trash
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
    (v_schema_version = '0.8.6' and v_migration_count = 7 and v_bootstrap_id = 'drive-core-v086-folder-password-gate-20261002')
    or
    (v_schema_version = '0.9.1' and v_migration_count = 8 and v_bootstrap_id = 'drive-core-v091-folder-trash-20261003')
  ) then
    raise exception 'DRIVE_CORE_V091_PREDECESSOR_REQUIRED' using errcode = '55000';
  end if;
end;
$$;

create or replace function public.drive_core_soft_delete_folder_tree_atomic(
  p_project_id text,
  p_folder_id text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root public.drive_core_folders;
  v_folder_ids text[] := array[]::text[];
  v_document_ids text[] := array[]::text[];
  v_folder_count integer := 0;
  v_document_count integer := 0;
  v_issued_count integer := 0;
begin
  if not exists (
    select 1 from public.project_core_projects
    where id = p_project_id and status <> 'DELETED'
  ) then
    raise exception 'DRIVE_CORE_PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_root
  from public.drive_core_folders
  where project_id = p_project_id and id = p_folder_id and status = 'ACTIVE'
  for update;

  if not found then
    raise exception 'DRIVE_FOLDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  with recursive subtree as (
    select id from public.drive_core_folders
    where project_id = p_project_id and id = p_folder_id and status = 'ACTIVE'
    union all
    select child.id
    from public.drive_core_folders child
    join subtree parent on child.parent_id = parent.id
    where child.project_id = p_project_id and child.status = 'ACTIVE'
  )
  select coalesce(array_agg(id), array[]::text[]), count(*)::integer
    into v_folder_ids, v_folder_count
  from subtree;

  if v_folder_count < 1 then
    raise exception 'DRIVE_FOLDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_folder_count > 5000 then
    raise exception 'DRIVE_FOLDER_DELETE_LIMIT' using errcode = '54000';
  end if;

  select coalesce(array_agg(id), array[]::text[]), count(*)::integer
    into v_document_ids, v_document_count
  from public.drive_core_documents
  where project_id = p_project_id
    and folder_id = any(v_folder_ids)
    and status <> 'DELETED';

  if to_regclass('public.drive_core_document_issues') is not null and v_document_count > 0 then
    execute
      'select count(*)::integer
         from public.drive_core_document_issues issue
         join public.drive_core_documents document
           on document.project_id = issue.project_id and document.id = issue.document_id
        where issue.project_id = $1
          and issue.status = ''ISSUED''
          and document.folder_id = any($2)
          and document.status <> ''DELETED'''
      into v_issued_count
      using p_project_id, v_folder_ids;
  end if;

  if v_issued_count > 0 then
    raise exception 'DRIVE_FOLDER_DELETE_ISSUED_BLOCKED' using errcode = '55000';
  end if;

  update public.drive_core_documents
     set status = 'DELETED', updated_at = now()
   where project_id = p_project_id
     and id = any(v_document_ids)
     and status <> 'DELETED';

  update public.drive_core_folders
     set status = 'ARCHIVED', updated_at = now()
   where project_id = p_project_id
     and id = any(v_folder_ids)
     and status = 'ACTIVE';

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  )
  select
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,
    'DOCUMENT_DELETED',
    'document',
    document_id,
    jsonb_build_object('documentId', document_id, 'rootFolderId', p_folder_id, 'deleteMode', 'FOLDER_TREE_SOFT_DELETE'),
    p_actor_user_id
  from unnest(v_document_ids) as document_id;

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  )
  select
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,
    'FOLDER_ARCHIVED',
    'folder',
    folder_id,
    jsonb_build_object('folderId', folder_id, 'rootFolderId', p_folder_id, 'deleteMode', 'FOLDER_TREE_SOFT_DELETE'),
    p_actor_user_id
  from unnest(v_folder_ids) as folder_id;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,
    p_actor_user_id,
    'DRIVE_FOLDER_TRASHED',
    'folder',
    p_folder_id,
    'DRIVE mappafa Lomtárba helyezve: ' || coalesce(v_root.display_name, v_root.original_name, v_root.name),
    jsonb_build_object(
      'rootFolderId', p_folder_id,
      'folderCount', v_folder_count,
      'documentCount', v_document_count,
      'deleteMode', 'FOLDER_TREE_SOFT_DELETE'
    )
  );

  return jsonb_build_object(
    'rootFolderId', p_folder_id,
    'archivedFolderCount', v_folder_count,
    'archivedFolderIds', to_jsonb(v_folder_ids),
    'deletedDocumentCount', v_document_count,
    'deletedDocumentIds', to_jsonb(v_document_ids)
  );
end;
$$;

revoke all on function public.drive_core_soft_delete_folder_tree_atomic(text,text,text)
  from public, anon, authenticated;
grant execute on function public.drive_core_soft_delete_folder_tree_atomic(text,text,text)
  to service_role;

update public.drive_core_schema_meta
set schema_version = '0.9.1',
    migration_count = 8,
    bootstrap_id = 'drive-core-v091-folder-trash-20261003',
    updated_at = now()
where component = 'drive-core';

commit;
