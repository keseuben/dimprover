drop function if exists public.commerce_media_finalize_upload(uuid,uuid,text,text,integer,integer,bigint,text,boolean,jsonb,jsonb);
drop table if exists public.commerce_media_overlays cascade;
drop table if exists public.commerce_media_variants cascade;
update public.commerce_schema_meta
set schema_version='0.1.0', migration_count=1, bootstrap_id='commerce-core-m0-m1-20260818', updated_at=now()
where component='commerce-core';
