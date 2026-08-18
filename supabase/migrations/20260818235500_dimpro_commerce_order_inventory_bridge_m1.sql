-- DIMPRO Commerce Order Inventory Reservation Bridge M1 v0.1.7 — DEV migration
-- M1 rule: PAID keeps reservation; ISSUED consumes physical inventory; CANCELLED releases reservation.

alter table public.commerce_orders
  add column if not exists fulfillment_source_id uuid null references public.commerce_inventory_sources(id) on delete restrict;
create index if not exists commerce_orders_fulfillment_source_idx
  on public.commerce_orders (organization_id, fulfillment_source_id)
  where archived_at is null and fulfillment_source_id is not null;

create table if not exists public.commerce_order_inventory_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  order_id uuid not null references public.commerce_orders(id) on delete cascade,
  action text not null check (action in ('RESERVE')),
  idempotency_key text not null,
  source_id uuid null references public.commerce_inventory_sources(id) on delete restrict,
  expires_at timestamptz null,
  mapped_item_count integer not null default 0 check (mapped_item_count >= 0),
  reserved_item_count integer not null default 0 check (reserved_item_count >= 0),
  unresolved_item_count integer not null default 0 check (unresolved_item_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (organization_id,idempotency_key)
);
create index if not exists commerce_order_inventory_events_order_idx
  on public.commerce_order_inventory_events (organization_id,order_id,occurred_at,id);
alter table public.commerce_order_inventory_events enable row level security;
revoke all on table public.commerce_order_inventory_events from anon,authenticated,service_role;
grant select on table public.commerce_order_inventory_events to service_role;

create or replace function public.commerce_order_reserve_inventory(
  p_organization_id uuid,
  p_order_id uuid,
  p_source_id uuid,
  p_expires_at timestamptz,
  p_actor_user_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.commerce_orders%rowtype;
  v_source public.commerce_inventory_sources%rowtype;
  v_event public.commerce_order_inventory_events%rowtype;
  v_item public.commerce_order_items%rowtype;
  v_reservation jsonb;
  v_reservation_id uuid;
  v_mapped integer:=0;
  v_reserved integer:=0;
  v_unresolved integer:=0;
begin
  if p_organization_id is null then raise exception 'COMMERCE_ORGANIZATION_REQUIRED'; end if;
  if p_order_id is null or p_source_id is null then raise exception 'COMMERCE_ORDER_RESERVATION_TARGET_REQUIRED'; end if;
  if nullif(btrim(p_idempotency_key),'') is null then raise exception 'COMMERCE_ORDER_RESERVATION_IDEMPOTENCY_REQUIRED'; end if;
  if p_expires_at is not null and p_expires_at<=now() then raise exception 'COMMERCE_ORDER_RESERVATION_EXPIRY_INVALID'; end if;
  if p_actor_user_id is not null and not exists(select 1 from public.dimpro_users u where u.id=p_actor_user_id) then raise exception 'COMMERCE_ORDER_ACTOR_NOT_FOUND'; end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_organization_id::text,'order-reserve',p_order_id::text),0));
  select * into v_event from public.commerce_order_inventory_events
  where organization_id=p_organization_id and idempotency_key=btrim(p_idempotency_key);
  if found then
    if v_event.order_id<>p_order_id or v_event.source_id is distinct from p_source_id or v_event.expires_at is distinct from p_expires_at then raise exception 'COMMERCE_ORDER_RESERVATION_IDEMPOTENCY_PAYLOAD_MISMATCH'; end if;
    return jsonb_build_object('duplicate',true,'orderId',v_event.order_id,'sourceId',v_event.source_id,'mappedItemCount',v_event.mapped_item_count,'reservedItemCount',v_event.reserved_item_count,'unresolvedItemCount',v_event.unresolved_item_count);
  end if;

  select * into v_order from public.commerce_orders
  where organization_id=p_organization_id and id=p_order_id and archived_at is null for update;
  if not found then raise exception 'COMMERCE_ORDER_NOT_FOUND'; end if;
  if v_order.status not in ('SENT_TO_CASHIER','PAID') then raise exception 'COMMERCE_ORDER_RESERVATION_STATUS_INVALID'; end if;
  if v_order.fulfillment_source_id is not null and v_order.fulfillment_source_id<>p_source_id then raise exception 'COMMERCE_ORDER_FULFILLMENT_SOURCE_MISMATCH'; end if;

  select * into v_source from public.commerce_inventory_sources
  where organization_id=p_organization_id and id=p_source_id and source_type='INTERNAL' and active and archived_at is null;
  if not found then raise exception 'COMMERCE_INTERNAL_SOURCE_NOT_FOUND'; end if;

  for v_item in
    select * from public.commerce_order_items i
    where i.organization_id=p_organization_id and i.order_id=p_order_id and i.archived_at is null
    order by i.created_at,i.id for update
  loop
    if v_item.variant_id is null then
      v_unresolved:=v_unresolved+1;
      continue;
    end if;
    v_mapped:=v_mapped+1;
    if v_item.reservation_id is not null and v_item.inventory_status='RESERVED' then
      v_reserved:=v_reserved+1;
      continue;
    end if;
    v_reservation:=public.commerce_inventory_reservation_create(
      p_organization_id,p_source_id,v_item.variant_id,v_item.quantity,
      'order-reserve:'||p_order_id::text||':item:'||v_item.id::text,
      'SELLABLE','ORDER_ITEM',v_item.id,p_expires_at
    );
    v_reservation_id:=(v_reservation->>'reservationId')::uuid;
    update public.commerce_order_items set reservation_id=v_reservation_id,inventory_status='RESERVED'
    where organization_id=p_organization_id and id=v_item.id;
    v_reserved:=v_reserved+1;
  end loop;

  update public.commerce_orders set fulfillment_source_id=p_source_id
  where organization_id=p_organization_id and id=p_order_id;
  insert into public.commerce_order_inventory_events(organization_id,order_id,action,idempotency_key,source_id,expires_at,mapped_item_count,reserved_item_count,unresolved_item_count,metadata)
  values(p_organization_id,p_order_id,'RESERVE',btrim(p_idempotency_key),p_source_id,p_expires_at,v_mapped,v_reserved,v_unresolved,jsonb_build_object('expiresAt',p_expires_at));
  insert into public.commerce_audit_events(organization_id,action,entity_type,entity_id,metadata)
  values(p_organization_id,'ORDER_INVENTORY_RESERVED','ORDER',p_order_id,jsonb_build_object('sourceId',p_source_id,'mappedItemCount',v_mapped,'reservedItemCount',v_reserved,'unresolvedItemCount',v_unresolved));
  insert into public.commerce_outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values(p_organization_id,'ORDER',p_order_id,'ORDER_INVENTORY_RESERVED',jsonb_build_object('orderId',p_order_id,'sourceId',p_source_id,'reservedItemCount',v_reserved,'unresolvedItemCount',v_unresolved),'order-inventory-reserved:'||p_order_id::text);
  return jsonb_build_object('duplicate',false,'orderId',p_order_id,'sourceId',p_source_id,'mappedItemCount',v_mapped,'reservedItemCount',v_reserved,'unresolvedItemCount',v_unresolved);
