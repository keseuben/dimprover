-- Rollback: DIMPRO Commerce schema conformance v0.1.9 -> v0.1.8 (DEV only)
-- Fractional monetary values cannot be represented by the historical bigint schema; rollback fails closed if any exist.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.commerce_prices WHERE amount <> trunc(amount))
    OR EXISTS (SELECT 1 FROM public.commerce_goods_receipt_items WHERE unit_cost IS NOT NULL AND unit_cost <> trunc(unit_cost))
    OR EXISTS (SELECT 1 FROM public.commerce_order_items WHERE price_net <> trunc(price_net))
  THEN RAISE EXCEPTION 'COMMERCE_SCHEMA_ROLLBACK_FRACTIONAL_MONEY_PRESENT'; END IF;
END $$;

-- Restore historical quantity typmods.
alter table public.commerce_inventory_balances drop column available_quantity;
alter table public.commerce_inventory_balances
  alter column physical_quantity type numeric(20,6) using physical_quantity::numeric(20,6),
  alter column reserved_quantity type numeric(20,6) using reserved_quantity::numeric(20,6),
  alter column incoming_quantity type numeric(20,6) using incoming_quantity::numeric(20,6);
alter table public.commerce_inventory_balances
  add column available_quantity numeric(20,6) generated always as (physical_quantity - reserved_quantity) stored;
comment on column public.commerce_inventory_balances.available_quantity is 'Generated read model: physical_quantity - reserved_quantity.';

alter table public.commerce_inventory_reservations drop column remaining_quantity;
alter table public.commerce_inventory_reservations
  alter column requested_quantity type numeric(20,6) using requested_quantity::numeric(20,6),
  alter column released_quantity type numeric(20,6) using released_quantity::numeric(20,6),
  alter column consumed_quantity type numeric(20,6) using consumed_quantity::numeric(20,6);
alter table public.commerce_inventory_reservations
  add column remaining_quantity numeric(20,6) generated always as (requested_quantity - released_quantity - consumed_quantity) stored;

alter table public.commerce_external_inventory_snapshots alter column quantity type numeric(20,6) using quantity::numeric(20,6);
alter table public.commerce_goods_receipt_items alter column quantity type numeric(20,6) using quantity::numeric(20,6);
alter table public.commerce_order_items alter column quantity type numeric(20,6) using quantity::numeric(20,6);
alter table public.commerce_inventory_reservation_events alter column quantity type numeric(20,6) using quantity::numeric(20,6);
alter table public.commerce_stock_movements
  alter column physical_delta type numeric(20,6) using physical_delta::numeric(20,6),
  alter column reserved_delta type numeric(20,6) using reserved_delta::numeric(20,6),
  alter column incoming_delta type numeric(20,6) using incoming_delta::numeric(20,6);

-- Restore historical monetary names/types.
drop function if exists public.commerce_price_set_active(uuid,uuid,text,numeric,integer,timestamptz);
alter table public.commerce_prices alter column amount type bigint using amount::bigint;
alter table public.commerce_prices rename column amount to amount_minor;
alter table public.commerce_goods_receipt_items alter column unit_cost type bigint using unit_cost::bigint;
alter table public.commerce_goods_receipt_items rename column unit_cost to unit_cost_minor;
alter table public.commerce_order_items alter column price_net type bigint using price_net::bigint;
alter table public.commerce_order_items rename column price_net to price_net_minor;

