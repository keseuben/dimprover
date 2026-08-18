-- DIMPRO Commerce Pricing M1 v0.1.2 — DEV migration
-- Deterministic active price setter with append/history semantics.

create index if not exists commerce_prices_current_lookup_idx
  on public.commerce_prices (organization_id, variant_id, currency, valid_from desc, created_at desc)
  where archived_at is null;

revoke insert, update, delete on table public.commerce_prices from service_role;
grant select on table public.commerce_prices to service_role;

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

revoke all on function public.commerce_price_set_active(uuid,uuid,text,bigint,integer,timestamptz) from public, anon, authenticated;
grant execute on function public.commerce_price_set_active(uuid,uuid,text,bigint,integer,timestamptz) to service_role;

update public.commerce_schema_meta
set schema_version='0.1.2', migration_count=3, bootstrap_id='commerce-pricing-m1-20260818', updated_at=now()
where component='commerce-core';
