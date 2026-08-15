-- DIMPRO Drive Workspace 1.0.0
-- Inkrementális kiegészítés a meglévő DRIVE Core 0.3.x / Object Storage 0.4.x fölé.
-- Nem módosítja a drive_core_schema_meta 0.3.0 markerét, ezért a jelenlegi éles release kompatibilis marad.

begin;

-- Előfeltételek: Project Core + DRIVE Core 0.3.0.
do $$
begin
  if to_regclass('public.project_core_projects') is null
     or to_regclass('public.project_core_audit_events') is null
     or to_regclass('public.drive_core_documents') is null
     or to_regclass('public.drive_core_document_versions') is null
     or to_regclass('public.drive_core_change_events') is null then
    raise exception 'DIMPRO_DRIVE_CORE_REQUIRED' using errcode = 'P0001';
  end if;
end $$;

create table if not exists public.drive_workspace_schema_meta (
  component text primary key,
  schema_version text not null,
  migration_count integer not null default 0,
  bootstrap_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drive_core_document_metadata (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  document_id text not null references public.drive_core_documents(id) on delete cascade,
  plan_no text not null default '',
  discipline text not null default '',
  document_type text not null default '',
  revision text not null default '',
  issue_status text not null default '',
  approval_status text not null default '',
  building text not null default '',
  level text not null default '',
  zone text not null default '',
  extra jsonb not null default '{}'::jsonb,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drive_core_document_metadata_document_unique unique (document_id),
  constraint drive_core_document_metadata_plan_no_check check (length(plan_no) <= 120),
  constraint drive_core_document_metadata_discipline_check check (length(discipline) <= 120),
  constraint drive_core_document_metadata_type_check check (length(document_type) <= 120),
  constraint drive_core_document_metadata_revision_check check (length(revision) <= 80),
  constraint drive_core_document_metadata_status_check check (length(issue_status) <= 120 and length(approval_status) <= 120),
  constraint drive_core_document_metadata_location_check check (length(building) <= 160 and length(level) <= 120 and length(zone) <= 160)
);

create table if not exists public.drive_core_file_notes (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  document_id text not null references public.drive_core_documents(id) on delete cascade,
  version_id text null references public.drive_core_document_versions(id) on delete cascade,
  note text not null default '',
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drive_core_file_notes_note_check check (length(note) <= 8000)
);

create unique index if not exists drive_core_file_notes_scope_unique
  on public.drive_core_file_notes (document_id, coalesce(version_id,''));

create table if not exists public.drive_core_qr_codes (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  document_id text not null references public.drive_core_documents(id) on delete cascade,
  version_id text null references public.drive_core_document_versions(id) on delete cascade,
  public_key text not null unique,
  status text not null default 'ACTIVE',
  created_by text not null,
  created_at timestamptz not null default now(),
  revoked_by text null,
  revoked_at timestamptz null,
  constraint drive_core_qr_status_check check (status in ('ACTIVE','REVOKED')),
  constraint drive_core_qr_public_key_check check (length(public_key) between 16 and 160)
);

create unique index if not exists drive_core_qr_active_scope_unique
  on public.drive_core_qr_codes (document_id, coalesce(version_id,'')) where status = 'ACTIVE';

create table if not exists public.drive_core_boxes (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  name text not null,
  purpose text not null default 'GENERAL',
  color_token text not null default 'neutral',
  icon_key text not null default 'box',
  note text not null default '',
  sort_order integer not null default 100,
  status text not null default 'ACTIVE',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drive_core_boxes_name_check check (length(btrim(name)) between 1 and 120),
  constraint drive_core_boxes_purpose_check check (purpose in ('GENERAL','DROP','COMPARE','AI_ANALYSIS','ISSUE','MEETING')),
  constraint drive_core_boxes_color_check check (length(color_token) between 1 and 40),
  constraint drive_core_boxes_icon_check check (length(icon_key) between 1 and 80),
  constraint drive_core_boxes_note_check check (length(note) <= 2000),
  constraint drive_core_boxes_sort_check check (sort_order between 0 and 999999),
  constraint drive_core_boxes_status_check check (status in ('ACTIVE','ARCHIVED'))
);

create index if not exists drive_core_boxes_project_status_idx
  on public.drive_core_boxes (project_id, status, sort_order, created_at);

create table if not exists public.drive_core_box_items (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  box_id text not null references public.drive_core_boxes(id) on delete cascade,
  document_id text not null references public.drive_core_documents(id) on delete cascade,
  version_id text null references public.drive_core_document_versions(id) on delete restrict,
  sort_order integer not null default 100,
  added_by text not null,
  added_at timestamptz not null default now(),
  constraint drive_core_box_items_sort_check check (sort_order between 0 and 999999)
);

create unique index if not exists drive_core_box_items_scope_unique
  on public.drive_core_box_items (box_id, document_id, coalesce(version_id,''));
create index if not exists drive_core_box_items_project_box_idx
  on public.drive_core_box_items (project_id, box_id, sort_order, added_at);

create table if not exists public.drive_core_saved_views (
  id text primary key,
  project_id text not null references public.project_core_projects(id) on delete cascade,
  user_id text not null,
  name text not null,
  mode text not null default 'SIMPLE',
  columns jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drive_core_saved_views_name_check check (length(btrim(name)) between 1 and 120),
  constraint drive_core_saved_views_mode_check check (mode in ('SIMPLE','ENGINEERING'))
);

create index if not exists drive_core_saved_views_project_user_idx
  on public.drive_core_saved_views (project_id, user_id, mode, updated_at desc);

alter table public.drive_workspace_schema_meta enable row level security;
alter table public.drive_core_document_metadata enable row level security;
alter table public.drive_core_file_notes enable row level security;
alter table public.drive_core_qr_codes enable row level security;
alter table public.drive_core_boxes enable row level security;
alter table public.drive_core_box_items enable row level security;
alter table public.drive_core_saved_views enable row level security;

revoke all on public.drive_workspace_schema_meta from anon, authenticated;
revoke all on public.drive_core_document_metadata from anon, authenticated;
revoke all on public.drive_core_file_notes from anon, authenticated;
revoke all on public.drive_core_qr_codes from anon, authenticated;
revoke all on public.drive_core_boxes from anon, authenticated;
revoke all on public.drive_core_box_items from anon, authenticated;
revoke all on public.drive_core_saved_views from anon, authenticated;

-- A change- és projektaudit új Drive Workspace objektumtípusai.
alter table public.drive_core_change_events drop constraint if exists drive_core_changes_entity_type_check;
alter table public.drive_core_change_events add constraint drive_core_changes_entity_type_check
  check (entity_type in ('folder','document','document_version','sync','metadata','note','qr','box','box_item','saved_view','compare_job','ai_job'));

alter table public.project_core_audit_events drop constraint if exists project_core_audit_entity_type_check;
alter table public.project_core_audit_events add constraint project_core_audit_entity_type_check
  check (entity_type in (
    -- Meglévő Project Core / Calendar / Dialog / Decide / Diary típusok megőrzése kötelező.
    'project','membership','lifecycle','folder','document','document_version','sync',
    'calendar_event','dialog_thread','dialog_message',
    'decide_request','decide_approver','decide_note',
    'diary_entry','diary_event',
    -- Drive Workspace 1.0 bővítések.
    'metadata','note','qr','box','box_item','saved_view','compare_job','ai_job'
  ));


-- Projektizolált, auditált metadata update.
create or replace function public.drive_workspace_upsert_metadata_atomic(
  p_project_id text,
  p_document_id text,
  p_payload jsonb,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.drive_core_documents;
  v_row public.drive_core_document_metadata;
  v_id text;
begin
  select * into v_document from public.drive_core_documents
    where id = p_document_id and project_id = p_project_id and status <> 'DELETED';
  if v_document.id is null then
    raise exception 'DRIVE_DOCUMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_id := coalesce(nullif(p_payload->>'id',''), 'drive-meta-' || substr(replace(gen_random_uuid()::text,'-',''),1,12));
  insert into public.drive_core_document_metadata (
    id, project_id, document_id, plan_no, discipline, document_type, revision,
    issue_status, approval_status, building, level, zone, extra, updated_by, created_at, updated_at
  ) values (
    v_id, p_project_id, p_document_id,
    left(coalesce(p_payload->>'planNo',''),120),
    left(coalesce(p_payload->>'discipline',''),120),
    left(coalesce(p_payload->>'documentType',''),120),
    left(coalesce(p_payload->>'revision',''),80),
    left(coalesce(p_payload->>'issueStatus',''),120),
    left(coalesce(p_payload->>'approvalStatus',''),120),
    left(coalesce(p_payload->>'building',''),160),
    left(coalesce(p_payload->>'level',''),120),
    left(coalesce(p_payload->>'zone',''),160),
    coalesce(p_payload->'extra','{}'::jsonb),
    p_actor_user_id, now(), now()
  )
  on conflict (document_id) do update set
    plan_no = excluded.plan_no,
    discipline = excluded.discipline,
    document_type = excluded.document_type,
    revision = excluded.revision,
    issue_status = excluded.issue_status,
    approval_status = excluded.approval_status,
    building = excluded.building,
    level = excluded.level,
    zone = excluded.zone,
    extra = excluded.extra,
    updated_by = p_actor_user_id,
    updated_at = now()
  returning * into v_row;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id, p_actor_user_id, 'DRIVE_METADATA_UPDATED', 'metadata', v_row.id,
    'DRIVE mérnöki metaadat frissítve: ' || v_document.name,
    jsonb_build_object('documentId',p_document_id,'metadataId',v_row.id)
  );

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id, 'METADATA_UPDATED', 'metadata', v_row.id,
    jsonb_build_object('documentId',p_document_id,'metadata',to_jsonb(v_row)), p_actor_user_id
  );

  return to_jsonb(v_row);
