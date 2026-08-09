begin;

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
-- DIMPRO Drop access engine
-- DROP 0.2.0 – capability tokens, PIN/IP rate limiting and audit support
-- Apply after 20260731143500_drop_core.sql.
-- No anonymous RLS policy is created. Server-side service-role access is required.

create extension if not exists pgcrypto;

create table if not exists public.drop_access_tokens (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.drop_packages(id) on delete cascade,
  purpose varchar(16) not null check (purpose in ('upload', 'view', 'download', 'report')),
  token_hash varchar(64) not null unique check (char_length(token_hash) = 64),
  token_hint varchar(32) not null,
  status varchar(16) not null default 'active' check (status in ('active', 'revoked', 'expired')),
  expires_at timestamptz not null,
  max_uses integer check (max_uses is null or max_uses >= 1),
  use_count integer not null default 0 check (use_count >= 0),
  last_used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint drop_access_tokens_use_limit check (max_uses is null or use_count <= max_uses)
);

create table if not exists public.drop_access_attempts (
  id uuid primary key default gen_random_uuid(),
  package_id uuid references public.drop_packages(id) on delete cascade,
  access_token_id uuid references public.drop_access_tokens(id) on delete set null,
  attempt_type varchar(16) not null check (attempt_type in ('pin', 'token')),
  purpose varchar(16) check (purpose is null or purpose in ('upload', 'view', 'download', 'report')),
  ip_hash varchar(64) not null check (char_length(ip_hash) = 64),
  token_fingerprint varchar(64) check (token_fingerprint is null or char_length(token_fingerprint) = 64),
  success boolean not null default false,
  failure_code varchar(64),
  user_agent_summary varchar(240),
  created_at timestamptz not null default now()
);

create index if not exists drop_access_tokens_package_purpose_idx
  on public.drop_access_tokens (package_id, purpose, status, expires_at desc);
create index if not exists drop_access_tokens_expiry_idx
  on public.drop_access_tokens (status, expires_at);
create index if not exists drop_access_attempts_ip_created_idx
  on public.drop_access_attempts (ip_hash, created_at desc);
create index if not exists drop_access_attempts_package_ip_created_idx
  on public.drop_access_attempts (package_id, ip_hash, created_at desc)
  where package_id is not null;
create index if not exists drop_access_attempts_token_ip_created_idx
  on public.drop_access_attempts (token_fingerprint, ip_hash, created_at desc)
  where token_fingerprint is not null;
create index if not exists drop_access_attempts_failed_idx
  on public.drop_access_attempts (attempt_type, created_at desc)
  where success = false;

alter table public.drop_access_tokens enable row level security;
alter table public.drop_access_attempts enable row level security;

create or replace function public.drop_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'drop_packages_set_updated_at') then
    create trigger drop_packages_set_updated_at
      before update on public.drop_packages
      for each row execute function public.drop_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'drop_recipients_set_updated_at') then
    create trigger drop_recipients_set_updated_at
      before update on public.drop_recipients
      for each row execute function public.drop_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'drop_groups_set_updated_at') then
    create trigger drop_groups_set_updated_at
      before update on public.drop_groups
      for each row execute function public.drop_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'drop_access_tokens_set_updated_at') then
    create trigger drop_access_tokens_set_updated_at
      before update on public.drop_access_tokens
      for each row execute function public.drop_set_updated_at();
  end if;
end $$;

comment on table public.drop_access_tokens is
  'Hashed DIMPRO Drop capability tokens. Raw upload/view/download/report tokens must never be persisted.';
comment on column public.drop_access_tokens.token_hash is
  'HMAC-SHA256 digest of the raw capability token.';
comment on table public.drop_access_attempts is
  'PIN and token attempt audit used for package-, token- and IP-level rate limiting. Network values are HMAC fingerprints.';
comment on column public.drop_packages.upload_token_hash is
  'Deprecated DROP 0.1.0 compatibility column. DROP 0.2.0 uses drop_access_tokens.';
comment on column public.drop_packages.view_token_hash is
  'Deprecated DROP 0.1.0 compatibility column. DROP 0.2.0 uses drop_access_tokens.';
