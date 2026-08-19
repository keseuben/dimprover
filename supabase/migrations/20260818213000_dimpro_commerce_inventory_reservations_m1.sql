-- DIMPRO Commerce Inventory Reservation M1 v0.1.3 — DEV migration
-- Explicit reservation entity + idempotent reserve/release/consume workflow.

create table if not exists public.commerce_inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  source_id uuid not null references public.commerce_inventory_sources(id) on delete restrict,
  warehouse_id uuid null references public.commerce_warehouses(id) on delete restrict,
  variant_id uuid not null references public.commerce_product_variants(id) on delete restrict,
  stock_status text not null default 'SELLABLE' check (stock_status in ('SELLABLE','OUTLET')),
  requested_quantity numeric(20,6) not null check (requested_quantity > 0),
  released_quantity numeric(20,6) not null default 0 check (released_quantity >= 0),
  consumed_quantity numeric(20,6) not null default 0 check (consumed_quantity >= 0),
  remaining_quantity numeric(20,6) generated always as (requested_quantity - released_quantity - consumed_quantity) stored,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','PARTIAL','RELEASED','CONSUMED','EXPIRED')),
  reference_type text null,
  reference_id uuid null,
  idempotency_key text not null,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  unique (organization_id, idempotency_key),
  check (released_quantity + consumed_quantity <= requested_quantity)
);

