-- DIMPRO / DIMPROVER central Send entitlement, project Drop access and audit core 0.1.0
-- Requires: 20260806213000_dimpro_identity_license_project_core_v010.sql

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.dimpro_project_drop_settings (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.dimpro_projects(id) on delete cascade,
  enabled boolean not null default false,
  drive_folder_id uuid null,
  incoming_folder_name text not null default 'Beérkező Drop',
  preserve_groups boolean not null default true,
  require_virus_scan boolean not null default true,
  notify_project_admins boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dimpro_project_drop_settings_project_unique unique (project_id),
  constraint dimpro_project_drop_settings_folder_name_check check (length(trim(incoming_folder_name)) between 1 and 160)
);

create table if not exists public.dimpro_send_entitlements (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.dimpro_users(id) on delete cascade,
  license_id uuid not null references public.dimpro_licenses(id) on delete cascade,
  organization_id uuid null references public.dimpro_organizations(id) on delete set null,
  code_hash text not null,
  code_hint text null,
  status text not null default 'active',
  valid_from timestamptz not null default now(),
  expires_at timestamptz null,
  can_use_standard_send boolean not null default false,
  can_use_quick_image_send boolean not null default false,
  can_use_image_groups boolean not null default false,
  can_use_file_comments boolean not null default false,
  can_use_project_drop boolean not null default false,
  recipient_mode text not null default 'approved_list',
  default_recipient_id uuid null,
  max_recipients integer not null default 1,
  max_package_size_bytes bigint not null default 262144000,
  monthly_send_limit integer null,
  current_month_send_count integer not null default 0,
  send_count_month date not null default date_trunc('month', current_date)::date,
  last_used_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz null,
  revoked_by uuid null references public.dimpro_users(id) on delete set null,
  constraint dimpro_send_entitlements_code_hash_unique unique (code_hash),
  constraint dimpro_send_entitlements_hash_check check (code_hash ~ '^[a-f0-9]{64}$'),
  constraint dimpro_send_entitlements_status_check check (status in ('pending','active','suspended','expired','revoked')),
  constraint dimpro_send_entitlements_recipient_mode_check check (recipient_mode in ('locked_default','approved_list','free_entry')),
  constraint dimpro_send_entitlements_dates_check check (expires_at is null or expires_at >= valid_from),
  constraint dimpro_send_entitlements_max_recipients_check check (max_recipients between 1 and 100),
  constraint dimpro_send_entitlements_max_package_check check (max_package_size_bytes between 1 and 5368709120),
  constraint dimpro_send_entitlements_monthly_limit_check check (monthly_send_limit is null or monthly_send_limit >= 1),
  constraint dimpro_send_entitlements_month_count_check check (current_month_send_count >= 0)
);

create index if not exists dimpro_send_entitlements_user_status_idx
  on public.dimpro_send_entitlements (user_id, status);
create index if not exists dimpro_send_entitlements_license_status_idx
  on public.dimpro_send_entitlements (license_id, status);
create index if not exists dimpro_send_entitlements_org_status_idx
  on public.dimpro_send_entitlements (organization_id, status) where organization_id is not null;
create index if not exists dimpro_send_entitlements_validity_idx
  on public.dimpro_send_entitlements (status, valid_from, expires_at);

create table if not exists public.dimpro_send_recipients (
  id uuid primary key default extensions.gen_random_uuid(),
  entitlement_id uuid not null references public.dimpro_send_entitlements(id) on delete cascade,
  recipient_name text not null,
  recipient_email text not null,
  recipient_email_normalized text not null,
  organization_name text null,
  label text null,
  is_default boolean not null default false,
  is_locked boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dimpro_send_recipients_email_check check (
    recipient_email_normalized = public.dimpro_normalize_email(recipient_email)
    and recipient_email_normalized <> ''
  )
);

create unique index if not exists dimpro_send_recipients_email_unique
  on public.dimpro_send_recipients (entitlement_id, recipient_email_normalized)
  where active;
