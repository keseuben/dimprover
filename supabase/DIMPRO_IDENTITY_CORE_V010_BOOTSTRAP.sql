-- DIMPRO Identity Core V010 combined bootstrap
-- Generated from three ordered migrations. Run as one SQL Editor package.

-- DIMPRO / DIMPROVER central identity, organization, license and project core 0.1.0
-- Additive, rerunnable Supabase PostgreSQL migration.
-- Existing DIMPRO account, Project Core and Drop data is preserved and linked through compatibility bridges.

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.dimpro_identity_schema_meta (
  component text primary key,
  schema_version text not null,
  migration_count integer not null default 0,
  bootstrap_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.dimpro_normalize_email(p_email text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(trim(coalesce(p_email, '')))
$$;

create or replace function public.dimpro_random_token(p_length integer)
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_bytes bytea;
  v_result text := '';
  v_index integer;
begin
  if p_length is null or p_length < 1 or p_length > 64 then
    raise exception 'DIMPRO_INVALID_TOKEN_LENGTH' using errcode = '22023';
  end if;

  v_bytes := extensions.gen_random_bytes(p_length);
  for v_index in 0..p_length - 1 loop
    v_result := v_result || substr(
      v_alphabet,
      (get_byte(v_bytes, v_index) % length(v_alphabet)) + 1,
      1
    );
  end loop;
  return v_result;
end;
$$;

create or replace function public.dimpro_build_public_code(
  p_prefix text,
  p_first_group_length integer,
  p_second_group_length integer
)
returns text
language sql
volatile
set search_path = public, extensions
as $$
  select upper(trim(p_prefix))
    || '-' || to_char(current_date, 'YY')
    || '-' || public.dimpro_random_token(p_first_group_length)
    || '-' || public.dimpro_random_token(p_second_group_length)
$$;

create table if not exists public.dimpro_users (
  id uuid primary key default extensions.gen_random_uuid(),
  public_user_code text not null,
  auth_user_id uuid null,
  full_name text not null,
  email text not null,
  email_normalized text not null,
  email_verified_at timestamptz null,
  phone text null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references public.dimpro_users(id) on delete set null,
  legacy_account_user_id uuid null,
  constraint dimpro_users_public_user_code_unique unique (public_user_code),
  constraint dimpro_users_auth_user_id_unique unique (auth_user_id),
  constraint dimpro_users_email_normalized_unique unique (email_normalized),
  constraint dimpro_users_public_code_format_check check (public_user_code ~ '^USR-[0-9]{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$'),
  constraint dimpro_users_status_check check (status in ('pending','active','suspended','disabled','deleted')),
  constraint dimpro_users_email_normalized_check check (email_normalized = public.dimpro_normalize_email(email) and email_normalized <> ''),
  constraint dimpro_users_legacy_account_unique unique (legacy_account_user_id)
);

create table if not exists public.dimpro_organizations (
  id uuid primary key default extensions.gen_random_uuid(),
  public_organization_code text not null,
  legal_name text not null,
  display_name text null,
  tax_number text null,
  registration_number text null,
  email text null,
  phone text null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_company_id uuid null,
  constraint dimpro_organizations_public_code_unique unique (public_organization_code),
  constraint dimpro_organizations_public_code_format_check check (public_organization_code ~ '^ORG-[0-9]{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$'),
  constraint dimpro_organizations_status_check check (status in ('pending','active','suspended','disabled','archived')),
  constraint dimpro_organizations_legacy_company_unique unique (legacy_company_id)
);

create table if not exists public.dimpro_organization_memberships (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.dimpro_users(id) on delete cascade,
  organization_id uuid not null references public.dimpro_organizations(id) on delete cascade,
  role_code text not null,
  role_label text null,
  status text not null default 'active',
  joined_at timestamptz not null default now(),
  access_ends_at timestamptz null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_membership_id uuid null,
  constraint dimpro_org_memberships_status_check check (status in ('invited','active','suspended','revoked')),
  constraint dimpro_org_memberships_access_dates_check check (access_ends_at is null or access_ends_at >= joined_at),
  constraint dimpro_org_memberships_legacy_unique unique (legacy_membership_id)
);

create unique index if not exists dimpro_org_memberships_active_unique
  on public.dimpro_organization_memberships (user_id, organization_id)
  where status <> 'revoked';
create unique index if not exists dimpro_org_memberships_primary_unique
  on public.dimpro_organization_memberships (user_id)
  where is_primary and status = 'active';
create index if not exists dimpro_org_memberships_org_status_idx
  on public.dimpro_organization_memberships (organization_id, status);
create index if not exists dimpro_org_memberships_user_status_idx
  on public.dimpro_organization_memberships (user_id, status);

create table if not exists public.dimpro_licenses (
  id uuid primary key default extensions.gen_random_uuid(),
  public_license_code text not null,
  owner_type text not null,
  owner_user_id uuid null references public.dimpro_users(id) on delete restrict,
  owner_organization_id uuid null references public.dimpro_organizations(id) on delete restrict,
  product_code text not null default 'DIMPRO',
  plan_code text null,
  status text not null default 'pending',
  activated_at timestamptz null,
  expires_at timestamptz null,
  offline_grace_until timestamptz null,
  max_devices integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_subscription_id uuid null,
  legacy_product_access_owner_id uuid null,
  constraint dimpro_licenses_public_code_unique unique (public_license_code),
  constraint dimpro_licenses_public_code_format_check check (public_license_code ~ '^LIC-[0-9]{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$'),
  constraint dimpro_licenses_owner_type_check check (owner_type in ('user','organization')),
  constraint dimpro_licenses_exactly_one_owner_check check (
    (owner_type = 'user' and owner_user_id is not null and owner_organization_id is null)
    or
    (owner_type = 'organization' and owner_user_id is null and owner_organization_id is not null)
  ),
  constraint dimpro_licenses_status_check check (status in ('pending','trial','active','expired','suspended','revoked')),
  constraint dimpro_licenses_max_devices_check check (max_devices >= 1),
  constraint dimpro_licenses_dates_check check (expires_at is null or activated_at is null or expires_at >= activated_at),
  constraint dimpro_licenses_legacy_subscription_unique unique (legacy_subscription_id),
  constraint dimpro_licenses_legacy_access_owner_unique unique (legacy_product_access_owner_id)
);

create index if not exists dimpro_licenses_owner_user_idx
  on public.dimpro_licenses (owner_user_id, status) where owner_user_id is not null;
create index if not exists dimpro_licenses_owner_org_idx
  on public.dimpro_licenses (owner_organization_id, status) where owner_organization_id is not null;
create index if not exists dimpro_licenses_status_expiry_idx
  on public.dimpro_licenses (status, expires_at);

create table if not exists public.dimpro_license_modules (
  id uuid primary key default extensions.gen_random_uuid(),
  license_id uuid not null references public.dimpro_licenses(id) on delete cascade,
  module_code text not null,
  enabled boolean not null default true,
  limits jsonb not null default '{}'::jsonb,
  feature_flags jsonb not null default '{}'::jsonb,
  valid_from timestamptz null,
  valid_until timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_product_access_id uuid null,
  constraint dimpro_license_modules_unique unique (license_id, module_code),
  constraint dimpro_license_modules_dates_check check (valid_until is null or valid_from is null or valid_until >= valid_from),
  constraint dimpro_license_modules_legacy_access_unique unique (legacy_product_access_id)
);

create index if not exists dimpro_license_modules_active_idx
  on public.dimpro_license_modules (license_id, module_code, enabled);

create table if not exists public.dimpro_projects (
  id uuid primary key default extensions.gen_random_uuid(),
  public_project_code text not null,
  name text not null,
  short_name text null,
  description text not null default '',
  organization_id uuid null references public.dimpro_organizations(id) on delete set null,
  status text not null default 'draft',
  project_drop_enabled boolean not null default false,
  created_by uuid null references public.dimpro_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_project_core_id text null,
  legacy_project_code text null,
  constraint dimpro_projects_public_code_unique unique (public_project_code),
  constraint dimpro_projects_public_code_format_check check (public_project_code ~ '^PRJ-[0-9]{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{3}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{3}$'),
  constraint dimpro_projects_status_check check (status in ('draft','active','closing','read_only','archived','deletion_scheduled','deleted')),
  constraint dimpro_projects_legacy_project_unique unique (legacy_project_core_id)
);

create index if not exists dimpro_projects_org_status_idx
  on public.dimpro_projects (organization_id, status);
create index if not exists dimpro_projects_drop_status_idx
  on public.dimpro_projects (project_drop_enabled, status);

create table if not exists public.dimpro_project_memberships (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.dimpro_projects(id) on delete cascade,
  user_id uuid not null references public.dimpro_users(id) on delete cascade,
  organization_id uuid null references public.dimpro_organizations(id) on delete set null,
  role_code text not null,
  can_view boolean not null default true,
  can_upload_to_drop boolean not null default false,
  can_download boolean not null default false,
  can_manage_inbox boolean not null default false,
  status text not null default 'active',
  valid_from timestamptz not null default now(),
  valid_until timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_project_core_membership_id text null,
  constraint dimpro_project_memberships_status_check check (status in ('invited','active','suspended','revoked')),
  constraint dimpro_project_memberships_dates_check check (valid_until is null or valid_until >= valid_from),
  constraint dimpro_project_memberships_legacy_unique unique (legacy_project_core_membership_id)
);

create unique index if not exists dimpro_project_memberships_active_unique
  on public.dimpro_project_memberships (project_id, user_id)
  where status <> 'revoked';
create index if not exists dimpro_project_memberships_user_status_idx
  on public.dimpro_project_memberships (user_id, status);
create index if not exists dimpro_project_memberships_project_status_idx
  on public.dimpro_project_memberships (project_id, status);

create or replace function public.dimpro_generate_user_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_code text;
  v_attempt integer;
begin
  for v_attempt in 1..32 loop
    v_code := public.dimpro_build_public_code('USR', 4, 4);
    exit when not exists (select 1 from public.dimpro_users where public_user_code = v_code);
  end loop;
  if exists (select 1 from public.dimpro_users where public_user_code = v_code) then
    raise exception 'DIMPRO_USER_CODE_GENERATION_EXHAUSTED' using errcode = '54000';
  end if;
  return v_code;
end;
$$;

create or replace function public.dimpro_generate_organization_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_code text;
  v_attempt integer;
begin
  for v_attempt in 1..32 loop
    v_code := public.dimpro_build_public_code('ORG', 4, 4);
    exit when not exists (select 1 from public.dimpro_organizations where public_organization_code = v_code);
  end loop;
  if exists (select 1 from public.dimpro_organizations where public_organization_code = v_code) then
    raise exception 'DIMPRO_ORGANIZATION_CODE_GENERATION_EXHAUSTED' using errcode = '54000';
  end if;
  return v_code;
end;
$$;

create or replace function public.dimpro_generate_license_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_code text;
  v_attempt integer;
begin
  for v_attempt in 1..32 loop
    v_code := public.dimpro_build_public_code('LIC', 4, 4);
    exit when not exists (select 1 from public.dimpro_licenses where public_license_code = v_code);
  end loop;
  if exists (select 1 from public.dimpro_licenses where public_license_code = v_code) then
    raise exception 'DIMPRO_LICENSE_CODE_GENERATION_EXHAUSTED' using errcode = '54000';
  end if;
  return v_code;
end;
$$;

create or replace function public.dimpro_generate_project_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_code text;
  v_attempt integer;
begin
  for v_attempt in 1..32 loop
    v_code := public.dimpro_build_public_code('PRJ', 3, 3);
    exit when not exists (select 1 from public.dimpro_projects where public_project_code = v_code);
  end loop;
  if exists (select 1 from public.dimpro_projects where public_project_code = v_code) then
    raise exception 'DIMPRO_PROJECT_CODE_GENERATION_EXHAUSTED' using errcode = '54000';
  end if;
  return v_code;
end;
$$;

create or replace function public.dimpro_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.dimpro_prepare_user_row()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.email := trim(new.email);
  new.email_normalized := public.dimpro_normalize_email(new.email);
  if new.public_user_code is null or trim(new.public_user_code) = '' then
    new.public_user_code := public.dimpro_generate_user_code();
  else
    new.public_user_code := upper(trim(new.public_user_code));
  end if;
  return new;
end;
$$;

create or replace function public.dimpro_prepare_organization_row()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.public_organization_code is null or trim(new.public_organization_code) = '' then
    new.public_organization_code := public.dimpro_generate_organization_code();
  else
    new.public_organization_code := upper(trim(new.public_organization_code));
  end if;
  return new;
end;
$$;

create or replace function public.dimpro_prepare_license_row()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.public_license_code is null or trim(new.public_license_code) = '' then
    new.public_license_code := public.dimpro_generate_license_code();
  else
    new.public_license_code := upper(trim(new.public_license_code));
  end if;
  new.product_code := upper(trim(new.product_code));
  return new;
end;
$$;

create or replace function public.dimpro_prepare_project_row()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.public_project_code is null or trim(new.public_project_code) = '' then
    new.public_project_code := public.dimpro_generate_project_code();
  else
    new.public_project_code := upper(trim(new.public_project_code));
  end if;
  return new;
end;
$$;

drop trigger if exists dimpro_users_prepare_trigger on public.dimpro_users;
create trigger dimpro_users_prepare_trigger
before insert or update of email, public_user_code on public.dimpro_users
for each row execute function public.dimpro_prepare_user_row();

drop trigger if exists dimpro_organizations_prepare_trigger on public.dimpro_organizations;
create trigger dimpro_organizations_prepare_trigger
before insert or update of public_organization_code on public.dimpro_organizations
for each row execute function public.dimpro_prepare_organization_row();

drop trigger if exists dimpro_licenses_prepare_trigger on public.dimpro_licenses;
create trigger dimpro_licenses_prepare_trigger
before insert or update of public_license_code, product_code on public.dimpro_licenses
for each row execute function public.dimpro_prepare_license_row();

drop trigger if exists dimpro_projects_prepare_trigger on public.dimpro_projects;
create trigger dimpro_projects_prepare_trigger
before insert or update of public_project_code on public.dimpro_projects
for each row execute function public.dimpro_prepare_project_row();

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'dimpro_users',
    'dimpro_organizations',
    'dimpro_organization_memberships',
    'dimpro_licenses',
    'dimpro_license_modules',
    'dimpro_projects',
    'dimpro_project_memberships'
  ] loop
    execute format('drop trigger if exists %I_updated_at_trigger on public.%I', v_table, v_table);
    execute format('create trigger %I_updated_at_trigger before update on public.%I for each row execute function public.dimpro_set_updated_at()', v_table, v_table);
  end loop;
end;
$$;

create or replace function public.dimpro_current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
set row_security = off
as $$
  select u.id
  from public.dimpro_users u
  where u.auth_user_id = auth.uid()
    and u.status = 'active'
  limit 1
$$;

create or replace function public.dimpro_is_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.dimpro_organization_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = public.dimpro_current_user_id()
      and m.status = 'active'
      and (m.access_ends_at is null or m.access_ends_at >= now())
  )
