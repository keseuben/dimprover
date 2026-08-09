-- DIMPRO Projektkapu / Project Core 0.2.0
-- Idempotens PostgreSQL/Supabase séma, repository RPC-k és file-state bootstrap.
begin;

create table if not exists public.project_core_schema_meta (
  component text primary key,
  schema_version text not null,
  migration_count integer not null default 0,
  bootstrap_id text not null,
  state_bootstrapped_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_core_projects (
  id text primary key,
  organization_id text null,
  code text not null,
  name text not null,
  description text not null default '',
  status text not null default 'DRAFT',
  progress_percent integer not null default 0,
  current_phase text not null default 'Előkészítés',
  starts_at timestamptz null,
  ends_at timestamptz null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_core_projects_code_unique unique (code),
  constraint project_core_projects_status_check check (status in ('DRAFT','ACTIVE','CLOSING','READ_ONLY','ARCHIVED','DELETION_SCHEDULED','DELETED')),
  constraint project_core_projects_progress_check check (progress_percent between 0 and 100),
  constraint project_core_projects_dates_check check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create table if not exists public.project_core_memberships (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  user_id text not null,
  email text null,
  display_name text not null,
  organization_name text null,
  role text not null,
  status text not null default 'INVITED',
  invited_at timestamptz not null default now(),
  accepted_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint project_core_memberships_role_check check (role in ('OWNER','PROJECT_MANAGER','CONTRIBUTOR','REVIEWER','VIEWER')),
  constraint project_core_memberships_status_check check (status in ('INVITED','ACTIVE','SUSPENDED','REVOKED'))
);

create table if not exists public.project_core_audit_events (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  actor_user_id text not null,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint project_core_audit_entity_type_check check (entity_type in ('project','membership','lifecycle'))
);

create table if not exists public.project_core_entity_links (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  target_type text not null,
  target_id text not null,
  relation_type text not null,
  created_at timestamptz not null default now(),
  created_by text not null,
  constraint project_core_entity_links_relation_check check (relation_type in ('RELATES_TO','CREATED_FROM','RESOLVES','BLOCKS','EVIDENCE','ATTACHMENT','APPROVAL_FOR','HANDOVER_ITEM')),
  constraint project_core_entity_links_no_self_check check (not (source_type = target_type and source_id = target_id))
);

create index if not exists project_core_projects_org_idx on public.project_core_projects (organization_id, status);
create index if not exists project_core_projects_updated_idx on public.project_core_projects (updated_at desc);
create index if not exists project_core_memberships_project_idx on public.project_core_memberships (project_id, status);
create index if not exists project_core_memberships_user_idx on public.project_core_memberships (lower(user_id), status);
create index if not exists project_core_memberships_email_idx on public.project_core_memberships (lower(email), status) where email is not null;
create unique index if not exists project_core_memberships_active_user_unique on public.project_core_memberships (project_id, lower(user_id)) where status <> 'REVOKED';
create index if not exists project_core_audit_project_created_idx on public.project_core_audit_events (project_id, created_at desc);
create index if not exists project_core_entity_links_source_idx on public.project_core_entity_links (project_id, source_type, source_id);
create index if not exists project_core_entity_links_target_idx on public.project_core_entity_links (project_id, target_type, target_id);

alter table public.project_core_schema_meta enable row level security;
alter table public.project_core_projects enable row level security;
alter table public.project_core_memberships enable row level security;
alter table public.project_core_audit_events enable row level security;
alter table public.project_core_entity_links enable row level security;

revoke all on public.project_core_schema_meta from anon, authenticated;
revoke all on public.project_core_projects from anon, authenticated;
revoke all on public.project_core_memberships from anon, authenticated;
revoke all on public.project_core_audit_events from anon, authenticated;
revoke all on public.project_core_entity_links from anon, authenticated;

create or replace function public.project_core_create_project_atomic(
  p_project jsonb,
  p_membership jsonb,
  p_audit jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.project_core_projects;
  v_membership public.project_core_memberships;
begin
  insert into public.project_core_projects (
    id, organization_id, code, name, description, status, progress_percent, current_phase,
    starts_at, ends_at, created_by, created_at, updated_at
  ) values (
    p_project->>'id', nullif(p_project->>'organization_id',''), p_project->>'code', p_project->>'name',
    coalesce(p_project->>'description',''), coalesce(p_project->>'status','DRAFT'),
    coalesce((p_project->>'progress_percent')::integer,0), coalesce(p_project->>'current_phase','Előkészítés'),
    nullif(p_project->>'starts_at','')::timestamptz, nullif(p_project->>'ends_at','')::timestamptz,
    p_project->>'created_by', coalesce(nullif(p_project->>'created_at','')::timestamptz,now()),
    coalesce(nullif(p_project->>'updated_at','')::timestamptz,now())
  ) returning * into v_project;

  insert into public.project_core_memberships (
    id, project_id, user_id, email, display_name, organization_name, role, status,
    invited_at, accepted_at, updated_at
  ) values (
    p_membership->>'id', p_membership->>'project_id', p_membership->>'user_id', nullif(p_membership->>'email',''),
    p_membership->>'display_name', nullif(p_membership->>'organization_name',''), p_membership->>'role',
    p_membership->>'status', coalesce(nullif(p_membership->>'invited_at','')::timestamptz,now()),
    nullif(p_membership->>'accepted_at','')::timestamptz,
    coalesce(nullif(p_membership->>'updated_at','')::timestamptz,now())
  ) returning * into v_membership;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata, created_at
  ) values (
    p_audit->>'id', p_audit->>'project_id', p_audit->>'actor_user_id', p_audit->>'event_type',
    p_audit->>'entity_type', p_audit->>'entity_id', p_audit->>'summary',
    coalesce(p_audit->'metadata','{}'::jsonb), coalesce(nullif(p_audit->>'created_at','')::timestamptz,now())
  );

  return jsonb_build_object('project',to_jsonb(v_project),'membership',to_jsonb(v_membership));
end;
$$;

create or replace function public.project_core_update_project_atomic(
  p_project_id text,
  p_patch jsonb,
  p_actor_user_id text,
  p_summary text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.project_core_projects;
begin
  update public.project_core_projects
  set name = coalesce(p_patch->>'name',name),
      description = coalesce(p_patch->>'description',description),
      code = coalesce(p_patch->>'code',code),
      current_phase = coalesce(p_patch->>'current_phase',current_phase),
      progress_percent = coalesce((p_patch->>'progress_percent')::integer,progress_percent),
      starts_at = case when p_patch ? 'starts_at' then nullif(p_patch->>'starts_at','')::timestamptz else starts_at end,
      ends_at = case when p_patch ? 'ends_at' then nullif(p_patch->>'ends_at','')::timestamptz else ends_at end,
      updated_at = coalesce(nullif(p_patch->>'updated_at','')::timestamptz,now())
  where id = p_project_id and status <> 'DELETED'
  returning * into v_project;

  if v_project.id is null then
    raise exception 'PROJECT_CORE_PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12), p_project_id, p_actor_user_id,
    'PROJECT_UPDATED','project',p_project_id,p_summary,'{}'::jsonb
  );
  return to_jsonb(v_project);
end;
$$;

create or replace function public.project_core_add_membership_atomic(
  p_project_id text,
  p_membership jsonb,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership public.project_core_memberships;
begin
  if not exists (select 1 from public.project_core_projects where id = p_project_id and status <> 'DELETED') then
    raise exception 'PROJECT_CORE_PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.project_core_memberships (
    id, project_id, user_id, email, display_name, organization_name, role, status,
    invited_at, accepted_at, updated_at
  ) values (
    p_membership->>'id', p_project_id, p_membership->>'user_id', nullif(p_membership->>'email',''),
    p_membership->>'display_name', nullif(p_membership->>'organization_name',''), p_membership->>'role',
    p_membership->>'status', coalesce(nullif(p_membership->>'invited_at','')::timestamptz,now()),
    nullif(p_membership->>'accepted_at','')::timestamptz,
    coalesce(nullif(p_membership->>'updated_at','')::timestamptz,now())
  ) returning * into v_membership;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12), p_project_id, p_actor_user_id,
    'PROJECT_MEMBER_INVITED','membership',v_membership.id,
    'Projekt-résztvevő hozzáadva: ' || v_membership.display_name,
    jsonb_build_object('role',v_membership.role,'status',v_membership.status)
  );
  return to_jsonb(v_membership);
