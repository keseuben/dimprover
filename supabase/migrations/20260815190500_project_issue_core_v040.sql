begin;

-- DIMPRO Project Issue Core V0.4
-- Központi HJ mellékletkapcsolat Drive dokumentumokhoz / verziókhoz.

create table if not exists public.project_issue_attachments (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  issue_id text not null references public.project_core_issues(id) on delete cascade,
  attachment_kind text not null,
  field_attachment_id text not null,
  relation_type text not null,
  drive_document_id text not null references public.drive_core_documents(id),
  drive_version_id text not null references public.drive_core_document_versions(id),
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  sha256 text null,
  metadata jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_by text not null,
  created_by_name text not null default '',
  updated_by text not null,
  updated_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  deleted_by text null,
  constraint project_issue_attachments_kind_check check (attachment_kind in ('PHOTO','PLAN','DOCUMENT')),
  constraint project_issue_attachments_relation_check check (relation_type in ('EVIDENCE','ATTACHMENT')),
  constraint project_issue_attachments_field_id_check check (length(btrim(field_attachment_id)) between 1 and 240),
  constraint project_issue_attachments_file_name_check check (length(btrim(file_name)) between 1 and 500),
  constraint project_issue_attachments_mime_check check (length(btrim(mime_type)) between 1 and 240),
  constraint project_issue_attachments_size_check check (size_bytes >= 0),
  constraint project_issue_attachments_sha_check check (sha256 is null or sha256 ~ '^[0-9a-fA-F]{64}$'),
  constraint project_issue_attachments_version_check check (version >= 1)
);

create unique index if not exists project_issue_attachments_active_field_unique
  on public.project_issue_attachments(project_id,issue_id,attachment_kind,field_attachment_id)
  where deleted_at is null;
create index if not exists project_issue_attachments_issue_idx
  on public.project_issue_attachments(project_id,issue_id,updated_at desc)
  where deleted_at is null;
create index if not exists project_issue_attachments_document_idx
  on public.project_issue_attachments(project_id,drive_document_id,drive_version_id)
  where deleted_at is null;

create unique index if not exists project_core_entity_links_issue_document_unique
  on public.project_core_entity_links(project_id,source_type,source_id,target_type,target_id,relation_type)
  where source_type='issue' and target_type='document' and relation_type in ('EVIDENCE','ATTACHMENT');

alter table public.project_issue_attachments enable row level security;
revoke all on table public.project_issue_attachments from public,anon,authenticated;
grant select,insert,update,delete on table public.project_issue_attachments to service_role;

