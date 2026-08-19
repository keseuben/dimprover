-- Rollback: Commerce Inventory Reservation Expiry M1 v0.1.10 -> v0.1.9 (DEV only)
drop function if exists public.commerce_inventory_expire_due_reservations(uuid,integer,timestamptz);
drop index if exists public.commerce_inventory_reservations_due_expiry_idx;
alter table public.commerce_inventory_reservation_events
  drop constraint if exists commerce_inventory_reservation_events_action_check;
alter table public.commerce_inventory_reservation_events
  add constraint commerce_inventory_reservation_events_action_check
  check (action in ('RESERVE','RELEASE','CONSUME'));
update public.commerce_schema_meta
set schema_version='0.1.9',migration_count=10,bootstrap_id='commerce-schema-conformance-v019-20260819',updated_at=now()
where component='commerce-core';