end;
$$;

create or replace function public.project_core_change_lifecycle_atomic(
  p_project_id text,
  p_expected_status text,
  p_next_status text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.project_core_projects;
begin
  if not (
    (p_expected_status = 'DRAFT' and p_next_status in ('ACTIVE','DELETION_SCHEDULED')) or
    (p_expected_status = 'ACTIVE' and p_next_status = 'CLOSING') or
    (p_expected_status = 'CLOSING' and p_next_status in ('ACTIVE','READ_ONLY')) or
    (p_expected_status = 'READ_ONLY' and p_next_status = 'ARCHIVED') or
    (p_expected_status = 'ARCHIVED' and p_next_status = 'DELETION_SCHEDULED') or
    (p_expected_status = 'DELETION_SCHEDULED' and p_next_status in ('ARCHIVED','DELETED'))
  ) then
    raise exception 'PROJECT_CORE_INVALID_LIFECYCLE_TRANSITION' using errcode = 'P0001';
  end if;

  update public.project_core_projects
  set status = p_next_status, updated_at = now()
  where id = p_project_id and status = p_expected_status
  returning * into v_project;

  if v_project.id is null then
    raise exception 'PROJECT_CORE_LIFECYCLE_CONFLICT' using errcode = '40001';
  end if;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12), p_project_id, p_actor_user_id,
    'PROJECT_LIFECYCLE_CHANGED','lifecycle',p_project_id,
    'Projektállapot módosítva: ' || p_expected_status || ' → ' || p_next_status,
    jsonb_build_object('previousStatus',p_expected_status,'nextStatus',p_next_status)
  );
  return to_jsonb(v_project);