end;
$$;

create or replace function public.drive_workspace_upsert_note_atomic(
  p_project_id text,
  p_document_id text,
  p_version_id text,
  p_note text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.drive_core_documents;
  v_version public.drive_core_document_versions;
  v_row public.drive_core_file_notes;
begin
  select * into v_document from public.drive_core_documents
    where id = p_document_id and project_id = p_project_id and status <> 'DELETED';
  if v_document.id is null then
    raise exception 'DRIVE_DOCUMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if nullif(p_version_id,'') is not null then
    select * into v_version from public.drive_core_document_versions
      where id = p_version_id and project_id = p_project_id and document_id = p_document_id;
    if v_version.id is null then
      raise exception 'DRIVE_VERSION_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  select * into v_row from public.drive_core_file_notes
    where project_id = p_project_id and document_id = p_document_id
      and coalesce(version_id,'') = coalesce(nullif(p_version_id,''),'')
    limit 1 for update;

  if v_row.id is null then
    insert into public.drive_core_file_notes (
      id, project_id, document_id, version_id, note, updated_by, created_at, updated_at
    ) values (
      'drive-note-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
      p_project_id, p_document_id, nullif(p_version_id,''), left(coalesce(p_note,''),8000),
      p_actor_user_id, now(), now()
    ) returning * into v_row;
  else
    update public.drive_core_file_notes set
      note = left(coalesce(p_note,''),8000), updated_by = p_actor_user_id, updated_at = now()
    where id = v_row.id returning * into v_row;
  end if;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id, p_actor_user_id, 'DRIVE_FILE_NOTE_UPDATED', 'note', v_row.id,
    'DRIVE fájlmegjegyzés frissítve: ' || v_document.name,
    jsonb_build_object('documentId',p_document_id,'versionId',nullif(p_version_id,''),'noteId',v_row.id)
  );

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id, 'FILE_NOTE_UPDATED', 'note', v_row.id,
    jsonb_build_object('documentId',p_document_id,'versionId',nullif(p_version_id,''),'note',to_jsonb(v_row)), p_actor_user_id
  );

  return to_jsonb(v_row);
