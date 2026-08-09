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

create table if not exists public.dialog_core_schema_meta (
  component text primary key,
  schema_version text not null,
  migration_count integer not null default 0,
  bootstrap_id text not null,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dialog_core_sequences (
  project_id text primary key references public.project_core_projects(id) on delete cascade,
  next_number integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint dialog_sequence_positive check (next_number >= 1)
);

create table if not exists public.dialog_core_threads (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  code text not null,
  thread_type text not null default 'RFI',
  title text not null,
  description text not null default '',
  discipline text not null default '',
  status text not null default 'OPEN',
  priority text not null default 'MEDIUM',
  owner_user_id text null,
  owner_name text not null default '',
  participant_names text[] not null default '{}'::text[],
  related_document_ids text[] not null default '{}'::text[],
  due_at timestamptz null,
  calendar_event_id text null references public.project_calendar_events(id) on delete set null,
  version integer not null default 1,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  resolved_at timestamptz null,
  closed_at timestamptz null,
  constraint dialog_thread_code_check check (length(btrim(code)) between 5 and 40),
  constraint dialog_thread_type_check check (thread_type in ('RFI','DATA_REQUEST','DESIGN_COMMENT','COORDINATION','DECISION_LOG')),
  constraint dialog_thread_title_check check (length(btrim(title)) between 1 and 240),
  constraint dialog_thread_description_check check (length(description) <= 6000),
  constraint dialog_thread_discipline_check check (length(discipline) <= 160),
  constraint dialog_thread_status_check check (status in ('OPEN','WAITING_RESPONSE','IN_PROGRESS','RESOLVED','CLOSED','CANCELLED')),
  constraint dialog_thread_priority_check check (priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
  constraint dialog_thread_owner_check check (length(owner_name) <= 240),
  constraint dialog_thread_participant_limit check (cardinality(participant_names) <= 30),
  constraint dialog_thread_document_limit check (cardinality(related_document_ids) <= 50),
  constraint dialog_thread_version_check check (version >= 1),
  constraint dialog_thread_project_code_unique unique (project_id, code)
);

create table if not exists public.dialog_core_messages (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  thread_id text not null references public.dialog_core_threads(id) on delete cascade,
  message_type text not null default 'COMMENT',
  body text not null,
  author_user_id text not null,
  author_name text not null,
  created_at timestamptz not null default now(),
  constraint dialog_message_type_check check (message_type in ('COMMENT','QUESTION','ANSWER','STATUS_NOTE')),
  constraint dialog_message_body_check check (length(btrim(body)) between 1 and 6000),
  constraint dialog_message_author_check check (length(btrim(author_name)) between 1 and 240)
);

create index if not exists dialog_threads_project_activity_idx
  on public.dialog_core_threads (project_id, last_activity_at desc);
create index if not exists dialog_threads_project_status_idx
  on public.dialog_core_threads (project_id, status, priority, due_at);
create index if not exists dialog_threads_owner_idx
  on public.dialog_core_threads (project_id, owner_user_id, status)
  where owner_user_id is not null;
create index if not exists dialog_messages_thread_created_idx
  on public.dialog_core_messages (project_id, thread_id, created_at);

alter table public.dialog_core_schema_meta enable row level security;
alter table public.dialog_core_sequences enable row level security;
alter table public.dialog_core_threads enable row level security;
alter table public.dialog_core_messages enable row level security;

revoke all on table public.dialog_core_schema_meta from public, anon, authenticated;
revoke all on table public.dialog_core_sequences from public, anon, authenticated;
revoke all on table public.dialog_core_threads from public, anon, authenticated;
revoke all on table public.dialog_core_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.dialog_core_schema_meta to service_role;
grant select, insert, update, delete on table public.dialog_core_sequences to service_role;
grant select, insert, update, delete on table public.dialog_core_threads to service_role;
grant select, insert, update, delete on table public.dialog_core_messages to service_role;

alter table public.project_core_audit_events drop constraint if exists project_core_audit_entity_type_check;
alter table public.project_core_audit_events add constraint project_core_audit_entity_type_check
  check (entity_type in ('project','membership','lifecycle','folder','document','document_version','sync','calendar_event','dialog_thread','dialog_message'));

create or replace function public.dialog_core_create_thread_atomic(
  p_project_id text,
  p_thread jsonb,
  p_initial_message jsonb,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
  v_prefix text;
  v_code text;
  v_thread public.dialog_core_threads;
  v_message public.dialog_core_messages;
  v_calendar public.project_calendar_events;
  v_calendar_id text;
  v_due_at timestamptz;
begin
  if not exists (
    select 1 from public.project_core_projects
    where id = p_project_id and status <> 'DELETED'
  ) then
    raise exception 'PROJECT_CORE_PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.dialog_core_sequences (project_id, next_number, updated_at)
  values (p_project_id, 2, now())
  on conflict (project_id) do update
    set next_number = public.dialog_core_sequences.next_number + 1,
        updated_at = now()
  returning next_number - 1 into v_number;

  v_prefix := case coalesce(p_thread->>'thread_type','RFI')
    when 'RFI' then 'RFI'
    when 'DATA_REQUEST' then 'ADR'
    when 'DESIGN_COMMENT' then 'TER'
    when 'COORDINATION' then 'EGY'
    when 'DECISION_LOG' then 'DNT'
    else 'DLG'
  end;
  v_code := v_prefix || '-' || extract(year from now())::integer::text || '-' || lpad(v_number::text,4,'0');
  v_due_at := nullif(p_thread->>'due_at','')::timestamptz;

  insert into public.dialog_core_threads (
    id, project_id, code, thread_type, title, description, discipline, status, priority,
    owner_user_id, owner_name, participant_names, related_document_ids, due_at,
    version, created_by, updated_by, created_at, updated_at, last_activity_at, resolved_at, closed_at
  ) values (
    p_thread->>'id', p_project_id, v_code, coalesce(p_thread->>'thread_type','RFI'),
    btrim(p_thread->>'title'), coalesce(p_thread->>'description',''), coalesce(p_thread->>'discipline',''),
    coalesce(p_thread->>'status','OPEN'), coalesce(p_thread->>'priority','MEDIUM'),
    nullif(btrim(coalesce(p_thread->>'owner_user_id','')),''), coalesce(p_thread->>'owner_name',''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_thread->'participant_names','[]'::jsonb))),'{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_thread->'related_document_ids','[]'::jsonb))),'{}'::text[]),
    v_due_at, 1, p_actor_user_id, p_actor_user_id,
    coalesce(nullif(p_thread->>'created_at','')::timestamptz,now()),
    coalesce(nullif(p_thread->>'updated_at','')::timestamptz,now()),
    coalesce(nullif(p_thread->>'updated_at','')::timestamptz,now()),
    case when coalesce(p_thread->>'status','OPEN') = 'RESOLVED' then now() else null end,
    case when coalesce(p_thread->>'status','OPEN') = 'CLOSED' then now() else null end
  ) returning * into v_thread;

  if p_initial_message is not null and length(btrim(coalesce(p_initial_message->>'body',''))) > 0 then
    insert into public.dialog_core_messages (
      id, project_id, thread_id, message_type, body, author_user_id, author_name, created_at
    ) values (
      p_initial_message->>'id', p_project_id, v_thread.id,
      coalesce(p_initial_message->>'message_type','QUESTION'), btrim(p_initial_message->>'body'),
      p_actor_user_id, coalesce(nullif(btrim(p_initial_message->>'author_name'),''),p_actor_user_id),
      coalesce(nullif(p_initial_message->>'created_at','')::timestamptz,now())
    ) returning * into v_message;
  end if;

  if v_due_at is not null then
    v_calendar_id := 'project-calendar-' || substr(replace(gen_random_uuid()::text,'-',''),1,18);
    insert into public.project_calendar_events (
      id, project_id, title, description, event_type, source_module, status, priority,
      starts_at, ends_at, all_day, location, owner_user_id, owner_name,
      source_entity_type, source_entity_id, version, created_by, updated_by, created_at, updated_at, completed_at
    ) values (
      v_calendar_id, p_project_id, '[' || v_thread.code || '] ' || v_thread.title,
      left(v_thread.description,4000), 'DEADLINE', 'DIALOG',
      case when v_thread.status in ('RESOLVED','CLOSED') then 'COMPLETED' else 'PLANNED' end,
      v_thread.priority, v_due_at, v_due_at, false, '', v_thread.owner_user_id, v_thread.owner_name,
      'dialog_thread',v_thread.id,1,p_actor_user_id,p_actor_user_id,now(),now(),
      case when v_thread.status in ('RESOLVED','CLOSED') then now() else null end
    ) returning * into v_calendar;

    update public.dialog_core_threads
    set calendar_event_id = v_calendar.id
    where id = v_thread.id
    returning * into v_thread;

    insert into public.project_core_audit_events (
      id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
    ) values (
      'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
      p_project_id,p_actor_user_id,'PROJECT_CALENDAR_EVENT_CREATED','calendar_event',v_calendar.id,
      'DIALOG válaszadási határidő létrehozva: ' || v_thread.code,
      jsonb_build_object('sourceModule','DIALOG','sourceEntityType','dialog_thread','sourceEntityId',v_thread.id,'dueAt',v_due_at,'calendarSchema','0.5.0')
    );
  end if;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'DIALOG_THREAD_CREATED','dialog_thread',v_thread.id,
    'DIALOG témakártya létrehozva: ' || v_thread.code || ' – ' || v_thread.title,
    jsonb_build_object('code',v_thread.code,'threadType',v_thread.thread_type,'status',v_thread.status,'priority',v_thread.priority,'dueAt',v_thread.due_at,'dialogSchema','0.6.0')
  );

  return jsonb_build_object('thread',to_jsonb(v_thread),'message',case when v_message.id is null then null else to_jsonb(v_message) end);