end;
$$;

create or replace function public.project_core_bootstrap_state(
  p_state jsonb,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_bootstrap timestamptz;
  v_item jsonb;
  v_projects integer := 0;
  v_memberships integer := 0;
  v_audit integer := 0;
begin
  select state_bootstrapped_at into v_existing_bootstrap
  from public.project_core_schema_meta where component = 'project-core' for update;

  if v_existing_bootstrap is not null then
    return jsonb_build_object(
      'projects',(select count(*) from public.project_core_projects),
      'memberships',(select count(*) from public.project_core_memberships),
      'auditEvents',(select count(*) from public.project_core_audit_events),
      'alreadyBootstrapped',true
    );
  end if;

  if exists (select 1 from public.project_core_projects) then
    raise exception 'PROJECT_CORE_BOOTSTRAP_TARGET_NOT_EMPTY' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_state->'projects','[]'::jsonb)) loop
    insert into public.project_core_projects (
      id, organization_id, code, name, description, status, progress_percent, current_phase,
      starts_at, ends_at, created_by, created_at, updated_at
    ) values (
      v_item->>'id', nullif(v_item->>'organization_id',''), v_item->>'code', v_item->>'name',
      coalesce(v_item->>'description',''), v_item->>'status', coalesce((v_item->>'progress_percent')::integer,0),
      coalesce(v_item->>'current_phase','Előkészítés'), nullif(v_item->>'starts_at','')::timestamptz,
      nullif(v_item->>'ends_at','')::timestamptz, v_item->>'created_by',
      coalesce(nullif(v_item->>'created_at','')::timestamptz,now()), coalesce(nullif(v_item->>'updated_at','')::timestamptz,now())
    );
    v_projects := v_projects + 1;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_state->'memberships','[]'::jsonb)) loop
    insert into public.project_core_memberships (
      id, project_id, user_id, email, display_name, organization_name, role, status,
      invited_at, accepted_at, updated_at
    ) values (
      v_item->>'id', v_item->>'project_id', v_item->>'user_id', nullif(v_item->>'email',''),
      v_item->>'display_name', nullif(v_item->>'organization_name',''), v_item->>'role', v_item->>'status',
      coalesce(nullif(v_item->>'invited_at','')::timestamptz,now()), nullif(v_item->>'accepted_at','')::timestamptz,
      coalesce(nullif(v_item->>'updated_at','')::timestamptz,now())
    );
    v_memberships := v_memberships + 1;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_state->'audit_events','[]'::jsonb)) loop
    insert into public.project_core_audit_events (
      id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata, created_at
    ) values (
      v_item->>'id', v_item->>'project_id', v_item->>'actor_user_id', v_item->>'event_type',
      v_item->>'entity_type', v_item->>'entity_id', v_item->>'summary', coalesce(v_item->'metadata','{}'::jsonb),
      coalesce(nullif(v_item->>'created_at','')::timestamptz,now())
    );
    v_audit := v_audit + 1;
  end loop;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  )
  select 'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12), id, p_actor_user_id,
    'PROJECT_CORE_BOOTSTRAPPED','project',id,'A file-backed Project Core állapot PostgreSQL-be emelve.',
    jsonb_build_object('source','file','schemaVersion','0.2.0')
  from public.project_core_projects;

  update public.project_core_schema_meta
  set state_bootstrapped_at = now(), updated_at = now()
  where component = 'project-core';

  return jsonb_build_object('projects',v_projects,'memberships',v_memberships,'auditEvents',v_audit,'alreadyBootstrapped',false);
end;
$$;

revoke all on function public.project_core_create_project_atomic(jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.project_core_update_project_atomic(text,jsonb,text,text) from public, anon, authenticated;
revoke all on function public.project_core_add_membership_atomic(text,jsonb,text) from public, anon, authenticated;
revoke all on function public.project_core_change_lifecycle_atomic(text,text,text,text) from public, anon, authenticated;
revoke all on function public.project_core_bootstrap_state(jsonb,text) from public, anon, authenticated;
grant execute on function public.project_core_create_project_atomic(jsonb,jsonb,jsonb) to service_role;
grant execute on function public.project_core_update_project_atomic(text,jsonb,text,text) to service_role;
grant execute on function public.project_core_add_membership_atomic(text,jsonb,text) to service_role;
grant execute on function public.project_core_change_lifecycle_atomic(text,text,text,text) to service_role;
grant execute on function public.project_core_bootstrap_state(jsonb,text) to service_role;

insert into public.project_core_schema_meta (
  component, schema_version, migration_count, bootstrap_id, updated_at
) values (
  'project-core','0.2.0',1,'project-core-v020-20260802',now()
)
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = excluded.migration_count,
  bootstrap_id = excluded.bootstrap_id,
  updated_at = now();

commit;