create table if not exists public.commerce_inventory_reservation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  reservation_id uuid not null references public.commerce_inventory_reservations(id) on delete cascade,
  action text not null check (action in ('RESERVE','RELEASE','CONSUME')),
  quantity numeric(20,6) not null check (quantity > 0),
  idempotency_key text not null,
  stock_movement_id uuid null references public.commerce_stock_movements(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create index if not exists commerce_inventory_reservations_lookup_idx
  on public.commerce_inventory_reservations (organization_id, variant_id, source_id, status, created_at desc)
  where archived_at is null;
create index if not exists commerce_inventory_reservation_events_lookup_idx
  on public.commerce_inventory_reservation_events (organization_id, reservation_id, created_at, id);

drop trigger if exists commerce_inventory_reservations_updated_at_trigger on public.commerce_inventory_reservations;
create trigger commerce_inventory_reservations_updated_at_trigger
before update on public.commerce_inventory_reservations
for each row execute function public.dimpro_set_updated_at();

alter table public.commerce_inventory_reservations enable row level security;
alter table public.commerce_inventory_reservation_events enable row level security;
revoke all on table public.commerce_inventory_reservations, public.commerce_inventory_reservation_events from anon, authenticated, service_role;
grant select on table public.commerce_inventory_reservations, public.commerce_inventory_reservation_events to service_role;

create or replace function public.commerce_inventory_reservation_create(
  p_organization_id uuid,
  p_source_id uuid,
  p_variant_id uuid,
  p_quantity numeric,
  p_idempotency_key text,
  p_stock_status text default 'SELLABLE',
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_expires_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.commerce_inventory_reservations%rowtype;
  v_source public.commerce_inventory_sources%rowtype;
  v_reservation_id uuid := gen_random_uuid();
  v_movement jsonb;
  v_movement_id uuid;
  v_status text := upper(coalesce(nullif(btrim(p_stock_status),''),'SELLABLE'));
begin
  if nullif(btrim(p_idempotency_key),'') is null then raise exception 'COMMERCE_RESERVATION_IDEMPOTENCY_REQUIRED'; end if;
  if coalesce(p_quantity,0) <= 0 then raise exception 'COMMERCE_RESERVATION_QUANTITY_INVALID'; end if;
  if v_status not in ('SELLABLE','OUTLET') then raise exception 'COMMERCE_RESERVATION_STOCK_STATUS_INVALID'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'COMMERCE_RESERVATION_EXPIRY_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_organization_id::text,'reservation-create',btrim(p_idempotency_key)),0));

  select * into v_existing from public.commerce_inventory_reservations
  where organization_id=p_organization_id and idempotency_key=btrim(p_idempotency_key);
  if found then
    if v_existing.source_id<>p_source_id or v_existing.variant_id<>p_variant_id or v_existing.stock_status<>v_status
       or v_existing.requested_quantity<>p_quantity or coalesce(v_existing.reference_type,'')<>coalesce(nullif(btrim(p_reference_type),''),'')
       or v_existing.reference_id is distinct from p_reference_id or v_existing.expires_at is distinct from p_expires_at then
      raise exception 'COMMERCE_RESERVATION_IDEMPOTENCY_PAYLOAD_MISMATCH';
    end if;
    return jsonb_build_object('duplicate',true,'reservationId',v_existing.id,'status',v_existing.status,
      'requestedQuantity',v_existing.requested_quantity,'remainingQuantity',v_existing.remaining_quantity);
  end if;

  select * into v_source from public.commerce_inventory_sources
  where id=p_source_id and organization_id=p_organization_id and source_type='INTERNAL' and active and archived_at is null;
  if not found then raise exception 'COMMERCE_INTERNAL_SOURCE_NOT_FOUND'; end if;
  if not exists (select 1 from public.commerce_product_variants v where v.id=p_variant_id and v.organization_id=p_organization_id and v.archived_at is null and v.status<>'ARCHIVED') then
    raise exception 'COMMERCE_VARIANT_SCOPE_MISMATCH';
  end if;

  v_movement := public.commerce_inventory_apply_movement(
    p_organization_id,p_source_id,p_variant_id,v_status,'RESERVATION_COMMIT',0,p_quantity,0,
    'reservation:create:'||btrim(p_idempotency_key),'RESERVATION',v_reservation_id,now()
  );
  v_movement_id := (v_movement->>'movementId')::uuid;

  insert into public.commerce_inventory_reservations(
    id,organization_id,source_id,warehouse_id,variant_id,stock_status,requested_quantity,status,
    reference_type,reference_id,idempotency_key,expires_at
  ) values (
    v_reservation_id,p_organization_id,p_source_id,v_source.warehouse_id,p_variant_id,v_status,p_quantity,'ACTIVE',
    nullif(btrim(p_reference_type),''),p_reference_id,btrim(p_idempotency_key),p_expires_at
  );
  insert into public.commerce_inventory_reservation_events(organization_id,reservation_id,action,quantity,idempotency_key,stock_movement_id)
  values (p_organization_id,v_reservation_id,'RESERVE',p_quantity,'reservation:event:create:'||btrim(p_idempotency_key),v_movement_id);
  insert into public.commerce_audit_events(organization_id,action,entity_type,entity_id,metadata)
  values (p_organization_id,'INVENTORY_RESERVED','INVENTORY_RESERVATION',v_reservation_id,jsonb_build_object('quantity',p_quantity,'variantId',p_variant_id,'sourceId',p_source_id));
  insert into public.commerce_outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values (p_organization_id,'INVENTORY_RESERVATION',v_reservation_id,'INVENTORY_RESERVED',jsonb_build_object('reservationId',v_reservation_id,'quantity',p_quantity),'reservation-created:'||v_reservation_id::text);

  return jsonb_build_object('duplicate',false,'reservationId',v_reservation_id,'status','ACTIVE','requestedQuantity',p_quantity,'remainingQuantity',p_quantity,'movementId',v_movement_id);
end;
$$;

create or replace function public.commerce_inventory_reservation_apply(
  p_organization_id uuid,
  p_reservation_id uuid,
  p_action text,
  p_quantity numeric,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res public.commerce_inventory_reservations%rowtype;
  v_event public.commerce_inventory_reservation_events%rowtype;
  v_action text := upper(btrim(coalesce(p_action,'')));
  v_movement jsonb;
  v_movement_id uuid;
  v_remaining numeric(20,6);
  v_status text;
  v_physical_delta numeric := 0;
  v_reserved_delta numeric := 0;
  v_movement_type text;
begin
  if nullif(btrim(p_idempotency_key),'') is null then raise exception 'COMMERCE_RESERVATION_IDEMPOTENCY_REQUIRED'; end if;
  if v_action not in ('RELEASE','CONSUME') then raise exception 'COMMERCE_RESERVATION_ACTION_INVALID'; end if;
  if coalesce(p_quantity,0) <= 0 then raise exception 'COMMERCE_RESERVATION_QUANTITY_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_organization_id::text,'reservation',p_reservation_id::text),0));

  select * into v_event from public.commerce_inventory_reservation_events
  where organization_id=p_organization_id and idempotency_key=btrim(p_idempotency_key);
  if found then
    if v_event.reservation_id<>p_reservation_id or v_event.action<>v_action or v_event.quantity<>p_quantity then
      raise exception 'COMMERCE_RESERVATION_IDEMPOTENCY_PAYLOAD_MISMATCH';
    end if;
    select * into v_res from public.commerce_inventory_reservations where organization_id=p_organization_id and id=p_reservation_id;
    return jsonb_build_object('duplicate',true,'reservationId',v_res.id,'status',v_res.status,'remainingQuantity',v_res.remaining_quantity,'movementId',v_event.stock_movement_id);
  end if;

  select * into v_res from public.commerce_inventory_reservations
  where organization_id=p_organization_id and id=p_reservation_id and archived_at is null for update;
  if not found then raise exception 'COMMERCE_RESERVATION_NOT_FOUND'; end if;
  if v_res.status in ('RELEASED','CONSUMED','EXPIRED') then raise exception 'COMMERCE_RESERVATION_CLOSED'; end if;
  if v_res.expires_at is not null and v_res.expires_at <= now() then raise exception 'COMMERCE_RESERVATION_EXPIRED'; end if;
  if p_quantity > v_res.remaining_quantity then raise exception 'COMMERCE_RESERVATION_QUANTITY_EXCEEDS_REMAINING'; end if;

  if v_action='RELEASE' then
    v_reserved_delta := -p_quantity;
    v_movement_type := 'RESERVATION_RELEASE';
  else
    v_physical_delta := -p_quantity;
    v_reserved_delta := -p_quantity;
    v_movement_type := 'SALE';
  end if;

  v_movement := public.commerce_inventory_apply_movement(
    p_organization_id,v_res.source_id,v_res.variant_id,v_res.stock_status,v_movement_type,
    v_physical_delta,v_reserved_delta,0,'reservation:'||lower(v_action)||':'||btrim(p_idempotency_key),
    'RESERVATION',p_reservation_id,now()
  );
  v_movement_id := (v_movement->>'movementId')::uuid;

  if v_action='RELEASE' then
    update public.commerce_inventory_reservations set released_quantity=released_quantity+p_quantity where id=p_reservation_id and organization_id=p_organization_id;
  else
    update public.commerce_inventory_reservations set consumed_quantity=consumed_quantity+p_quantity where id=p_reservation_id and organization_id=p_organization_id;
  end if;

  select * into v_res from public.commerce_inventory_reservations where id=p_reservation_id and organization_id=p_organization_id;
  v_remaining := v_res.remaining_quantity;
  if v_remaining=0 then
    if v_res.consumed_quantity>0 then v_status:='CONSUMED';
    else v_status:='RELEASED'; end if;
  else v_status:='PARTIAL'; end if;
  update public.commerce_inventory_reservations set status=v_status where id=p_reservation_id and organization_id=p_organization_id;

  insert into public.commerce_inventory_reservation_events(organization_id,reservation_id,action,quantity,idempotency_key,stock_movement_id)
  values (p_organization_id,p_reservation_id,v_action,p_quantity,btrim(p_idempotency_key),v_movement_id);
  insert into public.commerce_audit_events(organization_id,action,entity_type,entity_id,metadata)
  values (p_organization_id,'INVENTORY_RESERVATION_'||v_action,'INVENTORY_RESERVATION',p_reservation_id,jsonb_build_object('quantity',p_quantity,'remainingQuantity',v_remaining));
  insert into public.commerce_outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values (p_organization_id,'INVENTORY_RESERVATION',p_reservation_id,'INVENTORY_RESERVATION_'||v_action,
    jsonb_build_object('reservationId',p_reservation_id,'quantity',p_quantity,'remainingQuantity',v_remaining),
    'reservation-'||lower(v_action)||':'||btrim(p_idempotency_key));

  return jsonb_build_object('duplicate',false,'reservationId',p_reservation_id,'status',v_status,'remainingQuantity',v_remaining,'movementId',v_movement_id);
end;
$$;

revoke all on function public.commerce_inventory_reservation_create(uuid,uuid,uuid,numeric,text,text,text,uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.commerce_inventory_reservation_apply(uuid,uuid,text,numeric,text) from public, anon, authenticated;
grant execute on function public.commerce_inventory_reservation_create(uuid,uuid,uuid,numeric,text,text,text,uuid,timestamptz) to service_role;
grant execute on function public.commerce_inventory_reservation_apply(uuid,uuid,text,numeric,text) to service_role;

update public.commerce_schema_meta
set schema_version='0.1.3', migration_count=4, bootstrap_id='commerce-inventory-reservations-m1-20260818', updated_at=now()
where component='commerce-core';
