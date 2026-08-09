begin;

do $$
begin
  if to_regclass('public.project_core_projects') is null
    or to_regclass('public.project_core_audit_events') is null then
    raise exception 'PROJECT_CORE_V020_REQUIRED' using errcode = 'P0001';
  end if;
end;
$$;

create table if not exists public.project_calendar_schema_meta (
  component text primary key,
  schema_version text not null,
  migration_count integer not null default 0,
  bootstrap_id text not null,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_calendar_events (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  title text not null,
  description text not null default '',
  event_type text not null default 'TASK',
  source_module text not null default 'DOCK',
  status text not null default 'PLANNED',
  priority text not null default 'MEDIUM',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text not null default '',
  owner_user_id text null,
  owner_name text not null default '',
  source_entity_type text null,
  source_entity_id text null,
  version integer not null default 1,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint project_calendar_title_check check (length(btrim(title)) between 1 and 240),
  constraint project_calendar_description_check check (length(description) <= 4000),
  constraint project_calendar_event_type_check check (event_type in ('MEETING','DEADLINE','TASK','INSPECTION','MILESTONE','REMINDER')),
  constraint project_calendar_source_module_check check (source_module in ('DOCK','DIALOG','DECIDE','DIARY','DRIVE','SYSTEM')),
  constraint project_calendar_status_check check (status in ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED')),
  constraint project_calendar_priority_check check (priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
  constraint project_calendar_interval_check check (ends_at >= starts_at),
  constraint project_calendar_location_check check (length(location) <= 500),
  constraint project_calendar_owner_name_check check (length(owner_name) <= 240),
  constraint project_calendar_source_reference_check check (
    (source_entity_type is null and source_entity_id is null)
    or (source_entity_type is not null and source_entity_id is not null)
  ),
  constraint project_calendar_source_type_check check (source_entity_type is null or length(source_entity_type) between 1 and 80),
  constraint project_calendar_source_id_check check (source_entity_id is null or length(source_entity_id) between 1 and 180),
  constraint project_calendar_version_check check (version >= 1)
);

create index if not exists project_calendar_project_time_idx
  on public.project_calendar_events (project_id, starts_at, ends_at);
create index if not exists project_calendar_project_status_idx
  on public.project_calendar_events (project_id, status, priority, starts_at);
create index if not exists project_calendar_owner_idx
  on public.project_calendar_events (project_id, owner_user_id, status, starts_at)
  where owner_user_id is not null;
create unique index if not exists project_calendar_active_source_unique
  on public.project_calendar_events (project_id, source_module, source_entity_type, source_entity_id)
  where source_entity_id is not null and status <> 'CANCELLED';

alter table public.project_calendar_schema_meta enable row level security;
alter table public.project_calendar_events enable row level security;

revoke all on table public.project_calendar_schema_meta from public, anon, authenticated;
revoke all on table public.project_calendar_events from public, anon, authenticated;
grant select, insert, update, delete on table public.project_calendar_schema_meta to service_role;
grant select, insert, update, delete on table public.project_calendar_events to service_role;

alter table public.project_core_audit_events drop constraint if exists project_core_audit_entity_type_check;
alter table public.project_core_audit_events add constraint project_core_audit_entity_type_check
  check (entity_type in ('project','membership','lifecycle','folder','document','document_version','sync','calendar_event'));

create or replace function public.project_calendar_create_event_atomic(
  p_project_id text,
  p_event jsonb,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.project_calendar_events;
  v_source_type text;
  v_source_id text;
begin
  if not exists (
    select 1 from public.project_core_projects
    where id = p_project_id and status <> 'DELETED'
  ) then
    raise exception 'PROJECT_CORE_PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_source_type := nullif(btrim(coalesce(p_event->>'source_entity_type','')),'');
  v_source_id := nullif(btrim(coalesce(p_event->>'source_entity_id','')),'');

  insert into public.project_calendar_events (
    id, project_id, title, description, event_type, source_module, status, priority,
    starts_at, ends_at, all_day, location, owner_user_id, owner_name,
    source_entity_type, source_entity_id, version, created_by, updated_by, created_at, updated_at, completed_at
  ) values (
    p_event->>'id', p_project_id, btrim(p_event->>'title'), coalesce(p_event->>'description',''),
    coalesce(p_event->>'event_type','TASK'), coalesce(p_event->>'source_module','DOCK'),
    coalesce(p_event->>'status','PLANNED'), coalesce(p_event->>'priority','MEDIUM'),
    (p_event->>'starts_at')::timestamptz, (p_event->>'ends_at')::timestamptz,
    coalesce((p_event->>'all_day')::boolean,false), coalesce(p_event->>'location',''),
    nullif(btrim(coalesce(p_event->>'owner_user_id','')),''), coalesce(p_event->>'owner_name',''),
    v_source_type, v_source_id, 1, p_actor_user_id, p_actor_user_id,
    coalesce(nullif(p_event->>'created_at','')::timestamptz,now()),
    coalesce(nullif(p_event->>'updated_at','')::timestamptz,now()),
    case when coalesce(p_event->>'status','PLANNED') = 'COMPLETED' then now() else null end
  ) returning * into v_event;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id, p_actor_user_id, 'PROJECT_CALENDAR_EVENT_CREATED', 'calendar_event', v_event.id,
    'Projektnaptár-esemény létrehozva: ' || v_event.title,
    jsonb_build_object(
      'eventType',v_event.event_type,
      'sourceModule',v_event.source_module,
      'status',v_event.status,
      'priority',v_event.priority,
      'startsAt',v_event.starts_at,
      'endsAt',v_event.ends_at,
      'ownerUserId',v_event.owner_user_id,
      'sourceEntityType',v_event.source_entity_type,
      'sourceEntityId',v_event.source_entity_id,
      'calendarSchema','0.5.0'
    )
  );

  return to_jsonb(v_event);
exception
  when unique_violation then
    raise exception 'PROJECT_CALENDAR_SOURCE_CONFLICT' using errcode = 'P0001';
end;
$$;

create or replace function public.project_calendar_update_event_atomic(
  p_project_id text,
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
  v_current public.project_calendar_events;
  v_event public.project_calendar_events;
  v_next_start timestamptz;
  v_next_end timestamptz;
  v_next_status text;
begin
  select * into v_current
  from public.project_calendar_events
  where id = p_event_id and project_id = p_project_id
  for update;

  if v_current.id is null then
    raise exception 'PROJECT_CALENDAR_EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_current.version <> p_expected_version then
    raise exception 'PROJECT_CALENDAR_VERSION_CONFLICT' using errcode = 'P0001';
  end if;
  if v_current.status = 'CANCELLED' then
    raise exception 'PROJECT_CALENDAR_EVENT_CANCELLED' using errcode = 'P0001';
  end if;

  v_next_start := case when p_patch ? 'starts_at' then (p_patch->>'starts_at')::timestamptz else v_current.starts_at end;
  v_next_end := case when p_patch ? 'ends_at' then (p_patch->>'ends_at')::timestamptz else v_current.ends_at end;
  v_next_status := case when p_patch ? 'status' then p_patch->>'status' else v_current.status end;
  if v_next_end < v_next_start then
    raise exception 'PROJECT_CALENDAR_INVALID_INTERVAL' using errcode = '22023';
  end if;

  update public.project_calendar_events set
    title = case when p_patch ? 'title' then btrim(p_patch->>'title') else title end,
    description = case when p_patch ? 'description' then coalesce(p_patch->>'description','') else description end,
    event_type = case when p_patch ? 'event_type' then p_patch->>'event_type' else event_type end,
    source_module = case when p_patch ? 'source_module' then p_patch->>'source_module' else source_module end,
    status = v_next_status,
    priority = case when p_patch ? 'priority' then p_patch->>'priority' else priority end,
    starts_at = v_next_start,
    ends_at = v_next_end,
    all_day = case when p_patch ? 'all_day' then (p_patch->>'all_day')::boolean else all_day end,
    location = case when p_patch ? 'location' then coalesce(p_patch->>'location','') else location end,
    owner_user_id = case when p_patch ? 'owner_user_id' then nullif(btrim(coalesce(p_patch->>'owner_user_id','')),'') else owner_user_id end,
    owner_name = case when p_patch ? 'owner_name' then coalesce(p_patch->>'owner_name','') else owner_name end,
    source_entity_type = case when p_patch ? 'source_entity_type' then nullif(btrim(coalesce(p_patch->>'source_entity_type','')),'') else source_entity_type end,
    source_entity_id = case when p_patch ? 'source_entity_id' then nullif(btrim(coalesce(p_patch->>'source_entity_id','')),'') else source_entity_id end,
    version = version + 1,
    updated_by = p_actor_user_id,
    updated_at = now(),
    completed_at = case
      when v_next_status = 'COMPLETED' and v_current.status <> 'COMPLETED' then now()
      when v_next_status = 'COMPLETED' then completed_at
      else null
    end
  where id = p_event_id and project_id = p_project_id and version = p_expected_version
  returning * into v_event;

  if v_event.id is null then
    raise exception 'PROJECT_CALENDAR_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id, p_actor_user_id,
    case when v_event.status = 'COMPLETED' and v_current.status <> 'COMPLETED'
      then 'PROJECT_CALENDAR_EVENT_COMPLETED' else 'PROJECT_CALENDAR_EVENT_UPDATED' end,
    'calendar_event',v_event.id,
    case when v_event.status = 'COMPLETED' and v_current.status <> 'COMPLETED'
      then 'Projektnaptár-esemény teljesítve: ' || v_event.title
      else 'Projektnaptár-esemény módosítva: ' || v_event.title end,
    jsonb_build_object(
      'previousVersion',v_current.version,
      'version',v_event.version,
      'previousStatus',v_current.status,
      'status',v_event.status,
      'eventType',v_event.event_type,
      'sourceModule',v_event.source_module,
      'startsAt',v_event.starts_at,
      'endsAt',v_event.ends_at,
      'calendarSchema','0.5.0'
    )
  );

  return to_jsonb(v_event);
exception
  when unique_violation then
    raise exception 'PROJECT_CALENDAR_SOURCE_CONFLICT' using errcode = 'P0001';
end;
$$;

create or replace function public.project_calendar_cancel_event_atomic(
  p_project_id text,
  p_event_id text,
  p_expected_version integer,
  p_actor_user_id text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.project_calendar_events;
  v_event public.project_calendar_events;
begin
  select * into v_current
  from public.project_calendar_events
  where id = p_event_id and project_id = p_project_id
  for update;

  if v_current.id is null then
    raise exception 'PROJECT_CALENDAR_EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_current.status = 'CANCELLED' then
    return to_jsonb(v_current);
  end if;
  if v_current.version <> p_expected_version then
    raise exception 'PROJECT_CALENDAR_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  update public.project_calendar_events set
    status = 'CANCELLED',
    version = version + 1,
    updated_by = p_actor_user_id,
    updated_at = now(),
    completed_at = null
  where id = p_event_id and project_id = p_project_id and version = p_expected_version
  returning * into v_event;

  if v_event.id is null then
    raise exception 'PROJECT_CALENDAR_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id, p_actor_user_id, 'PROJECT_CALENDAR_EVENT_CANCELLED', 'calendar_event', v_event.id,
    'Projektnaptár-esemény visszavonva: ' || v_event.title,
    jsonb_build_object(
      'previousVersion',v_current.version,
      'version',v_event.version,
      'reason',left(btrim(coalesce(p_reason,'Esemény visszavonva.')),1000),
      'calendarSchema','0.5.0'
    )
  );

  return to_jsonb(v_event);
end;
$$;

revoke all on function public.project_calendar_create_event_atomic(text,jsonb,text) from public, anon, authenticated;
revoke all on function public.project_calendar_update_event_atomic(text,text,integer,jsonb,text) from public, anon, authenticated;
revoke all on function public.project_calendar_cancel_event_atomic(text,text,integer,text,text) from public, anon, authenticated;
grant execute on function public.project_calendar_create_event_atomic(text,jsonb,text) to service_role;
grant execute on function public.project_calendar_update_event_atomic(text,text,integer,jsonb,text) to service_role;
grant execute on function public.project_calendar_cancel_event_atomic(text,text,integer,text,text) to service_role;

insert into public.project_calendar_schema_meta (
  component, schema_version, migration_count, bootstrap_id, applied_at, updated_at
) values (
  'project-calendar-core','0.5.0',1,'project-calendar-core-v050-20260802',now(),now()
)
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = excluded.migration_count,
  bootstrap_id = excluded.bootstrap_id,
  applied_at = excluded.applied_at,
  updated_at = now();

commit;
