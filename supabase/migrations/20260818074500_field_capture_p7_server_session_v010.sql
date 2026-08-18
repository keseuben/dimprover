-- DIMPRO Terepi Gyorsrögzítő · P7 server capture schema 0.1.0
-- DEV-first migration. Transaction boundary is enforced by the migration gate.
-- The nine domain tables are server-only; browser clients never receive direct table grants.

create extension if not exists pgcrypto;

create table if not exists public.field_capture_schema_meta (
  component text primary key,
  schema_version text not null,
  migration_count integer not null default 0,
  bootstrap_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.field_capture_sessions (
  id uuid primary key default gen_random_uuid(),
  client_session_id text not null,
  user_id uuid not null,
  entitlement_id uuid not null,
  project_id text null references public.project_core_projects(id) on delete set null,
  context_module_code text not null default 'FIELD_CAPTURE',
  defaults jsonb not null default '{}'::jsonb,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','CLOSED','ARCHIVED')),
  started_at timestamptz not null default now(),
  closed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint field_capture_sessions_client_id_check check (length(btrim(client_session_id)) between 1 and 160),
  unique(user_id, client_session_id)
);

create table if not exists public.field_capture_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.field_capture_sessions(id) on delete cascade,
  client_item_id text not null,
  sequence_no integer not null check (sequence_no > 0),
  captured_at timestamptz not null,
  note text not null default '',
  status text not null default 'LOCAL_ONLY' check (status in ('LOCAL_ONLY','QUEUED','UPLOADING','SERVER_STORED','DESTINATION_PENDING','SYNCED','ERROR')),
  capture_options jsonb not null default '{}'::jsonb,
  edited boolean not null default false,
  edit_revision integer not null default 0 check (edit_revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint field_capture_items_client_id_check check (length(btrim(client_item_id)) between 1 and 200),
  unique(session_id, client_item_id),
  unique(session_id, sequence_no)
);

create table if not exists public.field_capture_asset_refs (
  id uuid primary key default gen_random_uuid(),
  capture_item_id uuid not null references public.field_capture_items(id) on delete cascade,
  blob_id text null,
  variant text not null default 'OPTIMIZED' check (variant in ('ORIGINAL','OPTIMIZED','THUMBNAIL')),
  original_name text null,
  display_name text not null,
  mime_type text not null,
  original_size_bytes bigint null check (original_size_bytes is null or original_size_bytes >= 0),
  stored_size_bytes bigint null check (stored_size_bytes is null or stored_size_bytes >= 0),
  width integer null check (width is null or width > 0),
  height integer null check (height is null or height > 0),
  checksum_sha256 text null check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  storage_provider text null,
  storage_bucket text null,
  storage_key text null,
  optimized boolean not null default false,
  storage_status text not null default 'PENDING' check (storage_status in ('PENDING','UPLOADING','STORED','FAILED','REMOVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.field_capture_locations (
  id uuid primary key default gen_random_uuid(),
  capture_item_id uuid not null unique references public.field_capture_items(id) on delete cascade,
  enabled boolean not null default false,
  latitude double precision null check (latitude is null or latitude between -90 and 90),
  longitude double precision null check (longitude is null or longitude between -180 and 180),
  accuracy_meters double precision null check (accuracy_meters is null or accuracy_meters >= 0),
  captured_at timestamptz null,
  source text null check (source is null or source in ('browser-geolocation','native-bridge','imported')),
  status text not null default 'OFF' check (status in ('OFF','REQUESTING','READY','UNAVAILABLE','DENIED','LOW_ACCURACY')),
  detail text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.field_capture_orientations (
  id uuid primary key default gen_random_uuid(),
  capture_item_id uuid not null unique references public.field_capture_items(id) on delete cascade,
  enabled boolean not null default false,
  heading_degrees double precision null check (heading_degrees is null or (heading_degrees >= 0 and heading_degrees < 360)),
  heading_accuracy_degrees double precision null check (heading_accuracy_degrees is null or heading_accuracy_degrees >= 0),
  direction_label text null check (direction_label is null or direction_label in ('É','ÉK','K','DK','D','DNy','Ny','ÉNy')),
  captured_at timestamptz null,
  source text null check (source is null or source in ('device-orientation','native-sensor','imported')),
  status text not null default 'OFF' check (status in ('OFF','REQUESTING','READY','UNAVAILABLE','DENIED','UNSTABLE')),
  detail text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.field_capture_voice_notes (
  id uuid primary key default gen_random_uuid(),
  capture_item_id uuid not null unique references public.field_capture_items(id) on delete cascade,
  audio_asset_ref_id uuid null references public.field_capture_asset_refs(id) on delete set null,
  transcript_raw text null,
  transcript_cleaned text null,
  selected_transcript text null,
  status text not null default 'NOT_REQUESTED' check (status in ('NOT_REQUESTED','RECORDED','QUEUED','TRANSCRIBING','READY','FAILED')),
  audio_retention text not null default 'EPHEMERAL' check (audio_retention in ('EPHEMERAL','KEEP_WITH_ITEM')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.field_capture_destinations (
  id uuid primary key default gen_random_uuid(),
  capture_item_id uuid not null references public.field_capture_items(id) on delete cascade,
  target text not null check (target in ('CAPTURE','DEVICE','USER_DRIVE','PROJECT_DRIVE')),
  folder_id text null,
  ownership text not null check (ownership in ('CAPTURE','USER','PROJECT','DEVICE')),
  status text not null default 'PENDING' check (status in ('PENDING','QUEUED','STORED','FAILED','REMOVED')),
  asset_ref_id uuid null references public.field_capture_asset_refs(id) on delete set null,
  retained_independently boolean not null default false,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(capture_item_id, target)
);

create table if not exists public.field_capture_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.field_capture_sessions(id) on delete cascade,
  capture_item_id uuid null references public.field_capture_items(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint field_capture_events_type_check check (length(btrim(event_type)) between 1 and 120)
);

create table if not exists public.field_capture_sync_queue (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.field_capture_sessions(id) on delete cascade,
  capture_item_id uuid null references public.field_capture_items(id) on delete cascade,
  device_local_id text not null,
  operation text not null,
  status text not null default 'QUEUED' check (status in ('QUEUED','RUNNING','DONE','FAILED')),
  retry_count integer not null default 0 check (retry_count >= 0),
  next_retry_at timestamptz null,
  payload_meta jsonb not null default '{}'::jsonb,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint field_capture_sync_device_id_check check (length(btrim(device_local_id)) between 1 and 200),
  constraint field_capture_sync_operation_check check (length(btrim(operation)) between 1 and 120),
  unique(session_id, device_local_id, operation)
);

create index if not exists field_capture_sessions_user_status_idx
  on public.field_capture_sessions(user_id, status, started_at desc);
create index if not exists field_capture_sessions_project_idx
  on public.field_capture_sessions(project_id, started_at desc) where project_id is not null;
create index if not exists field_capture_items_session_idx
  on public.field_capture_items(session_id, sequence_no);
create index if not exists field_capture_items_status_idx
  on public.field_capture_items(status, updated_at);
create index if not exists field_capture_asset_refs_item_idx
  on public.field_capture_asset_refs(capture_item_id, variant);
create unique index if not exists field_capture_asset_refs_storage_unique
  on public.field_capture_asset_refs(storage_provider, storage_bucket, storage_key)
  where storage_provider is not null and storage_bucket is not null and storage_key is not null;
create index if not exists field_capture_events_session_idx
  on public.field_capture_events(session_id, created_at desc);
create index if not exists field_capture_sync_queue_status_idx
  on public.field_capture_sync_queue(status, next_retry_at);

alter table public.field_capture_schema_meta enable row level security;
alter table public.field_capture_sessions enable row level security;
alter table public.field_capture_items enable row level security;
alter table public.field_capture_asset_refs enable row level security;
alter table public.field_capture_locations enable row level security;
alter table public.field_capture_orientations enable row level security;
alter table public.field_capture_voice_notes enable row level security;
alter table public.field_capture_destinations enable row level security;
alter table public.field_capture_events enable row level security;
alter table public.field_capture_sync_queue enable row level security;

revoke all on public.field_capture_schema_meta from anon, authenticated;
revoke all on public.field_capture_sessions from anon, authenticated;
revoke all on public.field_capture_items from anon, authenticated;
revoke all on public.field_capture_asset_refs from anon, authenticated;
revoke all on public.field_capture_locations from anon, authenticated;
revoke all on public.field_capture_orientations from anon, authenticated;
revoke all on public.field_capture_voice_notes from anon, authenticated;
revoke all on public.field_capture_destinations from anon, authenticated;
revoke all on public.field_capture_events from anon, authenticated;
revoke all on public.field_capture_sync_queue from anon, authenticated;

grant select, insert, update, delete on public.field_capture_schema_meta to service_role;
grant select, insert, update, delete on public.field_capture_sessions to service_role;
grant select, insert, update, delete on public.field_capture_items to service_role;
grant select, insert, update, delete on public.field_capture_asset_refs to service_role;
grant select, insert, update, delete on public.field_capture_locations to service_role;
grant select, insert, update, delete on public.field_capture_orientations to service_role;
grant select, insert, update, delete on public.field_capture_voice_notes to service_role;
grant select, insert, update, delete on public.field_capture_destinations to service_role;
grant select, insert, update, delete on public.field_capture_events to service_role;
grant select, insert, update, delete on public.field_capture_sync_queue to service_role;

insert into public.field_capture_schema_meta (
  component, schema_version, migration_count, bootstrap_id, updated_at
)
values (
  'field-capture-core', '0.1.0', 1, 'field-capture-p7-v010-20260818', now()
)
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = excluded.migration_count,
  bootstrap_id = excluded.bootstrap_id,
  updated_at = now();

comment on table public.field_capture_sessions is 'DIMPRO Terepi Gyorsrögzítő server-side capture session. Direct browser table access is denied.';
comment on table public.field_capture_items is 'Idempotent capture items keyed by session + client_item_id.';
comment on column public.field_capture_asset_refs.blob_id is 'Future shared media/content object reference; P8/P9 binding remains separate.';
comment on table public.field_capture_destinations is 'CAPTURE/DEVICE/USER_DRIVE/PROJECT_DRIVE lifecycle state. USER/PROJECT binding is finalized in later phases.';
comment on table public.field_capture_sync_queue is 'Server-side idempotent sync operation ledger; raw Send/PIN/capability tokens must never be stored here.';
