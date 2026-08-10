-- BENJADMIN B3 M3 parallel orchestration / lease / recovery 0.3.0
begin;

alter table public.dev_center_worker_sessions
  add column if not exists lease_expires_at timestamptz,
  add column if not exists recovery_count integer not null default 0,
  add column if not exists last_recovered_at timestamptz;

alter table public.dev_center_tasks
  add column if not exists claimed_by_session_id text references public.dev_center_worker_sessions(id) on delete set null,
  add column if not exists claim_expires_at timestamptz,
  add column if not exists last_claimed_at timestamptz,
  add column if not exists attempt_count integer not null default 0;

alter table public.dev_center_scope_locks
  add column if not exists heartbeat_at timestamptz not null default now();

create table if not exists public.dev_center_worktree_leases (
  id text primary key,
  repository_id text not null references public.dev_center_repositories(id) on delete cascade,
  session_id text not null references public.dev_center_worker_sessions(id) on delete cascade,
  task_id text references public.dev_center_tasks(id) on delete set null,
  branch_name text not null,
  worktree_path text not null,
  status text not null default 'active' check (status in ('active','released','expired')),
  acquired_at timestamptz not null default now(),
  lease_expires_at timestamptz not null,
  heartbeat_at timestamptz not null default now(),
  released_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists dev_center_worktree_active_branch_unique
  on public.dev_center_worktree_leases(repository_id, branch_name) where status = 'active';
create unique index if not exists dev_center_worktree_active_path_unique
  on public.dev_center_worktree_leases(repository_id, worktree_path) where status = 'active';
create index if not exists dev_center_worktree_lease_expiry_idx
  on public.dev_center_worktree_leases(status, lease_expires_at);

create table if not exists public.dev_center_conflicts (
  id text primary key,
  conflict_type text not null check (conflict_type in ('scope','branch','worktree','task','worker','dependency','lease')),
  repository_id text references public.dev_center_repositories(id) on delete set null,
  requester_session_id text references public.dev_center_worker_sessions(id) on delete set null,
  holder_session_id text references public.dev_center_worker_sessions(id) on delete set null,
  task_id text references public.dev_center_tasks(id) on delete set null,
  scope_type text,
  scope_key text,
  status text not null default 'open' check (status in ('open','resolved','ignored')),
  summary text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists dev_center_conflicts_open_idx on public.dev_center_conflicts(status, created_at desc);
create index if not exists dev_center_session_lease_idx on public.dev_center_worker_sessions(status, lease_expires_at);
create index if not exists dev_center_task_claim_expiry_idx on public.dev_center_tasks(status, claim_expires_at);

create or replace function public.dev_center_claim_next_task_atomic(
  p_session_id text,
  p_worker_id text,
  p_lease_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.dev_center_worker_sessions%rowtype;
  v_task public.dev_center_tasks%rowtype;
  v_now timestamptz := now();
  v_lease_seconds integer := greatest(60, least(coalesce(p_lease_seconds, 900), 3600));
begin
  select * into v_session
  from public.dev_center_worker_sessions
  where id = p_session_id
  for update;

  if not found then raise exception 'DEV_CENTER_SESSION_NOT_FOUND'; end if;
  if v_session.status = 'closed' then raise exception 'DEV_CENTER_SESSION_CLOSED'; end if;
  if v_session.handshake_stage <> 'WORKER_BOUND' then raise exception 'DEV_CENTER_HANDSHAKE_ORDER'; end if;
  if v_session.worker_id is distinct from p_worker_id then raise exception 'DEV_CENTER_SESSION_WORKER_MISMATCH'; end if;

  select t.* into v_task
  from public.dev_center_tasks t
  where t.status in ('queued','ready')
    and (t.requested_worker_id is null or t.requested_worker_id = p_worker_id)
    and not exists (
      select 1
      from public.dev_center_task_dependencies d
      join public.dev_center_tasks parent on parent.id = d.depends_on_task_id
      where d.task_id = t.id
        and d.dependency_type in ('blocks','requires')
        and parent.status <> 'completed'
    )
  order by t.priority desc, t.created_at asc
  for update skip locked
  limit 1;

  if not found then return null; end if;

  update public.dev_center_tasks
  set status = 'claimed',
      assigned_worker_id = p_worker_id,
      claimed_by_session_id = p_session_id,
      claim_expires_at = v_now + make_interval(secs => v_lease_seconds),
      last_claimed_at = v_now,
      attempt_count = attempt_count + 1,
      updated_at = v_now
  where id = v_task.id
  returning * into v_task;

  update public.dev_center_worker_sessions
  set task_id = v_task.id,
      project_id = v_task.project_id,
      version_id = v_task.version_id,
      repository_id = v_task.repository_id,
      handshake_stage = 'TASK_BOUND',
      lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
      last_heartbeat_at = v_now,
      updated_at = v_now
  where id = p_session_id;

  return to_jsonb(v_task);
end;
$$;
create or replace function public.dev_center_acquire_scope_bundle_atomic(
  p_session_id text,
  p_scopes jsonb,
  p_lease_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.dev_center_worker_sessions%rowtype;
  v_conflict public.dev_center_scope_locks%rowtype;
  v_scope jsonb;
  v_scope_type text;
  v_scope_key text;
  v_now timestamptz := now();
  v_lease_seconds integer := greatest(60, least(coalesce(p_lease_seconds, 900), 3600));
  v_worktree_lease_id text := 'dev-worktree-lease-' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  v_lock_id text;
begin
  select * into v_session from public.dev_center_worker_sessions where id = p_session_id for update;
  if not found then raise exception 'DEV_CENTER_SESSION_NOT_FOUND'; end if;
  if v_session.status = 'closed' then raise exception 'DEV_CENTER_SESSION_CLOSED'; end if;
  if v_session.handshake_stage <> 'WORKTREE_BOUND' then raise exception 'DEV_CENTER_HANDSHAKE_ORDER'; end if;
  if v_session.repository_id is null or v_session.task_id is null or v_session.worker_id is null then raise exception 'DEV_CENTER_SESSION_BINDINGS_INCOMPLETE'; end if;
  if v_session.branch_name is null or v_session.worktree_path is null then raise exception 'DEV_CENTER_WORKTREE_BINDING_REQUIRED'; end if;
  if p_scopes is null or jsonb_typeof(p_scopes) <> 'array' or jsonb_array_length(p_scopes) = 0 then raise exception 'DEV_CENTER_SCOPE_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext(v_session.repository_id));
  update public.dev_center_scope_locks set status = 'expired', released_at = v_now where repository_id = v_session.repository_id and status = 'active' and expires_at is not null and expires_at <= v_now;
  update public.dev_center_worktree_leases set status = 'expired', released_at = v_now where repository_id = v_session.repository_id and status = 'active' and lease_expires_at <= v_now;
  if exists (select 1 from public.dev_center_worktree_leases where repository_id = v_session.repository_id and status = 'active' and session_id <> p_session_id and branch_name = v_session.branch_name) then
    raise exception 'DEV_CENTER_BRANCH_CONFLICT';
  end if;
  if exists (select 1 from public.dev_center_worktree_leases where repository_id = v_session.repository_id and status = 'active' and session_id <> p_session_id and worktree_path = v_session.worktree_path) then
    raise exception 'DEV_CENTER_WORKTREE_CONFLICT';
  end if;
  for v_scope in select value from jsonb_array_elements(p_scopes)
  loop
    v_scope_type := nullif(trim(v_scope->>'type'), '');
    v_scope_key := nullif(trim(v_scope->>'key'), '');
    if v_scope_type not in ('path','module','migration','release','environment') or v_scope_key is null then
      raise exception 'DEV_CENTER_INVALID_SCOPE';
    end if;
    select l.* into v_conflict
    from public.dev_center_scope_locks l
    where l.repository_id = v_session.repository_id
      and l.status = 'active'
      and l.session_id <> p_session_id
      and l.scope_type = v_scope_type
      and ((v_scope_type = 'path' and (l.scope_key = v_scope_key or l.scope_key like v_scope_key || '/%' or v_scope_key like l.scope_key || '/%')) or (v_scope_type <> 'path' and l.scope_key = v_scope_key))
    order by l.acquired_at limit 1;
    if found then
      raise exception 'DEV_CENTER_SCOPE_CONFLICT|%|%|%', v_conflict.session_id, v_scope_type, v_scope_key;
    end if;
  end loop;
  insert into public.dev_center_worktree_leases(
    id, repository_id, session_id, task_id, branch_name, worktree_path,
    status, acquired_at, lease_expires_at, heartbeat_at, metadata
  ) values (
    v_worktree_lease_id, v_session.repository_id, p_session_id, v_session.task_id,
    v_session.branch_name, v_session.worktree_path, 'active', v_now,
    v_now + make_interval(secs => v_lease_seconds), v_now,
    jsonb_build_object('workerId', v_session.worker_id)
  );

  for v_scope in select value from jsonb_array_elements(p_scopes)
  loop
    v_scope_type := trim(v_scope->>'type');
    v_scope_key := trim(v_scope->>'key');
    v_lock_id := 'dev-lock-' || substr(md5(random()::text || clock_timestamp()::text || v_scope_type || v_scope_key), 1, 12);
    insert into public.dev_center_scope_locks(
      id, repository_id, session_id, task_id, scope_type, scope_key, mode, status,
      acquired_at, expires_at, heartbeat_at, metadata
    ) values (
      v_lock_id, v_session.repository_id, p_session_id, v_session.task_id,
      v_scope_type, v_scope_key, 'exclusive', 'active', v_now,
      v_now + make_interval(secs => v_lease_seconds), v_now,
      jsonb_build_object('workerId', v_session.worker_id, 'branchName', v_session.branch_name, 'worktreePath', v_session.worktree_path)
    );
  end loop;

  update public.dev_center_worker_sessions
  set handshake_stage = 'READY', status = 'active', scope = p_scopes,
      lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
      last_heartbeat_at = v_now, updated_at = v_now
  where id = p_session_id;

  update public.dev_center_tasks
  set status = 'in_progress', assigned_worker_id = v_session.worker_id,
      claimed_by_session_id = p_session_id, claim_expires_at = v_now + make_interval(secs => v_lease_seconds),
      branch_name = v_session.branch_name, worktree_path = v_session.worktree_path,
      scope = p_scopes, started_at = coalesce(started_at, v_now), updated_at = v_now
  where id = v_session.task_id;

  update public.dev_center_workers set status = 'busy', updated_at = v_now where id = v_session.worker_id;

  return jsonb_build_object(
    'sessionId', p_session_id,
    'worktreeLeaseId', v_worktree_lease_id,
    'leaseExpiresAt', v_now + make_interval(secs => v_lease_seconds),
    'scopeCount', jsonb_array_length(p_scopes)
  );
end;
$$;

create or replace function public.dev_center_heartbeat_session_atomic(
  p_session_id text,
  p_lease_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.dev_center_worker_sessions%rowtype;
  v_now timestamptz := now();
  v_lease_seconds integer := greatest(60, least(coalesce(p_lease_seconds, 900), 3600));
begin
  select * into v_session from public.dev_center_worker_sessions where id = p_session_id for update;
  if not found then raise exception 'DEV_CENTER_SESSION_NOT_FOUND'; end if;
  if v_session.status = 'closed' then raise exception 'DEV_CENTER_SESSION_CLOSED'; end if;

  update public.dev_center_worker_sessions
  set last_heartbeat_at = v_now,
      lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
      updated_at = v_now
  where id = p_session_id
  returning * into v_session;

  update public.dev_center_scope_locks
  set heartbeat_at = v_now, expires_at = v_now + make_interval(secs => v_lease_seconds)
  where session_id = p_session_id and status = 'active';

  update public.dev_center_worktree_leases
  set heartbeat_at = v_now, lease_expires_at = v_now + make_interval(secs => v_lease_seconds)
  where session_id = p_session_id and status = 'active';

  if v_session.task_id is not null then
    update public.dev_center_tasks
    set claim_expires_at = v_now + make_interval(secs => v_lease_seconds), updated_at = v_now
    where id = v_session.task_id and status in ('claimed','in_progress','testing');
  end if;

  return to_jsonb(v_session);
end;
$$;

create or replace function public.dev_center_release_session_atomic(
  p_session_id text,
  p_reason text default 'Session lezárva.',
  p_requeue_task boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.dev_center_worker_sessions%rowtype;
  v_task_status text;
  v_now timestamptz := now();
begin
  select * into v_session from public.dev_center_worker_sessions where id = p_session_id for update;
  if not found then raise exception 'DEV_CENTER_SESSION_NOT_FOUND'; end if;
  if v_session.status = 'closed' then return to_jsonb(v_session); end if;

  update public.dev_center_scope_locks
  set status = 'released', released_at = v_now
  where session_id = p_session_id and status = 'active';

  update public.dev_center_worktree_leases
  set status = 'released', released_at = v_now
  where session_id = p_session_id and status = 'active';

  if v_session.task_id is not null then
    select status into v_task_status from public.dev_center_tasks where id = v_session.task_id for update;
    if found and p_requeue_task and v_task_status not in ('completed','cancelled') then
      update public.dev_center_tasks
      set status = 'queued', assigned_worker_id = null, claimed_by_session_id = null,
          claim_expires_at = null, branch_name = null, worktree_path = null,
          scope = '[]'::jsonb, blocked_reason = null, updated_at = v_now
      where id = v_session.task_id;
    elsif found then
      update public.dev_center_tasks set claim_expires_at = null, updated_at = v_now where id = v_session.task_id;
    end if;
  end if;

  if v_session.worker_id is not null then
    update public.dev_center_workers set status = 'ready', updated_at = v_now where id = v_session.worker_id;
  end if;

  update public.dev_center_worker_sessions
  set status = 'closed', closed_at = v_now, close_reason = coalesce(nullif(trim(p_reason), ''), 'Session lezárva.'),
      lease_expires_at = null, updated_at = v_now, last_heartbeat_at = v_now
  where id = p_session_id
  returning * into v_session;

  return to_jsonb(v_session);
end;
$$;

create or replace function public.dev_center_complete_task_atomic(
  p_session_id text,
  p_summary text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.dev_center_worker_sessions%rowtype;
  v_task public.dev_center_tasks%rowtype;
  v_now timestamptz := now();
begin
  select * into v_session from public.dev_center_worker_sessions where id = p_session_id for update;
  if not found then raise exception 'DEV_CENTER_SESSION_NOT_FOUND'; end if;
  if v_session.status <> 'active' or v_session.handshake_stage <> 'READY' or v_session.task_id is null then
    raise exception 'DEV_CENTER_SESSION_NOT_READY';
  end if;

  update public.dev_center_tasks
  set status = 'completed', completed_at = v_now, claim_expires_at = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('completionSummary', coalesce(p_summary, '')),
      updated_at = v_now
  where id = v_session.task_id
  returning * into v_task;

  update public.dev_center_tasks child
  set status = 'ready', updated_at = v_now
  where child.status = 'queued'
    and exists (select 1 from public.dev_center_task_dependencies d where d.task_id = child.id and d.depends_on_task_id = v_task.id)
    and not exists (
      select 1 from public.dev_center_task_dependencies d
      join public.dev_center_tasks parent on parent.id = d.depends_on_task_id
      where d.task_id = child.id
        and d.dependency_type in ('blocks','requires')
        and parent.status <> 'completed'
    );

  perform public.dev_center_release_session_atomic(p_session_id, 'Task completed', false);
  return to_jsonb(v_task);
end;
$$;

create or replace function public.dev_center_recover_stale_sessions_atomic(
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.dev_center_worker_sessions%rowtype;
  v_now timestamptz := now();
  v_ids jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  for v_session in
    select *
    from public.dev_center_worker_sessions
    where status <> 'closed'
      and lease_expires_at is not null
      and lease_expires_at <= v_now
    order by lease_expires_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  loop
    insert into public.dev_center_conflicts(
      id, conflict_type, repository_id, requester_session_id, holder_session_id,
      task_id, status, summary, details, created_at, resolved_at
    ) values (
      'dev-conflict-' || substr(md5(random()::text || clock_timestamp()::text || v_session.id), 1, 12),
      'lease', v_session.repository_id, v_session.id, v_session.id,
      v_session.task_id, 'resolved', 'Lejárt worker session automatikus recovery.',
      jsonb_build_object('leaseExpiresAt', v_session.lease_expires_at, 'lastHeartbeatAt', v_session.last_heartbeat_at),
      v_now, v_now
    );
    update public.dev_center_worker_sessions
    set recovery_count = recovery_count + 1, last_recovered_at = v_now
    where id = v_session.id;
    perform public.dev_center_release_session_atomic(v_session.id, 'Lease expired; automatic recovery.', true);
    v_ids := v_ids || to_jsonb(v_session.id);
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('recoveredCount', v_count, 'sessionIds', v_ids, 'recoveredAt', v_now);
end;
$$;

insert into public.dev_center_schema_meta(component, schema_version, migration_count, bootstrap_id, updated_at)
values ('dev-center-engine', '0.3.0', 2, 'BENJADMIN-B3-M3-20260810', now())
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = excluded.migration_count,
  bootstrap_id = excluded.bootstrap_id,
  updated_at = excluded.updated_at;

alter table public.dev_center_worktree_leases enable row level security;
alter table public.dev_center_conflicts enable row level security;

grant select, insert, update, delete on public.dev_center_worktree_leases to service_role;
grant select, insert, update, delete on public.dev_center_conflicts to service_role;

revoke all on function public.dev_center_claim_next_task_atomic(text,text,integer) from public, anon, authenticated;
revoke all on function public.dev_center_acquire_scope_bundle_atomic(text,jsonb,integer) from public, anon, authenticated;
revoke all on function public.dev_center_heartbeat_session_atomic(text,integer) from public, anon, authenticated;
revoke all on function public.dev_center_release_session_atomic(text,text,boolean) from public, anon, authenticated;
revoke all on function public.dev_center_complete_task_atomic(text,text) from public, anon, authenticated;
revoke all on function public.dev_center_recover_stale_sessions_atomic(integer) from public, anon, authenticated;

grant execute on function public.dev_center_claim_next_task_atomic(text,text,integer) to service_role;
grant execute on function public.dev_center_acquire_scope_bundle_atomic(text,jsonb,integer) to service_role;
grant execute on function public.dev_center_heartbeat_session_atomic(text,integer) to service_role;
grant execute on function public.dev_center_release_session_atomic(text,text,boolean) to service_role;
grant execute on function public.dev_center_complete_task_atomic(text,text) to service_role;
grant execute on function public.dev_center_recover_stale_sessions_atomic(integer) to service_role;

commit;
