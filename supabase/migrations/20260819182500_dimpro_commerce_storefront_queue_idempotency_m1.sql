-- DIMPRO Commerce Storefront Queue Idempotency M1 v0.1.13 — DEV migration
-- Identical queued/succeeded snapshots are no-op; failed or changed snapshots may be requeued.

create or replace function public.commerce_order_mirror_enqueue(
  p_organization_id uuid,
  p_legacy_order_id text,
  p_order_number text,
  p_legacy_status text,
  p_legacy_order_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_status text:=lower(coalesce(p_legacy_status,''));
  v_attempt public.commerce_order_mirror_attempts%rowtype;
  v_now timestamptz:=now();
  v_unresolved integer:=0;
  v_payload_hash text;
  v_noop boolean:=false;
begin
  if p_organization_id is null or not exists(
    select 1 from public.dimpro_organizations o where o.id=p_organization_id and o.status='active'
  ) then raise exception 'COMMERCE_ORGANIZATION_NOT_ACTIVE'; end if;
  if nullif(btrim(p_legacy_order_id),'') is null then raise exception 'COMMERCE_MIRROR_LEGACY_ORDER_ID_REQUIRED'; end if;
  if nullif(btrim(p_order_number),'') is null then raise exception 'COMMERCE_MIRROR_ORDER_NUMBER_REQUIRED'; end if;
  if v_status not in ('draft','sent_to_cashier','paid','issued','cancelled') then raise exception 'COMMERCE_MIRROR_LEGACY_STATUS_INVALID'; end if;
  if p_legacy_order_payload is null or jsonb_typeof(p_legacy_order_payload)<>'object' then raise exception 'COMMERCE_MIRROR_PAYLOAD_INVALID'; end if;
  if jsonb_typeof(p_legacy_order_payload->'items')<>'array' then raise exception 'COMMERCE_MIRROR_ITEMS_INVALID'; end if;

  v_unresolved:=jsonb_array_length(p_legacy_order_payload->'items');
  v_payload_hash:=md5(p_legacy_order_payload::text);
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_organization_id::text,'legacy-order-mirror-queue',btrim(p_legacy_order_id)),0));

  select * into v_attempt
  from public.commerce_order_mirror_attempts
  where organization_id=p_organization_id
    and legacy_order_id=btrim(p_legacy_order_id)
    and deleted_at is null
  for update;

  if found
     and v_attempt.state in ('PENDING','SUCCEEDED')
     and v_attempt.order_number=btrim(p_order_number)
     and v_attempt.legacy_status=v_status
     and v_attempt.legacy_order_payload=p_legacy_order_payload then
    v_noop:=true;
  elsif not found then
    insert into public.commerce_order_mirror_attempts(
      organization_id,legacy_order_id,order_number,legacy_status,commerce_order_id,state,attempt_count,
      mapped_item_count,unresolved_item_count,last_error_code,last_error_message,legacy_order_payload,
      last_attempt_at,next_retry_at,succeeded_at
    ) values(
      p_organization_id,btrim(p_legacy_order_id),btrim(p_order_number),v_status,null,'PENDING',0,
      0,v_unresolved,null,null,p_legacy_order_payload,null,v_now,null
    ) returning * into v_attempt;
  else
    update public.commerce_order_mirror_attempts set
      order_number=btrim(p_order_number),
      legacy_status=v_status,
      state='PENDING',
      mapped_item_count=0,
      unresolved_item_count=v_unresolved,
      last_error_code=null,
      last_error_message=null,
      legacy_order_payload=p_legacy_order_payload,
      last_attempt_at=null,
      next_retry_at=v_now,
      succeeded_at=null
    where id=v_attempt.id
    returning * into v_attempt;
  end if;

  if not v_noop then
    insert into public.commerce_audit_events(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(
      p_organization_id,null,'LEGACY_ORDER_MIRROR_QUEUED','ORDER_MIRROR',v_attempt.id,
      jsonb_build_object(
        'attemptId',v_attempt.id,
        'legacyOrderId',v_attempt.legacy_order_id,
        'orderNumber',v_attempt.order_number,
        'legacyStatus',v_attempt.legacy_status,
        'attemptCount',v_attempt.attempt_count,
        'unresolvedItemCount',v_attempt.unresolved_item_count,
        'source','STOREFRONT_SERVICE_QUEUE'
      )
    );

    insert into public.commerce_outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
    values(
      p_organization_id,'ORDER_MIRROR',v_attempt.id,'LEGACY_ORDER_MIRROR_QUEUED',
      jsonb_build_object(
        'attemptId',v_attempt.id,
        'legacyOrderId',v_attempt.legacy_order_id,
        'orderNumber',v_attempt.order_number,
        'legacyStatus',v_attempt.legacy_status,
        'state','PENDING',
        'attemptCount',v_attempt.attempt_count,
        'source','STOREFRONT_SERVICE_QUEUE'
      ),
      'legacy-order-mirror-queued:'||v_attempt.id::text||':'||v_status||':'||v_payload_hash||':'||v_attempt.attempt_count::text
    ) on conflict (organization_id,idempotency_key) do nothing;
  end if;

  return jsonb_build_object(
    'attemptId',v_attempt.id,
    'legacyOrderId',v_attempt.legacy_order_id,
    'orderNumber',v_attempt.order_number,
    'legacyStatus',v_attempt.legacy_status,
    'commerceOrderId',v_attempt.commerce_order_id,
    'state',v_attempt.state,
    'attemptCount',v_attempt.attempt_count,
    'nextRetryAt',v_attempt.next_retry_at,
    'queued',not v_noop,
    'duplicate',v_noop
  );
end;
$$;

revoke all on function public.commerce_order_mirror_enqueue(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.commerce_order_mirror_enqueue(uuid,text,text,text,jsonb) to service_role;

update public.commerce_schema_meta
set schema_version='0.1.13',migration_count=14,bootstrap_id='commerce-storefront-queue-idempotency-m1-20260819',updated_at=now()
where component='commerce-core';
