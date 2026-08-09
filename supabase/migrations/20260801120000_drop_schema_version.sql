-- DIMPRO Drop schema-version marker
-- DROP 0.2.0 – this must be the final statement group of the bootstrap activation.

create table if not exists public.drop_schema_meta (
  component text primary key,
  schema_version text not null,
  migration_count integer not null check (migration_count >= 1),
  bootstrap_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.drop_schema_meta enable row level security;

insert into public.drop_schema_meta (
  component,
  schema_version,
  migration_count,
  bootstrap_id,
  metadata,
  installed_at,
  updated_at
) values (
  'drop-core',
  'DROP 0.2.0',
  6,
  'drop-020-atomic-package-engine-20260801',
  jsonb_build_object(
    'packageCreation', 'atomic',
    'statusTransition', 'atomic',
    'tokenUseCounter', 'atomic',
    'tokenReissue', 'atomic',
    'tokenRevoke', 'atomic',
    'rawCredentialsPersisted', false,
    'fileUploadEnabled', false
  ),
  now(),
  now()
)
on conflict (component) do update
set schema_version = excluded.schema_version,
    migration_count = excluded.migration_count,
    bootstrap_id = excluded.bootstrap_id,
    metadata = excluded.metadata,
    installed_at = excluded.installed_at,
    updated_at = excluded.updated_at;

comment on table public.drop_schema_meta is
  'Server-only DIMPRO Drop schema readiness marker. The application must reject package-engine activation when the expected version row is missing or mismatched.';
