-- DIMPRO Drive Core V0.9.4 - atomic folder move
-- DEV-first additive migration. Preserves folder identity and rewrites subtree paths atomically.
begin;

do $$
declare
  v_schema_version text;
  v_migration_count integer;
  v_bootstrap_id text;
begin
  select schema_version,migration_count,bootstrap_id
    into v_schema_version,v_migration_count,v_bootstrap_id
  from public.drive_core_schema_meta where component='drive-core';
  if v_schema_version <> '0.9.3'
     or v_migration_count <> 10
     or v_bootstrap_id <> 'drive-core-v093-link-guard-password-ttl-20261007' then
    raise exception 'DRIVE_CORE_V094_BASELINE_REQUIRED' using errcode='P0002';
  end if;
end
$$;

create or replace function public.drive_core_move_folder_atomic(
  p_project_id text,
  p_folder_id text,
  p_target_parent_id text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_folder public.drive_core_folders;
  v_target public.drive_core_folders;
  v_old_path text;
  v_new_path text;
  v_target_parent_id text;
  v_changed integer := 0;
begin
  select * into v_folder
  from public.drive_core_folders
  where id=p_folder_id and project_id=p_project_id and status='ACTIVE'
  for update;
  if v_folder.id is null then
    raise exception 'DRIVE_FOLDER_NOT_FOUND' using errcode='P0002';
  end if;

  v_target_parent_id := nullif(btrim(coalesce(p_target_parent_id,'')),'');
  if v_target_parent_id = v_folder.id then
    raise exception 'DRIVE_FOLDER_MOVE_SELF_BLOCKED' using errcode='22023';
  end if;

  if v_target_parent_id is not null then
    select * into v_target
    from public.drive_core_folders
    where id=v_target_parent_id and project_id=p_project_id and status='ACTIVE'
    for update;
    if v_target.id is null then
      raise exception 'DRIVE_FOLDER_MOVE_TARGET_NOT_FOUND' using errcode='P0002';
    end if;
    if v_target.path = v_folder.path or v_target.path like v_folder.path || '/%' then
      raise exception 'DRIVE_FOLDER_MOVE_DESCENDANT_BLOCKED' using errcode='22023';
    end if;
    v_new_path := v_target.path || '/' || v_folder.name;
  else
    v_new_path := v_folder.name;
  end if;

  if v_folder.parent_id is not distinct from v_target_parent_id then
    return jsonb_build_object(
      'ok',true,'idempotent',true,'folderId',v_folder.id,
      'previousParentId',v_folder.parent_id,'parentId',v_folder.parent_id,
      'previousPath',v_folder.path,'path',v_folder.path,'updatedCount',0
    );
  end if;

  if exists (
    select 1 from public.drive_core_folders other
    where other.project_id=p_project_id
      and other.path=v_new_path
      and other.id<>v_folder.id
  ) then
    raise exception 'DRIVE_FOLDER_MOVE_TARGET_PATH_EXISTS' using errcode='23505';
  end if;

  v_old_path := v_folder.path;
  update public.drive_core_folders
  set path = v_new_path || substr(path,length(v_old_path)+1),
      parent_id = case when id=v_folder.id then v_target_parent_id else parent_id end,
      updated_at = now()
  where project_id=p_project_id
    and (path=v_old_path or path like v_old_path || '/%');
  get diagnostics v_changed = row_count;

  insert into public.project_core_audit_events (
    id,project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'DRIVE_FOLDER_MOVED','folder',v_folder.id,
    'DRIVE mappa áthelyezve: ' || v_old_path || ' → ' || v_new_path,
    jsonb_build_object('previousParentId',v_folder.parent_id,'parentId',v_target_parent_id,'previousPath',v_old_path,'path',v_new_path,'updatedCount',v_changed)
  );

  insert into public.drive_core_change_events (
    id,project_id,event_type,entity_type,entity_id,payload,actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,'FOLDER_MOVED','folder',v_folder.id,
    jsonb_build_object('previousParentId',v_folder.parent_id,'parentId',v_target_parent_id,'previousPath',v_old_path,'path',v_new_path,'updatedCount',v_changed),
    p_actor_user_id
  );

  return jsonb_build_object(
    'ok',true,'idempotent',false,'folderId',v_folder.id,
    'previousParentId',v_folder.parent_id,'parentId',v_target_parent_id,
    'previousPath',v_old_path,'path',v_new_path,'updatedCount',v_changed
  );
end;
$$;

create or replace function public.drive_core_set_folder_visibility_atomic(
  p_project_id text,
  p_folder_id text,
  p_acl_inherit boolean,
  p_allowed_membership_ids text[],
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_folder public.drive_core_folders;
  v_membership_id text;
  v_allowed text[] := coalesce(p_allowed_membership_ids,array[]::text[]);
  v_count integer := 0;
begin
  select * into v_folder from public.drive_core_folders
  where id=p_folder_id and project_id=p_project_id and status='ACTIVE'
  for update;
  if v_folder.id is null then
    raise exception 'DRIVE_FOLDER_NOT_FOUND' using errcode='P0002';
  end if;

  if not coalesce(p_acl_inherit,true) then
    if coalesce(array_length(v_allowed,1),0)=0 then
      raise exception 'DRIVE_FOLDER_ACL_ALLOW_REQUIRED' using errcode='22023';
    end if;
    if exists (
      select 1 from unnest(v_allowed) requested(id)
      where not exists (
        select 1 from public.project_core_memberships membership
        where membership.id=requested.id
          and membership.project_id=p_project_id
          and membership.status='ACTIVE'
      )
    ) then
      raise exception 'DRIVE_FOLDER_ACL_MEMBERSHIP_INVALID' using errcode='22023';
    end if;
  end if;

  delete from public.drive_core_folder_acl_entries
  where project_id=p_project_id and folder_id=p_folder_id;

  update public.drive_core_folders
  set acl_inherit=coalesce(p_acl_inherit,true),updated_at=now()
  where id=p_folder_id and project_id=p_project_id;

  if not coalesce(p_acl_inherit,true) then
    foreach v_membership_id in array v_allowed loop
      insert into public.drive_core_folder_acl_entries(
        id,project_id,folder_id,principal_type,membership_id,role,permission,effect,created_by,created_at,updated_at
      ) values (
        'drive-folder-acl-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
        p_project_id,p_folder_id,'USER',v_membership_id,null,'folder.view','ALLOW',p_actor_user_id,now(),now()
      ) on conflict do nothing;
    end loop;
  end if;

  select count(*) into v_count from public.drive_core_folder_acl_entries
  where project_id=p_project_id and folder_id=p_folder_id;

  insert into public.project_core_audit_events(
    id,project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'DRIVE_FOLDER_ACCESS_UPDATED','folder',p_folder_id,
    case when coalesce(p_acl_inherit,true) then 'Mappajogosultság visszaállítva projektöröklésre' else 'Mappajogosultság egyedi felhasználói listára állítva' end,
    jsonb_build_object('aclInherit',coalesce(p_acl_inherit,true),'allowedMembershipIds',v_allowed,'entryCount',v_count)
  );

  insert into public.drive_core_change_events(id,project_id,event_type,entity_type,entity_id,payload,actor_user_id)
  values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,'FOLDER_ACCESS_UPDATED','folder',p_folder_id,
    jsonb_build_object('aclInherit',coalesce(p_acl_inherit,true),'allowedMembershipIds',v_allowed,'entryCount',v_count),p_actor_user_id
  );

  return jsonb_build_object('ok',true,'folderId',p_folder_id,'aclInherit',coalesce(p_acl_inherit,true),'allowedMembershipIds',v_allowed,'entryCount',v_count);
end;
$$;

create or replace function public.dimpro_personal_drive_soft_remove_refs_atomic(
  p_owner_user_id text,
  p_ref_ids text[]
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_requested text[] := coalesce(p_ref_ids,array[]::text[]);
  v_unique_requested integer;
  v_owned_count integer;
  v_removed_count integer;
  v_blocked jsonb;
begin
  if nullif(btrim(coalesce(p_owner_user_id,'')),'') is null then
    raise exception 'PERSONAL_DRIVE_OWNER_REQUIRED' using errcode='22023';
  end if;

  select count(distinct value) into v_unique_requested
  from unnest(v_requested) as requested(value)
  where nullif(btrim(value),'') is not null;
  if v_unique_requested < 1 or v_unique_requested > 500 then
    raise exception 'PERSONAL_DRIVE_DELETE_SELECTION_INVALID' using errcode='22023';
  end if;

  perform 1 from public.dimpro_content_refs ref
  where ref.owner_type='USER'
    and ref.owner_user_id=p_owner_user_id
    and ref.id=any(v_requested)
  for update;

  select count(*) into v_owned_count
  from public.dimpro_content_refs ref
  where ref.owner_type='USER'
    and ref.owner_user_id=p_owner_user_id
    and ref.status='ACTIVE'
    and ref.id=any(v_requested);
  if v_owned_count <> v_unique_requested then
    raise exception 'PERSONAL_DRIVE_DELETE_SCOPE_MISMATCH' using errcode='42501';
  end if;

  select jsonb_agg(jsonb_build_object(
    'refId',ref.id,
    'displayName',ref.display_name,
    'kind','BOX',
    'reference',box.name,
    'title','Saját Drive CsomagBOX',
    'status',coalesce(box.lifecycle_status,box.status,'ACTIVE')
  )) into v_blocked
  from public.dimpro_content_refs ref
  join public.dimpro_personal_drive_box_items item
    on item.owner_user_id=p_owner_user_id and item.content_ref_id=ref.id
  join public.dimpro_personal_drive_boxes box
    on box.id=item.box_id and box.owner_user_id=p_owner_user_id and box.status='ACTIVE'
  where ref.owner_type='USER'
    and ref.owner_user_id=p_owner_user_id
    and ref.status='ACTIVE'
    and ref.id=any(v_requested);

  if v_blocked is not null and jsonb_array_length(v_blocked)>0 then
    raise exception 'PERSONAL_DRIVE_DELETE_DEPENDENCY_BLOCKED:%',v_blocked::text using errcode='55000';
  end if;

  update public.dimpro_content_refs
  set status='REMOVED',updated_at=now()
  where owner_type='USER'
    and owner_user_id=p_owner_user_id
    and status='ACTIVE'
    and id=any(v_requested);
  get diagnostics v_removed_count=row_count;

  if v_removed_count <> v_unique_requested then
    raise exception 'PERSONAL_DRIVE_DELETE_INCOMPLETE' using errcode='40001';
  end if;

  return jsonb_build_object(
    'ok',true,
    'removedIds',to_jsonb(v_requested),
    'removedCount',v_removed_count,
    'physicalObjectDeleted',false
  );
end;
$$;

revoke all on function public.drive_core_move_folder_atomic(text,text,text,text) from public,anon,authenticated;
grant execute on function public.drive_core_move_folder_atomic(text,text,text,text) to service_role;
revoke all on function public.drive_core_set_folder_visibility_atomic(text,text,boolean,text[],text) from public,anon,authenticated;
grant execute on function public.drive_core_set_folder_visibility_atomic(text,text,boolean,text[],text) to service_role;
revoke all on function public.dimpro_personal_drive_soft_remove_refs_atomic(text,text[]) from public,anon,authenticated;
grant execute on function public.dimpro_personal_drive_soft_remove_refs_atomic(text,text[]) to service_role;

update public.drive_core_schema_meta
set schema_version='0.9.4',migration_count=11,bootstrap_id='drive-core-v094-folder-move-20261007',updated_at=now()
where component='drive-core';

commit;