$$;

create or replace function public.dimpro_has_project_permission(p_project_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.dimpro_project_memberships m
    where m.project_id = p_project_id
      and m.user_id = public.dimpro_current_user_id()
      and m.status = 'active'
      and m.valid_from <= now()
      and (m.valid_until is null or m.valid_until >= now())
      and case lower(trim(p_permission))
        when 'view' then m.can_view
        when 'upload_to_drop' then m.can_upload_to_drop
        when 'download' then m.can_download
        when 'manage_inbox' then m.can_manage_inbox
        else false
      end
  )
$$;

create or replace function public.dimpro_create_user(
  p_full_name text,
  p_email text,
  p_auth_user_id uuid default null,
  p_phone text default null,
  p_created_by uuid default null
)
returns public.dimpro_users
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.dimpro_users;
  v_attempt integer;
  v_constraint text;
begin
  for v_attempt in 1..10 loop
    begin
      insert into public.dimpro_users (
        public_user_code, auth_user_id, full_name, email, email_normalized,
        email_verified_at, phone, status, created_by
      ) values (
        public.dimpro_generate_user_code(), p_auth_user_id, trim(p_full_name), trim(p_email),
        public.dimpro_normalize_email(p_email), null, nullif(trim(p_phone), ''), 'pending', p_created_by
      ) returning * into v_user;
      return v_user;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint not in ('dimpro_users_public_user_code_unique') then
        raise;
      end if;
    end;
  end loop;
  raise exception 'DIMPRO_USER_CODE_RETRY_EXHAUSTED' using errcode = '54000';
end;
$$;

create or replace function public.dimpro_create_organization(
  p_legal_name text,
  p_display_name text default null,
  p_tax_number text default null,
  p_registration_number text default null,
  p_email text default null,
  p_phone text default null
)
returns public.dimpro_organizations
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org public.dimpro_organizations;
  v_attempt integer;
  v_constraint text;
begin
  for v_attempt in 1..10 loop
    begin
      insert into public.dimpro_organizations (
        public_organization_code, legal_name, display_name, tax_number,
        registration_number, email, phone, status
      ) values (
        public.dimpro_generate_organization_code(), trim(p_legal_name), nullif(trim(p_display_name), ''),
        nullif(trim(p_tax_number), ''), nullif(trim(p_registration_number), ''),
        nullif(trim(p_email), ''), nullif(trim(p_phone), ''), 'active'
      ) returning * into v_org;
      return v_org;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint not in ('dimpro_organizations_public_code_unique') then
        raise;
      end if;
    end;
  end loop;
  raise exception 'DIMPRO_ORGANIZATION_CODE_RETRY_EXHAUSTED' using errcode = '54000';
end;
$$;

create or replace function public.dimpro_create_license(
  p_owner_type text,
  p_owner_user_id uuid,
  p_owner_organization_id uuid,
  p_product_code text,
  p_plan_code text default null,
  p_status text default 'pending',
  p_activated_at timestamptz default null,
  p_expires_at timestamptz default null,
  p_max_devices integer default 1
)
returns public.dimpro_licenses
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_license public.dimpro_licenses;
  v_attempt integer;
  v_constraint text;
begin
  for v_attempt in 1..10 loop
    begin
      insert into public.dimpro_licenses (
        public_license_code, owner_type, owner_user_id, owner_organization_id,
        product_code, plan_code, status, activated_at, expires_at, max_devices
      ) values (
        public.dimpro_generate_license_code(), lower(trim(p_owner_type)), p_owner_user_id,
        p_owner_organization_id, upper(trim(p_product_code)), nullif(trim(p_plan_code), ''),
        lower(trim(p_status)), p_activated_at, p_expires_at, greatest(coalesce(p_max_devices, 1), 1)
      ) returning * into v_license;
      return v_license;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint not in ('dimpro_licenses_public_code_unique') then
        raise;
      end if;
    end;
  end loop;
  raise exception 'DIMPRO_LICENSE_CODE_RETRY_EXHAUSTED' using errcode = '54000';
end;
$$;

create or replace function public.dimpro_create_project(
  p_name text,
  p_short_name text default null,
  p_organization_id uuid default null,
  p_created_by uuid default null,
  p_description text default ''
)
returns public.dimpro_projects
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_project public.dimpro_projects;
  v_attempt integer;
  v_constraint text;
begin
  for v_attempt in 1..10 loop
    begin
      insert into public.dimpro_projects (
        public_project_code, name, short_name, organization_id, created_by,
        description, status, project_drop_enabled
      ) values (
        public.dimpro_generate_project_code(), trim(p_name), nullif(trim(p_short_name), ''),
        p_organization_id, p_created_by, coalesce(p_description, ''), 'draft', false
      ) returning * into v_project;
      return v_project;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint not in ('dimpro_projects_public_code_unique') then
        raise;
      end if;
    end;
  end loop;
  raise exception 'DIMPRO_PROJECT_CODE_RETRY_EXHAUSTED' using errcode = '54000';
end;
$$;

