drop function if exists public.commerce_order_reserve_inventory(uuid,uuid,uuid,timestamptz,uuid,text);
drop table if exists public.commerce_order_inventory_events cascade;
create or replace function public.commerce_order_set_status(
  p_organization_id uuid,
  p_order_id uuid,
  p_status text,
  p_payment_method text,
  p_cashier_name text,
  p_issuer_name text,
  p_actor_user_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.commerce_orders%rowtype;
  v_target text:=upper(coalesce(p_status,''));
  v_payment text:=upper(nullif(btrim(p_payment_method),''));
  v_existing_event public.commerce_order_status_events%rowtype;
  v_allowed boolean:=false;
  v_now timestamptz:=now();
begin
  if p_organization_id is null then raise exception 'COMMERCE_ORGANIZATION_REQUIRED'; end if;
  if p_order_id is null then raise exception 'COMMERCE_ORDER_ID_REQUIRED'; end if;
  if v_target not in ('SENT_TO_CASHIER','PAID','ISSUED','CANCELLED') then raise exception 'COMMERCE_ORDER_STATUS_INVALID'; end if;
  if v_payment is not null and v_payment not in ('CASH','CARD','TRANSFER','LATER') then raise exception 'COMMERCE_ORDER_PAYMENT_METHOD_INVALID'; end if;
  if nullif(btrim(p_idempotency_key),'') is null then raise exception 'COMMERCE_ORDER_STATUS_IDEMPOTENCY_REQUIRED'; end if;
  if p_actor_user_id is not null and not exists(select 1 from public.dimpro_users u where u.id=p_actor_user_id) then raise exception 'COMMERCE_ORDER_ACTOR_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_organization_id::text,'order-status',p_order_id::text),0));
  select * into v_existing_event from public.commerce_order_status_events where organization_id=p_organization_id and idempotency_key=btrim(p_idempotency_key);
  if found then return jsonb_build_object('duplicate',true,'orderId',v_existing_event.order_id,'status',v_existing_event.to_status); end if;
  select * into v_order from public.commerce_orders where id=p_order_id and organization_id=p_organization_id and archived_at is null for update;
  if not found then raise exception 'COMMERCE_ORDER_NOT_FOUND'; end if;
  if v_order.status=v_target then return jsonb_build_object('duplicate',true,'orderId',v_order.id,'status',v_order.status); end if;
  v_allowed := (v_order.status='DRAFT' and v_target in ('SENT_TO_CASHIER','CANCELLED'))
    or (v_order.status='SENT_TO_CASHIER' and v_target in ('PAID','CANCELLED'))
    or (v_order.status='PAID' and v_target='ISSUED');
  if not v_allowed then raise exception 'COMMERCE_ORDER_STATUS_TRANSITION_INVALID'; end if;
  update public.commerce_orders set
    status=v_target,
    sent_to_cashier_at=case when v_target='SENT_TO_CASHIER' then coalesce(sent_to_cashier_at,v_now) else sent_to_cashier_at end,
    paid_at=case when v_target='PAID' then v_now else paid_at end,
    issued_at=case when v_target='ISSUED' then v_now else issued_at end,
    cashier_name=case when v_target='PAID' then coalesce(nullif(btrim(p_cashier_name),''),cashier_name) else cashier_name end,
    issuer_name=case when v_target='ISSUED' then coalesce(nullif(btrim(p_issuer_name),''),issuer_name) else issuer_name end,
    payment_method=case when v_target='PAID' then coalesce(v_payment,payment_method) else payment_method end
  where id=p_order_id and organization_id=p_organization_id;
  insert into public.commerce_order_status_events(organization_id,order_id,from_status,to_status,idempotency_key,actor_user_id,metadata)
  values(p_organization_id,p_order_id,v_order.status,v_target,btrim(p_idempotency_key),p_actor_user_id,jsonb_build_object('paymentMethod',v_payment,'cashierName',nullif(btrim(p_cashier_name),''),'issuerName',nullif(btrim(p_issuer_name),'')));
  insert into public.commerce_audit_events(organization_id,action,entity_type,entity_id,metadata)
  values(p_organization_id,'ORDER_STATUS_CHANGED','ORDER',p_order_id,jsonb_build_object('fromStatus',v_order.status,'toStatus',v_target));
  insert into public.commerce_outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values(p_organization_id,'ORDER',p_order_id,'ORDER_STATUS_CHANGED',jsonb_build_object('orderId',p_order_id,'fromStatus',v_order.status,'toStatus',v_target),'order-status:'||btrim(p_idempotency_key));
  return jsonb_build_object('duplicate',false,'orderId',p_order_id,'fromStatus',v_order.status,'status',v_target,'changedAt',v_now);
end;
$$;

revoke all on function public.commerce_order_set_status(uuid,uuid,text,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.commerce_order_set_status(uuid,uuid,text,text,text,text,uuid,text) to service_role;
drop index if exists public.commerce_orders_fulfillment_source_idx;
alter table public.commerce_orders drop column if exists fulfillment_source_id;
update public.commerce_schema_meta
set schema_version='0.1.6',migration_count=7,bootstrap_id='commerce-order-core-m1-20260818',updated_at=now()
where component='commerce-core';
