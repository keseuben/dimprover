-- DIMPRO Drop access engine
-- DROP 0.2.0 – capability tokens, PIN/IP rate limiting and audit support
-- Apply after 20260731143500_drop_core.sql.
-- No anonymous RLS policy is created. Server-side service-role access is required.

create extension if not exists pgcrypto;

create table if not exists public.drop_access_tokens (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.drop_packages(id) on delete cascade,
  purpose varchar(16) not null check (purpose in ('upload', 'view', 'download', 'report')),
  token_hash varchar(64) not null unique check (char_length(token_hash) = 64),
  token_hint varchar(32) not null,
  status varchar(16) not null default 'active' check (status in ('active', 'revoked', 'expired')),
  expires_at timestamptz not null,
  max_uses integer check (max_uses is null or max_uses >= 1),
  use_count integer not null default 0 check (use_count >= 0),
  last_used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint drop_access_tokens_use_limit check (max_uses is null or use_count <= max_uses)
);

create table if not exists public.drop_access_attempts (
  id uuid primary key default gen_random_uuid(),
  package_id uuid references public.drop_packages(id) on delete cascade,
  access_token_id uuid references public.drop_access_tokens(id) on delete set null,
  attempt_type varchar(16) not null check (attempt_type in ('pin', 'token')),
  purpose varchar(16) check (purpose is null or purpose in ('upload', 'view', 'download', 'report')),
  ip_hash varchar(64) not null check (char_length(ip_hash) = 64),
  token_fingerprint varchar(64) check (token_fingerprint is null or char_length(token_fingerprint) = 64),
  success boolean not null default false,
  failure_code varchar(64),
  user_agent_summary varchar(240),
  created_at timestamptz not null default now()
);

create index if not exists drop_access_tokens_package_purpose_idx
  on public.drop_access_tokens (package_id, purpose, status, expires_at desc);
create index if not exists drop_access_tokens_expiry_idx
  on public.drop_access_tokens (status, expires_at);
create index if not exists drop_access_attempts_ip_created_idx
  on public.drop_access_attempts (ip_hash, created_at desc);
create index if not exists drop_access_attempts_package_ip_created_idx
  on public.drop_access_attempts (package_id, ip_hash, created_at desc)
  where package_id is not null;
create index if not exists drop_access_attempts_token_ip_created_idx
  on public.drop_access_attempts (token_fingerprint, ip_hash, created_at desc)
  where token_fingerprint is not null;
create index if not exists drop_access_attempts_failed_idx
  on public.drop_access_attempts (attempt_type, created_at desc)
  where success = false;

alter table public.drop_access_tokens enable row level security;
alter table public.drop_access_attempts enable row level security;

create or replace function public.drop_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'drop_packages_set_updated_at') then
    create trigger drop_packages_set_updated_at
      before update on public.drop_packages
      for each row execute function public.drop_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'drop_recipients_set_updated_at') then
    create trigger drop_recipients_set_updated_at
      before update on public.drop_recipients
      for each row execute function public.drop_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'drop_groups_set_updated_at') then
    create trigger drop_groups_set_updated_at
      before update on public.drop_groups
      for each row execute function public.drop_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'drop_access_tokens_set_updated_at') then
    create trigger drop_access_tokens_set_updated_at
      before update on public.drop_access_tokens
      for each row execute function public.drop_set_updated_at();
  end if;
end $$;

comment on table public.drop_access_tokens is
  'Hashed DIMPRO Drop capability tokens. Raw upload/view/download/report tokens must never be persisted.';
comment on column public.drop_access_tokens.token_hash is
  'HMAC-SHA256 digest of the raw capability token.';
comment on table public.drop_access_attempts is
  'PIN and token attempt audit used for package-, token- and IP-level rate limiting. Network values are HMAC fingerprints.';
comment on column public.drop_packages.upload_token_hash is
  'Deprecated DROP 0.1.0 compatibility column. DROP 0.2.0 uses drop_access_tokens.';
comment on column public.drop_packages.view_token_hash is
  'Deprecated DROP 0.1.0 compatibility column. DROP 0.2.0 uses drop_access_tokens.';
comment on column public.drop_packages.download_token_hash is
  'Deprecated DROP 0.1.0 compatibility column. DROP 0.2.0 uses drop_access_tokens.';
comment on column public.drop_packages.report_token_hash is
  'Deprecated DROP 0.1.0 compatibility column. DROP 0.2.0 uses drop_access_tokens.';
