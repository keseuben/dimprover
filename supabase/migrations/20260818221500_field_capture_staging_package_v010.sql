begin;

create table if not exists public.field_capture_staging_packages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.field_capture_sessions(id) on delete cascade,
  user_id uuid not null references public.dimpro_users(id) on delete restrict,
  entitlement_id uuid not null references public.dimpro_send_entitlements(id) on delete restrict,
  project_id text null references public.project_core_projects(id) on delete set null,
  drop_package_id uuid not null references public.drop_packages(id) on delete cascade,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RELEASED','EXPIRED','ERROR')),
  retention_days integer not null check (retention_days in (1,3,5,7,14,30)),
  expires_at timestamptz not null,
  raw_capabilities_persisted boolean not null default false check (raw_capabilities_persisted = false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint field_capture_staging_session_unique unique (session_id),
  constraint field_capture_staging_package_unique unique (drop_package_id)
);

create index if not exists field_capture_staging_user_status_idx
  on public.field_capture_staging_packages(user_id, status, updated_at desc);
create index if not exists field_capture_staging_entitlement_status_idx
  on public.field_capture_staging_packages(entitlement_id, status, updated_at desc);
create index if not exists field_capture_staging_project_status_idx
  on public.field_capture_staging_packages(project_id, status, updated_at desc)
  where project_id is not null;

insert into public.field_capture_schema_meta(component, schema_version, migration_count, bootstrap_id, updated_at)
values ('field-capture-staging', '0.1.0', 1, 'field-capture-staging-v010-20260818', now())
on conflict (component) do update
set schema_version = excluded.schema_version,
    migration_count = excluded.migration_count,
    bootstrap_id = excluded.bootstrap_id,
    updated_at = excluded.updated_at;

comment on table public.field_capture_staging_packages is 'Private technical Drop package binding for Field Capture server uploads. Not a public Send delivery workflow and must not persist raw package capability credentials.';
comment on column public.field_capture_staging_packages.retention_days is 'Technical staging retention. Configurable from approved Drop retention set; default selected by server is 7 days.';
comment on column public.field_capture_staging_packages.raw_capabilities_persisted is 'Hard safety marker. Must always remain false; raw package capability tokens/PIN are discarded immediately after server-side package creation.';

alter table public.field_capture_staging_packages enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.field_capture_staging_packages from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.field_capture_staging_packages from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on table public.field_capture_staging_packages to service_role';
  end if;
end
$$;

commit;
