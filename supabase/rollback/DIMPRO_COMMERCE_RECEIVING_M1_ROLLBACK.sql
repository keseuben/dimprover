drop function if exists public.commerce_goods_receipt_post(uuid,uuid,text,timestamptz);
drop table if exists public.commerce_goods_receipt_items cascade;
drop table if exists public.commerce_goods_receipts cascade;
update public.commerce_schema_meta
set schema_version='0.1.4', migration_count=5, bootstrap_id='commerce-media-management-m1-20260818', updated_at=now()
where component='commerce-core';
