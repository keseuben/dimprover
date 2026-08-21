begin;

create table if not exists public.field_capture_report_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.field_capture_sessions(id) on delete cascade,
  actor_user_id uuid not null references public.dimpro_users(id) on delete restrict,
  idempotency_key_hash text not null,
  payload_sha256 text not null,
  status text not null default 'SENDING' check (status in ('SENDING','SENT','FAILED')),
  attempt_count integer not null default 1 check (attempt_count between 1 and 5),
  recipient_count integer not null check (recipient_count between 1 and 50),
  profile_id text not null default 'drop',
  attachment_name text not null,
  message_id text null,
  last_error_code text null,
  sent_at timestamptz null,
  last_error_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint field_capture_report_email_key_hash_check check (idempotency_key_hash ~ '^[a-f0-9]{64}$'),
  constraint field_capture_report_email_payload_hash_check check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  constraint field_capture_report_email_attachment_check check (length(btrim(attachment_name)) between 1 and 180),
  constraint field_capture_report_email_profile_check check (profile_id = 'drop'),
  constraint field_capture_report_email_idempotency_unique unique (session_id, idempotency_key_hash)
);

create index if not exists field_capture_report_email_delivery_status_idx
  on public.field_capture_report_email_deliveries(status, updated_at desc);
create index if not exists field_capture_report_email_delivery_session_idx
  on public.field_capture_report_email_deliveries(session_id, created_at desc);

insert into public.field_capture_schema_meta(component, schema_version, migration_count, bootstrap_id, updated_at)
values ('field-capture-report-email', '0.1.0', 1, 'field-capture-report-email-f6-v010-20260821', now())
on conflict (component) do update
set schema_version = excluded.schema_version,
    migration_count = excluded.migration_count,
    bootstrap_id = excluded.bootstrap_id,
    updated_at = excluded.updated_at;

comment on table public.field_capture_report_email_deliveries is 'Server-only idempotent Terep report e-mail delivery ledger. It stores no recipient address, message body, SMTP credential, raw Send token or raw idempotency key.';
comment on column public.field_capture_report_email_deliveries.idempotency_key_hash is 'SHA-256 of the client idempotency key; the raw key is never persisted.';
comment on column public.field_capture_report_email_deliveries.payload_sha256 is 'SHA-256 of the normalized effective delivery payload, including the PDF digest.';

alter table public.field_capture_report_email_deliveries enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.field_capture_report_email_deliveries from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.field_capture_report_email_deliveries from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.field_capture_report_email_deliveries to service_role';
  end if;
end
$$;

commit;
