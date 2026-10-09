-- DIMPRO Personal Drive Favorites V0.1.0 – user-owned persistent favorites
begin;

create table if not exists public.dimpro_personal_drive_favorites (
  owner_user_id uuid not null references public.dimpro_users(id) on delete cascade,
  content_ref_id uuid not null references public.dimpro_content_refs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_user_id, content_ref_id)
);

create index if not exists dimpro_personal_drive_favorites_user_created_idx
  on public.dimpro_personal_drive_favorites(owner_user_id, created_at desc);

alter table public.dimpro_personal_drive_favorites enable row level security;

revoke all on table public.dimpro_personal_drive_favorites from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname='anon') then
    execute 'revoke all on table public.dimpro_personal_drive_favorites from anon';
  end if;
  if exists (select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all on table public.dimpro_personal_drive_favorites from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname='service_role') then
    execute 'grant select, insert, update, delete on table public.dimpro_personal_drive_favorites to service_role';
  end if;
end
$$;

insert into public.dimpro_content_schema_meta(component, schema_version, migration_count, bootstrap_id, updated_at)
values ('personal-drive-favorites', '0.1.0', 1, 'personal-drive-favorites-v010-20261009', now())
on conflict (component) do update
set schema_version=excluded.schema_version,
    migration_count=excluded.migration_count,
    bootstrap_id=excluded.bootstrap_id,
    updated_at=excluded.updated_at;

comment on table public.dimpro_personal_drive_favorites is
  'Persistent per-user favorites for USER-owned Personal Drive content references. Direct client access is denied; server service role enforces ownership.';

commit;
