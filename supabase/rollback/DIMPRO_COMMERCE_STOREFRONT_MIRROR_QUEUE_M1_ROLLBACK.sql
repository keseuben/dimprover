-- Rollback Commerce Storefront Mirror Queue M1 v0.1.12 -> v0.1.11

drop function if exists public.commerce_order_mirror_enqueue(uuid,text,text,text,jsonb);

drop index if exists public.commerce_order_mirror_attempts_retry_idx;
create index commerce_order_mirror_attempts_retry_idx
  on public.commerce_order_mirror_attempts (organization_id, state, next_retry_at, updated_at)
  where archived_at is null and state in ('PENDING','FAILED');

update public.commerce_schema_meta
set schema_version='0.1.11',migration_count=12,bootstrap_id='commerce-soft-delete-conformance-v011-20260819',updated_at=now()
where component='commerce-core';
