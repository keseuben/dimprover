-- DIMPRO Drive V0.9.57 SOURCE ONLY.
-- Do not apply automatically. This is the personal USER-owned large-file session
-- foundation; existing PROJECT upload tables must never store personal sessions.
begin;

do $$
begin
  if to_regclass('public.dimpro_users') is null
    or to_regclass('public.dimpro_content_refs') is null
    or to_regclass('public.dimpro_content_objects') is null
    or to_regclass('public.dimpro_personal_drive_storage_limits') is null
    or to_regclass('public.dimpro_content_personal_folders') is null then
    raise exception 'PERSONAL_MULTIPART_CONTENT_CORE_NOT_READY' using errcode = 'P0001';
  end if;
end $$;

create table if not exists public.dimpro_personal_drive_multipart_schema_meta (
  component text primary key,
  schema_version text not null,
  bootstrap_id text not null,
  applied_at timestamptz not null default now()
);
alter table public.dimpro_personal_drive_multipart_schema_meta enable row level security;
revoke all on public.dimpro_personal_drive_multipart_schema_meta from public, anon, authenticated;
grant select, insert, update on public.dimpro_personal_drive_multipart_schema_meta to service_role;
insert into public.dimpro_personal_drive_multipart_schema_meta(component,schema_version,bootstrap_id)
values('personal-drive-multipart','0.1.0','personal-drive-multipart-v010-20261023')
on conflict (component) do update set
  schema_version = excluded.schema_version,
  bootstrap_id = excluded.bootstrap_id,
  applied_at = now();

create table if not exists public.dimpro_personal_drive_multipart_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.dimpro_users(id) on delete restrict,
  request_id uuid not null,
  folder_id uuid null,
  file_name text not null check (length(btrim(file_name)) between 1 and 180),
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes > 104857600 and size_bytes <= 5368709120),
  expected_sha256 text not null check (expected_sha256 ~ '^[0-9a-f]{64}$'),
  chunk_size_bytes bigint not null check (chunk_size_bytes between 5242880 and 536870912),
  total_parts integer not null check (total_parts between 1 and 10000),
  storage_bucket text not null check (length(btrim(storage_bucket)) between 1 and 255),
  storage_key text not null check (length(btrim(storage_key)) between 1 and 1024),
  storage_upload_id text null,
  part_manifest jsonb not null default '[]'::jsonb check (jsonb_typeof(part_manifest) = 'array'),
  status text not null default 'INITIATED'
    check (status in ('INITIATED','UPLOADING','QUARANTINED','SCANNING','CLEAN','REJECTED','ABORTED','EXPIRED')),
  result_content_ref_id uuid null references public.dimpro_content_refs(id) on delete restrict,
  state_version bigint not null default 1 check (state_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  finalized_at timestamptz null,
  constraint dimpro_personal_multipart_folder_owner_fk
    foreign key (owner_user_id,folder_id)
    references public.dimpro_content_personal_folders(owner_user_id,id)
    on delete restrict,
  constraint dimpro_personal_multipart_owner_request_uniq unique (owner_user_id, request_id),
  constraint dimpro_personal_multipart_storage_uniq unique (storage_bucket, storage_key),
  constraint dimpro_personal_multipart_parts_consistent
    check (total_parts = ((size_bytes + chunk_size_bytes - 1) / chunk_size_bytes)),
  constraint dimpro_personal_multipart_expiry_check check (expires_at > created_at)
);

create index if not exists dimpro_personal_multipart_owner_active_idx
  on public.dimpro_personal_drive_multipart_sessions(owner_user_id, status, expires_at)
  where status in ('INITIATED','UPLOADING','QUARANTINED','SCANNING');
create index if not exists dimpro_personal_multipart_cleanup_idx
  on public.dimpro_personal_drive_multipart_sessions(expires_at)
  where status in ('INITIATED','UPLOADING');

alter table public.dimpro_personal_drive_multipart_sessions enable row level security;
revoke all on public.dimpro_personal_drive_multipart_sessions from public, anon, authenticated;
grant select, insert, update on public.dimpro_personal_drive_multipart_sessions to service_role;

