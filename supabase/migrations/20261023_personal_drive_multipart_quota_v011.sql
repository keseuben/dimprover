-- DIMPRO Drive V0.9.59: SOURCE ONLY / NOT APPLIED TO DEV OR PROD.
-- Apply only after v010 has been verified on a disposable PostgreSQL instance.
-- All quota-changing USER workflows use one owner-scoped advisory lock.
begin;
do $$
begin
  if to_regclass('public.dimpro_personal_drive_multipart_sessions') is null
    or to_regclass('public.dimpro_personal_drive_multipart_schema_meta') is null
    or to_regclass('public.dimpro_personal_drive_storage_limits') is null
    or to_regclass('public.dimpro_content_objects') is null
    or to_regclass('public.dimpro_content_refs') is null then
    raise exception 'PERSONAL_MULTIPART_V011_BASE_SCHEMA_MISSING' using errcode='P0001';
  end if;
  if not exists (
    select 1 from public.dimpro_personal_drive_multipart_schema_meta
    where component='personal-drive-multipart'
      and schema_version='0.1.0'
      and bootstrap_id='personal-drive-multipart-v010-20261023'
  ) then
    raise exception 'PERSONAL_MULTIPART_V011_BASE_MARKER_MISSING' using errcode='P0001';
  end if;
end $$;

-- Replace the old USER ref quota guard; it previously ignored multipart
-- reservations, even though multipart INIT already counted existing files.
create or replace function public.dimpro_personal_drive_ensure_ref_atomic(
  p_content_object_id uuid,
  p_owner_user_id uuid,
  p_source_system text,
  p_source_ref text,
  p_display_name text,
  p_default_quota_bytes bigint
) returns public.dimpro_content_refs
language plpgsql
security definer
set search_path=public
as $$
declare
  v_existing public.dimpro_content_refs;
  v_result public.dimpro_content_refs;
  v_object public.dimpro_content_objects;
  v_quota_bytes bigint;
  v_hard_limit boolean;
  v_used_bytes bigint;
  v_reserved_bytes bigint;
  v_increment_bytes bigint;
begin
  if p_owner_user_id is null then
    raise exception 'PERSONAL_DRIVE_OWNER_REQUIRED' using errcode='22023';
  end if;
  if p_default_quota_bytes is null or p_default_quota_bytes <= 0 then
    raise exception 'PERSONAL_DRIVE_DEFAULT_QUOTA_REQUIRED' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('personal-drive-quota:' || p_owner_user_id::text, 0));

  select * into v_existing
  from public.dimpro_content_refs
  where owner_type='USER'
    and owner_user_id=p_owner_user_id
    and source_system=p_source_system
    and source_ref=p_source_ref
  limit 1
  for update;

  if v_existing.id is not null then
    if v_existing.content_object_id <> p_content_object_id then
      raise exception 'CONTENT_CORE_USER_REF_OBJECT_MISMATCH' using errcode='23505';
    end if;
    if v_existing.status='REMOVED' then
      update public.dimpro_content_refs
      set status='ACTIVE', display_name=p_display_name, updated_at=now()
      where id=v_existing.id
      returning * into v_result;
      return v_result;
    end if;
    return v_existing;
  end if;

  select * into v_object
  from public.dimpro_content_objects
  where id=p_content_object_id and status='ACTIVE'
  for share;
  if v_object.id is null then
    raise exception 'PERSONAL_DRIVE_CONTENT_OBJECT_NOT_FOUND' using errcode='P0002';
  end if;

  select coalesce(limit_row.quota_bytes,p_default_quota_bytes),
         coalesce(limit_row.hard_limit,true)
  into v_quota_bytes,v_hard_limit
  from (select 1) seed
  left join public.dimpro_personal_drive_storage_limits limit_row
    on limit_row.owner_user_id=p_owner_user_id;

  select coalesce(sum(obj.size_bytes),0)::bigint into v_used_bytes
  from public.dimpro_content_objects obj
  join (
    select distinct ref.content_object_id
    from public.dimpro_content_refs ref
    where ref.owner_type='USER'
      and ref.owner_user_id=p_owner_user_id
      and ref.status in ('ACTIVE','REMOVED')
  ) owned on owned.content_object_id=obj.id
  where obj.status='ACTIVE';

  select case when exists (
    select 1 from public.dimpro_content_refs ref
    where ref.owner_type='USER'
      and ref.owner_user_id=p_owner_user_id
      and ref.content_object_id=p_content_object_id
      and ref.status in ('ACTIVE','REMOVED')
  ) then 0 else v_object.size_bytes end
  into v_increment_bytes;

  -- Other USER uploads reserve the same quota under the same advisory lock.
  -- A full-object scan must be completed before a multipart reservation is
  -- transferred atomically into a CLEAN Content Core ref in a future release.
  select coalesce(sum(session.size_bytes),0)::bigint into v_reserved_bytes
  from public.dimpro_personal_drive_multipart_sessions session
  where session.owner_user_id=p_owner_user_id
    and session.status in ('INITIATED','UPLOADING','ABORTING','COMPLETING','QUARANTINED','SCANNING');

  if v_hard_limit and v_used_bytes + v_reserved_bytes + v_increment_bytes > v_quota_bytes then
    raise exception 'PERSONAL_DRIVE_QUOTA_EXCEEDED'
      using errcode='53100',
            detail=jsonb_build_object(
              'quotaBytes',v_quota_bytes,
              'usedBytes',v_used_bytes,
              'reservedBytes',v_reserved_bytes,
              'requestedBytes',v_increment_bytes
            )::text;
  end if;

  insert into public.dimpro_content_refs(
    content_object_id,owner_type,owner_user_id,owner_project_id,folder_id,
    source_system,source_ref,display_name,retained_independently,status,
    created_by_user_id,created_at,updated_at
  ) values (
    p_content_object_id,'USER',p_owner_user_id,null,null,
    p_source_system,p_source_ref,p_display_name,true,'ACTIVE',
    p_owner_user_id,now(),now()
  ) returning * into v_result;

  return v_result;
