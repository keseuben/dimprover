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

create table if not exists public.diary_core_schema_meta (
  component text primary key,
  schema_version text not null,
  migration_count integer not null default 0,
  bootstrap_id text not null,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.diary_core_sequences (
  project_id text not null references public.project_core_projects(id) on delete cascade,
  diary_year integer not null,
  next_number integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (project_id, diary_year),
  constraint diary_sequence_year_check check (diary_year between 2000 and 2200),
  constraint diary_sequence_positive check (next_number >= 1)
);

create table if not exists public.diary_core_entries (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  code text not null,
  diary_date date not null,
  title text not null,
  status text not null default 'OPEN',
  weather_condition text not null default 'OTHER',
  weather_note text not null default '',
  temperature_min_c numeric(5,1) null,
  temperature_max_c numeric(5,1) null,
  workforce_total integer not null default 0,
  workforce_breakdown text[] not null default '{}'::text[],
  work_summary text not null default '',
  blocker_summary text not null default '',
  safety_summary text not null default '',
  inspection_summary text not null default '',
  related_document_ids text[] not null default '{}'::text[],
  next_event_number integer not null default 1,
  version integer not null default 1,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz null,
  closing_note text not null default '',
  constraint diary_entry_code_check check (length(btrim(code)) between 8 and 40),
  constraint diary_entry_title_check check (length(btrim(title)) between 1 and 240),
  constraint diary_entry_status_check check (status in ('DRAFT','OPEN','CLOSED','CANCELLED')),
  constraint diary_entry_weather_check check (weather_condition in ('CLEAR','PARTLY_CLOUDY','CLOUDY','RAIN','SNOW','STORM','FOG','OTHER')),
  constraint diary_entry_weather_note_check check (length(weather_note) <= 1000),
  constraint diary_entry_temperature_check check (
    (temperature_min_c is null or temperature_min_c between -60 and 70)
    and (temperature_max_c is null or temperature_max_c between -60 and 70)
    and (temperature_min_c is null or temperature_max_c is null or temperature_min_c <= temperature_max_c)
  ),
  constraint diary_entry_workforce_check check (workforce_total between 0 and 100000),
  constraint diary_entry_workforce_breakdown_limit check (cardinality(workforce_breakdown) <= 100),
  constraint diary_entry_work_summary_check check (length(work_summary) <= 6000),
  constraint diary_entry_blocker_summary_check check (length(blocker_summary) <= 4000),
  constraint diary_entry_safety_summary_check check (length(safety_summary) <= 4000),
  constraint diary_entry_inspection_summary_check check (length(inspection_summary) <= 4000),
  constraint diary_entry_document_limit check (cardinality(related_document_ids) <= 100),
  constraint diary_entry_next_event_check check (next_event_number >= 1),
  constraint diary_entry_version_check check (version >= 1),
  constraint diary_entry_closing_note_check check (length(closing_note) <= 3000),
  constraint diary_entry_project_date_unique unique (project_id, diary_date),
  constraint diary_entry_project_code_unique unique (project_id, code)
);

create table if not exists public.diary_core_events (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  entry_id text not null references public.diary_core_entries(id) on delete cascade,
  sequence_number integer not null,
  code text not null,
  event_type text not null default 'NOTE',
  title text not null,
  description text not null default '',
  status text not null default 'OPEN',
  severity text not null default 'INFO',
  occurred_at timestamptz not null default now(),
  responsible_user_id text null,
  responsible_name text not null default '',
  due_at timestamptz null,
  calendar_event_id text null references public.project_calendar_events(id) on delete set null,
  related_document_ids text[] not null default '{}'::text[],
  dialog_thread_id text null,
  decide_request_id text null,
  resolution text not null default '',
  version integer not null default 1,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz null,
  constraint diary_event_sequence_check check (sequence_number >= 1),
  constraint diary_event_code_check check (length(btrim(code)) between 10 and 60),
  constraint diary_event_type_check check (event_type in ('WORK_PROGRESS','OBSTACLE','INCIDENT','INSPECTION','DELIVERY','SAFETY','WEATHER','NOTE')),
  constraint diary_event_title_check check (length(btrim(title)) between 1 and 240),
  constraint diary_event_description_check check (length(description) <= 6000),
  constraint diary_event_status_check check (status in ('OPEN','RESOLVED','CANCELLED')),
  constraint diary_event_severity_check check (severity in ('INFO','MEDIUM','HIGH','CRITICAL')),
  constraint diary_event_responsible_name_check check (length(responsible_name) <= 240),
  constraint diary_event_document_limit check (cardinality(related_document_ids) <= 100),
  constraint diary_event_resolution_check check (length(resolution) <= 4000),
  constraint diary_event_version_check check (version >= 1),
  constraint diary_event_entry_sequence_unique unique (entry_id, sequence_number),
  constraint diary_event_project_code_unique unique (project_id, code)
);

create index if not exists diary_entries_project_date_idx
  on public.diary_core_entries (project_id, diary_date desc);
create index if not exists diary_entries_project_status_idx
  on public.diary_core_entries (project_id, status, diary_date desc);
create index if not exists diary_events_entry_occurred_idx
  on public.diary_core_events (project_id, entry_id, occurred_at, sequence_number);
create index if not exists diary_events_project_status_idx
  on public.diary_core_events (project_id, status, severity, due_at);
create index if not exists diary_events_responsible_idx
  on public.diary_core_events (project_id, responsible_user_id, status)
  where responsible_user_id is not null;

alter table public.diary_core_schema_meta enable row level security;
alter table public.diary_core_sequences enable row level security;
alter table public.diary_core_entries enable row level security;
alter table public.diary_core_events enable row level security;

revoke all on table public.diary_core_schema_meta from public, anon, authenticated;
revoke all on table public.diary_core_sequences from public, anon, authenticated;
revoke all on table public.diary_core_entries from public, anon, authenticated;
revoke all on table public.diary_core_events from public, anon, authenticated;
grant select, insert, update, delete on table public.diary_core_schema_meta to service_role;
grant select, insert, update, delete on table public.diary_core_sequences to service_role;
grant select, insert, update, delete on table public.diary_core_entries to service_role;
grant select, insert, update, delete on table public.diary_core_events to service_role;

alter table public.project_core_audit_events drop constraint if exists project_core_audit_entity_type_check;
alter table public.project_core_audit_events add constraint project_core_audit_entity_type_check
  check (entity_type in (
    'project','membership','lifecycle','folder','document','document_version','sync',
    'calendar_event','dialog_thread','dialog_message','decide_request','decide_approver','decide_note',
    'diary_entry','diary_event'
  ));

create or replace function public.diary_core_create_entry_atomic(
  p_project_id text,
  p_entry jsonb,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
  v_year integer;
  v_code text;
  v_date date;
  v_entry public.diary_core_entries;
begin
  if not exists (
    select 1 from public.project_core_projects
    where id = p_project_id and status <> 'DELETED'
  ) then
    raise exception 'PROJECT_CORE_PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_date := (p_entry->>'diary_date')::date;
  v_year := extract(year from v_date)::integer;

  if exists (
    select 1 from public.diary_core_entries
    where project_id = p_project_id and diary_date = v_date
  ) then
    raise exception 'DIARY_ENTRY_DATE_CONFLICT' using errcode = 'P0001';
  end if;

  insert into public.diary_core_sequences (project_id, diary_year, next_number, updated_at)
  values (p_project_id, v_year, 2, now())
  on conflict (project_id, diary_year) do update
    set next_number = public.diary_core_sequences.next_number + 1,
        updated_at = now()
  returning next_number - 1 into v_number;

  v_code := 'NAP-' || v_year::text || '-' || lpad(v_number::text,4,'0');

  insert into public.diary_core_entries (
    id, project_id, code, diary_date, title, status,
    weather_condition, weather_note, temperature_min_c, temperature_max_c,
    workforce_total, workforce_breakdown, work_summary, blocker_summary,
    safety_summary, inspection_summary, related_document_ids,
    next_event_number, version, created_by, updated_by, created_at, updated_at,
    closed_at, closing_note
  ) values (
    p_entry->>'id', p_project_id, v_code, v_date,
    btrim(p_entry->>'title'), coalesce(p_entry->>'status','OPEN'),
    coalesce(p_entry->>'weather_condition','OTHER'), coalesce(p_entry->>'weather_note',''),
    nullif(p_entry->>'temperature_min_c','')::numeric,
    nullif(p_entry->>'temperature_max_c','')::numeric,
    coalesce(nullif(p_entry->>'workforce_total','')::integer,0),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_entry->'workforce_breakdown','[]'::jsonb))),'{}'::text[]),
    coalesce(p_entry->>'work_summary',''), coalesce(p_entry->>'blocker_summary',''),
    coalesce(p_entry->>'safety_summary',''), coalesce(p_entry->>'inspection_summary',''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_entry->'related_document_ids','[]'::jsonb))),'{}'::text[]),
    1, 1, p_actor_user_id, p_actor_user_id,
    coalesce(nullif(p_entry->>'created_at','')::timestamptz,now()),
    coalesce(nullif(p_entry->>'updated_at','')::timestamptz,now()),
    null, ''
  ) returning * into v_entry;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'DIARY_ENTRY_CREATED','diary_entry',v_entry.id,
    'DIARY napi projektnapló létrehozva: ' || v_entry.code || ' – ' || v_entry.diary_date::text,
    jsonb_build_object('code',v_entry.code,'diaryDate',v_entry.diary_date,'status',v_entry.status,'workforceTotal',v_entry.workforce_total,'diarySchema','0.8.0')
  );

  return to_jsonb(v_entry);
