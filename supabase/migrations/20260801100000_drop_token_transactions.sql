-- DIMPRO Drop token transaction helpers
-- DROP 0.2.0 – prepared now, applied only during the final Supabase activation.

create or replace function public.drop_mark_access_token_used(
  p_token_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token public.drop_access_tokens%rowtype;
  v_now timestamptz := now();
begin
  select *
    into v_token
    from public.drop_access_tokens
   where id = p_token_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'DROP_TOKEN_NOT_FOUND';
  end if;

  if v_token.status <> 'active'
     or v_token.expires_at <= v_now
     or (v_token.max_uses is not null and v_token.use_count >= v_token.max_uses) then
    raise exception using
      errcode = 'P0001',
      message = 'DROP_TOKEN_UNAVAILABLE';
  end if;

  update public.drop_access_tokens
     set use_count = use_count + 1,
         last_used_at = v_now,
         updated_at = v_now
   where id = p_token_id
  returning * into v_token;

  return to_jsonb(v_token);
end;
$$;

create or replace function public.drop_reissue_access_token(
  p_package_id uuid,
  p_purpose text,
  p_token_hash text,
  p_token_hint text,
  p_expires_at timestamptz,
  p_event_payload jsonb default '{}'::jsonb
)
returns table (
  token_row jsonb,
  revoked_token_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_package public.drop_packages%rowtype;
  v_token public.drop_access_tokens%rowtype;
  v_revoked integer := 0;
  v_now timestamptz := now();
begin
  if p_purpose not in ('upload', 'view', 'download', 'report') then
    raise exception using errcode = '22023', message = 'DROP_INVALID_TOKEN_PURPOSE';
  end if;
  if p_token_hash is null or char_length(p_token_hash) <> 64 then
    raise exception using errcode = '22023', message = 'DROP_INVALID_TOKEN_HASH';
  end if;
  if p_token_hint is null or char_length(trim(p_token_hint)) < 4 then
    raise exception using errcode = '22023', message = 'DROP_INVALID_TOKEN_HINT';
  end if;

  select *
    into v_package
    from public.drop_packages
   where id = p_package_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'DROP_PACKAGE_NOT_FOUND';
  end if;

  if v_package.expires_at <= v_now
     or p_expires_at <= v_now
     or p_expires_at > v_package.expires_at then
    raise exception using errcode = '22023', message = 'DROP_INVALID_TOKEN_EXPIRY';
  end if;

  if not (
    v_package.status = 'active'
    or (v_package.status = 'upload_closed' and p_purpose <> 'upload')
    or (v_package.status = 'reporting' and p_purpose = 'report')
  ) then
    raise exception using errcode = 'P0001', message = 'DROP_TOKEN_REISSUE_NOT_ALLOWED';
  end if;

  update public.drop_access_tokens
     set status = 'revoked',
         revoked_at = v_now,
         updated_at = v_now
   where package_id = p_package_id
     and purpose = p_purpose
     and status = 'active';
  get diagnostics v_revoked = row_count;

  insert into public.drop_access_tokens (
    package_id,
    purpose,
    token_hash,
    token_hint,
    status,
    expires_at,
    max_uses,
    metadata
  ) values (
    p_package_id,
    p_purpose,
    p_token_hash,
    trim(p_token_hint),
    'active',
    p_expires_at,
    null,
    jsonb_build_object('source', 'admin_reissue')
  )
  returning * into v_token;

  insert into public.drop_events (
    package_id,
    event_type,
    severity,
    payload
  ) values (
    p_package_id,
    'access.token_reissued',
    'info',
    coalesce(p_event_payload, '{}'::jsonb) || jsonb_build_object(
      'purpose', p_purpose,
      'tokenHint', v_token.token_hint,
      'revokedTokenCount', v_revoked
    )
  );

  return query
  select to_jsonb(v_token), v_revoked;
end;
$$;

create or replace function public.drop_revoke_access_token(
  p_package_id uuid,
  p_token_id uuid,
  p_event_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token public.drop_access_tokens%rowtype;
  v_now timestamptz := now();
begin
  select *
    into v_token
    from public.drop_access_tokens
   where id = p_token_id
     and package_id = p_package_id
   for update;

  if not found or v_token.status <> 'active' then
    raise exception using errcode = 'P0002', message = 'DROP_TOKEN_NOT_ACTIVE';
  end if;

  update public.drop_access_tokens
     set status = 'revoked',
         revoked_at = v_now,
         updated_at = v_now
   where id = p_token_id
  returning * into v_token;

  insert into public.drop_events (
    package_id,
    event_type,
    severity,
    payload
  ) values (
    p_package_id,
    'access.token_revoked',
    'info',
    coalesce(p_event_payload, '{}'::jsonb) || jsonb_build_object(
      'tokenId', v_token.id,
      'purpose', v_token.purpose,
      'tokenHint', v_token.token_hint
    )
  );

  return to_jsonb(v_token);
end;
$$;

revoke all on function public.drop_mark_access_token_used(uuid) from public;
revoke all on function public.drop_mark_access_token_used(uuid) from anon;
revoke all on function public.drop_mark_access_token_used(uuid) from authenticated;
grant execute on function public.drop_mark_access_token_used(uuid) to service_role;

revoke all on function public.drop_reissue_access_token(uuid, text, text, text, timestamptz, jsonb) from public;
revoke all on function public.drop_reissue_access_token(uuid, text, text, text, timestamptz, jsonb) from anon;
revoke all on function public.drop_reissue_access_token(uuid, text, text, text, timestamptz, jsonb) from authenticated;
grant execute on function public.drop_reissue_access_token(uuid, text, text, text, timestamptz, jsonb) to service_role;

revoke all on function public.drop_revoke_access_token(uuid, uuid, jsonb) from public;
revoke all on function public.drop_revoke_access_token(uuid, uuid, jsonb) from anon;
revoke all on function public.drop_revoke_access_token(uuid, uuid, jsonb) from authenticated;
grant execute on function public.drop_revoke_access_token(uuid, uuid, jsonb) to service_role;

comment on function public.drop_mark_access_token_used(uuid) is
  'Atomically checks availability and increments a DIMPRO Drop capability-token use counter.';
comment on function public.drop_reissue_access_token(uuid, text, text, text, timestamptz, jsonb) is
  'Atomically revokes the previous purpose token, inserts the replacement hash and writes an audit event.';
comment on function public.drop_revoke_access_token(uuid, uuid, jsonb) is
  'Atomically revokes one active DIMPRO Drop capability token and writes an audit event.';
