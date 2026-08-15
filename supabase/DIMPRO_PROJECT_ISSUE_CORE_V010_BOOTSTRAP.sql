begin;

-- DIMPRO Project Issue Core V0.1
-- Közös, projektizolált hibajegy-mag. Compare Finding csak emberi FIX_REQUIRED döntés után konvertálható.

create table if not exists public.project_issue_schema_meta (
  component text primary key,
  schema_version text not null,
  migration_count integer not null,
  bootstrap_id text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.project_core_issue_sequences (
  project_id text primary key references public.project_core_projects(id) on delete cascade,
  next_value integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint project_core_issue_sequences_next_check check (next_value >= 1)
);

create table if not exists public.project_core_issues (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  serial text not null,
  source_type text not null,
  source_id text not null,
  title text not null,
  description text not null default '',
  location text not null default '',
  discipline text not null default '',
  severity text not null default 'MEDIUM',
  status text not null default 'NEW',
  responsible_user_id text null,
  responsible_name text not null default '',
  due_at timestamptz null,
  note text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_by text not null,
  created_by_name text not null default '',
  updated_by text not null,
  updated_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  deleted_by text null,
  constraint project_core_issues_serial_check check (length(btrim(serial)) between 4 and 32),
  constraint project_core_issues_source_type_check check (source_type in ('COMPARE_FINDING','FIELD_CAPTURE','MANUAL','MEETING','IMPORT')),
  constraint project_core_issues_title_check check (length(btrim(title)) between 1 and 500),
  constraint project_core_issues_description_check check (length(description) <= 12000),
  constraint project_core_issues_location_check check (length(location) <= 1000),
  constraint project_core_issues_discipline_check check (length(discipline) <= 240),
  constraint project_core_issues_severity_check check (severity in ('LOW','MEDIUM','HIGH','URGENT')),
  constraint project_core_issues_status_check check (status in ('NEW','IN_PROGRESS','FIXED','VERIFIED','CLOSED','REOPENED')),
  constraint project_core_issues_responsible_name_check check (length(responsible_name) <= 240),
  constraint project_core_issues_note_check check (length(note) <= 4000),
  constraint project_core_issues_version_check check (version >= 1)
);

create unique index if not exists project_core_issues_project_serial_unique
  on public.project_core_issues(project_id,serial);
create unique index if not exists project_core_issues_active_source_unique
  on public.project_core_issues(project_id,source_type,source_id)
  where deleted_at is null;
create index if not exists project_core_issues_project_status_idx
  on public.project_core_issues(project_id,status,severity,due_at,updated_at desc)
  where deleted_at is null;
create index if not exists project_core_issues_responsible_idx
  on public.project_core_issues(project_id,responsible_user_id,status,due_at)
  where deleted_at is null and responsible_user_id is not null;
create unique index if not exists project_core_entity_links_issue_compare_created_from_unique
  on public.project_core_entity_links(project_id,source_type,source_id,target_type,target_id,relation_type)
  where source_type='issue' and target_type='compare_finding' and relation_type='CREATED_FROM';

alter table public.project_issue_schema_meta enable row level security;
alter table public.project_core_issue_sequences enable row level security;
alter table public.project_core_issues enable row level security;
revoke all on table public.project_issue_schema_meta from public,anon,authenticated;
revoke all on table public.project_core_issue_sequences from public,anon,authenticated;
revoke all on table public.project_core_issues from public,anon,authenticated;
grant select,insert,update,delete on table public.project_issue_schema_meta to service_role;
grant select,insert,update,delete on table public.project_core_issue_sequences to service_role;
grant select,insert,update,delete on table public.project_core_issues to service_role;

alter table public.project_core_audit_events drop constraint if exists project_core_audit_entity_type_check;
alter table public.project_core_audit_events add constraint project_core_audit_entity_type_check
  check (entity_type in (
    'project','membership','lifecycle','folder','document','document_version','sync',
    'calendar_event','dialog_thread','dialog_message',
    'decide_request','decide_approver','decide_note',
    'diary_entry','diary_event',
    'metadata','note','qr','box','box_item','saved_view','compare_job','compare_finding','issue','ai_job'
  ));

create or replace function public.project_issue_create_from_compare_finding_atomic(
  p_project_id text,
  p_finding_id text,
  p_actor_user_id text,
  p_actor_name text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_finding public.drive_core_compare_findings;
  v_existing public.project_core_issues;
  v_issue public.project_core_issues;
  v_link public.project_core_entity_links;
  v_number integer;
  v_serial text;
  v_severity text;
begin
  select * into v_finding
  from public.drive_core_compare_findings
  where id=p_finding_id and project_id=p_project_id and deleted_at is null
  for update;

  if v_finding.id is null then
    raise exception 'PROJECT_ISSUE_COMPARE_FINDING_NOT_FOUND' using errcode='P0002';
  end if;
  if v_finding.status <> 'FIX_REQUIRED' then
    raise exception 'PROJECT_ISSUE_COMPARE_FINDING_REQUIRES_FIX_REQUIRED' using errcode='P0001';
  end if;

  select * into v_existing
  from public.project_core_issues
  where project_id=p_project_id and source_type='COMPARE_FINDING' and source_id=p_finding_id and deleted_at is null
  limit 1;

  if v_existing.id is not null then
    select * into v_link
    from public.project_core_entity_links
    where project_id=p_project_id and source_type='issue' and source_id=v_existing.id
      and target_type='compare_finding' and target_id=p_finding_id and relation_type='CREATED_FROM'
    limit 1;
    return jsonb_build_object('issue',to_jsonb(v_existing),'link',to_jsonb(v_link),'created',false);
  end if;

  insert into public.project_core_issue_sequences(project_id,next_value,updated_at)
  values (p_project_id,2,now())
  on conflict(project_id) do update
    set next_value=public.project_core_issue_sequences.next_value+1,updated_at=now()
  returning next_value-1 into v_number;

  v_serial := 'HJ-'||lpad(v_number::text,5,'0');
  v_severity := case v_finding.priority
    when 'LOW' then 'LOW'
    when 'MEDIUM' then 'MEDIUM'
    when 'HIGH' then 'HIGH'
    when 'CRITICAL' then 'URGENT'
    else 'MEDIUM'
  end;

  insert into public.project_core_issues(
    id,project_id,serial,source_type,source_id,title,description,location,discipline,severity,status,
    responsible_user_id,responsible_name,due_at,note,metadata,version,
    created_by,created_by_name,updated_by,updated_by_name,created_at,updated_at
  ) values (
    'project-issue-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,v_serial,'COMPARE_FINDING',v_finding.id,
    'Terveltérés '||v_finding.zone_label||' – '||v_finding.page_number||'. oldal',
    left(coalesce(v_finding.note,''),12000),
    'Compare / '||v_finding.page_number||'. oldal / '||v_finding.zone_label,
    '',v_severity,'NEW',v_finding.assignee_user_id,v_finding.assignee_name,v_finding.due_at,
    'Compare Findings V2.1 konverzióból létrehozva.',
    jsonb_build_object(
      'compareFindingId',v_finding.id,'leftDocumentId',v_finding.left_document_id,'leftVersionId',v_finding.left_version_id,
      'rightDocumentId',v_finding.right_document_id,'rightVersionId',v_finding.right_version_id,'pageNumber',v_finding.page_number,
      'zoneLabel',v_finding.zone_label,'sourceZoneIndex',v_finding.source_zone_index,'findingPriority',v_finding.priority,
      'findingVersion',v_finding.version,'humanClassification','FIX_REQUIRED'
    ),1,p_actor_user_id,left(coalesce(p_actor_name,p_actor_user_id),240),p_actor_user_id,left(coalesce(p_actor_name,p_actor_user_id),240),now(),now()
  ) returning * into v_issue;

  insert into public.project_core_entity_links(id,project_id,source_type,source_id,target_type,target_id,relation_type,created_at,created_by)
  values ('project-link-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),p_project_id,'issue',v_issue.id,'compare_finding',v_finding.id,'CREATED_FROM',now(),p_actor_user_id)
  returning * into v_link;

  insert into public.project_core_audit_events(id,project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata)
  values ('project-audit-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),p_project_id,p_actor_user_id,'PROJECT_ISSUE_CREATED_FROM_COMPARE_FINDING','issue',v_issue.id,
    'Hibajegy létrehozva Compare Finding alapján: '||v_issue.serial,
    jsonb_build_object('issueId',v_issue.id,'serial',v_issue.serial,'compareFindingId',v_finding.id,'severity',v_issue.severity,'status',v_issue.status));

  insert into public.project_core_audit_events(id,project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata)
  values ('project-audit-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),p_project_id,p_actor_user_id,'DRIVE_COMPARE_FINDING_CONVERTED_TO_ISSUE','compare_finding',v_finding.id,
    'Compare Finding hibajegyhez kapcsolva: '||v_issue.serial,
    jsonb_build_object('findingId',v_finding.id,'issueId',v_issue.id,'serial',v_issue.serial));

  insert into public.drive_core_change_events(id,project_id,event_type,entity_type,entity_id,payload,actor_user_id)
  values ('drive-change-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),p_project_id,'COMPARE_FINDING_ISSUE_CREATED','compare_finding',v_finding.id,
    jsonb_build_object('findingId',v_finding.id,'issueId',v_issue.id,'serial',v_issue.serial,'findingVersion',v_finding.version),p_actor_user_id);

  return jsonb_build_object('issue',to_jsonb(v_issue),'link',to_jsonb(v_link),'created',true);
exception
  when unique_violation then
    select * into v_existing from public.project_core_issues
      where project_id=p_project_id and source_type='COMPARE_FINDING' and source_id=p_finding_id and deleted_at is null limit 1;
    if v_existing.id is not null then
      select * into v_link from public.project_core_entity_links
        where project_id=p_project_id and source_type='issue' and source_id=v_existing.id
          and target_type='compare_finding' and target_id=p_finding_id and relation_type='CREATED_FROM' limit 1;
      return jsonb_build_object('issue',to_jsonb(v_existing),'link',to_jsonb(v_link),'created',false);
    end if;
    raise;
end;
$$;

revoke all on function public.project_issue_create_from_compare_finding_atomic(text,text,text,text) from public,anon,authenticated;
grant execute on function public.project_issue_create_from_compare_finding_atomic(text,text,text,text) to service_role;

insert into public.project_issue_schema_meta(component,schema_version,migration_count,bootstrap_id,updated_at)
values ('project-issue-core','0.1.0',1,'project-issue-core-v010-20260815',now())
on conflict(component) do update set schema_version=excluded.schema_version,migration_count=excluded.migration_count,bootstrap_id=excluded.bootstrap_id,updated_at=now();

commit;
