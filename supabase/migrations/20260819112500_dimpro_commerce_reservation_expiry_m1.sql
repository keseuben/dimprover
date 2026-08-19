-- DIMPRO Commerce Inventory Reservation Expiry M1 v0.1.10 — DEV migration
-- Service-only, tenant-scoped cleanup for expired ACTIVE/PARTIAL reservations.

alter table public.commerce_inventory_reservation_events
  drop constraint if exists commerce_inventory_reservation_events_action_check;
alter table public.commerce_inventory_reservation_events
  add constraint commerce_inventory_reservation_events_action_check
  check (action in ('RESERVE','RELEASE','CONSUME','EXPIRE'));

create index if not exists commerce_inventory_reservations_due_expiry_idx
  on public.commerce_inventory_reservations (organization_id, expires_at, id)
  where archived_at is null and expires_at is not null and status in ('ACTIVE','PARTIAL');

create or replace function public.commerce_inventory_expire_due_reservations(
  p_organization_id uuid,
  p_limit integer default 100,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,100),100));
  v_now timestamptz := coalesce(p_now,now());
  v_res public.commerce_inventory_reservations%rowtype;
  v_movement jsonb;
  v_movement_id uuid;
  v_remaining numeric(19,6);
  v_processed integer := 0;
  v_order_items integer := 0;
  v_released numeric(19,6) := 0;
  v_ids jsonb := '[]'::jsonb;
begin
  if p_organization_id is null or not exists (
    select 1 from public.dimpro_organizations o where o.id=p_organization_id and o.status='active'
  ) then raise exception 'COMMERCE_ORGANIZATION_NOT_ACTIVE'; end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_organization_id::text,'reservation-expiry-cleanup'),0));

  for v_res in
    select * from public.commerce_inventory_reservations
    where organization_id=p_organization_id
      and archived_at is null
      and status in ('ACTIVE','PARTIAL')
      and expires_at is not null
      and expires_at <= v_now
      and remaining_quantity > 0
    order by expires_at,id
    limit v_limit
    for update skip locked
  loop
    v_remaining := v_res.remaining_quantity;
    v_movement := public.commerce_inventory_apply_movement(
      p_organization_id,v_res.source_id,v_res.variant_id,v_res.stock_status,'RESERVATION_RELEASE',
      0,-v_remaining,0,
      'reservation:expire-movement:'||v_res.id::text,
      'RESERVATION',v_res.id,v_now
    );
    v_movement_id := (v_movement->>'movementId')::uuid;

    update public.commerce_inventory_reservations
      set released_quantity=released_quantity+v_remaining,status='EXPIRED',updated_at=now()
    where id=v_res.id and organization_id=p_organization_id;

    insert into public.commerce_inventory_reservation_events(
      organization_id,reservation_id,action,quantity,idempotency_key,stock_movement_id
    ) values (
      p_organization_id,v_res.id,'EXPIRE',v_remaining,'reservation:expire-event:'||v_res.id::text,v_movement_id
    ) on conflict (organization_id,idempotency_key) do nothing;

    update public.commerce_order_items
      set inventory_status='RELEASED',updated_at=now()
    where organization_id=p_organization_id and reservation_id=v_res.id and inventory_status='RESERVED';
    get diagnostics v_order_items = row_count;

    insert into public.commerce_audit_events(organization_id,action,entity_type,entity_id,metadata)
    values (
      p_organization_id,'INVENTORY_RESERVATION_EXPIRED','INVENTORY_RESERVATION',v_res.id,
      jsonb_build_object('quantity',v_remaining,'expiresAt',v_res.expires_at,'cleanupAt',v_now,'releasedOrderItems',v_order_items)
    );
    insert into public.commerce_outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
    values (
      p_organization_id,'INVENTORY_RESERVATION',v_res.id,'INVENTORY_RESERVATION_EXPIRED',
      jsonb_build_object('reservationId',v_res.id,'quantity',v_remaining,'expiresAt',v_res.expires_at,'cleanupAt',v_now,'releasedOrderItems',v_order_items),
      'reservation-expired:'||v_res.id::text
    ) on conflict (organization_id,idempotency_key) do nothing;

    v_processed := v_processed + 1;
    v_released := v_released + v_remaining;
    v_ids := v_ids || jsonb_build_array(v_res.id);
  end loop;

  return jsonb_build_object(
    'processedCount',v_processed,
    'releasedQuantity',v_released,
    'reservationIds',v_ids,
    'cleanupAt',v_now
  );
end;
$$;

revoke all on function public.commerce_inventory_expire_due_reservations(uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.commerce_inventory_expire_due_reservations(uuid,integer,timestamptz) to service_role;

update public.commerce_schema_meta
set schema_version='0.1.10',migration_count=11,bootstrap_id='commerce-reservation-expiry-m1-20260819',updated_at=now()
where component='commerce-core';
