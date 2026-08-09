-- DIMPRO Drop space-aware atomic package creation
-- DROP 0.3.2 – keeps the legacy five-argument RPC signature and adds optional space context.

begin;

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
  v_space public.drop_spaces%rowtype;
  v_membership public.drop_space_memberships%rowtype;
  v_space_id uuid;
  v_creator_membership_id uuid;
  v_visibility text;
  v_effective_end timestamptz;
  v_token_count integer;
  v_purpose_count integer;
  v_package_count integer;
  v_requested_member_count integer := 0;
  v_valid_member_count integer := 0;
begin
  if coalesce(jsonb_typeof(p_package), 'null') <> 'object' then
    raise exception using errcode = '22023', message = 'DROP_INVALID_PACKAGE_PAYLOAD';
  end if;
  if jsonb_typeof(coalesce(p_recipients, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_groups, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_tokens, '[]'::jsonb)) <> 'array'
     or (p_package ? 'selected_membership_ids' and jsonb_typeof(p_package->'selected_membership_ids') <> 'array') then
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

  v_space_id := nullif(trim(p_package->>'space_id'), '')::uuid;
  v_creator_membership_id := nullif(trim(p_package->>'created_by_membership_id'), '')::uuid;
  v_visibility := coalesce(nullif(trim(p_package->>'visibility'), ''), 'selected_members');

  if (v_space_id is null) <> (v_creator_membership_id is null) then
    raise exception using errcode = '22023', message = 'DROP_SPACE_CONTEXT_INCOMPLETE';
  end if;
  if v_visibility not in ('space_members', 'selected_members', 'project_members', 'private') then
    raise exception using errcode = '22023', message = 'DROP_SPACE_VISIBILITY_INVALID';
  end if;

  if v_space_id is not null then
    select * into v_space
      from public.drop_spaces
     where id = v_space_id
       and deleted_at is null;
    if not found then
      raise exception using errcode = 'P0002', message = 'DROP_SPACE_NOT_FOUND';
    end if;
    if v_space.status <> 'active' then
      raise exception using errcode = '55000', message = 'DROP_SPACE_NOT_WRITABLE';
    end if;

    select * into v_membership
      from public.drop_space_memberships
     where id = v_creator_membership_id
       and space_id = v_space_id
       and status = 'active';
    if not found then
      raise exception using errcode = '42501', message = 'DROP_SPACE_MEMBERSHIP_NOT_ACTIVE';
    end if;
    if v_membership.role not in ('owner', 'space_admin', 'contributor') then
      raise exception using errcode = '42501', message = 'DROP_SPACE_PACKAGE_CREATE_FORBIDDEN';
    end if;
    if v_membership.is_guest and not v_space.allow_guest_package_creation then
      raise exception using errcode = '42501', message = 'DROP_SPACE_GUEST_PACKAGE_CREATE_DISABLED';
    end if;

    v_effective_end := v_space.license_ends_at;
    if v_space.access_expiry_mode = 'fixed' and v_space.access_ends_at is not null then
      v_effective_end := least(v_effective_end, v_space.access_ends_at);
    elsif v_space.access_expiry_mode = 'project' and v_space.project_ends_at is not null then
      v_effective_end := least(v_effective_end, v_space.project_ends_at);
    end if;
    if v_membership.access_ends_at is not null then
      v_effective_end := least(v_effective_end, v_membership.access_ends_at);
    end if;
    if now() >= v_effective_end then
      raise exception using errcode = '55000', message = 'DROP_SPACE_ACCESS_EXPIRED';
    end if;
    if (p_package->>'expires_at')::timestamptz > v_effective_end
       or (p_package->>'upload_closes_at')::timestamptz > v_effective_end then
      raise exception using errcode = '22023', message = 'DROP_SPACE_PACKAGE_EXCEEDS_ACCESS_END';
    end if;

    select count(*) into v_package_count
      from public.drop_packages
     where space_id = v_space_id
       and status <> 'deleted';
    if v_package_count >= v_space.max_packages then
      raise exception using errcode = '54000', message = 'DROP_SPACE_PACKAGE_LIMIT_REACHED';
    end if;

    if nullif(trim(p_package->>'project_id'), '') is not null
       and not exists (
         select 1
           from public.drop_space_projects
          where space_id = v_space_id
            and project_id = trim(p_package->>'project_id')
       ) then
      raise exception using errcode = '42501', message = 'DROP_SPACE_PROJECT_NOT_LINKED';
    end if;

    if exists (
      select 1
        from jsonb_array_elements_text(coalesce(p_package->'selected_membership_ids', '[]'::jsonb)) as selected(selected_id)
       where selected_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) then
      raise exception using errcode = '22023', message = 'DROP_SPACE_SELECTED_MEMBER_INVALID';
    end if;

    select count(distinct selected_id) into v_requested_member_count
      from jsonb_array_elements_text(coalesce(p_package->'selected_membership_ids', '[]'::jsonb)) as selected(selected_id);
    select count(distinct membership.id) into v_valid_member_count
      from jsonb_array_elements_text(coalesce(p_package->'selected_membership_ids', '[]'::jsonb)) as selected(selected_id)
      join public.drop_space_memberships membership
        on membership.id = selected_id::uuid
       and membership.space_id = v_space_id
       and membership.status = 'active';
    if v_requested_member_count <> v_valid_member_count then
      raise exception using errcode = '42501', message = 'DROP_SPACE_SELECTED_MEMBER_NOT_ACTIVE';
    end if;
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
    max_total_size_bytes,
    space_id,
    created_by_membership_id,
    visibility
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
    (p_package->>'max_total_size_bytes')::bigint,
    v_space_id,
    v_creator_membership_id,
    v_visibility
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

  if v_space_id is not null then
    insert into public.drop_package_members (
      package_id,
      membership_id,
      can_view,
      can_upload,
      can_download,
      can_comment,
      shared_by_membership_id
    ) values (
      v_package.id,
      v_creator_membership_id,
      true,
      true,
      true,
      true,
      v_creator_membership_id
    )
    on conflict (package_id, membership_id) do update
    set can_view = excluded.can_view,
        can_upload = excluded.can_upload,
        can_download = excluded.can_download,
        can_comment = excluded.can_comment,
        shared_by_membership_id = excluded.shared_by_membership_id,
        updated_at = now();

    if v_visibility = 'selected_members' then
      insert into public.drop_package_members (
        package_id,
        membership_id,
        can_view,
        can_upload,
        can_download,
        can_comment,
        shared_by_membership_id
      )
      select distinct
        v_package.id,
        membership.id,
        true,
        membership.role in ('owner', 'space_admin', 'contributor', 'uploader'),
        true,
        membership.role <> 'viewer',
        v_creator_membership_id
      from jsonb_array_elements_text(coalesce(p_package->'selected_membership_ids', '[]'::jsonb)) as selected(selected_id)
      join public.drop_space_memberships membership
        on membership.id = selected_id::uuid
       and membership.space_id = v_space_id
       and membership.status = 'active'
      on conflict (package_id, membership_id) do update
      set can_view = excluded.can_view,
          can_upload = excluded.can_upload,
          can_download = excluded.can_download,
          can_comment = excluded.can_comment,
          shared_by_membership_id = excluded.shared_by_membership_id,
          updated_at = now();
    end if;
  end if;

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
      'spaceId', v_space_id,
      'createdByMembershipId', v_creator_membership_id,
      'visibility', v_visibility,
      'selectedMemberCount', v_valid_member_count,
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
  'Atomically creates legacy or space-aware DIMPRO Drop package metadata, recipients, groups, hashed capability tokens, selected member access and the audit event. Raw credentials are rejected.';

insert into public.drop_schema_meta (
  component,
  schema_version,
  migration_count,
  bootstrap_id,
  metadata,
  installed_at,
  updated_at
) values (
  'drop-spaces',
  'DROP 0.3.2',
  2,
  'drop-032-space-package-creation-20260801',
  jsonb_build_object(
    'licenseOwnedSpace', true,
    'guestLicenseRequired', false,
    'guestPackageCreation', true,
    'spacePackageAtomicCreation', true,
    'selectedMemberSharing', true,
    'projectDockLink', true,
    'driveArchivePrepared', true,
    'legacyPackageCompatibility', true,
    'fileUploadEnabled', false
  ),
  now(),
  now()
)
on conflict (component) do update
set schema_version = excluded.schema_version,
    migration_count = excluded.migration_count,
    bootstrap_id = excluded.bootstrap_id,
    metadata = coalesce(public.drop_schema_meta.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = excluded.updated_at;

commit;
