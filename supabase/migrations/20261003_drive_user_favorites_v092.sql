-- DIMPRO Drive Favorites 0.1.0 – per-user favorites add-on
begin;

do $$
declare
  v_schema_version text;
  v_migration_count integer;
  v_bootstrap_id text;
begin
  select schema_version, migration_count, bootstrap_id
    into v_schema_version, v_migration_count, v_bootstrap_id
  from public.drive_core_schema_meta
  where component = 'drive-core';

  if not (
    v_schema_version = '0.9.1'
    and v_migration_count = 8
    and v_bootstrap_id = 'drive-core-v091-folder-trash-20261003'
  ) then
    raise exception 'DRIVE_FAVORITES_V010_CORE_V091_REQUIRED' using errcode = '55000';
  end if;
end;
$$;

create table if not exists public.drive_favorites_schema_meta (
  component text primary key,
  schema_version text not null,
  migration_count integer not null default 0,
  bootstrap_id text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.drive_core_user_favorites (
  project_id text not null references public.project_core_projects(id) on delete cascade,
  user_id text not null,
  entity_type text not null,
  entity_id text not null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id, entity_type, entity_id),
  constraint drive_core_user_favorites_entity_type_check
    check (entity_type in ('DOCUMENT','FOLDER'))
);

create index if not exists drive_core_user_favorites_user_project_idx
  on public.drive_core_user_favorites (user_id, project_id, created_at desc);

create index if not exists drive_core_user_favorites_entity_idx
  on public.drive_core_user_favorites (project_id, entity_type, entity_id);

revoke all on table public.drive_favorites_schema_meta from public, anon, authenticated;
revoke all on table public.drive_core_user_favorites from public, anon, authenticated;
grant select on table public.drive_favorites_schema_meta to service_role;
grant select, insert, update, delete on table public.drive_core_user_favorites to service_role;

insert into public.drive_favorites_schema_meta (
  component, schema_version, migration_count, bootstrap_id, updated_at
) values (
  'drive-favorites', '0.1.0', 1, 'drive-favorites-v010-20261003', now()
)
on conflict (component) do update
set schema_version = excluded.schema_version,
    migration_count = excluded.migration_count,
    bootstrap_id = excluded.bootstrap_id,
    updated_at = now();

commit;
