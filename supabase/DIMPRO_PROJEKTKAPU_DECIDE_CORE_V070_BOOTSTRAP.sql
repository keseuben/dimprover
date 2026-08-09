begin;

do $$
begin
  if to_regclass('public.project_core_projects') is null
    or to_regclass('public.project_core_audit_events') is null then
    raise exception 'PROJECT_CORE_V020_REQUIRED' using errcode = 'P0001';
  end if;
  if to_regclass('public.project_calendar_events') is null
    or to_regclass('public.project_calendar_schema_meta') is null then
    raise exception 'PROJECT_CALENDAR_V050_REQUIRED' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.project_calendar_schema_meta
    where component = 'project-calendar-core' and schema_version = '0.5.0'
  ) then
    raise exception 'PROJECT_CALENDAR_V050_REQUIRED' using errcode = 'P0001';
  end if;
end;
$$;

create table if not exists public.decide_core_schema_meta (
  component text primary key,
  schema_version text not null,
  migration_count integer not null default 0,
  bootstrap_id text not null,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.decide_core_sequences (
  project_id text primary key references public.project_core_projects(id) on delete cascade,
  next_number integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint decide_sequence_positive check (next_number >= 1)
);

create table if not exists public.decide_core_requests (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  code text not null,
  request_type text not null default 'TECHNICAL_DECISION',
  title text not null,
  description text not null default '',
  status text not null default 'PENDING',
  priority text not null default 'MEDIUM',
  requester_user_id text not null,
  requester_name text not null,
  owner_user_id text null,
  owner_name text not null default '',
  due_at timestamptz null,
  cost_impact_minor bigint null,
  currency text not null default 'HUF',
  schedule_impact_days integer null,
  related_document_ids text[] not null default '{}'::text[],
  dialog_thread_id text null,
  calendar_event_id text null references public.project_calendar_events(id) on delete set null,
  current_stage integer not null default 1,
  stage_count integer not null default 1,
  version integer not null default 1,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz null,
  resolved_at timestamptz null,
  constraint decide_request_code_check check (length(btrim(code)) between 8 and 40),
  constraint decide_request_type_check check (request_type in ('PLAN_APPROVAL','PRODUCT_SUBSTITUTION','COST_IMPACT','SCHEDULE_IMPACT','TECHNICAL_DECISION')),
  constraint decide_request_title_check check (length(btrim(title)) between 1 and 240),
  constraint decide_request_description_check check (length(description) <= 6000),
  constraint decide_request_status_check check (status in ('DRAFT','PENDING','APPROVED','REJECTED','CHANGES_REQUESTED','CANCELLED')),
  constraint decide_request_priority_check check (priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
  constraint decide_request_requester_name_check check (length(btrim(requester_name)) between 1 and 240),
  constraint decide_request_owner_name_check check (length(owner_name) <= 240),
  constraint decide_request_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint decide_request_document_limit check (cardinality(related_document_ids) <= 50),
  constraint decide_request_stage_check check (current_stage >= 1 and stage_count >= 1 and current_stage <= stage_count),
  constraint decide_request_version_check check (version >= 1),
  constraint decide_request_project_code_unique unique (project_id, code)
);

create table if not exists public.decide_core_approvers (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  request_id text not null references public.decide_core_requests(id) on delete cascade,
  stage_number integer not null,
  stage_mode text not null default 'ALL',
  approver_user_id text not null,
  approver_name text not null,
  approver_role text not null default '',
  status text not null default 'WAITING',
  response_comment text not null default '',
  responded_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint decide_approver_stage_positive check (stage_number >= 1 and stage_number <= 20),
  constraint decide_approver_mode_check check (stage_mode in ('ALL','ANY')),
  constraint decide_approver_identity_check check (length(btrim(approver_user_id)) between 1 and 180),
  constraint decide_approver_name_check check (length(btrim(approver_name)) between 1 and 240),
  constraint decide_approver_status_check check (status in ('WAITING','PENDING','APPROVED','REJECTED','CHANGES_REQUESTED','SKIPPED')),
  constraint decide_approver_comment_check check (length(response_comment) <= 3000),
  constraint decide_approver_stage_user_unique unique (request_id, stage_number, approver_user_id)
);

create table if not exists public.decide_core_notes (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  request_id text not null references public.decide_core_requests(id) on delete cascade,
  note_type text not null default 'COMMENT',
  body text not null,
  author_user_id text not null,
  author_name text not null,
  created_at timestamptz not null default now(),
  constraint decide_note_type_check check (note_type in ('COMMENT','STATUS_NOTE')),
  constraint decide_note_body_check check (length(btrim(body)) between 1 and 6000),
  constraint decide_note_author_check check (length(btrim(author_name)) between 1 and 240)
);

create index if not exists decide_requests_project_updated_idx
  on public.decide_core_requests (project_id, updated_at desc);
create index if not exists decide_requests_project_status_idx
  on public.decide_core_requests (project_id, status, priority, due_at);
create index if not exists decide_approvers_request_stage_idx
  on public.decide_core_approvers (project_id, request_id, stage_number, status);
create index if not exists decide_approvers_user_pending_idx
  on public.decide_core_approvers (project_id, approver_user_id, status, stage_number)
  where status = 'PENDING';
create index if not exists decide_notes_request_created_idx
  on public.decide_core_notes (project_id, request_id, created_at);

alter table public.decide_core_schema_meta enable row level security;
alter table public.decide_core_sequences enable row level security;
alter table public.decide_core_requests enable row level security;
alter table public.decide_core_approvers enable row level security;
alter table public.decide_core_notes enable row level security;

revoke all on table public.decide_core_schema_meta from public, anon, authenticated;
revoke all on table public.decide_core_sequences from public, anon, authenticated;
revoke all on table public.decide_core_requests from public, anon, authenticated;
revoke all on table public.decide_core_approvers from public, anon, authenticated;
revoke all on table public.decide_core_notes from public, anon, authenticated;
grant select, insert, update, delete on table public.decide_core_schema_meta to service_role;
grant select, insert, update, delete on table public.decide_core_sequences to service_role;
grant select, insert, update, delete on table public.decide_core_requests to service_role;
grant select, insert, update, delete on table public.decide_core_approvers to service_role;
grant select, insert, update, delete on table public.decide_core_notes to service_role;

alter table public.project_core_audit_events drop constraint if exists project_core_audit_entity_type_check;
alter table public.project_core_audit_events add constraint project_core_audit_entity_type_check
  check (entity_type in ('project','membership','lifecycle','folder','document','document_version','sync','calendar_event','dialog_thread','dialog_message','decide_request','decide_approver','decide_note'));

create or replace function public.decide_core_create_request_atomic(
  p_project_id text,
  p_request jsonb,
  p_approvers jsonb,
  p_initial_note jsonb,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
  v_code text;
  v_request public.decide_core_requests;
  v_note public.decide_core_notes;
  v_calendar public.project_calendar_events;
  v_calendar_id text;
  v_due_at timestamptz;
  v_stage_count integer;
  v_stage_numbers integer[];
  v_approver jsonb;
  v_approvers jsonb;
begin
  if not exists (
    select 1 from public.project_core_projects
    where id = p_project_id and status <> 'DELETED'
  ) then
    raise exception 'PROJECT_CORE_PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_approvers is null or jsonb_typeof(p_approvers) <> 'array' or jsonb_array_length(p_approvers) = 0 then
    raise exception 'DECIDE_APPROVERS_REQUIRED' using errcode = 'P0001';
  end if;

  select array_agg(distinct (item->>'stage_number')::integer order by (item->>'stage_number')::integer),
         max((item->>'stage_number')::integer)
  into v_stage_numbers, v_stage_count
  from jsonb_array_elements(p_approvers) item;

  if v_stage_count is null or v_stage_numbers <> array(select generate_series(1, v_stage_count)) then
    raise exception 'DECIDE_STAGE_SEQUENCE_INVALID' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from (
      select (item->>'stage_number')::integer as stage_number,
             count(distinct coalesce(item->>'stage_mode','ALL')) as mode_count
      from jsonb_array_elements(p_approvers) item
      group by (item->>'stage_number')::integer
    ) modes
    where mode_count <> 1
  ) then
    raise exception 'DECIDE_STAGE_MODE_MISMATCH' using errcode = 'P0001';
  end if;

  insert into public.decide_core_sequences (project_id, next_number, updated_at)
  values (p_project_id, 2, now())
  on conflict (project_id) do update
    set next_number = public.decide_core_sequences.next_number + 1,
        updated_at = now()
  returning next_number - 1 into v_number;

  v_code := 'DEC-' || extract(year from now())::integer::text || '-' || lpad(v_number::text,4,'0');
  v_due_at := nullif(p_request->>'due_at','')::timestamptz;

  insert into public.decide_core_requests (
    id, project_id, code, request_type, title, description, status, priority,
    requester_user_id, requester_name, owner_user_id, owner_name, due_at,
    cost_impact_minor, currency, schedule_impact_days, related_document_ids,
    dialog_thread_id, current_stage, stage_count, version, created_by, updated_by,
    created_at, updated_at, submitted_at, resolved_at
  ) values (
    p_request->>'id', p_project_id, v_code,
    coalesce(p_request->>'request_type','TECHNICAL_DECISION'),
    btrim(p_request->>'title'), coalesce(p_request->>'description',''), 'PENDING',
    coalesce(p_request->>'priority','MEDIUM'),
    p_request->>'requester_user_id', coalesce(nullif(btrim(p_request->>'requester_name'),''),p_actor_user_id),
    nullif(btrim(coalesce(p_request->>'owner_user_id','')),''), coalesce(p_request->>'owner_name',''),
    v_due_at, nullif(p_request->>'cost_impact_minor','')::bigint,
    coalesce(nullif(p_request->>'currency',''),'HUF'), nullif(p_request->>'schedule_impact_days','')::integer,
    coalesce(array(select jsonb_array_elements_text(coalesce(p_request->'related_document_ids','[]'::jsonb))),'{}'::text[]),
    nullif(btrim(coalesce(p_request->>'dialog_thread_id','')),''),
    1, v_stage_count, 1, p_actor_user_id, p_actor_user_id,
    coalesce(nullif(p_request->>'created_at','')::timestamptz,now()),
    coalesce(nullif(p_request->>'updated_at','')::timestamptz,now()),
    now(), null
  ) returning * into v_request;

  for v_approver in select * from jsonb_array_elements(p_approvers)
  loop
    insert into public.decide_core_approvers (
      id, project_id, request_id, stage_number, stage_mode,
      approver_user_id, approver_name, approver_role, status,
      response_comment, responded_at, created_at, updated_at
    ) values (
      v_approver->>'id', p_project_id, v_request.id,
      (v_approver->>'stage_number')::integer,
      coalesce(v_approver->>'stage_mode','ALL'),
      v_approver->>'approver_user_id', v_approver->>'approver_name',
      coalesce(v_approver->>'approver_role',''),
      case when (v_approver->>'stage_number')::integer = 1 then 'PENDING' else 'WAITING' end,
      '', null, now(), now()
    );
  end loop;

  if p_initial_note is not null and length(btrim(coalesce(p_initial_note->>'body',''))) > 0 then
    insert into public.decide_core_notes (
      id, project_id, request_id, note_type, body, author_user_id, author_name, created_at
    ) values (
      p_initial_note->>'id', p_project_id, v_request.id,
      coalesce(p_initial_note->>'note_type','COMMENT'), btrim(p_initial_note->>'body'),
      p_actor_user_id, coalesce(nullif(btrim(p_initial_note->>'author_name'),''),p_actor_user_id),
      coalesce(nullif(p_initial_note->>'created_at','')::timestamptz,now())
    ) returning * into v_note;
  end if;

  if v_due_at is not null then
    v_calendar_id := 'project-calendar-' || substr(replace(gen_random_uuid()::text,'-',''),1,18);
    insert into public.project_calendar_events (
      id, project_id, title, description, event_type, source_module, status, priority,
      starts_at, ends_at, all_day, location, owner_user_id, owner_name,
      source_entity_type, source_entity_id, version, created_by, updated_by,
      created_at, updated_at, completed_at
    ) values (
      v_calendar_id, p_project_id, '[' || v_request.code || '] ' || v_request.title,
      left(v_request.description,4000), 'DEADLINE', 'DECIDE', 'PLANNED', v_request.priority,
      v_due_at, v_due_at, false, '', v_request.owner_user_id, v_request.owner_name,
      'decide_request', v_request.id, 1, p_actor_user_id, p_actor_user_id,
      now(), now(), null
    ) returning * into v_calendar;

    update public.decide_core_requests
    set calendar_event_id = v_calendar.id
    where id = v_request.id
    returning * into v_request;

    insert into public.project_core_audit_events (
      id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
    ) values (
      'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
      p_project_id,p_actor_user_id,'PROJECT_CALENDAR_EVENT_CREATED','calendar_event',v_calendar.id,
      'DECIDE döntési határidő létrehozva: ' || v_request.code,
      jsonb_build_object('sourceModule','DECIDE','sourceEntityType','decide_request','sourceEntityId',v_request.id,'dueAt',v_due_at,'calendarSchema','0.5.0')
    );
  end if;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'DECIDE_REQUEST_SUBMITTED','decide_request',v_request.id,
    'DECIDE jóváhagyási kérelem benyújtva: ' || v_request.code || ' – ' || v_request.title,
    jsonb_build_object('code',v_request.code,'requestType',v_request.request_type,'priority',v_request.priority,'stageCount',v_request.stage_count,'dueAt',v_request.due_at,'decideSchema','0.7.0')
  );

  select coalesce(jsonb_agg(to_jsonb(a) order by a.stage_number,a.created_at),'[]'::jsonb)
  into v_approvers
  from public.decide_core_approvers a
  where a.request_id = v_request.id;

  return jsonb_build_object(
    'request',to_jsonb(v_request),
    'approvers',v_approvers,
    'note',case when v_note.id is null then null else to_jsonb(v_note) end
  );
exception
  when unique_violation then
    raise exception 'DECIDE_CODE_CONFLICT' using errcode = 'P0001';
end;
$$;

create or replace function public.decide_core_update_request_atomic(
  p_project_id text,
  p_request_id text,
  p_expected_version integer,
  p_patch jsonb,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.decide_core_requests;
  v_request public.decide_core_requests;
  v_calendar public.project_calendar_events;
  v_next_status text;
  v_next_due timestamptz;
  v_calendar_status text;
  v_calendar_id text;
begin
  select * into v_current
  from public.decide_core_requests
  where id = p_request_id and project_id = p_project_id
  for update;

  if v_current.id is null then
    raise exception 'DECIDE_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_current.version <> p_expected_version then
    raise exception 'DECIDE_REQUEST_VERSION_CONFLICT' using errcode = 'P0001';
  end if;
  if v_current.status in ('APPROVED','REJECTED','CHANGES_REQUESTED','CANCELLED') then
    raise exception 'DECIDE_REQUEST_TERMINAL' using errcode = 'P0001';
  end if;

  v_next_status := case when p_patch ? 'status' then p_patch->>'status' else v_current.status end;
  if v_next_status <> v_current.status and v_next_status <> 'CANCELLED' then
    raise exception 'DECIDE_INVALID_STATUS_TRANSITION' using errcode = 'P0001';
  end if;
  v_next_due := case when p_patch ? 'due_at' then nullif(p_patch->>'due_at','')::timestamptz else v_current.due_at end;

  update public.decide_core_requests set
    title = case when p_patch ? 'title' then btrim(p_patch->>'title') else title end,
    description = case when p_patch ? 'description' then coalesce(p_patch->>'description','') else description end,
    request_type = case when p_patch ? 'request_type' then p_patch->>'request_type' else request_type end,
    status = v_next_status,
    priority = case when p_patch ? 'priority' then p_patch->>'priority' else priority end,
    owner_user_id = case when p_patch ? 'owner_user_id' then nullif(btrim(coalesce(p_patch->>'owner_user_id','')),'') else owner_user_id end,
    owner_name = case when p_patch ? 'owner_name' then coalesce(p_patch->>'owner_name','') else owner_name end,
    due_at = v_next_due,
    cost_impact_minor = case when p_patch ? 'cost_impact_minor' then nullif(p_patch->>'cost_impact_minor','')::bigint else cost_impact_minor end,
    currency = case when p_patch ? 'currency' then p_patch->>'currency' else currency end,
    schedule_impact_days = case when p_patch ? 'schedule_impact_days' then nullif(p_patch->>'schedule_impact_days','')::integer else schedule_impact_days end,
    related_document_ids = case when p_patch ? 'related_document_ids' then coalesce(array(select jsonb_array_elements_text(p_patch->'related_document_ids')),'{}'::text[]) else related_document_ids end,
    dialog_thread_id = case when p_patch ? 'dialog_thread_id' then nullif(btrim(coalesce(p_patch->>'dialog_thread_id','')),'') else dialog_thread_id end,
    version = version + 1,
    updated_by = p_actor_user_id,
    updated_at = now(),
    resolved_at = case when v_next_status = 'CANCELLED' then now() else resolved_at end
  where id = p_request_id and project_id = p_project_id and version = p_expected_version
  returning * into v_request;

  if v_request.id is null then
    raise exception 'DECIDE_REQUEST_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  if v_request.status = 'CANCELLED' then
    update public.decide_core_approvers
    set status = 'SKIPPED', updated_at = now()
    where request_id = v_request.id and status in ('WAITING','PENDING');
  end if;

  v_calendar_status := case
    when v_request.status = 'CANCELLED' or v_request.due_at is null then 'CANCELLED'
    else 'PLANNED'
  end;

  if v_request.calendar_event_id is null and v_request.due_at is not null then
    v_calendar_id := 'project-calendar-' || substr(replace(gen_random_uuid()::text,'-',''),1,18);
    insert into public.project_calendar_events (
      id, project_id, title, description, event_type, source_module, status, priority,
      starts_at, ends_at, all_day, location, owner_user_id, owner_name,
      source_entity_type, source_entity_id, version, created_by, updated_by,
      created_at, updated_at, completed_at
    ) values (
      v_calendar_id,p_project_id,'[' || v_request.code || '] ' || v_request.title,left(v_request.description,4000),
      'DEADLINE','DECIDE',v_calendar_status,v_request.priority,v_request.due_at,v_request.due_at,false,'',
      v_request.owner_user_id,v_request.owner_name,'decide_request',v_request.id,1,p_actor_user_id,p_actor_user_id,
      now(),now(),null
    ) returning * into v_calendar;
    update public.decide_core_requests set calendar_event_id = v_calendar.id where id = v_request.id returning * into v_request;
  elsif v_request.calendar_event_id is not null then
    update public.project_calendar_events set
      title = '[' || v_request.code || '] ' || v_request.title,
      description = left(v_request.description,4000),
      status = v_calendar_status,
      priority = v_request.priority,
      starts_at = coalesce(v_request.due_at,starts_at),
      ends_at = coalesce(v_request.due_at,ends_at),
      owner_user_id = v_request.owner_user_id,
      owner_name = v_request.owner_name,
      version = version + 1,
      updated_by = p_actor_user_id,
      updated_at = now(),
      completed_at = null
    where id = v_request.calendar_event_id and project_id = p_project_id
    returning * into v_calendar;
  end if;

  if v_calendar.id is not null then
    insert into public.project_core_audit_events (
      id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
    ) values (
      'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
      p_project_id,p_actor_user_id,'PROJECT_CALENDAR_EVENT_UPDATED','calendar_event',v_calendar.id,
      'DECIDE határidő frissítve: ' || v_request.code,
      jsonb_build_object('sourceModule','DECIDE','sourceEntityId',v_request.id,'status',v_calendar.status,'dueAt',v_request.due_at,'calendarSchema','0.5.0')
    );
  end if;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,
    case when v_request.status = 'CANCELLED' then 'DECIDE_REQUEST_CANCELLED' else 'DECIDE_REQUEST_UPDATED' end,
    'decide_request',v_request.id,
    'DECIDE kérelem frissítve: ' || v_request.code || ' – ' || v_request.title,
    jsonb_build_object('previousVersion',v_current.version,'version',v_request.version,'previousStatus',v_current.status,'status',v_request.status,'decideSchema','0.7.0')
  );

  return to_jsonb(v_request);
end;
$$;

create or replace function public.decide_core_respond_atomic(
  p_project_id text,
  p_request_id text,
  p_approver_id text,
  p_response text,
  p_comment text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.decide_core_requests;
  v_approver public.decide_core_approvers;
  v_stage_mode text;
  v_next_stage integer;
  v_pending integer;
  v_approved integer;
  v_rejected integer;
  v_changes integer;
  v_stage_passed boolean := false;
  v_next_status text;
  v_calendar public.project_calendar_events;
  v_approvers jsonb;
begin
  if p_response not in ('APPROVED','REJECTED','CHANGES_REQUESTED') then
    raise exception 'DECIDE_INVALID_RESPONSE' using errcode = 'P0001';
  end if;

  select * into v_request
  from public.decide_core_requests
  where id = p_request_id and project_id = p_project_id
  for update;

  if v_request.id is null then
    raise exception 'DECIDE_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_request.status <> 'PENDING' then
    raise exception 'DECIDE_REQUEST_TERMINAL' using errcode = 'P0001';
  end if;

  select * into v_approver
  from public.decide_core_approvers
  where id = p_approver_id and request_id = p_request_id and project_id = p_project_id
  for update;

  if v_approver.id is null then
    raise exception 'DECIDE_APPROVER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_approver.approver_user_id <> p_actor_user_id then
    raise exception 'DECIDE_APPROVER_ACTOR_MISMATCH' using errcode = 'P0001';
  end if;
  if v_approver.stage_number <> v_request.current_stage or v_approver.status = 'WAITING' then
    raise exception 'DECIDE_APPROVER_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  if v_approver.status <> 'PENDING' then
    raise exception 'DECIDE_APPROVER_ALREADY_RESPONDED' using errcode = 'P0001';
  end if;

  update public.decide_core_approvers
  set status = p_response,
      response_comment = coalesce(p_comment,''),
      responded_at = now(),
      updated_at = now()
  where id = v_approver.id
  returning * into v_approver;

  v_stage_mode := v_approver.stage_mode;
  select
    count(*) filter (where status = 'PENDING'),
    count(*) filter (where status = 'APPROVED'),
    count(*) filter (where status = 'REJECTED'),
    count(*) filter (where status = 'CHANGES_REQUESTED')
  into v_pending, v_approved, v_rejected, v_changes
  from public.decide_core_approvers
  where request_id = p_request_id and stage_number = v_request.current_stage;

  if v_stage_mode = 'ANY' and v_approved > 0 then
    v_stage_passed := true;
    update public.decide_core_approvers
    set status = 'SKIPPED', updated_at = now()
    where request_id = p_request_id and stage_number = v_request.current_stage and status = 'PENDING';
  elsif v_stage_mode = 'ALL' and v_rejected > 0 then
    v_next_status := 'REJECTED';
  elsif v_stage_mode = 'ALL' and v_changes > 0 then
    v_next_status := 'CHANGES_REQUESTED';
  elsif v_stage_mode = 'ALL' and v_pending = 0 and v_approved > 0 then
    v_stage_passed := true;
  elsif v_stage_mode = 'ANY' and v_pending = 0 and v_approved = 0 then
    v_next_status := case when v_changes > 0 then 'CHANGES_REQUESTED' else 'REJECTED' end;
  end if;

  if v_next_status in ('REJECTED','CHANGES_REQUESTED') then
    update public.decide_core_approvers
    set status = 'SKIPPED', updated_at = now()
    where request_id = p_request_id and status in ('WAITING','PENDING');
    update public.decide_core_requests
    set status = v_next_status, version = version + 1,
        updated_by = p_actor_user_id, updated_at = now(), resolved_at = now()
    where id = p_request_id
    returning * into v_request;
  elsif v_stage_passed then
    select min(stage_number) into v_next_stage
    from public.decide_core_approvers
    where request_id = p_request_id and stage_number > v_request.current_stage;
    if v_next_stage is null then
      update public.decide_core_requests
      set status = 'APPROVED', version = version + 1,
          updated_by = p_actor_user_id, updated_at = now(), resolved_at = now()
      where id = p_request_id
      returning * into v_request;
    else
      update public.decide_core_approvers
      set status = 'PENDING', updated_at = now()
      where request_id = p_request_id and stage_number = v_next_stage and status = 'WAITING';
      update public.decide_core_requests
      set current_stage = v_next_stage, version = version + 1,
          updated_by = p_actor_user_id, updated_at = now()
      where id = p_request_id
      returning * into v_request;
    end if;
  else
    update public.decide_core_requests
    set version = version + 1, updated_by = p_actor_user_id, updated_at = now()
    where id = p_request_id
    returning * into v_request;
  end if;

  if v_request.calendar_event_id is not null then
    update public.project_calendar_events set
      status = case
        when v_request.status = 'APPROVED' then 'COMPLETED'
        when v_request.status in ('REJECTED','CHANGES_REQUESTED','CANCELLED') then 'CANCELLED'
        else 'IN_PROGRESS'
      end,
      version = version + 1,
      updated_by = p_actor_user_id,
      updated_at = now(),
      completed_at = case when v_request.status = 'APPROVED' then coalesce(completed_at,now()) else null end
    where id = v_request.calendar_event_id and project_id = p_project_id
    returning * into v_calendar;
  end if;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'DECIDE_APPROVER_RESPONDED','decide_approver',v_approver.id,
    'DECIDE jóváhagyói válasz: ' || v_request.code || ' – ' || v_approver.approver_name,
    jsonb_build_object('requestId',v_request.id,'requestCode',v_request.code,'stageNumber',v_approver.stage_number,'stageMode',v_approver.stage_mode,'response',p_response,'requestStatus',v_request.status,'decideSchema','0.7.0')
  );

  if v_calendar.id is not null then
    insert into public.project_core_audit_events (
      id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
    ) values (
      'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
      p_project_id,p_actor_user_id,'PROJECT_CALENDAR_EVENT_UPDATED','calendar_event',v_calendar.id,
      'DECIDE döntési határidő frissítve: ' || v_request.code,
      jsonb_build_object('sourceModule','DECIDE','sourceEntityId',v_request.id,'status',v_calendar.status,'requestStatus',v_request.status,'calendarSchema','0.5.0')
    );
  end if;

  if v_request.status in ('APPROVED','REJECTED','CHANGES_REQUESTED') then
    insert into public.project_core_audit_events (
      id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
    ) values (
      'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
      p_project_id,p_actor_user_id,
      case when v_request.status = 'APPROVED' then 'DECIDE_REQUEST_APPROVED'
           when v_request.status = 'REJECTED' then 'DECIDE_REQUEST_REJECTED'
           else 'DECIDE_REQUEST_CHANGES_REQUESTED' end,
      'decide_request',v_request.id,
      'DECIDE kérelem lezárva: ' || v_request.code || ' – ' || v_request.status,
      jsonb_build_object('status',v_request.status,'currentStage',v_request.current_stage,'version',v_request.version,'decideSchema','0.7.0')
    );
  elsif v_stage_passed then
    insert into public.project_core_audit_events (
      id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
    ) values (
      'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
      p_project_id,p_actor_user_id,'DECIDE_STAGE_COMPLETED','decide_request',v_request.id,
      'DECIDE jóváhagyási szakasz teljesítve: ' || v_request.code,
      jsonb_build_object('completedStage',v_approver.stage_number,'nextStage',v_request.current_stage,'stageMode',v_approver.stage_mode,'decideSchema','0.7.0')
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.stage_number,a.created_at),'[]'::jsonb)
  into v_approvers
  from public.decide_core_approvers a
  where a.request_id = p_request_id;

  return jsonb_build_object(
    'request',to_jsonb(v_request),
    'approvers',v_approvers,
    'responded_approver',to_jsonb(v_approver)
  );
