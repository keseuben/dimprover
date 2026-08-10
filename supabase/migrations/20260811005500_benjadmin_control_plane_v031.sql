begin;

create table if not exists public.dev_center_control_schema_meta (
  component text primary key,
  schema_version text not null,
  migration_count integer not null default 1,
  target_architecture text not null default 'CONTROL_VPS',
  updated_at timestamptz not null default now()
);

create table if not exists public.dev_center_start_contexts (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('START','DEV_START','PROD_START')),
  target_environment text not null check (target_environment in ('AUTO','DEV','STAGING','PRODUCTION')),
  requested_by text not null,
  source_chat_id text null,
  status text not null default 'active' check (status in ('active','closed','expired')),
  write_allowed boolean not null default false,
  expires_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dev_center_prod_start_read_only_check check (mode <> 'PROD_START' or write_allowed = false)
);

create table if not exists public.dev_center_approvals (
  id uuid primary key default gen_random_uuid(),
  approval_type text not null check (approval_type in ('prod_write','prod_migration','prod_restart','prod_deploy','release','recovery')),
  target_environment text not null,
  operation text not null,
  requested_by text not null,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired','consumed')),
  approved_by text null,
  approved_at timestamptz null,
  expires_at timestamptz null,
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.dev_center_command_queue (
  id uuid primary key default gen_random_uuid(),
  start_context_id uuid null references public.dev_center_start_contexts(id) on delete set null,
  approval_id uuid null references public.dev_center_approvals(id) on delete set null,
  target_environment text not null check (target_environment in ('DEV','STAGING','PRODUCTION','CONTROL')),
  operation text not null check (operation in ('read','write','build','test','migration','restart','deploy','release','recovery','monitor')),
  command_name text not null,
  requested_by text not null,
  status text not null default 'queued' check (status in ('queued','approved','running','passed','failed','rejected','cancelled')),
  requires_approval boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  started_at timestamptz null,
  finished_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dev_center_prod_command_guard check (
    target_environment <> 'PRODUCTION'
    or operation in ('read','monitor')
    or (requires_approval = true and approval_id is not null)
  )
);

create table if not exists public.dev_center_decision_memory (
  id uuid primary key default gen_random_uuid(),
  decision_key text not null,
  category text not null default 'architecture',
  scope text not null default 'DIMPRO',
  decision text not null,
  rationale text not null default '',
  source_ref text null,
  supersedes_id uuid null references public.dev_center_decision_memory(id) on delete set null,
  status text not null default 'active' check (status in ('active','superseded','withdrawn')),
  decided_by text not null default 'BenjAdmin',
  decided_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dev_center_decision_key_unique unique (decision_key)
);

create table if not exists public.dev_center_live_worklog (
  id uuid primary key default gen_random_uuid(),
  start_context_id uuid null references public.dev_center_start_contexts(id) on delete set null,
  task_id text null,
  worker_code text null,
  phase text not null default 'development',
  level text not null default 'info' check (level in ('info','success','warning','error')),
  summary text not null,
  detail text not null default '',
  progress_percent integer null check (progress_percent is null or progress_percent between 0 and 100),
  source text not null default 'benai',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.dev_center_monitor_samples (
  id uuid primary key default gen_random_uuid(),
  target_code text not null,
  target_kind text not null check (target_kind in ('CONTROL','DEV','STAGING','PRODUCTION','DATABASE','OBJECT_STORAGE','BACKUP')),
  sampled_at timestamptz not null default now(),
  status text not null default 'unknown' check (status in ('ok','warning','error','unknown')),
  cpu_percent numeric(6,2) null,
  memory_percent numeric(6,2) null,
  disk_percent numeric(6,2) null,
  load_1m numeric(8,3) null,
  response_ms integer null,
  network_in_bytes bigint null,
  network_out_bytes bigint null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists dev_center_start_contexts_created_idx on public.dev_center_start_contexts(created_at desc);
create index if not exists dev_center_command_queue_status_idx on public.dev_center_command_queue(status, created_at);
create index if not exists dev_center_command_queue_target_idx on public.dev_center_command_queue(target_environment, created_at desc);
create index if not exists dev_center_approvals_status_idx on public.dev_center_approvals(status, requested_at desc);
create index if not exists dev_center_decision_memory_scope_idx on public.dev_center_decision_memory(scope, status, decided_at desc);
create index if not exists dev_center_live_worklog_created_idx on public.dev_center_live_worklog(created_at desc);
create index if not exists dev_center_live_worklog_task_idx on public.dev_center_live_worklog(task_id, created_at desc) where task_id is not null;
create index if not exists dev_center_monitor_samples_target_idx on public.dev_center_monitor_samples(target_code, sampled_at desc);

insert into public.dev_center_control_schema_meta(component, schema_version, migration_count, target_architecture, updated_at)
values ('benjadmin-control-plane', '0.3.1', 1, 'CONTROL_VPS', now())
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = excluded.migration_count,
  target_architecture = excluded.target_architecture,
  updated_at = excluded.updated_at;

alter table public.dev_center_control_schema_meta enable row level security;
alter table public.dev_center_start_contexts enable row level security;
alter table public.dev_center_approvals enable row level security;
alter table public.dev_center_command_queue enable row level security;
alter table public.dev_center_decision_memory enable row level security;
alter table public.dev_center_live_worklog enable row level security;
alter table public.dev_center_monitor_samples enable row level security;

do $$
BEGIN
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.dev_center_control_schema_meta from anon';
    execute 'revoke all on table public.dev_center_start_contexts from anon';
    execute 'revoke all on table public.dev_center_approvals from anon';
    execute 'revoke all on table public.dev_center_command_queue from anon';
    execute 'revoke all on table public.dev_center_decision_memory from anon';
    execute 'revoke all on table public.dev_center_live_worklog from anon';
    execute 'revoke all on table public.dev_center_monitor_samples from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.dev_center_control_schema_meta from authenticated';
    execute 'revoke all on table public.dev_center_start_contexts from authenticated';
    execute 'revoke all on table public.dev_center_approvals from authenticated';
    execute 'revoke all on table public.dev_center_command_queue from authenticated';
    execute 'revoke all on table public.dev_center_decision_memory from authenticated';
    execute 'revoke all on table public.dev_center_live_worklog from authenticated';
    execute 'revoke all on table public.dev_center_monitor_samples from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on table public.dev_center_control_schema_meta to service_role';
    execute 'grant all on table public.dev_center_start_contexts to service_role';
    execute 'grant all on table public.dev_center_approvals to service_role';
    execute 'grant all on table public.dev_center_command_queue to service_role';
    execute 'grant all on table public.dev_center_decision_memory to service_role';
    execute 'grant all on table public.dev_center_live_worklog to service_role';
    execute 'grant all on table public.dev_center_monitor_samples to service_role';
  end if;
END
$$;

commit;
