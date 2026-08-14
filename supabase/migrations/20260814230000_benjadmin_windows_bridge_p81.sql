begin;

create table if not exists public.dev_center_windows_bridge_devices (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null unique,
  device_label text not null,
  os_version text not null default '',
  powershell_version text not null default '',
  capabilities text[] not null default array[]::text[],
  status text not null default 'pending' check (status in ('pending','approved','active','revoked','blocked')),
  token_hash text null unique,
  token_issued_at timestamptz null,
  approved_at timestamptz null,
  approved_by text null,
  revoked_at timestamptz null,
  revoked_by text null,
  revoke_reason text not null default '',
  last_seen_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dev_center_windows_bridge_agent_id_nonempty check (length(btrim(agent_id)) between 8 and 128),
  constraint dev_center_windows_bridge_device_label_nonempty check (length(btrim(device_label)) between 1 and 160),
  constraint dev_center_windows_bridge_token_hash_format check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.dev_center_windows_bridge_pairings (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null,
  status text not null default 'pending' check (status in ('pending','claimed','completed','expired','locked','cancelled')),
  expires_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  claim_token_hash text null unique,
  device_id uuid null references public.dev_center_windows_bridge_devices(id) on delete set null,
  claimed_at timestamptz null,
  completed_at timestamptz null,
  created_by text not null default 'BENJADMIN',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dev_center_windows_bridge_code_hash_format check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint dev_center_windows_bridge_claim_hash_format check (claim_token_hash is null or claim_token_hash ~ '^[0-9a-f]{64}$'),
  constraint dev_center_windows_bridge_pairing_expiry check (expires_at > created_at)
);

create table if not exists public.dev_center_windows_bridge_sessions (
  id uuid primary key,
  device_id uuid not null references public.dev_center_windows_bridge_devices(id) on delete cascade,
  status text not null default 'active' check (status in ('active','closed','revoked')),
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  closed_at timestamptz null,
  close_reason text not null default '',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists dev_center_windows_bridge_device_status_idx on public.dev_center_windows_bridge_devices(status, updated_at desc);
create index if not exists dev_center_windows_bridge_device_seen_idx on public.dev_center_windows_bridge_devices(last_seen_at desc) where last_seen_at is not null;
create index if not exists dev_center_windows_bridge_pairing_status_idx on public.dev_center_windows_bridge_pairings(status, expires_at desc);
create index if not exists dev_center_windows_bridge_pairing_device_idx on public.dev_center_windows_bridge_pairings(device_id, created_at desc) where device_id is not null;
create index if not exists dev_center_windows_bridge_session_device_idx on public.dev_center_windows_bridge_sessions(device_id, started_at desc);
create unique index if not exists dev_center_windows_bridge_one_active_session_idx on public.dev_center_windows_bridge_sessions(device_id) where status = 'active';

create or replace function public.dev_center_windows_bridge_activate_device(
  p_pairing_id uuid,
  p_device_id uuid,
  p_claim_token_hash text,
  p_token_hash text,
  p_session_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pairing public.dev_center_windows_bridge_pairings%rowtype;
begin
  if p_claim_token_hash !~ '^[0-9a-f]{64}$' or p_token_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  select * into v_pairing
  from public.dev_center_windows_bridge_pairings
  where id = p_pairing_id
  for update;

  if not found
    or v_pairing.status <> 'claimed'
    or v_pairing.device_id is distinct from p_device_id
    or v_pairing.claim_token_hash is distinct from p_claim_token_hash
    or v_pairing.expires_at <= now() then
    return false;
  end if;

  update public.dev_center_windows_bridge_devices
  set status = 'active', token_hash = p_token_hash, token_issued_at = now(), last_seen_at = now(), updated_at = now()
  where id = p_device_id and status = 'approved' and token_hash is null;
  if not found then return false; end if;

  update public.dev_center_windows_bridge_sessions
  set status = 'closed', closed_at = now(), close_reason = 'superseded_by_new_pairing'
  where device_id = p_device_id and status = 'active';

  insert into public.dev_center_windows_bridge_sessions(id, device_id, status, started_at, last_heartbeat_at)
  values (p_session_id, p_device_id, 'active', now(), now());

  update public.dev_center_windows_bridge_pairings
  set status = 'completed', completed_at = now(), claim_token_hash = null, updated_at = now()
  where id = p_pairing_id;

  return true;
end;
$$;

alter table public.dev_center_windows_bridge_devices enable row level security;
alter table public.dev_center_windows_bridge_pairings enable row level security;
alter table public.dev_center_windows_bridge_sessions enable row level security;
revoke all on table public.dev_center_windows_bridge_devices from anon, authenticated;
revoke all on table public.dev_center_windows_bridge_pairings from anon, authenticated;
revoke all on table public.dev_center_windows_bridge_sessions from anon, authenticated;
revoke all on function public.dev_center_windows_bridge_activate_device(uuid,uuid,text,text,uuid) from public, anon, authenticated;
grant all on table public.dev_center_windows_bridge_devices to service_role;
grant all on table public.dev_center_windows_bridge_pairings to service_role;
grant all on table public.dev_center_windows_bridge_sessions to service_role;
grant execute on function public.dev_center_windows_bridge_activate_device(uuid,uuid,text,text,uuid) to service_role;

insert into public.dev_center_control_schema_meta(component, schema_version, migration_count, target_architecture, updated_at)
values ('benjadmin-windows-bridge', '0.1.0', 1, 'CONTROL_VPS', now())
on conflict (component) do update set schema_version=excluded.schema_version, migration_count=excluded.migration_count, target_architecture=excluded.target_architecture, updated_at=excluded.updated_at;

commit;