exception
  when unique_violation then
    raise exception 'DIARY_CODE_CONFLICT' using errcode = 'P0001';
end;
$$;

create or replace function public.diary_core_update_entry_atomic(
  p_project_id text,
  p_entry_id text,
  p_expected_version integer,
  p_patch jsonb,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.diary_core_entries;
  v_entry public.diary_core_entries;
  v_next_status text;
begin
  select * into v_current
  from public.diary_core_entries
  where id = p_entry_id and project_id = p_project_id
  for update;

  if v_current.id is null then
    raise exception 'DIARY_ENTRY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_current.version <> p_expected_version then
    raise exception 'DIARY_ENTRY_VERSION_CONFLICT' using errcode = 'P0001';
  end if;
  if v_current.status in ('CLOSED','CANCELLED') then
    raise exception 'DIARY_ENTRY_TERMINAL' using errcode = 'P0001';
  end if;

  v_next_status := case when p_patch ? 'status' then p_patch->>'status' else v_current.status end;
  if v_next_status not in ('DRAFT','OPEN','CANCELLED') then
    raise exception 'DIARY_INVALID_STATUS_TRANSITION' using errcode = 'P0001';
  end if;

  update public.diary_core_entries set
    title = case when p_patch ? 'title' then btrim(p_patch->>'title') else title end,
    status = v_next_status,
    weather_condition = case when p_patch ? 'weather_condition' then p_patch->>'weather_condition' else weather_condition end,
    weather_note = case when p_patch ? 'weather_note' then coalesce(p_patch->>'weather_note','') else weather_note end,
    temperature_min_c = case when p_patch ? 'temperature_min_c' then nullif(p_patch->>'temperature_min_c','')::numeric else temperature_min_c end,
    temperature_max_c = case when p_patch ? 'temperature_max_c' then nullif(p_patch->>'temperature_max_c','')::numeric else temperature_max_c end,
    workforce_total = case when p_patch ? 'workforce_total' then coalesce(nullif(p_patch->>'workforce_total','')::integer,0) else workforce_total end,
    workforce_breakdown = case when p_patch ? 'workforce_breakdown' then coalesce(array(select jsonb_array_elements_text(p_patch->'workforce_breakdown')),'{}'::text[]) else workforce_breakdown end,
    work_summary = case when p_patch ? 'work_summary' then coalesce(p_patch->>'work_summary','') else work_summary end,
    blocker_summary = case when p_patch ? 'blocker_summary' then coalesce(p_patch->>'blocker_summary','') else blocker_summary end,
    safety_summary = case when p_patch ? 'safety_summary' then coalesce(p_patch->>'safety_summary','') else safety_summary end,
    inspection_summary = case when p_patch ? 'inspection_summary' then coalesce(p_patch->>'inspection_summary','') else inspection_summary end,
    related_document_ids = case when p_patch ? 'related_document_ids' then coalesce(array(select jsonb_array_elements_text(p_patch->'related_document_ids')),'{}'::text[]) else related_document_ids end,
    version = version + 1,
    updated_by = p_actor_user_id,
    updated_at = now(),
    closed_at = case when v_next_status = 'CANCELLED' then now() else closed_at end
  where id = p_entry_id and project_id = p_project_id and version = p_expected_version
  returning * into v_entry;

  if v_entry.id is null then
    raise exception 'DIARY_ENTRY_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  if v_entry.status = 'CANCELLED' then
    update public.diary_core_events
    set status = 'CANCELLED', resolution = case when resolution = '' then 'A napi naplóbejegyzés visszavonva.' else resolution end,
        version = version + 1, updated_by = p_actor_user_id, updated_at = now(), resolved_at = now()
    where entry_id = v_entry.id and status = 'OPEN';

    update public.project_calendar_events c
    set status = 'CANCELLED', version = version + 1, updated_by = p_actor_user_id,
        updated_at = now(), completed_at = null
    where c.project_id = p_project_id
      and c.id in (
        select e.calendar_event_id from public.diary_core_events e
        where e.entry_id = v_entry.id and e.calendar_event_id is not null
      );
  end if;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,
    case when v_entry.status = 'CANCELLED' then 'DIARY_ENTRY_CANCELLED' else 'DIARY_ENTRY_UPDATED' end,
    'diary_entry',v_entry.id,
    'DIARY napi projektnapló frissítve: ' || v_entry.code,
    jsonb_build_object('previousVersion',v_current.version,'version',v_entry.version,'previousStatus',v_current.status,'status',v_entry.status,'diarySchema','0.8.0')
  );

  return to_jsonb(v_entry);
