begin;

create table if not exists public.dimpro_storage_telemetry (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('platform','organization','license','user','space')),
  scope_id text not null,
  organization_id text null,
  license_id text null,
  user_id text null,
  space_id uuid null,
  source_system text not null default 'drop',
  storage_provider text null,
  storage_bucket text null,
  window_started_at timestamptz not null,
  window_ended_at timestamptz not null,
  collected_at timestamptz not null default now(),
  used_bytes bigint not null default 0 check (used_bytes >= 0),
  quota_bytes bigint null check (quota_bytes is null or quota_bytes >= 0),
  object_count bigint not null default 0 check (object_count >= 0),
  uploaded_bytes bigint not null default 0 check (uploaded_bytes >= 0),
  deleted_bytes bigint not null default 0 check (deleted_bytes >= 0),
  downloaded_bytes bigint not null default 0 check (downloaded_bytes >= 0),
  storage_churn_bytes bigint generated always as (uploaded_bytes + deleted_bytes) stored,
  network_transfer_bytes bigint generated always as (uploaded_bytes + downloaded_bytes) stored,
  net_storage_change_bytes bigint generated always as (uploaded_bytes - deleted_bytes) stored,
  metadata jsonb not null default '{}'::jsonb,
  constraint dimpro_storage_telemetry_window_check check (window_ended_at >= window_started_at)
);

create index if not exists dimpro_storage_telemetry_scope_time_idx on public.dimpro_storage_telemetry (scope_type, scope_id, window_ended_at desc);
create index if not exists dimpro_storage_telemetry_license_time_idx on public.dimpro_storage_telemetry (license_id, window_ended_at desc) where license_id is not null;
create index if not exists dimpro_storage_telemetry_user_time_idx on public.dimpro_storage_telemetry (user_id, window_ended_at desc) where user_id is not null;
create index if not exists dimpro_storage_telemetry_org_time_idx on public.dimpro_storage_telemetry (organization_id, window_ended_at desc) where organization_id is not null;
create index if not exists dimpro_storage_telemetry_space_time_idx on public.dimpro_storage_telemetry (space_id, window_ended_at desc) where space_id is not null;
create unique index if not exists dimpro_storage_telemetry_interval_unique on public.dimpro_storage_telemetry (scope_type, scope_id, source_system, window_started_at, window_ended_at);

create table if not exists public.dimpro_storage_quota_policies (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('platform','organization','license','user','space')),
  scope_id text not null,
  plan_code text null,
  quota_bytes bigint not null check (quota_bytes >= 1048576),
  warning_percent integer not null default 80 check (warning_percent between 1 and 99),
  critical_percent integer not null default 95 check (critical_percent between 2 and 100),
  hard_limit boolean not null default true,
  sizing_mode text not null default 'manual' check (sizing_mode in ('manual','observed','plan_default')),
  recommendation_window_days integer not null default 30 check (recommendation_window_days between 1 and 365),
  updated_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dimpro_storage_quota_policy_threshold_check check (critical_percent > warning_percent),
  constraint dimpro_storage_quota_policy_unique unique (scope_type, scope_id)
);

comment on table public.dimpro_storage_telemetry is 'DIMPRO storage/quota telemetry. Five-minute snapshots and interval traffic aggregated by platform, organization, license, user and space.';
comment on column public.dimpro_storage_telemetry.storage_churn_bytes is 'Gross storage movement: uploaded bytes + deleted bytes. Used for capacity churn/sizing, independent of net occupied-size change.';
comment on column public.dimpro_storage_telemetry.network_transfer_bytes is 'Identified storage network transfer: uploaded bytes + downloaded bytes. Deletion is not network download traffic.';
comment on column public.dimpro_storage_telemetry.net_storage_change_bytes is 'Net occupied-size movement in the interval: uploaded bytes - deleted bytes.';
comment on table public.dimpro_storage_quota_policies is 'Current quota policy. Telemetry may recommend changes but must never change quota automatically without an explicit approved operation.';

alter table public.dimpro_storage_telemetry enable row level security;
alter table public.dimpro_storage_quota_policies enable row level security;
do $$
BEGIN
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.dimpro_storage_telemetry from anon';
    execute 'revoke all on table public.dimpro_storage_quota_policies from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.dimpro_storage_telemetry from authenticated';
    execute 'revoke all on table public.dimpro_storage_quota_policies from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on table public.dimpro_storage_telemetry to service_role';
    execute 'grant all on table public.dimpro_storage_quota_policies to service_role';
  end if;
END
$$;

commit;
