begin;

alter table public.dimpro_licenses
  add column if not exists max_users integer not null default 1,
  add column if not exists legacy_license_ref text null;

-- A production Send motorban már használt, korábban kézzel létrehozott mezők
-- bekerülnek a verziózott clean-install migrációs láncba is.
alter table public.dimpro_send_entitlements
  add column if not exists max_saved_contacts integer not null default 10,
  add column if not exists upload_rules_acceptance_count integer not null default 0,
  add column if not exists upload_rules_version text null,
  add column if not exists upload_rules_last_accepted_at timestamptz null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dimpro_send_entitlements_max_saved_contacts_check') then
    alter table public.dimpro_send_entitlements add constraint dimpro_send_entitlements_max_saved_contacts_check check (max_saved_contacts between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dimpro_send_entitlements_upload_rules_count_check') then
    alter table public.dimpro_send_entitlements add constraint dimpro_send_entitlements_upload_rules_count_check check (upload_rules_acceptance_count between 0 and 3);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'dimpro_licenses_max_users_check'
  ) then
    alter table public.dimpro_licenses
      add constraint dimpro_licenses_max_users_check check (max_users >= 1);
  end if;
end $$;

create unique index if not exists dimpro_licenses_legacy_license_ref_unique
  on public.dimpro_licenses (legacy_license_ref)
  where legacy_license_ref is not null;

create table if not exists public.dimpro_membership_modules (
  id uuid primary key default extensions.gen_random_uuid(),
  membership_id uuid not null references public.dimpro_organization_memberships(id) on delete cascade,
  module_code text not null,
  enabled boolean not null default true,
  limits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dimpro_membership_modules_unique unique (membership_id, module_code),
  constraint dimpro_membership_modules_code_check check (module_code ~ '^[A-Z0-9][A-Z0-9_:-]{1,79}$')
);

create index if not exists dimpro_membership_modules_membership_idx
  on public.dimpro_membership_modules (membership_id, enabled, module_code);

create table if not exists public.dimpro_organization_invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete cascade,
  license_id uuid not null references public.dimpro_licenses(id) on delete cascade,
  membership_id uuid not null references public.dimpro_organization_memberships(id) on delete cascade,
  invited_user_id uuid not null references public.dimpro_users(id) on delete cascade,
  email_normalized text not null,
  full_name text not null,
  role_code text not null,
  role_label text null,
  token_hash text not null,
  token_hint text not null,
  status text not null default 'pending',
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invited_by_user_id uuid null references public.dimpro_users(id) on delete set null,
  constraint dimpro_org_invitations_membership_unique unique (membership_id),
  constraint dimpro_org_invitations_token_hash_unique unique (token_hash),
  constraint dimpro_org_invitations_email_check check (email_normalized = public.dimpro_normalize_email(email_normalized) and email_normalized <> ''),
  constraint dimpro_org_invitations_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint dimpro_org_invitations_status_check check (status in ('pending','accepted','revoked','expired')),
  constraint dimpro_org_invitations_dates_check check (expires_at >= created_at)
);

create index if not exists dimpro_org_invitations_org_status_idx
  on public.dimpro_organization_invitations (organization_id, status, expires_at);
create index if not exists dimpro_org_invitations_email_status_idx
  on public.dimpro_organization_invitations (email_normalized, status);

alter table public.dimpro_membership_modules enable row level security;
alter table public.dimpro_organization_invitations enable row level security;

revoke all on public.dimpro_membership_modules from public, anon, authenticated;
revoke all on public.dimpro_organization_invitations from public, anon, authenticated;
grant select on public.dimpro_membership_modules to authenticated;
grant all on public.dimpro_membership_modules to service_role;
grant all on public.dimpro_organization_invitations to service_role;
grant execute on function public.dimpro_normalize_email(text) to service_role;

drop policy if exists dimpro_membership_modules_select_self on public.dimpro_membership_modules;
create policy dimpro_membership_modules_select_self
  on public.dimpro_membership_modules
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.dimpro_organization_memberships m
      join public.dimpro_users u on u.id = m.user_id
      where m.id = dimpro_membership_modules.membership_id
        and u.auth_user_id = auth.uid()
        and m.status = 'active'
        and (m.access_ends_at is null or m.access_ends_at >= now())
    )
  );

comment on column public.dimpro_licenses.max_users is 'Szervezeti/felhasználói licenchelyek száma. A max_devices mezőtől független.';
comment on column public.dimpro_licenses.legacy_license_ref is 'Régi fájlalapú/licencmotor rekord biztonságos hivatkozása; nyers licenckulcsot nem tartalmaz.';
comment on table public.dimpro_membership_modules is 'Felhasználónkénti szolgáltatás/modul-szűkítés a szervezeti licenc moduljain belül.';
comment on table public.dimpro_organization_invitations is 'Egyszer használatos, HMAC-lenyomattal tárolt szervezeti felhasználómeghívások.';

insert into public.dimpro_identity_schema_meta (
  component, schema_version, migration_count, bootstrap_id, metadata, updated_at
) values (
  'dimpro-identity-core',
  '0.2.0',
  4,
  'dimpro-identity-org-license-v020-20260810',
  jsonb_build_object(
    'organizationUserSeats', true,
    'deviceLimitSeparated', true,
    'organizationInvitations', true,
    'membershipModuleOverrides', true,
    'legacyLicenseReference', true
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