create unique index if not exists dimpro_send_recipients_default_unique
  on public.dimpro_send_recipients (entitlement_id)
  where is_default and active;
create index if not exists dimpro_send_recipients_entitlement_active_idx
  on public.dimpro_send_recipients (entitlement_id, active);

alter table public.dimpro_send_entitlements
  drop constraint if exists dimpro_send_entitlements_default_recipient_fk;
alter table public.dimpro_send_entitlements
  add constraint dimpro_send_entitlements_default_recipient_fk
  foreign key (default_recipient_id) references public.dimpro_send_recipients(id)
  on delete set null deferrable initially deferred;

create table if not exists public.dimpro_access_audit_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid null references public.dimpro_users(id) on delete set null,
  organization_id uuid null references public.dimpro_organizations(id) on delete set null,
  license_id uuid null references public.dimpro_licenses(id) on delete set null,
  project_id uuid null references public.dimpro_projects(id) on delete set null,
  entitlement_id uuid null references public.dimpro_send_entitlements(id) on delete set null,
  event_type text not null,
  success boolean not null,
  ip_hash text null,
  user_agent text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dimpro_access_audit_created_idx
  on public.dimpro_access_audit_logs (created_at desc);
create index if not exists dimpro_access_audit_user_created_idx
  on public.dimpro_access_audit_logs (user_id, created_at desc) where user_id is not null;
create index if not exists dimpro_access_audit_project_created_idx
  on public.dimpro_access_audit_logs (project_id, created_at desc) where project_id is not null;
create index if not exists dimpro_access_audit_entitlement_created_idx
  on public.dimpro_access_audit_logs (entitlement_id, created_at desc) where entitlement_id is not null;
create index if not exists dimpro_access_audit_event_created_idx
  on public.dimpro_access_audit_logs (event_type, created_at desc);

create table if not exists public.dimpro_access_rate_limits (
  scope text not null,
  subject_hash text not null,
  failure_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  last_failed_at timestamptz null,
  locked_until timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (scope, subject_hash),
  constraint dimpro_access_rate_limits_scope_check check (scope in ('send_code','project_code')),
  constraint dimpro_access_rate_limits_failure_check check (failure_count >= 0)
);

create index if not exists dimpro_access_rate_limits_locked_idx
  on public.dimpro_access_rate_limits (scope, locked_until)
  where locked_until is not null;

create or replace function public.dimpro_prepare_send_recipient_row()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.recipient_email := trim(new.recipient_email);
  new.recipient_email_normalized := public.dimpro_normalize_email(new.recipient_email);
  return new;
end;
$$;

drop trigger if exists dimpro_send_recipients_prepare_trigger on public.dimpro_send_recipients;
create trigger dimpro_send_recipients_prepare_trigger
before insert or update of recipient_email on public.dimpro_send_recipients
for each row execute function public.dimpro_prepare_send_recipient_row();

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'dimpro_project_drop_settings',
    'dimpro_send_entitlements',
    'dimpro_send_recipients',
    'dimpro_access_rate_limits'
  ] loop
    execute format('drop trigger if exists %I_updated_at_trigger on public.%I', v_table, v_table);
    execute format('create trigger %I_updated_at_trigger before update on public.%I for each row execute function public.dimpro_set_updated_at()', v_table, v_table);
  end loop;
end;
$$;

create or replace function public.dimpro_license_module_enabled(
  p_license_id uuid,
  p_module_code text,
  p_at timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.dimpro_license_modules lm
    join public.dimpro_licenses l on l.id = lm.license_id
    where lm.license_id = p_license_id
      and lm.module_code = upper(trim(p_module_code))
      and lm.enabled
      and (lm.valid_from is null or lm.valid_from <= p_at)
      and (lm.valid_until is null or lm.valid_until >= p_at)
      and l.status in ('active','trial')
      and (l.activated_at is null or l.activated_at <= p_at)
      and (l.expires_at is null or l.expires_at >= p_at)
  )
