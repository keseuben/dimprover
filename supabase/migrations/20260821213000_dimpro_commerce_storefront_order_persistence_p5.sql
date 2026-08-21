-- DIMPRO Commerce Storefront Order Persistence P5 v0.1.16 — DEV migration
-- Durable public Storefront order shell, independent from legacy ARUTER_REPOSITORY_MODE.

do $$
begin
  if not exists (
    select 1 from public.commerce_schema_meta
    where component='commerce-core' and schema_version='0.1.15' and migration_count=16
  ) then
    raise exception 'COMMERCE_P5_BASELINE_MISMATCH';
  end if;
  if to_regclass('public.commerce_storefront_orders') is not null then
    raise exception 'COMMERCE_P5_TABLE_ALREADY_EXISTS';
  end if;
end;
$$;

create sequence if not exists public.commerce_storefront_order_number_seq;

create table if not exists public.commerce_storefront_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  business_slug text not null check (business_slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  source_kind text not null check (source_kind in ('MULTI_ITEM_CHECKOUT','PUBLIC_RESERVATION')),
  transaction_key text not null,
  payload_fingerprint text not null,
  legacy_order_id text not null,
  order_number text not null,
  status text not null check (status in ('draft','sent_to_cashier','paid','issued','cancelled')),
  order_payload jsonb not null,
  sent_to_cashier_at timestamptz null,
  paid_at timestamptz null,
  issued_at timestamptz null,
  cancelled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  unique (organization_id,business_slug,transaction_key),
  unique (organization_id,legacy_order_id),
  unique (organization_id,order_number)
);

create index if not exists commerce_storefront_orders_recent_idx
  on public.commerce_storefront_orders (organization_id,business_slug,created_at desc)
  where deleted_at is null;
create index if not exists commerce_storefront_orders_status_idx
  on public.commerce_storefront_orders (organization_id,business_slug,status,updated_at desc)
  where deleted_at is null;

drop trigger if exists commerce_storefront_orders_updated_at_trigger on public.commerce_storefront_orders;
create trigger commerce_storefront_orders_updated_at_trigger
before update on public.commerce_storefront_orders
for each row execute function public.dimpro_set_updated_at();

alter table public.commerce_storefront_orders enable row level security;
revoke all on table public.commerce_storefront_orders from anon,authenticated,service_role;
grant select,insert,update on table public.commerce_storefront_orders to service_role;
revoke all on sequence public.commerce_storefront_order_number_seq from public,anon,authenticated,service_role;
grant usage,select on sequence public.commerce_storefront_order_number_seq to service_role;

