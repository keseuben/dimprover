begin;

create or replace function public.dev_center_claim_task_atomic(
  p_session_id text,
  p_worker_id text,
  p_task_id text,
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

  select * into v_task
  from public.dev_center_tasks
  where id = p_task_id
  for update;
  if not found then raise exception 'DEV_CENTER_TASK_NOT_FOUND'; end if;
  if v_task.status not in ('queued','ready') then raise exception 'DEV_CENTER_TASK_ALREADY_CLAIMED'; end if;
  if v_task.requested_worker_id is not null and v_task.requested_worker_id <> p_worker_id then raise exception 'DEV_CENTER_TASK_WORKER_MISMATCH'; end if;
  if exists (
    select 1
    from public.dev_center_task_dependencies d
    join public.dev_center_tasks parent on parent.id = d.depends_on_task_id
    where d.task_id = p_task_id
      and d.dependency_type in ('blocks','requires')
      and parent.status <> 'completed'
  ) then raise exception 'DEV_CENTER_TASK_DEPENDENCY_BLOCKED'; end if;

  update public.dev_center_tasks
  set status = 'claimed', assigned_worker_id = p_worker_id,
      claimed_by_session_id = p_session_id,
      claim_expires_at = v_now + make_interval(secs => v_lease_seconds),
      last_claimed_at = v_now, attempt_count = attempt_count + 1, updated_at = v_now
  where id = p_task_id
  returning * into v_task;

  update public.dev_center_worker_sessions
  set task_id = v_task.id, project_id = v_task.project_id, version_id = v_task.version_id,
      repository_id = v_task.repository_id, handshake_stage = 'TASK_BOUND',
      lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
      last_heartbeat_at = v_now, updated_at = v_now
  where id = p_session_id;

  return to_jsonb(v_task);
end;
$$;

revoke all on function public.dev_center_claim_task_atomic(text,text,text,integer) from public, anon, authenticated;
grant execute on function public.dev_center_claim_task_atomic(text,text,text,integer) to service_role;
commit;