comment on column public.drop_packages.download_token_hash is
  'Deprecated DROP 0.1.0 compatibility column. DROP 0.2.0 uses drop_access_tokens.';
comment on column public.drop_packages.report_token_hash is
  'Deprecated DROP 0.1.0 compatibility column. DROP 0.2.0 uses drop_access_tokens.';
-- DIMPRO Drop admin lifecycle transaction helpers
-- DROP 0.2.0 – prepared now, applied only during the final Supabase activation.

create or replace function public.drop_transition_package_status(
  p_package_id uuid,
  p_expected_status text,
  p_target_status text,
  p_closed_at timestamptz default null,
  p_expired_at timestamptz default null,
  p_deleted_at timestamptz default null,
  p_event_payload jsonb default '{}'::jsonb
)
returns table (
  package_row jsonb,
  revoked_token_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_package public.drop_packages%rowtype;
  v_allowed boolean := false;
  v_revoked integer := 0;
  v_now timestamptz := now();
begin
  select *
    into v_package
    from public.drop_packages
   where id = p_package_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'DROP_PACKAGE_NOT_FOUND';
  end if;

  if v_package.status <> p_expected_status then
    raise exception using
      errcode = '40001',
      message = 'DROP_PACKAGE_STATUS_CONFLICT';
  end if;

  if p_expected_status = p_target_status then
    return query
    select to_jsonb(v_package), 0;
    return;
  end if;

  v_allowed := case p_expected_status
    when 'draft' then p_target_status in ('preparing', 'active', 'deleting', 'deleted')
    when 'preparing' then p_target_status in ('active', 'failed', 'deleting')
    when 'active' then p_target_status in ('upload_closed', 'expiring', 'reporting', 'deleting', 'failed')
    when 'upload_closed' then p_target_status in ('expiring', 'reporting', 'deleting', 'failed')
    when 'expiring' then p_target_status in ('reporting', 'deleting', 'expired', 'failed')
    when 'reporting' then p_target_status in ('deleting', 'expired', 'failed')
    when 'deleting' then p_target_status in ('deleted', 'failed')
    when 'expired' then p_target_status in ('deleting', 'deleted')
    when 'failed' then p_target_status in ('preparing', 'deleting', 'deleted')
    else false
  end;

  if not v_allowed then
    raise exception using
      errcode = 'P0001',
      message = 'DROP_INVALID_STATUS_TRANSITION';
  end if;

  update public.drop_packages
     set status = p_target_status,
         updated_at = v_now,
         closed_at = case
           when p_target_status = 'upload_closed' then coalesce(p_closed_at, v_now)
           else closed_at
         end,
         expired_at = case
           when p_target_status = 'expired' then coalesce(p_expired_at, v_now)
           else expired_at
         end,
         deleted_at = case
           when p_target_status = 'deleted' then coalesce(p_deleted_at, v_now)
           else deleted_at
         end
   where id = p_package_id
     and status = p_expected_status
  returning * into v_package;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'DROP_PACKAGE_STATUS_CONFLICT';
  end if;

  if p_target_status = 'upload_closed' then
    update public.drop_access_tokens
       set status = 'revoked',
           revoked_at = v_now,
           updated_at = v_now
     where package_id = p_package_id
       and purpose = 'upload'
       and status = 'active';
    get diagnostics v_revoked = row_count;
  elsif p_target_status = 'reporting' then
    update public.drop_access_tokens
       set status = 'revoked',
           revoked_at = v_now,
           updated_at = v_now
     where package_id = p_package_id
       and purpose in ('upload', 'view', 'download')
       and status = 'active';
    get diagnostics v_revoked = row_count;
  elsif p_target_status in ('expiring', 'deleting', 'expired', 'deleted', 'failed') then
    update public.drop_access_tokens
       set status = 'revoked',
           revoked_at = v_now,
           updated_at = v_now
     where package_id = p_package_id
       and status = 'active';
    get diagnostics v_revoked = row_count;
  end if;

  insert into public.drop_events (
    package_id,
    event_type,
    severity,
    payload
  ) values (
    p_package_id,
    'package.status_changed',
    case when p_target_status = 'failed' then 'error' else 'info' end,
    coalesce(p_event_payload, '{}'::jsonb) || jsonb_build_object(
      'from', p_expected_status,
      'to', p_target_status,
      'revokedTokenCount', v_revoked
    )
  );

  return query
  select to_jsonb(v_package), v_revoked;
end;
$$;

revoke all on function public.drop_transition_package_status(
  uuid, text, text, timestamptz, timestamptz, timestamptz, jsonb
) from public;
revoke all on function public.drop_transition_package_status(
  uuid, text, text, timestamptz, timestamptz, timestamptz, jsonb
) from anon;
revoke all on function public.drop_transition_package_status(
  uuid, text, text, timestamptz, timestamptz, timestamptz, jsonb
) from authenticated;
grant execute on function public.drop_transition_package_status(
  uuid, text, text, timestamptz, timestamptz, timestamptz, jsonb
) to service_role;

comment on function public.drop_transition_package_status(
  uuid, text, text, timestamptz, timestamptz, timestamptz, jsonb
) is 'Atomically changes a DIMPRO Drop package status, revokes affected capability tokens and writes the audit event.';
-- DIMPRO Drop token transaction helpers
-- DROP 0.2.0 – prepared now, applied only during the final Supabase activation.

create or replace function public.drop_mark_access_token_used(
  p_token_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token public.drop_access_tokens%rowtype;
  v_now timestamptz := now();
begin
  select *
    into v_token
    from public.drop_access_tokens
   where id = p_token_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'DROP_TOKEN_NOT_FOUND';
  end if;

  if v_token.status <> 'active'
     or v_token.expires_at <= v_now
     or (v_token.max_uses is not null and v_token.use_count >= v_token.max_uses) then
    raise exception using
      errcode = 'P0001',
      message = 'DROP_TOKEN_UNAVAILABLE';
  end if;

  update public.drop_access_tokens
     set use_count = use_count + 1,
         last_used_at = v_now,
         updated_at = v_now
   where id = p_token_id
  returning * into v_token;

  return to_jsonb(v_token);
end;
$$;

create or replace function public.drop_reissue_access_token(
  p_package_id uuid,
  p_purpose text,
  p_token_hash text,
  p_token_hint text,
  p_expires_at timestamptz,
  p_event_payload jsonb default '{}'::jsonb
)
returns table (
  token_row jsonb,
  revoked_token_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_package public.drop_packages%rowtype;
  v_token public.drop_access_tokens%rowtype;
  v_revoked integer := 0;
  v_now timestamptz := now();
begin
  if p_purpose not in ('upload', 'view', 'download', 'report') then
    raise exception using errcode = '22023', message = 'DROP_INVALID_TOKEN_PURPOSE';
  end if;
  if p_token_hash is null or char_length(p_token_hash) <> 64 then
    raise exception using errcode = '22023', message = 'DROP_INVALID_TOKEN_HASH';
  end if;
  if p_token_hint is null or char_length(trim(p_token_hint)) < 4 then
    raise exception using errcode = '22023', message = 'DROP_INVALID_TOKEN_HINT';
  end if;

  select *
    into v_package
    from public.drop_packages
   where id = p_package_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'DROP_PACKAGE_NOT_FOUND';
  end if;

  if v_package.expires_at <= v_now
     or p_expires_at <= v_now
     or p_expires_at > v_package.expires_at then
    raise exception using errcode = '22023', message = 'DROP_INVALID_TOKEN_EXPIRY';
  end if;

  if not (
    v_package.status = 'active'
    or (v_package.status = 'upload_closed' and p_purpose <> 'upload')
    or (v_package.status = 'reporting' and p_purpose = 'report')
  ) then
    raise exception using errcode = 'P0001', message = 'DROP_TOKEN_REISSUE_NOT_ALLOWED';
  end if;

  update public.drop_access_tokens
     set status = 'revoked',
         revoked_at = v_now,
         updated_at = v_now
   where package_id = p_package_id
     and purpose = p_purpose
     and status = 'active';
  get diagnostics v_revoked = row_count;

  insert into public.drop_access_tokens (
    package_id,
    purpose,
    token_hash,
    token_hint,
    status,
    expires_at,
    max_uses,
    metadata
  ) values (
    p_package_id,
    p_purpose,
    p_token_hash,
    trim(p_token_hint),
    'active',
    p_expires_at,
    null,
    jsonb_build_object('source', 'admin_reissue')
  )
  returning * into v_token;

  insert into public.drop_events (
    package_id,
    event_type,
    severity,
    payload
  ) values (
    p_package_id,
    'access.token_reissued',
    'info',
    coalesce(p_event_payload, '{}'::jsonb) || jsonb_build_object(
      'purpose', p_purpose,
      'tokenHint', v_token.token_hint,
      'revokedTokenCount', v_revoked
    )
  );

  return query
  select to_jsonb(v_token), v_revoked;
end;
$$;

create or replace function public.drop_revoke_access_token(
  p_package_id uuid,
  p_token_id uuid,
  p_event_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token public.drop_access_tokens%rowtype;
  v_now timestamptz := now();
begin
  select *
    into v_token
    from public.drop_access_tokens
   where id = p_token_id
     and package_id = p_package_id
   for update;

  if not found or v_token.status <> 'active' then
    raise exception using errcode = 'P0002', message = 'DROP_TOKEN_NOT_ACTIVE';
  end if;

  update public.drop_access_tokens
     set status = 'revoked',
         revoked_at = v_now,
         updated_at = v_now
   where id = p_token_id
  returning * into v_token;

  insert into public.drop_events (
    package_id,
    event_type,
    severity,
    payload
  ) values (
    p_package_id,
    'access.token_revoked',
    'info',
    coalesce(p_event_payload, '{}'::jsonb) || jsonb_build_object(
      'tokenId', v_token.id,
      'purpose', v_token.purpose,
      'tokenHint', v_token.token_hint
    )
  );

  return to_jsonb(v_token);
end;
$$;

revoke all on function public.drop_mark_access_token_used(uuid) from public;
revoke all on function public.drop_mark_access_token_used(uuid) from anon;
revoke all on function public.drop_mark_access_token_used(uuid) from authenticated;
grant execute on function public.drop_mark_access_token_used(uuid) to service_role;

revoke all on function public.drop_reissue_access_token(uuid, text, text, text, timestamptz, jsonb) from public;
revoke all on function public.drop_reissue_access_token(uuid, text, text, text, timestamptz, jsonb) from anon;
revoke all on function public.drop_reissue_access_token(uuid, text, text, text, timestamptz, jsonb) from authenticated;
grant execute on function public.drop_reissue_access_token(uuid, text, text, text, timestamptz, jsonb) to service_role;

revoke all on function public.drop_revoke_access_token(uuid, uuid, jsonb) from public;
revoke all on function public.drop_revoke_access_token(uuid, uuid, jsonb) from anon;
revoke all on function public.drop_revoke_access_token(uuid, uuid, jsonb) from authenticated;
grant execute on function public.drop_revoke_access_token(uuid, uuid, jsonb) to service_role;

comment on function public.drop_mark_access_token_used(uuid) is
  'Atomically checks availability and increments a DIMPRO Drop capability-token use counter.';
comment on function public.drop_reissue_access_token(uuid, text, text, text, timestamptz, jsonb) is
  'Atomically revokes the previous purpose token, inserts the replacement hash and writes an audit event.';
comment on function public.drop_revoke_access_token(uuid, uuid, jsonb) is
  'Atomically revokes one active DIMPRO Drop capability token and writes an audit event.';
-- DIMPRO Drop atomic package creation
-- DROP 0.2.0 – prepared now, applied only during the final Supabase activation.

create or replace function public.drop_create_package_atomic(
  p_package jsonb,
  p_recipients jsonb default '[]'::jsonb,
  p_groups jsonb default '[]'::jsonb,
  p_tokens jsonb default '[]'::jsonb,
  p_event_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_package public.drop_packages%rowtype;
  v_token_count integer;
  v_purpose_count integer;
begin
  if coalesce(jsonb_typeof(p_package), 'null') <> 'object' then
    raise exception using errcode = '22023', message = 'DROP_INVALID_PACKAGE_PAYLOAD';
  end if;
  if jsonb_typeof(coalesce(p_recipients, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_groups, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_tokens, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'DROP_INVALID_PACKAGE_COLLECTIONS';
  end if;

  if p_package ? 'pin'
     or p_package ? 'rawPin'
     or p_package ? 'rawTokens'
     or p_package ? 'links' then
    raise exception using errcode = '22023', message = 'DROP_RAW_CREDENTIAL_REJECTED';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(coalesce(p_tokens, '[]'::jsonb)) token_value
     where token_value ? 'rawToken'
        or token_value ? 'raw_token'
        or token_value ? 'link'
  ) then
    raise exception using errcode = '22023', message = 'DROP_RAW_CREDENTIAL_REJECTED';
  end if;

  v_token_count := jsonb_array_length(coalesce(p_tokens, '[]'::jsonb));
  select count(distinct token_value->>'purpose')
    into v_purpose_count
    from jsonb_array_elements(coalesce(p_tokens, '[]'::jsonb)) token_value
   where token_value->>'purpose' in ('upload', 'view', 'download', 'report');

  if v_token_count <> 4 or v_purpose_count <> 4 then
    raise exception using errcode = '22023', message = 'DROP_CAPABILITY_SET_INCOMPLETE';
  end if;

  insert into public.drop_packages (
    public_code,
    mode,
    title,
    description,
    project_id,
    project_name_snapshot,
    owner_user_id,
    organization_id,
    created_by_user_id,
    uploader_name,
    uploader_email,
    status,
    access_policy,
    upload_opens_at,
    upload_closes_at,
    expires_at,
    grace_expires_at,
    retention_days,
    pin_hash,
    pin_salt,
    max_file_count,
    max_file_size_bytes,
    max_total_size_bytes
  ) values (
    trim(p_package->>'public_code'),
    trim(p_package->>'mode'),
    trim(p_package->>'title'),
    coalesce(p_package->>'description', ''),
    nullif(trim(p_package->>'project_id'), ''),
    nullif(trim(p_package->>'project_name_snapshot'), ''),
    nullif(trim(p_package->>'owner_user_id'), ''),
    nullif(trim(p_package->>'organization_id'), ''),
    nullif(trim(p_package->>'created_by_user_id'), ''),
    coalesce(trim(p_package->>'uploader_name'), ''),
    lower(coalesce(trim(p_package->>'uploader_email'), '')),
    'active',
    'token_pin',
    (p_package->>'upload_opens_at')::timestamptz,
    (p_package->>'upload_closes_at')::timestamptz,
    (p_package->>'expires_at')::timestamptz,
    (p_package->>'grace_expires_at')::timestamptz,
    (p_package->>'retention_days')::integer,
    p_package->>'pin_hash',
    p_package->>'pin_salt',
    (p_package->>'max_file_count')::integer,
    (p_package->>'max_file_size_bytes')::bigint,
    (p_package->>'max_total_size_bytes')::bigint
  )
  returning * into v_package;

  insert into public.drop_recipients (
    package_id,
    name,
    email,
    company,
    role,
    receive_invitation,
    receive_activity_notifications,
    receive_final_report
  )
  select
    v_package.id,
    trim(recipient.name),
    lower(trim(recipient.email)),
    nullif(trim(recipient.company), ''),
    coalesce(nullif(trim(recipient.role), ''), 'invitee'),
    coalesce(recipient.receive_invitation, true),
    coalesce(recipient.receive_activity_notifications, true),
    coalesce(recipient.receive_final_report, true)
  from jsonb_to_recordset(coalesce(p_recipients, '[]'::jsonb)) as recipient(
    name text,
    email text,
    company text,
    role text,
    receive_invitation boolean,
    receive_activity_notifications boolean,
    receive_final_report boolean
  );

  insert into public.drop_groups (
    package_id,
    name,
    code,
    description,
    sort_order,
    file_name_prefix,
    sequence_start
  )
  select
    v_package.id,
    trim(group_row.name),
    trim(group_row.code),
    nullif(trim(group_row.description), ''),
    coalesce(group_row.sort_order, 0),
    nullif(trim(group_row.file_name_prefix), ''),
    coalesce(group_row.sequence_start, 1)
  from jsonb_to_recordset(coalesce(p_groups, '[]'::jsonb)) as group_row(
    name text,
    code text,
    description text,
    sort_order integer,
    file_name_prefix text,
    sequence_start integer
  );

  insert into public.drop_access_tokens (
    package_id,
    purpose,
    token_hash,
    token_hint,
    status,
    expires_at,
    max_uses,
    metadata
  )
  select
    v_package.id,
    trim(token_row.purpose),
    trim(token_row.token_hash),
    trim(token_row.token_hint),
    'active',
    token_row.expires_at,
    null,
    jsonb_build_object('source', 'package_creation')
  from jsonb_to_recordset(p_tokens) as token_row(
    purpose text,
    token_hash text,
    token_hint text,
    expires_at timestamptz
  );

  insert into public.drop_events (
    package_id,
    event_type,
    severity,
    actor_name,
    actor_email,
    payload
  ) values (
    v_package.id,
    'package.created',
    'info',
    nullif(trim(p_event_payload->>'actorName'), ''),
    nullif(lower(trim(p_event_payload->>'actorEmail')), ''),
    coalesce(p_event_payload, '{}'::jsonb) || jsonb_build_object(
      'publicCode', v_package.public_code,
      'mode', v_package.mode,
      'recipientCount', jsonb_array_length(coalesce(p_recipients, '[]'::jsonb)),
      'groupCount', jsonb_array_length(coalesce(p_groups, '[]'::jsonb)),
      'uploadEnabled', false
    )
  );

  return to_jsonb(v_package);
end;
$$;

revoke all on function public.drop_create_package_atomic(jsonb, jsonb, jsonb, jsonb, jsonb) from public;
revoke all on function public.drop_create_package_atomic(jsonb, jsonb, jsonb, jsonb, jsonb) from anon;
revoke all on function public.drop_create_package_atomic(jsonb, jsonb, jsonb, jsonb, jsonb) from authenticated;
grant execute on function public.drop_create_package_atomic(jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;

comment on function public.drop_create_package_atomic(jsonb, jsonb, jsonb, jsonb, jsonb) is
  'Atomically creates DIMPRO Drop package metadata, recipients, groups, four hashed capability tokens and the audit event. Raw credentials are rejected.';
-- DIMPRO Drop schema-version marker
-- DROP 0.2.0 – this must be the final statement group of the bootstrap activation.

create table if not exists public.drop_schema_meta (
  component text primary key,
  schema_version text not null,
  migration_count integer not null check (migration_count >= 1),
  bootstrap_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.drop_schema_meta enable row level security;

insert into public.drop_schema_meta (
  component,
  schema_version,
  migration_count,
  bootstrap_id,
  metadata,
  installed_at,
  updated_at
) values (
  'drop-core',
  'DROP 0.2.0',
  6,
  'drop-020-atomic-package-engine-20260801',
  jsonb_build_object(
    'packageCreation', 'atomic',
    'statusTransition', 'atomic',
    'tokenUseCounter', 'atomic',
    'tokenReissue', 'atomic',
    'tokenRevoke', 'atomic',
    'rawCredentialsPersisted', false,
    'fileUploadEnabled', false
  ),
  now(),
  now()
)
on conflict (component) do update
set schema_version = excluded.schema_version,
    migration_count = excluded.migration_count,
    bootstrap_id = excluded.bootstrap_id,
    metadata = excluded.metadata,
    installed_at = excluded.installed_at,
    updated_at = excluded.updated_at;

comment on table public.drop_schema_meta is
  'Server-only DIMPRO Drop schema readiness marker. The application must reject package-engine activation when the expected version row is missing or mismatched.';

commit;
