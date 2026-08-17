-- BENJADMIN Development Scheduler V0.1.0
-- DEV-only scheduler state + idempotent run-slot ledger.
begin;

create table if not exists public.dev_center_development_schedules (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.dev_center_projects(id) on delete cascade,
  title text not null,
  status text not null default 'active' check (status in ('active','paused','completed','cancelled')),
  timezone text not null default 'Europe/Budapest',
  cadence_minutes integer not null default 60 check (cadence_minutes between 60 and 1440),
  start_at timestamptz not null,
  end_at timestamptz null,
  next_run_at timestamptz not null,
  last_run_at timestamptz null,
  last_success_at timestamptz null,
  run_count integer not null default 0 check (run_count >= 0),
  missed_run_count integer not null default 0 check (missed_run_count >= 0),
  max_runs integer null check (max_runs is null or max_runs > 0),
  preferred_worker_code text null,
  missed_run_policy text not null default 'catch_up_once' check (missed_run_policy in ('catch_up_once','skip')),
  retry_policy jsonb not null default '{"maxAttempts":3,"retryDelayMinutes":5}'::jsonb,
  created_by text not null default 'BenjAdmin',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dev_center_development_schedule_window check (end_at is null or end_at > start_at)
);

create table if not exists public.dev_center_scheduler_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.dev_center_development_schedules(id) on delete cascade,
  slot_at timestamptz not null,
  status text not null default 'running' check (status in ('running','ready_for_pull','worker_active','no_task','completed','skipped','failed')),
  trigger_source text not null default 'monitor' check (trigger_source in ('monitor','manual','chatgpt','recovery')),
  task_id text null references public.dev_center_tasks(id) on delete set null,
  worker_code text null,
  attempt_count integer not null default 1 check (attempt_count > 0),
  summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dev_center_scheduler_run_slot_unique unique (schedule_id, slot_at)
);

create index if not exists dev_center_development_schedules_due_idx
  on public.dev_center_development_schedules(status, next_run_at)
  where status = 'active';
create index if not exists dev_center_development_schedules_project_idx
  on public.dev_center_development_schedules(project_id, created_at desc);
create index if not exists dev_center_scheduler_runs_schedule_idx
  on public.dev_center_scheduler_runs(schedule_id, slot_at desc);
create index if not exists dev_center_scheduler_runs_status_idx
  on public.dev_center_scheduler_runs(status, updated_at desc);

alter table public.dev_center_development_schedules enable row level security;
alter table public.dev_center_scheduler_runs enable row level security;

revoke all on table public.dev_center_development_schedules from public, anon, authenticated;
revoke all on table public.dev_center_scheduler_runs from public, anon, authenticated;
grant select, insert, update, delete on table public.dev_center_development_schedules to service_role;
grant select, insert, update, delete on table public.dev_center_scheduler_runs to service_role;

insert into public.dev_center_control_schema_meta(component, schema_version, migration_count, target_architecture, updated_at)
values ('benjadmin-development-scheduler', '0.1.0', 1, 'DEV_VPS_MONITOR_HEARTBEAT', now())
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = excluded.migration_count,
  target_architecture = excluded.target_architecture,
  updated_at = excluded.updated_at;

commit;