end;
$$;


revoke all on function public.dimpro_personal_drive_ensure_ref_atomic(uuid,uuid,text,text,text,bigint)
  from public,anon,authenticated;
grant execute on function public.dimpro_personal_drive_ensure_ref_atomic(uuid,uuid,text,text,text,bigint)
  to service_role;

-- Read-only, single-SQL-snapshot quota summary so the USER-facing quota meter
-- cannot silently omit pending/QUARANTINED multipart reservations.
create or replace function public.dimpro_personal_drive_quota_summary_v011(
  p_owner_user_id uuid, p_default_quota_bytes bigint
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_quota_bytes bigint;
  v_hard_limit boolean;
  v_source text;
  v_used bigint := 0;
  v_reserved bigint := 0;
begin
  if p_owner_user_id is null or p_default_quota_bytes is null
     or p_default_quota_bytes <= 0 then
    raise exception 'PERSONAL_DRIVE_QUOTA_SUMMARY_INVALID' using errcode='22023';
  end if;
  select coalesce(l.quota_bytes,p_default_quota_bytes),
         coalesce(l.hard_limit,true),coalesce(l.source,'DEFAULT')
  into v_quota_bytes,v_hard_limit,v_source
  from (select 1) seed
  left join public.dimpro_personal_drive_storage_limits l
    on l.owner_user_id=p_owner_user_id;

  select coalesce(sum(obj.size_bytes),0)::bigint into v_used
  from public.dimpro_content_objects obj
  where obj.status='ACTIVE' and exists (
    select 1 from public.dimpro_content_refs ref
    where ref.owner_type='USER'
      and ref.owner_user_id=p_owner_user_id
      and ref.status in ('ACTIVE','REMOVED')
      and ref.content_object_id=obj.id
  );

  select coalesce(sum(session.size_bytes),0)::bigint into v_reserved
  from public.dimpro_personal_drive_multipart_sessions session
  where session.owner_user_id=p_owner_user_id
    and session.status in ('INITIATED','UPLOADING','ABORTING','COMPLETING','QUARANTINED','SCANNING');

  return jsonb_build_object(
    'quotaBytes',v_quota_bytes,
    'usedBytes',v_used,
    'reservedBytes',v_reserved,
    'occupiedBytes',v_used+v_reserved,
    'remainingBytes',greatest(0,v_quota_bytes-v_used-v_reserved),
    'hardLimit',v_hard_limit,
    'source',v_source
  );
end;
$$;

revoke all on function public.dimpro_personal_drive_quota_summary_v011(uuid,bigint)
  from public,anon,authenticated;
grant execute on function public.dimpro_personal_drive_quota_summary_v011(uuid,bigint)
  to service_role;

update public.dimpro_personal_drive_multipart_schema_meta
set schema_version='0.1.1', applied_at=now()
where component='personal-drive-multipart'
  and schema_version='0.1.0'
  and bootstrap_id='personal-drive-multipart-v010-20261023';
do $$
begin
  if not exists(select 1 from public.dimpro_personal_drive_multipart_schema_meta
    where component='personal-drive-multipart'
      and schema_version='0.1.1'
      and bootstrap_id='personal-drive-multipart-v010-20261023') then
    raise exception 'PERSONAL_MULTIPART_V011_MARKER_ADVANCE_FAILED' using errcode='P0001';
  end if;
end $$;
commit;
