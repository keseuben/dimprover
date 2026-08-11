-- DIMPRO BENJADMIN B3.2 P1 Partner Development Plane registry 0.1.0
begin;

do $$
begin
  if to_regclass('public.dev_center_projects') is null
     or to_regclass('public.dev_center_workers') is null
     or to_regclass('public.dev_center_environments') is null
     or to_regclass('public.dev_center_releases') is null
     or to_regclass('public.dev_center_infra_assets') is null
     or to_regclass('public.dev_center_audit_events') is null
     or to_regclass('public.dev_center_schema_meta') is null then
    raise exception 'PARTNER_GENERIC_ENGINE_REQUIRED';
  end if;
end
$$;

create sequence if not exists public.dev_center_partner_project_code_seq start 1 increment 1;

create table if not exists public.dev_center_partner_projects (
  project_id text primary key references public.dev_center_projects(id) on delete cascade,
  project_code text not null unique check (project_code ~ '^PART-[0-9]{4,}$'),
  creation_key text not null unique,
  partner_org_id text null,
  delivery_model text not null check (delivery_model in ('DIMPRO_HOSTED','PARTNER_HOSTED','HANDOFF')),
  data_classification text not null default 'NORMAL' check (data_classification in ('NORMAL','CONFIDENTIAL','RESTRICTED')),
  default_worker_id text not null references public.dev_center_workers(id) on delete restrict,
  internal_engine_access text not null default 'NONE' check (internal_engine_access in ('NONE','ALLOWLIST')),
  status text not null default 'draft' check (status in ('draft','provisioning','ready','paused','closed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dev_center_partner_environments (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.dev_center_partner_projects(project_id) on delete cascade,
  environment_id text not null references public.dev_center_environments(id) on delete restrict,
  environment_type text not null check (environment_type in ('PARTNER_DEV','PARTNER_STAG','PARTNER_PROD')),
  node_asset_id text null references public.dev_center_infra_assets(id) on delete set null,
  domain text null,
  runtime_ref text null,
  db_ref text null,
  storage_ref text null,
  current_release_id text null references public.dev_center_releases(id) on delete set null,
  health_status text not null default 'unknown' check (health_status in ('online','ready','degraded','offline','unknown')),
  last_backup_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dev_center_partner_environment_unique unique (project_id, environment_type)
);

create table if not exists public.dev_center_partner_access_policies (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.dev_center_partner_projects(project_id) on delete cascade,
  subject_worker_id text not null references public.dev_center_workers(id) on delete cascade,
  resource_type text not null check (resource_type in ('repository','path','secret','database','storage','engine','environment','deploy_target')),
  resource_ref text not null,
  access_level text not null default 'DENY' check (access_level in ('DENY','READ','WRITE','EXECUTE')),
  expires_at timestamptz null,
  created_by text not null default 'BenjAdmin',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dev_center_partner_access_policy_unique unique (project_id, subject_worker_id, resource_type, resource_ref)
);

create table if not exists public.dev_center_partner_engine_entitlements (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.dev_center_partner_projects(project_id) on delete cascade,
  engine_key text not null,
  allowed_version_range text not null,
  current_version text null,
  status text not null default 'allowed' check (status in ('allowed','blocked','deprecated')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dev_center_partner_engine_unique unique (project_id, engine_key)
);

create table if not exists public.dev_center_partner_delivery_targets (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.dev_center_partner_projects(project_id) on delete cascade,
  target_type text not null check (target_type in ('DIMPRO_HOSTED','PARTNER_HOSTED','HANDOFF')),
  node_ref text null,
  domain text null,
  credential_ref text null,
  deploy_mode text not null default 'artifact' check (deploy_mode in ('artifact','controlled_remote','handoff')),
  approval_policy text not null default 'explicit' check (approval_policy in ('explicit','partner_acceptance','handoff_acceptance')),
  status text not null default 'draft' check (status in ('draft','ready','disabled','closed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dev_center_partner_handoffs (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.dev_center_partner_projects(project_id) on delete cascade,
  release_id text not null references public.dev_center_releases(id) on delete restrict,
  manifest_json jsonb not null default '{}'::jsonb,
  checksum text not null,
  handed_over_at timestamptz null,
  handed_over_by text null,
  accepted_at timestamptz null,
  accepted_by text null,
  status text not null default 'draft' check (status in ('draft','prepared','handed_over','accepted','rejected','cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dev_center_partner_handoff_release_unique unique (project_id, release_id)
);

create table if not exists public.dev_center_secret_references (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('partner_project','environment','delivery_target','worker','shared_engine')),
  scope_id text not null,
  environment_id text null references public.dev_center_environments(id) on delete set null,
  secret_key_name text not null,
  provider text not null,
  reference_path text not null,
  rotated_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dev_center_secret_reference_unique unique (scope_type, scope_id, environment_id, secret_key_name)
);

create index if not exists dev_center_partner_projects_status_idx
  on public.dev_center_partner_projects(status, updated_at desc);
create index if not exists dev_center_partner_projects_delivery_idx
  on public.dev_center_partner_projects(delivery_model, status);
create index if not exists dev_center_partner_env_health_idx
  on public.dev_center_partner_environments(project_id, health_status, updated_at desc);
create index if not exists dev_center_partner_policy_subject_idx
  on public.dev_center_partner_access_policies(subject_worker_id, access_level, resource_type);
create index if not exists dev_center_partner_policy_expiry_idx
  on public.dev_center_partner_access_policies(expires_at) where expires_at is not null;
create index if not exists dev_center_partner_delivery_status_idx
  on public.dev_center_partner_delivery_targets(project_id, status);
create index if not exists dev_center_secret_reference_scope_idx
  on public.dev_center_secret_references(scope_type, scope_id);

create or replace function public.dev_center_partner_project_code_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.project_code is distinct from old.project_code then
    raise exception 'PARTNER_PROJECT_CODE_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists dev_center_partner_project_code_immutable_trg on public.dev_center_partner_projects;
create trigger dev_center_partner_project_code_immutable_trg
before update of project_code on public.dev_center_partner_projects
for each row execute function public.dev_center_partner_project_code_immutable();

create or replace function public.dev_center_create_partner_project_draft_atomic(
  p_name text,
  p_slug text,
  p_partner_org_id text default null,
  p_delivery_model text default 'HANDOFF',
  p_data_classification text default 'NORMAL',
  p_default_worker_id text default 'worker_outminai',
  p_created_by text default 'BenjAdmin',
  p_creation_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := nullif(trim(p_name), '');
  v_slug text := lower(nullif(trim(p_slug), ''));
  v_partner_org_id text := nullif(trim(p_partner_org_id), '');
  v_delivery_model text := upper(coalesce(nullif(trim(p_delivery_model), ''), 'HANDOFF'));
  v_data_classification text := upper(coalesce(nullif(trim(p_data_classification), ''), 'NORMAL'));
  v_created_by text := coalesce(nullif(trim(p_created_by), ''), 'BenjAdmin');
  v_creation_key text := coalesce(nullif(trim(p_creation_key), ''), lower(coalesce(nullif(trim(p_slug), ''), '')));
  v_existing public.dev_center_partner_projects%rowtype;
  v_worker public.dev_center_workers%rowtype;
  v_project_id text;
  v_project_code text;
begin
  if v_name is null or length(v_name) > 160 then
    raise exception 'PARTNER_PROJECT_NAME_INVALID';
  end if;
  if v_slug is null or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(v_slug) > 120 then
    raise exception 'PARTNER_PROJECT_SLUG_INVALID';
  end if;
  if v_creation_key is null or length(v_creation_key) > 160 then
    raise exception 'PARTNER_PROJECT_CREATION_KEY_INVALID';
  end if;
  if v_delivery_model not in ('DIMPRO_HOSTED','PARTNER_HOSTED','HANDOFF') then
    raise exception 'PARTNER_DELIVERY_MODEL_INVALID';
  end if;
  if v_data_classification not in ('NORMAL','CONFIDENTIAL','RESTRICTED') then
    raise exception 'PARTNER_DATA_CLASSIFICATION_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtext('partner-project:' || v_creation_key));

  select * into v_existing
  from public.dev_center_partner_projects
  where creation_key = v_creation_key
  limit 1;

  if found then
    return jsonb_build_object(
      'created', false,
      'idempotent', true,
      'projectId', v_existing.project_id,
      'projectCode', v_existing.project_code
    );
  end if;

  if exists (select 1 from public.dev_center_projects where slug = v_slug) then
    raise exception 'PARTNER_PROJECT_SLUG_CONFLICT';
  end if;

  select * into v_worker
  from public.dev_center_workers
  where id = p_default_worker_id and code = 'OUTMINAI'
  limit 1;

  if not found then
    raise exception 'PARTNER_DEFAULT_WORKER_INVALID';
  end if;

  v_project_id := 'project_partner_' || replace(gen_random_uuid()::text, '-', '');
  v_project_code := 'PART-' || lpad(nextval('public.dev_center_partner_project_code_seq')::text, 4, '0');

  insert into public.dev_center_projects(
    id, name, slug, category, description, status, accent, metadata, created_at, updated_at
  ) values (
    v_project_id,
    v_name,
    v_slug,
    'Partner fejlesztés',
    '',
    'active',
    'amber',
    jsonb_build_object(
      'developmentPlane', 'PARTNER',
      'createdBy', v_created_by,
      'partnerProjectCode', v_project_code
    ),
    now(),
    now()
  );

  insert into public.dev_center_partner_projects(
    project_id, project_code, creation_key, partner_org_id, delivery_model,
    data_classification, default_worker_id, internal_engine_access, status, metadata
  ) values (
    v_project_id, v_project_code, v_creation_key, v_partner_org_id, v_delivery_model,
    v_data_classification, p_default_worker_id, 'NONE', 'draft',
    jsonb_build_object('provisioning', 'not_started')
  );

  insert into public.dev_center_audit_events(
    id, actor_type, actor_id, action, entity_type, entity_id, project_id, summary, metadata
  ) values (
    'dev-audit-partner-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
    'system',
    v_created_by,
    'PARTNER_PROJECT_DRAFT_CREATED',
    'partner_project',
    v_project_id,
    v_project_id,
    'Partnerprojekt draft létrehozva: ' || v_project_code,
    jsonb_build_object(
      'projectCode', v_project_code,
      'deliveryModel', v_delivery_model,
      'dataClassification', v_data_classification,
      'defaultWorkerId', p_default_worker_id,
      'internalEngineAccess', 'NONE'
    )
  );

  return jsonb_build_object(
    'created', true,
    'idempotent', false,
    'projectId', v_project_id,
    'projectCode', v_project_code
  );
end;
$$;

insert into public.dev_center_schema_meta(component, schema_version, migration_count, bootstrap_id, updated_at)
values ('partner-development-plane', '0.1.0', 1, 'BENJADMIN-B3.2-P1-20260811', now())
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = excluded.migration_count,
  bootstrap_id = excluded.bootstrap_id,
  updated_at = excluded.updated_at;

alter table public.dev_center_partner_projects enable row level security;
alter table public.dev_center_partner_environments enable row level security;
alter table public.dev_center_partner_access_policies enable row level security;
alter table public.dev_center_partner_engine_entitlements enable row level security;
alter table public.dev_center_partner_delivery_targets enable row level security;
alter table public.dev_center_partner_handoffs enable row level security;
alter table public.dev_center_secret_references enable row level security;

revoke all on function public.dev_center_create_partner_project_draft_atomic(text,text,text,text,text,text,text,text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.dev_center_partner_projects from anon';
    execute 'revoke all on table public.dev_center_partner_environments from anon';
    execute 'revoke all on table public.dev_center_partner_access_policies from anon';
    execute 'revoke all on table public.dev_center_partner_engine_entitlements from anon';
    execute 'revoke all on table public.dev_center_partner_delivery_targets from anon';
    execute 'revoke all on table public.dev_center_partner_handoffs from anon';
    execute 'revoke all on table public.dev_center_secret_references from anon';
    execute 'revoke all on sequence public.dev_center_partner_project_code_seq from anon';
    execute 'revoke all on function public.dev_center_create_partner_project_draft_atomic(text,text,text,text,text,text,text,text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.dev_center_partner_projects from authenticated';
    execute 'revoke all on table public.dev_center_partner_environments from authenticated';
    execute 'revoke all on table public.dev_center_partner_access_policies from authenticated';
    execute 'revoke all on table public.dev_center_partner_engine_entitlements from authenticated';
    execute 'revoke all on table public.dev_center_partner_delivery_targets from authenticated';
    execute 'revoke all on table public.dev_center_partner_handoffs from authenticated';
    execute 'revoke all on table public.dev_center_secret_references from authenticated';
    execute 'revoke all on sequence public.dev_center_partner_project_code_seq from authenticated';
    execute 'revoke all on function public.dev_center_create_partner_project_draft_atomic(text,text,text,text,text,text,text,text) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.dev_center_partner_projects to service_role';
    execute 'grant select, insert, update, delete on table public.dev_center_partner_environments to service_role';
    execute 'grant select, insert, update, delete on table public.dev_center_partner_access_policies to service_role';
    execute 'grant select, insert, update, delete on table public.dev_center_partner_engine_entitlements to service_role';
    execute 'grant select, insert, update, delete on table public.dev_center_partner_delivery_targets to service_role';
    execute 'grant select, insert, update, delete on table public.dev_center_partner_handoffs to service_role';
    execute 'grant select, insert, update, delete on table public.dev_center_secret_references to service_role';
    execute 'grant usage, select on sequence public.dev_center_partner_project_code_seq to service_role';
    execute 'grant execute on function public.dev_center_create_partner_project_draft_atomic(text,text,text,text,text,text,text,text) to service_role';
  end if;
end
$$;

commit;
