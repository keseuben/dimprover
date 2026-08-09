-- DIMPRO Drop 1.1.0 -> Identity Core 0.1.0 consumer bridge
-- IMPORTANT: this is NOT an Identity Core bootstrap/migration rerun.
-- It only extends the existing Drop public workflow tables so they can reference
-- the already-live canonical DIMPRO Send entitlement and project records.

begin;

alter table public.drop_public_sessions
  add column if not exists dimpro_send_entitlement_id uuid null
  references public.dimpro_send_entitlements(id) on delete restrict;

alter table public.drop_public_package_workflows
  add column if not exists dimpro_send_entitlement_id uuid null
  references public.dimpro_send_entitlements(id) on delete set null;

alter table public.drop_public_package_workflows
  add column if not exists dimpro_project_id uuid null
  references public.dimpro_projects(id) on delete set null;

alter table public.drop_public_package_workflows
  add column if not exists project_public_code text null;

alter table public.drop_public_package_workflows
  add column if not exists identity_accounted_at timestamptz null;

create index if not exists drop_public_sessions_identity_entitlement_idx
  on public.drop_public_sessions(dimpro_send_entitlement_id)
  where dimpro_send_entitlement_id is not null;

create index if not exists drop_public_workflows_identity_entitlement_idx
  on public.drop_public_package_workflows(dimpro_send_entitlement_id)
  where dimpro_send_entitlement_id is not null;

create index if not exists drop_public_workflows_identity_project_idx
  on public.drop_public_package_workflows(dimpro_project_id)
  where dimpro_project_id is not null;

alter table public.drop_public_sessions
  drop constraint if exists drop_public_session_source_check;

alter table public.drop_public_sessions
  add constraint drop_public_session_source_check check (
    (
      workflow_type = 'send'
      and gate_id is null
      and (
        (send_code_id is not null and dimpro_send_entitlement_id is null)
        or (send_code_id is null and dimpro_send_entitlement_id is not null)
      )
    )
    or (
      workflow_type = 'submission_gate'
      and gate_id is not null
      and send_code_id is null
      and dimpro_send_entitlement_id is null
    )
  );

create or replace function public.drop_public_bind_session_package_atomic(
  p_token_hash text,
  p_package_id uuid,
  p_reserved_bytes bigint
)
returns public.drop_public_sessions
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  session_row public.drop_public_sessions%rowtype;
  code_row public.drop_public_send_codes%rowtype;
  entitlement_row public.dimpro_send_entitlements%rowtype;
  used_packages integer := 0;
  used_bytes bigint := 0;
begin
  select * into session_row
  from public.drop_public_sessions
  where token_hash = p_token_hash and expires_at > now()
  for update;

  if not found then
    raise exception 'DROP_PUBLIC_SESSION_INVALID';
  end if;
  if session_row.package_id is not null and session_row.package_id <> p_package_id then
    raise exception 'DROP_PUBLIC_SESSION_ALREADY_BOUND';
  end if;

  if session_row.send_code_id is not null then
    select * into code_row
    from public.drop_public_send_codes
    where id = session_row.send_code_id
    for update;

    if not found or code_row.status <> 'active' or code_row.expires_at <= now() then
      raise exception 'DROP_SEND_CODE_DENIED';
    end if;

    select count(*), coalesce(sum(reserved_bytes), 0)
      into used_packages, used_bytes
    from public.drop_public_usage
    where send_code_id = code_row.id
      and created_at >= date_trunc('day', now())
      and package_id <> p_package_id;

    if used_packages >= code_row.max_packages_per_day then
      raise exception 'DROP_SEND_CODE_DAILY_PACKAGE_LIMIT';
    end if;
    if used_bytes + greatest(p_reserved_bytes, 0) > code_row.max_bytes_per_day then
      raise exception 'DROP_SEND_CODE_DAILY_BYTES_LIMIT';
    end if;

    insert into public.drop_public_usage(id, send_code_id, package_id, reserved_bytes, created_at)
    values(
      'usage_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
      code_row.id,
      p_package_id,
      greatest(p_reserved_bytes, 0),
      now()
    )
    on conflict(package_id) do nothing;
  elsif session_row.dimpro_send_entitlement_id is not null then
    select * into entitlement_row
    from public.dimpro_send_entitlements
    where id = session_row.dimpro_send_entitlement_id
    for update;

    if not found or not public.dimpro_entitlement_is_active(entitlement_row.id) then
      raise exception 'DIMPRO_SEND_ENTITLEMENT_NOT_ACTIVE' using errcode = '42501';
    end if;
    if greatest(p_reserved_bytes, 0) > entitlement_row.max_package_size_bytes then
      raise exception 'DIMPRO_SEND_PACKAGE_SIZE_LIMIT' using errcode = '22023';
    end if;
  end if;

  update public.drop_public_sessions
  set package_id = p_package_id,
      used_at = coalesce(used_at, now()),
      updated_at = now()
  where id = session_row.id
  returning * into session_row;

  return session_row;
