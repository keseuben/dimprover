-- DIMPRO Drive Core 0.9.3 – linked-document delete guard + long-lived password unlock TTL
-- DEV ONLY / PROD DENY
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
  if not (
    (v_schema_version='0.9.2' and v_migration_count=9 and v_bootstrap_id='drive-core-v092-trash-restore-purge-20261007')
    or
    (v_schema_version='0.9.3' and v_migration_count=10 and v_bootstrap_id='drive-core-v093-link-guard-password-ttl-20261007')
  ) then
    raise exception 'DRIVE_CORE_V093_PREDECESSOR_REQUIRED' using errcode='55000';
  end if;
end;
$$;

create or replace function public.drive_core_guard_linked_document_soft_delete()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if old.status <> 'DELETED' and new.status = 'DELETED' then
    if exists (
      select 1 from public.project_issue_attachments attachment
      where attachment.project_id=new.project_id
        and attachment.drive_document_id=new.id
        and attachment.deleted_at is null
    ) then
      raise exception 'DRIVE_DOCUMENT_DELETE_LINKED_BLOCKED' using errcode='55000';
    end if;
    if exists (
      select 1 from public.drive_core_document_issues issue
      where issue.project_id=new.project_id
        and issue.document_id=new.id
        and issue.status='ISSUED'
    ) then
      raise exception 'DRIVE_DOCUMENT_DELETE_FORMAL_ISSUE_BLOCKED' using errcode='55000';
    end if;
    if exists (
      select 1
      from public.drive_core_box_items item
      join public.drive_core_boxes box on box.id=item.box_id and box.project_id=item.project_id
      where item.project_id=new.project_id and item.document_id=new.id and box.status='ACTIVE'
    ) then
      raise exception 'DRIVE_DOCUMENT_DELETE_BOX_LINK_BLOCKED' using errcode='55000';
    end if;
    if exists (
      select 1 from public.drive_core_compare_findings finding
      where finding.project_id=new.project_id
        and finding.deleted_at is null
        and (finding.left_document_id=new.id or finding.right_document_id=new.id)
    ) then
      raise exception 'DRIVE_DOCUMENT_DELETE_COMPARE_LINK_BLOCKED' using errcode='55000';
    end if;
    if exists (
      select 1 from public.project_core_entity_links link
      where link.project_id=new.project_id
        and ((link.source_type in ('document','drive_document') and link.source_id=new.id)
          or (link.target_type in ('document','drive_document') and link.target_id=new.id))
    ) then
      raise exception 'DRIVE_DOCUMENT_DELETE_ENTITY_LINK_BLOCKED' using errcode='55000';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists drive_core_documents_linked_delete_guard on public.drive_core_documents;
create trigger drive_core_documents_linked_delete_guard
before update of status on public.drive_core_documents
for each row execute function public.drive_core_guard_linked_document_soft_delete();

create or replace function public.drive_core_set_folder_password_atomic(
  p_project_id text,
  p_folder_id text,
  p_password_hash text,
  p_unlock_ttl_minutes integer,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_folder public.drive_core_folders;
  v_row public.drive_core_folder_passwords;
begin
  select * into v_folder
  from public.drive_core_folders
  where id = p_folder_id
    and project_id = p_project_id
    and status = 'ACTIVE'
  for update;

  if v_folder.id is null then
    raise exception 'DRIVE_FOLDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if btrim(coalesce(p_password_hash,'')) = '' then
    raise exception 'DRIVE_FOLDER_PASSWORD_HASH_REQUIRED' using errcode = 'P0001';
  end if;

  insert into public.drive_core_folder_passwords (
    folder_id, project_id, password_hash, password_version,
    unlock_ttl_minutes, max_attempts, lockout_minutes,
    created_by, updated_by, created_at, updated_at
  ) values (
    p_folder_id, p_project_id, p_password_hash, 1,
    greatest(5, least(525600, coalesce(p_unlock_ttl_minutes,120))),
    5, 15, p_actor_user_id, p_actor_user_id, now(), now()
  )
  on conflict (folder_id) do update set
    project_id = excluded.project_id,
    password_hash = excluded.password_hash,
    password_version = public.drive_core_folder_passwords.password_version + 1,
    unlock_ttl_minutes = excluded.unlock_ttl_minutes,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_row;

  delete from public.drive_core_folder_password_attempts
  where project_id = p_project_id and folder_id = p_folder_id;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'DRIVE_FOLDER_PASSWORD_SET','folder',p_folder_id,
    'Mappajelszó beállítva vagy módosítva',
    jsonb_build_object(
      'passwordVersion',v_row.password_version,
      'unlockTtlMinutes',v_row.unlock_ttl_minutes,
      'maxAttempts',v_row.max_attempts,
      'lockoutMinutes',v_row.lockout_minutes
    )
  );

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,'FOLDER_PASSWORD_SET','folder',p_folder_id,
    jsonb_build_object('passwordVersion',v_row.password_version,'unlockTtlMinutes',v_row.unlock_ttl_minutes),
    p_actor_user_id
  );

  return jsonb_build_object(
    'projectId',v_row.project_id,'folderId',v_row.folder_id,'passwordVersion',v_row.password_version,
    'unlockTtlMinutes',v_row.unlock_ttl_minutes,'maxAttempts',v_row.max_attempts,'lockoutMinutes',v_row.lockout_minutes,
    'createdBy',v_row.created_by,'updatedBy',v_row.updated_by,'createdAt',v_row.created_at,'updatedAt',v_row.updated_at
  );
end;
$$;

revoke all on function public.drive_core_guard_linked_document_soft_delete() from public,anon,authenticated;
revoke all on function public.drive_core_set_folder_password_atomic(text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.drive_core_guard_linked_document_soft_delete() to service_role;
grant execute on function public.drive_core_set_folder_password_atomic(text,text,text,integer,text) to service_role;

update public.drive_core_schema_meta
set schema_version='0.9.3',migration_count=10,bootstrap_id='drive-core-v093-link-guard-password-ttl-20261007',updated_at=now()
where component='drive-core';

commit;