-- Compatibility bridges: existing records remain authoritative for their current modules,
-- but each record can be linked one-to-one to the new canonical DIMPRO entity.
do $$
begin
  if to_regclass('public.dimpro_account_users') is not null then
    alter table public.dimpro_account_users add column if not exists dimpro_user_id uuid null;
    if not exists (select 1 from pg_constraint where conname = 'dimpro_account_users_dimpro_user_fk') then
      alter table public.dimpro_account_users
        add constraint dimpro_account_users_dimpro_user_fk
        foreign key (dimpro_user_id) references public.dimpro_users(id) on delete set null;
    end if;
    create unique index if not exists dimpro_account_users_dimpro_user_unique
      on public.dimpro_account_users (dimpro_user_id) where dimpro_user_id is not null;
  end if;

  if to_regclass('public.dimpro_companies') is not null then
    alter table public.dimpro_companies add column if not exists dimpro_organization_id uuid null;
    if not exists (select 1 from pg_constraint where conname = 'dimpro_companies_dimpro_org_fk') then
      alter table public.dimpro_companies
        add constraint dimpro_companies_dimpro_org_fk
        foreign key (dimpro_organization_id) references public.dimpro_organizations(id) on delete set null;
    end if;
    create unique index if not exists dimpro_companies_dimpro_org_unique
      on public.dimpro_companies (dimpro_organization_id) where dimpro_organization_id is not null;
  end if;

  if to_regclass('public.dimpro_memberships') is not null then
    alter table public.dimpro_memberships add column if not exists dimpro_organization_membership_id uuid null;
    if not exists (select 1 from pg_constraint where conname = 'dimpro_memberships_canonical_fk') then
      alter table public.dimpro_memberships
        add constraint dimpro_memberships_canonical_fk
        foreign key (dimpro_organization_membership_id) references public.dimpro_organization_memberships(id) on delete set null;
    end if;
    create unique index if not exists dimpro_memberships_canonical_unique
      on public.dimpro_memberships (dimpro_organization_membership_id)
      where dimpro_organization_membership_id is not null;
  end if;

  if to_regclass('public.dimpro_subscriptions') is not null then
    alter table public.dimpro_subscriptions add column if not exists dimpro_license_id uuid null;
    if not exists (select 1 from pg_constraint where conname = 'dimpro_subscriptions_canonical_license_fk') then
      alter table public.dimpro_subscriptions
        add constraint dimpro_subscriptions_canonical_license_fk
        foreign key (dimpro_license_id) references public.dimpro_licenses(id) on delete set null;
    end if;
    create unique index if not exists dimpro_subscriptions_canonical_license_unique
      on public.dimpro_subscriptions (dimpro_license_id) where dimpro_license_id is not null;
  end if;

  if to_regclass('public.dimpro_product_access') is not null then
    alter table public.dimpro_product_access add column if not exists dimpro_license_module_id uuid null;
    if not exists (select 1 from pg_constraint where conname = 'dimpro_product_access_canonical_module_fk') then
      alter table public.dimpro_product_access
        add constraint dimpro_product_access_canonical_module_fk
        foreign key (dimpro_license_module_id) references public.dimpro_license_modules(id) on delete set null;
    end if;
    create unique index if not exists dimpro_product_access_canonical_module_unique
      on public.dimpro_product_access (dimpro_license_module_id) where dimpro_license_module_id is not null;
  end if;

  if to_regclass('public.project_core_projects') is not null then
    alter table public.project_core_projects add column if not exists dimpro_project_id uuid null;
    if not exists (select 1 from pg_constraint where conname = 'project_core_projects_canonical_project_fk') then
      alter table public.project_core_projects
        add constraint project_core_projects_canonical_project_fk
        foreign key (dimpro_project_id) references public.dimpro_projects(id) on delete set null;
    end if;
    create unique index if not exists project_core_projects_canonical_project_unique
      on public.project_core_projects (dimpro_project_id) where dimpro_project_id is not null;
  end if;

  if to_regclass('public.project_core_memberships') is not null then
    alter table public.project_core_memberships add column if not exists dimpro_project_membership_id uuid null;
    if not exists (select 1 from pg_constraint where conname = 'project_core_memberships_canonical_fk') then
      alter table public.project_core_memberships
        add constraint project_core_memberships_canonical_fk
        foreign key (dimpro_project_membership_id) references public.dimpro_project_memberships(id) on delete set null;
    end if;
    create unique index if not exists project_core_memberships_canonical_unique
      on public.project_core_memberships (dimpro_project_membership_id)
      where dimpro_project_membership_id is not null;
  end if;
end;
$$;

-- Safe idempotent backfill from the existing DIMPRO account core.
do $$
begin
  if to_regclass('public.dimpro_account_users') is not null then
    insert into public.dimpro_users (
      public_user_code, auth_user_id, full_name, email, email_normalized,
      email_verified_at, phone, status, created_at, updated_at, legacy_account_user_id
    )
    select
      public.dimpro_generate_user_code(),
      a.auth_user_id,
      coalesce(nullif(trim(a.full_name), ''), split_part(a.email, '@', 1)),
      trim(a.email),
      public.dimpro_normalize_email(a.email),
      au.email_confirmed_at,
      null,
      'active',
      coalesce(a.created_at, now()),
      coalesce(a.updated_at, now()),
      a.id
    from public.dimpro_account_users a
    left join auth.users au on au.id = a.auth_user_id
    where a.email is not null
      and public.dimpro_normalize_email(a.email) <> ''
      and not exists (
        select 1 from public.dimpro_users u
        where u.legacy_account_user_id = a.id
           or u.email_normalized = public.dimpro_normalize_email(a.email)
      );

    update public.dimpro_account_users a
    set dimpro_user_id = u.id
    from public.dimpro_users u
    where a.dimpro_user_id is null
      and (
        u.legacy_account_user_id = a.id
        or u.email_normalized = public.dimpro_normalize_email(a.email)
      );
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.dimpro_companies') is not null then
    insert into public.dimpro_organizations (
      public_organization_code, legal_name, display_name, tax_number,
      status, created_at, updated_at, legacy_company_id
    )
    select
      public.dimpro_generate_organization_code(),
      c.name,
      c.name,
      c.tax_number,
      case when lower(coalesce(c.status, 'active')) in ('active','pending','suspended','disabled','archived')
        then lower(coalesce(c.status, 'active')) else 'active' end,
      coalesce(c.created_at, now()),
      coalesce(c.updated_at, now()),
      c.id
    from public.dimpro_companies c
    where not exists (
      select 1 from public.dimpro_organizations o where o.legacy_company_id = c.id
    );

    update public.dimpro_companies c
    set dimpro_organization_id = o.id
    from public.dimpro_organizations o
    where c.dimpro_organization_id is null and o.legacy_company_id = c.id;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.dimpro_memberships') is not null
    and to_regclass('public.dimpro_account_users') is not null
    and to_regclass('public.dimpro_companies') is not null then
    insert into public.dimpro_organization_memberships (
      user_id, organization_id, role_code, role_label, status,
      joined_at, is_primary, created_at, updated_at, legacy_membership_id
    )
    select
      a.dimpro_user_id,
      c.dimpro_organization_id,
      lower(coalesce(nullif(trim(m.role), ''), 'user')),
      m.role,
      case when lower(coalesce(m.status, 'active')) in ('invited','active','suspended','revoked')
        then lower(coalesce(m.status, 'active')) else 'active' end,
      coalesce(m.created_at, now()),
      false,
      coalesce(m.created_at, now()),
      now(),
      m.id
    from public.dimpro_memberships m
    join public.dimpro_account_users a on a.id = m.user_id and a.dimpro_user_id is not null
    join public.dimpro_companies c on c.id = m.company_id and c.dimpro_organization_id is not null
    where not exists (
      select 1 from public.dimpro_organization_memberships cm where cm.legacy_membership_id = m.id
    );

    -- Assign exactly one deterministic active primary organization membership per user.
    -- This is intentionally a second step so a multi-row legacy INSERT cannot violate the partial unique index.
    with ranked as (
      select
        candidate.id,
        row_number() over (
          partition by candidate.user_id
          order by candidate.joined_at, candidate.created_at, candidate.id
        ) as rn
      from public.dimpro_organization_memberships candidate
      where candidate.status = 'active'
        and not candidate.is_primary
        and not exists (
          select 1
          from public.dimpro_organization_memberships primary_membership
          where primary_membership.user_id = candidate.user_id
            and primary_membership.status = 'active'
            and primary_membership.is_primary
        )
    )
    update public.dimpro_organization_memberships membership
    set is_primary = true
    from ranked
    where membership.id = ranked.id
      and ranked.rn = 1;

    update public.dimpro_memberships m
    set dimpro_organization_membership_id = cm.id
    from public.dimpro_organization_memberships cm
    where m.dimpro_organization_membership_id is null and cm.legacy_membership_id = m.id;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.dimpro_subscriptions') is not null
    and to_regclass('public.dimpro_companies') is not null then
    insert into public.dimpro_licenses (
      public_license_code, owner_type, owner_organization_id, product_code,
      plan_code, status, activated_at, expires_at, max_devices,
      created_at, updated_at, legacy_subscription_id
    )
    select
      public.dimpro_generate_license_code(),
      'organization',
      c.dimpro_organization_id,
      upper(coalesce(nullif(trim(s.product_code), ''), 'DIMPRO')),
      nullif(trim(s.plan_code), ''),
      case lower(coalesce(s.status, 'pending'))
        when 'trialing' then 'trial'
        when 'trial' then 'trial'
        when 'active' then 'active'
        when 'expired' then 'expired'
        when 'suspended' then 'suspended'
        when 'revoked' then 'revoked'
        else 'pending' end,
      coalesce(s.created_at, now()),
      s.current_period_end,
      1,
      coalesce(s.created_at, now()),
      coalesce(s.updated_at, now()),
      s.id
    from public.dimpro_subscriptions s
    join public.dimpro_companies c on c.id = s.company_id and c.dimpro_organization_id is not null
    where not exists (
      select 1 from public.dimpro_licenses l where l.legacy_subscription_id = s.id
    );

    update public.dimpro_subscriptions s
    set dimpro_license_id = l.id
    from public.dimpro_licenses l
    where s.dimpro_license_id is null and l.legacy_subscription_id = s.id;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.dimpro_product_access') is not null
    and to_regclass('public.dimpro_subscriptions') is not null
    and to_regclass('public.dimpro_companies') is not null then
    insert into public.dimpro_license_modules (
      license_id, module_code, enabled, limits, feature_flags,
      valid_until, created_at, updated_at, legacy_product_access_id
    )
    select
      selected_license.id,
      upper(pa.product_code),
      lower(coalesce(pa.status, 'active')) in ('active','trial'),
      '{}'::jsonb,
      jsonb_build_object('legacyRole', pa.role),
      pa.valid_until,
      coalesce(pa.created_at, now()),
      coalesce(pa.updated_at, now()),
      pa.id
    from public.dimpro_product_access pa
    join lateral (
      select l.id
      from public.dimpro_licenses l
      where (
        pa.company_id is not null
        and l.owner_type = 'organization'
        and l.owner_organization_id = (
          select c.dimpro_organization_id from public.dimpro_companies c where c.id = pa.company_id
        )
      )
      order by (l.product_code = upper(pa.product_code)) desc, l.created_at desc
      limit 1
    ) selected_license on true
    where not exists (
      select 1 from public.dimpro_license_modules lm where lm.legacy_product_access_id = pa.id
    )
    on conflict (license_id, module_code) do nothing;

    update public.dimpro_product_access pa
    set dimpro_license_module_id = lm.id
    from public.dimpro_license_modules lm
    where pa.dimpro_license_module_id is null and lm.legacy_product_access_id = pa.id;
  end if;