end;
$$;

create or replace function public.diary_core_close_entry_atomic(
  p_project_id text,
  p_entry_id text,
  p_expected_version integer,
  p_closing_note text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.diary_core_entries;
  v_entry public.diary_core_entries;
begin
  select * into v_current
  from public.diary_core_entries
  where id = p_entry_id and project_id = p_project_id
  for update;

  if v_current.id is null then
    raise exception 'DIARY_ENTRY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_current.version <> p_expected_version then
    raise exception 'DIARY_ENTRY_VERSION_CONFLICT' using errcode = 'P0001';
  end if;
  if v_current.status in ('CLOSED','CANCELLED') then
    raise exception 'DIARY_ENTRY_TERMINAL' using errcode = 'P0001';
  end if;

  update public.diary_core_entries set
    status = 'CLOSED',
    closing_note = left(coalesce(p_closing_note,''),3000),
    version = version + 1,
    updated_by = p_actor_user_id,
    updated_at = now(),
    closed_at = now()
  where id = p_entry_id and project_id = p_project_id and version = p_expected_version
  returning * into v_entry;

  if v_entry.id is null then
    raise exception 'DIARY_ENTRY_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'DIARY_ENTRY_CLOSED','diary_entry',v_entry.id,
    'DIARY napi projektnapló lezárva: ' || v_entry.code,
    jsonb_build_object('previousVersion',v_current.version,'version',v_entry.version,'openEventCount',(
      select count(*) from public.diary_core_events where entry_id = v_entry.id and status = 'OPEN'
    ),'diarySchema','0.8.0')
  );

  return to_jsonb(v_entry);
