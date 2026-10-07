-- DIMPRO Drive Core 0.9.2 – Trash list lifecycle support: restore + permanent purge
-- DEV only. Permanent purge queues S3 object cleanup before metadata deletion.
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
    (v_schema_version = '0.9.1' and v_migration_count = 8 and v_bootstrap_id = 'drive-core-v091-folder-trash-20261003')
    or
    (v_schema_version = '0.9.2' and v_migration_count = 9 and v_bootstrap_id = 'drive-core-v092-trash-restore-purge-20261007')
  ) then
    raise exception 'DRIVE_CORE_V092_PREDECESSOR_REQUIRED' using errcode = '55000';
  end if;

  if to_regclass('public.drive_core_object_cleanup_tasks') is null then
    raise exception 'DRIVE_CLEANUP_QUEUE_REQUIRED' using errcode = '55000';
  end if;
end;
$$;

-- Cleanup tasks must survive the metadata row they are cleaning up.
alter table public.drive_core_object_cleanup_tasks
  drop constraint if exists drive_core_object_cleanup_tasks_version_id_fkey;

create or replace function public.drive_core_restore_document_atomic(
  p_project_id text,
  p_document_id text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.drive_core_documents;
  v_folder public.drive_core_folders;
  v_conflict boolean := false;
begin
  select * into v_document
  from public.drive_core_documents
  where project_id = p_project_id and id = p_document_id and status = 'DELETED'
  for update;
  if not found then raise exception 'DRIVE_TRASH_DOCUMENT_NOT_FOUND' using errcode='P0002'; end if;

  select * into v_folder from public.drive_core_folders
  where project_id=p_project_id and id=v_document.folder_id and status='ACTIVE';
  if not found then raise exception 'DRIVE_TRASH_PARENT_FOLDER_NOT_ACTIVE' using errcode='55000'; end if;

  select exists(
    select 1 from public.drive_core_documents d
    where d.project_id=p_project_id and d.folder_id=v_document.folder_id
      and d.status='ACTIVE' and lower(d.name)=lower(v_document.name) and d.id<>v_document.id
  ) into v_conflict;
  if v_conflict then raise exception 'DRIVE_TRASH_RESTORE_NAME_CONFLICT' using errcode='23505'; end if;

  update public.drive_core_documents set status='ACTIVE',updated_at=now()
  where project_id=p_project_id and id=p_document_id;

  insert into public.drive_core_change_events(id,project_id,event_type,entity_type,entity_id,payload,actor_user_id)
  values('drive-change-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),p_project_id,'DOCUMENT_RESTORED','document',p_document_id,
    jsonb_build_object('documentId',p_document_id,'folderId',v_document.folder_id,'restoreMode','TRASH_RESTORE'),p_actor_user_id);
  insert into public.project_core_audit_events(id,project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata)
  values('project-audit-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),p_project_id,p_actor_user_id,'DRIVE_DOCUMENT_RESTORED','document',p_document_id,
    'DRIVE dokumentum visszaállítva a Lomtárból: '||v_document.name,
    jsonb_build_object('documentId',p_document_id,'folderId',v_document.folder_id,'restoreMode','TRASH_RESTORE'));

  return jsonb_build_object('documentId',p_document_id,'restored',true);
end;
$$;

create or replace function public.drive_core_restore_folder_tree_atomic(
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
  v_conflicts integer := 0;
begin
  select * into v_root from public.drive_core_folders
  where project_id=p_project_id and id=p_folder_id and status='ARCHIVED' for update;
  if not found then raise exception 'DRIVE_TRASH_FOLDER_NOT_FOUND' using errcode='P0002'; end if;

  if v_root.parent_id is not null and not exists(
    select 1 from public.drive_core_folders where project_id=p_project_id and id=v_root.parent_id and status='ACTIVE'
  ) then raise exception 'DRIVE_TRASH_PARENT_FOLDER_NOT_ACTIVE' using errcode='55000'; end if;

  with recursive subtree as (
    select id from public.drive_core_folders where project_id=p_project_id and id=p_folder_id and status='ARCHIVED'
    union all
    select c.id from public.drive_core_folders c join subtree p on c.parent_id=p.id
    where c.project_id=p_project_id and c.status='ARCHIVED'
  ) select coalesce(array_agg(id),array[]::text[]),count(*)::integer into v_folder_ids,v_folder_count from subtree;

  select coalesce(array_agg(id),array[]::text[]),count(*)::integer into v_document_ids,v_document_count
  from public.drive_core_documents where project_id=p_project_id and folder_id=any(v_folder_ids) and status='DELETED';

  select count(*)::integer into v_conflicts
  from public.drive_core_documents deleted
  join public.drive_core_documents active
    on active.project_id=deleted.project_id and active.folder_id=deleted.folder_id
   and active.status='ACTIVE' and lower(active.name)=lower(deleted.name) and active.id<>deleted.id
  where deleted.project_id=p_project_id and deleted.folder_id=any(v_folder_ids) and deleted.status='DELETED';
  if v_conflicts>0 then raise exception 'DRIVE_TRASH_RESTORE_NAME_CONFLICT' using errcode='23505'; end if;

  update public.drive_core_folders set status='ACTIVE',updated_at=now()
  where project_id=p_project_id and id=any(v_folder_ids) and status='ARCHIVED';
  update public.drive_core_documents set status='ACTIVE',updated_at=now()
  where project_id=p_project_id and id=any(v_document_ids) and status='DELETED';

  insert into public.drive_core_change_events(id,project_id,event_type,entity_type,entity_id,payload,actor_user_id)
  values('drive-change-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),p_project_id,'FOLDER_TREE_RESTORED','folder',p_folder_id,
    jsonb_build_object('rootFolderId',p_folder_id,'folderCount',v_folder_count,'documentCount',v_document_count),p_actor_user_id);
  insert into public.project_core_audit_events(id,project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata)
  values('project-audit-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),p_project_id,p_actor_user_id,'DRIVE_FOLDER_RESTORED','folder',p_folder_id,
    'DRIVE mappafa visszaállítva a Lomtárból: '||coalesce(v_root.display_name,v_root.original_name,v_root.name),
    jsonb_build_object('rootFolderId',p_folder_id,'folderCount',v_folder_count,'documentCount',v_document_count));

  return jsonb_build_object('rootFolderId',p_folder_id,'restoredFolderCount',v_folder_count,'restoredDocumentCount',v_document_count);
end;
$$;

create or replace function public.drive_core_purge_document_atomic(
  p_project_id text,
  p_document_id text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.drive_core_documents;
  v_cleanup_count integer := 0;
  v_issue_links integer := 0;
begin
  select * into v_document from public.drive_core_documents
  where project_id=p_project_id and id=p_document_id and status='DELETED' for update;
  if not found then raise exception 'DRIVE_TRASH_DOCUMENT_NOT_FOUND' using errcode='P0002'; end if;

  if to_regclass('public.project_issue_attachments') is not null then
    execute 'select count(*)::integer from public.project_issue_attachments where project_id=$1 and drive_document_id=$2'
      into v_issue_links using p_project_id,p_document_id;
    if v_issue_links>0 then raise exception 'DRIVE_TRASH_PURGE_ISSUE_REFERENCE' using errcode='55000'; end if;
  end if;

  insert into public.drive_core_object_cleanup_tasks(id,project_id,version_id,storage_provider,storage_bucket,storage_key,reason,status,attempts,last_error,requested_by,created_at,updated_at,completed_at)
  select 'drive-cleanup-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),v.project_id,v.id,'S3',v.storage_bucket,v.storage_key,
    'TRASH_PERMANENT_PURGE','PENDING',0,null,p_actor_user_id,now(),now(),null
  from public.drive_core_document_versions v
  where v.project_id=p_project_id and v.document_id=p_document_id and v.storage_provider='S3' and v.storage_bucket is not null and v.storage_key is not null
  on conflict(project_id,version_id) do update set
    reason='TRASH_PERMANENT_PURGE',
    status=case when public.drive_core_object_cleanup_tasks.status='COMPLETED' then 'COMPLETED' else 'PENDING' end,
    last_error=case when public.drive_core_object_cleanup_tasks.status='COMPLETED' then public.drive_core_object_cleanup_tasks.last_error else null end,
    updated_at=now();
  get diagnostics v_cleanup_count = row_count;

  delete from public.drive_core_documents where project_id=p_project_id and id=p_document_id and status='DELETED';

  insert into public.drive_core_change_events(id,project_id,event_type,entity_type,entity_id,payload,actor_user_id)
  values('drive-change-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),p_project_id,'DOCUMENT_PURGED','document',p_document_id,
    jsonb_build_object('documentId',p_document_id,'cleanupTaskCount',v_cleanup_count,'purgeMode','PERMANENT'),p_actor_user_id);
  insert into public.project_core_audit_events(id,project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata)
  values('project-audit-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),p_project_id,p_actor_user_id,'DRIVE_DOCUMENT_PURGED','document',p_document_id,
    'DRIVE dokumentum végleges törlése kezdeményezve: '||v_document.name,
    jsonb_build_object('documentId',p_document_id,'cleanupTaskCount',v_cleanup_count,'purgeMode','PERMANENT'));

  return jsonb_build_object('documentId',p_document_id,'purged',true,'cleanupTaskCount',v_cleanup_count);
end;
$$;

create or replace function public.drive_core_purge_folder_tree_atomic(
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
  v_cleanup_count integer := 0;
  v_bad_count integer := 0;
  v_issue_links integer := 0;
  v_row record;
begin
  select * into v_root from public.drive_core_folders
  where project_id=p_project_id and id=p_folder_id and status='ARCHIVED' for update;
  if not found then raise exception 'DRIVE_TRASH_FOLDER_NOT_FOUND' using errcode='P0002'; end if;

  with recursive subtree as (
    select id,status from public.drive_core_folders where project_id=p_project_id and id=p_folder_id
    union all
    select c.id,c.status from public.drive_core_folders c join subtree p on c.parent_id=p.id where c.project_id=p_project_id
  ) select coalesce(array_agg(id),array[]::text[]),count(*)::integer,count(*) filter(where status<>'ARCHIVED')::integer
    into v_folder_ids,v_folder_count,v_bad_count from subtree;
  if v_bad_count>0 then raise exception 'DRIVE_TRASH_PURGE_ACTIVE_CHILD' using errcode='55000'; end if;

  select coalesce(array_agg(id),array[]::text[]),count(*)::integer,count(*) filter(where status<>'DELETED')::integer
    into v_document_ids,v_document_count,v_bad_count
  from public.drive_core_documents where project_id=p_project_id and folder_id=any(v_folder_ids);
  if v_bad_count>0 then raise exception 'DRIVE_TRASH_PURGE_ACTIVE_DOCUMENT' using errcode='55000'; end if;

  if to_regclass('public.project_issue_attachments') is not null and v_document_count>0 then
    execute 'select count(*)::integer from public.project_issue_attachments where project_id=$1 and drive_document_id=any($2)'
      into v_issue_links using p_project_id,v_document_ids;
    if v_issue_links>0 then raise exception 'DRIVE_TRASH_PURGE_ISSUE_REFERENCE' using errcode='55000'; end if;
  end if;

  insert into public.drive_core_object_cleanup_tasks(id,project_id,version_id,storage_provider,storage_bucket,storage_key,reason,status,attempts,last_error,requested_by,created_at,updated_at,completed_at)
  select 'drive-cleanup-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),v.project_id,v.id,'S3',v.storage_bucket,v.storage_key,
    'TRASH_PERMANENT_PURGE','PENDING',0,null,p_actor_user_id,now(),now(),null
  from public.drive_core_document_versions v
  where v.project_id=p_project_id and v.document_id=any(v_document_ids) and v.storage_provider='S3' and v.storage_bucket is not null and v.storage_key is not null
  on conflict(project_id,version_id) do update set
    reason='TRASH_PERMANENT_PURGE',
    status=case when public.drive_core_object_cleanup_tasks.status='COMPLETED' then 'COMPLETED' else 'PENDING' end,
    last_error=case when public.drive_core_object_cleanup_tasks.status='COMPLETED' then public.drive_core_object_cleanup_tasks.last_error else null end,
    updated_at=now();
  get diagnostics v_cleanup_count = row_count;

  delete from public.drive_core_documents where project_id=p_project_id and id=any(v_document_ids) and status='DELETED';

  for v_row in
    with recursive subtree as (
      select id,0 as depth from public.drive_core_folders where project_id=p_project_id and id=p_folder_id
      union all
      select c.id,p.depth+1 from public.drive_core_folders c join subtree p on c.parent_id=p.id where c.project_id=p_project_id
    ) select id,depth from subtree order by depth desc
  loop
    delete from public.drive_core_folders where project_id=p_project_id and id=v_row.id and status='ARCHIVED';
  end loop;

  insert into public.drive_core_change_events(id,project_id,event_type,entity_type,entity_id,payload,actor_user_id)
  values('drive-change-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),p_project_id,'FOLDER_TREE_PURGED','folder',p_folder_id,
    jsonb_build_object('rootFolderId',p_folder_id,'folderCount',v_folder_count,'documentCount',v_document_count,'cleanupTaskCount',v_cleanup_count,'purgeMode','PERMANENT'),p_actor_user_id);
  insert into public.project_core_audit_events(id,project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata)
  values('project-audit-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),p_project_id,p_actor_user_id,'DRIVE_FOLDER_PURGED','folder',p_folder_id,
    'DRIVE mappafa végleges törlése kezdeményezve: '||coalesce(v_root.display_name,v_root.original_name,v_root.name),
    jsonb_build_object('rootFolderId',p_folder_id,'folderCount',v_folder_count,'documentCount',v_document_count,'cleanupTaskCount',v_cleanup_count,'purgeMode','PERMANENT'));

  return jsonb_build_object('rootFolderId',p_folder_id,'purgedFolderCount',v_folder_count,'purgedDocumentCount',v_document_count,'cleanupTaskCount',v_cleanup_count);
end;
$$;

revoke all on function public.drive_core_restore_document_atomic(text,text,text) from public,anon,authenticated;
revoke all on function public.drive_core_restore_folder_tree_atomic(text,text,text) from public,anon,authenticated;
revoke all on function public.drive_core_purge_document_atomic(text,text,text) from public,anon,authenticated;
revoke all on function public.drive_core_purge_folder_tree_atomic(text,text,text) from public,anon,authenticated;
grant execute on function public.drive_core_restore_document_atomic(text,text,text) to service_role;
grant execute on function public.drive_core_restore_folder_tree_atomic(text,text,text) to service_role;
grant execute on function public.drive_core_purge_document_atomic(text,text,text) to service_role;
grant execute on function public.drive_core_purge_folder_tree_atomic(text,text,text) to service_role;

update public.drive_core_schema_meta
set schema_version='0.9.2',migration_count=9,bootstrap_id='drive-core-v092-trash-restore-purge-20261007',updated_at=now()
where component='drive-core';

commit;