$$;

create or replace function public.dimpro_rate_limit_subject_hash(
  p_scope text,
  p_subject text,
  p_ip_hash text
)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(
    extensions.digest(
      lower(trim(coalesce(p_scope, ''))) || ':'
      || coalesce(trim(p_subject), '') || ':'
      || coalesce(trim(p_ip_hash), ''),
      'sha256'
    ),
    'hex'
  )
$$;

create or replace function public.dimpro_is_access_locked(
  p_scope text,
  p_subject_hash text
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.dimpro_access_rate_limits r
    where r.scope = p_scope
      and r.subject_hash = p_subject_hash
      and r.locked_until is not null
      and r.locked_until > now()
  )
$$;

create or replace function public.dimpro_record_access_failure(
  p_scope text,
  p_subject_hash text,
  p_max_failures integer default 5,
  p_window_minutes integer default 15,
  p_lock_minutes integer default 15
)
returns timestamptz
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_row public.dimpro_access_rate_limits;
  v_now timestamptz := now();
  v_count integer;
  v_window_start timestamptz;
  v_locked_until timestamptz;
begin
  if p_max_failures < 1 or p_window_minutes < 1 or p_lock_minutes < 1 then
    raise exception 'DIMPRO_INVALID_RATE_LIMIT_CONFIGURATION' using errcode = '22023';
  end if;

  select * into v_row
  from public.dimpro_access_rate_limits
  where scope = p_scope and subject_hash = p_subject_hash
  for update;

  if v_row.scope is null or v_row.window_started_at < v_now - make_interval(mins => p_window_minutes) then
    v_count := 1;
    v_window_start := v_now;
  else
    v_count := v_row.failure_count + 1;
    v_window_start := v_row.window_started_at;
  end if;

  if v_count >= p_max_failures then
    v_locked_until := v_now + make_interval(mins => p_lock_minutes);
  else
    v_locked_until := case
      when v_row.locked_until is not null and v_row.locked_until > v_now then v_row.locked_until
      else null
    end;
  end if;

  insert into public.dimpro_access_rate_limits (
    scope, subject_hash, failure_count, window_started_at,
    last_failed_at, locked_until, updated_at
  ) values (
    p_scope, p_subject_hash, v_count, v_window_start,
    v_now, v_locked_until, v_now
  )
  on conflict (scope, subject_hash) do update set
    failure_count = excluded.failure_count,
    window_started_at = excluded.window_started_at,
    last_failed_at = excluded.last_failed_at,
    locked_until = excluded.locked_until,
    updated_at = excluded.updated_at;

  return v_locked_until;
end;
$$;

create or replace function public.dimpro_clear_access_failures(
  p_scope text,
  p_subject_hash text
)
returns void
language sql
security definer
set search_path = public
set row_security = off
as $$
  delete from public.dimpro_access_rate_limits
  where scope = p_scope and subject_hash = p_subject_hash
$$;

create or replace function public.dimpro_entitlement_is_active(
  p_entitlement_id uuid,
  p_at timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.dimpro_send_entitlements e
    join public.dimpro_users u on u.id = e.user_id
    join public.dimpro_licenses l on l.id = e.license_id
    where e.id = p_entitlement_id
      and e.status = 'active'
      and e.valid_from <= p_at
      and (e.expires_at is null or e.expires_at >= p_at)
      and u.status = 'active'
      and u.email_verified_at is not null
      and l.status in ('active','trial')
      and (l.activated_at is null or l.activated_at <= p_at)
      and (l.expires_at is null or l.expires_at >= p_at)
      and (
        e.monthly_send_limit is null
        or e.send_count_month < date_trunc('month', p_at)::date
        or e.current_month_send_count < e.monthly_send_limit
      )
  )
$$;

