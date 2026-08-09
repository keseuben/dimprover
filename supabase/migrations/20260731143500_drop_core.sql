-- DIMPRO Drop core metadata schema
-- DROP 0.1.0 – shell and database foundation
-- The public client receives no table policy in this migration. Server-side service-role access is required.

create extension if not exists pgcrypto;

create table if not exists public.drop_packages (
  id uuid primary key default gen_random_uuid(),
  public_code varchar(40) not null unique,
  mode varchar(16) not null check (mode in ('image', 'file', 'zip', 'mixed')),
  title text not null,
  description text not null default '',
  project_id text,
  project_name_snapshot text,
  owner_user_id text,
  organization_id text,
  created_by_user_id text,
  uploader_name text not null default '',
  uploader_email text not null default '',
  status varchar(24) not null default 'draft' check (status in (
    'draft', 'preparing', 'active', 'upload_closed', 'expiring',
    'reporting', 'deleting', 'expired', 'deleted', 'failed'
  )),
  access_policy varchar(16) not null default 'token_pin' check (access_policy in ('token_pin', 'token_only', 'account')),
  upload_opens_at timestamptz,
  upload_closes_at timestamptz,
  expires_at timestamptz not null,
  grace_expires_at timestamptz not null,
  retention_days integer not null default 7 check (retention_days between 1 and 365),
  pin_hash text,
  pin_salt text,
  upload_token_hash text,
  view_token_hash text,
  download_token_hash text,
  report_token_hash text,
  max_file_count integer not null default 500 check (max_file_count between 1 and 10000),
  max_file_size_bytes bigint not null default 262144000 check (max_file_size_bytes > 0),
  max_total_size_bytes bigint not null default 2147483648 check (max_total_size_bytes > 0),
  current_file_count integer not null default 0 check (current_file_count >= 0),
  current_total_size_bytes bigint not null default 0 check (current_total_size_bytes >= 0),
  notify_on_first_open boolean not null default true,
  notify_on_download boolean not null default true,
  notify_on_comment boolean not null default true,
  notify_on_upload_complete boolean not null default true,
  send_final_report_to_uploader boolean not null default true,
  send_final_report_to_invitees boolean not null default true,
  zip_status varchar(24) not null default 'not_requested',
  final_report_status varchar(24) not null default 'not_requested',
  delete_status varchar(24) not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  expired_at timestamptz,
  deleted_at timestamptz,
  constraint drop_packages_expiry_order check (grace_expires_at >= expires_at),
  constraint drop_packages_size_counters check (current_total_size_bytes <= max_total_size_bytes),
  constraint drop_packages_file_counters check (current_file_count <= max_file_count)
);

create table if not exists public.drop_recipients (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.drop_packages(id) on delete cascade,
  name text not null,
  email text not null,
  company text,
  role varchar(16) not null default 'invitee' check (role in ('uploader', 'invitee', 'viewer', 'commenter')),
  receive_invitation boolean not null default true,
  receive_activity_notifications boolean not null default true,
  receive_final_report boolean not null default true,
  invitation_sent_at timestamptz,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  first_downloaded_at timestamptz,
  last_downloaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, email)
);

create table if not exists public.drop_groups (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.drop_packages(id) on delete cascade,
  name text not null,
  code text not null,
  description text,
  sort_order integer not null default 0,
  file_name_prefix text,
  sequence_start integer not null default 1 check (sequence_start >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, code)
);

create table if not exists public.drop_files (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.drop_packages(id) on delete cascade,
  group_id uuid references public.drop_groups(id) on delete set null,
  original_name text not null,
  display_name text not null,
  generated_name text not null,
  extension text not null default '',
  mime_type text not null default 'application/octet-stream',
  detected_mime_type text,
  size_original_bytes bigint not null default 0 check (size_original_bytes >= 0),
  size_stored_bytes bigint not null default 0 check (size_stored_bytes >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_seconds numeric check (duration_seconds is null or duration_seconds >= 0),
  captured_at timestamptz,
  storage_provider text not null default '',
  storage_bucket text not null default '',
  storage_key text not null,
  thumbnail_storage_key text,
  preview_storage_key text,
  sha256 text,
  upload_status varchar(20) not null default 'queued' check (upload_status in (
    'queued', 'uploading', 'uploaded', 'processing', 'ready', 'failed', 'deleted'
  )),
  processing_status varchar(24) not null default 'not_started',
  virus_scan_status varchar(24) not null default 'pending',
  zip_scan_status varchar(24) not null default 'not_applicable',
  sequence_number integer,
  sort_order integer not null default 0,
  is_image boolean not null default false,
  is_zip boolean not null default false,
  is_report_selected boolean not null default true,
  uploaded_by_recipient_id uuid references public.drop_recipients(id) on delete set null,
  uploaded_by_name text,
  uploaded_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (storage_bucket, storage_key)
);

create table if not exists public.drop_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.drop_packages(id) on delete cascade,
  file_id uuid references public.drop_files(id) on delete cascade,
  client_upload_id text not null,
  status varchar(24) not null default 'initialized',
  total_bytes bigint not null check (total_bytes >= 0),
  uploaded_bytes bigint not null default 0 check (uploaded_bytes >= 0),
  chunk_size_bytes integer not null check (chunk_size_bytes > 0),
  total_parts integer not null check (total_parts >= 1),
  completed_parts integer not null default 0 check (completed_parts >= 0),
  storage_multipart_id text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (package_id, client_upload_id),
  constraint drop_upload_session_bytes check (uploaded_bytes <= total_bytes),
  constraint drop_upload_session_parts check (completed_parts <= total_parts)
);

