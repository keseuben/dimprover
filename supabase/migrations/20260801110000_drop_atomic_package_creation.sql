-- DIMPRO Drop atomic package creation
-- DROP 0.2.0 – prepared now, applied only during the final Supabase activation.

create or replace function public.drop_create_package_atomic(
  p_package jsonb,
  p_recipients jsonb default '[]'::jsonb,
  p_groups jsonb default '[]'::jsonb,
  p_tokens jsonb default '[]'::jsonb,
  p_event_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_package public.drop_packages%rowtype;
  v_token_count integer;
  v_purpose_count integer;
begin
  if coalesce(jsonb_typeof(p_package), 'null') <> 'object' then
    raise exception using errcode = '22023', message = 'DROP_INVALID_PACKAGE_PAYLOAD';
  end if;
  if jsonb_typeof(coalesce(p_recipients, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_groups, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_tokens, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'DROP_INVALID_PACKAGE_COLLECTIONS';
  end if;

  if p_package ? 'pin'
     or p_package ? 'rawPin'
     or p_package ? 'rawTokens'
     or p_package ? 'links' then
    raise exception using errcode = '22023', message = 'DROP_RAW_CREDENTIAL_REJECTED';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(coalesce(p_tokens, '[]'::jsonb)) token_value
     where token_value ? 'rawToken'
        or token_value ? 'raw_token'
        or token_value ? 'link'
  ) then
    raise exception using errcode = '22023', message = 'DROP_RAW_CREDENTIAL_REJECTED';
  end if;

  v_token_count := jsonb_array_length(coalesce(p_tokens, '[]'::jsonb));
  select count(distinct token_value->>'purpose')
    into v_purpose_count
    from jsonb_array_elements(coalesce(p_tokens, '[]'::jsonb)) token_value
   where token_value->>'purpose' in ('upload', 'view', 'download', 'report');

  if v_token_count <> 4 or v_purpose_count <> 4 then
    raise exception using errcode = '22023', message = 'DROP_CAPABILITY_SET_INCOMPLETE';
  end if;

  insert into public.drop_packages (
    public_code,
    mode,
    title,
    description,
    project_id,
    project_name_snapshot,
    owner_user_id,
    organization_id,
    created_by_user_id,
    uploader_name,
    uploader_email,
    status,
    access_policy,
    upload_opens_at,
    upload_closes_at,
    expires_at,
    grace_expires_at,
    retention_days,
    pin_hash,
    pin_salt,
    max_file_count,
    max_file_size_bytes,
    max_total_size_bytes
  ) values (
    trim(p_package->>'public_code'),
    trim(p_package->>'mode'),
    trim(p_package->>'title'),
    coalesce(p_package->>'description', ''),
    nullif(trim(p_package->>'project_id'), ''),
    nullif(trim(p_package->>'project_name_snapshot'), ''),
    nullif(trim(p_package->>'owner_user_id'), ''),
    nullif(trim(p_package->>'organization_id'), ''),
    nullif(trim(p_package->>'created_by_user_id'), ''),
    coalesce(trim(p_package->>'uploader_name'), ''),
    lower(coalesce(trim(p_package->>'uploader_email'), '')),
    'active',
    'token_pin',
    (p_package->>'upload_opens_at')::timestamptz,
    (p_package->>'upload_closes_at')::timestamptz,
    (p_package->>'expires_at')::timestamptz,
    (p_package->>'grace_expires_at')::timestamptz,
    (p_package->>'retention_days')::integer,
    p_package->>'pin_hash',
    p_package->>'pin_salt',
    (p_package->>'max_file_count')::integer,
    (p_package->>'max_file_size_bytes')::bigint,
    (p_package->>'max_total_size_bytes')::bigint
  )
  returning * into v_package;

  insert into public.drop_recipients (
    package_id,
    name,
    email,
    company,
    role,
    receive_invitation,
    receive_activity_notifications,
    receive_final_report
  )
  select
    v_package.id,
    trim(recipient.name),
    lower(trim(recipient.email)),
    nullif(trim(recipient.company), ''),
    coalesce(nullif(trim(recipient.role), ''), 'invitee'),
    coalesce(recipient.receive_invitation, true),
    coalesce(recipient.receive_activity_notifications, true),
    coalesce(recipient.receive_final_report, true)
  from jsonb_to_recordset(coalesce(p_recipients, '[]'::jsonb)) as recipient(
    name text,
    email text,
    company text,
    role text,
    receive_invitation boolean,
    receive_activity_notifications boolean,
    receive_final_report boolean
  );

  insert into public.drop_groups (
    package_id,
    name,
    code,
    description,
    sort_order,
    file_name_prefix,
    sequence_start
  )
  select
    v_package.id,
    trim(group_row.name),
    trim(group_row.code),
    nullif(trim(group_row.description), ''),
    coalesce(group_row.sort_order, 0),
    nullif(trim(group_row.file_name_prefix), ''),
    coalesce(group_row.sequence_start, 1)
  from jsonb_to_recordset(coalesce(p_groups, '[]'::jsonb)) as group_row(
    name text,
    code text,
    description text,
    sort_order integer,
    file_name_prefix text,
    sequence_start integer
  );

  insert into public.drop_access_tokens (
    package_id,
    purpose,
    token_hash,
    token_hint,
    status,
    expires_at,
    max_uses,
    metadata
  )
  select
    v_package.id,
    trim(token_row.purpose),
    trim(token_row.token_hash),
    trim(token_row.token_hint),
    'active',
    token_row.expires_at,
    null,
    jsonb_build_object('source', 'package_creation')
  from jsonb_to_recordset(p_tokens) as token_row(
    purpose text,
    token_hash text,
    token_hint text,
    expires_at timestamptz
  );

  insert into public.drop_events (
    package_id,
    event_type,
    severity,
    actor_name,
    actor_email,
    payload
  ) values (
    v_package.id,
    'package.created',
    'info',
    nullif(trim(p_event_payload->>'actorName'), ''),
    nullif(lower(trim(p_event_payload->>'actorEmail')), ''),
    coalesce(p_event_payload, '{}'::jsonb) || jsonb_build_object(
      'publicCode', v_package.public_code,
      'mode', v_package.mode,
      'recipientCount', jsonb_array_length(coalesce(p_recipients, '[]'::jsonb)),
      'groupCount', jsonb_array_length(coalesce(p_groups, '[]'::jsonb)),
      'uploadEnabled', false
    )
  );

  return to_jsonb(v_package);
end;
$$;

revoke all on function public.drop_create_package_atomic(jsonb, jsonb, jsonb, jsonb, jsonb) from public;
revoke all on function public.drop_create_package_atomic(jsonb, jsonb, jsonb, jsonb, jsonb) from anon;
revoke all on function public.drop_create_package_atomic(jsonb, jsonb, jsonb, jsonb, jsonb) from authenticated;
grant execute on function public.drop_create_package_atomic(jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;

comment on function public.drop_create_package_atomic(jsonb, jsonb, jsonb, jsonb, jsonb) is
  'Atomically creates DIMPRO Drop package metadata, recipients, groups, four hashed capability tokens and the audit event. Raw credentials are rejected.';
