-- DIMPRO Commerce Receiving M1 v0.1.5 — DEV migration
-- Draft goods receipt + line items + atomic inventory posting.

create table if not exists public.commerce_goods_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  warehouse_id uuid not null references public.commerce_warehouses(id) on delete restrict,
  source_id uuid not null references public.commerce_inventory_sources(id) on delete restrict,
  receipt_number text not null,
  supplier_name text null,
  supplier_document_number text null,
  status text not null default 'DRAFT' check (status in ('DRAFT','POSTED','CANCELLED')),
  received_at timestamptz not null default now(),
  posted_at timestamptz null,
  post_idempotency_key text null,
  notes text null,
  created_by_user_id uuid null references public.dimpro_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  unique (organization_id, receipt_number)
);
create unique index if not exists commerce_goods_receipts_post_idempotency_idx
  on public.commerce_goods_receipts (organization_id, post_idempotency_key)
  where post_idempotency_key is not null;
create index if not exists commerce_goods_receipts_org_status_idx
  on public.commerce_goods_receipts (organization_id, status, received_at desc)
  where archived_at is null;

create table if not exists public.commerce_goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dimpro_organizations(id) on delete restrict,
  receipt_id uuid not null references public.commerce_goods_receipts(id) on delete cascade,
  variant_id uuid not null references public.commerce_product_variants(id) on delete restrict,
  stock_status text not null default 'SELLABLE' check (stock_status in ('SELLABLE','QUARANTINE','DAMAGED','OUTLET')),
  quantity numeric(20,6) not null check (quantity > 0),
  unit text not null default 'DB' check (unit in ('DB','KG','G','M','M2','M3','FM','L','CSOMAG','PAR','KESZLET')),
  unit_cost_minor bigint null check (unit_cost_minor is null or unit_cost_minor >= 0),
  currency text not null default 'HUF' check (currency in ('HUF','EUR','USD')),
  lot_code text null,
  expiry_date date null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null
);
create index if not exists commerce_goods_receipt_items_receipt_idx
  on public.commerce_goods_receipt_items (organization_id, receipt_id, created_at, id)
  where archived_at is null;

drop trigger if exists commerce_goods_receipts_updated_at_trigger on public.commerce_goods_receipts;
create trigger commerce_goods_receipts_updated_at_trigger
before update on public.commerce_goods_receipts
for each row execute function public.dimpro_set_updated_at();

drop trigger if exists commerce_goods_receipt_items_updated_at_trigger on public.commerce_goods_receipt_items;
create trigger commerce_goods_receipt_items_updated_at_trigger
before update on public.commerce_goods_receipt_items
for each row execute function public.dimpro_set_updated_at();

alter table public.commerce_goods_receipts enable row level security;
alter table public.commerce_goods_receipt_items enable row level security;
revoke all on table public.commerce_goods_receipts, public.commerce_goods_receipt_items from anon, authenticated, service_role;
grant select,insert,update,delete on table public.commerce_goods_receipts, public.commerce_goods_receipt_items to service_role;

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

revoke all on function public.commerce_goods_receipt_post(uuid,uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.commerce_goods_receipt_post(uuid,uuid,text,timestamptz) to service_role;

update public.commerce_schema_meta
set schema_version='0.1.5', migration_count=6, bootstrap_id='commerce-receiving-m1-20260818', updated_at=now()
where component='commerce-core';
