begin;

-- DIMPRO Projektkapu DRIVE Document Flow V0.1.0
-- DEV candidate only. Do not apply to PROD.
-- Technical AVAILABLE is NOT equal to business KIADOTT.

do $$
begin
  if to_regclass('public.drive_core_document_versions') is null
    or to_regclass('public.drive_core_documents') is null
    or to_regclass('public.drive_core_upload_sessions') is null
    or to_regclass('public.project_core_projects') is null then
    raise exception 'DRIVE_DOCUMENT_FLOW_PREREQUISITES_MISSING' using errcode='P0001';
  end if;
end;
$$;

alter table public.drive_core_document_versions
  add column if not exists storage_version_id text null;

alter table public.drive_core_upload_sessions
  add column if not exists storage_version_id text null;

create table if not exists public.drive_core_document_governance (
  version_id text primary key references public.drive_core_document_versions(id) on delete cascade,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  document_id text not null references public.drive_core_documents(id) on delete cascade,
  business_status text null,
  review_decision text not null default 'PENDING',
  review_mode text not null default 'DRIVE_SIMPLE',
  decide_request_id text null,
  issue_status text not null default 'NOT_ISSUED',
  source_channel text not null default 'DRIVE',
  drop_package_id text null,
  drop_file_id text null,
  review_note text not null default '',
  reviewed_by text null,
  reviewed_at timestamptz null,
  valid_by text null,
  valid_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drive_doc_governance_business_status_check
    check (business_status is null or business_status in ('BEJOVO','ELLENORZES_ALATT','ERVENYES','KIADOTT','ARCHIV')),
  constraint drive_doc_governance_review_decision_check
    check (review_decision in ('PENDING','APPROVED','REJECTED')),
  constraint drive_doc_governance_review_mode_check
    check (review_mode in ('DRIVE_SIMPLE','DECIDE')),
  constraint drive_doc_governance_issue_status_check
    check (issue_status in ('NOT_ISSUED','ISSUED','WITHDRAWN','SUPERSEDED')),
  constraint drive_doc_governance_source_channel_check
    check (source_channel in ('DRIVE','DROP','DESKTOP','SYSTEM')),
  constraint drive_doc_governance_review_note_check
    check (length(review_note) <= 2000)
);

create index if not exists drive_doc_governance_project_state_idx
  on public.drive_core_document_governance(project_id,business_status,review_decision,issue_status,updated_at desc);

create table if not exists public.drive_core_document_issue_sequences (
  project_id text primary key references public.project_core_projects(id) on delete cascade,
  next_value integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint drive_doc_issue_sequence_check check (next_value >= 1)
);