exception
  when unique_violation then
    raise exception 'DIALOG_CODE_CONFLICT' using errcode = 'P0001';
end;
$$;

create or replace function public.dialog_core_update_thread_atomic(
  p_project_id text,
  p_thread_id text,
  p_expected_version integer,
  p_patch jsonb,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.dialog_core_threads;
  v_thread public.dialog_core_threads;
  v_calendar public.project_calendar_events;
  v_next_status text;
  v_next_due timestamptz;
  v_calendar_status text;
  v_calendar_id text;
begin
  select * into v_current
  from public.dialog_core_threads
  where id = p_thread_id and project_id = p_project_id
  for update;

  if v_current.id is null then
    raise exception 'DIALOG_THREAD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_current.version <> p_expected_version then
    raise exception 'DIALOG_THREAD_VERSION_CONFLICT' using errcode = 'P0001';
  end if;
  if v_current.status in ('CLOSED','CANCELLED') then
    raise exception 'DIALOG_THREAD_CLOSED' using errcode = 'P0001';
  end if;

  v_next_status := case when p_patch ? 'status' then p_patch->>'status' else v_current.status end;
  if v_next_status <> v_current.status and not (
    (v_current.status = 'OPEN' and v_next_status in ('WAITING_RESPONSE','IN_PROGRESS','RESOLVED','CLOSED','CANCELLED')) or
    (v_current.status = 'WAITING_RESPONSE' and v_next_status in ('OPEN','IN_PROGRESS','RESOLVED','CLOSED','CANCELLED')) or
    (v_current.status = 'IN_PROGRESS' and v_next_status in ('OPEN','WAITING_RESPONSE','RESOLVED','CLOSED','CANCELLED')) or
    (v_current.status = 'RESOLVED' and v_next_status in ('OPEN','CLOSED','CANCELLED'))
  ) then
    raise exception 'DIALOG_INVALID_STATUS_TRANSITION' using errcode = 'P0001';
  end if;

  v_next_due := case when p_patch ? 'due_at' then nullif(p_patch->>'due_at','')::timestamptz else v_current.due_at end;

  update public.dialog_core_threads set
    title = case when p_patch ? 'title' then btrim(p_patch->>'title') else title end,
    description = case when p_patch ? 'description' then coalesce(p_patch->>'description','') else description end,
    thread_type = case when p_patch ? 'thread_type' then p_patch->>'thread_type' else thread_type end,
    discipline = case when p_patch ? 'discipline' then coalesce(p_patch->>'discipline','') else discipline end,
    status = v_next_status,
    priority = case when p_patch ? 'priority' then p_patch->>'priority' else priority end,
    owner_user_id = case when p_patch ? 'owner_user_id' then nullif(btrim(coalesce(p_patch->>'owner_user_id','')),'') else owner_user_id end,
    owner_name = case when p_patch ? 'owner_name' then coalesce(p_patch->>'owner_name','') else owner_name end,
    participant_names = case when p_patch ? 'participant_names' then coalesce(array(select jsonb_array_elements_text(p_patch->'participant_names')),'{}'::text[]) else participant_names end,
    related_document_ids = case when p_patch ? 'related_document_ids' then coalesce(array(select jsonb_array_elements_text(p_patch->'related_document_ids')),'{}'::text[]) else related_document_ids end,
    due_at = v_next_due,
    version = version + 1,
    updated_by = p_actor_user_id,
    updated_at = now(),
    last_activity_at = now(),
    resolved_at = case when v_next_status = 'RESOLVED' and v_current.status <> 'RESOLVED' then now() when v_next_status <> 'RESOLVED' then null else resolved_at end,
    closed_at = case when v_next_status in ('CLOSED','CANCELLED') then now() else null end
  where id = p_thread_id and project_id = p_project_id and version = p_expected_version
  returning * into v_thread;

  if v_thread.id is null then
    raise exception 'DIALOG_THREAD_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  v_calendar_status := case
    when v_thread.status in ('RESOLVED','CLOSED') then 'COMPLETED'
    when v_thread.status = 'CANCELLED' or v_thread.due_at is null then 'CANCELLED'
    when v_thread.status = 'IN_PROGRESS' then 'IN_PROGRESS'
    else 'PLANNED'
  end;

  if v_thread.calendar_event_id is null and v_thread.due_at is not null then
    v_calendar_id := 'project-calendar-' || substr(replace(gen_random_uuid()::text,'-',''),1,18);
    insert into public.project_calendar_events (
      id, project_id, title, description, event_type, source_module, status, priority,
      starts_at, ends_at, all_day, location, owner_user_id, owner_name,
      source_entity_type, source_entity_id, version, created_by, updated_by, created_at, updated_at, completed_at
    ) values (
      v_calendar_id,p_project_id,'[' || v_thread.code || '] ' || v_thread.title,left(v_thread.description,4000),
      'DEADLINE','DIALOG',v_calendar_status,v_thread.priority,v_thread.due_at,v_thread.due_at,false,'',
      v_thread.owner_user_id,v_thread.owner_name,'dialog_thread',v_thread.id,1,p_actor_user_id,p_actor_user_id,now(),now(),
      case when v_calendar_status = 'COMPLETED' then now() else null end
    ) returning * into v_calendar;
    update public.dialog_core_threads set calendar_event_id = v_calendar.id where id = v_thread.id returning * into v_thread;
  elsif v_thread.calendar_event_id is not null then
    update public.project_calendar_events set
      title = '[' || v_thread.code || '] ' || v_thread.title,
      description = left(v_thread.description,4000),
      status = v_calendar_status,
      priority = v_thread.priority,
      starts_at = coalesce(v_thread.due_at,starts_at),
      ends_at = coalesce(v_thread.due_at,ends_at),
      owner_user_id = v_thread.owner_user_id,
      owner_name = v_thread.owner_name,
      version = version + 1,
      updated_by = p_actor_user_id,
      updated_at = now(),
      completed_at = case when v_calendar_status = 'COMPLETED' then coalesce(completed_at,now()) else null end
    where id = v_thread.calendar_event_id and project_id = p_project_id
    returning * into v_calendar;
  end if;

  if v_calendar.id is not null then
    insert into public.project_core_audit_events (
      id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
    ) values (
      'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
      p_project_id,p_actor_user_id,'PROJECT_CALENDAR_EVENT_UPDATED','calendar_event',v_calendar.id,
      'DIALOG határidő frissítve: ' || v_thread.code,
      jsonb_build_object('sourceModule','DIALOG','sourceEntityId',v_thread.id,'status',v_calendar.status,'dueAt',v_thread.due_at,'calendarSchema','0.5.0')
    );
  end if;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,
    case when v_thread.status = 'RESOLVED' and v_current.status <> 'RESOLVED' then 'DIALOG_THREAD_RESOLVED'
         when v_thread.status = 'CLOSED' then 'DIALOG_THREAD_CLOSED'
         when v_thread.status = 'CANCELLED' then 'DIALOG_THREAD_CANCELLED'
         else 'DIALOG_THREAD_UPDATED' end,
    'dialog_thread',v_thread.id,
    'DIALOG témakártya frissítve: ' || v_thread.code || ' – ' || v_thread.title,
    jsonb_build_object('previousVersion',v_current.version,'version',v_thread.version,'previousStatus',v_current.status,'status',v_thread.status,'dueAt',v_thread.due_at,'dialogSchema','0.6.0')
  );

  return to_jsonb(v_thread);
