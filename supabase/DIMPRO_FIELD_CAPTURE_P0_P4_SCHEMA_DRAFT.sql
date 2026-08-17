-- DIMPRO Terepi Gyorsrögzítő PWA · P0-P4 capture schema draft
-- 2026-08-17
-- FONTOS: EZ A FÁJL NEM FUT LE AUTOMATIKUSAN, ÉS A P0-P4 UI BASELINE NEM IGÉNYLI.
-- DEV migráció csak külön adatbázis backup + jogosult migration credential után.
-- A fizikai media/blob ownership P8-P9 előtt még külön Drive/Media audit tárgya.

create extension if not exists pgcrypto;

create table if not exists public.field_capture_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid null,
  context_module_code text not null default 'FIELD_CAPTURE',
  defaults jsonb not null default '{}'::jsonb,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','CLOSED','ARCHIVED')),
  started_at timestamptz not null default now(),
  closed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, client_item_id),
  unique(session_id, sequence_no)
);

create table if not exists public.field_capture_asset_refs (
  id uuid primary key default gen_random_uuid(),
  capture_item_id uuid not null references public.field_capture_items(id) on delete cascade,
  blob_id uuid null,
  variant text not null default 'OPTIMIZED' check (variant in ('ORIGINAL','OPTIMIZED','THUMBNAIL')),
  original_name text null,
  display_name text not null,
  mime_type text not null,
  original_size_bytes bigint null check (original_size_bytes is null or original_size_bytes >= 0),
  stored_size_bytes bigint null check (stored_size_bytes is null or stored_size_bytes >= 0),
  width integer null,
  height integer null,
  checksum_sha256 text null,
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
  latitude double precision null,
  longitude double precision null,
  accuracy_meters double precision null,
  captured_at timestamptz null,
  source text null check (source is null or source in ('browser-geolocation','native-bridge','imported')),
  status text not null default 'OFF' check (status in ('OFF','REQUESTING','READY','UNAVAILABLE','DENIED','LOW_ACCURACY')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.field_capture_orientations (
  id uuid primary key default gen_random_uuid(),
  capture_item_id uuid not null unique references public.field_capture_items(id) on delete cascade,
  enabled boolean not null default false,
  heading_degrees double precision null check (heading_degrees is null or (heading_degrees >= 0 and heading_degrees < 360)),
  heading_accuracy_degrees double precision null,
  direction_label text null check (direction_label is null or direction_label in ('É','ÉK','K','DK','D','DNy','Ny','ÉNy')),
  captured_at timestamptz null,
  source text null check (source is null or source in ('device-orientation','native-sensor','imported')),
  status text not null default 'OFF' check (status in ('OFF','REQUESTING','READY','UNAVAILABLE','DENIED','UNSTABLE')),
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
  folder_id uuid null,
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
  created_at timestamptz not null default now()
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
  updated_at timestamptz not null default now()
);

create index if not exists field_capture_items_session_idx on public.field_capture_items(session_id, sequence_no);
create index if not exists field_capture_events_session_idx on public.field_capture_events(session_id, created_at desc);
create index if not exists field_capture_sync_queue_status_idx on public.field_capture_sync_queue(status, next_retry_at);

comment on table public.field_capture_sessions is 'DIMPRO Terepi Gyorsrögzítő külön capture munkamenet. P0-P4 draft.';
comment on column public.field_capture_asset_refs.blob_id is 'Közös blob/content object hivatkozás; végleges binding csak Media/Drive ownership audit után.';
comment on table public.field_capture_destinations is 'CAPTURE/DEVICE/USER_DRIVE/PROJECT_DRIVE külön lifecycle contract. USER/PROJECT ownership binding P8-P9.';