create or replace function public.project_issue_attachment_link_atomic(
  p_project_id text,
  p_issue_id text,
  p_attachment jsonb,
  p_actor_user_id text,
  p_actor_name text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issue public.project_core_issues;
  v_document public.drive_core_documents;
  v_version public.drive_core_document_versions;
  v_existing public.project_issue_attachments;
  v_attachment public.project_issue_attachments;
  v_link public.project_core_entity_links;
  v_kind text := upper(btrim(coalesce(p_attachment->>'attachmentKind','')));
  v_field_id text := btrim(coalesce(p_attachment->>'fieldAttachmentId',''));
  v_relation text := upper(btrim(coalesce(nullif(p_attachment->>'relationType',''), case when upper(btrim(coalesce(p_attachment->>'attachmentKind','')))='PHOTO' then 'EVIDENCE' else 'ATTACHMENT' end)));
  v_document_id text := btrim(coalesce(p_attachment->>'driveDocumentId',''));
  v_version_id text := btrim(coalesce(p_attachment->>'driveVersionId',''));
  v_metadata jsonb := coalesce(p_attachment->'metadata','{}'::jsonb);
  v_changed boolean := false;
begin
  select * into v_issue
  from public.project_core_issues
  where id=p_issue_id and project_id=p_project_id and deleted_at is null
  for update;
  if v_issue.id is null then
    raise exception 'PROJECT_ISSUE_NOT_FOUND' using errcode='P0002';
  end if;

  if v_kind not in ('PHOTO','PLAN','DOCUMENT') then
    raise exception 'PROJECT_ISSUE_ATTACHMENT_KIND_INVALID' using errcode='22023';
  end if;
  if v_relation not in ('EVIDENCE','ATTACHMENT') then
    raise exception 'PROJECT_ISSUE_ATTACHMENT_RELATION_INVALID' using errcode='22023';
  end if;
  if v_field_id='' or length(v_field_id)>240 then
    raise exception 'PROJECT_ISSUE_ATTACHMENT_FIELD_ID_INVALID' using errcode='22023';
  end if;
  if v_document_id='' or v_version_id='' then
    raise exception 'PROJECT_ISSUE_ATTACHMENT_DRIVE_REFERENCE_REQUIRED' using errcode='22023';
  end if;
  if jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'PROJECT_ISSUE_ATTACHMENT_METADATA_INVALID' using errcode='22023';
  end if;

  select * into v_document
  from public.drive_core_documents
  where id=v_document_id and project_id=p_project_id and status <> 'DELETED'
  limit 1;
  if v_document.id is null then
    raise exception 'PROJECT_ISSUE_ATTACHMENT_DOCUMENT_NOT_FOUND' using errcode='P0002';
  end if;

  select * into v_version
  from public.drive_core_document_versions
  where id=v_version_id and project_id=p_project_id and document_id=v_document_id
  limit 1;
  if v_version.id is null then
    raise exception 'PROJECT_ISSUE_ATTACHMENT_VERSION_NOT_FOUND' using errcode='P0002';
  end if;
  if v_version.status not in ('AVAILABLE','QUARANTINED') then
    raise exception 'PROJECT_ISSUE_ATTACHMENT_VERSION_UNSAFE' using errcode='22023';
  end if;

  select * into v_existing
  from public.project_issue_attachments
  where project_id=p_project_id and issue_id=p_issue_id and attachment_kind=v_kind and field_attachment_id=v_field_id and deleted_at is null
  for update;

  if v_existing.id is not null then
    v_changed := v_existing.drive_document_id is distinct from v_document_id
      or v_existing.drive_version_id is distinct from v_version_id
      or v_existing.relation_type is distinct from v_relation
      or v_existing.metadata is distinct from (v_existing.metadata || v_metadata);

    if not v_changed then
      select * into v_link
      from public.project_core_entity_links
      where project_id=p_project_id and source_type='issue' and source_id=p_issue_id
        and target_type='document' and target_id=v_existing.drive_document_id and relation_type=v_existing.relation_type
      limit 1;
      return jsonb_build_object('attachment',to_jsonb(v_existing),'link',to_jsonb(v_link),'created',false,'updated',false);
    end if;

    if not exists (
      select 1 from public.project_issue_attachments other
      where other.project_id=p_project_id and other.issue_id=p_issue_id and other.deleted_at is null
        and other.id<>v_existing.id and other.drive_document_id=v_existing.drive_document_id
        and other.relation_type=v_existing.relation_type
    ) then
      delete from public.project_core_entity_links
      where project_id=p_project_id and source_type='issue' and source_id=p_issue_id
        and target_type='document' and target_id=v_existing.drive_document_id and relation_type=v_existing.relation_type;
    end if;

    update public.project_issue_attachments set
      relation_type=v_relation,
      drive_document_id=v_document_id,
      drive_version_id=v_version_id,
      file_name=left(v_version.original_name,500),
      mime_type=left(coalesce(nullif(v_version.mime_type,''),'application/octet-stream'),240),
      size_bytes=v_version.size_bytes,
      sha256=v_version.sha256,
      metadata=metadata || v_metadata,
      version=version+1,
      updated_by=p_actor_user_id,
      updated_by_name=left(coalesce(nullif(btrim(p_actor_name),''),p_actor_user_id),240),
      updated_at=now()
    where id=v_existing.id
    returning * into v_attachment;

    insert into public.project_core_entity_links(
      id,project_id,source_type,source_id,target_type,target_id,relation_type,created_at,created_by
    ) values (
      'project-link-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),
      p_project_id,'issue',p_issue_id,'document',v_document_id,v_relation,now(),p_actor_user_id
    ) on conflict do nothing;

    select * into v_link
    from public.project_core_entity_links
    where project_id=p_project_id and source_type='issue' and source_id=p_issue_id
      and target_type='document' and target_id=v_document_id and relation_type=v_relation
    limit 1;

    insert into public.project_core_audit_events(
      id,project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata
    ) values (
      'project-audit-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),
      p_project_id,p_actor_user_id,'PROJECT_ISSUE_ATTACHMENT_UPDATED','issue',p_issue_id,
      'HJ melléklet frissítve: '||v_issue.serial||' / '||v_attachment.file_name,
      jsonb_build_object('issueId',p_issue_id,'serial',v_issue.serial,'attachmentId',v_attachment.id,'attachmentKind',v_kind,'fieldAttachmentId',v_field_id,'driveDocumentId',v_document_id,'driveVersionId',v_version_id,'attachmentVersion',v_attachment.version)
    );

    return jsonb_build_object('attachment',to_jsonb(v_attachment),'link',to_jsonb(v_link),'created',false,'updated',true);
  end if;

  insert into public.project_issue_attachments(
    id,project_id,issue_id,attachment_kind,field_attachment_id,relation_type,
    drive_document_id,drive_version_id,file_name,mime_type,size_bytes,sha256,metadata,version,
    created_by,created_by_name,updated_by,updated_by_name,created_at,updated_at
  ) values (
    'project-issue-attachment-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,p_issue_id,v_kind,v_field_id,v_relation,v_document_id,v_version_id,
    left(v_version.original_name,500),left(coalesce(nullif(v_version.mime_type,''),'application/octet-stream'),240),
    v_version.size_bytes,v_version.sha256,v_metadata,1,
    p_actor_user_id,left(coalesce(nullif(btrim(p_actor_name),''),p_actor_user_id),240),
    p_actor_user_id,left(coalesce(nullif(btrim(p_actor_name),''),p_actor_user_id),240),now(),now()
  ) returning * into v_attachment;

  insert into public.project_core_entity_links(
    id,project_id,source_type,source_id,target_type,target_id,relation_type,created_at,created_by
  ) values (
    'project-link-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,'issue',p_issue_id,'document',v_document_id,v_relation,now(),p_actor_user_id
  ) on conflict do nothing;

  select * into v_link
  from public.project_core_entity_links
  where project_id=p_project_id and source_type='issue' and source_id=p_issue_id
    and target_type='document' and target_id=v_document_id and relation_type=v_relation
  limit 1;

  insert into public.project_core_audit_events(
    id,project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata
  ) values (
    'project-audit-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'PROJECT_ISSUE_ATTACHMENT_LINKED','issue',p_issue_id,
    'HJ melléklet kapcsolva: '||v_issue.serial||' / '||v_attachment.file_name,
    jsonb_build_object('issueId',p_issue_id,'serial',v_issue.serial,'attachmentId',v_attachment.id,'attachmentKind',v_kind,'fieldAttachmentId',v_field_id,'driveDocumentId',v_document_id,'driveVersionId',v_version_id,'relationType',v_relation)
  );

  return jsonb_build_object('attachment',to_jsonb(v_attachment),'link',to_jsonb(v_link),'created',true,'updated',false);
exception
  when unique_violation then
    select * into v_existing
    from public.project_issue_attachments
    where project_id=p_project_id and issue_id=p_issue_id and attachment_kind=v_kind and field_attachment_id=v_field_id and deleted_at is null
    limit 1;
    if v_existing.id is not null then
      select * into v_link
      from public.project_core_entity_links
      where project_id=p_project_id and source_type='issue' and source_id=p_issue_id
        and target_type='document' and target_id=v_existing.drive_document_id and relation_type=v_existing.relation_type
      limit 1;
      return jsonb_build_object('attachment',to_jsonb(v_existing),'link',to_jsonb(v_link),'created',false,'updated',false);
    end if;
    raise;
end;
$$;

revoke all on function public.project_issue_attachment_link_atomic(text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.project_issue_attachment_link_atomic(text,text,jsonb,text,text) to service_role;

create or replace function public.project_issue_attachment_unlink_atomic(
  p_project_id text,
  p_issue_id text,
  p_attachment_id text,
  p_expected_version integer,
  p_actor_user_id text,
  p_actor_name text
) returns public.project_issue_attachments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issue public.project_core_issues;
  v_attachment public.project_issue_attachments;
begin
  select * into v_issue
  from public.project_core_issues
  where id=p_issue_id and project_id=p_project_id and deleted_at is null
  limit 1;
  if v_issue.id is null then
    raise exception 'PROJECT_ISSUE_NOT_FOUND' using errcode='P0002';
  end if;

  select * into v_attachment
  from public.project_issue_attachments
  where id=p_attachment_id and project_id=p_project_id and issue_id=p_issue_id and deleted_at is null
  for update;
  if v_attachment.id is null then
    raise exception 'PROJECT_ISSUE_ATTACHMENT_NOT_FOUND' using errcode='P0002';
  end if;
  if p_expected_version is null or p_expected_version < 1 or v_attachment.version <> p_expected_version then
    raise exception 'PROJECT_ISSUE_ATTACHMENT_VERSION_CONFLICT' using errcode='P0001';
  end if;

  if not exists (
    select 1 from public.project_issue_attachments other
    where other.project_id=p_project_id and other.issue_id=p_issue_id and other.deleted_at is null
      and other.id<>v_attachment.id and other.drive_document_id=v_attachment.drive_document_id
      and other.relation_type=v_attachment.relation_type
  ) then
    delete from public.project_core_entity_links
    where project_id=p_project_id and source_type='issue' and source_id=p_issue_id
      and target_type='document' and target_id=v_attachment.drive_document_id and relation_type=v_attachment.relation_type;
  end if;

  update public.project_issue_attachments set
    version=version+1,
    deleted_at=now(),
    deleted_by=p_actor_user_id,
    updated_by=p_actor_user_id,
    updated_by_name=left(coalesce(nullif(btrim(p_actor_name),''),p_actor_user_id),240),
    updated_at=now()
  where id=v_attachment.id
  returning * into v_attachment;

  insert into public.project_core_audit_events(
    id,project_id,actor_user_id,event_type,entity_type,entity_id,summary,metadata
  ) values (
    'project-audit-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,p_actor_user_id,'PROJECT_ISSUE_ATTACHMENT_UNLINKED','issue',p_issue_id,
    'HJ melléklet kapcsolat megszüntetve: '||v_issue.serial||' / '||v_attachment.file_name,
    jsonb_build_object('issueId',p_issue_id,'serial',v_issue.serial,'attachmentId',v_attachment.id,'driveDocumentId',v_attachment.drive_document_id,'driveVersionId',v_attachment.drive_version_id,'attachmentVersion',v_attachment.version)
  );

  return v_attachment;
end;
$$;

revoke all on function public.project_issue_attachment_unlink_atomic(text,text,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.project_issue_attachment_unlink_atomic(text,text,text,integer,text,text) to service_role;

insert into public.project_issue_schema_meta(component,schema_version,migration_count,bootstrap_id,updated_at)
values ('project-issue-core','0.4.0',4,'project-issue-core-v040-20260815',now())
on conflict(component) do update set
  schema_version=excluded.schema_version,
  migration_count=excluded.migration_count,
  bootstrap_id=excluded.bootstrap_id,
  updated_at=now();

commit;
