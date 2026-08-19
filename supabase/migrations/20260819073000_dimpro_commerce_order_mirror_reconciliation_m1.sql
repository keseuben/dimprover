create table if not exists public.commerce_order_mirror_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  legacy_order_id text not null,
  order_number text not null,
  legacy_status text not null check (legacy_status in ('draft','sent_to_cashier','paid','issued','cancelled')),
  commerce_order_id uuid null references public.commerce_orders(id) on delete set null,
  state text not null check (state in ('PENDING','SUCCEEDED','FAILED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  mapped_item_count integer not null default 0 check (mapped_item_count >= 0),
  unresolved_item_count integer not null default 0 check (unresolved_item_count >= 0),
  last_error_code text null,
  last_error_message text null,
  legacy_order_payload jsonb not null,
  last_attempt_at timestamptz null,
  next_retry_at timestamptz null,
  succeeded_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  unique (organization_id, legacy_order_id)
);

create index if not exists commerce_order_mirror_attempts_retry_idx
  on public.commerce_order_mirror_attempts (organization_id, state, next_retry_at, updated_at)
  where archived_at is null and state in ('PENDING','FAILED');

create index if not exists commerce_order_mirror_attempts_order_idx
  on public.commerce_order_mirror_attempts (organization_id, commerce_order_id)
  where archived_at is null and commerce_order_id is not null;

drop trigger if exists commerce_order_mirror_attempts_updated_at_trigger on public.commerce_order_mirror_attempts;
create trigger commerce_order_mirror_attempts_updated_at_trigger
before update on public.commerce_order_mirror_attempts
for each row execute function public.dimpro_set_updated_at();

alter table public.commerce_order_mirror_attempts enable row level security;
revoke all on table public.commerce_order_mirror_attempts from anon, authenticated, service_role;
grant select, insert, update on table public.commerce_order_mirror_attempts to service_role;

create or replace function public.commerce_order_mirror_record(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_legacy_order_id text,
  p_order_number text,
  p_legacy_status text,
  p_legacy_order_payload jsonb,
  p_state text,
  p_commerce_order_id uuid,
  p_mapped_item_count integer,
  p_unresolved_item_count integer,
  p_error_code text,
  p_error_message text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_state text:=upper(coalesce(p_state,''));
  v_status text:=lower(coalesce(p_legacy_status,''));
  v_attempt public.commerce_order_mirror_attempts%rowtype;
  v_now timestamptz:=now();
  v_increment integer:=case when upper(coalesce(p_state,''))='PENDING' then 1 else 0 end;
begin
  if p_organization_id is null then raise exception 'COMMERCE_ORGANIZATION_REQUIRED'; end if;
  if nullif(btrim(p_legacy_order_id),'') is null then raise exception 'COMMERCE_MIRROR_LEGACY_ORDER_ID_REQUIRED'; end if;
  if nullif(btrim(p_order_number),'') is null then raise exception 'COMMERCE_MIRROR_ORDER_NUMBER_REQUIRED'; end if;
  if v_status not in ('draft','sent_to_cashier','paid','issued','cancelled') then raise exception 'COMMERCE_MIRROR_LEGACY_STATUS_INVALID'; end if;
  if v_state not in ('PENDING','SUCCEEDED','FAILED') then raise exception 'COMMERCE_MIRROR_STATE_INVALID'; end if;
  if p_legacy_order_payload is null or jsonb_typeof(p_legacy_order_payload)<>'object' then raise exception 'COMMERCE_MIRROR_PAYLOAD_INVALID'; end if;
  if p_actor_user_id is not null and not exists(select 1 from public.dimpro_users where id=p_actor_user_id) then raise exception 'COMMERCE_MIRROR_ACTOR_NOT_FOUND'; end if;
  if p_commerce_order_id is not null and not exists(select 1 from public.commerce_orders where id=p_commerce_order_id and organization_id=p_organization_id) then raise exception 'COMMERCE_MIRROR_ORDER_SCOPE_MISMATCH'; end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_organization_id::text,'legacy-order-mirror',btrim(p_legacy_order_id)),0));

  select * into v_attempt
  from public.commerce_order_mirror_attempts
  where organization_id=p_organization_id and legacy_order_id=btrim(p_legacy_order_id) and archived_at is null
  for update;

  if not found then
    insert into public.commerce_order_mirror_attempts(
      organization_id,legacy_order_id,order_number,legacy_status,commerce_order_id,state,attempt_count,
      mapped_item_count,unresolved_item_count,last_error_code,last_error_message,legacy_order_payload,
      last_attempt_at,next_retry_at,succeeded_at
    ) values(
      p_organization_id,btrim(p_legacy_order_id),btrim(p_order_number),v_status,p_commerce_order_id,v_state,
      case when v_state='PENDING' then 1 else 1 end,
      greatest(coalesce(p_mapped_item_count,0),0),greatest(coalesce(p_unresolved_item_count,0),0),
      case when v_state='FAILED' then nullif(btrim(p_error_code),'') else null end,
      case when v_state='FAILED' then left(nullif(btrim(p_error_message),''),500) else null end,
      p_legacy_order_payload,
      v_now,
      case when v_state='FAILED' then v_now + interval '5 minutes' else null end,
      case when v_state='SUCCEEDED' then v_now else null end
    ) returning * into v_attempt;
  else
    update public.commerce_order_mirror_attempts set
      order_number=btrim(p_order_number),
      legacy_status=v_status,
      commerce_order_id=coalesce(p_commerce_order_id,commerce_order_id),
      state=v_state,
      attempt_count=greatest(1,attempt_count+v_increment),
      mapped_item_count=greatest(coalesce(p_mapped_item_count,0),0),
      unresolved_item_count=greatest(coalesce(p_unresolved_item_count,0),0),
      last_error_code=case when v_state='FAILED' then nullif(btrim(p_error_code),'') else null end,
      last_error_message=case when v_state='FAILED' then left(nullif(btrim(p_error_message),''),500) else null end,
      legacy_order_payload=p_legacy_order_payload,
      last_attempt_at=v_now,
      next_retry_at=case when v_state='FAILED' then v_now + interval '5 minutes' else null end,
      succeeded_at=case when v_state='SUCCEEDED' then v_now else succeeded_at end
    where id=v_attempt.id
    returning * into v_attempt;
  end if;

  if v_state in ('SUCCEEDED','FAILED') then
    insert into public.commerce_audit_events(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(
      p_organization_id,p_actor_user_id,
      case when v_state='SUCCEEDED' then 'LEGACY_ORDER_MIRROR_SUCCEEDED' else 'LEGACY_ORDER_MIRROR_FAILED' end,
      'ORDER_MIRROR',coalesce(p_commerce_order_id,v_attempt.id),
      jsonb_build_object(
        'attemptId',v_attempt.id,'legacyOrderId',v_attempt.legacy_order_id,'orderNumber',v_attempt.order_number,
        'legacyStatus',v_attempt.legacy_status,'attemptCount',v_attempt.attempt_count,
        'mappedItemCount',v_attempt.mapped_item_count,'unresolvedItemCount',v_attempt.unresolved_item_count,
        'errorCode',v_attempt.last_error_code
      )
    );
    insert into public.commerce_outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
    values(
      p_organization_id,'ORDER_MIRROR',v_attempt.id,
      case when v_state='SUCCEEDED' then 'LEGACY_ORDER_MIRROR_SUCCEEDED' else 'LEGACY_ORDER_MIRROR_FAILED' end,
      jsonb_build_object('attemptId',v_attempt.id,'legacyOrderId',v_attempt.legacy_order_id,'commerceOrderId',v_attempt.commerce_order_id,'state',v_state,'attemptCount',v_attempt.attempt_count,'errorCode',v_attempt.last_error_code),
      'legacy-order-mirror:'||v_attempt.id::text||':'||v_attempt.attempt_count::text||':'||lower(v_state)
    ) on conflict (organization_id,idempotency_key) do nothing;
  end if;

  return jsonb_build_object(
    'attemptId',v_attempt.id,
    'legacyOrderId',v_attempt.legacy_order_id,
    'commerceOrderId',v_attempt.commerce_order_id,
    'state',v_attempt.state,
    'attemptCount',v_attempt.attempt_count,
    'mappedItemCount',v_attempt.mapped_item_count,
    'unresolvedItemCount',v_attempt.unresolved_item_count,
    'lastErrorCode',v_attempt.last_error_code,
    'nextRetryAt',v_attempt.next_retry_at,
    'succeededAt',v_attempt.succeeded_at
  );
end;
$$;

revoke all on function public.commerce_order_mirror_record(uuid,uuid,text,text,text,jsonb,text,uuid,integer,integer,text,text) from public,anon,authenticated;
grant execute on function public.commerce_order_mirror_record(uuid,uuid,text,text,text,jsonb,text,uuid,integer,integer,text,text) to service_role;

update public.commerce_schema_meta
set schema_version='0.1.8',migration_count=9,bootstrap_id='commerce-order-mirror-reconciliation-m1-20260819',updated_at=now()
where component='commerce-core';
