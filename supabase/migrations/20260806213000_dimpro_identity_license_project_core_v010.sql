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
