-- DIMPRO Commerce Order Core M1 v0.1.6 — DEV migration
-- Shared order model for external Árutér cart -> central cashier workflow.

create table if not exists public.commerce_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  order_number text not null,
  source_channel text not null check (source_channel in ('EXTERNAL_MARKETPLACE','INTERNAL_COUNTER','POS','B2B','IMPORT')),
  external_reference text null,
  create_idempotency_key text not null,
  create_payload_hash text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','SENT_TO_CASHIER','PAID','ISSUED','CANCELLED')),
  customer_name text not null,
  customer_type text not null check (customer_type in ('WALK_IN','LOYAL_CUSTOMER','CONTRACTOR','GUEST','B2B')),
  recorder_name text null,
  cashier_name text null,
  issuer_name text null,
  payment_method text null check (payment_method is null or payment_method in ('CASH','CARD','TRANSFER','LATER')),
  pickup_at timestamptz null,
  note text null,
  sent_to_cashier_at timestamptz null,
  paid_at timestamptz null,
  issued_at timestamptz null,
  created_by_user_id uuid null references public.dimpro_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  unique (organization_id, order_number),
  unique (organization_id, create_idempotency_key)
);
create unique index if not exists commerce_orders_external_reference_idx
  on public.commerce_orders (organization_id, source_channel, external_reference)
  where external_reference is not null and archived_at is null;
create index if not exists commerce_orders_cashier_queue_idx
  on public.commerce_orders (organization_id, status, sent_to_cashier_at, created_at)
  where archived_at is null and status in ('SENT_TO_CASHIER','PAID');

create table if not exists public.commerce_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  order_id uuid not null references public.commerce_orders(id) on delete cascade,
  product_id uuid null references public.commerce_products(id) on delete restrict,
  variant_id uuid null references public.commerce_product_variants(id) on delete restrict,
  reservation_id uuid null references public.commerce_inventory_reservations(id) on delete set null,
  inventory_status text not null default 'UNRESOLVED' check (inventory_status in ('UNRESOLVED','RESOLVED','RESERVED','RELEASED','CONSUMED')),
  product_name text not null,
  sku text null,
  unit text not null check (unit in ('DB','KG','G','M','M2','M3','FM','L','CSOMAG','PAR','KESZLET','RAKLAP','ZSAK','LADA')),
  quantity numeric(20,6) not null check (quantity > 0),
  price_net_minor bigint not null check (price_net_minor >= 0),
  vat_rate_basis_points integer not null default 2700 check (vat_rate_basis_points between 0 and 10000),
  storage_zone text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null
);
create index if not exists commerce_order_items_order_idx
  on public.commerce_order_items (organization_id, order_id, created_at, id)
  where archived_at is null;
create index if not exists commerce_order_items_variant_idx
  on public.commerce_order_items (organization_id, variant_id)
  where archived_at is null and variant_id is not null;

create table if not exists public.commerce_order_status_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  order_id uuid not null references public.commerce_orders(id) on delete cascade,
  from_status text null,
  to_status text not null check (to_status in ('DRAFT','SENT_TO_CASHIER','PAID','ISSUED','CANCELLED')),
  idempotency_key text not null,
  actor_user_id uuid null references public.dimpro_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);
create index if not exists commerce_order_status_events_order_idx
  on public.commerce_order_status_events (organization_id, order_id, occurred_at, id);

drop trigger if exists commerce_orders_updated_at_trigger on public.commerce_orders;
create trigger commerce_orders_updated_at_trigger before update on public.commerce_orders
for each row execute function public.dimpro_set_updated_at();
drop trigger if exists commerce_order_items_updated_at_trigger on public.commerce_order_items;
create trigger commerce_order_items_updated_at_trigger before update on public.commerce_order_items
for each row execute function public.dimpro_set_updated_at();

alter table public.commerce_orders enable row level security;
alter table public.commerce_order_items enable row level security;
alter table public.commerce_order_status_events enable row level security;
revoke all on table public.commerce_orders, public.commerce_order_items, public.commerce_order_status_events from anon, authenticated, service_role;
grant select,insert,update,delete on table public.commerce_orders, public.commerce_order_items to service_role;
grant select,insert on table public.commerce_order_status_events to service_role;

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

revoke all on function public.commerce_order_create_atomic(uuid,text,text,text,text,text,text,timestamptz,text,text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.commerce_order_create_atomic(uuid,text,text,text,text,text,text,timestamptz,text,text,jsonb,uuid,text) to service_role;
revoke all on function public.commerce_order_set_status(uuid,uuid,text,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.commerce_order_set_status(uuid,uuid,text,text,text,text,uuid,text) to service_role;

update public.commerce_schema_meta
set schema_version='0.1.6',migration_count=7,bootstrap_id='commerce-order-core-m1-20260818',updated_at=now()
where component='commerce-core';