create or replace function public.commerce_inventory_apply_movement(
  p_organization_id uuid,
  p_source_id uuid,
  p_variant_id uuid,
  p_stock_status text,
  p_movement_type text,
  p_physical_delta numeric,
  p_reserved_delta numeric,
  p_incoming_delta numeric,
  p_idempotency_key text,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_occurred_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.commerce_inventory_sources%rowtype;
  v_existing public.commerce_stock_movements%rowtype;
  v_balance public.commerce_inventory_balances%rowtype;
  v_movement_id uuid;
  v_physical numeric(20,6);
  v_reserved numeric(20,6);
  v_incoming numeric(20,6);
begin
  if nullif(btrim(p_idempotency_key),'') is null then raise exception 'COMMERCE_IDEMPOTENCY_KEY_REQUIRED'; end if;
  if upper(p_stock_status) not in ('SELLABLE','RESERVED','QUARANTINE','DAMAGED','OUTLET','BLOCKED','IN_TRANSIT','RETURNED','SCRAP') then raise exception 'COMMERCE_STOCK_STATUS_INVALID'; end if;
  if upper(p_movement_type) not in ('RECEIPT','SALE','RESERVATION_COMMIT','RESERVATION_RELEASE','TRANSFER_OUT','TRANSFER_IN','ADJUSTMENT','RETURN') then raise exception 'COMMERCE_MOVEMENT_TYPE_INVALID'; end if;
  if coalesce(p_physical_delta,0)=0 and coalesce(p_reserved_delta,0)=0 and coalesce(p_incoming_delta,0)=0 then raise exception 'COMMERCE_MOVEMENT_ZERO_DELTA'; end if;

  select * into v_source from public.commerce_inventory_sources
  where id=p_source_id and organization_id=p_organization_id and source_type='INTERNAL' and active and archived_at is null;
  if not found then raise exception 'COMMERCE_INTERNAL_SOURCE_NOT_FOUND'; end if;
  if not exists (select 1 from public.commerce_product_variants v where v.id=p_variant_id and v.organization_id=p_organization_id and v.archived_at is null) then raise exception 'COMMERCE_VARIANT_SCOPE_MISMATCH'; end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_organization_id::text,p_source_id::text,p_variant_id::text,upper(p_stock_status)),0));

  select * into v_existing from public.commerce_stock_movements
  where organization_id=p_organization_id and idempotency_key=btrim(p_idempotency_key);
  if found then
    if v_existing.source_id<>p_source_id or v_existing.variant_id<>p_variant_id or v_existing.stock_status<>upper(p_stock_status)
      or v_existing.movement_type<>upper(p_movement_type) or v_existing.physical_delta<>coalesce(p_physical_delta,0)
      or v_existing.reserved_delta<>coalesce(p_reserved_delta,0) or v_existing.incoming_delta<>coalesce(p_incoming_delta,0) then
      raise exception 'COMMERCE_IDEMPOTENCY_PAYLOAD_MISMATCH';
    end if;
    select * into v_balance from public.commerce_inventory_balances
    where organization_id=p_organization_id and source_id=p_source_id and variant_id=p_variant_id and stock_status=upper(p_stock_status) and archived_at is null;
    return jsonb_build_object('duplicate',true,'movementId',v_existing.id,'balanceId',v_balance.id,'physicalQuantity',v_balance.physical_quantity,'reservedQuantity',v_balance.reserved_quantity,'availableQuantity',v_balance.available_quantity,'incomingQuantity',v_balance.incoming_quantity);
  end if;

  insert into public.commerce_inventory_balances(organization_id,source_id,warehouse_id,variant_id,stock_status,physical_quantity,reserved_quantity,incoming_quantity)
  values (p_organization_id,p_source_id,v_source.warehouse_id,p_variant_id,upper(p_stock_status),0,0,0)
  on conflict (organization_id,source_id,variant_id,stock_status) do nothing;

  select * into v_balance from public.commerce_inventory_balances
  where organization_id=p_organization_id and source_id=p_source_id and variant_id=p_variant_id and stock_status=upper(p_stock_status) and archived_at is null
  for update;

  v_physical := v_balance.physical_quantity + coalesce(p_physical_delta,0);
  v_reserved := v_balance.reserved_quantity + coalesce(p_reserved_delta,0);
  v_incoming := v_balance.incoming_quantity + coalesce(p_incoming_delta,0);
  if v_physical < 0 then raise exception 'COMMERCE_PHYSICAL_NEGATIVE'; end if;
  if v_reserved < 0 then raise exception 'COMMERCE_RESERVED_NEGATIVE'; end if;
  if v_incoming < 0 then raise exception 'COMMERCE_INCOMING_NEGATIVE'; end if;
  if v_reserved > v_physical then raise exception 'COMMERCE_RESERVED_EXCEEDS_PHYSICAL'; end if;

  update public.commerce_inventory_balances set
    physical_quantity=v_physical, reserved_quantity=v_reserved, incoming_quantity=v_incoming, last_movement_at=coalesce(p_occurred_at,now()), updated_at=now()
  where id=v_balance.id
  returning * into v_balance;

  insert into public.commerce_stock_movements(organization_id,source_id,warehouse_id,variant_id,stock_status,movement_type,physical_delta,reserved_delta,incoming_delta,idempotency_key,reference_type,reference_id,occurred_at)
  values (p_organization_id,p_source_id,v_source.warehouse_id,p_variant_id,upper(p_stock_status),upper(p_movement_type),coalesce(p_physical_delta,0),coalesce(p_reserved_delta,0),coalesce(p_incoming_delta,0),btrim(p_idempotency_key),nullif(btrim(p_reference_type),''),p_reference_id,coalesce(p_occurred_at,now()))
  returning id into v_movement_id;

  insert into public.commerce_audit_events(organization_id,action,entity_type,entity_id,metadata)
  values (p_organization_id,'STOCK_MOVEMENT_APPLIED','STOCK_MOVEMENT',v_movement_id,jsonb_build_object('sourceId',p_source_id,'variantId',p_variant_id,'movementType',upper(p_movement_type)));
  insert into public.commerce_outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values (p_organization_id,'PRODUCT_VARIANT',p_variant_id,'STOCK_MOVEMENT_APPLIED',jsonb_build_object('movementId',v_movement_id,'sourceId',p_source_id),'stock-movement:'||btrim(p_idempotency_key));

  return jsonb_build_object('duplicate',false,'movementId',v_movement_id,'balanceId',v_balance.id,'physicalQuantity',v_balance.physical_quantity,'reservedQuantity',v_balance.reserved_quantity,'availableQuantity',v_balance.available_quantity,'incomingQuantity',v_balance.incoming_quantity);
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

