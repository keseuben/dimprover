begin;

create or replace function public.drive_core_soft_delete_documents_atomic(
  p_project_id text,
  p_document_ids text[],
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.drive_core_documents;
  v_requested_count integer := 0;
  v_deleted_ids text[] := array[]::text[];
  v_blocked_ids text[] := array[]::text[];
  v_has_active_issue boolean := false;
begin
  if not exists (
    select 1
    from public.project_core_projects
    where id = p_project_id and status <> 'DELETED'
  ) then
    raise exception 'DRIVE_CORE_PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_requested_count := coalesce(cardinality(p_document_ids), 0);
  if v_requested_count < 1 then
    raise exception 'DRIVE_CORE_DELETE_EMPTY' using errcode = '22023';
  end if;
  if v_requested_count > 500 then
    raise exception 'DRIVE_CORE_DELETE_LIMIT' using errcode = '54000';
  end if;

  for v_document in
    select *
    from public.drive_core_documents
    where project_id = p_project_id
      and id = any(p_document_ids)
      and status <> 'DELETED'
    for update
  loop
    v_has_active_issue := false;

    if to_regclass('public.drive_core_document_issues') is not null then
      execute
        'select exists (
          select 1 from public.drive_core_document_issues
          where project_id = $1 and document_id = $2 and status = ''ISSUED''
        )'
      into v_has_active_issue
      using p_project_id, v_document.id;
    end if;

    if v_has_active_issue then
      v_blocked_ids := array_append(v_blocked_ids, v_document.id);
      continue;
    end if;

    update public.drive_core_documents
    set status = 'DELETED',
        updated_at = now()
    where id = v_document.id
      and project_id = p_project_id;

    v_deleted_ids := array_append(v_deleted_ids, v_document.id);

    insert into public.project_core_audit_events (
      id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
    ) values (
      'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
      p_project_id,
      p_actor_user_id,
      'DRIVE_DOCUMENT_DELETED',
      'document',
      v_document.id,
      'DRIVE dokumentum lomtárba helyezve: ' || v_document.name,
      jsonb_build_object(
        'documentId', v_document.id,
        'name', v_document.name,
        'folderId', v_document.folder_id,
        'previousStatus', v_document.status,
        'deleteMode', 'SOFT_DELETE'
      )
    );

    insert into public.drive_core_change_events (
      id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
    ) values (
      'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
      p_project_id,
      'DOCUMENT_DELETED',
      'document',
      v_document.id,
      jsonb_build_object(
        'documentId', v_document.id,
        'name', v_document.name,
        'folderId', v_document.folder_id,
        'deleteMode', 'SOFT_DELETE'
      ),
      p_actor_user_id
    );
  end loop;

  return jsonb_build_object(
    'requestedCount', v_requested_count,
    'deletedCount', coalesce(cardinality(v_deleted_ids), 0),
    'deletedIds', to_jsonb(v_deleted_ids),
    'blockedCount', coalesce(cardinality(v_blocked_ids), 0),
    'blockedIds', to_jsonb(v_blocked_ids)
  );
end;
$$;

revoke all on function public.drive_core_soft_delete_documents_atomic(text,text[],text)
  from public, anon, authenticated;
grant execute on function public.drive_core_soft_delete_documents_atomic(text,text[],text)
  to service_role;

insert into public.drive_core_schema_meta (
  component, schema_version, migration_count, bootstrap_id, updated_at
)
values (
  'drive-core','0.5.0',2,'drive-core-v050-soft-delete-20260928',now()
)
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = excluded.migration_count,
  bootstrap_id = excluded.bootstrap_id,
  updated_at = excluded.updated_at;

commit;
