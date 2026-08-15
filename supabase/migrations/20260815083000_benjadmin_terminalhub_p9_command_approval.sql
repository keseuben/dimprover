begin;

alter table public.dev_center_approvals
  drop constraint if exists dev_center_approvals_approval_type_check;

alter table public.dev_center_approvals
  add constraint dev_center_approvals_approval_type_check
  check (approval_type in (
    'prod_write','prod_migration','prod_restart','prod_deploy','release','recovery',
    'dev_restart','dev_migration','dev_deploy'
  ));

create unique index if not exists dev_center_command_queue_approval_once_idx
  on public.dev_center_command_queue(approval_id)
  where approval_id is not null;

create or replace function public.dev_center_queue_approved_command(
  p_approval_id uuid,
  p_target_environment text,
  p_operation text,
  p_command_name text,
  p_requested_by text,
  p_start_context_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns public.dev_center_command_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approval public.dev_center_approvals%rowtype;
  v_command public.dev_center_command_queue%rowtype;
  v_expected_command text;
  v_expected_session text;
begin
  if p_approval_id is null then
    raise exception 'APPROVAL_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_approval
  from public.dev_center_approvals
  where id = p_approval_id
  for update;

  if not found then
    raise exception 'APPROVAL_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_approval.status <> 'approved' then
    raise exception 'APPROVAL_NOT_APPROVED' using errcode = 'P0001';
  end if;
  if v_approval.expires_at is not null and v_approval.expires_at <= now() then
    update public.dev_center_approvals set status='expired', updated_at=now() where id=v_approval.id;
    raise exception 'APPROVAL_EXPIRED' using errcode = 'P0001';
  end if;
  if v_approval.target_environment <> p_target_environment or v_approval.operation <> p_operation then
    raise exception 'APPROVAL_SCOPE_MISMATCH' using errcode = 'P0001';
  end if;

  v_expected_command := nullif(v_approval.metadata->>'commandName','');
  v_expected_session := nullif(v_approval.metadata->>'sessionId','');
  if v_expected_command is not null and v_expected_command <> p_command_name then
    raise exception 'APPROVAL_COMMAND_MISMATCH' using errcode = 'P0001';
  end if;
  if v_expected_session is not null and v_expected_session <> coalesce(p_payload->>'sessionId','') then
    raise exception 'APPROVAL_SESSION_MISMATCH' using errcode = 'P0001';
  end if;

  insert into public.dev_center_command_queue(
    start_context_id, approval_id, target_environment, operation, command_name,
    requested_by, status, requires_approval, payload
  ) values (
    p_start_context_id, v_approval.id, p_target_environment, p_operation, p_command_name,
    p_requested_by, 'queued', true, coalesce(p_payload,'{}'::jsonb)
  ) returning * into v_command;

  update public.dev_center_approvals
  set status='consumed', updated_at=now()
  where id=v_approval.id and status='approved';

  if not found then
    raise exception 'APPROVAL_CONSUME_FAILED' using errcode = 'P0001';
  end if;

  return v_command;
end;
$$;

revoke all on function public.dev_center_queue_approved_command(uuid,text,text,text,text,uuid,jsonb) from public;
revoke all on function public.dev_center_queue_approved_command(uuid,text,text,text,text,uuid,jsonb) from anon;
revoke all on function public.dev_center_queue_approved_command(uuid,text,text,text,text,uuid,jsonb) from authenticated;
grant execute on function public.dev_center_queue_approved_command(uuid,text,text,text,text,uuid,jsonb) to service_role;

insert into public.dev_center_control_schema_meta(component, schema_version, migration_count, target_architecture, updated_at)
values('benjadmin-terminal-security-approval', '0.1.0', 1, 'CONTROL_VPS', now())
on conflict (component) do update set
  schema_version=excluded.schema_version,
  migration_count=excluded.migration_count,
  target_architecture=excluded.target_architecture,
  updated_at=excluded.updated_at;

commit;