end;
$$;

create or replace function public.dialog_core_add_message_atomic(
  p_project_id text,
  p_thread_id text,
  p_message jsonb,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread public.dialog_core_threads;
  v_message public.dialog_core_messages;
begin
  select * into v_thread
  from public.dialog_core_threads
  where id = p_thread_id and project_id = p_project_id
  for update;

  if v_thread.id is null then
    raise exception 'DIALOG_THREAD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_thread.status in ('CLOSED','CANCELLED') then
    raise exception 'DIALOG_THREAD_CLOSED' using errcode = 'P0001';
  end if;

  insert into public.dialog_core_messages (
    id, project_id, thread_id, message_type, body, author_user_id, author_name, created_at
  ) values (
    p_message->>'id',p_project_id,p_thread_id,coalesce(p_message->>'message_type','COMMENT'),
    btrim(p_message->>'body'),p_actor_user_id,coalesce(nullif(btrim(p_message->>'author_name'),''),p_actor_user_id),
    coalesce(nullif(p_message->>'created_at','')::timestamptz,now())
  ) returning * into v_message;

  update public.dialog_core_threads
  set updated_at = now(), last_activity_at = now(), updated_by = p_actor_user_id
  where id = p_thread_id
  returning * into v_thread;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'DIALOG_MESSAGE_CREATED','dialog_message',v_message.id,
    'DIALOG hozzászólás rögzítve: ' || v_thread.code,
    jsonb_build_object('threadId',v_thread.id,'threadCode',v_thread.code,'messageType',v_message.message_type,'dialogSchema','0.6.0')
  );

  return jsonb_build_object('thread',to_jsonb(v_thread),'message',to_jsonb(v_message));
end;
$$;

revoke all on function public.dialog_core_create_thread_atomic(text,jsonb,jsonb,text) from public, anon, authenticated;
revoke all on function public.dialog_core_update_thread_atomic(text,text,integer,jsonb,text) from public, anon, authenticated;
revoke all on function public.dialog_core_add_message_atomic(text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.dialog_core_create_thread_atomic(text,jsonb,jsonb,text) to service_role;
grant execute on function public.dialog_core_update_thread_atomic(text,text,integer,jsonb,text) to service_role;
grant execute on function public.dialog_core_add_message_atomic(text,text,jsonb,text) to service_role;

insert into public.dialog_core_schema_meta (
  component, schema_version, migration_count, bootstrap_id, applied_at, updated_at
) values (
  'dialog-core','0.6.0',1,'dialog-core-v060-20260802',now(),now()
)
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = excluded.migration_count,
  bootstrap_id = excluded.bootstrap_id,
  applied_at = excluded.applied_at,
  updated_at = now();

commit;
