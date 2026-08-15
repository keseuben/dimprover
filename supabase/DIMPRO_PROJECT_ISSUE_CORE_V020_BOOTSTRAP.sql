begin;

-- DIMPRO Project Issue Core V0.2
-- Központi Hibajegyzék szerveroldali szerkesztés, optimistic concurrency és audit.

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
      v_responsible_name := '';
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

  if p_patch ? 'status' and v_status is distinct from v_issue.status then v_changes := v_changes || jsonb_build_object('status',jsonb_build_object('from',v_issue.status,'to',v_status)); end if;
  if p_patch ? 'severity' and v_severity is distinct from v_issue.severity then v_changes := v_changes || jsonb_build_object('severity',jsonb_build_object('from',v_issue.severity,'to',v_severity)); end if;
  if p_patch ? 'responsibleUserId' and v_responsible_user_id is distinct from v_issue.responsible_user_id then v_changes := v_changes || jsonb_build_object('responsibleUserId',jsonb_build_object('from',v_issue.responsible_user_id,'to',v_responsible_user_id)); end if;
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
      'serial',v_issue.serial,
      'version',v_issue.version,
      'status',v_issue.status,
      'severity',v_issue.severity,
      'responsibleUserId',v_issue.responsible_user_id,
      'dueAt',v_issue.due_at,
      'changes',v_changes
    )
  );

  return v_issue;
end;
$$;

revoke all on function public.project_issue_update_atomic(text,text,integer,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.project_issue_update_atomic(text,text,integer,jsonb,text,text) to service_role;

insert into public.project_issue_schema_meta(component,schema_version,migration_count,bootstrap_id,updated_at)
values ('project-issue-core','0.2.0',2,'project-issue-core-v020-20260815',now())
on conflict(component) do update set
  schema_version=excluded.schema_version,
  migration_count=excluded.migration_count,
  bootstrap_id=excluded.bootstrap_id,
  updated_at=now();

commit;