end;
$$;

create or replace function public.diary_core_add_event_atomic(
  p_project_id text,
  p_entry_id text,
  p_event jsonb,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.diary_core_entries;
  v_event public.diary_core_events;
  v_calendar public.project_calendar_events;
  v_calendar_id text;
  v_sequence integer;
  v_code text;
  v_due_at timestamptz;
  v_calendar_type text;
begin
  select * into v_entry
  from public.diary_core_entries
  where id = p_entry_id and project_id = p_project_id
  for update;

  if v_entry.id is null then
    raise exception 'DIARY_ENTRY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_entry.status in ('CLOSED','CANCELLED') then
    raise exception 'DIARY_EVENT_ENTRY_CLOSED' using errcode = 'P0001';
  end if;

  v_sequence := v_entry.next_event_number;
  v_code := v_entry.code || '/E-' || lpad(v_sequence::text,3,'0');
  v_due_at := nullif(p_event->>'due_at','')::timestamptz;

  update public.diary_core_entries
  set next_event_number = next_event_number + 1,
      version = version + 1,
      updated_by = p_actor_user_id,
      updated_at = now()
  where id = v_entry.id
  returning * into v_entry;

  insert into public.diary_core_events (
    id, project_id, entry_id, sequence_number, code, event_type, title, description,
    status, severity, occurred_at, responsible_user_id, responsible_name, due_at,
    related_document_ids, dialog_thread_id, decide_request_id, resolution,
    version, created_by, updated_by, created_at, updated_at, resolved_at
  ) values (
    p_event->>'id', p_project_id, p_entry_id, v_sequence, v_code,
    coalesce(p_event->>'event_type','NOTE'), btrim(p_event->>'title'), coalesce(p_event->>'description',''),
    'OPEN', coalesce(p_event->>'severity','INFO'),
    coalesce(nullif(p_event->>'occurred_at','')::timestamptz,now()),
    nullif(btrim(coalesce(p_event->>'responsible_user_id','')),''), coalesce(p_event->>'responsible_name',''),
    v_due_at,
    coalesce(array(select jsonb_array_elements_text(coalesce(p_event->'related_document_ids','[]'::jsonb))),'{}'::text[]),
    nullif(btrim(coalesce(p_event->>'dialog_thread_id','')),''),
    nullif(btrim(coalesce(p_event->>'decide_request_id','')),''),
    '', 1, p_actor_user_id, p_actor_user_id,
    coalesce(nullif(p_event->>'created_at','')::timestamptz,now()),
    coalesce(nullif(p_event->>'updated_at','')::timestamptz,now()),
    null
  ) returning * into v_event;

  if v_due_at is not null then
    v_calendar_id := 'project-calendar-' || substr(replace(gen_random_uuid()::text,'-',''),1,18);
    v_calendar_type := case
      when v_event.event_type = 'INSPECTION' then 'INSPECTION'
      when v_event.event_type in ('OBSTACLE','INCIDENT','SAFETY') then 'DEADLINE'
      else 'TASK'
    end;

    insert into public.project_calendar_events (
      id, project_id, title, description, event_type, source_module, status, priority,
      starts_at, ends_at, all_day, location, owner_user_id, owner_name,
      source_entity_type, source_entity_id, version, created_by, updated_by,
      created_at, updated_at, completed_at
    ) values (
      v_calendar_id,p_project_id,'[' || v_event.code || '] ' || v_event.title,left(v_event.description,4000),
      v_calendar_type,'DIARY','PLANNED',
      case when v_event.severity = 'CRITICAL' then 'CRITICAL' when v_event.severity = 'HIGH' then 'HIGH' else 'MEDIUM' end,
      v_due_at,v_due_at,false,'',v_event.responsible_user_id,v_event.responsible_name,
      'diary_event',v_event.id,1,p_actor_user_id,p_actor_user_id,now(),now(),null
    ) returning * into v_calendar;

    update public.diary_core_events
    set calendar_event_id = v_calendar.id
    where id = v_event.id
    returning * into v_event;

    insert into public.project_core_audit_events (
      id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
    ) values (
      'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
      p_project_id,p_actor_user_id,'PROJECT_CALENDAR_EVENT_CREATED','calendar_event',v_calendar.id,
      'DIARY eseményhatáridő létrehozva: ' || v_event.code,
      jsonb_build_object('sourceModule','DIARY','sourceEntityType','diary_event','sourceEntityId',v_event.id,'dueAt',v_due_at,'calendarSchema','0.5.0')
    );
  end if;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'DIARY_EVENT_CREATED','diary_event',v_event.id,
    'DIARY esemény rögzítve: ' || v_event.code || ' – ' || v_event.title,
    jsonb_build_object('entryId',v_entry.id,'entryCode',v_entry.code,'eventType',v_event.event_type,'severity',v_event.severity,'dueAt',v_event.due_at,'diarySchema','0.8.0')
  );

  return jsonb_build_object('entry',to_jsonb(v_entry),'event',to_jsonb(v_event));
