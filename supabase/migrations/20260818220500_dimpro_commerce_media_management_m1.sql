-- DIMPRO Commerce Media Management M1 v0.1.4 — DEV migration
-- Atomic product media ordering/primary selection. Existing overlay table remains non-destructive.

create unique index if not exists commerce_media_links_one_primary_per_entity_idx
  on public.commerce_media_links (organization_id, link_type, linked_entity_id)
  where archived_at is null and is_primary;

create or replace function public.commerce_media_set_product_order(
  p_organization_id uuid,
  p_product_id uuid,
  p_asset_ids uuid[],
  p_primary_asset_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset uuid;
  v_index integer := 0;
  v_count integer := 0;
begin
  if p_organization_id is null or not exists (
    select 1 from public.dimpro_organizations o where o.id=p_organization_id and o.status='active'
  ) then raise exception 'COMMERCE_ORGANIZATION_NOT_ACTIVE'; end if;
  if not exists (
    select 1 from public.commerce_products p where p.id=p_product_id and p.organization_id=p_organization_id and p.archived_at is null
  ) then raise exception 'COMMERCE_MEDIA_PRODUCT_SCOPE_MISMATCH'; end if;
  if p_asset_ids is null or cardinality(p_asset_ids)=0 then raise exception 'COMMERCE_MEDIA_ASSET_ORDER_REQUIRED'; end if;
  if p_primary_asset_id is null or not (p_primary_asset_id=any(p_asset_ids)) then raise exception 'COMMERCE_MEDIA_PRIMARY_NOT_IN_ORDER'; end if;
  if cardinality(p_asset_ids) <> (select count(distinct x) from unnest(p_asset_ids) x) then raise exception 'COMMERCE_MEDIA_ASSET_ORDER_DUPLICATE'; end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_organization_id::text,'product-media-order',p_product_id::text),0));

  if exists (
    select 1 from unnest(p_asset_ids) x
    where not exists (
      select 1 from public.commerce_media_links l
      join public.commerce_media_assets a on a.id=l.asset_id and a.organization_id=l.organization_id
      where l.organization_id=p_organization_id and l.link_type='PRODUCT' and l.linked_entity_id=p_product_id
        and l.asset_id=x and l.archived_at is null and a.archived_at is null and a.processing_status='READY'
    )
  ) then raise exception 'COMMERCE_MEDIA_ASSET_LINK_SCOPE_MISMATCH'; end if;

  update public.commerce_media_links
  set is_primary=false
  where organization_id=p_organization_id and link_type='PRODUCT' and linked_entity_id=p_product_id and archived_at is null;

  foreach v_asset in array p_asset_ids loop
    update public.commerce_media_links
    set sort_order=v_index, is_primary=(v_asset=p_primary_asset_id)
    where organization_id=p_organization_id and link_type='PRODUCT' and linked_entity_id=p_product_id
      and asset_id=v_asset and archived_at is null;
    if not found then raise exception 'COMMERCE_MEDIA_ASSET_LINK_SCOPE_MISMATCH'; end if;
    v_index := v_index + 1;
    v_count := v_count + 1;
  end loop;

  insert into public.commerce_audit_events(organization_id,action,entity_type,entity_id,metadata)
  values (p_organization_id,'PRODUCT_MEDIA_ORDER_CHANGED','PRODUCT',p_product_id,
    jsonb_build_object('assetCount',v_count,'primaryAssetId',p_primary_asset_id));
  insert into public.commerce_outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values (p_organization_id,'PRODUCT',p_product_id,'PRODUCT_MEDIA_CHANGED',
    jsonb_build_object('productId',p_product_id,'assetCount',v_count,'primaryAssetId',p_primary_asset_id),
    'product-media-changed:'||p_product_id::text||':'||extract(epoch from clock_timestamp())::bigint::text||':'||gen_random_uuid()::text);

  return jsonb_build_object('productId',p_product_id,'assetCount',v_count,'primaryAssetId',p_primary_asset_id);
end;
$$;

revoke all on function public.commerce_media_set_product_order(uuid,uuid,uuid[],uuid) from public, anon, authenticated;
grant execute on function public.commerce_media_set_product_order(uuid,uuid,uuid[],uuid) to service_role;

update public.commerce_schema_meta
set schema_version='0.1.4', migration_count=5, bootstrap_id='commerce-media-management-m1-20260818', updated_at=now()
where component='commerce-core';
