begin;

do $$
begin
  if to_regclass('public.drive_storage_schema_meta') is null
    or to_regclass('public.drive_core_document_versions') is null
    or to_regclass('public.drive_core_documents') is null
    or to_regclass('public.drive_core_change_events') is null
    or to_regclass('public.project_core_audit_events') is null then
    raise exception 'DRIVE_OBJECT_STORAGE_V040_REQUIRED' using errcode = 'P0001';
  end if;
end;
$$;

create table if not exists public.drive_core_object_cleanup_tasks (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  version_id text not null references public.drive_core_document_versions(id) on delete cascade,
  storage_provider text not null default 'S3',
  storage_bucket text not null,
  storage_key text not null,
  reason text not null default '',
  status text not null default 'PENDING',
  attempts integer not null default 0,
  last_error text null,
  requested_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint drive_core_cleanup_provider_check check (storage_provider = 'S3'),
  constraint drive_core_cleanup_status_check check (status in ('PENDING','COMPLETED','FAILED')),
  constraint drive_core_cleanup_attempts_check check (attempts >= 0 and attempts <= 100),
  constraint drive_core_cleanup_bucket_check check (length(btrim(storage_bucket)) between 1 and 255),
  constraint drive_core_cleanup_key_check check (length(btrim(storage_key)) between 1 and 1024),
  constraint drive_core_cleanup_project_version_unique unique (project_id, version_id)
);

create index if not exists drive_core_cleanup_project_status_idx
  on public.drive_core_object_cleanup_tasks (project_id, status, created_at);
create index if not exists drive_core_cleanup_retry_idx
  on public.drive_core_object_cleanup_tasks (status, attempts, updated_at)
  where status in ('PENDING','FAILED');

alter table public.drive_core_object_cleanup_tasks enable row level security;
revoke all on table public.drive_core_object_cleanup_tasks from public, anon, authenticated;
grant select, insert, update, delete on table public.drive_core_object_cleanup_tasks to service_role;

create or replace function public.drive_core_review_quarantined_version_atomic(
  p_project_id text,
  p_document_id text,
  p_version_id text,
  p_action text,
  p_note text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_note text;
  v_document public.drive_core_documents;
  v_version public.drive_core_document_versions;
  v_cleanup public.drive_core_object_cleanup_tasks;
  v_target_status text;
  v_event_type text;
  v_summary text;
  v_idempotent boolean := false;
begin
  v_action := upper(btrim(coalesce(p_action,'')));
  v_note := left(btrim(coalesce(p_note,'')),2000);
  if v_action not in ('APPROVE','REJECT') then
    raise exception 'DRIVE_REVIEW_ACTION_INVALID' using errcode = '22023';
  end if;
  if v_action = 'REJECT' and length(v_note) < 3 then
    raise exception 'DRIVE_REVIEW_NOTE_REQUIRED' using errcode = '22023';
  end if;

  select * into v_document
  from public.drive_core_documents
  where id = p_document_id and project_id = p_project_id and status = 'ACTIVE'
  for update;
  if v_document.id is null then
    raise exception 'DRIVE_REVIEW_VERSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_version
  from public.drive_core_document_versions
  where id = p_version_id and document_id = p_document_id and project_id = p_project_id
  for update;
  if v_version.id is null then
    raise exception 'DRIVE_REVIEW_VERSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_target_status := case when v_action = 'APPROVE' then 'AVAILABLE' else 'REJECTED' end;
  if v_version.status = v_target_status then
    v_idempotent := true;
    if v_action = 'REJECT' then
      select * into v_cleanup from public.drive_core_object_cleanup_tasks
      where project_id = p_project_id and version_id = p_version_id;
    end if;
    return jsonb_build_object(
      'action',v_action,
      'idempotent',true,
      'version',to_jsonb(v_version),
      'cleanupTask',case when v_cleanup.id is null then null else to_jsonb(v_cleanup) end
    );
  end if;

  if v_version.status <> 'QUARANTINED' then
    raise exception 'DRIVE_REVIEW_NOT_QUARANTINED' using errcode = 'P0001';
  end if;
  if v_version.storage_provider <> 'S3' or v_version.storage_bucket is null or v_version.storage_key is null then
    raise exception 'DRIVE_REVIEW_STORAGE_REFERENCE_MISSING' using errcode = 'P0001';
  end if;

  update public.drive_core_document_versions
  set status = v_target_status,
      change_note = case
        when v_note = '' then change_note
        when change_note = '' then v_note
        else change_note || E'\nReview: ' || v_note
      end
  where id = p_version_id
  returning * into v_version;

  update public.drive_core_documents
  set updated_at = now()
  where id = p_document_id;

  if v_action = 'REJECT' then
    insert into public.drive_core_object_cleanup_tasks (
      id, project_id, version_id, storage_provider, storage_bucket, storage_key,
      reason, status, attempts, requested_by, created_at, updated_at
    ) values (
      'drive-cleanup-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
      p_project_id, p_version_id, 'S3', v_version.storage_bucket, v_version.storage_key,
      coalesce(nullif(v_note,''),'Karanténverzió elutasítva.'), 'PENDING', 0,
      p_actor_user_id, now(), now()
    )
    on conflict (project_id, version_id) do update set
      reason = excluded.reason,
      status = case
        when public.drive_core_object_cleanup_tasks.status = 'COMPLETED' then 'COMPLETED'
        else 'PENDING'
      end,
      last_error = case
        when public.drive_core_object_cleanup_tasks.status = 'COMPLETED' then public.drive_core_object_cleanup_tasks.last_error
        else null
      end,
      requested_by = excluded.requested_by,
      updated_at = now()
    returning * into v_cleanup;
    v_event_type := 'DOCUMENT_VERSION_REJECTED';
    v_summary := 'DRIVE karanténverzió elutasítva: ' || v_document.name || ' · V' || v_version.version_number::text;
  else
    v_event_type := 'DOCUMENT_VERSION_APPROVED';
    v_summary := 'DRIVE karanténverzió jóváhagyva: ' || v_document.name || ' · V' || v_version.version_number::text;
  end if;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id, p_actor_user_id, 'DRIVE_' || v_event_type, 'document_version', p_version_id,
    v_summary,
    jsonb_build_object(
      'documentId',p_document_id,
      'versionId',p_version_id,
      'version',v_version.version_number,
      'action',v_action,
      'note',v_note,
      'cleanupTaskId',case when v_cleanup.id is null then null else v_cleanup.id end,
      'reviewSchema','0.4.1'
    )
  );

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id, v_event_type, 'document_version', p_version_id,
    jsonb_build_object(
      'documentId',p_document_id,
      'version',to_jsonb(v_version),
      'reviewAction',v_action,
      'cleanupTaskId',case when v_cleanup.id is null then null else v_cleanup.id end
    ),
    p_actor_user_id
  );

  return jsonb_build_object(
    'action',v_action,
    'idempotent',v_idempotent,
    'version',to_jsonb(v_version),
    'cleanupTask',case when v_cleanup.id is null then null else to_jsonb(v_cleanup) end
  );