end;
$$;

create or replace function public.drop_public_record_identity_accounting_atomic(
  p_package_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  workflow_row public.drop_public_package_workflows%rowtype;
  package_size_bytes bigint := 0;
  recipient_count integer := 0;
  accounting_result jsonb := '{}'::jsonb;
begin
  select * into workflow_row
  from public.drop_public_package_workflows
  where package_id = p_package_id
  for update;

  if not found then
    raise exception 'DROP_PUBLIC_WORKFLOW_NOT_FOUND';
  end if;

  if workflow_row.dimpro_send_entitlement_id is null then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'legacy_or_non_send_workflow');
  end if;

  if workflow_row.identity_accounted_at is not null then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'accountedAt', workflow_row.identity_accounted_at
    );
  end if;

  select coalesce(sum(greatest(coalesce(size_stored_bytes, 0), 0)), 0)
    into package_size_bytes
  from public.drop_files
  where package_id = p_package_id
    and deleted_at is null;

  recipient_count := greatest(
    1,
    case
      when jsonb_typeof(workflow_row.recipient_emails) = 'array'
        then jsonb_array_length(workflow_row.recipient_emails)
      else 0
    end
  );

  select public.dimpro_record_send_completed(
    workflow_row.dimpro_send_entitlement_id,
    workflow_row.dimpro_project_id,
    package_size_bytes,
    recipient_count,
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'source', 'drop_public_finalize',
        'packageId', p_package_id,
        'projectPublicCode', workflow_row.project_public_code
      )
  ) into accounting_result;

  update public.drop_public_package_workflows
  set identity_accounted_at = now(),
      updated_at = now()
  where package_id = p_package_id
  returning * into workflow_row;

  return coalesce(accounting_result, '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'accountedAt', workflow_row.identity_accounted_at,
    'packageSizeBytes', package_size_bytes,
    'recipientCount', recipient_count
  );
end;
$$;

revoke all on function public.drop_public_bind_session_package_atomic(text,uuid,bigint)
  from public, anon, authenticated;
grant execute on function public.drop_public_bind_session_package_atomic(text,uuid,bigint)
  to service_role;

revoke all on function public.drop_public_record_identity_accounting_atomic(uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.drop_public_record_identity_accounting_atomic(uuid,jsonb)
  to service_role;

insert into public.drop_schema_meta (
  component,
  schema_version,
  migration_count,
  bootstrap_id,
  metadata,
  updated_at
) values (
  'drop-identity-consumer-bridge',
  'DROP 1.1.0',
  1,
  'drop-identity-consumer-bridge-v110-20260807',
  jsonb_build_object(
    'identityCoreVersion', '0.1.0',
    'parallelIdentityStoreCreated', false,
    'centralEntitlementSessionBridge', true,
    'centralProjectWorkflowBridge', true,
    'identityAccountingAtomic', true,
    'legacySendCodeCompatibility', true
  ),
  now()
)
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = greatest(public.drop_schema_meta.migration_count, excluded.migration_count),
  bootstrap_id = excluded.bootstrap_id,
  metadata = coalesce(public.drop_schema_meta.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

commit;