end;
$$;

create or replace function public.drive_workspace_ensure_qr_atomic(
  p_project_id text,
  p_document_id text,
  p_version_id text,
  p_public_key text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.drive_core_documents;
  v_version public.drive_core_document_versions;
  v_row public.drive_core_qr_codes;
begin
  select * into v_document from public.drive_core_documents
    where id = p_document_id and project_id = p_project_id and status <> 'DELETED';
  if v_document.id is null then
    raise exception 'DRIVE_DOCUMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if nullif(p_version_id,'') is not null then
    select * into v_version from public.drive_core_document_versions
      where id = p_version_id and project_id = p_project_id and document_id = p_document_id;
    if v_version.id is null then
      raise exception 'DRIVE_VERSION_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  select * into v_row from public.drive_core_qr_codes
    where project_id = p_project_id and document_id = p_document_id
      and coalesce(version_id,'') = coalesce(nullif(p_version_id,''),'') and status = 'ACTIVE'
    order by created_at desc limit 1;
  if v_row.id is not null then
    return jsonb_build_object('qr',to_jsonb(v_row),'idempotent',true);
  end if;

  insert into public.drive_core_qr_codes (
    id, project_id, document_id, version_id, public_key, status, created_by, created_at
  ) values (
    'drive-qr-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id, p_document_id, nullif(p_version_id,''), p_public_key, 'ACTIVE', p_actor_user_id, now()
  ) returning * into v_row;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id, p_actor_user_id, 'DRIVE_QR_CREATED', 'qr', v_row.id,
    'DRIVE QR azonosító létrehozva: ' || v_document.name,
    jsonb_build_object('documentId',p_document_id,'versionId',nullif(p_version_id,''),'qrId',v_row.id)
  );

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id, 'QR_CREATED', 'qr', v_row.id,
    jsonb_build_object('documentId',p_document_id,'versionId',nullif(p_version_id,''),'qrId',v_row.id), p_actor_user_id
  );

  return jsonb_build_object('qr',to_jsonb(v_row),'idempotent',false);
