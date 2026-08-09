-- DIMPRO Drop admin lifecycle transaction helpers
-- DROP 0.2.0 – prepared now, applied only during the final Supabase activation.

create or replace function public.drop_transition_package_status(
  p_package_id uuid,
  p_expected_status text,
  p_target_status text,
  p_closed_at timestamptz default null,
  p_expired_at timestamptz default null,
  p_deleted_at timestamptz default null,
  p_event_payload jsonb default '{}'::jsonb
)
returns table (
  package_row jsonb,
  revoked_token_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_package public.drop_packages%rowtype;
  v_allowed boolean := false;
  v_revoked integer := 0;
  v_now timestamptz := now();
begin
  select *
    into v_package
    from public.drop_packages
   where id = p_package_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'DROP_PACKAGE_NOT_FOUND';
  end if;

  if v_package.status <> p_expected_status then
    raise exception using
      errcode = '40001',
      message = 'DROP_PACKAGE_STATUS_CONFLICT';
  end if;

  if p_expected_status = p_target_status then
    return query
    select to_jsonb(v_package), 0;
    return;
  end if;

  v_allowed := case p_expected_status
    when 'draft' then p_target_status in ('preparing', 'active', 'deleting', 'deleted')
    when 'preparing' then p_target_status in ('active', 'failed', 'deleting')
    when 'active' then p_target_status in ('upload_closed', 'expiring', 'reporting', 'deleting', 'failed')
    when 'upload_closed' then p_target_status in ('expiring', 'reporting', 'deleting', 'failed')
    when 'expiring' then p_target_status in ('reporting', 'deleting', 'expired', 'failed')
    when 'reporting' then p_target_status in ('deleting', 'expired', 'failed')
    when 'deleting' then p_target_status in ('deleted', 'failed')
    when 'expired' then p_target_status in ('deleting', 'deleted')
    when 'failed' then p_target_status in ('preparing', 'deleting', 'deleted')
    else false
  end;

  if not v_allowed then
    raise exception using
      errcode = 'P0001',
      message = 'DROP_INVALID_STATUS_TRANSITION';
  end if;

  update public.drop_packages
     set status = p_target_status,
         updated_at = v_now,
         closed_at = case
           when p_target_status = 'upload_closed' then coalesce(p_closed_at, v_now)
           else closed_at
         end,
         expired_at = case
           when p_target_status = 'expired' then coalesce(p_expired_at, v_now)
           else expired_at
         end,
         deleted_at = case
           when p_target_status = 'deleted' then coalesce(p_deleted_at, v_now)
           else deleted_at
         end
   where id = p_package_id
     and status = p_expected_status
  returning * into v_package;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'DROP_PACKAGE_STATUS_CONFLICT';
  end if;

  if p_target_status = 'upload_closed' then
    update public.drop_access_tokens
       set status = 'revoked',
           revoked_at = v_now,
           updated_at = v_now
     where package_id = p_package_id
       and purpose = 'upload'
       and status = 'active';
    get diagnostics v_revoked = row_count;
  elsif p_target_status = 'reporting' then
    update public.drop_access_tokens
       set status = 'revoked',
           revoked_at = v_now,
           updated_at = v_now
     where package_id = p_package_id
       and purpose in ('upload', 'view', 'download')
       and status = 'active';
    get diagnostics v_revoked = row_count;
  elsif p_target_status in ('expiring', 'deleting', 'expired', 'deleted', 'failed') then
    update public.drop_access_tokens
       set status = 'revoked',
           revoked_at = v_now,
           updated_at = v_now
     where package_id = p_package_id
       and status = 'active';
    get diagnostics v_revoked = row_count;
  end if;

  insert into public.drop_events (
    package_id,
    event_type,
    severity,
    payload
  ) values (
    p_package_id,
    'package.status_changed',
    case when p_target_status = 'failed' then 'error' else 'info' end,
    coalesce(p_event_payload, '{}'::jsonb) || jsonb_build_object(
      'from', p_expected_status,
      'to', p_target_status,
      'revokedTokenCount', v_revoked
    )
  );

  return query
  select to_jsonb(v_package), v_revoked;
end;
$$;

revoke all on function public.drop_transition_package_status(
  uuid, text, text, timestamptz, timestamptz, timestamptz, jsonb
) from public;
revoke all on function public.drop_transition_package_status(
  uuid, text, text, timestamptz, timestamptz, timestamptz, jsonb
) from anon;
revoke all on function public.drop_transition_package_status(
  uuid, text, text, timestamptz, timestamptz, timestamptz, jsonb
) from authenticated;
grant execute on function public.drop_transition_package_status(
  uuid, text, text, timestamptz, timestamptz, timestamptz, jsonb
) to service_role;

comment on function public.drop_transition_package_status(
  uuid, text, text, timestamptz, timestamptz, timestamptz, jsonb
) is 'Atomically changes a DIMPRO Drop package status, revokes affected capability tokens and writes the audit event.';