exception
  when unique_violation then
    raise exception 'DIARY_CODE_CONFLICT' using errcode = 'P0001';
end;
$$;

create or replace function public.diary_core_update_event_atomic(
  p_project_id text,
  p_entry_id text,
  p_event_id text,
  p_expected_version integer,
  p_patch jsonb,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.diary_core_entries;
  v_current public.diary_core_events;
  v_event public.diary_core_events;
  v_calendar public.project_calendar_events;
  v_next_status text;
  v_next_due timestamptz;
  v_calendar_status text;
  v_calendar_type text;
  v_calendar_id text;
begin
  select * into v_entry
  from public.diary_core_entries
  where id = p_entry_id and project_id = p_project_id
  for update;

  if v_entry.id is null then
    raise exception 'DIARY_ENTRY_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_current
  from public.diary_core_events
  where id = p_event_id and entry_id = p_entry_id and project_id = p_project_id
  for update;

  if v_current.id is null then
    raise exception 'DIARY_EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_current.version <> p_expected_version then
    raise exception 'DIARY_EVENT_VERSION_CONFLICT' using errcode = 'P0001';
  end if;
  if v_current.status in ('RESOLVED','CANCELLED') then
    raise exception 'DIARY_EVENT_TERMINAL' using errcode = 'P0001';
  end if;

  v_next_status := case when p_patch ? 'status' then p_patch->>'status' else v_current.status end;
  if v_next_status not in ('OPEN','RESOLVED','CANCELLED') then
    raise exception 'DIARY_INVALID_STATUS_TRANSITION' using errcode = 'P0001';
  end if;
  if v_next_status = 'RESOLVED' and length(btrim(coalesce(p_patch->>'resolution',v_current.resolution))) = 0 then
    raise exception 'DIARY_EVENT_RESOLUTION_REQUIRED' using errcode = 'P0001';
  end if;
  v_next_due := case when p_patch ? 'due_at' then nullif(p_patch->>'due_at','')::timestamptz else v_current.due_at end;

  update public.diary_core_events set
    event_type = case when p_patch ? 'event_type' then p_patch->>'event_type' else event_type end,
    title = case when p_patch ? 'title' then btrim(p_patch->>'title') else title end,
    description = case when p_patch ? 'description' then coalesce(p_patch->>'description','') else description end,
    status = v_next_status,
    severity = case when p_patch ? 'severity' then p_patch->>'severity' else severity end,
    occurred_at = case when p_patch ? 'occurred_at' then (p_patch->>'occurred_at')::timestamptz else occurred_at end,
    responsible_user_id = case when p_patch ? 'responsible_user_id' then nullif(btrim(coalesce(p_patch->>'responsible_user_id','')),'') else responsible_user_id end,
    responsible_name = case when p_patch ? 'responsible_name' then coalesce(p_patch->>'responsible_name','') else responsible_name end,
    due_at = v_next_due,
    related_document_ids = case when p_patch ? 'related_document_ids' then coalesce(array(select jsonb_array_elements_text(p_patch->'related_document_ids')),'{}'::text[]) else related_document_ids end,
    dialog_thread_id = case when p_patch ? 'dialog_thread_id' then nullif(btrim(coalesce(p_patch->>'dialog_thread_id','')),'') else dialog_thread_id end,
    decide_request_id = case when p_patch ? 'decide_request_id' then nullif(btrim(coalesce(p_patch->>'decide_request_id','')),'') else decide_request_id end,
    resolution = case when p_patch ? 'resolution' then coalesce(p_patch->>'resolution','') else resolution end,
    version = version + 1,
    updated_by = p_actor_user_id,
    updated_at = now(),
    resolved_at = case when v_next_status in ('RESOLVED','CANCELLED') then now() else null end
  where id = p_event_id and version = p_expected_version
  returning * into v_event;

  if v_event.id is null then
    raise exception 'DIARY_EVENT_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  update public.diary_core_entries
  set version = version + 1, updated_by = p_actor_user_id, updated_at = now()
  where id = v_entry.id
  returning * into v_entry;

  v_calendar_status := case
    when v_event.status = 'RESOLVED' then 'COMPLETED'
    when v_event.status = 'CANCELLED' or v_event.due_at is null then 'CANCELLED'
    else 'IN_PROGRESS'
  end;
  v_calendar_type := case
    when v_event.event_type = 'INSPECTION' then 'INSPECTION'
    when v_event.event_type in ('OBSTACLE','INCIDENT','SAFETY') then 'DEADLINE'
    else 'TASK'
  end;

  if v_event.calendar_event_id is null and v_event.due_at is not null then
    v_calendar_id := 'project-calendar-' || substr(replace(gen_random_uuid()::text,'-',''),1,18);
    insert into public.project_calendar_events (
      id, project_id, title, description, event_type, source_module, status, priority,
      starts_at, ends_at, all_day, location, owner_user_id, owner_name,
      source_entity_type, source_entity_id, version, created_by, updated_by,
      created_at, updated_at, completed_at
    ) values (
      v_calendar_id,p_project_id,'[' || v_event.code || '] ' || v_event.title,left(v_event.description,4000),
      v_calendar_type,'DIARY',v_calendar_status,
      case when v_event.severity = 'CRITICAL' then 'CRITICAL' when v_event.severity = 'HIGH' then 'HIGH' else 'MEDIUM' end,
      v_event.due_at,v_event.due_at,false,'',v_event.responsible_user_id,v_event.responsible_name,
      'diary_event',v_event.id,1,p_actor_user_id,p_actor_user_id,now(),now(),
      case when v_calendar_status = 'COMPLETED' then now() else null end
    ) returning * into v_calendar;
    update public.diary_core_events set calendar_event_id = v_calendar.id where id = v_event.id returning * into v_event;
  elsif v_event.calendar_event_id is not null then
    update public.project_calendar_events set
      title = '[' || v_event.code || '] ' || v_event.title,
      description = left(v_event.description,4000),
      event_type = v_calendar_type,
      status = v_calendar_status,
      priority = case when v_event.severity = 'CRITICAL' then 'CRITICAL' when v_event.severity = 'HIGH' then 'HIGH' else 'MEDIUM' end,
      starts_at = coalesce(v_event.due_at,starts_at),
      ends_at = coalesce(v_event.due_at,ends_at),
      owner_user_id = v_event.responsible_user_id,
      owner_name = v_event.responsible_name,
      version = version + 1,
      updated_by = p_actor_user_id,
      updated_at = now(),
      completed_at = case when v_calendar_status = 'COMPLETED' then coalesce(completed_at,now()) else null end
    where id = v_event.calendar_event_id and project_id = p_project_id
    returning * into v_calendar;
  end if;

  if v_calendar.id is not null then
    insert into public.project_core_audit_events (
      id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
    ) values (
      'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
      p_project_id,p_actor_user_id,'PROJECT_CALENDAR_EVENT_UPDATED','calendar_event',v_calendar.id,
      'DIARY eseményhatáridő frissítve: ' || v_event.code,
      jsonb_build_object('sourceModule','DIARY','sourceEntityId',v_event.id,'status',v_calendar.status,'eventStatus',v_event.status,'calendarSchema','0.5.0')
    );
  end if;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,
    case when v_event.status = 'RESOLVED' then 'DIARY_EVENT_RESOLVED'
         when v_event.status = 'CANCELLED' then 'DIARY_EVENT_CANCELLED'
         else 'DIARY_EVENT_UPDATED' end,
    'diary_event',v_event.id,
    'DIARY esemény frissítve: ' || v_event.code || ' – ' || v_event.title,
    jsonb_build_object('entryId',v_entry.id,'previousVersion',v_current.version,'version',v_event.version,'previousStatus',v_current.status,'status',v_event.status,'diarySchema','0.8.0')
  );

  return jsonb_build_object('entry',to_jsonb(v_entry),'event',to_jsonb(v_event));