end;
$$;

-- Safe Project Core bridge and backfill. The existing project_core tables remain intact.
-- Clean-install safety: legacy account/company tables are optional. A fresh DIMPRO DEV
-- database may have Project Core without the older account-core compatibility tables.
do $$
begin
  if to_regclass('public.project_core_projects') is not null then
    if to_regclass('public.dimpro_companies') is not null
      and to_regclass('public.dimpro_account_users') is not null then
      insert into public.dimpro_projects (
        public_project_code, name, short_name, description, organization_id,
        status, project_drop_enabled, created_by, created_at, updated_at,
        legacy_project_core_id, legacy_project_code
      )
      select
        public.dimpro_generate_project_code(),
        pc.name,
        null,
        coalesce(pc.description, ''),
        (
          select c.dimpro_organization_id
          from public.dimpro_companies c
          where c.id::text = pc.organization_id
          limit 1
        ),
        case lower(coalesce(pc.status, 'draft'))
          when 'read_only' then 'read_only'
          when 'deletion_scheduled' then 'deletion_scheduled'
          when 'draft' then 'draft'
          when 'active' then 'active'
          when 'closing' then 'closing'
          when 'archived' then 'archived'
          when 'deleted' then 'deleted'
          else 'draft'
        end,
        false,
        (
          select a.dimpro_user_id
          from public.dimpro_account_users a
          where a.id::text = pc.created_by or a.auth_user_id::text = pc.created_by
          limit 1
        ),
        coalesce(pc.created_at, now()),
        coalesce(pc.updated_at, now()),
        pc.id,
        pc.code
      from public.project_core_projects pc
      where not exists (
        select 1 from public.dimpro_projects p where p.legacy_project_core_id = pc.id
      );
    else
      insert into public.dimpro_projects (
        public_project_code, name, short_name, description, organization_id,
        status, project_drop_enabled, created_by, created_at, updated_at,
        legacy_project_core_id, legacy_project_code
      )
      select
        public.dimpro_generate_project_code(),
        pc.name,
        null,
        coalesce(pc.description, ''),
        null,
        case lower(coalesce(pc.status, 'draft'))
          when 'read_only' then 'read_only'
          when 'deletion_scheduled' then 'deletion_scheduled'
          when 'draft' then 'draft'
          when 'active' then 'active'
          when 'closing' then 'closing'
          when 'archived' then 'archived'
          when 'deleted' then 'deleted'
          else 'draft'
        end,
        false,
        null,
        coalesce(pc.created_at, now()),
        coalesce(pc.updated_at, now()),
        pc.id,
        pc.code
      from public.project_core_projects pc
      where not exists (
        select 1 from public.dimpro_projects p where p.legacy_project_core_id = pc.id
      );
    end if;

    update public.project_core_projects pc
    set dimpro_project_id = p.id
    from public.dimpro_projects p
    where pc.dimpro_project_id is null and p.legacy_project_core_id = pc.id;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.project_core_memberships') is not null
    and to_regclass('public.project_core_projects') is not null
    and to_regclass('public.dimpro_account_users') is not null then
    insert into public.dimpro_project_memberships (
      project_id, user_id, organization_id, role_code,
      can_view, can_upload_to_drop, can_download, can_manage_inbox,
      status, valid_from, valid_until, created_at, updated_at,
      legacy_project_core_membership_id
    )
    select
      pc.dimpro_project_id,
      resolved_user.dimpro_user_id,
      p.organization_id,
      lower(pm.role),
      true,
      upper(trim(coalesce(pm.role, ''))) in ('OWNER','PROJECT_MANAGER','CONTRIBUTOR'),
      upper(trim(coalesce(pm.role, ''))) in ('OWNER','PROJECT_MANAGER','CONTRIBUTOR','REVIEWER','VIEWER'),
      upper(trim(coalesce(pm.role, ''))) in ('OWNER','PROJECT_MANAGER'),
      case lower(coalesce(pm.status, 'invited'))
        when 'invited' then 'invited'
        when 'active' then 'active'
        when 'suspended' then 'suspended'
        when 'revoked' then 'revoked'
        else 'invited'
      end,
      coalesce(pm.invited_at, now()),
      null,
      coalesce(pm.invited_at, now()),
      coalesce(pm.updated_at, now()),
      pm.id
    from public.project_core_memberships pm
    join public.project_core_projects pc on pc.id = pm.project_id and pc.dimpro_project_id is not null
    join public.dimpro_projects p on p.id = pc.dimpro_project_id
    join lateral (
      select a.dimpro_user_id
      from public.dimpro_account_users a
      where a.dimpro_user_id is not null
        and (
          a.id::text = pm.user_id
          or a.auth_user_id::text = pm.user_id
          or (pm.email is not null and public.dimpro_normalize_email(a.email) = public.dimpro_normalize_email(pm.email))
        )
      order by (a.id::text = pm.user_id) desc, (a.auth_user_id::text = pm.user_id) desc
      limit 1
    ) resolved_user on true
    where not exists (
      select 1 from public.dimpro_project_memberships cm
      where cm.legacy_project_core_membership_id = pm.id
    )
    on conflict do nothing;

    update public.project_core_memberships pm
    set dimpro_project_membership_id = cm.id
    from public.dimpro_project_memberships cm
    where pm.dimpro_project_membership_id is null
      and cm.legacy_project_core_membership_id = pm.id;
  end if;
end;
$$;

alter table public.dimpro_identity_schema_meta enable row level security;
alter table public.dimpro_users enable row level security;
alter table public.dimpro_organizations enable row level security;
alter table public.dimpro_organization_memberships enable row level security;
alter table public.dimpro_licenses enable row level security;
alter table public.dimpro_license_modules enable row level security;
alter table public.dimpro_projects enable row level security;
alter table public.dimpro_project_memberships enable row level security;

revoke all on public.dimpro_identity_schema_meta from public, anon, authenticated;
revoke all on public.dimpro_users from public, anon, authenticated;
revoke all on public.dimpro_organizations from public, anon, authenticated;
revoke all on public.dimpro_organization_memberships from public, anon, authenticated;
revoke all on public.dimpro_licenses from public, anon, authenticated;
revoke all on public.dimpro_license_modules from public, anon, authenticated;
revoke all on public.dimpro_projects from public, anon, authenticated;
revoke all on public.dimpro_project_memberships from public, anon, authenticated;

grant select on public.dimpro_users to authenticated;
grant select on public.dimpro_organizations to authenticated;
grant select on public.dimpro_organization_memberships to authenticated;
grant select on public.dimpro_licenses to authenticated;
grant select on public.dimpro_license_modules to authenticated;
grant select on public.dimpro_projects to authenticated;
grant select on public.dimpro_project_memberships to authenticated;

drop policy if exists dimpro_users_select_self on public.dimpro_users;
create policy dimpro_users_select_self on public.dimpro_users
for select to authenticated
using (id = public.dimpro_current_user_id());

drop policy if exists dimpro_organizations_select_member on public.dimpro_organizations;
create policy dimpro_organizations_select_member on public.dimpro_organizations
for select to authenticated
using (public.dimpro_is_organization_member(id));

drop policy if exists dimpro_org_memberships_select_authorized on public.dimpro_organization_memberships;
create policy dimpro_org_memberships_select_authorized on public.dimpro_organization_memberships
for select to authenticated
using (
  user_id = public.dimpro_current_user_id()
  or public.dimpro_is_organization_member(organization_id)
);

drop policy if exists dimpro_licenses_select_owner on public.dimpro_licenses;
create policy dimpro_licenses_select_owner on public.dimpro_licenses
for select to authenticated
using (
  owner_user_id = public.dimpro_current_user_id()
  or (owner_organization_id is not null and public.dimpro_is_organization_member(owner_organization_id))
);

drop policy if exists dimpro_license_modules_select_owner on public.dimpro_license_modules;
create policy dimpro_license_modules_select_owner on public.dimpro_license_modules
for select to authenticated
using (
  exists (
    select 1 from public.dimpro_licenses l
    where l.id = license_id
      and (
        l.owner_user_id = public.dimpro_current_user_id()
        or (l.owner_organization_id is not null and public.dimpro_is_organization_member(l.owner_organization_id))
      )
  )
);

drop policy if exists dimpro_projects_select_member on public.dimpro_projects;
create policy dimpro_projects_select_member on public.dimpro_projects
for select to authenticated
using (
  public.dimpro_has_project_permission(id, 'view')
  or (organization_id is not null and public.dimpro_is_organization_member(organization_id))
);