create or replace function public.commerce_storefront_order_create(
  p_organization_id uuid,
  p_business_slug text,
  p_source_kind text,
  p_transaction_key text,
  p_payload_fingerprint text,
  p_order_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_slug text:=lower(btrim(coalesce(p_business_slug,'')));
  v_source text:=upper(btrim(coalesce(p_source_kind,'')));
  v_key text:=btrim(coalesce(p_transaction_key,''));
  v_fingerprint text:=btrim(coalesce(p_payload_fingerprint,''));
  v_existing public.commerce_storefront_orders%rowtype;
  v_row public.commerce_storefront_orders%rowtype;
  v_now timestamptz:=now();
  v_iso text;
  v_legacy_id text;
  v_order_number text;
  v_payload jsonb;
begin
  if p_organization_id is null or not exists(select 1 from public.dimpro_organizations o where o.id=p_organization_id and o.status='active') then raise exception 'COMMERCE_ORGANIZATION_NOT_ACTIVE'; end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$' then raise exception 'COMMERCE_STOREFRONT_ORDER_BUSINESS_INVALID'; end if;
  if v_source not in ('MULTI_ITEM_CHECKOUT','PUBLIC_RESERVATION') then raise exception 'COMMERCE_STOREFRONT_ORDER_SOURCE_INVALID'; end if;
  if length(v_key)<8 or length(v_key)>200 then raise exception 'COMMERCE_STOREFRONT_ORDER_TRANSACTION_KEY_INVALID'; end if;
  if length(v_fingerprint)<8 or length(v_fingerprint)>200 then raise exception 'COMMERCE_STOREFRONT_ORDER_FINGERPRINT_INVALID'; end if;
  if p_order_payload is null or jsonb_typeof(p_order_payload)<>'object' then raise exception 'COMMERCE_STOREFRONT_ORDER_PAYLOAD_INVALID'; end if;
  if jsonb_typeof(p_order_payload->'items')<>'array' or jsonb_array_length(p_order_payload->'items')<1 then raise exception 'COMMERCE_STOREFRONT_ORDER_ITEMS_REQUIRED'; end if;
  if nullif(btrim(p_order_payload->>'customerName'),'') is null then raise exception 'COMMERCE_STOREFRONT_ORDER_CUSTOMER_REQUIRED'; end if;
  if nullif(btrim(p_order_payload->>'template'),'') is null then raise exception 'COMMERCE_STOREFRONT_ORDER_TEMPLATE_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_organization_id::text,'storefront-order',v_slug,v_key),0));
  select * into v_existing
  from public.commerce_storefront_orders
  where organization_id=p_organization_id and business_slug=v_slug and transaction_key=v_key and deleted_at is null
  for update;
  if found then
    if v_existing.payload_fingerprint<>v_fingerprint then raise exception 'COMMERCE_STOREFRONT_ORDER_IDEMPOTENCY_PAYLOAD_MISMATCH'; end if;
    return jsonb_build_object('duplicate',true,'order',v_existing.order_payload,'legacyOrderId',v_existing.legacy_order_id,'orderNumber',v_existing.order_number);
  end if;

  v_legacy_id:='sf-'||replace(gen_random_uuid()::text,'-','');
  v_order_number:='AR-'||to_char(v_now at time zone 'UTC','YYYY')||'-SF-'||lpad(nextval('public.commerce_storefront_order_number_seq')::text,8,'0');
  v_iso:=to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_payload:=p_order_payload || jsonb_build_object(
    'id',v_legacy_id,
    'orderNumber',v_order_number,
    'status','sent_to_cashier',
    'createdAt',v_iso,
    'sentToCashierAt',v_iso
  );

  insert into public.commerce_storefront_orders(
    organization_id,business_slug,source_kind,transaction_key,payload_fingerprint,
    legacy_order_id,order_number,status,order_payload,sent_to_cashier_at
  ) values(
    p_organization_id,v_slug,v_source,v_key,v_fingerprint,
    v_legacy_id,v_order_number,'sent_to_cashier',v_payload,v_now
  ) returning * into v_row;

  insert into public.commerce_audit_events(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(p_organization_id,null,'STOREFRONT_ORDER_RECEIVED','STOREFRONT_ORDER',v_row.id,
    jsonb_build_object('businessSlug',v_slug,'sourceKind',v_source,'legacyOrderId',v_legacy_id,'orderNumber',v_order_number));
  insert into public.commerce_outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values(p_organization_id,'STOREFRONT_ORDER',v_row.id,'STOREFRONT_ORDER_RECEIVED',
    jsonb_build_object('storefrontOrderId',v_row.id,'businessSlug',v_slug,'legacyOrderId',v_legacy_id,'orderNumber',v_order_number,'status','sent_to_cashier'),
    'storefront-order-received:'||v_row.id::text)
  on conflict (organization_id,idempotency_key) do nothing;

  return jsonb_build_object('duplicate',false,'order',v_payload,'legacyOrderId',v_legacy_id,'orderNumber',v_order_number);
end;
$$;

create or replace function public.commerce_storefront_order_set_status(
  p_organization_id uuid,
  p_legacy_order_id text,
  p_status text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_target text:=lower(btrim(coalesce(p_status,'')));
  v_order public.commerce_storefront_orders%rowtype;
  v_now timestamptz:=now();
  v_iso text;
  v_payload jsonb;
  v_allowed boolean:=false;
begin
  if p_organization_id is null then raise exception 'COMMERCE_ORGANIZATION_REQUIRED'; end if;
  if nullif(btrim(p_legacy_order_id),'') is null then raise exception 'COMMERCE_STOREFRONT_ORDER_ID_REQUIRED'; end if;
  if v_target not in ('draft','sent_to_cashier','paid','issued','cancelled') then raise exception 'COMMERCE_STOREFRONT_ORDER_STATUS_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_organization_id::text,'storefront-order-status',btrim(p_legacy_order_id)),0));
  select * into v_order from public.commerce_storefront_orders
  where organization_id=p_organization_id and legacy_order_id=btrim(p_legacy_order_id) and deleted_at is null for update;
  if not found then raise exception 'COMMERCE_STOREFRONT_ORDER_NOT_FOUND'; end if;
  if v_order.status=v_target then return jsonb_build_object('duplicate',true,'order',v_order.order_payload); end if;
  v_allowed := (v_order.status='draft' and v_target in ('sent_to_cashier','cancelled'))
    or (v_order.status='sent_to_cashier' and v_target in ('paid','cancelled'))
    or (v_order.status='paid' and v_target='issued');
  if not v_allowed then raise exception 'COMMERCE_STOREFRONT_ORDER_STATUS_TRANSITION_INVALID'; end if;

  v_iso:=to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_payload:=v_order.order_payload || jsonb_build_object('status',v_target);
  if v_target='sent_to_cashier' then v_payload:=v_payload||jsonb_build_object('sentToCashierAt',coalesce(v_order.order_payload->>'sentToCashierAt',v_iso)); end if;
  if v_target='paid' then v_payload:=v_payload||jsonb_build_object('paidAt',v_iso); end if;
  if v_target='issued' then v_payload:=v_payload||jsonb_build_object('issuedAt',v_iso); end if;

  update public.commerce_storefront_orders set
    status=v_target,
    order_payload=v_payload,
    sent_to_cashier_at=case when v_target='sent_to_cashier' then coalesce(sent_to_cashier_at,v_now) else sent_to_cashier_at end,
    paid_at=case when v_target='paid' then v_now else paid_at end,
    issued_at=case when v_target='issued' then v_now else issued_at end,
    cancelled_at=case when v_target='cancelled' then v_now else cancelled_at end
  where id=v_order.id;

  insert into public.commerce_audit_events(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(p_organization_id,null,'STOREFRONT_ORDER_STATUS_CHANGED','STOREFRONT_ORDER',v_order.id,
    jsonb_build_object('businessSlug',v_order.business_slug,'legacyOrderId',v_order.legacy_order_id,'orderNumber',v_order.order_number,'fromStatus',v_order.status,'toStatus',v_target));
  insert into public.commerce_outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values(p_organization_id,'STOREFRONT_ORDER',v_order.id,'STOREFRONT_ORDER_STATUS_CHANGED',
    jsonb_build_object('storefrontOrderId',v_order.id,'legacyOrderId',v_order.legacy_order_id,'orderNumber',v_order.order_number,'fromStatus',v_order.status,'toStatus',v_target),
    'storefront-order-status:'||v_order.id::text||':'||v_target)
  on conflict (organization_id,idempotency_key) do nothing;

  return jsonb_build_object('duplicate',false,'order',v_payload,'fromStatus',v_order.status,'status',v_target);
end;
$$;

revoke all on function public.commerce_storefront_order_create(uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.commerce_storefront_order_create(uuid,text,text,text,text,jsonb) to service_role;
revoke all on function public.commerce_storefront_order_set_status(uuid,text,text) from public,anon,authenticated;
grant execute on function public.commerce_storefront_order_set_status(uuid,text,text) to service_role;

update public.commerce_schema_meta
set schema_version='0.1.16',migration_count=17,bootstrap_id='commerce-storefront-order-persistence-p5-20260821',updated_at=now()
where component='commerce-core';

notify pgrst, 'reload schema';
