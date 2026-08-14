begin;

create table if not exists public.dev_center_terminal_command_catalog (
  id uuid primary key default gen_random_uuid(),
  command_hash text not null unique,
  shell_family text not null check (shell_family in ('bash','powershell','git','other')),
  normalized_command text not null,
  display_command text not null,
  usage_count bigint not null default 1 check (usage_count > 0),
  first_used_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  last_environment text not null default 'DEV' check (last_environment in ('DEV','STAGING','PRODUCTION','LOCAL','CONTROL')),
  last_project_id text null references public.dev_center_projects(id) on delete set null,
  purpose text not null default '',
  last_result_summary text not null default '',
  notes text not null default '',
  tags text[] not null default array[]::text[],
  created_by text not null default 'BENJADMIN',
  updated_by text not null default 'BENJADMIN',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dev_center_terminal_command_no_empty check (length(btrim(normalized_command)) > 0),
  constraint dev_center_terminal_command_hash_format check (command_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.dev_center_terminal_command_events (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.dev_center_terminal_command_catalog(id) on delete cascade,
  environment text not null check (environment in ('DEV','STAGING','PRODUCTION','LOCAL','CONTROL')),
  project_id text null references public.dev_center_projects(id) on delete set null,
  worker_session_id text null references public.dev_center_worker_sessions(id) on delete set null,
  terminal_session_id text null,
  source text not null default 'terminal' check (source in ('terminal','managed','manual','import')),
  result_status text not null default 'unknown' check (result_status in ('queued','running','passed','failed','cancelled','unknown')),
  result_summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  executed_at timestamptz not null default now()
);

create index if not exists dev_center_terminal_command_last_used_idx on public.dev_center_terminal_command_catalog(last_used_at desc);
create index if not exists dev_center_terminal_command_usage_idx on public.dev_center_terminal_command_catalog(usage_count desc, last_used_at desc);
create index if not exists dev_center_terminal_command_project_idx on public.dev_center_terminal_command_catalog(last_project_id, last_used_at desc) where last_project_id is not null;
create index if not exists dev_center_terminal_command_event_catalog_idx on public.dev_center_terminal_command_events(catalog_id, executed_at desc);
create index if not exists dev_center_terminal_command_event_project_idx on public.dev_center_terminal_command_events(project_id, executed_at desc) where project_id is not null;

create or replace function public.dev_center_record_terminal_command(
  p_command_hash text,
  p_shell_family text,
  p_normalized_command text,
  p_display_command text,
  p_environment text,
  p_project_id text default null,
  p_worker_session_id text default null,
  p_terminal_session_id text default null,
  p_source text default 'terminal',
  p_purpose text default '',
  p_result_status text default 'unknown',
  p_result_summary text default '',
  p_tags text[] default array[]::text[],
  p_actor text default 'BENJADMIN',
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_environment not in ('DEV','STAGING','PRODUCTION','LOCAL','CONTROL') then
    raise exception 'invalid_terminal_environment';
  end if;
  if p_shell_family not in ('bash','powershell','git','other') then
    raise exception 'invalid_terminal_shell_family';
  end if;
  if p_source not in ('terminal','managed','manual','import') then
    raise exception 'invalid_terminal_source';
  end if;
  if p_result_status not in ('queued','running','passed','failed','cancelled','unknown') then
    raise exception 'invalid_terminal_result_status';
  end if;
  if p_command_hash !~ '^[0-9a-f]{64}$' or length(btrim(p_normalized_command)) = 0 then
    raise exception 'invalid_terminal_command';
  end if;

  insert into public.dev_center_terminal_command_catalog(
    command_hash, shell_family, normalized_command, display_command, usage_count,
    first_used_at, last_used_at, last_environment, last_project_id, purpose,
    last_result_summary, tags, created_by, updated_by, metadata
  ) values (
    p_command_hash, p_shell_family, p_normalized_command, p_display_command, 1,
    now(), now(), p_environment, p_project_id, p_purpose,
    p_result_summary, coalesce(p_tags,array[]::text[]), p_actor, p_actor, coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict (command_hash) do update set
    usage_count = public.dev_center_terminal_command_catalog.usage_count + 1,
    last_used_at = now(),
    last_environment = excluded.last_environment,
    last_project_id = excluded.last_project_id,
    purpose = case when excluded.purpose <> '' then excluded.purpose else public.dev_center_terminal_command_catalog.purpose end,
    last_result_summary = case when excluded.last_result_summary <> '' then excluded.last_result_summary else public.dev_center_terminal_command_catalog.last_result_summary end,
    tags = case when cardinality(excluded.tags) > 0 then excluded.tags else public.dev_center_terminal_command_catalog.tags end,
    updated_by = excluded.updated_by,
    metadata = public.dev_center_terminal_command_catalog.metadata || excluded.metadata,
    updated_at = now()
  returning id into v_id;

  insert into public.dev_center_terminal_command_events(
    catalog_id, environment, project_id, worker_session_id, terminal_session_id,
    source, result_status, result_summary, metadata, executed_at
  ) values (
    v_id, p_environment, p_project_id, p_worker_session_id, p_terminal_session_id,
    p_source, p_result_status, p_result_summary, coalesce(p_metadata,'{}'::jsonb), now()
  );

  return v_id;
end;
$$;

alter table public.dev_center_terminal_command_catalog enable row level security;
alter table public.dev_center_terminal_command_events enable row level security;

revoke all on table public.dev_center_terminal_command_catalog from anon, authenticated;
revoke all on table public.dev_center_terminal_command_events from anon, authenticated;
revoke all on function public.dev_center_record_terminal_command(text,text,text,text,text,text,text,text,text,text,text,text,text[],text,jsonb) from public, anon, authenticated;

grant all on table public.dev_center_terminal_command_catalog to service_role;
grant all on table public.dev_center_terminal_command_events to service_role;
grant execute on function public.dev_center_record_terminal_command(text,text,text,text,text,text,text,text,text,text,text,text,text[],text,jsonb) to service_role;

insert into public.dev_center_control_schema_meta(component, schema_version, migration_count, target_architecture, updated_at)
values ('benjadmin-terminal-command-library', '0.1.0', 1, 'CONTROL_VPS', now())
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = excluded.migration_count,
  target_architecture = excluded.target_architecture,
  updated_at = excluded.updated_at;

commit;