end;
$$;



-- CsomagBOX: projektizolált, auditált virtuális doboz létrehozás.
create or replace function public.drive_workspace_create_box_atomic(
  p_project_id text,
  p_name text,
  p_purpose text,
  p_color_token text,
  p_icon_key text,
  p_note text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.drive_core_boxes;
  v_sort integer;
begin
  if not exists (select 1 from public.project_core_projects where id = p_project_id) then
    raise exception 'DRIVE_PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select coalesce(max(sort_order),0) + 100 into v_sort
    from public.drive_core_boxes where project_id = p_project_id and status = 'ACTIVE';

  insert into public.drive_core_boxes (
    id, project_id, name, purpose, color_token, icon_key, note, sort_order, status, created_by, created_at, updated_at
  ) values (
    'drive-box-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,
    left(btrim(coalesce(p_name,'')),120),
    case when p_purpose in ('GENERAL','DROP','COMPARE','AI_ANALYSIS','ISSUE','MEETING') then p_purpose else 'GENERAL' end,
    left(coalesce(nullif(btrim(p_color_token),''),'blue'),40),
    left(coalesce(nullif(btrim(p_icon_key),''),'box'),80),
    left(coalesce(p_note,''),2000),
    least(v_sort,999999),
    'ACTIVE',
    p_actor_user_id,
    now(),
    now()
  ) returning * into v_row;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id, p_actor_user_id, 'DRIVE_BOX_CREATED', 'box', v_row.id,
    'CsomagBOX létrehozva: ' || v_row.name,
    jsonb_build_object('boxId',v_row.id,'purpose',v_row.purpose,'colorToken',v_row.color_token)
  );

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id, 'BOX_CREATED', 'box', v_row.id, to_jsonb(v_row), p_actor_user_id
  );

  return to_jsonb(v_row);