drop policy if exists dimpro_project_memberships_select_authorized on public.dimpro_project_memberships;
create policy dimpro_project_memberships_select_authorized on public.dimpro_project_memberships
for select to authenticated
using (
  user_id = public.dimpro_current_user_id()
  or public.dimpro_has_project_permission(project_id, 'view')
);

revoke all on function public.dimpro_create_user(text,text,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.dimpro_create_organization(text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.dimpro_create_license(text,uuid,uuid,text,text,text,timestamptz,timestamptz,integer) from public, anon, authenticated;
revoke all on function public.dimpro_create_project(text,text,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.dimpro_create_user(text,text,uuid,text,uuid) to service_role;
grant execute on function public.dimpro_create_organization(text,text,text,text,text,text) to service_role;
grant execute on function public.dimpro_create_license(text,uuid,uuid,text,text,text,timestamptz,timestamptz,integer) to service_role;
grant execute on function public.dimpro_create_project(text,text,uuid,uuid,text) to service_role;

insert into public.dimpro_identity_schema_meta (
  component, schema_version, migration_count, bootstrap_id, metadata, updated_at
) values (
  'dimpro-identity-core',
  '0.1.0',
  1,
  'dimpro-identity-license-project-core-v010-20260806',
  jsonb_build_object(
    'canonicalUserTable', 'dimpro_users',
    'canonicalOrganizationTable', 'dimpro_organizations',
    'canonicalLicenseTable', 'dimpro_licenses',
    'canonicalProjectTable', 'dimpro_projects',
    'legacyAccountBridge', to_regclass('public.dimpro_account_users') is not null,
    'legacyProjectBridge', to_regclass('public.project_core_projects') is not null,
    'authDimproImplementationDeferred', true
  ),
  now()
)
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = greatest(public.dimpro_identity_schema_meta.migration_count, excluded.migration_count),
  bootstrap_id = excluded.bootstrap_id,
  metadata = excluded.metadata,
  updated_at = now();

commit;

-- ===== migration 2: Send/project access =====

-- DIMPRO / DIMPROVER central Send entitlement, project Drop access and audit core 0.1.0
-- Requires: 20260806213000_dimpro_identity_license_project_core_v010.sql

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.dimpro_project_drop_settings (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.dimpro_projects(id) on delete cascade,
  enabled boolean not null default false,
  drive_folder_id uuid null,
  incoming_folder_name text not null default 'Beérkező Drop',
  preserve_groups boolean not null default true,
  require_virus_scan boolean not null default true,
  notify_project_admins boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dimpro_project_drop_settings_project_unique unique (project_id),
  constraint dimpro_project_drop_settings_folder_name_check check (length(trim(incoming_folder_name)) between 1 and 160)
);

create table if not exists public.dimpro_send_entitlements (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.dimpro_users(id) on delete cascade,
  license_id uuid not null references public.dimpro_licenses(id) on delete cascade,
  organization_id uuid null references public.dimpro_organizations(id) on delete set null,
  code_hash text not null,
  code_hint text null,
  status text not null default 'active',
  valid_from timestamptz not null default now(),
  expires_at timestamptz null,
  can_use_standard_send boolean not null default false,
  can_use_quick_image_send boolean not null default false,
  can_use_image_groups boolean not null default false,
  can_use_file_comments boolean not null default false,
  can_use_project_drop boolean not null default false,
  recipient_mode text not null default 'approved_list',
  default_recipient_id uuid null,
  max_recipients integer not null default 1,
  max_package_size_bytes bigint not null default 262144000,
  monthly_send_limit integer null,
  current_month_send_count integer not null default 0,
  send_count_month date not null default date_trunc('month', current_date)::date,
  last_used_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz null,
  revoked_by uuid null references public.dimpro_users(id) on delete set null,
  constraint dimpro_send_entitlements_code_hash_unique unique (code_hash),
  constraint dimpro_send_entitlements_hash_check check (code_hash ~ '^[a-f0-9]{64}$'),
  constraint dimpro_send_entitlements_status_check check (status in ('pending','active','suspended','expired','revoked')),
  constraint dimpro_send_entitlements_recipient_mode_check check (recipient_mode in ('locked_default','approved_list','free_entry')),
  constraint dimpro_send_entitlements_dates_check check (expires_at is null or expires_at >= valid_from),
  constraint dimpro_send_entitlements_max_recipients_check check (max_recipients between 1 and 100),
  constraint dimpro_send_entitlements_max_package_check check (max_package_size_bytes between 1 and 5368709120),
  constraint dimpro_send_entitlements_monthly_limit_check check (monthly_send_limit is null or monthly_send_limit >= 1),
  constraint dimpro_send_entitlements_month_count_check check (current_month_send_count >= 0)
);

create index if not exists dimpro_send_entitlements_user_status_idx
  on public.dimpro_send_entitlements (user_id, status);
create index if not exists dimpro_send_entitlements_license_status_idx
  on public.dimpro_send_entitlements (license_id, status);
create index if not exists dimpro_send_entitlements_org_status_idx
  on public.dimpro_send_entitlements (organization_id, status) where organization_id is not null;
create index if not exists dimpro_send_entitlements_validity_idx
  on public.dimpro_send_entitlements (status, valid_from, expires_at);

create table if not exists public.dimpro_send_recipients (
  id uuid primary key default extensions.gen_random_uuid(),
  entitlement_id uuid not null references public.dimpro_send_entitlements(id) on delete cascade,
  recipient_name text not null,
  recipient_email text not null,
  recipient_email_normalized text not null,
  organization_name text null,
  label text null,
  is_default boolean not null default false,
  is_locked boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dimpro_send_recipients_email_check check (
    recipient_email_normalized = public.dimpro_normalize_email(recipient_email)
    and recipient_email_normalized <> ''
  )
);

create unique index if not exists dimpro_send_recipients_email_unique
  on public.dimpro_send_recipients (entitlement_id, recipient_email_normalized)
  where active;
create unique index if not exists dimpro_send_recipients_default_unique
  on public.dimpro_send_recipients (entitlement_id)
  where is_default and active;
create index if not exists dimpro_send_recipients_entitlement_active_idx
  on public.dimpro_send_recipients (entitlement_id, active);

alter table public.dimpro_send_entitlements
  drop constraint if exists dimpro_send_entitlements_default_recipient_fk;
alter table public.dimpro_send_entitlements
  add constraint dimpro_send_entitlements_default_recipient_fk
  foreign key (default_recipient_id) references public.dimpro_send_recipients(id)
  on delete set null deferrable initially deferred;

create table if not exists public.dimpro_access_audit_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid null references public.dimpro_users(id) on delete set null,
  organization_id uuid null references public.dimpro_organizations(id) on delete set null,
  license_id uuid null references public.dimpro_licenses(id) on delete set null,
  project_id uuid null references public.dimpro_projects(id) on delete set null,
  entitlement_id uuid null references public.dimpro_send_entitlements(id) on delete set null,
  event_type text not null,
  success boolean not null,
  ip_hash text null,
  user_agent text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dimpro_access_audit_created_idx
  on public.dimpro_access_audit_logs (created_at desc);
create index if not exists dimpro_access_audit_user_created_idx
  on public.dimpro_access_audit_logs (user_id, created_at desc) where user_id is not null;
create index if not exists dimpro_access_audit_project_created_idx
  on public.dimpro_access_audit_logs (project_id, created_at desc) where project_id is not null;
create index if not exists dimpro_access_audit_entitlement_created_idx
  on public.dimpro_access_audit_logs (entitlement_id, created_at desc) where entitlement_id is not null;
create index if not exists dimpro_access_audit_event_created_idx
  on public.dimpro_access_audit_logs (event_type, created_at desc);

create table if not exists public.dimpro_access_rate_limits (
  scope text not null,
  subject_hash text not null,
  failure_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  last_failed_at timestamptz null,
  locked_until timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (scope, subject_hash),
  constraint dimpro_access_rate_limits_scope_check check (scope in ('send_code','project_code')),
  constraint dimpro_access_rate_limits_failure_check check (failure_count >= 0)
);

create index if not exists dimpro_access_rate_limits_locked_idx
  on public.dimpro_access_rate_limits (scope, locked_until)
  where locked_until is not null;

create or replace function public.dimpro_prepare_send_recipient_row()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.recipient_email := trim(new.recipient_email);
  new.recipient_email_normalized := public.dimpro_normalize_email(new.recipient_email);
  return new;
end;
$$;

drop trigger if exists dimpro_send_recipients_prepare_trigger on public.dimpro_send_recipients;
create trigger dimpro_send_recipients_prepare_trigger
before insert or update of recipient_email on public.dimpro_send_recipients
for each row execute function public.dimpro_prepare_send_recipient_row();

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'dimpro_project_drop_settings',
    'dimpro_send_entitlements',
    'dimpro_send_recipients',
    'dimpro_access_rate_limits'
  ] loop
    execute format('drop trigger if exists %I_updated_at_trigger on public.%I', v_table, v_table);
    execute format('create trigger %I_updated_at_trigger before update on public.%I for each row execute function public.dimpro_set_updated_at()', v_table, v_table);
  end loop;
end;
$$;

create or replace function public.dimpro_license_module_enabled(
  p_license_id uuid,
  p_module_code text,
  p_at timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.dimpro_license_modules lm
    join public.dimpro_licenses l on l.id = lm.license_id
    where lm.license_id = p_license_id
      and lm.module_code = upper(trim(p_module_code))
      and lm.enabled
      and (lm.valid_from is null or lm.valid_from <= p_at)
      and (lm.valid_until is null or lm.valid_until >= p_at)
      and l.status in ('active','trial')
      and (l.activated_at is null or l.activated_at <= p_at)
      and (l.expires_at is null or l.expires_at >= p_at)
  )
$$;

create or replace function public.dimpro_rate_limit_subject_hash(
  p_scope text,
  p_subject text,
  p_ip_hash text
)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(
    extensions.digest(
      lower(trim(coalesce(p_scope, ''))) || ':'
      || coalesce(trim(p_subject), '') || ':'
      || coalesce(trim(p_ip_hash), ''),
      'sha256'
    ),
    'hex'
  )
$$;

create or replace function public.dimpro_is_access_locked(
  p_scope text,
  p_subject_hash text
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.dimpro_access_rate_limits r
    where r.scope = p_scope
      and r.subject_hash = p_subject_hash
      and r.locked_until is not null
      and r.locked_until > now()
  )
$$;

create or replace function public.dimpro_record_access_failure(
  p_scope text,
  p_subject_hash text,
  p_max_failures integer default 5,
  p_window_minutes integer default 15,
  p_lock_minutes integer default 15
)
returns timestamptz
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_row public.dimpro_access_rate_limits;
  v_now timestamptz := now();
  v_count integer;
  v_window_start timestamptz;
  v_locked_until timestamptz;
begin
  if p_max_failures < 1 or p_window_minutes < 1 or p_lock_minutes < 1 then
    raise exception 'DIMPRO_INVALID_RATE_LIMIT_CONFIGURATION' using errcode = '22023';
  end if;

  select * into v_row
  from public.dimpro_access_rate_limits
  where scope = p_scope and subject_hash = p_subject_hash
  for update;

  if v_row.scope is null or v_row.window_started_at < v_now - make_interval(mins => p_window_minutes) then
    v_count := 1;
    v_window_start := v_now;
  else
    v_count := v_row.failure_count + 1;
    v_window_start := v_row.window_started_at;
  end if;

  if v_count >= p_max_failures then
    v_locked_until := v_now + make_interval(mins => p_lock_minutes);
  else
    v_locked_until := case
      when v_row.locked_until is not null and v_row.locked_until > v_now then v_row.locked_until
      else null
    end;
  end if;

  insert into public.dimpro_access_rate_limits (
    scope, subject_hash, failure_count, window_started_at,
    last_failed_at, locked_until, updated_at
  ) values (
    p_scope, p_subject_hash, v_count, v_window_start,
    v_now, v_locked_until, v_now
  )
  on conflict (scope, subject_hash) do update set
    failure_count = excluded.failure_count,
    window_started_at = excluded.window_started_at,
    last_failed_at = excluded.last_failed_at,
    locked_until = excluded.locked_until,
    updated_at = excluded.updated_at;

  return v_locked_until;
end;
$$;

create or replace function public.dimpro_clear_access_failures(
  p_scope text,
  p_subject_hash text
)
returns void
language sql
security definer
set search_path = public
set row_security = off
as $$
  delete from public.dimpro_access_rate_limits
  where scope = p_scope and subject_hash = p_subject_hash
$$;

create or replace function public.dimpro_entitlement_is_active(
  p_entitlement_id uuid,
  p_at timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.dimpro_send_entitlements e
    join public.dimpro_users u on u.id = e.user_id
    join public.dimpro_licenses l on l.id = e.license_id
    where e.id = p_entitlement_id
      and e.status = 'active'
      and e.valid_from <= p_at
      and (e.expires_at is null or e.expires_at >= p_at)
      and u.status = 'active'
      and u.email_verified_at is not null
      and l.status in ('active','trial')
      and (l.activated_at is null or l.activated_at <= p_at)
      and (l.expires_at is null or l.expires_at >= p_at)
      and (
        e.monthly_send_limit is null
        or e.send_count_month < date_trunc('month', p_at)::date
        or e.current_month_send_count < e.monthly_send_limit
      )
  )
$$;

create or replace function public.dimpro_allowed_projects_for_entitlement(
  p_entitlement_id uuid
)
returns table (
  id uuid,
  public_code text,
  name text,
  can_upload_to_drop boolean
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    p.id,
    p.public_project_code,
    p.name,
    pm.can_upload_to_drop
  from public.dimpro_send_entitlements e
  join public.dimpro_project_memberships pm on pm.user_id = e.user_id
  join public.dimpro_projects p on p.id = pm.project_id
  join public.dimpro_project_drop_settings ds on ds.project_id = p.id
  where e.id = p_entitlement_id
    and public.dimpro_entitlement_is_active(e.id)
    and e.can_use_project_drop
    and public.dimpro_license_module_enabled(e.license_id, 'DROP_PROJECT_INBOX')
    and pm.status = 'active'
    and pm.can_upload_to_drop
    and pm.valid_from <= now()
    and (pm.valid_until is null or pm.valid_until >= now())
    and p.status = 'active'
    and p.project_drop_enabled
    and ds.enabled
  order by p.name, p.public_project_code
$$;

create or replace function public.dimpro_project_drop_access_allowed(
  p_entitlement_id uuid,
  p_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.dimpro_allowed_projects_for_entitlement(p_entitlement_id) allowed
    where allowed.id = p_project_id
  )
$$;

create or replace function public.dimpro_verify_send_entitlement(
  p_code_hash text,
  p_ip_hash text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
set row_security = off
as $$
declare
  v_subject_hash text;
  v_entitlement public.dimpro_send_entitlements;
  v_user public.dimpro_users;
  v_license public.dimpro_licenses;
  v_org public.dimpro_organizations;
  v_default_recipient public.dimpro_send_recipients;
  v_projects jsonb := '[]'::jsonb;
  v_locked_until timestamptz;
  v_can_standard boolean;
  v_can_quick boolean;
  v_can_project boolean;
begin
  v_subject_hash := public.dimpro_rate_limit_subject_hash('send_code', p_code_hash, p_ip_hash);

  if public.dimpro_is_access_locked('send_code', v_subject_hash) then
    insert into public.dimpro_access_audit_logs (
      event_type, success, ip_hash, user_agent, metadata
    ) values (
      'send_code_locked', false, p_ip_hash, left(p_user_agent, 500),
      jsonb_build_object('reason', 'rate_limited')
    );
    return jsonb_build_object(
      'ok', false,
      'error', 'A küldési jogosultságkód nem használható.'
    );
  end if;

  select e.* into v_entitlement
  from public.dimpro_send_entitlements e
  where e.code_hash = lower(trim(p_code_hash))
  limit 1;

  if v_entitlement.id is null or not public.dimpro_entitlement_is_active(v_entitlement.id) then
    v_locked_until := public.dimpro_record_access_failure('send_code', v_subject_hash, 5, 15, 15);
    insert into public.dimpro_access_audit_logs (
      user_id, organization_id, license_id, entitlement_id,
      event_type, success, ip_hash, user_agent, metadata
    ) values (
      v_entitlement.user_id, v_entitlement.organization_id, v_entitlement.license_id, v_entitlement.id,
      case when v_locked_until is not null then 'send_code_locked' else 'send_code_failed' end,
      false, p_ip_hash, left(p_user_agent, 500),
      jsonb_build_object('reason', 'invalid_or_inactive')
    );
    return jsonb_build_object(
      'ok', false,
      'error', 'A küldési jogosultságkód nem használható.'
    );
  end if;

  select * into v_user from public.dimpro_users where id = v_entitlement.user_id;
  select * into v_license from public.dimpro_licenses where id = v_entitlement.license_id;

  select o.* into v_org
  from public.dimpro_organizations o
  where o.id = coalesce(
    v_entitlement.organization_id,
    v_license.owner_organization_id,
    (
      select m.organization_id
      from public.dimpro_organization_memberships m
      where m.user_id = v_entitlement.user_id
        and m.status = 'active'
        and (m.access_ends_at is null or m.access_ends_at >= now())
      order by m.is_primary desc, m.joined_at
      limit 1
    )
  );

  select r.* into v_default_recipient
  from public.dimpro_send_recipients r
  where r.entitlement_id = v_entitlement.id
    and r.active
    and (r.id = v_entitlement.default_recipient_id or r.is_default)
  order by (r.id = v_entitlement.default_recipient_id) desc, r.is_default desc
  limit 1;

  v_can_standard := v_entitlement.can_use_standard_send
    and public.dimpro_license_module_enabled(v_entitlement.license_id, 'DROP_SEND');
  v_can_quick := v_entitlement.can_use_quick_image_send
    and public.dimpro_license_module_enabled(v_entitlement.license_id, 'DROP_QUICK_IMAGE_SEND');
  v_can_project := v_entitlement.can_use_project_drop
    and public.dimpro_license_module_enabled(v_entitlement.license_id, 'DROP_PROJECT_INBOX');

  if not (v_can_standard or v_can_quick or v_can_project) then
    v_locked_until := public.dimpro_record_access_failure('send_code', v_subject_hash, 5, 15, 15);
    insert into public.dimpro_access_audit_logs (
      user_id, organization_id, license_id, entitlement_id,
      event_type, success, ip_hash, user_agent, metadata
    ) values (
      v_user.id, v_org.id, v_license.id, v_entitlement.id,
      'send_code_failed', false, p_ip_hash, left(p_user_agent, 500),
      jsonb_build_object('reason', 'no_enabled_send_module')
    );
    return jsonb_build_object(
      'ok', false,
      'error', 'A küldési jogosultságkód nem használható.'
    );
  end if;

  perform public.dimpro_clear_access_failures('send_code', v_subject_hash);

  if v_entitlement.send_count_month < date_trunc('month', current_date)::date then
    update public.dimpro_send_entitlements
    set current_month_send_count = 0,
        send_count_month = date_trunc('month', current_date)::date,
        last_used_at = now()
    where id = v_entitlement.id;
    v_entitlement.current_month_send_count := 0;
    v_entitlement.send_count_month := date_trunc('month', current_date)::date;
  else
    update public.dimpro_send_entitlements set last_used_at = now() where id = v_entitlement.id;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', allowed.id,
        'publicCode', allowed.public_code,
        'name', allowed.name,
        'canUploadToDrop', allowed.can_upload_to_drop
      ) order by allowed.name
    ),
    '[]'::jsonb
  ) into v_projects
  from public.dimpro_allowed_projects_for_entitlement(v_entitlement.id) allowed;

  insert into public.dimpro_access_audit_logs (
    user_id, organization_id, license_id, entitlement_id,
    event_type, success, ip_hash, user_agent, metadata
  ) values (
    v_user.id, v_org.id, v_license.id, v_entitlement.id,
    'send_code_verified', true, p_ip_hash, left(p_user_agent, 500),
    jsonb_build_object(
      'recipientMode', v_entitlement.recipient_mode,
      'projectCount', jsonb_array_length(v_projects)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'user', jsonb_build_object(
      'id', v_user.id,
      'publicCode', v_user.public_user_code,
      'fullName', v_user.full_name,
      'email', v_user.email,
      'organizationName', v_org.display_name
    ),
    'entitlement', jsonb_build_object(
      'id', v_entitlement.id,
      'canUseStandardSend', v_can_standard,
      'canUseQuickImageSend', v_can_quick,
      'canUseImageGroups', v_entitlement.can_use_image_groups,
      'canUseFileComments', v_entitlement.can_use_file_comments,
      'canUseProjectDrop', v_can_project,
      'recipientMode', v_entitlement.recipient_mode,
      'maxRecipients', v_entitlement.max_recipients,
      'maxPackageSizeBytes', v_entitlement.max_package_size_bytes,
      'monthlySendLimit', v_entitlement.monthly_send_limit,
      'currentMonthSendCount', v_entitlement.current_month_send_count
    ),
    'defaultRecipient', case
      when v_default_recipient.id is null then null
      else jsonb_build_object(
        'id', v_default_recipient.id,
        'name', v_default_recipient.recipient_name,
        'email', v_default_recipient.recipient_email,
        'organizationName', v_default_recipient.organization_name,
        'label', v_default_recipient.label,
        'locked', v_default_recipient.is_locked
      )
    end,
    'projects', v_projects
  );
end;
$$;

create or replace function public.dimpro_verify_project_code(
  p_entitlement_id uuid,
  p_public_project_code text,
  p_ip_hash text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
set row_security = off
as $$
declare
  v_subject_hash text;
  v_project public.dimpro_projects;
  v_settings public.dimpro_project_drop_settings;
  v_entitlement public.dimpro_send_entitlements;
  v_locked_until timestamptz;
begin
  select * into v_entitlement
  from public.dimpro_send_entitlements
  where id = p_entitlement_id;

  v_subject_hash := public.dimpro_rate_limit_subject_hash(
    'project_code',
    coalesce(p_entitlement_id::text, '') || ':' || upper(trim(coalesce(p_public_project_code, ''))),
    p_ip_hash
  );

  if public.dimpro_is_access_locked('project_code', v_subject_hash) then
    insert into public.dimpro_access_audit_logs (
      user_id, organization_id, license_id, entitlement_id,
      event_type, success, ip_hash, user_agent, metadata
    ) values (
      v_entitlement.user_id, v_entitlement.organization_id, v_entitlement.license_id, v_entitlement.id,
      'project_code_failed', false, p_ip_hash, left(p_user_agent, 500),
      jsonb_build_object('reason', 'rate_limited')
    );
    return jsonb_build_object('ok', false, 'error', 'A projektkód nem használható.');
  end if;

  select p.* into v_project
  from public.dimpro_projects p
  where p.public_project_code = upper(trim(p_public_project_code))
    and public.dimpro_project_drop_access_allowed(p_entitlement_id, p.id)
  limit 1;

  if v_project.id is null then
    v_locked_until := public.dimpro_record_access_failure('project_code', v_subject_hash, 5, 15, 15);
    insert into public.dimpro_access_audit_logs (
      user_id, organization_id, license_id, entitlement_id,
      event_type, success, ip_hash, user_agent, metadata
    ) values (
      v_entitlement.user_id, v_entitlement.organization_id, v_entitlement.license_id, v_entitlement.id,
      'project_code_failed', false, p_ip_hash, left(p_user_agent, 500),
      jsonb_build_object('reason', 'not_found_or_not_authorized', 'locked', v_locked_until is not null)
    );
    return jsonb_build_object('ok', false, 'error', 'A projektkód nem használható.');
  end if;

  select * into v_settings
  from public.dimpro_project_drop_settings
  where project_id = v_project.id and enabled;

  if v_settings.id is null then
    v_locked_until := public.dimpro_record_access_failure('project_code', v_subject_hash, 5, 15, 15);
    insert into public.dimpro_access_audit_logs (
      user_id, organization_id, license_id, project_id, entitlement_id,
      event_type, success, ip_hash, user_agent, metadata
    ) values (
      v_entitlement.user_id, v_entitlement.organization_id, v_entitlement.license_id, v_project.id, v_entitlement.id,
      'project_code_failed', false, p_ip_hash, left(p_user_agent, 500),
      jsonb_build_object('reason', 'drop_destination_disabled')
    );
    return jsonb_build_object('ok', false, 'error', 'A projektkód nem használható.');
  end if;

  perform public.dimpro_clear_access_failures('project_code', v_subject_hash);

  insert into public.dimpro_access_audit_logs (
    user_id, organization_id, license_id, project_id, entitlement_id,
    event_type, success, ip_hash, user_agent, metadata
  ) values (
    v_entitlement.user_id, v_entitlement.organization_id, v_entitlement.license_id, v_project.id, v_entitlement.id,
    'project_code_verified', true, p_ip_hash, left(p_user_agent, 500),
    jsonb_build_object('destination', 'project_drop_inbox')
  );

  return jsonb_build_object(
    'ok', true,
    'project', jsonb_build_object(
      'id', v_project.id,
      'publicCode', v_project.public_project_code,
      'name', v_project.name
    ),
    'destination', jsonb_build_object(
      'type', 'project_drop_inbox',
      'label', v_settings.incoming_folder_name,
      'driveFolderId', v_settings.drive_folder_id,
      'preserveGroups', v_settings.preserve_groups,
      'requireVirusScan', v_settings.require_virus_scan,
      'notifyProjectAdmins', v_settings.notify_project_admins
    )
  );
end;
$$;

create or replace function public.dimpro_record_send_completed(
  p_entitlement_id uuid,
  p_project_id uuid default null,
  p_package_size_bytes bigint default 0,
  p_recipient_count integer default 1,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_entitlement public.dimpro_send_entitlements;
  v_new_count integer;
begin
  select * into v_entitlement
  from public.dimpro_send_entitlements
  where id = p_entitlement_id
  for update;

  if v_entitlement.id is null or not public.dimpro_entitlement_is_active(v_entitlement.id) then
    raise exception 'DIMPRO_SEND_ENTITLEMENT_NOT_ACTIVE' using errcode = '42501';
  end if;
  if p_package_size_bytes < 0 or p_package_size_bytes > v_entitlement.max_package_size_bytes then
    raise exception 'DIMPRO_SEND_PACKAGE_SIZE_LIMIT' using errcode = '22023';
  end if;
  if p_recipient_count < 1 or p_recipient_count > v_entitlement.max_recipients then
    raise exception 'DIMPRO_SEND_RECIPIENT_LIMIT' using errcode = '22023';
  end if;
  if p_project_id is not null and not public.dimpro_project_drop_access_allowed(p_entitlement_id, p_project_id) then
    raise exception 'DIMPRO_PROJECT_DROP_NOT_ALLOWED' using errcode = '42501';
  end if;

  if v_entitlement.send_count_month < date_trunc('month', current_date)::date then
    v_new_count := 1;
    update public.dimpro_send_entitlements
    set current_month_send_count = v_new_count,
        send_count_month = date_trunc('month', current_date)::date,
        last_used_at = now()
    where id = p_entitlement_id;
  else
    v_new_count := v_entitlement.current_month_send_count + 1;
    if v_entitlement.monthly_send_limit is not null and v_new_count > v_entitlement.monthly_send_limit then
      raise exception 'DIMPRO_SEND_MONTHLY_LIMIT' using errcode = '42501';
    end if;
    update public.dimpro_send_entitlements
    set current_month_send_count = v_new_count,
        last_used_at = now()
    where id = p_entitlement_id;
  end if;

  insert into public.dimpro_access_audit_logs (
    user_id, organization_id, license_id, project_id, entitlement_id,
    event_type, success, metadata
  ) values (
    v_entitlement.user_id, v_entitlement.organization_id, v_entitlement.license_id,
    p_project_id, v_entitlement.id, 'send_completed', true,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'packageSizeBytes', p_package_size_bytes,
      'recipientCount', p_recipient_count,
      'currentMonthSendCount', v_new_count
    )
  );

  return jsonb_build_object('ok', true, 'currentMonthSendCount', v_new_count);
end;
$$;

-- Create disabled project Drop settings for all canonical projects. Activation remains an explicit admin action.
insert into public.dimpro_project_drop_settings (project_id, enabled)
select p.id, false
from public.dimpro_projects p
on conflict (project_id) do nothing;

-- Compatibility bridges to existing Drop tables. No legacy Send code is auto-bound because old codes
-- do not carry a reliable user/license owner relation; the migration must be explicit and auditable.
do $$
begin
  if to_regclass('public.drop_public_send_codes') is not null then
    alter table public.drop_public_send_codes add column if not exists dimpro_send_entitlement_id uuid null;
    if not exists (select 1 from pg_constraint where conname = 'drop_public_send_codes_canonical_entitlement_fk') then
      alter table public.drop_public_send_codes
        add constraint drop_public_send_codes_canonical_entitlement_fk
        foreign key (dimpro_send_entitlement_id) references public.dimpro_send_entitlements(id) on delete set null;
    end if;
    create unique index if not exists drop_public_send_codes_canonical_entitlement_unique
      on public.drop_public_send_codes (dimpro_send_entitlement_id)
      where dimpro_send_entitlement_id is not null;
  end if;

  if to_regclass('public.drop_space_projects') is not null then
    alter table public.drop_space_projects add column if not exists dimpro_project_id uuid null;
    if not exists (select 1 from pg_constraint where conname = 'drop_space_projects_canonical_project_fk') then
      alter table public.drop_space_projects
        add constraint drop_space_projects_canonical_project_fk
        foreign key (dimpro_project_id) references public.dimpro_projects(id) on delete set null;
    end if;
    create index if not exists drop_space_projects_canonical_project_idx
      on public.drop_space_projects (dimpro_project_id) where dimpro_project_id is not null;

    update public.drop_space_projects dsp
    set dimpro_project_id = p.id
    from public.dimpro_projects p
    where dsp.dimpro_project_id is null
      and (
        p.legacy_project_core_id = dsp.project_id
        or p.id::text = dsp.project_id
        or lower(p.name) = lower(dsp.project_name_snapshot)
      );
  end if;
end;
$$;

alter table public.dimpro_project_drop_settings enable row level security;
alter table public.dimpro_send_entitlements enable row level security;
alter table public.dimpro_send_recipients enable row level security;
alter table public.dimpro_access_audit_logs enable row level security;
alter table public.dimpro_access_rate_limits enable row level security;

revoke all on public.dimpro_project_drop_settings from public, anon, authenticated;
revoke all on public.dimpro_send_entitlements from public, anon, authenticated;
revoke all on public.dimpro_send_recipients from public, anon, authenticated;
revoke all on public.dimpro_access_audit_logs from public, anon, authenticated;
revoke all on public.dimpro_access_rate_limits from public, anon, authenticated;

grant select on public.dimpro_project_drop_settings to authenticated;

drop policy if exists dimpro_project_drop_settings_select_member on public.dimpro_project_drop_settings;
create policy dimpro_project_drop_settings_select_member on public.dimpro_project_drop_settings
for select to authenticated
using (public.dimpro_has_project_permission(project_id, 'view'));

revoke all on function public.dimpro_verify_send_entitlement(text,text,text) from public, anon, authenticated;
revoke all on function public.dimpro_allowed_projects_for_entitlement(uuid) from public, anon, authenticated;
revoke all on function public.dimpro_project_drop_access_allowed(uuid,uuid) from public, anon, authenticated;
revoke all on function public.dimpro_verify_project_code(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.dimpro_record_send_completed(uuid,uuid,bigint,integer,jsonb) from public, anon, authenticated;

grant execute on function public.dimpro_verify_send_entitlement(text,text,text) to service_role;
grant execute on function public.dimpro_allowed_projects_for_entitlement(uuid) to service_role;
grant execute on function public.dimpro_project_drop_access_allowed(uuid,uuid) to service_role;
grant execute on function public.dimpro_verify_project_code(uuid,text,text,text) to service_role;
grant execute on function public.dimpro_record_send_completed(uuid,uuid,bigint,integer,jsonb) to service_role;

insert into public.dimpro_identity_schema_meta (
  component, schema_version, migration_count, bootstrap_id, metadata, updated_at
) values (
  'dimpro-identity-core',
  '0.1.0',
  2,
  'dimpro-send-project-access-v010-20260806',
  jsonb_build_object(
    'sendEntitlements', true,
    'projectDropSettings', true,
    'projectCodeRateLimit', jsonb_build_object('failures', 5, 'lockMinutes', 15),
    'legacySendCodesAutoMigrated', false,
    'dropUiActivationDeferred', true,
    'authDimproImplementationDeferred', true
  ),
  now()
)
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = greatest(public.dimpro_identity_schema_meta.migration_count, excluded.migration_count),
  bootstrap_id = excluded.bootstrap_id,
  metadata = coalesce(public.dimpro_identity_schema_meta.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

commit;

-- ===== migration 3: security hardening =====

-- DIMPRO / DIMPROVER Identity Core 0.1.0 security hardening
-- Requires both 20260806 Identity Core migrations.
-- Additive/rerunnable hardening before first live activation.

begin;

-- 1. The default recipient must belong to the same Send entitlement.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dimpro_send_recipients_id_entitlement_unique'
      and conrelid = 'public.dimpro_send_recipients'::regclass
  ) then
    alter table public.dimpro_send_recipients
      add constraint dimpro_send_recipients_id_entitlement_unique
      unique (id, entitlement_id);
  end if;
end;
$$;

alter table public.dimpro_send_entitlements
  drop constraint if exists dimpro_send_entitlements_default_recipient_fk;

alter table public.dimpro_send_entitlements
  add constraint dimpro_send_entitlements_default_recipient_fk
  foreign key (default_recipient_id, id)
  references public.dimpro_send_recipients(id, entitlement_id)
  on delete set null (default_recipient_id);

-- 2. Rate limiting is intentionally independent from the candidate code.
-- Otherwise an attacker could rotate candidate codes and receive a fresh counter.
-- Send: per IP pseudonym. Project code: per entitlement/session + IP pseudonym.
create or replace function public.dimpro_rate_limit_subject_hash(
  p_scope text,
  p_subject text,
  p_ip_hash text
)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(
    extensions.digest(
      lower(trim(coalesce(p_scope, ''))) || ':'
      || case lower(trim(coalesce(p_scope, '')))
        when 'send_code' then 'ip'
        when 'project_code' then coalesce(nullif(split_part(trim(coalesce(p_subject, '')), ':', 1), ''), 'unknown-entitlement')
        else coalesce(trim(p_subject), '')
      end || ':'
      || coalesce(nullif(trim(p_ip_hash), ''), 'unknown-ip'),
      'sha256'
    ),
    'hex'
  )
$$;

-- 3. A locked-default recipient entitlement is not active without an active default recipient.
create or replace function public.dimpro_entitlement_is_active(
  p_entitlement_id uuid,
  p_at timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.dimpro_send_entitlements e
    join public.dimpro_users u on u.id = e.user_id
    join public.dimpro_licenses l on l.id = e.license_id
    where e.id = p_entitlement_id
      and e.status = 'active'
      and e.valid_from <= p_at
      and (e.expires_at is null or e.expires_at >= p_at)
      and u.status = 'active'
      and u.email_verified_at is not null
      and l.status in ('active','trial')
      and (l.activated_at is null or l.activated_at <= p_at)
      and (l.expires_at is null or l.expires_at >= p_at)
      and (
        e.monthly_send_limit is null
        or e.send_count_month < date_trunc('month', p_at)::date
        or e.current_month_send_count < e.monthly_send_limit
      )
      and (
        e.recipient_mode <> 'locked_default'
        or exists (
          select 1
          from public.dimpro_send_recipients r
          where r.entitlement_id = e.id
            and r.active
            and (r.id = e.default_recipient_id or r.is_default)
        )
      )
  )
$$;

-- 4. Internal helper RPCs must not remain executable through PostgREST by default.
-- PostgreSQL grants EXECUTE on new functions to PUBLIC unless explicitly revoked.
revoke all on function public.dimpro_normalize_email(text) from public, anon, authenticated;
revoke all on function public.dimpro_random_token(integer) from public, anon, authenticated;
revoke all on function public.dimpro_build_public_code(text,integer,integer) from public, anon, authenticated;
revoke all on function public.dimpro_generate_user_code() from public, anon, authenticated;
revoke all on function public.dimpro_generate_organization_code() from public, anon, authenticated;
revoke all on function public.dimpro_generate_license_code() from public, anon, authenticated;
revoke all on function public.dimpro_generate_project_code() from public, anon, authenticated;
revoke all on function public.dimpro_set_updated_at() from public, anon, authenticated;
revoke all on function public.dimpro_prepare_user_row() from public, anon, authenticated;
revoke all on function public.dimpro_prepare_organization_row() from public, anon, authenticated;
revoke all on function public.dimpro_prepare_license_row() from public, anon, authenticated;
revoke all on function public.dimpro_prepare_project_row() from public, anon, authenticated;
revoke all on function public.dimpro_prepare_send_recipient_row() from public, anon, authenticated;

revoke all on function public.dimpro_current_user_id() from public, anon, authenticated;
revoke all on function public.dimpro_is_organization_member(uuid) from public, anon, authenticated;
revoke all on function public.dimpro_has_project_permission(uuid,text) from public, anon, authenticated;
grant execute on function public.dimpro_current_user_id() to authenticated, service_role;
grant execute on function public.dimpro_is_organization_member(uuid) to authenticated, service_role;
grant execute on function public.dimpro_has_project_permission(uuid,text) to authenticated, service_role;

revoke all on function public.dimpro_license_module_enabled(uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function public.dimpro_rate_limit_subject_hash(text,text,text) from public, anon, authenticated;
revoke all on function public.dimpro_is_access_locked(text,text) from public, anon, authenticated;
revoke all on function public.dimpro_record_access_failure(text,text,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.dimpro_clear_access_failures(text,text) from public, anon, authenticated;
revoke all on function public.dimpro_entitlement_is_active(uuid,timestamptz) from public, anon, authenticated;

-- Public server API remains service-role only.
revoke all on function public.dimpro_verify_send_entitlement(text,text,text) from public, anon, authenticated;
revoke all on function public.dimpro_allowed_projects_for_entitlement(uuid) from public, anon, authenticated;
revoke all on function public.dimpro_project_drop_access_allowed(uuid,uuid) from public, anon, authenticated;
revoke all on function public.dimpro_verify_project_code(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.dimpro_record_send_completed(uuid,uuid,bigint,integer,jsonb) from public, anon, authenticated;
grant execute on function public.dimpro_verify_send_entitlement(text,text,text) to service_role;
grant execute on function public.dimpro_allowed_projects_for_entitlement(uuid) to service_role;
grant execute on function public.dimpro_project_drop_access_allowed(uuid,uuid) to service_role;
grant execute on function public.dimpro_verify_project_code(uuid,text,text,text) to service_role;
grant execute on function public.dimpro_record_send_completed(uuid,uuid,bigint,integer,jsonb) to service_role;

insert into public.dimpro_identity_schema_meta (
  component, schema_version, migration_count, bootstrap_id, metadata, updated_at
) values (
  'dimpro-identity-core',
  '0.1.0',
  3,
  'dimpro-identity-core-security-hardening-v010-20260807',
  jsonb_build_object(
    'defaultRecipientBoundToEntitlement', true,
    'rateLimitCandidateRotationSafe', true,
    'lockedDefaultRecipientFailClosed', true,
    'internalRpcPrivilegesHardened', true
  ),
  now()
)
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = greatest(public.dimpro_identity_schema_meta.migration_count, excluded.migration_count),
  bootstrap_id = excluded.bootstrap_id,
  metadata = coalesce(public.dimpro_identity_schema_meta.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

commit;