end;
$$;

create or replace function public.drive_core_complete_cleanup_task(
  p_project_id text,
  p_task_id text,
  p_success boolean,
  p_error text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.drive_core_object_cleanup_tasks;
  v_status text;
  v_error text;
begin
  select * into v_task
  from public.drive_core_object_cleanup_tasks
  where id = p_task_id and project_id = p_project_id
  for update;
  if v_task.id is null then
    raise exception 'DRIVE_CLEANUP_TASK_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_task.status = 'COMPLETED' then
    return to_jsonb(v_task);
  end if;

  v_status := case when p_success then 'COMPLETED' else 'FAILED' end;
  v_error := case when p_success then null else left(btrim(coalesce(p_error,'Ismeretlen objektumtörlési hiba.')),2000) end;

  update public.drive_core_object_cleanup_tasks
  set status = v_status,
      attempts = attempts + 1,
      last_error = v_error,
      updated_at = now(),
      completed_at = case when p_success then now() else null end
  where id = p_task_id
  returning * into v_task;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id, p_actor_user_id,
    case when p_success then 'DRIVE_OBJECT_CLEANUP_COMPLETED' else 'DRIVE_OBJECT_CLEANUP_FAILED' end,
    'document_version', v_task.version_id,
    case when p_success then 'DRIVE elutasított objektum törölve.' else 'DRIVE elutasított objektum törlése sikertelen.' end,
    jsonb_build_object(
      'cleanupTaskId',v_task.id,
      'versionId',v_task.version_id,
      'attempts',v_task.attempts,
      'success',p_success,
      'error',v_error,
      'reviewSchema','0.4.1'
    )
  );

  return to_jsonb(v_task);
end;
$$;

revoke all on function public.drive_core_review_quarantined_version_atomic(text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.drive_core_complete_cleanup_task(text,text,boolean,text,text) from public, anon, authenticated;
grant execute on function public.drive_core_review_quarantined_version_atomic(text,text,text,text,text,text) to service_role;
grant execute on function public.drive_core_complete_cleanup_task(text,text,boolean,text,text) to service_role;

insert into public.drive_storage_schema_meta (
  component, schema_version, migration_count, bootstrap_id, applied_at, updated_at
) values (
  'drive-quarantine-review','0.4.1',1,'drive-quarantine-review-v041-20260802',now(),now()
)
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = excluded.migration_count,
  bootstrap_id = excluded.bootstrap_id,
  applied_at = excluded.applied_at,
  updated_at = now();

commit;