create or replace function public.commerce_goods_receipt_post(
  p_organization_id uuid,
  p_receipt_id uuid,
  p_idempotency_key text,
  p_posted_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt public.commerce_goods_receipts%rowtype;
  v_source public.commerce_inventory_sources%rowtype;
  v_item public.commerce_goods_receipt_items%rowtype;
  v_items integer := 0;
  v_total numeric(20,6) := 0;
  v_movement jsonb;
begin
  if p_organization_id is null or not exists (
    select 1 from public.dimpro_organizations o where o.id=p_organization_id and o.status='active'
  ) then raise exception 'COMMERCE_ORGANIZATION_NOT_ACTIVE'; end if;
  if p_receipt_id is null then raise exception 'COMMERCE_RECEIPT_ID_REQUIRED'; end if;
  if nullif(btrim(p_idempotency_key),'') is null then raise exception 'COMMERCE_RECEIPT_POST_IDEMPOTENCY_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_organization_id::text,'goods-receipt',p_receipt_id::text),0));

  select * into v_receipt from public.commerce_goods_receipts
  where id=p_receipt_id and organization_id=p_organization_id and archived_at is null for update;
  if not found then raise exception 'COMMERCE_RECEIPT_NOT_FOUND'; end if;

  if v_receipt.status='POSTED' then
    if v_receipt.post_idempotency_key=btrim(p_idempotency_key) then
      return jsonb_build_object('duplicate',true,'receiptId',v_receipt.id,'status',v_receipt.status,'postedAt',v_receipt.posted_at);
    end if;
    raise exception 'COMMERCE_RECEIPT_ALREADY_POSTED';
  end if;
  if v_receipt.status='CANCELLED' then raise exception 'COMMERCE_RECEIPT_CANCELLED'; end if;

  select * into v_source from public.commerce_inventory_sources
  where id=v_receipt.source_id and organization_id=p_organization_id and source_type='INTERNAL' and active and archived_at is null;
  if not found then raise exception 'COMMERCE_RECEIPT_SOURCE_NOT_ACTIVE'; end if;
  if v_source.warehouse_id is distinct from v_receipt.warehouse_id then raise exception 'COMMERCE_RECEIPT_WAREHOUSE_SOURCE_MISMATCH'; end if;

  for v_item in
    select * from public.commerce_goods_receipt_items
    where organization_id=p_organization_id and receipt_id=p_receipt_id and archived_at is null
    order by created_at,id
  loop
    if not exists (
      select 1 from public.commerce_product_variants v
      where v.id=v_item.variant_id and v.organization_id=p_organization_id and v.archived_at is null and v.status<>'ARCHIVED'
    ) then raise exception 'COMMERCE_RECEIPT_VARIANT_SCOPE_MISMATCH'; end if;

    v_movement := public.commerce_inventory_apply_movement(
      p_organization_id,
      v_receipt.source_id,
      v_item.variant_id,
      v_item.stock_status,
      'RECEIPT',
      v_item.quantity,
      0,
      0,
      'goods-receipt:post:'||p_receipt_id::text||':item:'||v_item.id::text,
      'GOODS_RECEIPT_ITEM',
      v_item.id,
      coalesce(p_posted_at,now())
    );
    v_items := v_items + 1;
    v_total := v_total + v_item.quantity;
  end loop;

  if v_items=0 then raise exception 'COMMERCE_RECEIPT_EMPTY'; end if;

  update public.commerce_goods_receipts
  set status='POSTED', posted_at=coalesce(p_posted_at,now()), post_idempotency_key=btrim(p_idempotency_key)
  where id=p_receipt_id and organization_id=p_organization_id;

  insert into public.commerce_audit_events(organization_id,action,entity_type,entity_id,metadata)
  values (p_organization_id,'GOODS_RECEIPT_POSTED','GOODS_RECEIPT',p_receipt_id,
    jsonb_build_object('itemCount',v_items,'totalQuantity',v_total,'warehouseId',v_receipt.warehouse_id,'sourceId',v_receipt.source_id));
  insert into public.commerce_outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values (p_organization_id,'GOODS_RECEIPT',p_receipt_id,'GOODS_RECEIPT_POSTED',
    jsonb_build_object('receiptId',p_receipt_id,'itemCount',v_items,'totalQuantity',v_total),
    'goods-receipt-posted:'||p_receipt_id::text);

  return jsonb_build_object('duplicate',false,'receiptId',p_receipt_id,'status','POSTED','itemCount',v_items,'totalQuantity',v_total,'postedAt',coalesce(p_posted_at,now()));
end;
$$;

create or replace function public.commerce_price_set_active(
  p_organization_id uuid,
  p_variant_id uuid,
  p_currency text,
  p_amount_minor bigint,
  p_vat_rate_basis_points integer default 2700,
  p_effective_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price_id uuid;
  v_effective timestamptz := coalesce(p_effective_at, now());
  v_currency text := upper(btrim(coalesce(p_currency,'')));
  v_previous_count integer := 0;
begin
  if p_organization_id is null or not exists (
    select 1 from public.dimpro_organizations o where o.id=p_organization_id and o.status='active'
  ) then raise exception 'COMMERCE_ORGANIZATION_NOT_ACTIVE'; end if;
  if not exists (
    select 1 from public.commerce_product_variants v
    where v.id=p_variant_id and v.organization_id=p_organization_id and v.archived_at is null and v.status <> 'ARCHIVED'
  ) then raise exception 'COMMERCE_PRICE_VARIANT_SCOPE_MISMATCH'; end if;
  if v_currency not in ('HUF','EUR','USD') then raise exception 'COMMERCE_PRICE_CURRENCY_INVALID'; end if;
  if p_amount_minor is null or p_amount_minor < 0 then raise exception 'COMMERCE_PRICE_AMOUNT_INVALID'; end if;
  if p_vat_rate_basis_points is null or p_vat_rate_basis_points < 0 or p_vat_rate_basis_points > 10000 then
    raise exception 'COMMERCE_PRICE_VAT_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_organization_id::text,p_variant_id::text,v_currency),0));

  update public.commerce_prices
  set status='INACTIVE',
      valid_until=case when valid_until is null or valid_until > v_effective then v_effective else valid_until end,
      updated_at=now()
  where organization_id=p_organization_id
    and variant_id=p_variant_id
    and currency=v_currency
    and status='ACTIVE'
    and archived_at is null
    and (valid_until is null or valid_until > v_effective);
  get diagnostics v_previous_count = row_count;

  insert into public.commerce_prices(
    organization_id,variant_id,currency,amount_minor,vat_rate_basis_points,valid_from,valid_until,status
  ) values (
    p_organization_id,p_variant_id,v_currency,p_amount_minor,p_vat_rate_basis_points,v_effective,null,'ACTIVE'
  ) returning id into v_price_id;

  insert into public.commerce_audit_events(organization_id,action,entity_type,entity_id,metadata)
  values (
    p_organization_id,'PRICE_SET_ACTIVE','PRICE',v_price_id,
    jsonb_build_object('variantId',p_variant_id,'currency',v_currency,'amountMinor',p_amount_minor,'vatRateBasisPoints',p_vat_rate_basis_points,'previousDeactivated',v_previous_count)
  );
  insert into public.commerce_outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values (
    p_organization_id,'PRODUCT_VARIANT',p_variant_id,'PRICE_CHANGED',
    jsonb_build_object('priceId',v_price_id,'variantId',p_variant_id,'currency',v_currency,'amountMinor',p_amount_minor,'vatRateBasisPoints',p_vat_rate_basis_points),
    'price-changed:'||v_price_id::text
  );

  return jsonb_build_object(
    'priceId',v_price_id,'variantId',p_variant_id,'currency',v_currency,'amountMinor',p_amount_minor,
    'vatRateBasisPoints',p_vat_rate_basis_points,'effectiveAt',v_effective,'previousDeactivated',v_previous_count
  );
end;
$$;

create or replace function public.commerce_order_create_atomic(
  p_organization_id uuid,
  p_order_number text,
  p_source_channel text,
  p_external_reference text,
  p_customer_name text,
  p_customer_type text,
  p_recorder_name text,
  p_pickup_at timestamptz,
  p_note text,
  p_initial_status text,
  p_items jsonb,
  p_created_by_user_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order_id uuid;
  v_existing public.commerce_orders%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_product_name text;
  v_sku text;
  v_unit text;
  v_quantity numeric(20,6);
  v_price bigint;
  v_vat integer;
  v_storage_zone text;
  v_count integer:=0;
  v_payload_hash text;
  v_status text:=upper(coalesce(p_initial_status,'SENT_TO_CASHIER'));
  v_source text:=upper(coalesce(p_source_channel,''));
  v_customer_type text:=upper(coalesce(p_customer_type,''));
begin
  if p_organization_id is null or not exists(select 1 from public.dimpro_organizations o where o.id=p_organization_id and o.status='active') then raise exception 'COMMERCE_ORGANIZATION_NOT_ACTIVE'; end if;
  if nullif(btrim(p_order_number),'') is null then raise exception 'COMMERCE_ORDER_NUMBER_REQUIRED'; end if;
  if v_source not in ('EXTERNAL_MARKETPLACE','INTERNAL_COUNTER','POS','B2B','IMPORT') then raise exception 'COMMERCE_ORDER_SOURCE_INVALID'; end if;
  if v_status not in ('DRAFT','SENT_TO_CASHIER') then raise exception 'COMMERCE_ORDER_INITIAL_STATUS_INVALID'; end if;
  if v_customer_type not in ('WALK_IN','LOYAL_CUSTOMER','CONTRACTOR','GUEST','B2B') then raise exception 'COMMERCE_ORDER_CUSTOMER_TYPE_INVALID'; end if;
  if nullif(btrim(p_customer_name),'') is null then raise exception 'COMMERCE_ORDER_CUSTOMER_REQUIRED'; end if;
  if nullif(btrim(p_idempotency_key),'') is null then raise exception 'COMMERCE_ORDER_IDEMPOTENCY_REQUIRED'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'COMMERCE_ORDER_ITEMS_REQUIRED'; end if;
  if p_created_by_user_id is not null and not exists(select 1 from public.dimpro_users u where u.id=p_created_by_user_id) then raise exception 'COMMERCE_ORDER_ACTOR_NOT_FOUND'; end if;
  v_payload_hash:=md5(jsonb_build_object(
    'orderNumber',btrim(p_order_number),
    'sourceChannel',v_source,
    'externalReference',nullif(btrim(p_external_reference),''),
    'customerName',btrim(p_customer_name),
    'customerType',v_customer_type,
    'recorderName',nullif(btrim(p_recorder_name),''),
    'pickupAt',p_pickup_at,
    'note',nullif(btrim(p_note),''),
    'initialStatus',v_status,
    'items',p_items
  )::text);

  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_organization_id::text,'order-create',btrim(p_idempotency_key)),0));
  select * into v_existing from public.commerce_orders where organization_id=p_organization_id and create_idempotency_key=btrim(p_idempotency_key) and archived_at is null;
  if found then
    if v_existing.create_payload_hash<>v_payload_hash then
      raise exception 'COMMERCE_ORDER_IDEMPOTENCY_PAYLOAD_MISMATCH';
    end if;
    return jsonb_build_object('duplicate',true,'orderId',v_existing.id,'orderNumber',v_existing.order_number,'status',v_existing.status);
  end if;

  v_order_id:=gen_random_uuid();
  insert into public.commerce_orders(id,organization_id,order_number,source_channel,external_reference,create_idempotency_key,create_payload_hash,status,customer_name,customer_type,recorder_name,pickup_at,note,sent_to_cashier_at,created_by_user_id)
  values(v_order_id,p_organization_id,btrim(p_order_number),v_source,nullif(btrim(p_external_reference),''),btrim(p_idempotency_key),v_payload_hash,v_status,btrim(p_customer_name),v_customer_type,nullif(btrim(p_recorder_name),''),p_pickup_at,nullif(btrim(p_note),''),case when v_status='SENT_TO_CASHIER' then now() else null end,p_created_by_user_id);

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin v_product_id:=nullif(v_item->>'productId','')::uuid; exception when others then raise exception 'COMMERCE_ORDER_PRODUCT_ID_INVALID'; end;
    begin v_variant_id:=nullif(v_item->>'variantId','')::uuid; exception when others then raise exception 'COMMERCE_ORDER_VARIANT_ID_INVALID'; end;
    v_product_name:=btrim(coalesce(v_item->>'productName',''));
    v_sku:=nullif(btrim(coalesce(v_item->>'sku','')),'');
    v_unit:=upper(btrim(coalesce(v_item->>'unit','')));
    begin v_quantity:=coalesce(nullif(v_item->>'quantity','')::numeric,0); exception when others then raise exception 'COMMERCE_ORDER_QUANTITY_INVALID'; end;
    begin v_price:=coalesce(nullif(v_item->>'priceNetMinor','')::bigint,-1); exception when others then raise exception 'COMMERCE_ORDER_PRICE_INVALID'; end;
    begin v_vat:=coalesce(nullif(v_item->>'vatRateBasisPoints','')::integer,2700); exception when others then raise exception 'COMMERCE_ORDER_VAT_INVALID'; end;
    v_storage_zone:=nullif(btrim(coalesce(v_item->>'storageZone','')),'');
    if v_product_name='' then raise exception 'COMMERCE_ORDER_PRODUCT_NAME_REQUIRED'; end if;
    if v_unit not in ('DB','KG','G','M','M2','M3','FM','L','CSOMAG','PAR','KESZLET','RAKLAP','ZSAK','LADA') then raise exception 'COMMERCE_ORDER_UNIT_INVALID'; end if;
    if v_quantity<=0 then raise exception 'COMMERCE_ORDER_QUANTITY_INVALID'; end if;
    if v_price<0 then raise exception 'COMMERCE_ORDER_PRICE_INVALID'; end if;
    if v_vat<0 or v_vat>10000 then raise exception 'COMMERCE_ORDER_VAT_INVALID'; end if;
    if v_product_id is not null and not exists(select 1 from public.commerce_products p where p.id=v_product_id and p.organization_id=p_organization_id and p.archived_at is null) then raise exception 'COMMERCE_ORDER_PRODUCT_SCOPE_MISMATCH'; end if;
    if v_variant_id is not null and not exists(select 1 from public.commerce_product_variants v where v.id=v_variant_id and v.organization_id=p_organization_id and v.archived_at is null) then raise exception 'COMMERCE_ORDER_VARIANT_SCOPE_MISMATCH'; end if;
    if v_product_id is not null and v_variant_id is not null and not exists(select 1 from public.commerce_product_variants v where v.id=v_variant_id and v.product_id=v_product_id and v.organization_id=p_organization_id) then raise exception 'COMMERCE_ORDER_PRODUCT_VARIANT_MISMATCH'; end if;
    insert into public.commerce_order_items(organization_id,order_id,product_id,variant_id,inventory_status,product_name,sku,unit,quantity,price_net_minor,vat_rate_basis_points,storage_zone)
    values(p_organization_id,v_order_id,v_product_id,v_variant_id,case when v_variant_id is null then 'UNRESOLVED' else 'RESOLVED' end,v_product_name,v_sku,v_unit,v_quantity,v_price,v_vat,v_storage_zone);
    v_count:=v_count+1;
  end loop;

  insert into public.commerce_order_status_events(organization_id,order_id,from_status,to_status,idempotency_key,actor_user_id,metadata)
  values(p_organization_id,v_order_id,null,v_status,'create:'||btrim(p_idempotency_key),p_created_by_user_id,jsonb_build_object('sourceChannel',v_source,'itemCount',v_count));
  insert into public.commerce_audit_events(organization_id,action,entity_type,entity_id,metadata)
  values(p_organization_id,case when v_status='SENT_TO_CASHIER' then 'ORDER_SENT_TO_CASHIER' else 'ORDER_CREATED' end,'ORDER',v_order_id,jsonb_build_object('orderNumber',btrim(p_order_number),'sourceChannel',v_source,'itemCount',v_count));
  insert into public.commerce_outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values(p_organization_id,'ORDER',v_order_id,case when v_status='SENT_TO_CASHIER' then 'ORDER_SENT_TO_CASHIER' else 'ORDER_CREATED' end,jsonb_build_object('orderId',v_order_id,'orderNumber',btrim(p_order_number),'sourceChannel',v_source,'itemCount',v_count),'order-created:'||v_order_id::text);
  return jsonb_build_object('duplicate',false,'orderId',v_order_id,'orderNumber',btrim(p_order_number),'status',v_status,'itemCount',v_count);
