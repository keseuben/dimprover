-- BENJADMIN B3 M2 Development Center PostgreSQL engine 0.2.0
begin;
create table if not exists public.dev_center_schema_meta (
  component text primary key, schema_version text not null, migration_count integer not null default 1,
  bootstrap_id text not null, updated_at timestamptz not null default now()
);
create table if not exists public.dev_center_projects (
  id text primary key, name text not null, slug text not null unique,
  category text not null default 'Fejlesztési projekt', description text not null default '',
  status text not null default 'active' check (status in ('active','paused','completed','archived','unassigned')),
  accent text not null default 'cyan' check (accent in ('cyan','lime','blue','amber','slate')),
  started_at timestamptz not null default now(), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.dev_center_repositories (
  id text primary key, project_id text references public.dev_center_projects(id) on delete set null,
  name text not null, remote_url text, default_branch text not null default 'main', dev_path text,
  status text not null default 'active' check (status in ('active','paused','archived')),
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.dev_center_versions (
  id text primary key, project_id text not null references public.dev_center_projects(id) on delete restrict,
  version text not null, module_name text not null, title text not null, summary text not null default '',
  status text not null default 'planned' check (status in ('planned','in_progress','testing','blocked','completed','released')),
  started_at timestamptz not null default now(), completed_at timestamptz, updated_at timestamptz not null default now(),
  chat_title text, chat_url text, release_url text, download_url text, test_summary text, next_step text, created_by text,
  metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.dev_center_workers (
  id text primary key, code text not null unique, name text not null, role text not null,
  status text not null default 'ready' check (status in ('offline','ready','busy','paused')),
  capabilities jsonb not null default '[]'::jsonb, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.dev_center_tasks (
  id text primary key, project_id text not null references public.dev_center_projects(id) on delete restrict,
  version_id text references public.dev_center_versions(id) on delete set null,
  repository_id text references public.dev_center_repositories(id) on delete set null,
  title text not null, description text not null default '',
  status text not null default 'queued' check (status in ('queued','ready','claimed','in_progress','testing','blocked','completed','cancelled')),
  priority integer not null default 50 check (priority between 0 and 100),
  requested_worker_id text references public.dev_center_workers(id) on delete set null,
  assigned_worker_id text references public.dev_center_workers(id) on delete set null,
  branch_name text, worktree_path text, scope jsonb not null default '[]'::jsonb,
  acceptance jsonb not null default '[]'::jsonb, blocked_reason text, created_by text not null default 'BenAI',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  started_at timestamptz, completed_at timestamptz, metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.dev_center_task_dependencies (
  task_id text not null references public.dev_center_tasks(id) on delete cascade,
  depends_on_task_id text not null references public.dev_center_tasks(id) on delete cascade,
  dependency_type text not null default 'blocks' check (dependency_type in ('blocks','requires','related')),
  created_at timestamptz not null default now(), primary key (task_id, depends_on_task_id), check (task_id <> depends_on_task_id)
);
create table if not exists public.dev_center_environments (
  id text primary key, code text not null unique, name text not null,
  kind text not null check (kind in ('DEV','STAGING','PRODUCTION')),
  status text not null default 'online' check (status in ('online','maintenance','offline','quarantine')),
  read_only boolean not null default false, base_url text, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.dev_center_worker_sessions (
  id text primary key, coordinator text not null default 'BenAI', opened_by text not null default 'BenjAdmin',
  worker_id text references public.dev_center_workers(id) on delete set null,
  task_id text references public.dev_center_tasks(id) on delete set null,
  project_id text references public.dev_center_projects(id) on delete set null,
  version_id text references public.dev_center_versions(id) on delete set null,
  repository_id text references public.dev_center_repositories(id) on delete set null,
  environment_id text references public.dev_center_environments(id) on delete set null,
  status text not null default 'open' check (status in ('open','active','paused','blocked','closed')),
  handshake_stage text not null default 'SESSION_OPEN' check (handshake_stage in ('SESSION_OPEN','BENAI_ASSIGNED','WORKER_BOUND','TASK_BOUND','BRANCH_BOUND','WORKTREE_BOUND','READY')),
  branch_name text, worktree_path text, scope jsonb not null default '[]'::jsonb, note text,
  opened_at timestamptz not null default now(), last_heartbeat_at timestamptz not null default now(),
  closed_at timestamptz, close_reason text, metadata jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
);
create table if not exists public.dev_center_session_events (
  id text primary key, session_id text not null references public.dev_center_worker_sessions(id) on delete cascade,
  stage text not null, event_type text not null, actor text not null default 'BenAI', summary text not null default '',
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.dev_center_scope_locks (
  id text primary key, repository_id text not null references public.dev_center_repositories(id) on delete cascade,
  session_id text not null references public.dev_center_worker_sessions(id) on delete cascade,
  task_id text references public.dev_center_tasks(id) on delete cascade,
  scope_type text not null default 'path' check (scope_type in ('path','module','migration','release','environment')),
  scope_key text not null, mode text not null default 'exclusive' check (mode = 'exclusive'),
  status text not null default 'active' check (status in ('active','released','expired')),
  acquired_at timestamptz not null default now(), expires_at timestamptz, released_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create unique index if not exists dev_center_scope_locks_active_unique
  on public.dev_center_scope_locks(repository_id, scope_type, scope_key) where status = 'active';
create table if not exists public.dev_center_build_runs (
  id text primary key, session_id text references public.dev_center_worker_sessions(id) on delete set null,
  task_id text references public.dev_center_tasks(id) on delete set null,
  environment_id text references public.dev_center_environments(id) on delete set null,
  run_type text not null check (run_type in ('typecheck','lint','test','build','smoke','migration','restart')),
  status text not null default 'queued' check (status in ('queued','running','passed','failed','cancelled')),
  command_name text, git_commit text, build_id text, started_at timestamptz, finished_at timestamptz,
  duration_seconds integer, summary text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.dev_center_releases (
  id text primary key, project_id text not null references public.dev_center_projects(id) on delete restrict,
  version_id text references public.dev_center_versions(id) on delete set null,
  session_id text references public.dev_center_worker_sessions(id) on delete set null,
  source_environment_id text references public.dev_center_environments(id) on delete set null,
  target_environment_id text references public.dev_center_environments(id) on delete set null,
  status text not null default 'planned' check (status in ('planned','candidate','approved','deploying','released','rolled_back','failed')),
  git_commit text, build_id text, approved_by text, approved_at timestamptz, released_at timestamptz,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.dev_center_infra_assets (
  id text primary key, environment_id text references public.dev_center_environments(id) on delete set null,
  asset_type text not null, name text not null, status text not null default 'unknown', endpoint text,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.dev_center_backup_runs (
  id text primary key, environment_id text references public.dev_center_environments(id) on delete set null,
  asset_id text references public.dev_center_infra_assets(id) on delete set null,
  provider text not null default 'restic', status text not null check (status in ('running','passed','failed')),
  snapshot_id text, started_at timestamptz not null default now(), finished_at timestamptz, summary text,
  metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.dev_center_work_sessions (
  id text primary key, version_id text not null references public.dev_center_versions(id) on delete cascade,
  project_id text not null references public.dev_center_projects(id) on delete restrict, module_name text not null,
  started_at timestamptz not null, ended_at timestamptz, duration_minutes integer,
  current_category text check (current_category in ('active_development','build_test','waiting_blocked','documentation_release')),
  source text not null check (source in ('automatic','manual','chatgpt','system')), note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.dev_center_work_segments (
  id text primary key, work_session_id text not null references public.dev_center_work_sessions(id) on delete cascade,
  category text not null check (category in ('active_development','build_test','waiting_blocked','documentation_release')),
  started_at timestamptz not null, ended_at timestamptz, duration_minutes integer, created_at timestamptz not null default now()
);
create table if not exists public.dev_center_audit_events (
  id text primary key, actor_type text not null default 'system', actor_id text, action text not null,
  entity_type text not null, entity_id text, session_id text references public.dev_center_worker_sessions(id) on delete set null,
  task_id text references public.dev_center_tasks(id) on delete set null,
  project_id text references public.dev_center_projects(id) on delete set null,
  summary text not null default '', metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists dev_center_tasks_queue_idx on public.dev_center_tasks(status, priority desc, created_at);
create index if not exists dev_center_tasks_project_idx on public.dev_center_tasks(project_id, updated_at desc);
create index if not exists dev_center_worker_sessions_status_idx on public.dev_center_worker_sessions(status, handshake_stage, updated_at desc);
create index if not exists dev_center_session_events_session_idx on public.dev_center_session_events(session_id, created_at);
create index if not exists dev_center_audit_created_idx on public.dev_center_audit_events(created_at desc);
create index if not exists dev_center_work_sessions_version_idx on public.dev_center_work_sessions(version_id, started_at desc);
insert into public.dev_center_schema_meta(component, schema_version, migration_count, bootstrap_id, updated_at)
values ('dev-center-engine', '0.2.0', 1, 'BENJADMIN-B3-M2-20260810', now())
on conflict (component) do update set schema_version = excluded.schema_version, migration_count = excluded.migration_count,
  bootstrap_id = excluded.bootstrap_id, updated_at = excluded.updated_at;
insert into public.dev_center_environments(id, code, name, kind, status, read_only)
values ('env_dev','DEV','DIMPRO DEV','DEV','online',false),
       ('env_stag','STAGING','DIMPRO STAGING','STAGING','quarantine',true),
       ('env_prod','PRODUCTION','DIMPRO PRODUCTION','PRODUCTION','online',true)
on conflict (id) do update set name = excluded.name, kind = excluded.kind, updated_at = now();
insert into public.dev_center_workers(id, code, name, role, status, capabilities)
values ('worker_arminai','ARMINAI','ÁrminAI','Frontend / alkalmazásfejlesztő worker','ready','["code","ui","test"]'::jsonb),
       ('worker_jazminai','JAZMINAI','JázminAI','Backend / adatbázis worker','ready','["api","database","migration","test"]'::jsonb),
       ('worker_outminai','OUTMINAI','OutminAI','Üzemeltetési / release worker','ready','["build","smoke","release","infra"]'::jsonb)
on conflict (id) do update set name = excluded.name, role = excluded.role, capabilities = excluded.capabilities, updated_at = now();

alter table public.dev_center_schema_meta enable row level security;
alter table public.dev_center_projects enable row level security;
alter table public.dev_center_repositories enable row level security;
alter table public.dev_center_versions enable row level security;
alter table public.dev_center_workers enable row level security;
alter table public.dev_center_tasks enable row level security;
alter table public.dev_center_task_dependencies enable row level security;
alter table public.dev_center_environments enable row level security;
alter table public.dev_center_worker_sessions enable row level security;
alter table public.dev_center_session_events enable row level security;
alter table public.dev_center_scope_locks enable row level security;
alter table public.dev_center_build_runs enable row level security;
alter table public.dev_center_releases enable row level security;
alter table public.dev_center_infra_assets enable row level security;
alter table public.dev_center_backup_runs enable row level security;
alter table public.dev_center_work_sessions enable row level security;
alter table public.dev_center_work_segments enable row level security;
alter table public.dev_center_audit_events enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to service_role;
commit;
