begin;

-- DIMPRO Drive Compare Findings V2.0
-- Tartós, projektizolált eltérési review-lista. Nem automatikus hibaminősítés.

create table if not exists public.drive_compare_findings_schema_meta (
  component text primary key,
  schema_version text not null,
  migration_count integer not null,
  bootstrap_id text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.drive_core_compare_findings (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  left_document_id text not null references public.drive_core_documents(id) on delete cascade,
  left_version_id text not null references public.drive_core_document_versions(id) on delete cascade,
  right_document_id text not null references public.drive_core_documents(id) on delete cascade,
  right_version_id text not null references public.drive_core_document_versions(id) on delete cascade,
  page_number integer not null,
  source_zone_index integer not null,
  zone_label text not null,
  zone_x double precision not null,
  zone_y double precision not null,
  zone_width double precision not null,
  zone_height double precision not null,
  score integer not null,
  mismatch_pixels integer not null default 0,
  ink_pixels integer not null default 0,
  alignment_offset_x double precision not null default 0,
  alignment_offset_y double precision not null default 0,
  alignment_scale_percent double precision not null default 100,
  alignment_rotation_degrees double precision not null default 0,
  alignment_source text not null,
  alignment_confidence_score double precision not null default 0,
  status text not null default 'REVIEW',
  priority text not null default 'MEDIUM',
  note text not null default '',
  assignee_user_id text null,
  assignee_name text not null default '',
  due_at timestamptz null,
  version integer not null default 1,
  created_by text not null,
  created_by_name text not null default '',
  updated_by text not null,
  updated_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  deleted_by text null,
  constraint drive_compare_finding_documents_check check (left_document_id <> right_document_id or left_version_id <> right_version_id),
  constraint drive_compare_finding_page_check check (page_number between 1 and 100000),
  constraint drive_compare_finding_zone_index_check check (source_zone_index between 0 and 999),
  constraint drive_compare_finding_zone_label_check check (length(btrim(zone_label)) between 1 and 32),
  constraint drive_compare_finding_zone_x_check check (zone_x between 0 and 1),
  constraint drive_compare_finding_zone_y_check check (zone_y between 0 and 1),
  constraint drive_compare_finding_zone_width_check check (zone_width > 0 and zone_width <= 1),
  constraint drive_compare_finding_zone_height_check check (zone_height > 0 and zone_height <= 1),
  constraint drive_compare_finding_zone_bounds_check check (zone_x + zone_width <= 1.002 and zone_y + zone_height <= 1.002),
  constraint drive_compare_finding_score_check check (score between 0 and 100),
  constraint drive_compare_finding_pixel_check check (mismatch_pixels >= 0 and ink_pixels >= 0),
  constraint drive_compare_finding_scale_check check (alignment_scale_percent between 10 and 1000),
  constraint drive_compare_finding_rotation_check check (alignment_rotation_degrees between -180 and 180),
  constraint drive_compare_finding_confidence_check check (alignment_confidence_score between 0 and 1),
  constraint drive_compare_finding_alignment_source_check check (alignment_source in ('TEXT_LABELS','GEOMETRIC_NODES','VECTOR_SEGMENTS','VECTOR_CONTOURS')),
  constraint drive_compare_finding_status_check check (status in ('REVIEW','ACCEPTED_DIFFERENCE','FIX_REQUIRED')),
  constraint drive_compare_finding_priority_check check (priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
  constraint drive_compare_finding_note_check check (length(note) <= 4000),
  constraint drive_compare_finding_assignee_name_check check (length(assignee_name) <= 240),
  constraint drive_compare_finding_version_check check (version >= 1)
);

create index if not exists drive_compare_findings_project_pair_idx
  on public.drive_core_compare_findings (project_id,left_version_id,right_version_id,page_number,created_at desc)
  where deleted_at is null;
create index if not exists drive_compare_findings_project_status_idx
  on public.drive_core_compare_findings (project_id,status,priority,due_at,updated_at desc)
  where deleted_at is null;
create index if not exists drive_compare_findings_assignee_idx
  on public.drive_core_compare_findings (project_id,assignee_user_id,status,due_at)
  where deleted_at is null and assignee_user_id is not null;
create unique index if not exists drive_compare_findings_active_zone_unique
  on public.drive_core_compare_findings (
    project_id,left_version_id,right_version_id,page_number,source_zone_index,
    round(zone_x::numeric,4),round(zone_y::numeric,4),round(zone_width::numeric,4),round(zone_height::numeric,4)
  ) where deleted_at is null;

alter table public.drive_compare_findings_schema_meta enable row level security;
alter table public.drive_core_compare_findings enable row level security;
revoke all on table public.drive_compare_findings_schema_meta from public, anon, authenticated;
revoke all on table public.drive_core_compare_findings from public, anon, authenticated;
grant select, insert, update, delete on table public.drive_compare_findings_schema_meta to service_role;
grant select, insert, update, delete on table public.drive_core_compare_findings to service_role;

-- A Compare Finding ugyanúgy auditált Drive/Project objektum, mint a BOX vagy metadata.
alter table public.drive_core_change_events drop constraint if exists drive_core_changes_entity_type_check;
alter table public.drive_core_change_events add constraint drive_core_changes_entity_type_check
  check (entity_type in ('folder','document','document_version','sync','metadata','note','qr','box','box_item','saved_view','compare_job','compare_finding','ai_job'));

alter table public.project_core_audit_events drop constraint if exists project_core_audit_entity_type_check;
alter table public.project_core_audit_events add constraint project_core_audit_entity_type_check
  check (entity_type in (
    'project','membership','lifecycle','folder','document','document_version','sync',
    'calendar_event','dialog_thread','dialog_message',
    'decide_request','decide_approver','decide_note',
    'diary_entry','diary_event',
    'metadata','note','qr','box','box_item','saved_view','compare_job','compare_finding','ai_job'
  ));

create or replace function public.drive_compare_findings_create_atomic(
  p_project_id text,
  p_payload jsonb,
  p_actor_user_id text,
  p_actor_name text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.drive_core_compare_findings;
  v_assignee public.project_core_memberships;
  v_left_version public.drive_core_document_versions;
  v_right_version public.drive_core_document_versions;
  v_assignee_id text;
begin
  if not exists (select 1 from public.project_core_projects where id=p_project_id and status <> 'DELETED') then
    raise exception 'PROJECT_CORE_PROJECT_NOT_FOUND' using errcode='P0002';
  end if;

  select * into v_left_version from public.drive_core_document_versions
    where id=p_payload->>'left_version_id' and project_id=p_project_id and document_id=p_payload->>'left_document_id' and status='AVAILABLE';
  if v_left_version.id is null then raise exception 'DRIVE_COMPARE_LEFT_VERSION_NOT_FOUND' using errcode='P0002'; end if;
  select * into v_right_version from public.drive_core_document_versions
    where id=p_payload->>'right_version_id' and project_id=p_project_id and document_id=p_payload->>'right_document_id' and status='AVAILABLE';
  if v_right_version.id is null then raise exception 'DRIVE_COMPARE_RIGHT_VERSION_NOT_FOUND' using errcode='P0002'; end if;

  v_assignee_id := nullif(btrim(coalesce(p_payload->>'assignee_user_id','')),'');
  if v_assignee_id is not null then
    select * into v_assignee from public.project_core_memberships
      where project_id=p_project_id and lower(user_id)=lower(v_assignee_id) and status='ACTIVE' limit 1;
    if v_assignee.id is null then raise exception 'DRIVE_COMPARE_ASSIGNEE_NOT_ACTIVE' using errcode='P0001'; end if;
  end if;

  insert into public.drive_core_compare_findings (
    id,project_id,left_document_id,left_version_id,right_document_id,right_version_id,page_number,source_zone_index,zone_label,
    zone_x,zone_y,zone_width,zone_height,score,mismatch_pixels,ink_pixels,
    alignment_offset_x,alignment_offset_y,alignment_scale_percent,alignment_rotation_degrees,alignment_source,alignment_confidence_score,
    status,priority,note,assignee_user_id,assignee_name,due_at,version,
    created_by,created_by_name,updated_by,updated_by_name,created_at,updated_at
  ) values (
    p_payload->>'id',p_project_id,p_payload->>'left_document_id',p_payload->>'left_version_id',p_payload->>'right_document_id',p_payload->>'right_version_id',
    (p_payload->>'page_number')::integer,(p_payload->>'source_zone_index')::integer,btrim(p_payload->>'zone_label'),
    (p_payload->>'zone_x')::double precision,(p_payload->>'zone_y')::double precision,(p_payload->>'zone_width')::double precision,(p_payload->>'zone_height')::double precision,
    (p_payload->>'score')::integer,coalesce((p_payload->>'mismatch_pixels')::integer,0),coalesce((p_payload->>'ink_pixels')::integer,0),
    coalesce((p_payload->>'alignment_offset_x')::double precision,0),coalesce((p_payload->>'alignment_offset_y')::double precision,0),
    coalesce((p_payload->>'alignment_scale_percent')::double precision,100),coalesce((p_payload->>'alignment_rotation_degrees')::double precision,0),
    p_payload->>'alignment_source',coalesce((p_payload->>'alignment_confidence_score')::double precision,0),
    coalesce(p_payload->>'status','REVIEW'),coalesce(p_payload->>'priority','MEDIUM'),left(coalesce(p_payload->>'note',''),4000),
    v_assignee_id,case when v_assignee_id is null then '' else coalesce(nullif(v_assignee.display_name,''),v_assignee.user_id) end,
    nullif(p_payload->>'due_at','')::timestamptz,1,p_actor_user_id,left(coalesce(p_actor_name,p_actor_user_id),240),p_actor_user_id,left(coalesce(p_actor_name,p_actor_user_id),240),now(),now()
  ) returning * into v_row;

  insert into public.project_core_audit_events(id,project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata)
  values ('project-audit-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),p_project_id,p_actor_user_id,'DRIVE_COMPARE_FINDING_CREATED','compare_finding',v_row.id,
    'DRIVE Compare eltérési tétel létrehozva: '||v_row.zone_label,
    jsonb_build_object('findingId',v_row.id,'status',v_row.status,'priority',v_row.priority,'pageNumber',v_row.page_number,'leftVersionId',v_row.left_version_id,'rightVersionId',v_row.right_version_id));
  insert into public.drive_core_change_events(id,project_id,event_type,entity_type,entity_id,payload,actor_user_id)
  values ('drive-change-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),p_project_id,'COMPARE_FINDING_CREATED','compare_finding',v_row.id,to_jsonb(v_row),p_actor_user_id);

  return to_jsonb(v_row);
exception
  when unique_violation then raise exception 'DRIVE_COMPARE_FINDING_DUPLICATE' using errcode='P0001';
end;
$$;

create or replace function public.drive_compare_findings_update_atomic(
  p_project_id text,
  p_finding_id text,
  p_expected_version integer,
  p_patch jsonb,
  p_actor_user_id text,
  p_actor_name text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.drive_core_compare_findings;
  v_row public.drive_core_compare_findings;
  v_assignee public.project_core_memberships;
  v_assignee_id text;
  v_assignee_name text;
begin
  select * into v_current from public.drive_core_compare_findings
    where id=p_finding_id and project_id=p_project_id and deleted_at is null for update;
  if v_current.id is null then raise exception 'DRIVE_COMPARE_FINDING_NOT_FOUND' using errcode='P0002'; end if;
  if v_current.version <> p_expected_version then raise exception 'DRIVE_COMPARE_FINDING_VERSION_CONFLICT' using errcode='P0001'; end if;

  v_assignee_id := case when p_patch ? 'assignee_user_id' then nullif(btrim(coalesce(p_patch->>'assignee_user_id','')),'') else v_current.assignee_user_id end;
  v_assignee_name := case when v_assignee_id is null then '' else v_current.assignee_name end;
  if v_assignee_id is not null and (p_patch ? 'assignee_user_id') then
    select * into v_assignee from public.project_core_memberships
      where project_id=p_project_id and lower(user_id)=lower(v_assignee_id) and status='ACTIVE' limit 1;
    if v_assignee.id is null then raise exception 'DRIVE_COMPARE_ASSIGNEE_NOT_ACTIVE' using errcode='P0001'; end if;
    v_assignee_name := coalesce(nullif(v_assignee.display_name,''),v_assignee.user_id);
  end if;

  update public.drive_core_compare_findings set
    status=case when p_patch ? 'status' then p_patch->>'status' else status end,
    priority=case when p_patch ? 'priority' then p_patch->>'priority' else priority end,
    note=case when p_patch ? 'note' then left(coalesce(p_patch->>'note',''),4000) else note end,
    assignee_user_id=v_assignee_id,
    assignee_name=v_assignee_name,
    due_at=case when p_patch ? 'due_at' then nullif(p_patch->>'due_at','')::timestamptz else due_at end,
    version=version+1,updated_by=p_actor_user_id,updated_by_name=left(coalesce(p_actor_name,p_actor_user_id),240),updated_at=now()
  where id=p_finding_id and project_id=p_project_id and deleted_at is null and version=p_expected_version
  returning * into v_row;
  if v_row.id is null then raise exception 'DRIVE_COMPARE_FINDING_VERSION_CONFLICT' using errcode='P0001'; end if;

  insert into public.project_core_audit_events(id,project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata)
  values ('project-audit-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),p_project_id,p_actor_user_id,'DRIVE_COMPARE_FINDING_UPDATED','compare_finding',v_row.id,
    'DRIVE Compare eltérési tétel frissítve: '||v_row.zone_label,
    jsonb_build_object('findingId',v_row.id,'previousVersion',v_current.version,'version',v_row.version,'previousStatus',v_current.status,'status',v_row.status,'priority',v_row.priority,'assigneeUserId',v_row.assignee_user_id,'dueAt',v_row.due_at));
  insert into public.drive_core_change_events(id,project_id,event_type,entity_type,entity_id,payload,actor_user_id)
  values ('drive-change-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),p_project_id,'COMPARE_FINDING_UPDATED','compare_finding',v_row.id,
    jsonb_build_object('finding',to_jsonb(v_row),'previousVersion',v_current.version,'previousStatus',v_current.status),p_actor_user_id);

  return to_jsonb(v_row);
end;
$$;

create or replace function public.drive_compare_findings_delete_atomic(
  p_project_id text,
  p_finding_id text,
  p_expected_version integer,
  p_actor_user_id text,
  p_actor_name text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.drive_core_compare_findings;
  v_row public.drive_core_compare_findings;
begin
  select * into v_current from public.drive_core_compare_findings
    where id=p_finding_id and project_id=p_project_id and deleted_at is null for update;
  if v_current.id is null then raise exception 'DRIVE_COMPARE_FINDING_NOT_FOUND' using errcode='P0002'; end if;
  if v_current.version <> p_expected_version then raise exception 'DRIVE_COMPARE_FINDING_VERSION_CONFLICT' using errcode='P0001'; end if;

  update public.drive_core_compare_findings set deleted_at=now(),deleted_by=p_actor_user_id,version=version+1,
    updated_by=p_actor_user_id,updated_by_name=left(coalesce(p_actor_name,p_actor_user_id),240),updated_at=now()
  where id=p_finding_id and project_id=p_project_id and deleted_at is null and version=p_expected_version returning * into v_row;

  insert into public.project_core_audit_events(id,project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata)
  values ('project-audit-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),p_project_id,p_actor_user_id,'DRIVE_COMPARE_FINDING_DELETED','compare_finding',v_row.id,
    'DRIVE Compare eltérési tétel archiválva: '||v_row.zone_label,jsonb_build_object('findingId',v_row.id,'version',v_row.version,'softDelete',true));
  insert into public.drive_core_change_events(id,project_id,event_type,entity_type,entity_id,payload,actor_user_id)
  values ('drive-change-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),p_project_id,'COMPARE_FINDING_DELETED','compare_finding',v_row.id,jsonb_build_object('findingId',v_row.id,'deletedAt',v_row.deleted_at,'version',v_row.version),p_actor_user_id);
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.drive_compare_findings_create_atomic(text,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.drive_compare_findings_update_atomic(text,text,integer,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.drive_compare_findings_delete_atomic(text,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.drive_compare_findings_create_atomic(text,jsonb,text,text) to service_role;
grant execute on function public.drive_compare_findings_update_atomic(text,text,integer,jsonb,text,text) to service_role;
grant execute on function public.drive_compare_findings_delete_atomic(text,text,integer,text,text) to service_role;

insert into public.drive_compare_findings_schema_meta(component,schema_version,migration_count,bootstrap_id,updated_at)
values ('drive-compare-findings','2.0.0',1,'drive-compare-findings-v200-20260815',now())
on conflict(component) do update set schema_version=excluded.schema_version,migration_count=excluded.migration_count,bootstrap_id=excluded.bootstrap_id,updated_at=now();

commit;