create table if not exists public.drop_upload_parts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.drop_upload_sessions(id) on delete cascade,
  part_number integer not null check (part_number >= 1),
  size_bytes integer not null check (size_bytes >= 0),
  etag text,
  checksum text,
  status varchar(24) not null default 'pending',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (session_id, part_number)
);

create table if not exists public.drop_comments (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.drop_packages(id) on delete cascade,
  file_id uuid references public.drop_files(id) on delete cascade,
  parent_comment_id uuid references public.drop_comments(id) on delete set null,
  author_recipient_id uuid references public.drop_recipients(id) on delete set null,
  author_user_id text,
  author_name text not null,
  author_email text,
  comment_text text not null check (char_length(comment_text) between 1 and 10000),
  status varchar(16) not null default 'active' check (status in ('active', 'edited', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.drop_events (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.drop_packages(id) on delete cascade,
  file_id uuid references public.drop_files(id) on delete set null,
  recipient_id uuid references public.drop_recipients(id) on delete set null,
  event_type varchar(64) not null,
  severity varchar(16) not null default 'info' check (severity in ('info', 'warning', 'error', 'critical')),
  actor_name text,
  actor_email text,
  ip_hash text,
  ip_encrypted text,
  user_agent_summary text,
  session_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.drop_downloads (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.drop_packages(id) on delete cascade,
  file_id uuid references public.drop_files(id) on delete set null,
  recipient_id uuid references public.drop_recipients(id) on delete set null,
  download_type varchar(20) not null check (download_type in ('file', 'group_zip', 'package_zip', 'report')),
  download_token_hash text not null,
  status varchar(24) not null default 'initialized',
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null
);

create table if not exists public.drop_reports (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.drop_packages(id) on delete cascade,
  report_type varchar(16) not null check (report_type in ('final', 'manual', 'comments')),
  status varchar(24) not null default 'queued',
  storage_key text,
  page_count integer check (page_count is null or page_count >= 0),
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  generated_at timestamptz,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drop_jobs (
  id uuid primary key default gen_random_uuid(),
  package_id uuid references public.drop_packages(id) on delete cascade,
  job_type varchar(48) not null check (job_type in (
    'create_thumbnails', 'create_package_zip', 'create_group_zip',
    'send_invitation', 'send_activity_email', 'send_expiry_warning',
    'generate_final_report', 'send_final_report', 'delete_package_objects',
    'cleanup_upload_session'
  )),
  status varchar(16) not null default 'queued' check (status in ('queued', 'running', 'retry', 'completed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint drop_jobs_attempt_limit check (attempt_count <= max_attempts)
);

create table if not exists public.drop_email_log (
  id uuid primary key default gen_random_uuid(),
  package_id uuid references public.drop_packages(id) on delete set null,
  recipient_email text not null,
  email_type text not null,
  provider_message_id text,
  status varchar(24) not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists drop_packages_status_expires_idx on public.drop_packages (status, expires_at);
create index if not exists drop_packages_project_idx on public.drop_packages (project_id, created_at desc);
create index if not exists drop_recipients_package_idx on public.drop_recipients (package_id, created_at);
create index if not exists drop_groups_package_sort_idx on public.drop_groups (package_id, sort_order);
create index if not exists drop_files_package_sort_idx on public.drop_files (package_id, group_id, sort_order);
create index if not exists drop_files_upload_status_idx on public.drop_files (upload_status, created_at);
create index if not exists drop_upload_sessions_status_idx on public.drop_upload_sessions (status, expires_at);
create index if not exists drop_comments_package_created_idx on public.drop_comments (package_id, created_at);
create index if not exists drop_events_package_created_idx on public.drop_events (package_id, created_at desc);
create index if not exists drop_downloads_package_started_idx on public.drop_downloads (package_id, started_at desc);
create index if not exists drop_reports_package_created_idx on public.drop_reports (package_id, created_at desc);
create index if not exists drop_jobs_due_idx on public.drop_jobs (status, run_after, created_at);
create index if not exists drop_email_log_package_created_idx on public.drop_email_log (package_id, created_at desc);

alter table public.drop_packages enable row level security;
alter table public.drop_recipients enable row level security;
alter table public.drop_groups enable row level security;
alter table public.drop_files enable row level security;
alter table public.drop_upload_sessions enable row level security;
alter table public.drop_upload_parts enable row level security;
alter table public.drop_comments enable row level security;
alter table public.drop_events enable row level security;
alter table public.drop_downloads enable row level security;
alter table public.drop_reports enable row level security;
alter table public.drop_jobs enable row level security;
alter table public.drop_email_log enable row level security;

comment on table public.drop_packages is 'DIMPRO Drop package metadata. No anonymous insert/update policy is intentionally created.';
comment on table public.drop_jobs is 'Background jobs for ZIP, PDF, e-mail, expiry and deletion workflows.';
comment on table public.drop_events is 'Security and activity audit events with minimized network metadata.';