end;
$$;

revoke all on function public.diary_core_create_entry_atomic(text,jsonb,text) from public, anon, authenticated;
revoke all on function public.diary_core_update_entry_atomic(text,text,integer,jsonb,text) from public, anon, authenticated;
revoke all on function public.diary_core_close_entry_atomic(text,text,integer,text,text) from public, anon, authenticated;
revoke all on function public.diary_core_add_event_atomic(text,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.diary_core_update_event_atomic(text,text,text,integer,jsonb,text) from public, anon, authenticated;
grant execute on function public.diary_core_create_entry_atomic(text,jsonb,text) to service_role;
grant execute on function public.diary_core_update_entry_atomic(text,text,integer,jsonb,text) to service_role;
grant execute on function public.diary_core_close_entry_atomic(text,text,integer,text,text) to service_role;
grant execute on function public.diary_core_add_event_atomic(text,text,jsonb,text) to service_role;
grant execute on function public.diary_core_update_event_atomic(text,text,text,integer,jsonb,text) to service_role;

insert into public.diary_core_schema_meta (
  component, schema_version, migration_count, bootstrap_id, applied_at, updated_at
) values (
  'diary-core','0.8.0',1,'diary-core-v080-20260802',now(),now()
)
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = excluded.migration_count,
  bootstrap_id = excluded.bootstrap_id,
  applied_at = excluded.applied_at,
  updated_at = now();

commit;