end;
$$;

create or replace function public.decide_core_add_note_atomic(
  p_project_id text,
  p_request_id text,
  p_note jsonb,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.decide_core_requests;
  v_note public.decide_core_notes;
begin
  select * into v_request
  from public.decide_core_requests
  where id = p_request_id and project_id = p_project_id
  for update;

  if v_request.id is null then
    raise exception 'DECIDE_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.decide_core_notes (
    id, project_id, request_id, note_type, body, author_user_id, author_name, created_at
  ) values (
    p_note->>'id',p_project_id,p_request_id,coalesce(p_note->>'note_type','COMMENT'),
    btrim(p_note->>'body'),p_actor_user_id,coalesce(nullif(btrim(p_note->>'author_name'),''),p_actor_user_id),
    coalesce(nullif(p_note->>'created_at','')::timestamptz,now())
  ) returning * into v_note;

  update public.decide_core_requests
  set updated_by = p_actor_user_id, updated_at = now()
  where id = p_request_id
  returning * into v_request;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'DECIDE_NOTE_CREATED','decide_note',v_note.id,
    'DECIDE megjegyzés rögzítve: ' || v_request.code,
    jsonb_build_object('requestId',v_request.id,'requestCode',v_request.code,'noteType',v_note.note_type,'decideSchema','0.7.0')
  );

  return jsonb_build_object('request',to_jsonb(v_request),'note',to_jsonb(v_note));
end;
$$;

revoke all on function public.decide_core_create_request_atomic(text,jsonb,jsonb,jsonb,text) from public, anon, authenticated;
revoke all on function public.decide_core_update_request_atomic(text,text,integer,jsonb,text) from public, anon, authenticated;
revoke all on function public.decide_core_respond_atomic(text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.decide_core_add_note_atomic(text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.decide_core_create_request_atomic(text,jsonb,jsonb,jsonb,text) to service_role;
grant execute on function public.decide_core_update_request_atomic(text,text,integer,jsonb,text) to service_role;
grant execute on function public.decide_core_respond_atomic(text,text,text,text,text,text) to service_role;
grant execute on function public.decide_core_add_note_atomic(text,text,jsonb,text) to service_role;

insert into public.decide_core_schema_meta (
  component, schema_version, migration_count, bootstrap_id, applied_at, updated_at
) values (
  'decide-core','0.7.0',1,'decide-core-v070-20260802',now(),now()
)
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = excluded.migration_count,
  bootstrap_id = excluded.bootstrap_id,
  applied_at = excluded.applied_at,
  updated_at = now();

commit;
