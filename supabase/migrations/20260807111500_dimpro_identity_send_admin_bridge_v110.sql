-- DIMPRO Drop 1.1.0 administrative bridge for the already-live Identity Core 0.1.0.
-- This does not create a parallel identity store and does not rerun the core bootstrap.

begin;

create or replace function public.dimpro_admin_create_send_entitlement(
  p_user_id uuid,
  p_license_id uuid,
  p_code_hash text,
  p_code_hint text,
  p_expires_at timestamptz,
  p_recipient_mode text,
  p_recipients jsonb default '[]'::jsonb,
  p_can_use_standard_send boolean default true,
  p_can_use_quick_image_send boolean default true,
  p_can_use_image_groups boolean default true,
  p_can_use_file_comments boolean default true,
  p_can_use_project_drop boolean default false,
  p_max_recipients integer default 1,
  p_max_package_size_bytes bigint default 262144000,
  p_monthly_send_limit integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user public.dimpro_users;
  v_license public.dimpro_licenses;
  v_entitlement public.dimpro_send_entitlements;
  v_org_id uuid;
  v_recipient jsonb;
  v_recipient_id uuid;
  v_default_recipient_id uuid;
  v_recipient_count integer := 0;
  v_default_count integer := 0;
begin
  if p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'DIMPRO_SEND_CODE_HASH_INVALID' using errcode = '22023';
  end if;
  if lower(trim(coalesce(p_recipient_mode, ''))) not in ('locked_default','approved_list','free_entry') then
    raise exception 'DIMPRO_SEND_RECIPIENT_MODE_INVALID' using errcode = '22023';
  end if;
  if p_max_recipients < 1 or p_max_recipients > 100 then
    raise exception 'DIMPRO_SEND_RECIPIENT_LIMIT_INVALID' using errcode = '22023';
  end if;
  if p_max_package_size_bytes < 1 or p_max_package_size_bytes > 5368709120 then
    raise exception 'DIMPRO_SEND_PACKAGE_LIMIT_INVALID' using errcode = '22023';
  end if;
  if p_monthly_send_limit is not null and p_monthly_send_limit < 1 then
    raise exception 'DIMPRO_SEND_MONTHLY_LIMIT_INVALID' using errcode = '22023';
  end if;

  select * into v_user from public.dimpro_users where id = p_user_id for share;
  if v_user.id is null or v_user.status <> 'active' or v_user.email_verified_at is null then
    raise exception 'DIMPRO_SEND_USER_NOT_ACTIVE' using errcode = '42501';
  end if;

  select * into v_license from public.dimpro_licenses where id = p_license_id for share;
  if v_license.id is null
    or v_license.status not in ('active','trial')
    or (v_license.activated_at is not null and v_license.activated_at > now())
    or (v_license.expires_at is not null and v_license.expires_at < now()) then
    raise exception 'DIMPRO_SEND_LICENSE_NOT_ACTIVE' using errcode = '42501';
  end if;

  if v_license.owner_type = 'user' then
    if v_license.owner_user_id is distinct from v_user.id then
      raise exception 'DIMPRO_SEND_LICENSE_USER_MISMATCH' using errcode = '42501';
    end if;
    select m.organization_id into v_org_id
    from public.dimpro_organization_memberships m
    where m.user_id = v_user.id
      and m.status = 'active'
      and (m.access_ends_at is null or m.access_ends_at >= now())
    order by m.is_primary desc, m.joined_at
    limit 1;
  else
    v_org_id := v_license.owner_organization_id;
    if not exists (
      select 1
      from public.dimpro_organization_memberships m
      where m.user_id = v_user.id
        and m.organization_id = v_org_id
        and m.status = 'active'
        and (m.access_ends_at is null or m.access_ends_at >= now())
    ) then
      raise exception 'DIMPRO_SEND_LICENSE_ORGANIZATION_MISMATCH' using errcode = '42501';
    end if;
  end if;

  if jsonb_typeof(coalesce(p_recipients, '[]'::jsonb)) <> 'array' then
    raise exception 'DIMPRO_SEND_RECIPIENTS_INVALID' using errcode = '22023';
  end if;
  v_recipient_count := jsonb_array_length(coalesce(p_recipients, '[]'::jsonb));
  if lower(trim(p_recipient_mode)) = 'locked_default' and v_recipient_count < 1 then
    raise exception 'DIMPRO_SEND_DEFAULT_RECIPIENT_REQUIRED' using errcode = '22023';
  end if;
  if lower(trim(p_recipient_mode)) = 'approved_list' and v_recipient_count < 1 then
    raise exception 'DIMPRO_SEND_APPROVED_RECIPIENT_REQUIRED' using errcode = '22023';
  end if;
  if v_recipient_count > p_max_recipients then
    raise exception 'DIMPRO_SEND_RECIPIENT_LIMIT' using errcode = '22023';
  end if;

  insert into public.dimpro_send_entitlements (
    user_id, license_id, organization_id, code_hash, code_hint,
    status, valid_from, expires_at,
    can_use_standard_send, can_use_quick_image_send,
    can_use_image_groups, can_use_file_comments, can_use_project_drop,
    recipient_mode, max_recipients, max_package_size_bytes, monthly_send_limit
  ) values (
    v_user.id, v_license.id, v_org_id, lower(trim(p_code_hash)), nullif(trim(p_code_hint), ''),
    'active', now(), p_expires_at,
    coalesce(p_can_use_standard_send, false), coalesce(p_can_use_quick_image_send, false),
    coalesce(p_can_use_image_groups, false), coalesce(p_can_use_file_comments, false), coalesce(p_can_use_project_drop, false),
    lower(trim(p_recipient_mode)), p_max_recipients, p_max_package_size_bytes, p_monthly_send_limit
  ) returning * into v_entitlement;

  if p_can_use_standard_send then
    insert into public.dimpro_license_modules(license_id,module_code,enabled,valid_from,valid_until,updated_at)
    values(v_license.id,'DROP_SEND',true,now(),v_license.expires_at,now())
    on conflict(license_id,module_code) do update set
      enabled=true,
      valid_until=excluded.valid_until,
      updated_at=now();
  end if;
  if p_can_use_quick_image_send then
    insert into public.dimpro_license_modules(license_id,module_code,enabled,valid_from,valid_until,updated_at)
    values(v_license.id,'DROP_QUICK_IMAGE_SEND',true,now(),v_license.expires_at,now())
    on conflict(license_id,module_code) do update set
      enabled=true,
      valid_until=excluded.valid_until,
      updated_at=now();
  end if;
  if p_can_use_project_drop then
    insert into public.dimpro_license_modules(license_id,module_code,enabled,valid_from,valid_until,updated_at)
    values(v_license.id,'DROP_PROJECT_INBOX',true,now(),v_license.expires_at,now())
    on conflict(license_id,module_code) do update set
      enabled=true,
      valid_until=excluded.valid_until,
      updated_at=now();
  end if;

  for v_recipient in select value from jsonb_array_elements(coalesce(p_recipients, '[]'::jsonb)) loop
    if public.dimpro_normalize_email(v_recipient->>'email') = '' then
      raise exception 'DIMPRO_SEND_RECIPIENT_EMAIL_INVALID' using errcode = '22023';
    end if;
    if length(trim(coalesce(v_recipient->>'name', ''))) < 2 then
      raise exception 'DIMPRO_SEND_RECIPIENT_NAME_INVALID' using errcode = '22023';
    end if;

    insert into public.dimpro_send_recipients (
      entitlement_id, recipient_name, recipient_email, recipient_email_normalized,
      organization_name, label, is_default, is_locked, active
    ) values (
      v_entitlement.id,
      trim(v_recipient->>'name'),
      trim(v_recipient->>'email'),
      public.dimpro_normalize_email(v_recipient->>'email'),
      nullif(trim(v_recipient->>'organizationName'), ''),
      nullif(trim(v_recipient->>'label'), ''),
      coalesce((v_recipient->>'isDefault')::boolean, false),
      coalesce((v_recipient->>'locked')::boolean, false),
      true
    ) returning id into v_recipient_id;

    if coalesce((v_recipient->>'isDefault')::boolean, false) then
      v_default_count := v_default_count + 1;
      v_default_recipient_id := v_recipient_id;
    elsif v_default_recipient_id is null and lower(trim(p_recipient_mode)) = 'locked_default' then
      v_default_recipient_id := v_recipient_id;
    end if;
  end loop;

  if v_default_count > 1 then
    raise exception 'DIMPRO_SEND_MULTIPLE_DEFAULT_RECIPIENTS' using errcode = '22023';
  end if;

  if lower(trim(p_recipient_mode)) = 'locked_default' and v_default_recipient_id is null then
    raise exception 'DIMPRO_SEND_DEFAULT_RECIPIENT_REQUIRED' using errcode = '22023';
  end if;

  if v_default_recipient_id is not null then
    update public.dimpro_send_recipients
    set is_default = (id = v_default_recipient_id),
        is_locked = case when lower(trim(p_recipient_mode)) = 'locked_default' and id = v_default_recipient_id then true else is_locked end,
        updated_at = now()
    where entitlement_id = v_entitlement.id;

    update public.dimpro_send_entitlements
    set default_recipient_id = v_default_recipient_id,
        updated_at = now()
    where id = v_entitlement.id;
  end if;

  insert into public.dimpro_access_audit_logs (
    user_id, organization_id, license_id, entitlement_id,
    event_type, success, metadata
  ) values (
    v_user.id, v_org_id, v_license.id, v_entitlement.id,
    'send_entitlement_created', true,
    jsonb_build_object(
      'recipientMode', v_entitlement.recipient_mode,
      'recipientCount', v_recipient_count,
      'standardSend', v_entitlement.can_use_standard_send,
      'quickImageSend', v_entitlement.can_use_quick_image_send,
      'projectDrop', v_entitlement.can_use_project_drop
    )
  );

  return jsonb_build_object(
    'ok', true,
    'entitlementId', v_entitlement.id,
    'codeHint', v_entitlement.code_hint,
    'userId', v_user.id,
    'licenseId', v_license.id,
    'organizationId', v_org_id
  );
end;
$$;

create or replace function public.dimpro_admin_link_legacy_send_code(
  p_legacy_send_code_id text,
  p_entitlement_id uuid,
  p_revoke_legacy boolean default true,
  p_actor text default 'DIMPRO licencadmin'
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_legacy public.drop_public_send_codes;
  v_entitlement public.dimpro_send_entitlements;
begin
  select * into v_legacy
  from public.drop_public_send_codes
  where id = trim(coalesce(p_legacy_send_code_id, ''))
  for update;
  if v_legacy.id is null then
    raise exception 'DROP_LEGACY_SEND_CODE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_entitlement
  from public.dimpro_send_entitlements
  where id = p_entitlement_id
  for share;
  if v_entitlement.id is null then
    raise exception 'DIMPRO_SEND_ENTITLEMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_legacy.dimpro_send_entitlement_id is not null
    and v_legacy.dimpro_send_entitlement_id <> v_entitlement.id then
    raise exception 'DROP_LEGACY_SEND_CODE_ALREADY_LINKED' using errcode = '23505';
  end if;

  update public.drop_public_send_codes
  set dimpro_send_entitlement_id = v_entitlement.id,
      status = case when p_revoke_legacy then 'revoked' else status end,
      revoked_at = case when p_revoke_legacy then coalesce(revoked_at, now()) else revoked_at end,
      updated_at = now()
  where id = v_legacy.id;

  insert into public.dimpro_access_audit_logs (
    user_id, organization_id, license_id, entitlement_id,
    event_type, success, metadata
  ) values (
    v_entitlement.user_id,
    v_entitlement.organization_id,
    v_entitlement.license_id,
    v_entitlement.id,
    'legacy_send_code_linked',
    true,
    jsonb_build_object(
      'legacySendCodeId', v_legacy.id,
      'legacyRevoked', p_revoke_legacy,
      'actor', left(coalesce(p_actor, 'DIMPRO licencadmin'), 160)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'legacySendCodeId', v_legacy.id,
    'entitlementId', v_entitlement.id,
    'legacyRevoked', p_revoke_legacy
  );
end;
$$;

revoke all on function public.dimpro_admin_create_send_entitlement(uuid,uuid,text,text,timestamptz,text,jsonb,boolean,boolean,boolean,boolean,boolean,integer,bigint,integer)
  from public, anon, authenticated;
grant execute on function public.dimpro_admin_create_send_entitlement(uuid,uuid,text,text,timestamptz,text,jsonb,boolean,boolean,boolean,boolean,boolean,integer,bigint,integer)
  to service_role;

revoke all on function public.dimpro_admin_link_legacy_send_code(text,uuid,boolean,text)
  from public, anon, authenticated;
grant execute on function public.dimpro_admin_link_legacy_send_code(text,uuid,boolean,text)
  to service_role;

insert into public.drop_schema_meta (
  component, schema_version, migration_count, bootstrap_id, metadata, updated_at
) values (
  'drop-identity-admin-bridge',
  'DROP 1.1.0',
  1,
  'drop-identity-admin-bridge-v110-20260807',
  jsonb_build_object(
    'centralSendEntitlementAdmin', true,
    'legacyLinkOneByOne', true,
    'legacyAutoMigration', false,
    'rawSendCodeStored', false
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
