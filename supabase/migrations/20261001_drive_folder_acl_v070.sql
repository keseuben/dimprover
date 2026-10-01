-- DIMPRO Drive Core 0.7.0
-- Folder ACL Core Phase 1A: inherited folder.view visibility with USER/ROLE principals.
-- DEV migration source only. Apply only through the guarded migration gate.

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
    (v_schema_version = '0.6.0' and v_migration_count = 3 and v_bootstrap_id = 'drive-core-v060-safe-folder-names-20260928')
    or
    (v_schema_version = '0.7.0' and v_migration_count = 4 and v_bootstrap_id = 'drive-core-v070-folder-acl-20261001')
  ) then
    raise exception 'DRIVE_CORE_V070_UNEXPECTED_SCHEMA_MARKER';
  end if;
end;
$$;

alter table public.drive_core_folders
  add column if not exists acl_inherit boolean not null default true;

comment on column public.drive_core_folders.acl_inherit is
  'When true, folder.view visibility inherits from the parent/project. When false, matching local Drive folder ACL entries refine visibility.';

create table if not exists public.drive_core_folder_acl_entries (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  folder_id text not null references public.drive_core_folders(id) on delete cascade,
  principal_type text not null,
  membership_id text null references public.project_core_memberships(id) on delete cascade,
  role text null,
  permission text not null default 'folder.view',
  effect text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drive_core_folder_acl_principal_type_check check (principal_type in ('USER','ROLE')),
  constraint drive_core_folder_acl_role_check check (role is null or role in ('OWNER','PROJECT_MANAGER','CONTRIBUTOR','REVIEWER','VIEWER')),
  constraint drive_core_folder_acl_permission_check check (permission = 'folder.view'),
  constraint drive_core_folder_acl_effect_check check (effect in ('ALLOW','DENY')),
  constraint drive_core_folder_acl_principal_shape_check check (
    (principal_type = 'USER' and membership_id is not null and role is null)
    or
    (principal_type = 'ROLE' and role is not null and membership_id is null)
  )
);

create unique index if not exists drive_core_folder_acl_user_permission_unique
  on public.drive_core_folder_acl_entries (project_id, folder_id, membership_id, permission)
  where principal_type = 'USER';

create unique index if not exists drive_core_folder_acl_role_permission_unique
  on public.drive_core_folder_acl_entries (project_id, folder_id, role, permission)
  where principal_type = 'ROLE';

create index if not exists drive_core_folder_acl_project_folder_idx
  on public.drive_core_folder_acl_entries (project_id, folder_id);

create index if not exists drive_core_folder_acl_membership_idx
  on public.drive_core_folder_acl_entries (project_id, membership_id)
  where principal_type = 'USER';

create index if not exists drive_core_folder_acl_role_idx
  on public.drive_core_folder_acl_entries (project_id, role)
  where principal_type = 'ROLE';

alter table public.drive_core_folder_acl_entries enable row level security;
revoke all on public.drive_core_folder_acl_entries from anon, authenticated;

update public.drive_core_schema_meta
set schema_version = '0.7.0',
    migration_count = 4,
    bootstrap_id = 'drive-core-v070-folder-acl-20261001',
    updated_at = now()
where component = 'drive-core'
  and schema_version = '0.6.0'
  and migration_count = 3
  and bootstrap_id = 'drive-core-v060-safe-folder-names-20260928';

commit;