end;
$$;

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
  v_item public.commerce_order_items%rowtype;
  v_res public.commerce_inventory_reservations%rowtype;
  v_inventory_action jsonb;
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

  if v_target='ISSUED' then
    if exists(
      select 1 from public.commerce_order_items i
      where i.organization_id=p_organization_id and i.order_id=p_order_id and i.archived_at is null
        and i.variant_id is not null and (i.reservation_id is null or i.inventory_status<>'RESERVED')
    ) then raise exception 'COMMERCE_ORDER_RESERVATION_REQUIRED'; end if;
    for v_item in
      select * from public.commerce_order_items i
      where i.organization_id=p_organization_id and i.order_id=p_order_id and i.archived_at is null and i.reservation_id is not null
      order by i.created_at,i.id for update
    loop
      select * into v_res from public.commerce_inventory_reservations r
      where r.organization_id=p_organization_id and r.id=v_item.reservation_id and r.archived_at is null for update;
      if not found or v_res.status not in ('ACTIVE','PARTIAL') or v_res.remaining_quantity<>v_item.quantity then
        raise exception 'COMMERCE_ORDER_RESERVATION_INCOMPLETE';
      end if;
      v_inventory_action:=public.commerce_inventory_reservation_apply(
        p_organization_id,v_item.reservation_id,'CONSUME',v_item.quantity,
        'order-issue:'||p_order_id::text||':item:'||v_item.id::text
      );
      update public.commerce_order_items set inventory_status='CONSUMED'
      where organization_id=p_organization_id and id=v_item.id;
    end loop;
  elsif v_target='CANCELLED' then
    for v_item in
      select * from public.commerce_order_items i
      where i.organization_id=p_organization_id and i.order_id=p_order_id and i.archived_at is null and i.reservation_id is not null
      order by i.created_at,i.id for update
    loop
      select * into v_res from public.commerce_inventory_reservations r
      where r.organization_id=p_organization_id and r.id=v_item.reservation_id and r.archived_at is null for update;
      if found and v_res.status in ('ACTIVE','PARTIAL') and v_res.remaining_quantity>0 then
        v_inventory_action:=public.commerce_inventory_reservation_apply(
          p_organization_id,v_item.reservation_id,'RELEASE',v_res.remaining_quantity,
          'order-cancel:'||p_order_id::text||':item:'||v_item.id::text
        );
      end if;
      update public.commerce_order_items set inventory_status='RELEASED'
      where organization_id=p_organization_id and id=v_item.id and inventory_status='RESERVED';
    end loop;
  end if;

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


revoke all on function public.commerce_order_reserve_inventory(uuid,uuid,uuid,timestamptz,uuid,text) from public,anon,authenticated;
grant execute on function public.commerce_order_reserve_inventory(uuid,uuid,uuid,timestamptz,uuid,text) to service_role;
revoke all on function public.commerce_order_set_status(uuid,uuid,text,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.commerce_order_set_status(uuid,uuid,text,text,text,text,uuid,text) to service_role;

update public.commerce_schema_meta
set schema_version='0.1.7',migration_count=8,bootstrap_id='commerce-order-inventory-bridge-m1-20260818',updated_at=now()
where component='commerce-core';
