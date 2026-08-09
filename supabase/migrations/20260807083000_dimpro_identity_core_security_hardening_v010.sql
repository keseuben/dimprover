-- DIMPRO / DIMPROVER Identity Core 0.1.0 security hardening
-- Requires both 20260806 Identity Core migrations.
-- Additive/rerunnable hardening before first live activation.

begin;

-- 1. The default recipient must belong to the same Send entitlement.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dimpro_send_recipients_id_entitlement_unique'
      and conrelid = 'public.dimpro_send_recipients'::regclass
  ) then
    alter table public.dimpro_send_recipients
      add constraint dimpro_send_recipients_id_entitlement_unique
      unique (id, entitlement_id);
  end if;
end;
$$;

alter table public.dimpro_send_entitlements
  drop constraint if exists dimpro_send_entitlements_default_recipient_fk;

alter table public.dimpro_send_entitlements
  add constraint dimpro_send_entitlements_default_recipient_fk
  foreign key (default_recipient_id, id)
  references public.dimpro_send_recipients(id, entitlement_id)
  on delete set null (default_recipient_id);

-- 2. Rate limiting is intentionally independent from the candidate code.
-- Otherwise an attacker could rotate candidate codes and receive a fresh counter.
-- Send: per IP pseudonym. Project code: per entitlement/session + IP pseudonym.
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
      || case lower(trim(coalesce(p_scope, '')))
        when 'send_code' then 'ip'
        when 'project_code' then coalesce(nullif(split_part(trim(coalesce(p_subject, '')), ':', 1), ''), 'unknown-entitlement')
        else coalesce(trim(p_subject), '')
      end || ':'
      || coalesce(nullif(trim(p_ip_hash), ''), 'unknown-ip'),
      'sha256'
    ),
    'hex'
  )
$$;

-- 3. A locked-default recipient entitlement is not active without an active default recipient.
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
      and (
        e.recipient_mode <> 'locked_default'
        or exists (
          select 1
          from public.dimpro_send_recipients r
          where r.entitlement_id = e.id
            and r.active
            and (r.id = e.default_recipient_id or r.is_default)
        )
      )
  )
$$;

-- 4. Internal helper RPCs must not remain executable through PostgREST by default.
-- PostgreSQL grants EXECUTE on new functions to PUBLIC unless explicitly revoked.
revoke all on function public.dimpro_normalize_email(text) from public, anon, authenticated;
revoke all on function public.dimpro_random_token(integer) from public, anon, authenticated;
revoke all on function public.dimpro_build_public_code(text,integer,integer) from public, anon, authenticated;
revoke all on function public.dimpro_generate_user_code() from public, anon, authenticated;
revoke all on function public.dimpro_generate_organization_code() from public, anon, authenticated;
revoke all on function public.dimpro_generate_license_code() from public, anon, authenticated;
revoke all on function public.dimpro_generate_project_code() from public, anon, authenticated;
revoke all on function public.dimpro_set_updated_at() from public, anon, authenticated;
revoke all on function public.dimpro_prepare_user_row() from public, anon, authenticated;
revoke all on function public.dimpro_prepare_organization_row() from public, anon, authenticated;
revoke all on function public.dimpro_prepare_license_row() from public, anon, authenticated;
revoke all on function public.dimpro_prepare_project_row() from public, anon, authenticated;
revoke all on function public.dimpro_prepare_send_recipient_row() from public, anon, authenticated;

revoke all on function public.dimpro_current_user_id() from public, anon, authenticated;
revoke all on function public.dimpro_is_organization_member(uuid) from public, anon, authenticated;
revoke all on function public.dimpro_has_project_permission(uuid,text) from public, anon, authenticated;
grant execute on function public.dimpro_current_user_id() to authenticated, service_role;
grant execute on function public.dimpro_is_organization_member(uuid) to authenticated, service_role;
grant execute on function public.dimpro_has_project_permission(uuid,text) to authenticated, service_role;

revoke all on function public.dimpro_license_module_enabled(uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function public.dimpro_rate_limit_subject_hash(text,text,text) from public, anon, authenticated;
revoke all on function public.dimpro_is_access_locked(text,text) from public, anon, authenticated;
revoke all on function public.dimpro_record_access_failure(text,text,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.dimpro_clear_access_failures(text,text) from public, anon, authenticated;
revoke all on function public.dimpro_entitlement_is_active(uuid,timestamptz) from public, anon, authenticated;

-- Public server API remains service-role only.
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
  3,
  'dimpro-identity-core-security-hardening-v010-20260807',
  jsonb_build_object(
    'defaultRecipientBoundToEntitlement', true,
    'rateLimitCandidateRotationSafe', true,
    'lockedDefaultRecipientFailClosed', true,
    'internalRpcPrivilegesHardened', true
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