end;
$$;

-- CsomagBOX: ugyanaz a dokumentum több BOX-ban lehet, ugyanazon BOX-on belül idempotens.
create or replace function public.drive_workspace_add_box_item_atomic(
  p_project_id text,
  p_box_id text,
  p_document_id text,
  p_version_id text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box public.drive_core_boxes;
  v_document public.drive_core_documents;
  v_version public.drive_core_document_versions;
  v_row public.drive_core_box_items;
  v_sort integer;
begin
  select * into v_box from public.drive_core_boxes
    where id = p_box_id and project_id = p_project_id and status = 'ACTIVE';
  if v_box.id is null then
    raise exception 'DRIVE_BOX_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_document from public.drive_core_documents
    where id = p_document_id and project_id = p_project_id and status <> 'DELETED';
  if v_document.id is null then
    raise exception 'DRIVE_DOCUMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if nullif(p_version_id,'') is not null then
    select * into v_version from public.drive_core_document_versions
      where id = p_version_id and project_id = p_project_id and document_id = p_document_id;
    if v_version.id is null then
      raise exception 'DRIVE_VERSION_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  select * into v_row from public.drive_core_box_items
    where box_id = p_box_id and document_id = p_document_id
      and coalesce(version_id,'') = coalesce(nullif(p_version_id,''),'')
    limit 1;
  if v_row.id is not null then
    return jsonb_build_object('item',to_jsonb(v_row),'idempotent',true);
  end if;

  select coalesce(max(sort_order),0) + 100 into v_sort
    from public.drive_core_box_items where project_id = p_project_id and box_id = p_box_id;

  insert into public.drive_core_box_items (
    id, project_id, box_id, document_id, version_id, sort_order, added_by, added_at
  ) values (
    'drive-boxitem-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id, p_box_id, p_document_id, nullif(p_version_id,''), least(v_sort,999999), p_actor_user_id, now()
  ) returning * into v_row;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id, p_actor_user_id, 'DRIVE_BOX_ITEM_ADDED', 'box_item', v_row.id,
    'Fájl CsomagBOX-hoz adva: ' || v_document.name || ' → ' || v_box.name,
    jsonb_build_object('boxId',p_box_id,'documentId',p_document_id,'versionId',nullif(p_version_id,''),'boxItemId',v_row.id)
  );

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id, 'BOX_ITEM_ADDED', 'box_item', v_row.id,
    jsonb_build_object('boxId',p_box_id,'documentId',p_document_id,'versionId',nullif(p_version_id,''),'item',to_jsonb(v_row)), p_actor_user_id
  );

  return jsonb_build_object('item',to_jsonb(v_row),'idempotent',false);
end;
$$;

create or replace function public.drive_workspace_remove_box_item_atomic(
  p_project_id text,
  p_box_id text,
  p_item_id text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box public.drive_core_boxes;
  v_row public.drive_core_box_items;
  v_document public.drive_core_documents;
begin
  select * into v_box from public.drive_core_boxes
    where id = p_box_id and project_id = p_project_id and status = 'ACTIVE';
  if v_box.id is null then
    raise exception 'DRIVE_BOX_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_row from public.drive_core_box_items
    where id = p_item_id and project_id = p_project_id and box_id = p_box_id
    for update;
  if v_row.id is null then
    raise exception 'DRIVE_BOX_ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_document from public.drive_core_documents
    where id = v_row.document_id and project_id = p_project_id;

  delete from public.drive_core_box_items where id = v_row.id;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id, p_actor_user_id, 'DRIVE_BOX_ITEM_REMOVED', 'box_item', v_row.id,
    'Fájl eltávolítva CsomagBOX-ból: ' || coalesce(v_document.name,v_row.document_id) || ' ← ' || v_box.name,
    jsonb_build_object('boxId',p_box_id,'documentId',v_row.document_id,'versionId',v_row.version_id,'boxItemId',v_row.id)
  );

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id, 'BOX_ITEM_REMOVED', 'box_item', v_row.id,
    jsonb_build_object('boxId',p_box_id,'documentId',v_row.document_id,'versionId',v_row.version_id,'removed',to_jsonb(v_row)), p_actor_user_id
  );

  return to_jsonb(v_row);
