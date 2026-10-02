-- DIMPRO Drive Core 0.8.6
-- Folder password gate: server-side password hash, unlock versioning, rate-limit state.
-- DEV migration source only. Apply only through guarded migration gate.

begin;

do $$
declare
  v_schema_version text;
  v_migration_count integer;
  v_bootstrap_id text;
begin
  select schema_version, migration_count, bootstrap_id
    into v_schema_version, v_migration_count, v_bootstrap_id
  from public.drive_core_schema_meta
  where component = 'drive-core';

  if not (
    (v_schema_version = '0.8.4' and v_migration_count = 6 and v_bootstrap_id = 'drive-core-v084-metadata-controls-20261002')
    or
    (v_schema_version = '0.8.6' and v_migration_count = 7 and v_bootstrap_id = 'drive-core-v086-folder-password-gate-20261002')
  ) then
    raise exception 'DRIVE_CORE_V086_UNEXPECTED_SCHEMA_MARKER';
  end if;
end;
$$;

create table if not exists public.drive_core_folder_passwords (
  folder_id text primary key references public.drive_core_folders(id) on delete cascade,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  password_hash text not null,
  password_version integer not null default 1,
  unlock_ttl_minutes integer not null default 120,
  max_attempts integer not null default 5,
  lockout_minutes integer not null default 15,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drive_core_folder_password_hash_check
    check (length(password_hash) between 40 and 1000),
  constraint drive_core_folder_password_version_check
    check (password_version > 0),
  constraint drive_core_folder_password_ttl_check
    check (unlock_ttl_minutes between 5 and 1440),
  constraint drive_core_folder_password_attempt_limit_check
    check (max_attempts between 3 and 20),
  constraint drive_core_folder_password_lockout_check
    check (lockout_minutes between 1 and 1440),
  constraint drive_core_folder_password_project_folder_unique
    unique (project_id, folder_id)
);

create table if not exists public.drive_core_folder_password_attempts (
  project_id text not null references public.project_core_projects(id) on delete cascade,
  folder_id text not null references public.drive_core_folder_passwords(folder_id) on delete cascade,
  actor_user_id text not null,
  failure_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz null,
  last_failure_at timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (project_id, folder_id, actor_user_id),
  constraint drive_core_folder_password_attempt_count_check
    check (failure_count >= 0)
);

create index if not exists drive_core_folder_passwords_project_idx
  on public.drive_core_folder_passwords (project_id, folder_id);

create index if not exists drive_core_folder_password_attempts_locked_idx
  on public.drive_core_folder_password_attempts (project_id, locked_until)
  where locked_until is not null;

alter table public.drive_core_folder_passwords enable row level security;
alter table public.drive_core_folder_password_attempts enable row level security;

revoke all on public.drive_core_folder_passwords from anon, authenticated;
revoke all on public.drive_core_folder_password_attempts from anon, authenticated;

comment on table public.drive_core_folder_passwords is
  'Server-side second-factor-like folder password gate. Password hash never leaves server APIs.';
comment on column public.drive_core_folder_passwords.password_version is
  'Incremented whenever password is changed; invalidates prior signed unlock grants.';

create or replace function public.drive_core_set_folder_password_atomic(
  p_project_id text,
  p_folder_id text,
  p_password_hash text,
  p_unlock_ttl_minutes integer,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_folder public.drive_core_folders;
  v_row public.drive_core_folder_passwords;
begin
  select * into v_folder
  from public.drive_core_folders
  where id = p_folder_id
    and project_id = p_project_id
    and status = 'ACTIVE'
  for update;

  if v_folder.id is null then
    raise exception 'DRIVE_FOLDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if btrim(coalesce(p_password_hash,'')) = '' then
    raise exception 'DRIVE_FOLDER_PASSWORD_HASH_REQUIRED' using errcode = 'P0001';
  end if;

  insert into public.drive_core_folder_passwords (
    folder_id, project_id, password_hash, password_version,
    unlock_ttl_minutes, max_attempts, lockout_minutes,
    created_by, updated_by, created_at, updated_at
  ) values (
    p_folder_id, p_project_id, p_password_hash, 1,
    greatest(5, least(1440, coalesce(p_unlock_ttl_minutes,120))),
    5, 15, p_actor_user_id, p_actor_user_id, now(), now()
  )
  on conflict (folder_id) do update set
    project_id = excluded.project_id,
    password_hash = excluded.password_hash,
    password_version = public.drive_core_folder_passwords.password_version + 1,
    unlock_ttl_minutes = excluded.unlock_ttl_minutes,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_row;

  delete from public.drive_core_folder_password_attempts
  where project_id = p_project_id and folder_id = p_folder_id;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'DRIVE_FOLDER_PASSWORD_SET','folder',p_folder_id,
    'Mappajelszó beállítva vagy módosítva',
    jsonb_build_object(
      'passwordVersion',v_row.password_version,
      'unlockTtlMinutes',v_row.unlock_ttl_minutes,
      'maxAttempts',v_row.max_attempts,
      'lockoutMinutes',v_row.lockout_minutes
    )
  );

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,'FOLDER_PASSWORD_SET','folder',p_folder_id,
    jsonb_build_object(
      'passwordVersion',v_row.password_version,
      'unlockTtlMinutes',v_row.unlock_ttl_minutes
    ),
    p_actor_user_id
  );

  return jsonb_build_object(
    'projectId',v_row.project_id,
    'folderId',v_row.folder_id,
    'passwordVersion',v_row.password_version,
    'unlockTtlMinutes',v_row.unlock_ttl_minutes,
    'maxAttempts',v_row.max_attempts,
    'lockoutMinutes',v_row.lockout_minutes,
    'createdBy',v_row.created_by,
    'updatedBy',v_row.updated_by,
    'createdAt',v_row.created_at,
    'updatedAt',v_row.updated_at
  );
