begin;

create table if not exists public.dimpro_personal_drive_storage_limits (
  owner_user_id uuid primary key references public.dimpro_users(id) on delete cascade,
  quota_bytes bigint not null check (quota_bytes > 0),
  hard_limit boolean not null default true,
  source text not null default 'OVERRIDE' check (source in ('DEFAULT','PLAN','OVERRIDE')),
  updated_by_user_id uuid null references public.dimpro_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dimpro_personal_drive_storage_limits enable row level security;
revoke all on table public.dimpro_personal_drive_storage_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.dimpro_personal_drive_storage_limits to service_role;

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

  if v_hard_limit and v_used_bytes + v_increment_bytes > v_quota_bytes then
    raise exception 'PERSONAL_DRIVE_QUOTA_EXCEEDED'
      using errcode='53100',
            detail=jsonb_build_object(
              'quotaBytes',v_quota_bytes,
              'usedBytes',v_used_bytes,
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

revoke all on function public.dimpro_personal_drive_ensure_ref_atomic(uuid,uuid,text,text,text,bigint) from public, anon, authenticated;
grant execute on function public.dimpro_personal_drive_ensure_ref_atomic(uuid,uuid,text,text,text,bigint) to service_role;

create or replace function public.dimpro_personal_drive_restore_refs_atomic(
  p_owner_user_id uuid,
  p_ref_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_requested_count integer;
  v_found_count integer;
begin
  if p_owner_user_id is null then
    raise exception 'PERSONAL_DRIVE_OWNER_REQUIRED' using errcode='22023';
  end if;

  select count(distinct requested.ref_id) into v_requested_count
  from unnest(coalesce(p_ref_ids,array[]::uuid[])) as requested(ref_id);
  if v_requested_count < 1 or v_requested_count > 500 then
    raise exception 'PERSONAL_DRIVE_RESTORE_SELECTION_INVALID' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('personal-drive-restore:' || p_owner_user_id::text, 0));
  perform 1 from public.dimpro_content_refs ref
  where ref.owner_type='USER' and ref.owner_user_id=p_owner_user_id and ref.id=any(p_ref_ids)
  for update;

  select count(*) into v_found_count
  from public.dimpro_content_refs ref
  where ref.owner_type='USER'
    and ref.owner_user_id=p_owner_user_id
    and ref.status='REMOVED'
    and ref.id=any(p_ref_ids);
  if v_found_count <> v_requested_count then
    raise exception 'PERSONAL_DRIVE_RESTORE_SCOPE_MISMATCH' using errcode='42501';
  end if;

  update public.dimpro_content_refs
  set status='ACTIVE', updated_at=now()
  where owner_type='USER'
    and owner_user_id=p_owner_user_id
    and status='REMOVED'
    and id=any(p_ref_ids);

  return jsonb_build_object('ok',true,'restoredIds',to_jsonb(p_ref_ids),'restoredCount',v_requested_count);
end;
$$;

revoke all on function public.dimpro_personal_drive_restore_refs_atomic(uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.dimpro_personal_drive_restore_refs_atomic(uuid,uuid[]) to service_role;

insert into public.dimpro_content_schema_meta(component,schema_version,migration_count,bootstrap_id,updated_at)
values ('personal-drive-storage','0.1.0',1,'personal-drive-storage-v010-20261007',now())
on conflict (component) do update set
  schema_version=excluded.schema_version,
  migration_count=excluded.migration_count,
  bootstrap_id=excluded.bootstrap_id,
  updated_at=excluded.updated_at;

commit;