end;
$$;

revoke all on function public.commerce_inventory_apply_movement(uuid,uuid,uuid,text,text,numeric,numeric,numeric,text,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.commerce_inventory_apply_movement(uuid,uuid,uuid,text,text,numeric,numeric,numeric,text,text,uuid,timestamptz) to service_role;
revoke all on function public.commerce_inventory_reservation_apply(uuid,uuid,text,numeric,text) from public,anon,authenticated;
grant execute on function public.commerce_inventory_reservation_apply(uuid,uuid,text,numeric,text) to service_role;
revoke all on function public.commerce_goods_receipt_post(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.commerce_goods_receipt_post(uuid,uuid,text,timestamptz) to service_role;
revoke all on function public.commerce_price_set_active(uuid,uuid,text,bigint,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.commerce_price_set_active(uuid,uuid,text,bigint,integer,timestamptz) to service_role;
revoke all on function public.commerce_order_create_atomic(uuid,text,text,text,text,text,text,timestamptz,text,text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.commerce_order_create_atomic(uuid,text,text,text,text,text,text,timestamptz,text,text,jsonb,uuid,text) to service_role;

update public.commerce_schema_meta
set schema_version='0.1.8', migration_count=9, bootstrap_id='commerce-order-mirror-reconciliation-m1-20260819', updated_at=now()
where component='commerce-core';