end;
$$;



-- Commander/fájlkezelő: dokumentum projektizolált, auditált áthelyezése.
create or replace function public.drive_workspace_move_document_atomic(
  p_project_id text,
  p_document_id text,
  p_target_folder_id text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.drive_core_documents;
  v_target public.drive_core_folders;
  v_previous_folder_id text;
begin
  select * into v_document from public.drive_core_documents
    where id = p_document_id and project_id = p_project_id and status <> 'DELETED'
    for update;
  if v_document.id is null then
    raise exception 'DRIVE_DOCUMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_target from public.drive_core_folders
    where id = p_target_folder_id and project_id = p_project_id and status = 'ACTIVE';
  if v_target.id is null then
    raise exception 'DRIVE_TARGET_FOLDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_previous_folder_id := v_document.folder_id;
  if v_previous_folder_id = p_target_folder_id then
    return jsonb_build_object('document',to_jsonb(v_document),'previousFolderId',v_previous_folder_id,'idempotent',true);
  end if;

  update public.drive_core_documents
    set folder_id = p_target_folder_id, updated_at = now()
    where id = p_document_id and project_id = p_project_id
    returning * into v_document;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id, p_actor_user_id, 'DRIVE_DOCUMENT_MOVED', 'document', v_document.id,
    'DRIVE dokumentum áthelyezve: ' || v_document.name,
    jsonb_build_object('documentId',v_document.id,'fromFolderId',v_previous_folder_id,'toFolderId',p_target_folder_id)
  );

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id, 'DOCUMENT_MOVED', 'document', v_document.id,
    jsonb_build_object('documentId',v_document.id,'fromFolderId',v_previous_folder_id,'toFolderId',p_target_folder_id), p_actor_user_id
  );

  return jsonb_build_object('document',to_jsonb(v_document),'previousFolderId',v_previous_folder_id,'idempotent',false);
end;
$$;

revoke all on function public.drive_workspace_move_document_atomic(text,text,text,text) from public, anon, authenticated;
grant execute on function public.drive_workspace_move_document_atomic(text,text,text,text) to service_role;

revoke all on function public.drive_workspace_create_box_atomic(text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.drive_workspace_add_box_item_atomic(text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.drive_workspace_remove_box_item_atomic(text,text,text,text) from public, anon, authenticated;
grant execute on function public.drive_workspace_create_box_atomic(text,text,text,text,text,text,text) to service_role;
grant execute on function public.drive_workspace_add_box_item_atomic(text,text,text,text,text) to service_role;
grant execute on function public.drive_workspace_remove_box_item_atomic(text,text,text,text) to service_role;

revoke all on function public.drive_workspace_upsert_metadata_atomic(text,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.drive_workspace_upsert_note_atomic(text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.drive_workspace_ensure_qr_atomic(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.drive_workspace_upsert_metadata_atomic(text,text,jsonb,text) to service_role;
grant execute on function public.drive_workspace_upsert_note_atomic(text,text,text,text,text) to service_role;
grant execute on function public.drive_workspace_ensure_qr_atomic(text,text,text,text,text) to service_role;

insert into public.drive_workspace_schema_meta (component, schema_version, migration_count, bootstrap_id, updated_at)
values ('drive-workspace','1.0.0',1,'drive-workspace-v100-20260807',now())
on conflict (component) do update set
  schema_version = excluded.schema_version,
  migration_count = excluded.migration_count,
  bootstrap_id = excluded.bootstrap_id,
  updated_at = now();

commit;
