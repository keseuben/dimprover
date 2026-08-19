drop function if exists public.commerce_goods_receipt_post(uuid,uuid,text,timestamptz);
drop table if exists public.commerce_goods_receipt_items cascade;
drop table if exists public.commerce_goods_receipts cascade;
-- Restore Media finalization target support to the pre-Receiving definition.
create or replace function public.commerce_media_finalize_upload(
  p_organization_id uuid,
  p_asset_id uuid,
  p_primary_storage_key text,
  p_primary_mime_type text,
  p_primary_width integer,
  p_primary_height integer,
  p_primary_size_bytes bigint,
  p_visibility text default 'INTERNAL_ONLY',
  p_retain_original boolean default false,
  p_variants jsonb default '[]'::jsonb,
  p_links jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_kind text;
  v_storage_key text;
  v_mime text;
  v_width integer;
  v_height integer;
  v_size bigint;
  v_sha text;
  v_link_type text;
  v_linked_id uuid;
  v_variant_count integer := 0;
  v_link_count integer := 0;
  v_prefix text;
begin
  if p_organization_id is null or not exists (
    select 1 from public.dimpro_organizations o where o.id=p_organization_id and o.status='active'
  ) then raise exception 'COMMERCE_ORGANIZATION_NOT_ACTIVE'; end if;
  if p_asset_id is null then raise exception 'COMMERCE_MEDIA_ASSET_ID_REQUIRED'; end if;
  if p_visibility not in ('INTERNAL_ONLY','PUBLIC') then raise exception 'COMMERCE_MEDIA_VISIBILITY_INVALID'; end if;
  if p_primary_size_bytes <= 0 then raise exception 'COMMERCE_MEDIA_SIZE_INVALID'; end if;
  if nullif(btrim(p_primary_storage_key),'') is null or nullif(btrim(p_primary_mime_type),'') is null then
    raise exception 'COMMERCE_MEDIA_PRIMARY_INVALID';
  end if;
  v_prefix := 'commerce/' || p_organization_id::text || '/media/' || p_asset_id::text || '/';
  if left(btrim(p_primary_storage_key), length(v_prefix)) <> v_prefix then raise exception 'COMMERCE_MEDIA_STORAGE_SCOPE_INVALID'; end if;
  if jsonb_typeof(p_variants) <> 'array' or jsonb_array_length(p_variants) < 1 then raise exception 'COMMERCE_MEDIA_VARIANTS_REQUIRED'; end if;
  if jsonb_typeof(p_links) <> 'array' then raise exception 'COMMERCE_MEDIA_LINKS_ARRAY_REQUIRED'; end if;

  insert into public.commerce_media_assets(
    id,organization_id,storage_key,mime_type,width,height,size_bytes,visibility,processing_status,retain_original,metadata
  ) values (
    p_asset_id,p_organization_id,btrim(p_primary_storage_key),btrim(p_primary_mime_type),p_primary_width,p_primary_height,p_primary_size_bytes,
    p_visibility,'READY',coalesce(p_retain_original,false),jsonb_build_object('engine','COMMERCE_MEDIA_M1','finalizedAt',now())
  );

  for v_item in select value from jsonb_array_elements(p_variants) loop
    v_kind := upper(coalesce(v_item->>'kind',''));
    v_storage_key := btrim(coalesce(v_item->>'storageKey',''));
    v_mime := btrim(coalesce(v_item->>'mimeType',''));
    v_width := nullif(v_item->>'width','')::integer;
    v_height := nullif(v_item->>'height','')::integer;
    v_size := coalesce(nullif(v_item->>'sizeBytes','')::bigint,0);
    v_sha := lower(nullif(btrim(coalesce(v_item->>'sha256','')),''));
    if v_kind not in ('ORIGINAL','WEB','THUMBNAIL') then raise exception 'COMMERCE_MEDIA_VARIANT_KIND_INVALID'; end if;
    if v_storage_key='' or left(v_storage_key,length(v_prefix))<>v_prefix then raise exception 'COMMERCE_MEDIA_STORAGE_SCOPE_INVALID'; end if;
    if v_mime='' or v_size<=0 then raise exception 'COMMERCE_MEDIA_VARIANT_INVALID'; end if;
    if v_sha is not null and v_sha !~ '^[0-9a-f]{64}$' then raise exception 'COMMERCE_MEDIA_SHA256_INVALID'; end if;
    insert into public.commerce_media_variants(organization_id,asset_id,variant_kind,storage_key,mime_type,width,height,size_bytes,sha256)
    values (p_organization_id,p_asset_id,v_kind,v_storage_key,v_mime,v_width,v_height,v_size,v_sha);
    v_variant_count := v_variant_count + 1;
  end loop;

  if not exists (
    select 1 from public.commerce_media_variants v
    where v.organization_id=p_organization_id and v.asset_id=p_asset_id and v.variant_kind='WEB'
  ) then raise exception 'COMMERCE_MEDIA_WEB_VARIANT_REQUIRED'; end if;
  if not exists (
    select 1 from public.commerce_media_variants v
    where v.organization_id=p_organization_id and v.asset_id=p_asset_id and v.variant_kind='THUMBNAIL'
  ) then raise exception 'COMMERCE_MEDIA_THUMBNAIL_REQUIRED'; end if;
  if not p_retain_original and exists (
    select 1 from public.commerce_media_variants v
    where v.organization_id=p_organization_id and v.asset_id=p_asset_id and v.variant_kind='ORIGINAL'
  ) then raise exception 'COMMERCE_MEDIA_ORIGINAL_RETENTION_POLICY'; end if;

  for v_item in select value from jsonb_array_elements(p_links) loop
    v_link_type := upper(coalesce(v_item->>'linkType',''));
    begin
      v_linked_id := (v_item->>'linkedEntityId')::uuid;
    exception when others then
      raise exception 'COMMERCE_MEDIA_LINK_ID_INVALID';
    end;
    if v_link_type='PRODUCT' then
      if not exists (select 1 from public.commerce_products p where p.id=v_linked_id and p.organization_id=p_organization_id and p.archived_at is null) then
        raise exception 'COMMERCE_MEDIA_PRODUCT_SCOPE_MISMATCH';
      end if;
    elsif v_link_type='PRODUCT_VARIANT' then
      if not exists (select 1 from public.commerce_product_variants v where v.id=v_linked_id and v.organization_id=p_organization_id and v.archived_at is null) then
        raise exception 'COMMERCE_MEDIA_VARIANT_SCOPE_MISMATCH';
      end if;
    else
      raise exception 'COMMERCE_MEDIA_LINK_TYPE_NOT_READY';
    end if;
    insert into public.commerce_media_links(organization_id,asset_id,link_type,linked_entity_id,sort_order,is_primary)
    values (
      p_organization_id,p_asset_id,v_link_type,v_linked_id,
      coalesce(nullif(v_item->>'sortOrder','')::integer,0),coalesce((v_item->>'primary')::boolean,false)
    );
    v_link_count := v_link_count + 1;
  end loop;

  insert into public.commerce_audit_events(organization_id,action,entity_type,entity_id,metadata)
  values (p_organization_id,'MEDIA_FINALIZED','MEDIA_ASSET',p_asset_id,jsonb_build_object('variantCount',v_variant_count,'linkCount',v_link_count,'retainOriginal',p_retain_original));
  insert into public.commerce_outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
  values (p_organization_id,'MEDIA_ASSET',p_asset_id,'MEDIA_FINALIZED',jsonb_build_object('assetId',p_asset_id,'variantCount',v_variant_count,'linkCount',v_link_count),'media-finalized:'||p_asset_id::text);

  return jsonb_build_object('assetId',p_asset_id,'variantCount',v_variant_count,'linkCount',v_link_count,'status','READY');
end;
$$;

revoke all on function public.commerce_media_finalize_upload(uuid,uuid,text,text,integer,integer,bigint,text,boolean,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.commerce_media_finalize_upload(uuid,uuid,text,text,integer,integer,bigint,text,boolean,jsonb,jsonb) to service_role;

update public.commerce_schema_meta
set schema_version='0.1.4', migration_count=5, bootstrap_id='commerce-media-management-m1-20260818', updated_at=now()
where component='commerce-core';
