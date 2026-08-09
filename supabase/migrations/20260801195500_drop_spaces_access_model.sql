-- DIMPRO Drop spaces and delegated access model
-- DROP 0.3.0 staged migration – do not apply until the private-pilot preflight passes.

begin;

create table if not exists public.drop_spaces (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique,
  name text not null,
  description text not null default '',
  organization_id text,
  owner_license_id text not null,
  owner_user_id text,
  status text not null default 'draft' check (status in (
    'draft', 'active', 'read_only', 'suspended', 'expired', 'archived', 'deletion_scheduled', 'deleted'
  )),
  access_expiry_mode text not null default 'license' check (access_expiry_mode in (
    'license', 'project', 'fixed', 'none'
  )),
  access_ends_at timestamptz,
  license_ends_at timestamptz not null,
  project_ends_at timestamptz,
  grace_ends_at timestamptz,
  max_members integer not null default 100 check (max_members between 1 and 10000),
  max_packages integer not null default 1000 check (max_packages between 1 and 1000000),
  storage_quota_bytes bigint not null default 10737418240 check (storage_quota_bytes >= 1048576),
  current_storage_bytes bigint not null default 0 check (current_storage_bytes >= 0),
  allow_guest_package_creation boolean not null default true,
  allow_guest_invites boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  constraint drop_spaces_fixed_expiry_check check (
    access_expiry_mode <> 'fixed' or access_ends_at is not null
  ),
  constraint drop_spaces_project_expiry_check check (
    access_expiry_mode <> 'project' or project_ends_at is not null
  ),
  constraint drop_spaces_access_within_license_check check (
    access_ends_at is null or access_ends_at <= license_ends_at
  )
);

create table if not exists public.drop_space_memberships (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.drop_spaces(id) on delete cascade,
  user_id text,
  email text not null,
  display_name text not null,
  organization_name text,
  role text not null default 'viewer' check (role in (
    'owner', 'space_admin', 'contributor', 'uploader', 'viewer'
  )),
  status text not null default 'invited' check (status in (
    'invited', 'active', 'suspended', 'revoked', 'expired'
  )),
  is_guest boolean not null default true,
  invited_by_membership_id uuid references public.drop_space_memberships(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  access_ends_at timestamptz,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, email)
);

create table if not exists public.drop_space_projects (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.drop_spaces(id) on delete cascade,
  project_id text not null,
  project_name_snapshot text not null,
  sync_to_dock boolean not null default true,
  allow_dock_package_creation boolean not null default true,
  archive_to_drive boolean not null default false,
  drive_target_folder_id text,
  added_by_membership_id uuid not null references public.drop_space_memberships(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, project_id)
);

alter table public.drop_packages
  add column if not exists space_id uuid references public.drop_spaces(id) on delete set null,
  add column if not exists created_by_membership_id uuid references public.drop_space_memberships(id) on delete set null,
  add column if not exists visibility text not null default 'selected_members' check (visibility in (
    'space_members', 'selected_members', 'project_members', 'private'
  ));

create table if not exists public.drop_package_members (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.drop_packages(id) on delete cascade,
  membership_id uuid not null references public.drop_space_memberships(id) on delete cascade,
  can_view boolean not null default true,
  can_upload boolean not null default false,
  can_download boolean not null default true,
  can_comment boolean not null default false,
  shared_by_membership_id uuid references public.drop_space_memberships(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, membership_id)
);

create index if not exists drop_spaces_owner_license_idx
  on public.drop_spaces (owner_license_id, status, license_ends_at);
create index if not exists drop_spaces_organization_idx
  on public.drop_spaces (organization_id, status);
create index if not exists drop_space_memberships_space_status_idx
  on public.drop_space_memberships (space_id, status, role);
create index if not exists drop_space_memberships_user_idx
  on public.drop_space_memberships (user_id, status);
create index if not exists drop_space_memberships_email_idx
  on public.drop_space_memberships (lower(email), status);
create index if not exists drop_space_projects_project_idx
  on public.drop_space_projects (project_id, space_id);
create index if not exists drop_packages_space_idx
  on public.drop_packages (space_id, status, created_at desc);
create index if not exists drop_package_members_membership_idx
  on public.drop_package_members (membership_id, package_id);

alter table public.drop_spaces enable row level security;
alter table public.drop_space_memberships enable row level security;
alter table public.drop_space_projects enable row level security;
alter table public.drop_package_members enable row level security;

comment on table public.drop_spaces is
  'License-owned DIMPRO Drop access space. External members use the owner license quota and do not need a separate paid license.';
comment on table public.drop_space_memberships is
  'Drop space memberships with delegated package, upload and viewing roles.';
comment on table public.drop_space_projects is
  'Project links that surface the same Drop packages in Door/Dock and prepare Drive archival without duplicating files.';
comment on table public.drop_package_members is
  'Selected membership access for packages inside a Drop space.';
comment on column public.drop_packages.space_id is
  'Optional parent Drop space. Legacy one-off packages remain valid with a null value.';
comment on column public.drop_packages.created_by_membership_id is
  'Membership that created the package inside the Drop space.';
comment on column public.drop_packages.visibility is
  'Controls whether the package is visible to all space members, selected members, project members or only the creator/admins.';

insert into public.drop_schema_meta (
  component,
  schema_version,
  migration_count,
  bootstrap_id,
  metadata,
  installed_at,
  updated_at
) values (
  'drop-spaces',
  'DROP 0.3.0',
  1,
  'drop-030-spaces-access-model-20260801',
  jsonb_build_object(
    'licenseOwnedSpace', true,
    'guestLicenseRequired', false,
    'guestPackageCreation', true,
    'projectDockLink', true,
    'driveArchivePrepared', true,
    'legacyPackageCompatibility', true,
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
    updated_at = excluded.updated_at;

commit;