create or replace function public.dimpro_allowed_projects_for_entitlement(
  p_entitlement_id uuid
)
returns table (
  id uuid,
  public_code text,
  name text,
  can_upload_to_drop boolean
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    p.id,
    p.public_project_code,
    p.name,
    pm.can_upload_to_drop
  from public.dimpro_send_entitlements e
  join public.dimpro_project_memberships pm on pm.user_id = e.user_id
  join public.dimpro_projects p on p.id = pm.project_id
  join public.dimpro_project_drop_settings ds on ds.project_id = p.id
  where e.id = p_entitlement_id
    and public.dimpro_entitlement_is_active(e.id)
    and e.can_use_project_drop
    and public.dimpro_license_module_enabled(e.license_id, 'DROP_PROJECT_INBOX')
    and pm.status = 'active'
    and pm.can_upload_to_drop
    and pm.valid_from <= now()
    and (pm.valid_until is null or pm.valid_until >= now())
    and p.status = 'active'
    and p.project_drop_enabled
    and ds.enabled
  order by p.name, p.public_project_code
$$;

create or replace function public.dimpro_project_drop_access_allowed(
  p_entitlement_id uuid,
  p_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.dimpro_allowed_projects_for_entitlement(p_entitlement_id) allowed
    where allowed.id = p_project_id
  )
$$;

create or replace function public.dimpro_verify_send_entitlement(
  p_code_hash text,
  p_ip_hash text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
set row_security = off
as $$
declare
  v_subject_hash text;
  v_entitlement public.dimpro_send_entitlements;
  v_user public.dimpro_users;
  v_license public.dimpro_licenses;
  v_org public.dimpro_organizations;
  v_default_recipient public.dimpro_send_recipients;
  v_projects jsonb := '[]'::jsonb;
  v_locked_until timestamptz;
  v_can_standard boolean;
  v_can_quick boolean;
  v_can_project boolean;
begin
  v_subject_hash := public.dimpro_rate_limit_subject_hash('send_code', p_code_hash, p_ip_hash);

  if public.dimpro_is_access_locked('send_code', v_subject_hash) then
    insert into public.dimpro_access_audit_logs (
      event_type, success, ip_hash, user_agent, metadata
    ) values (
      'send_code_locked', false, p_ip_hash, left(p_user_agent, 500),
      jsonb_build_object('reason', 'rate_limited')
    );
    return jsonb_build_object(
      'ok', false,
      'error', 'A küldési jogosultságkód nem használható.'
    );
  end if;

  select e.* into v_entitlement
  from public.dimpro_send_entitlements e
  where e.code_hash = lower(trim(p_code_hash))
  limit 1;

  if v_entitlement.id is null or not public.dimpro_entitlement_is_active(v_entitlement.id) then
    v_locked_until := public.dimpro_record_access_failure('send_code', v_subject_hash, 5, 15, 15);
    insert into public.dimpro_access_audit_logs (
      user_id, organization_id, license_id, entitlement_id,
      event_type, success, ip_hash, user_agent, metadata
    ) values (
      v_entitlement.user_id, v_entitlement.organization_id, v_entitlement.license_id, v_entitlement.id,
      case when v_locked_until is not null then 'send_code_locked' else 'send_code_failed' end,
      false, p_ip_hash, left(p_user_agent, 500),
      jsonb_build_object('reason', 'invalid_or_inactive')
    );
    return jsonb_build_object(
      'ok', false,
      'error', 'A küldési jogosultságkód nem használható.'
    );
  end if;

  select * into v_user from public.dimpro_users where id = v_entitlement.user_id;
  select * into v_license from public.dimpro_licenses where id = v_entitlement.license_id;

  select o.* into v_org
  from public.dimpro_organizations o
  where o.id = coalesce(
    v_entitlement.organization_id,
    v_license.owner_organization_id,
    (
      select m.organization_id
      from public.dimpro_organization_memberships m
      where m.user_id = v_entitlement.user_id
        and m.status = 'active'
        and (m.access_ends_at is null or m.access_ends_at >= now())
      order by m.is_primary desc, m.joined_at
      limit 1
    )
  );

  select r.* into v_default_recipient
  from public.dimpro_send_recipients r
  where r.entitlement_id = v_entitlement.id
    and r.active
    and (r.id = v_entitlement.default_recipient_id or r.is_default)
  order by (r.id = v_entitlement.default_recipient_id) desc, r.is_default desc
  limit 1;

  v_can_standard := v_entitlement.can_use_standard_send
    and public.dimpro_license_module_enabled(v_entitlement.license_id, 'DROP_SEND');
  v_can_quick := v_entitlement.can_use_quick_image_send
    and public.dimpro_license_module_enabled(v_entitlement.license_id, 'DROP_QUICK_IMAGE_SEND');
  v_can_project := v_entitlement.can_use_project_drop
    and public.dimpro_license_module_enabled(v_entitlement.license_id, 'DROP_PROJECT_INBOX');

  if not (v_can_standard or v_can_quick or v_can_project) then
    v_locked_until := public.dimpro_record_access_failure('send_code', v_subject_hash, 5, 15, 15);
    insert into public.dimpro_access_audit_logs (
      user_id, organization_id, license_id, entitlement_id,
      event_type, success, ip_hash, user_agent, metadata
    ) values (
      v_user.id, v_org.id, v_license.id, v_entitlement.id,
      'send_code_failed', false, p_ip_hash, left(p_user_agent, 500),
      jsonb_build_object('reason', 'no_enabled_send_module')
    );
    return jsonb_build_object(
      'ok', false,
      'error', 'A küldési jogosultságkód nem használható.'
    );
  end if;

  perform public.dimpro_clear_access_failures('send_code', v_subject_hash);

  if v_entitlement.send_count_month < date_trunc('month', current_date)::date then
    update public.dimpro_send_entitlements
    set current_month_send_count = 0,
        send_count_month = date_trunc('month', current_date)::date,
        last_used_at = now()
    where id = v_entitlement.id;
    v_entitlement.current_month_send_count := 0;
    v_entitlement.send_count_month := date_trunc('month', current_date)::date;
  else
    update public.dimpro_send_entitlements set last_used_at = now() where id = v_entitlement.id;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', allowed.id,
        'publicCode', allowed.public_code,
        'name', allowed.name,
        'canUploadToDrop', allowed.can_upload_to_drop
      ) order by allowed.name
    ),
    '[]'::jsonb
  ) into v_projects
  from public.dimpro_allowed_projects_for_entitlement(v_entitlement.id) allowed;

  insert into public.dimpro_access_audit_logs (
    user_id, organization_id, license_id, entitlement_id,
    event_type, success, ip_hash, user_agent, metadata
  ) values (
    v_user.id, v_org.id, v_license.id, v_entitlement.id,
    'send_code_verified', true, p_ip_hash, left(p_user_agent, 500),
    jsonb_build_object(
      'recipientMode', v_entitlement.recipient_mode,
      'projectCount', jsonb_array_length(v_projects)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'user', jsonb_build_object(
      'id', v_user.id,
      'publicCode', v_user.public_user_code,
      'fullName', v_user.full_name,
      'email', v_user.email,
      'organizationName', v_org.display_name
    ),
    'entitlement', jsonb_build_object(
      'id', v_entitlement.id,
      'canUseStandardSend', v_can_standard,
      'canUseQuickImageSend', v_can_quick,
      'canUseImageGroups', v_entitlement.can_use_image_groups,
      'canUseFileComments', v_entitlement.can_use_file_comments,
      'canUseProjectDrop', v_can_project,
      'recipientMode', v_entitlement.recipient_mode,
      'maxRecipients', v_entitlement.max_recipients,
      'maxPackageSizeBytes', v_entitlement.max_package_size_bytes,
      'monthlySendLimit', v_entitlement.monthly_send_limit,
      'currentMonthSendCount', v_entitlement.current_month_send_count
    ),
    'defaultRecipient', case
      when v_default_recipient.id is null then null
      else jsonb_build_object(
        'id', v_default_recipient.id,
        'name', v_default_recipient.recipient_name,
        'email', v_default_recipient.recipient_email,
        'organizationName', v_default_recipient.organization_name,
        'label', v_default_recipient.label,
        'locked', v_default_recipient.is_locked
      )
    end,
    'projects', v_projects
  );
end;
$$;

create or replace function public.dimpro_verify_project_code(
  p_entitlement_id uuid,
  p_public_project_code text,
  p_ip_hash text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
set row_security = off
as $$
declare
  v_subject_hash text;
  v_project public.dimpro_projects;
  v_settings public.dimpro_project_drop_settings;
  v_entitlement public.dimpro_send_entitlements;
  v_locked_until timestamptz;
begin
  select * into v_entitlement
  from public.dimpro_send_entitlements
  where id = p_entitlement_id;

  v_subject_hash := public.dimpro_rate_limit_subject_hash(
    'project_code',
    coalesce(p_entitlement_id::text, '') || ':' || upper(trim(coalesce(p_public_project_code, ''))),
    p_ip_hash
  );

  if public.dimpro_is_access_locked('project_code', v_subject_hash) then
    insert into public.dimpro_access_audit_logs (
      user_id, organization_id, license_id, entitlement_id,
      event_type, success, ip_hash, user_agent, metadata
    ) values (
      v_entitlement.user_id, v_entitlement.organization_id, v_entitlement.license_id, v_entitlement.id,
      'project_code_failed', false, p_ip_hash, left(p_user_agent, 500),
      jsonb_build_object('reason', 'rate_limited')
    );
    return jsonb_build_object('ok', false, 'error', 'A projektkód nem használható.');
  end if;

  select p.* into v_project
  from public.dimpro_projects p
  where p.public_project_code = upper(trim(p_public_project_code))
    and public.dimpro_project_drop_access_allowed(p_entitlement_id, p.id)
  limit 1;

  if v_project.id is null then
    v_locked_until := public.dimpro_record_access_failure('project_code', v_subject_hash, 5, 15, 15);
    insert into public.dimpro_access_audit_logs (
      user_id, organization_id, license_id, entitlement_id,
      event_type, success, ip_hash, user_agent, metadata
    ) values (
      v_entitlement.user_id, v_entitlement.organization_id, v_entitlement.license_id, v_entitlement.id,
      'project_code_failed', false, p_ip_hash, left(p_user_agent, 500),
      jsonb_build_object('reason', 'not_found_or_not_authorized', 'locked', v_locked_until is not null)
    );
    return jsonb_build_object('ok', false, 'error', 'A projektkód nem használható.');
  end if;

  select * into v_settings
  from public.dimpro_project_drop_settings
  where project_id = v_project.id and enabled;

  if v_settings.id is null then
    v_locked_until := public.dimpro_record_access_failure('project_code', v_subject_hash, 5, 15, 15);
    insert into public.dimpro_access_audit_logs (
      user_id, organization_id, license_id, project_id, entitlement_id,
      event_type, success, ip_hash, user_agent, metadata
    ) values (
      v_entitlement.user_id, v_entitlement.organization_id, v_entitlement.license_id, v_project.id, v_entitlement.id,
      'project_code_failed', false, p_ip_hash, left(p_user_agent, 500),
      jsonb_build_object('reason', 'drop_destination_disabled')
    );
    return jsonb_build_object('ok', false, 'error', 'A projektkód nem használható.');
  end if;

  perform public.dimpro_clear_access_failures('project_code', v_subject_hash);

  insert into public.dimpro_access_audit_logs (
    user_id, organization_id, license_id, project_id, entitlement_id,
    event_type, success, ip_hash, user_agent, metadata
  ) values (
    v_entitlement.user_id, v_entitlement.organization_id, v_entitlement.license_id, v_project.id, v_entitlement.id,
    'project_code_verified', true, p_ip_hash, left(p_user_agent, 500),
    jsonb_build_object('destination', 'project_drop_inbox')
  );

  return jsonb_build_object(
    'ok', true,
    'project', jsonb_build_object(
      'id', v_project.id,
      'publicCode', v_project.public_project_code,
      'name', v_project.name
    ),
    'destination', jsonb_build_object(
      'type', 'project_drop_inbox',
      'label', v_settings.incoming_folder_name,
      'driveFolderId', v_settings.drive_folder_id,
      'preserveGroups', v_settings.preserve_groups,
      'requireVirusScan', v_settings.require_virus_scan,
      'notifyProjectAdmins', v_settings.notify_project_admins
    )
  );
end;
$$;

create or replace function public.dimpro_record_send_completed(
  p_entitlement_id uuid,
  p_project_id uuid default null,
  p_package_size_bytes bigint default 0,
  p_recipient_count integer default 1,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_entitlement public.dimpro_send_entitlements;
  v_new_count integer;
begin
  select * into v_entitlement
  from public.dimpro_send_entitlements
  where id = p_entitlement_id
  for update;

  if v_entitlement.id is null or not public.dimpro_entitlement_is_active(v_entitlement.id) then
    raise exception 'DIMPRO_SEND_ENTITLEMENT_NOT_ACTIVE' using errcode = '42501';
  end if;
  if p_package_size_bytes < 0 or p_package_size_bytes > v_entitlement.max_package_size_bytes then
    raise exception 'DIMPRO_SEND_PACKAGE_SIZE_LIMIT' using errcode = '22023';
  end if;
  if p_recipient_count < 1 or p_recipient_count > v_entitlement.max_recipients then
    raise exception 'DIMPRO_SEND_RECIPIENT_LIMIT' using errcode = '22023';
  end if;
  if p_project_id is not null and not public.dimpro_project_drop_access_allowed(p_entitlement_id, p_project_id) then
    raise exception 'DIMPRO_PROJECT_DROP_NOT_ALLOWED' using errcode = '42501';
  end if;

  if v_entitlement.send_count_month < date_trunc('month', current_date)::date then
    v_new_count := 1;
    update public.dimpro_send_entitlements
    set current_month_send_count = v_new_count,
        send_count_month = date_trunc('month', current_date)::date,
        last_used_at = now()
    where id = p_entitlement_id;
  else
    v_new_count := v_entitlement.current_month_send_count + 1;
    if v_entitlement.monthly_send_limit is not null and v_new_count > v_entitlement.monthly_send_limit then
      raise exception 'DIMPRO_SEND_MONTHLY_LIMIT' using errcode = '42501';
    end if;
    update public.dimpro_send_entitlements
    set current_month_send_count = v_new_count,
        last_used_at = now()
    where id = p_entitlement_id;
  end if;

  insert into public.dimpro_access_audit_logs (
    user_id, organization_id, license_id, project_id, entitlement_id,
    event_type, success, metadata
  ) values (
    v_entitlement.user_id, v_entitlement.organization_id, v_entitlement.license_id,
    p_project_id, v_entitlement.id, 'send_completed', true,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'packageSizeBytes', p_package_size_bytes,
      'recipientCount', p_recipient_count,
      'currentMonthSendCount', v_new_count
    )
  );

  return jsonb_build_object('ok', true, 'currentMonthSendCount', v_new_count);
end;
$$;

-- Create disabled project Drop settings for all canonical projects. Activation remains an explicit admin action.
insert into public.dimpro_project_drop_settings (project_id, enabled)
select p.id, false
from public.dimpro_projects p
on conflict (project_id) do nothing;

-- Compatibility bridges to existing Drop tables. No legacy Send code is auto-bound because old codes
-- do not carry a reliable user/license owner relation; the migration must be explicit and auditable.
do $$
begin
  if to_regclass('public.drop_public_send_codes') is not null then
    alter table public.drop_public_send_codes add column if not exists dimpro_send_entitlement_id uuid null;
    if not exists (select 1 from pg_constraint where conname = 'drop_public_send_codes_canonical_entitlement_fk') then
      alter table public.drop_public_send_codes
        add constraint drop_public_send_codes_canonical_entitlement_fk
        foreign key (dimpro_send_entitlement_id) references public.dimpro_send_entitlements(id) on delete set null;
    end if;
    create unique index if not exists drop_public_send_codes_canonical_entitlement_unique
      on public.drop_public_send_codes (dimpro_send_entitlement_id)
      where dimpro_send_entitlement_id is not null;
  end if;

  if to_regclass('public.drop_space_projects') is not null then
    alter table public.drop_space_projects add column if not exists dimpro_project_id uuid null;
    if not exists (select 1 from pg_constraint where conname = 'drop_space_projects_canonical_project_fk') then
      alter table public.drop_space_projects
        add constraint drop_space_projects_canonical_project_fk
        foreign key (dimpro_project_id) references public.dimpro_projects(id) on delete set null;
    end if;
    create index if not exists drop_space_projects_canonical_project_idx
      on public.drop_space_projects (dimpro_project_id) where dimpro_project_id is not null;

    update public.drop_space_projects dsp
    set dimpro_project_id = p.id
    from public.dimpro_projects p
    where dsp.dimpro_project_id is null
      and (
        p.legacy_project_core_id = dsp.project_id
        or p.id::text = dsp.project_id
        or lower(p.name) = lower(dsp.project_name_snapshot)
      );
  end if;
end;
$$;

alter table public.dimpro_project_drop_settings enable row level security;
alter table public.dimpro_send_entitlements enable row level security;
alter table public.dimpro_send_recipients enable row level security;
alter table public.dimpro_access_audit_logs enable row level security;
alter table public.dimpro_access_rate_limits enable row level security;

revoke all on public.dimpro_project_drop_settings from public, anon, authenticated;
revoke all on public.dimpro_send_entitlements from public, anon, authenticated;
revoke all on public.dimpro_send_recipients from public, anon, authenticated;
revoke all on public.dimpro_access_audit_logs from public, anon, authenticated;
revoke all on public.dimpro_access_rate_limits from public, anon, authenticated;

grant select on public.dimpro_project_drop_settings to authenticated;

drop policy if exists dimpro_project_drop_settings_select_member on public.dimpro_project_drop_settings;
create policy dimpro_project_drop_settings_select_member on public.dimpro_project_drop_settings
for select to authenticated
using (public.dimpro_has_project_permission(project_id, 'view'));

revoke all on function public.dimpro_verify_send_entitlement(text,text,text) from public, anon, authenticated;
revoke all on function public.dimpro_allowed_projects_for_entitlement(uuid) from public, anon, authenticated;
revoke all on function public.dimpro_project_drop_access_allowed(uuid,uuid) from public, anon, authenticated;
revoke all on function public.dimpro_verify_project_code(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.dimpro_record_send_completed(uuid,uuid,bigint,integer,jsonb) from public, anon, authenticated;

grant execute on function public.dimpro_verify_send_entitlement(text,text,text) to service_role;
grant execute on function public.dimpro_allowed_projects_for_entitlement(uuid) to service_role;
grant execute on function public.dimpro_project_drop_access_allowed(uuid,uuid) to service_role;
grant execute on function public.dimpro_verify_project_code(uuid,text,text,text) to service_role;
grant execute on function public.dimpro_record_send_completed(uuid,uuid,bigint,integer,jsonb) to service_role;

insert into public.dimpro_identity_schema_meta (
  component, schema_version, migration_count, bootstrap_id, metadata, updated_at
) values (
  'dimpro-identity-core',
  '0.1.0',
  2,
  'dimpro-send-project-access-v010-20260806',
  jsonb_build_object(
    'sendEntitlements', true,
    'projectDropSettings', true,
    'projectCodeRateLimit', jsonb_build_object('failures', 5, 'lockMinutes', 15),
    'legacySendCodesAutoMigrated', false,
    'dropUiActivationDeferred', true,
    'authDimproImplementationDeferred', true
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