-- The existing personal quota RPC uses the same advisory key.
-- Active and quarantined uploads reserve capacity; quarantined bytes remain
-- reserved beyond the upload-session expiry until explicit reviewed cleanup.
create or replace function public.dimpro_personal_multipart_create_atomic(
  p_owner_user_id uuid,
  p_request_id uuid,
  p_session jsonb,
  p_default_quota_bytes bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.dimpro_personal_drive_multipart_sessions%rowtype;
  v_result public.dimpro_personal_drive_multipart_sessions%rowtype;
  v_size bigint := coalesce((p_session->>'size_bytes')::bigint,0);
  v_quota bigint;
  v_hard_limit boolean;
  v_used bigint := 0;
  v_reserved bigint := 0;
  v_folder uuid;
begin
  if p_owner_user_id is null or p_request_id is null
     or p_default_quota_bytes < 1 or v_size <= 104857600 or v_size > 5368709120 then
    raise exception 'PERSONAL_MULTIPART_INPUT_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('personal-drive-quota:' || p_owner_user_id::text, 0));
  if not exists(select 1 from public.dimpro_users where id=p_owner_user_id) then
    raise exception 'PERSONAL_MULTIPART_OWNER_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_existing from public.dimpro_personal_drive_multipart_sessions
    where owner_user_id=p_owner_user_id and request_id=p_request_id;
  if found then
    if v_existing.size_bytes <> v_size
       or v_existing.expected_sha256 <> p_session->>'expected_sha256'
       or v_existing.storage_key <> p_session->>'storage_key' then
      raise exception 'PERSONAL_MULTIPART_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    return to_jsonb(v_existing);
  end if;
  if coalesce(p_session->>'status','INITIATED') <> 'INITIATED'
     or coalesce(p_session->>'expected_sha256','') !~ '^[a-f0-9]{64}$'
     or coalesce((p_session->>'chunk_size_bytes')::bigint,0) not between 5242880 and 536870912
     or coalesce((p_session->>'total_parts')::integer,0) <> ((v_size + greatest(1,coalesce((p_session->>'chunk_size_bytes')::bigint,0)) - 1) / greatest(1,coalesce((p_session->>'chunk_size_bytes')::bigint,0)))
     or coalesce((p_session->>'expires_at')::timestamptz,now()-interval '1 day') > now() + interval '24 hours 5 minutes'
     or coalesce((p_session->>'expires_at')::timestamptz,now()-interval '1 day') <= now()
     or length(btrim(coalesce(p_session->>'file_name',''))) not between 1 and 180
     or length(btrim(coalesce(p_session->>'storage_bucket',''))) not between 1 and 255
     or length(btrim(coalesce(p_session->>'storage_key',''))) not between 1 and 1024
     or left(coalesce(p_session->>'storage_key',''),
       length('users/' || p_owner_user_id::text || '/multipart/'))
       <> 'users/' || p_owner_user_id::text || '/multipart/'
     or length(btrim(coalesce(p_session->>'mime_type','application/octet-stream'))) not between 1 and 255
     then
    raise exception 'PERSONAL_MULTIPART_METADATA_INVALID' using errcode = '22023';
  end if;

  v_folder := nullif(p_session->>'folder_id','')::uuid;
  if v_folder is not null and not exists (
    select 1 from public.dimpro_content_personal_folders
    where id = v_folder and owner_user_id = p_owner_user_id and status = 'ACTIVE'
  ) then
    raise exception 'PERSONAL_MULTIPART_FOLDER_NOT_OWNED' using errcode = 'P0002';
  end if;

  select coalesce(quota_bytes,p_default_quota_bytes), coalesce(hard_limit,true)
    into v_quota, v_hard_limit
    from public.dimpro_personal_drive_storage_limits where owner_user_id=p_owner_user_id;
  v_quota := coalesce(v_quota,p_default_quota_bytes);
  v_hard_limit := coalesce(v_hard_limit,true);

  -- One USER-owned storage object is counted only once even with many refs.
  select coalesce(sum(o.size_bytes),0) into v_used
    from public.dimpro_content_objects o
   where o.status='ACTIVE' and exists (
     select 1 from public.dimpro_content_refs r
     where r.content_object_id=o.id and r.owner_type='USER'
       and r.owner_user_id=p_owner_user_id and r.status in ('ACTIVE','REMOVED')
   );

  -- Expired multipart sessions are excluded from reservation only after
  -- an explicit cleanup/reconciliation. Do not silently free orphaned S3 data.
  select coalesce(sum(size_bytes),0) into v_reserved
    from public.dimpro_personal_drive_multipart_sessions
    where owner_user_id=p_owner_user_id
      and status in ('INITIATED','UPLOADING','QUARANTINED','SCANNING');

  if v_hard_limit and v_used + v_reserved + v_size > v_quota then
    raise exception 'PERSONAL_DRIVE_QUOTA_EXCEEDED' using errcode='P0001';
  end if;

  insert into public.dimpro_personal_drive_multipart_sessions(
    id, owner_user_id, request_id, folder_id, file_name, mime_type,
    size_bytes, expected_sha256, chunk_size_bytes, total_parts,
    storage_bucket, storage_key, status, expires_at
  ) values (
    (p_session->>'id')::uuid, p_owner_user_id, p_request_id, v_folder,
    p_session->>'file_name', coalesce(nullif(p_session->>'mime_type',''),'application/octet-stream'),
    v_size, p_session->>'expected_sha256', (p_session->>'chunk_size_bytes')::bigint,
    (p_session->>'total_parts')::integer, p_session->>'storage_bucket',
    p_session->>'storage_key', 'INITIATED', (p_session->>'expires_at')::timestamptz
  ) returning * into v_result;
  return to_jsonb(v_result);
end;
$$;

revoke all on function public.dimpro_personal_multipart_create_atomic(uuid,uuid,jsonb,bigint)
  from public, anon, authenticated;
grant execute on function public.dimpro_personal_multipart_create_atomic(uuid,uuid,jsonb,bigint)
  to service_role;

-- Intentionally no SQL function for CLEAN yet. The scan worker must be
-- separately audited and full-object AV+SHA verified before activation.
comment on table public.dimpro_personal_drive_multipart_sessions is
  'DEV source-only reservation/session foundation. Completion means QUARANTINED, never implicit CLEAN. Requires a separate verified full-file malware scanner and release gate.';

commit;