end;
$$;

create or replace function public.drive_core_clear_folder_password_atomic(
  p_project_id text,
  p_folder_id text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.drive_core_folder_passwords;
begin
  delete from public.drive_core_folder_passwords
  where project_id = p_project_id and folder_id = p_folder_id
  returning * into v_row;

  if v_row.folder_id is null then
    return jsonb_build_object('cleared',false,'projectId',p_project_id,'folderId',p_folder_id);
  end if;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'DRIVE_FOLDER_PASSWORD_CLEARED','folder',p_folder_id,
    'Mappajelszó-védelem törölve',
    jsonb_build_object('previousPasswordVersion',v_row.password_version)
  );

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,'FOLDER_PASSWORD_CLEARED','folder',p_folder_id,
    jsonb_build_object('previousPasswordVersion',v_row.password_version),
    p_actor_user_id
  );

  return jsonb_build_object('cleared',true,'projectId',p_project_id,'folderId',p_folder_id);
end;
$$;

create or replace function public.drive_core_record_folder_password_failure_atomic(
  p_project_id text,
  p_folder_id text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_password public.drive_core_folder_passwords;
  v_attempt public.drive_core_folder_password_attempts;
  v_count integer;
  v_window timestamptz;
  v_locked_until timestamptz;
  v_now timestamptz := now();
begin
  select * into v_password
  from public.drive_core_folder_passwords
  where project_id = p_project_id and folder_id = p_folder_id;

  if v_password.folder_id is null then
    raise exception 'DRIVE_FOLDER_PASSWORD_NOT_CONFIGURED' using errcode = 'P0002';
  end if;

  select * into v_attempt
  from public.drive_core_folder_password_attempts
  where project_id = p_project_id
    and folder_id = p_folder_id
    and actor_user_id = p_actor_user_id
  for update;

  if v_attempt.locked_until is not null and v_attempt.locked_until > v_now then
    return jsonb_build_object(
      'failureCount',v_attempt.failure_count,
      'lockedUntil',v_attempt.locked_until,
      'locked',true
    );
  end if;

  if v_attempt.actor_user_id is null
     or v_attempt.window_started_at < v_now - interval '15 minutes' then
    v_count := 1;
    v_window := v_now;
  else
    v_count := v_attempt.failure_count + 1;
    v_window := v_attempt.window_started_at;
  end if;

  if v_count >= v_password.max_attempts then
    v_locked_until := v_now + make_interval(mins => v_password.lockout_minutes);
  else
    v_locked_until := null;
  end if;

  insert into public.drive_core_folder_password_attempts (
    project_id,folder_id,actor_user_id,failure_count,window_started_at,
    locked_until,last_failure_at,updated_at
  ) values (
    p_project_id,p_folder_id,p_actor_user_id,v_count,v_window,
    v_locked_until,v_now,v_now
  )
  on conflict (project_id,folder_id,actor_user_id) do update set
    failure_count=excluded.failure_count,
    window_started_at=excluded.window_started_at,
    locked_until=excluded.locked_until,
    last_failure_at=excluded.last_failure_at,
    updated_at=excluded.updated_at
  returning * into v_attempt;

  if v_locked_until is not null then
    insert into public.project_core_audit_events (
      id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
    ) values (
      'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
      p_project_id,p_actor_user_id,'DRIVE_FOLDER_PASSWORD_LOCKOUT','folder',p_folder_id,
      'Mappajelszó-feloldás ideiglenesen zárolva',
      jsonb_build_object(
        'failureCount',v_count,
        'lockedUntil',v_locked_until
      )
    );
  end if;

  return jsonb_build_object(
    'failureCount',v_attempt.failure_count,
    'lockedUntil',v_attempt.locked_until,
    'locked',v_attempt.locked_until is not null and v_attempt.locked_until > v_now
  );
end;
$$;

create or replace function public.drive_core_record_folder_password_unlock_atomic(
  p_project_id text,
  p_folder_id text,
  p_password_version integer,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_password public.drive_core_folder_passwords;
begin
  select * into v_password
  from public.drive_core_folder_passwords
  where project_id = p_project_id and folder_id = p_folder_id;

  if v_password.folder_id is null then
    raise exception 'DRIVE_FOLDER_PASSWORD_NOT_CONFIGURED' using errcode = 'P0002';
  end if;
  if v_password.password_version <> p_password_version then
    raise exception 'DRIVE_FOLDER_PASSWORD_VERSION_CHANGED' using errcode = 'P0001';
  end if;

  delete from public.drive_core_folder_password_attempts
  where project_id=p_project_id and folder_id=p_folder_id and actor_user_id=p_actor_user_id;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'DRIVE_FOLDER_PASSWORD_UNLOCKED','folder',p_folder_id,
    'Jelszóvédett mappa sikeresen feloldva',
    jsonb_build_object('passwordVersion',p_password_version)
  );

  return jsonb_build_object(
    'ok',true,
    'projectId',p_project_id,
    'folderId',p_folder_id,
    'passwordVersion',p_password_version
  );
end;
$$;

update public.drive_core_schema_meta
set schema_version = '0.8.6',
    migration_count = 7,
    bootstrap_id = 'drive-core-v086-folder-password-gate-20261002',
    updated_at = now()
where component = 'drive-core'
  and schema_version = '0.8.4'
  and migration_count = 6
  and bootstrap_id = 'drive-core-v084-metadata-controls-20261002';

commit;