create table if not exists public.drive_core_document_issues (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  document_id text not null references public.drive_core_documents(id) on delete cascade,
  version_id text not null references public.drive_core_document_versions(id) on delete cascade,
  issue_number text not null,
  status text not null default 'ISSUED',
  purpose text not null default '',
  note text not null default '',
  issued_by text not null,
  issued_at timestamptz not null default now(),
  withdrawn_by text null,
  withdrawn_at timestamptz null,
  supersedes_issue_id text null references public.drive_core_document_issues(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drive_doc_issue_status_check check (status in ('ISSUED','WITHDRAWN','SUPERSEDED')),
  constraint drive_doc_issue_number_unique unique(project_id,issue_number)
);

create unique index if not exists drive_doc_issue_active_version_uq
  on public.drive_core_document_issues(project_id,version_id)
  where status='ISSUED';

create table if not exists public.drive_core_document_issue_recipients (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  issue_id text not null references public.drive_core_document_issues(id) on delete cascade,
  recipient_type text not null,
  user_id text null,
  email text null,
  name text not null default '',
  organization text not null default '',
  permission text not null default 'DOWNLOAD',
  access_expires_at timestamptz null,
  downloaded_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint drive_doc_recipient_type_check check (recipient_type in ('PROJECT_MEMBER','EMAIL')),
  constraint drive_doc_recipient_permission_check check (permission='DOWNLOAD'),
  constraint drive_doc_recipient_identity_check check (
    (recipient_type='PROJECT_MEMBER' and user_id is not null and length(btrim(user_id)) > 0)
    or
    (recipient_type='EMAIL' and email is not null and position('@' in email) > 1)
  )
);

create index if not exists drive_doc_issue_recipient_issue_idx
  on public.drive_core_document_issue_recipients(project_id,issue_id,created_at);

alter table public.drive_core_document_governance enable row level security;
alter table public.drive_core_document_issue_sequences enable row level security;
alter table public.drive_core_document_issues enable row level security;
alter table public.drive_core_document_issue_recipients enable row level security;

revoke all on table public.drive_core_document_governance from public,anon,authenticated;
revoke all on table public.drive_core_document_issue_sequences from public,anon,authenticated;
revoke all on table public.drive_core_document_issues from public,anon,authenticated;
revoke all on table public.drive_core_document_issue_recipients from public,anon,authenticated;

grant select,insert,update,delete on table public.drive_core_document_governance to service_role;
grant select,insert,update,delete on table public.drive_core_document_issue_sequences to service_role;
grant select,insert,update,delete on table public.drive_core_document_issues to service_role;
grant select,insert,update,delete on table public.drive_core_document_issue_recipients to service_role;

create or replace function public.drive_core_register_incoming_document_atomic(
  p_project_id text,
  p_document_id text,
  p_version_id text,
  p_source_channel text,
  p_drop_package_id text,
  p_drop_file_id text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_version public.drive_core_document_versions;
  v_governance public.drive_core_document_governance;
  v_source text;
begin
  v_source := upper(btrim(coalesce(p_source_channel,'')));
  if v_source not in ('DROP','DRIVE','DESKTOP','SYSTEM') then
    raise exception 'DRIVE_DOCUMENT_FLOW_SOURCE_INVALID' using errcode='22023';
  end if;

  select * into v_version
  from public.drive_core_document_versions
  where id=p_version_id and project_id=p_project_id and document_id=p_document_id
  for update;

  if v_version.id is null then
    raise exception 'DRIVE_DOCUMENT_FLOW_VERSION_NOT_FOUND' using errcode='P0002';
  end if;

  if v_version.status <> 'QUARANTINED' then
    raise exception 'DRIVE_DOCUMENT_FLOW_INCOMING_NOT_QUARANTINED' using errcode='P0001';
  end if;

  insert into public.drive_core_document_governance(
    version_id,project_id,document_id,business_status,review_decision,review_mode,issue_status,
    source_channel,drop_package_id,drop_file_id,metadata,created_at,updated_at
  ) values (
    p_version_id,p_project_id,p_document_id,'ELLENORZES_ALATT','PENDING','DRIVE_SIMPLE','NOT_ISSUED',
    v_source,nullif(btrim(coalesce(p_drop_package_id,'')),''),nullif(btrim(coalesce(p_drop_file_id,'')),''),
    jsonb_build_object('registeredAsIncoming',true),now(),now()
  )
  on conflict(version_id) do update set
    business_status='ELLENORZES_ALATT',
    review_decision='PENDING',
    source_channel=excluded.source_channel,
    drop_package_id=coalesce(excluded.drop_package_id,public.drive_core_document_governance.drop_package_id),
    drop_file_id=coalesce(excluded.drop_file_id,public.drive_core_document_governance.drop_file_id),
    metadata=public.drive_core_document_governance.metadata || excluded.metadata,
    updated_at=now()
  returning * into v_governance;

  insert into public.project_core_audit_events(
    id,project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata
  ) values (
    'project-audit-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'DRIVE_DOCUMENT_INCOMING_REGISTERED','document_version',p_version_id,
    'Beérkező DRIVE dokumentum regisztrálva.',
    jsonb_build_object('documentId',p_document_id,'versionId',p_version_id,'sourceChannel',v_source,
      'dropPackageId',nullif(btrim(coalesce(p_drop_package_id,'')),''),
      'dropFileId',nullif(btrim(coalesce(p_drop_file_id,'')),''),
      'documentFlowSchema','0.1.0')
  );

  insert into public.drive_core_change_events(
    id,project_id,event_type,entity_type,entity_id,payload,actor_user_id
  ) values (
    'drive-change-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,'DOCUMENT_INCOMING_REGISTERED','document_version',p_version_id,
    jsonb_build_object('documentId',p_document_id,'versionId',p_version_id,'governance',to_jsonb(v_governance)),
    p_actor_user_id
  );

  return jsonb_build_object('governance',to_jsonb(v_governance),'version',to_jsonb(v_version));
end;
$$;

create or replace function public.drive_core_mark_document_review_atomic(
  p_project_id text,
  p_document_id text,
  p_version_id text,
  p_action text,
  p_note text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_action text;
  v_version public.drive_core_document_versions;
  v_governance public.drive_core_document_governance;
begin
  v_action := upper(btrim(coalesce(p_action,'')));
  if v_action not in ('APPROVE','REJECT') then
    raise exception 'DRIVE_DOCUMENT_FLOW_REVIEW_ACTION_INVALID' using errcode='22023';
  end if;

  select * into v_version
  from public.drive_core_document_versions
  where id=p_version_id and project_id=p_project_id and document_id=p_document_id
  for update;
  if v_version.id is null then
    raise exception 'DRIVE_DOCUMENT_FLOW_VERSION_NOT_FOUND' using errcode='P0002';
  end if;

  if v_action='APPROVE' and v_version.status <> 'AVAILABLE' then
    raise exception 'DRIVE_DOCUMENT_FLOW_APPROVE_REQUIRES_AVAILABLE' using errcode='P0001';
  end if;
  if v_action='REJECT' and v_version.status <> 'REJECTED' then
    raise exception 'DRIVE_DOCUMENT_FLOW_REJECT_REQUIRES_REJECTED' using errcode='P0001';
  end if;

  if exists(
    select 1 from public.drive_core_document_governance
    where version_id=p_version_id and project_id=p_project_id and document_id=p_document_id and issue_status='ISSUED'
  ) then
    select * into v_governance from public.drive_core_document_governance
    where version_id=p_version_id and project_id=p_project_id and document_id=p_document_id;
    return jsonb_build_object('governance',to_jsonb(v_governance),'version',to_jsonb(v_version),'idempotent',true);
  end if;

  update public.drive_core_document_governance
  set business_status=case when v_action='APPROVE' then 'ERVENYES' else 'ELLENORZES_ALATT' end,
      review_decision=case when v_action='APPROVE' then 'APPROVED' else 'REJECTED' end,
      review_note=left(btrim(coalesce(p_note,'')),2000),
      reviewed_by=p_actor_user_id,
      reviewed_at=now(),
      valid_by=case when v_action='APPROVE' then p_actor_user_id else null end,
      valid_at=case when v_action='APPROVE' then now() else null end,
      updated_at=now()
  where version_id=p_version_id and project_id=p_project_id and document_id=p_document_id
  returning * into v_governance;

  if v_governance.version_id is null then
    raise exception 'DRIVE_DOCUMENT_FLOW_GOVERNANCE_NOT_FOUND' using errcode='P0002';
  end if;

  insert into public.project_core_audit_events(
    id,project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata
  ) values (
    'project-audit-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,
    case when v_action='APPROVE' then 'DRIVE_DOCUMENT_MARKED_VALID' else 'DRIVE_DOCUMENT_MARKED_REJECTED' end,
    'document_version',p_version_id,
    case when v_action='APPROVE' then 'DRIVE dokumentumverzió érvényesítve.' else 'DRIVE dokumentumverzió elutasítva.' end,
    jsonb_build_object('documentId',p_document_id,'versionId',p_version_id,'reviewAction',v_action,
      'businessStatus',v_governance.business_status,'documentFlowSchema','0.1.0')
  );

  insert into public.drive_core_change_events(
    id,project_id,event_type,entity_type,entity_id,payload,actor_user_id
  ) values (
    'drive-change-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,
    case when v_action='APPROVE' then 'DOCUMENT_MARKED_VALID' else 'DOCUMENT_MARKED_REJECTED' end,
    'document_version',p_version_id,
    jsonb_build_object('documentId',p_document_id,'versionId',p_version_id,'governance',to_jsonb(v_governance)),
    p_actor_user_id
  );

  return jsonb_build_object('governance',to_jsonb(v_governance),'version',to_jsonb(v_version),'idempotent',false);
end;
$$;

create or replace function public.drive_core_issue_document_version_atomic(
  p_project_id text,
  p_document_id text,
  p_version_id text,
  p_purpose text,
  p_note text,
  p_recipients jsonb,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_version public.drive_core_document_versions;
  v_governance public.drive_core_document_governance;
  v_issue public.drive_core_document_issues;
  v_existing public.drive_core_document_issues;
  v_number integer;
  v_issue_number text;
  v_recipient jsonb;
  v_recipient_type text;
  v_user_id text;
  v_email text;
  v_count integer := 0;
begin
  select * into v_version
  from public.drive_core_document_versions
  where id=p_version_id and project_id=p_project_id and document_id=p_document_id
  for update;
  if v_version.id is null then
    raise exception 'DRIVE_DOCUMENT_FLOW_VERSION_NOT_FOUND' using errcode='P0002';
  end if;

  select * into v_governance
  from public.drive_core_document_governance
  where version_id=p_version_id and project_id=p_project_id and document_id=p_document_id
  for update;
  if v_governance.version_id is null then
    raise exception 'DRIVE_DOCUMENT_FLOW_GOVERNANCE_NOT_FOUND' using errcode='P0002';
  end if;

  select * into v_existing
  from public.drive_core_document_issues
  where project_id=p_project_id and version_id=p_version_id and status='ISSUED'
  limit 1;
  if v_existing.id is not null then
    return jsonb_build_object('issue',to_jsonb(v_existing),'governance',to_jsonb(v_governance),'idempotent',true);
  end if;

  if v_version.status <> 'AVAILABLE'
    or v_governance.review_decision <> 'APPROVED'
    or v_governance.business_status <> 'ERVENYES' then
    raise exception 'DRIVE_DOCUMENT_FLOW_VERSION_NOT_ISSUABLE' using errcode='P0001';
  end if;

  if p_recipients is null or jsonb_typeof(p_recipients) <> 'array' or jsonb_array_length(p_recipients) < 1 then
    raise exception 'DRIVE_DOCUMENT_FLOW_RECIPIENT_REQUIRED' using errcode='22023';
  end if;

  insert into public.drive_core_document_issue_sequences(project_id,next_value,updated_at)
  values(p_project_id,2,now())
  on conflict(project_id) do update
    set next_value=public.drive_core_document_issue_sequences.next_value+1,updated_at=now()
  returning next_value-1 into v_number;

  v_issue_number := 'KIA-'||lpad(v_number::text,5,'0');

  insert into public.drive_core_document_issues(
    id,project_id,document_id,version_id,issue_number,status,purpose,note,issued_by,issued_at,metadata
  ) values (
    'drive-doc-issue-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,p_document_id,p_version_id,v_issue_number,'ISSUED',
    left(btrim(coalesce(p_purpose,'')),1000),left(btrim(coalesce(p_note,'')),4000),
    p_actor_user_id,now(),jsonb_build_object('documentFlowSchema','0.1.0')
  ) returning * into v_issue;

  for v_recipient in select value from jsonb_array_elements(p_recipients)
  loop
    v_recipient_type := upper(btrim(coalesce(v_recipient->>'type','')));
    v_user_id := nullif(btrim(coalesce(v_recipient->>'userId','')),'');
    v_email := nullif(lower(btrim(coalesce(v_recipient->>'email',''))),'');
    if v_recipient_type='PROJECT_MEMBER' and v_user_id is null then
      raise exception 'DRIVE_DOCUMENT_FLOW_RECIPIENT_USER_REQUIRED' using errcode='22023';
    elsif v_recipient_type='EMAIL' and (v_email is null or position('@' in v_email) <= 1) then
      raise exception 'DRIVE_DOCUMENT_FLOW_RECIPIENT_EMAIL_REQUIRED' using errcode='22023';
    elsif v_recipient_type not in ('PROJECT_MEMBER','EMAIL') then
      raise exception 'DRIVE_DOCUMENT_FLOW_RECIPIENT_TYPE_INVALID' using errcode='22023';
    end if;

    insert into public.drive_core_document_issue_recipients(
      id,project_id,issue_id,recipient_type,user_id,email,name,organization,permission,metadata
    ) values (
      'drive-doc-recipient-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),
      p_project_id,v_issue.id,v_recipient_type,v_user_id,v_email,
      left(btrim(coalesce(v_recipient->>'name','')),240),
      left(btrim(coalesce(v_recipient->>'organization','')),240),
      'DOWNLOAD','{}'::jsonb
    );
    v_count := v_count + 1;
  end loop;

  update public.drive_core_document_governance
  set business_status='KIADOTT',issue_status='ISSUED',updated_at=now()
  where version_id=p_version_id
  returning * into v_governance;

  insert into public.project_core_audit_events(
    id,project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata
  ) values (
    'project-audit-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'DRIVE_DOCUMENT_VERSION_ISSUED','document_version',p_version_id,
    'DRIVE dokumentumverzió formálisan kiadva: '||v_issue_number,
    jsonb_build_object('documentId',p_document_id,'versionId',p_version_id,'issueId',v_issue.id,
      'issueNumber',v_issue_number,'recipientCount',v_count,'documentFlowSchema','0.1.0')
  );

  insert into public.drive_core_change_events(
    id,project_id,event_type,entity_type,entity_id,payload,actor_user_id
  ) values (
    'drive-change-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,'DOCUMENT_VERSION_ISSUED','document_version',p_version_id,
    jsonb_build_object('documentId',p_document_id,'versionId',p_version_id,'issue',to_jsonb(v_issue),
      'recipientCount',v_count,'governance',to_jsonb(v_governance)),
    p_actor_user_id
  );

  return jsonb_build_object('issue',to_jsonb(v_issue),'governance',to_jsonb(v_governance),'recipientCount',v_count,'idempotent',false);
end;
$$;

revoke all on function public.drive_core_register_incoming_document_atomic(text,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.drive_core_mark_document_review_atomic(text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.drive_core_issue_document_version_atomic(text,text,text,text,text,jsonb,text) from public,anon,authenticated;

grant execute on function public.drive_core_register_incoming_document_atomic(text,text,text,text,text,text,text) to service_role;
grant execute on function public.drive_core_mark_document_review_atomic(text,text,text,text,text,text) to service_role;
grant execute on function public.drive_core_issue_document_version_atomic(text,text,text,text,text,jsonb,text) to service_role;

insert into public.drive_storage_schema_meta(component,schema_version,migration_count,bootstrap_id,updated_at)
values('drive-document-flow','0.1.0',1,'drive-document-flow-v010-20260925',now())
on conflict(component) do update
set schema_version=excluded.schema_version,
    migration_count=excluded.migration_count,
    bootstrap_id=excluded.bootstrap_id,
    updated_at=now();

commit;
