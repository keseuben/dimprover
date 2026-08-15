begin;

-- DIMPRO Project Issue Core V0.3
-- Generikus, idempotens issue-create FIELD_CAPTURE / MANUAL / MEETING / IMPORT forrásokhoz.
-- A COMPARE_FINDING továbbra is kizárólag a speciális human-gated konverziós RPC-n keresztül hozhat létre HJ-t.

create unique index if not exists project_core_entity_links_issue_generic_created_from_unique
  on public.project_core_entity_links(project_id,source_type,source_id,target_type,target_id,relation_type)
  where source_type='issue' and relation_type='CREATED_FROM'
    and target_type in ('field_capture','manual','meeting','import');

create or replace function public.project_issue_create_atomic(
  p_project_id text,
  p_source_type text,
  p_source_id text,
  p_payload jsonb,
  p_actor_user_id text,
  p_actor_name text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_type text := upper(btrim(coalesce(p_source_type,'')));
  v_source_id text := btrim(coalesce(p_source_id,''));
  v_target_type text;
  v_existing public.project_core_issues;
  v_issue public.project_core_issues;
  v_link public.project_core_entity_links;
  v_number integer;
  v_serial text;
  v_title text;
  v_description text;
  v_location text;
  v_discipline text;
  v_severity text;
  v_status text;
  v_responsible_user_id text;
  v_responsible_name text;
  v_due_at timestamptz;
  v_note text;
  v_metadata jsonb;
begin
  if v_source_type not in ('FIELD_CAPTURE','MANUAL','MEETING','IMPORT') then
    raise exception 'PROJECT_ISSUE_SOURCE_TYPE_INVALID' using errcode='22023';
  end if;
  if v_source_id='' or length(v_source_id)>240 then
    raise exception 'PROJECT_ISSUE_SOURCE_ID_INVALID' using errcode='22023';
  end if;

  v_target_type := lower(v_source_type);

  select * into v_existing
  from public.project_core_issues
  where project_id=p_project_id and source_type=v_source_type and source_id=v_source_id and deleted_at is null
  limit 1;

  if v_existing.id is not null then
    select * into v_link
    from public.project_core_entity_links
    where project_id=p_project_id and source_type='issue' and source_id=v_existing.id
      and target_type=v_target_type and target_id=v_source_id and relation_type='CREATED_FROM'
    limit 1;
    return jsonb_build_object('issue',to_jsonb(v_existing),'link',to_jsonb(v_link),'created',false);
  end if;

  v_title := btrim(coalesce(p_payload->>'title',''));
  if v_title='' or length(v_title)>500 then
    raise exception 'PROJECT_ISSUE_TITLE_REQUIRED' using errcode='22023';
  end if;
  v_description := left(coalesce(p_payload->>'description',''),12000);
  v_location := left(btrim(coalesce(p_payload->>'location','')),1000);
  v_discipline := left(btrim(coalesce(p_payload->>'discipline','')),240);
  v_note := left(coalesce(p_payload->>'note',''),4000);

  v_severity := upper(btrim(coalesce(nullif(p_payload->>'severity',''),'MEDIUM')));
  if v_severity not in ('LOW','MEDIUM','HIGH','URGENT') then
    raise exception 'PROJECT_ISSUE_SEVERITY_INVALID' using errcode='22023';
  end if;
  v_status := upper(btrim(coalesce(nullif(p_payload->>'status',''),'NEW')));
  if v_status not in ('NEW','IN_PROGRESS','FIXED','VERIFIED','CLOSED','REOPENED') then
    raise exception 'PROJECT_ISSUE_STATUS_INVALID' using errcode='22023';
  end if;

  v_responsible_user_id := nullif(btrim(coalesce(p_payload->>'responsibleUserId','')), '');
  v_responsible_name := left(btrim(coalesce(p_payload->>'responsibleName','')),240);
  if v_responsible_user_id is not null then
    select display_name into v_responsible_name
    from public.project_core_memberships
    where project_id=p_project_id and lower(user_id)=lower(v_responsible_user_id) and status='ACTIVE'
    order by updated_at desc
    limit 1;
    if coalesce(v_responsible_name,'')='' then
      raise exception 'PROJECT_ISSUE_RESPONSIBLE_NOT_ACTIVE' using errcode='22023';
    end if;
  end if;

  if coalesce(btrim(p_payload->>'dueAt'),'')<>'' then
    begin
      v_due_at := (p_payload->>'dueAt')::timestamptz;
    exception when others then
      raise exception 'PROJECT_ISSUE_DUE_AT_INVALID' using errcode='22007';
    end;
  else
    v_due_at := null;
  end if;

  if p_payload ? 'metadata' and jsonb_typeof(p_payload->'metadata') <> 'object' then
    raise exception 'PROJECT_ISSUE_METADATA_INVALID' using errcode='22023';
  end if;
  v_metadata := coalesce(p_payload->'metadata','{}'::jsonb)
    || jsonb_build_object('sourceType',v_source_type,'sourceId',v_source_id);

  insert into public.project_core_issue_sequences(project_id,next_value,updated_at)
  values (p_project_id,2,now())
  on conflict(project_id) do update
    set next_value=public.project_core_issue_sequences.next_value+1,updated_at=now()
  returning next_value-1 into v_number;

  v_serial := 'HJ-'||lpad(v_number::text,5,'0');

  insert into public.project_core_issues(
    id,project_id,serial,source_type,source_id,title,description,location,discipline,severity,status,
    responsible_user_id,responsible_name,due_at,note,metadata,version,
    created_by,created_by_name,updated_by,updated_by_name,created_at,updated_at
  ) values (
    'project-issue-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,v_serial,v_source_type,v_source_id,v_title,v_description,v_location,v_discipline,v_severity,v_status,
    v_responsible_user_id,v_responsible_name,v_due_at,v_note,v_metadata,1,
    p_actor_user_id,left(coalesce(nullif(btrim(p_actor_name),''),p_actor_user_id),240),
    p_actor_user_id,left(coalesce(nullif(btrim(p_actor_name),''),p_actor_user_id),240),now(),now()
  ) returning * into v_issue;

  insert into public.project_core_entity_links(
    id,project_id,source_type,source_id,target_type,target_id,relation_type,created_at,created_by
  ) values (
    'project-link-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,'issue',v_issue.id,v_target_type,v_source_id,'CREATED_FROM',now(),p_actor_user_id
  ) returning * into v_link;

  insert into public.project_core_audit_events(
    id,project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata
  ) values (
    'project-audit-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'PROJECT_ISSUE_CREATED','issue',v_issue.id,
    'Hibajegy létrehozva: '||v_issue.serial,
    jsonb_build_object(
      'issueId',v_issue.id,'serial',v_issue.serial,'sourceType',v_source_type,'sourceId',v_source_id,
      'severity',v_issue.severity,'status',v_issue.status
    )
  );

  return jsonb_build_object('issue',to_jsonb(v_issue),'link',to_jsonb(v_link),'created',true);
exception
  when unique_violation then
    select * into v_existing
    from public.project_core_issues
    where project_id=p_project_id and source_type=v_source_type and source_id=v_source_id and deleted_at is null
    limit 1;
    if v_existing.id is not null then
      select * into v_link
      from public.project_core_entity_links
      where project_id=p_project_id and source_type='issue' and source_id=v_existing.id
        and target_type=v_target_type and target_id=v_source_id and relation_type='CREATED_FROM'
      limit 1;
      return jsonb_build_object('issue',to_jsonb(v_existing),'link',to_jsonb(v_link),'created',false);
    end if;
    raise;
end;
$$;

revoke all on function public.project_issue_create_atomic(text,text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.project_issue_create_atomic(text,text,text,jsonb,text,text) to service_role;

-- V0.3: külső/terepi felelős neve is frissíthető anélkül, hogy DIMPRO projekttag lenne.
create or replace function public.project_issue_update_atomic(
  p_project_id text,
  p_issue_id text,
  p_expected_version integer,
  p_patch jsonb,
  p_actor_user_id text,
  p_actor_name text
) returns public.project_core_issues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issue public.project_core_issues;
  v_status text;
  v_severity text;
  v_responsible_user_id text;
  v_responsible_name text;
  v_due_at timestamptz;
  v_changes jsonb := '{}'::jsonb;
begin
  select * into v_issue
  from public.project_core_issues
  where id=p_issue_id and project_id=p_project_id and deleted_at is null
  for update;

  if v_issue.id is null then
    raise exception 'PROJECT_ISSUE_NOT_FOUND' using errcode='P0002';
  end if;
  if p_expected_version is null or p_expected_version < 1 or v_issue.version <> p_expected_version then
    raise exception 'PROJECT_ISSUE_VERSION_CONFLICT' using errcode='P0001';
  end if;

  v_status := case when p_patch ? 'status' then upper(btrim(coalesce(p_patch->>'status',''))) else v_issue.status end;
  if v_status not in ('NEW','IN_PROGRESS','FIXED','VERIFIED','CLOSED','REOPENED') then
    raise exception 'PROJECT_ISSUE_STATUS_INVALID' using errcode='22023';
  end if;

  v_severity := case when p_patch ? 'severity' then upper(btrim(coalesce(p_patch->>'severity',''))) else v_issue.severity end;
  if v_severity not in ('LOW','MEDIUM','HIGH','URGENT') then
    raise exception 'PROJECT_ISSUE_SEVERITY_INVALID' using errcode='22023';
  end if;

  if p_patch ? 'responsibleUserId' then
    v_responsible_user_id := nullif(btrim(coalesce(p_patch->>'responsibleUserId','')), '');
    if v_responsible_user_id is null then
      v_responsible_name := case when p_patch ? 'responsibleName' then left(btrim(coalesce(p_patch->>'responsibleName','')),240) else '' end;
    else
      select display_name into v_responsible_name
      from public.project_core_memberships
      where project_id=p_project_id and lower(user_id)=lower(v_responsible_user_id) and status='ACTIVE'
      order by updated_at desc
      limit 1;
      if coalesce(v_responsible_name,'')='' then
        raise exception 'PROJECT_ISSUE_RESPONSIBLE_NOT_ACTIVE' using errcode='22023';
      end if;
    end if;
  elsif p_patch ? 'responsibleName' then
    v_responsible_user_id := null;
    v_responsible_name := left(btrim(coalesce(p_patch->>'responsibleName','')),240);
  else
    v_responsible_user_id := v_issue.responsible_user_id;
    v_responsible_name := v_issue.responsible_name;
  end if;

  if p_patch ? 'dueAt' then
    if coalesce(btrim(p_patch->>'dueAt'),'')='' then
      v_due_at := null;
    else
      begin
        v_due_at := (p_patch->>'dueAt')::timestamptz;
      exception when others then
        raise exception 'PROJECT_ISSUE_DUE_AT_INVALID' using errcode='22007';
      end;
    end if;
  else
    v_due_at := v_issue.due_at;
  end if;

  if p_patch ? 'metadata' and jsonb_typeof(p_patch->'metadata') <> 'object' then
    raise exception 'PROJECT_ISSUE_METADATA_INVALID' using errcode='22023';
  end if;

  if p_patch ? 'status' and v_status is distinct from v_issue.status then v_changes := v_changes || jsonb_build_object('status',jsonb_build_object('from',v_issue.status,'to',v_status)); end if;
  if p_patch ? 'severity' and v_severity is distinct from v_issue.severity then v_changes := v_changes || jsonb_build_object('severity',jsonb_build_object('from',v_issue.severity,'to',v_severity)); end if;
  if (p_patch ? 'responsibleUserId' or p_patch ? 'responsibleName') and (v_responsible_user_id is distinct from v_issue.responsible_user_id or v_responsible_name is distinct from v_issue.responsible_name) then
    v_changes := v_changes || jsonb_build_object('responsible',jsonb_build_object('userIdFrom',v_issue.responsible_user_id,'userIdTo',v_responsible_user_id,'nameFrom',v_issue.responsible_name,'nameTo',v_responsible_name));
  end if;
  if p_patch ? 'dueAt' and v_due_at is distinct from v_issue.due_at then v_changes := v_changes || jsonb_build_object('dueAt',jsonb_build_object('from',v_issue.due_at,'to',v_due_at)); end if;

  update public.project_core_issues set
    title = case when p_patch ? 'title' then left(btrim(coalesce(p_patch->>'title','')),500) else title end,
    description = case when p_patch ? 'description' then left(coalesce(p_patch->>'description',''),12000) else description end,
    location = case when p_patch ? 'location' then left(btrim(coalesce(p_patch->>'location','')),1000) else location end,
    discipline = case when p_patch ? 'discipline' then left(btrim(coalesce(p_patch->>'discipline','')),240) else discipline end,
    severity = v_severity,
    status = v_status,
    responsible_user_id = v_responsible_user_id,
    responsible_name = left(coalesce(v_responsible_name,''),240),
    due_at = v_due_at,
    note = case when p_patch ? 'note' then left(coalesce(p_patch->>'note',''),4000) else note end,
    metadata = case when p_patch ? 'metadata' then metadata || (p_patch->'metadata') else metadata end,
    version = version + 1,
    updated_by = p_actor_user_id,
    updated_by_name = left(coalesce(nullif(btrim(p_actor_name),''),p_actor_user_id),240),
    updated_at = now()
  where id=p_issue_id and project_id=p_project_id
  returning * into v_issue;

  if btrim(v_issue.title)='' then
    raise exception 'PROJECT_ISSUE_TITLE_REQUIRED' using errcode='22023';
  end if;

  insert into public.project_core_audit_events(
    id,project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata
  ) values (
    'project-audit-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'PROJECT_ISSUE_UPDATED','issue',v_issue.id,
    'Hibajegy frissítve: '||v_issue.serial,
    jsonb_build_object(
      'serial',v_issue.serial,'version',v_issue.version,'status',v_issue.status,'severity',v_issue.severity,
      'responsibleUserId',v_issue.responsible_user_id,'responsibleName',v_issue.responsible_name,'dueAt',v_issue.due_at,'changes',v_changes
    )
  );

  return v_issue;
end;
$$;

revoke all on function public.project_issue_update_atomic(text,text,integer,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.project_issue_update_atomic(text,text,integer,jsonb,text,text) to service_role;

insert into public.project_issue_schema_meta(component,schema_version,migration_count,bootstrap_id,updated_at)
values ('project-issue-core','0.3.0',3,'project-issue-core-v030-20260815',now())
on conflict(component) do update set
  schema_version=excluded.schema_version,
  migration_count=excluded.migration_count,
  bootstrap_id=excluded.bootstrap_id,
  updated_at=now();

commit;
