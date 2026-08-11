-- DIMPRO BENJADMIN B3.2 P3 Partner Provisioning 0.2.0
begin;

do $$
begin
  if to_regclass('public.dev_center_partner_projects') is null
     or to_regclass('public.dev_center_partner_environments') is null
     or to_regclass('public.dev_center_partner_access_policies') is null
     or to_regclass('public.dev_center_partner_engine_entitlements') is null
     or to_regclass('public.dev_center_partner_delivery_targets') is null
     or to_regclass('public.dev_center_secret_references') is null
     or to_regclass('public.dev_center_repositories') is null
     or to_regclass('public.dev_center_environments') is null
     or to_regclass('public.dev_center_audit_events') is null
     or to_regclass('public.dev_center_schema_meta') is null then
    raise exception 'PARTNER_P3_PREREQUISITES_REQUIRED';
  end if;
end
$$;

alter table public.dev_center_partner_projects
  add column if not exists provision_state text not null default 'DRAFT',
  add column if not exists provision_attempt integer not null default 0,
  add column if not exists provision_started_at timestamptz null,
  add column if not exists provisioned_at timestamptz null,
  add column if not exists last_provision_error text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.dev_center_partner_projects'::regclass
      and conname = 'dev_center_partner_projects_provision_state_check'
  ) then
    alter table public.dev_center_partner_projects
      add constraint dev_center_partner_projects_provision_state_check
      check (provision_state in ('DRAFT','VALIDATING','PROVISIONING','BASELINE_TEST','READY'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.dev_center_partner_projects'::regclass
      and conname = 'dev_center_partner_projects_provision_attempt_check'
  ) then
    alter table public.dev_center_partner_projects
      add constraint dev_center_partner_projects_provision_attempt_check
      check (provision_attempt >= 0);
  end if;
end
$$;

update public.dev_center_partner_projects
set provision_state = case status
  when 'ready' then 'READY'
  when 'provisioning' then 'PROVISIONING'
  else 'DRAFT'
end
where provision_state = 'DRAFT' and status in ('ready','provisioning');

create index if not exists dev_center_partner_projects_provision_idx
  on public.dev_center_partner_projects(provision_state, updated_at desc);

create or replace function public.dev_center_prepare_partner_provisioning_atomic(
  p_project_id text,
  p_created_by text default 'BenjAdmin'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_partner public.dev_center_partner_projects%rowtype;
  v_project public.dev_center_projects%rowtype;
  v_worker public.dev_center_workers%rowtype;
  v_actor text := coalesce(nullif(trim(p_created_by), ''), 'BenjAdmin');
  v_repo_id text;
  v_repo_path text;
  v_worktree_path text;
  v_dev_env_id text;
  v_stag_env_id text;
  v_target_id uuid;
  v_deploy_mode text;
  v_approval_policy text;
  v_current_state text;
begin
  if nullif(trim(p_project_id), '') is null then
    raise exception 'PARTNER_PROJECT_ID_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtext('partner-provision:' || p_project_id));

  select * into v_partner
  from public.dev_center_partner_projects
  where project_id = p_project_id
  for update;
  if not found then
    raise exception 'PARTNER_PROJECT_NOT_FOUND';
  end if;

  select * into v_project
  from public.dev_center_projects
  where id = v_partner.project_id
  limit 1;
  if not found then
    raise exception 'PARTNER_GENERIC_PROJECT_NOT_FOUND';
  end if;

  select * into v_worker
  from public.dev_center_workers
  where id = v_partner.default_worker_id and code = 'OUTMINAI'
  limit 1;
  if not found then
    raise exception 'PARTNER_DEFAULT_WORKER_INVALID';
  end if;

  if v_partner.status in ('paused','closed') then
    raise exception 'PARTNER_PROJECT_NOT_PROVISIONABLE';
  end if;

  v_current_state := v_partner.provision_state;
  v_repo_id := 'repo_partner_' || lower(replace(v_partner.project_code, '-', '_'));
  v_repo_path := '/srv/partner-dev/repositories/' || v_partner.project_code || '.git';
  v_worktree_path := '/srv/partner-dev/worktrees/outmin/' || v_partner.project_code;
  v_dev_env_id := 'env_partner_' || lower(replace(v_partner.project_code, '-', '_')) || '_dev';
  v_stag_env_id := 'env_partner_' || lower(replace(v_partner.project_code, '-', '_')) || '_stag';

  if v_current_state = 'READY' then
    return jsonb_build_object(
      'idempotent', true,
      'projectId', v_partner.project_id,
      'projectCode', v_partner.project_code,
      'provisionState', v_current_state,
      'repositoryId', v_repo_id,
      'repositoryPath', v_repo_path,
      'worktreePath', v_worktree_path,
      'devEnvironmentId', v_dev_env_id,
      'stagEnvironmentId', v_stag_env_id,
      'deliveryModel', v_partner.delivery_model
    );
  end if;

  if v_current_state = 'DRAFT' then
    update public.dev_center_partner_projects
    set provision_state = 'VALIDATING',
        status = 'provisioning',
        provision_started_at = coalesce(provision_started_at, now()),
        last_provision_error = null,
        updated_at = now(),
        metadata = metadata || jsonb_build_object(
          'provisioning', 'validating',
          'provisionState', 'VALIDATING'
        )
    where project_id = v_partner.project_id;

    insert into public.dev_center_audit_events(
      id, actor_type, actor_id, action, entity_type, entity_id, project_id, summary, metadata
    ) values (
      'dev-audit-p3-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18),
      'system', v_actor, 'PARTNER_PROVISION_VALIDATING', 'partner_project', v_partner.project_id,
      v_partner.project_id, 'Partner provisioning validáció elindult: ' || v_partner.project_code,
      jsonb_build_object('projectCode', v_partner.project_code, 'fromState', 'DRAFT', 'toState', 'VALIDATING')
    );
  elsif v_current_state not in ('VALIDATING','PROVISIONING','BASELINE_TEST') then
    raise exception 'PARTNER_PROVISION_STATE_INVALID';
  end if;

  insert into public.dev_center_repositories(
    id, project_id, name, remote_url, default_branch, dev_path, status, metadata, created_at, updated_at
  ) values (
    v_repo_id,
    v_partner.project_id,
    v_partner.project_code || ' partner repository',
    null,
    'main',
    v_repo_path,
    'active',
    jsonb_build_object(
      'developmentPlane', 'PARTNER',
      'partnerProjectCode', v_partner.project_code,
      'ownerWorkerId', v_partner.default_worker_id,
      'worktreePath', v_worktree_path
    ),
    now(), now()
  ) on conflict (id) do update set
    project_id = excluded.project_id,
    name = excluded.name,
    default_branch = excluded.default_branch,
    dev_path = excluded.dev_path,
    status = 'active',
    metadata = public.dev_center_repositories.metadata || excluded.metadata,
    updated_at = now();

  insert into public.dev_center_environments(
    id, code, name, kind, status, read_only, base_url, metadata, created_at, updated_at
  ) values (
    v_dev_env_id,
    v_partner.project_code || '-DEV',
    v_partner.project_code || ' Partner DEV',
    'DEV',
    'online',
    false,
    null,
    jsonb_build_object('developmentPlane', 'PARTNER', 'partnerProjectCode', v_partner.project_code),
    now(), now()
  ) on conflict (id) do update set
    name = excluded.name,
    kind = excluded.kind,
    status = excluded.status,
    read_only = excluded.read_only,
    metadata = public.dev_center_environments.metadata || excluded.metadata,
    updated_at = now();

  insert into public.dev_center_environments(
    id, code, name, kind, status, read_only, base_url, metadata, created_at, updated_at
  ) values (
    v_stag_env_id,
    v_partner.project_code || '-STAG',
    v_partner.project_code || ' Partner STAGING',
    'STAGING',
    'quarantine',
    true,
    null,
    jsonb_build_object('developmentPlane', 'PARTNER', 'partnerProjectCode', v_partner.project_code),
    now(), now()
  ) on conflict (id) do update set
    name = excluded.name,
    kind = excluded.kind,
    metadata = public.dev_center_environments.metadata || excluded.metadata,
    updated_at = now();

  insert into public.dev_center_partner_environments(
    project_id, environment_id, environment_type, runtime_ref, db_ref, storage_ref,
    health_status, metadata, created_at, updated_at
  ) values (
    v_partner.project_id,
    v_dev_env_id,
    'PARTNER_DEV',
    v_worktree_path,
    case when v_partner.delivery_model = 'HANDOFF' then 'not-required://handoff' else null end,
    case when v_partner.delivery_model = 'HANDOFF' then 'not-required://handoff' else null end,
    'unknown',
    jsonb_build_object('provisionState', 'PROVISIONING', 'repositoryId', v_repo_id),
    now(), now()
  ) on conflict (project_id, environment_type) do update set
    environment_id = excluded.environment_id,
    runtime_ref = excluded.runtime_ref,
    db_ref = coalesce(public.dev_center_partner_environments.db_ref, excluded.db_ref),
    storage_ref = coalesce(public.dev_center_partner_environments.storage_ref, excluded.storage_ref),
    metadata = public.dev_center_partner_environments.metadata || excluded.metadata,
    updated_at = now();

  insert into public.dev_center_partner_environments(
    project_id, environment_id, environment_type, runtime_ref, db_ref, storage_ref,
    health_status, metadata, created_at, updated_at
  ) values (
    v_partner.project_id,
    v_stag_env_id,
    'PARTNER_STAG',
    v_worktree_path,
    case when v_partner.delivery_model = 'HANDOFF' then 'not-required://handoff' else null end,
    case when v_partner.delivery_model = 'HANDOFF' then 'not-required://handoff' else null end,
    'unknown',
    jsonb_build_object('provisionState', 'PROVISIONING', 'repositoryId', v_repo_id),
    now(), now()
  ) on conflict (project_id, environment_type) do update set
    environment_id = excluded.environment_id,
    runtime_ref = excluded.runtime_ref,
    db_ref = coalesce(public.dev_center_partner_environments.db_ref, excluded.db_ref),
    storage_ref = coalesce(public.dev_center_partner_environments.storage_ref, excluded.storage_ref),
    metadata = public.dev_center_partner_environments.metadata || excluded.metadata,
    updated_at = now();

  insert into public.dev_center_partner_access_policies(
    project_id, subject_worker_id, resource_type, resource_ref, access_level, created_by, metadata
  ) values
    (v_partner.project_id, v_partner.default_worker_id, 'repository', v_repo_id, 'WRITE', v_actor, jsonb_build_object('source','P3_PROVISIONING')),
    (v_partner.project_id, v_partner.default_worker_id, 'path', v_worktree_path, 'WRITE', v_actor, jsonb_build_object('source','P3_PROVISIONING')),
    (v_partner.project_id, v_partner.default_worker_id, 'environment', v_dev_env_id, 'WRITE', v_actor, jsonb_build_object('source','P3_PROVISIONING')),
    (v_partner.project_id, v_partner.default_worker_id, 'environment', v_stag_env_id, 'WRITE', v_actor, jsonb_build_object('source','P3_PROVISIONING')),
    (v_partner.project_id, v_partner.default_worker_id, 'engine', 'dev-center:write', 'WRITE', v_actor, jsonb_build_object('source','P3_PROVISIONING')),
    (v_partner.project_id, v_partner.default_worker_id, 'engine', 'dev-center:build', 'WRITE', v_actor, jsonb_build_object('source','P3_PROVISIONING')),
    (v_partner.project_id, v_partner.default_worker_id, 'engine', 'dev-center:test', 'WRITE', v_actor, jsonb_build_object('source','P3_PROVISIONING'))
  on conflict (project_id, subject_worker_id, resource_type, resource_ref) do update set
    access_level = excluded.access_level,
    created_by = excluded.created_by,
    metadata = public.dev_center_partner_access_policies.metadata || excluded.metadata,
    expires_at = null,
    updated_at = now();

  insert into public.dev_center_partner_engine_entitlements(
    project_id, engine_key, allowed_version_range, current_version, status, metadata
  ) values
    (v_partner.project_id, 'dev-center:write', '>=0.3.0 <1.0.0', '0.3.0', 'allowed', jsonb_build_object('source','P3_PROVISIONING')),
    (v_partner.project_id, 'dev-center:build', '>=0.3.0 <1.0.0', '0.3.0', 'allowed', jsonb_build_object('source','P3_PROVISIONING')),
    (v_partner.project_id, 'dev-center:test', '>=0.3.0 <1.0.0', '0.3.0', 'allowed', jsonb_build_object('source','P3_PROVISIONING'))
  on conflict (project_id, engine_key) do update set
    allowed_version_range = excluded.allowed_version_range,
    current_version = excluded.current_version,
    status = 'allowed',
    metadata = public.dev_center_partner_engine_entitlements.metadata || excluded.metadata,
    updated_at = now();

  select id into v_target_id
  from public.dev_center_partner_delivery_targets
  where project_id = v_partner.project_id and target_type = v_partner.delivery_model
  order by created_at
  limit 1;

  if v_partner.delivery_model = 'HANDOFF' then
    v_deploy_mode := 'handoff';
    v_approval_policy := 'handoff_acceptance';
  elsif v_partner.delivery_model = 'PARTNER_HOSTED' then
    v_deploy_mode := 'controlled_remote';
    v_approval_policy := 'partner_acceptance';
  else
    v_deploy_mode := 'artifact';
    v_approval_policy := 'explicit';
  end if;

  if v_target_id is null then
    insert into public.dev_center_partner_delivery_targets(
      project_id, target_type, deploy_mode, approval_policy, status, metadata
    ) values (
      v_partner.project_id, v_partner.delivery_model, v_deploy_mode, v_approval_policy, 'draft',
      jsonb_build_object('source','P3_PROVISIONING')
    ) returning id into v_target_id;
  else
    update public.dev_center_partner_delivery_targets
    set deploy_mode = v_deploy_mode,
        approval_policy = v_approval_policy,
        metadata = metadata || jsonb_build_object('source','P3_PROVISIONING'),
        updated_at = now()
    where id = v_target_id;
  end if;

  if not exists (
    select 1 from public.dev_center_secret_references
    where scope_type = 'partner_project'
      and scope_id = v_partner.project_id
      and environment_id is null
      and secret_key_name = 'OUTMINAI_WORKER_TOKEN_REF'
  ) then
    insert into public.dev_center_secret_references(
      scope_type, scope_id, environment_id, secret_key_name, provider, reference_path, metadata
    ) values (
      'partner_project', v_partner.project_id, null, 'OUTMINAI_WORKER_TOKEN_REF',
      'benjadmin-control', 'secretref://outminai/worker-token', jsonb_build_object('rawSecretStored', false)
    );
  end if;

  if not exists (
    select 1 from public.dev_center_secret_references
    where scope_type = 'partner_project'
      and scope_id = v_partner.project_id
      and environment_id is null
      and secret_key_name = 'OUTMINAI_SSH_IDENTITY_REF'
  ) then
    insert into public.dev_center_secret_references(
      scope_type, scope_id, environment_id, secret_key_name, provider, reference_path, metadata
    ) values (
      'partner_project', v_partner.project_id, null, 'OUTMINAI_SSH_IDENTITY_REF',
      'benjadmin-control', 'secretref://outminai/ssh-identity', jsonb_build_object('rawSecretStored', false)
    );
  end if;

  update public.dev_center_partner_projects
  set provision_state = case when provision_state = 'BASELINE_TEST' then 'BASELINE_TEST' else 'PROVISIONING' end,
      status = 'provisioning',
      provision_attempt = provision_attempt + 1,
      provision_started_at = coalesce(provision_started_at, now()),
      last_provision_error = null,
      updated_at = now(),
      metadata = metadata || jsonb_build_object(
        'provisioning', case when provision_state = 'BASELINE_TEST' then 'baseline_test' else 'provisioning' end,
        'provisionState', case when provision_state = 'BASELINE_TEST' then 'BASELINE_TEST' else 'PROVISIONING' end,
        'repositoryId', v_repo_id,
        'repositoryPath', v_repo_path,
        'worktreePath', v_worktree_path,
        'devEnvironmentId', v_dev_env_id,
        'stagEnvironmentId', v_stag_env_id,
        'deliveryTargetId', v_target_id
      )
  where project_id = v_partner.project_id;

  insert into public.dev_center_audit_events(
    id, actor_type, actor_id, action, entity_type, entity_id, project_id, summary, metadata
  ) values (
    'dev-audit-p3-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18),
    'system', v_actor, 'PARTNER_PROVISION_PLAN_PREPARED', 'partner_project', v_partner.project_id,
    v_partner.project_id, 'Partner provisioning terv előkészítve: ' || v_partner.project_code,
    jsonb_build_object(
      'projectCode', v_partner.project_code,
      'repositoryId', v_repo_id,
      'repositoryPath', v_repo_path,
      'worktreePath', v_worktree_path,
      'devEnvironmentId', v_dev_env_id,
      'stagEnvironmentId', v_stag_env_id,
      'deliveryModel', v_partner.delivery_model
    )
  );

  return jsonb_build_object(
    'idempotent', v_current_state in ('PROVISIONING','BASELINE_TEST'),
    'projectId', v_partner.project_id,
    'projectCode', v_partner.project_code,
    'provisionState', case when v_current_state = 'BASELINE_TEST' then 'BASELINE_TEST' else 'PROVISIONING' end,
    'repositoryId', v_repo_id,
    'repositoryPath', v_repo_path,
    'worktreePath', v_worktree_path,
    'devEnvironmentId', v_dev_env_id,
    'stagEnvironmentId', v_stag_env_id,
    'deliveryTargetId', v_target_id,
    'deliveryModel', v_partner.delivery_model
  );
end;
$$;

create or replace function public.dev_center_transition_partner_provisioning_atomic(
  p_project_id text,
  p_expected_state text,
  p_next_state text,
  p_actor text default 'BenjAdmin',
  p_summary text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_partner public.dev_center_partner_projects%rowtype;
  v_expected text := upper(coalesce(nullif(trim(p_expected_state), ''), ''));
  v_next text := upper(coalesce(nullif(trim(p_next_state), ''), ''));
  v_actor text := coalesce(nullif(trim(p_actor), ''), 'BenjAdmin');
  v_allowed boolean := false;
begin
  perform pg_advisory_xact_lock(hashtext('partner-provision:' || p_project_id));

  select * into v_partner
  from public.dev_center_partner_projects
  where project_id = p_project_id
  for update;
  if not found then
    raise exception 'PARTNER_PROJECT_NOT_FOUND';
  end if;

  if v_partner.provision_state = v_next then
    return jsonb_build_object('idempotent', true, 'projectId', p_project_id, 'provisionState', v_next);
  end if;

  if v_partner.provision_state <> v_expected then
    raise exception 'PARTNER_PROVISION_STATE_MISMATCH';
  end if;

  v_allowed := (v_expected = 'DRAFT' and v_next = 'VALIDATING')
    or (v_expected = 'VALIDATING' and v_next = 'PROVISIONING')
    or (v_expected = 'PROVISIONING' and v_next = 'BASELINE_TEST')
    or (v_expected = 'BASELINE_TEST' and v_next = 'READY');
  if not v_allowed then
    raise exception 'PARTNER_PROVISION_TRANSITION_DENIED';
  end if;

  update public.dev_center_partner_projects
  set provision_state = v_next,
      status = case when v_next = 'READY' then 'ready' else 'provisioning' end,
      provisioned_at = case when v_next = 'READY' then now() else provisioned_at end,
      last_provision_error = null,
      updated_at = now(),
      metadata = metadata || jsonb_build_object(
        'provisioning', lower(v_next),
        'provisionState', v_next,
        'lastProvisionTransitionAt', now()
      ) || coalesce(p_metadata, '{}'::jsonb)
  where project_id = p_project_id;

  if v_next = 'BASELINE_TEST' then
    update public.dev_center_partner_environments
    set health_status = case when environment_type = 'PARTNER_DEV' then 'online' else health_status end,
        metadata = metadata || jsonb_build_object('provisionState', 'BASELINE_TEST'),
        updated_at = now()
    where project_id = p_project_id;
  elsif v_next = 'READY' then
    update public.dev_center_partner_environments
    set health_status = case when environment_type = 'PARTNER_DEV' then 'ready' else health_status end,
        metadata = metadata || jsonb_build_object('provisionState', 'READY'),
        updated_at = now()
    where project_id = p_project_id;

    update public.dev_center_partner_delivery_targets
    set status = case when target_type = 'HANDOFF' then 'ready' else status end,
        metadata = metadata || jsonb_build_object('provisionState', 'READY'),
        updated_at = now()
    where project_id = p_project_id;
  end if;

  insert into public.dev_center_audit_events(
    id, actor_type, actor_id, action, entity_type, entity_id, project_id, summary, metadata
  ) values (
    'dev-audit-p3-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18),
    'system', v_actor, 'PARTNER_PROVISION_STATE_CHANGED', 'partner_project', p_project_id,
    p_project_id,
    coalesce(nullif(trim(p_summary), ''), 'Partner provisioning state: ' || v_expected || ' -> ' || v_next),
    jsonb_build_object('fromState', v_expected, 'toState', v_next) || coalesce(p_metadata, '{}'::jsonb)
  );

  return jsonb_build_object('idempotent', false, 'projectId', p_project_id, 'provisionState', v_next);
end;
$$;

create or replace function public.dev_center_fail_partner_provisioning_atomic(
  p_project_id text,
  p_error_code text,
  p_actor text default 'BenjAdmin',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_partner public.dev_center_partner_projects%rowtype;
  v_error text := coalesce(nullif(trim(p_error_code), ''), 'PARTNER_PROVISION_FAILED');
  v_actor text := coalesce(nullif(trim(p_actor), ''), 'BenjAdmin');
begin
  perform pg_advisory_xact_lock(hashtext('partner-provision:' || p_project_id));
  select * into v_partner from public.dev_center_partner_projects where project_id = p_project_id for update;
  if not found then
    raise exception 'PARTNER_PROJECT_NOT_FOUND';
  end if;

  update public.dev_center_partner_projects
  set last_provision_error = v_error,
      updated_at = now(),
      metadata = metadata || jsonb_build_object('lastProvisionError', v_error, 'lastProvisionErrorAt', now()) || coalesce(p_metadata, '{}'::jsonb)
  where project_id = p_project_id;

  insert into public.dev_center_audit_events(
    id, actor_type, actor_id, action, entity_type, entity_id, project_id, summary, metadata
  ) values (
    'dev-audit-p3-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18),
    'system', v_actor, 'PARTNER_PROVISION_FAILED', 'partner_project', p_project_id,
    p_project_id, 'Partner provisioning hiba: ' || v_error,
    jsonb_build_object('errorCode', v_error, 'provisionState', v_partner.provision_state) || coalesce(p_metadata, '{}'::jsonb)
  );

  return jsonb_build_object('projectId', p_project_id, 'provisionState', v_partner.provision_state, 'errorCode', v_error);
end;
$$;

insert into public.dev_center_schema_meta(component, schema_version, migration_count, bootstrap_id, updated_at)
values ('partner-development-plane', '0.2.0', 2, 'BENJADMIN-B3.2-P3-20260811', now())
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = excluded.migration_count,
  bootstrap_id = excluded.bootstrap_id,
  updated_at = excluded.updated_at;

revoke all on function public.dev_center_prepare_partner_provisioning_atomic(text,text) from public;
revoke all on function public.dev_center_transition_partner_provisioning_atomic(text,text,text,text,text,jsonb) from public;
revoke all on function public.dev_center_fail_partner_provisioning_atomic(text,text,text,jsonb) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.dev_center_prepare_partner_provisioning_atomic(text,text) from anon';
    execute 'revoke all on function public.dev_center_transition_partner_provisioning_atomic(text,text,text,text,text,jsonb) from anon';
    execute 'revoke all on function public.dev_center_fail_partner_provisioning_atomic(text,text,text,jsonb) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.dev_center_prepare_partner_provisioning_atomic(text,text) from authenticated';
    execute 'revoke all on function public.dev_center_transition_partner_provisioning_atomic(text,text,text,text,text,jsonb) from authenticated';
    execute 'revoke all on function public.dev_center_fail_partner_provisioning_atomic(text,text,text,jsonb) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.dev_center_prepare_partner_provisioning_atomic(text,text) to service_role';
    execute 'grant execute on function public.dev_center_transition_partner_provisioning_atomic(text,text,text,text,text,jsonb) to service_role';
    execute 'grant execute on function public.dev_center_fail_partner_provisioning_atomic(text,text,text,jsonb) to service_role';
  end if;
end
$$;

commit;
