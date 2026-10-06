-- DIMPRO Content Core add-on V0.1.0 - personal Drive folder core
-- DEV-first, additive. Does not change project Drive folders or the base content-core 0.1.0 marker.

begin;

do $$
declare
  v_version text;
  v_count integer;
  v_bootstrap text;
begin
  if to_regclass('public.dimpro_content_schema_meta') is null
     or to_regclass('public.dimpro_content_refs') is null
     or to_regclass('public.dimpro_users') is null then
    raise exception 'DIMPRO_CONTENT_PERSONAL_FOLDERS_BASELINE_REQUIRED';
  end if;

  select schema_version,migration_count,bootstrap_id
    into v_version,v_count,v_bootstrap
  from public.dimpro_content_schema_meta
  where component='content-core';

  if v_version <> '0.1.0'
     or v_count <> 1
     or v_bootstrap <> 'content-core-user-drive-v010-20260818' then
    raise exception 'DIMPRO_CONTENT_PERSONAL_FOLDERS_BASELINE_INVALID' using errcode='P0002';
  end if;
end
$$;

create table if not exists public.dimpro_content_personal_folder_schema_meta (
  component text primary key,
  schema_version text not null,
  migration_count integer not null check (migration_count > 0),
  bootstrap_id text not null,
  updated_at timestamptz not null default now(),
  constraint dimpro_content_personal_folder_meta_component_check check (length(btrim(component)) between 1 and 120),
  constraint dimpro_content_personal_folder_meta_version_check check (length(btrim(schema_version)) between 1 and 40),
  constraint dimpro_content_personal_folder_meta_bootstrap_check check (length(btrim(bootstrap_id)) between 1 and 160)
);

create table if not exists public.dimpro_content_personal_folders (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.dimpro_users(id) on delete restrict,
  parent_id uuid null,
  name text not null,
  sort_order integer not null default 0,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','TRASHED')),
  created_by_user_id uuid null references public.dimpro_users(id) on delete set null,
  trashed_by_user_id uuid null references public.dimpro_users(id) on delete set null,
  trashed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dimpro_content_personal_folders_owner_id_unique unique (owner_user_id,id),
  constraint dimpro_content_personal_folders_parent_owner_fk
    foreign key (owner_user_id,parent_id)
    references public.dimpro_content_personal_folders(owner_user_id,id)
    on delete restrict,
  constraint dimpro_content_personal_folders_name_check check (
    length(btrim(name)) between 1 and 180
    and btrim(name) not in ('.','..')
    and name !~ '[\\/]'
    and name !~ '[[:cntrl:]]'
  ),
  constraint dimpro_content_personal_folders_sort_check check (sort_order between -1000000 and 1000000),
  constraint dimpro_content_personal_folders_trash_state_check check (
    (status='ACTIVE' and trashed_at is null)
    or
    (status='TRASHED' and trashed_at is not null)
  )
);

create unique index if not exists dimpro_content_personal_folders_root_name_unique
  on public.dimpro_content_personal_folders(owner_user_id,lower(btrim(name)))
  where parent_id is null and status='ACTIVE';

create unique index if not exists dimpro_content_personal_folders_child_name_unique
  on public.dimpro_content_personal_folders(owner_user_id,parent_id,lower(btrim(name)))
  where parent_id is not null and status='ACTIVE';

create index if not exists dimpro_content_personal_folders_tree_idx
  on public.dimpro_content_personal_folders(owner_user_id,parent_id,status,sort_order,name);

create index if not exists dimpro_content_personal_folders_status_idx
  on public.dimpro_content_personal_folders(owner_user_id,status,updated_at desc);

insert into public.dimpro_content_personal_folder_schema_meta(component,schema_version,migration_count,bootstrap_id,updated_at)
values ('content-personal-folders','0.1.0',1,'content-personal-folders-v010-20261006',now())
on conflict (component) do update
set schema_version=excluded.schema_version,
    migration_count=excluded.migration_count,
    bootstrap_id=excluded.bootstrap_id,
    updated_at=excluded.updated_at;

comment on table public.dimpro_content_personal_folders is
  'DIMPRO personal Drive logical folder tree. Owner scope is exact dimpro_users.id; this table is not a project Drive ACL folder table.';
comment on column public.dimpro_content_personal_folders.parent_id is
  'Same-owner parent enforced by composite foreign key (owner_user_id,parent_id). NULL means personal Drive root.';
comment on column public.dimpro_content_refs.folder_id is
  'Optional logical folder reference. For owner_type USER, V0.1 personal Drive folder core stores dimpro_content_personal_folders.id as text; PROJECT ownership remains independent.';

alter table public.dimpro_content_personal_folder_schema_meta enable row level security;
alter table public.dimpro_content_personal_folders enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname='anon') then
    execute 'revoke all on table public.dimpro_content_personal_folder_schema_meta from anon';
    execute 'revoke all on table public.dimpro_content_personal_folders from anon';
  end if;
  if exists (select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all on table public.dimpro_content_personal_folder_schema_meta from authenticated';
    execute 'revoke all on table public.dimpro_content_personal_folders from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname='service_role') then
    execute 'grant all on table public.dimpro_content_personal_folder_schema_meta to service_role';
    execute 'grant all on table public.dimpro_content_personal_folders to service_role';
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
