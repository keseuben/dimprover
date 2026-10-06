-- DIMPRO Drive V0.6.6 - Personal CsomagBOX Core V0.1.0
-- Additive USER-owned BOX layer over Content Core. No fake project, no project document duplication.
begin;

create table if not exists public.dimpro_personal_drive_boxes (
  id text primary key,
  owner_user_id uuid not null references public.dimpro_users(id) on delete cascade,
  name text not null,
  purpose text not null default 'GENERAL',
  color_token text not null default 'slate',
  icon_key text not null default 'box',
  note text not null default '',
  sort_order integer not null default 100,
  status text not null default 'ACTIVE',
  lifecycle_status text not null default 'DRAFT',
  ready_at timestamptz null,
  sent_at timestamptz null,
  archived_at timestamptz null,
  created_by_user_id uuid null references public.dimpro_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dimpro_personal_drive_boxes_name_check check (length(btrim(name)) between 1 and 120),
  constraint dimpro_personal_drive_boxes_purpose_check check (purpose in ('GENERAL','DROP','COMPARE','AI_ANALYSIS','ISSUE','MEETING')),
  constraint dimpro_personal_drive_boxes_color_check check (length(color_token) between 1 and 40),
  constraint dimpro_personal_drive_boxes_icon_check check (length(icon_key) between 1 and 80),
  constraint dimpro_personal_drive_boxes_note_check check (length(note) <= 2000),
  constraint dimpro_personal_drive_boxes_sort_check check (sort_order between 0 and 999999),
  constraint dimpro_personal_drive_boxes_status_check check (status in ('ACTIVE','ARCHIVED')),
  constraint dimpro_personal_drive_boxes_lifecycle_check check (lifecycle_status in ('DRAFT','READY','SENT','ARCHIVED')),
  constraint dimpro_personal_drive_boxes_owner_id_unique unique(owner_user_id,id)
);

create index if not exists dimpro_personal_drive_boxes_owner_idx
  on public.dimpro_personal_drive_boxes(owner_user_id,status,lifecycle_status,sort_order,created_at);

create table if not exists public.dimpro_personal_drive_box_folders (
  id text primary key,
  owner_user_id uuid not null references public.dimpro_users(id) on delete cascade,
  box_id text not null references public.dimpro_personal_drive_boxes(id) on delete cascade,
  parent_id text null references public.dimpro_personal_drive_box_folders(id) on delete cascade,
  name text not null,
  sort_order integer not null default 100,
  status text not null default 'ACTIVE',
  created_by_user_id uuid null references public.dimpro_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dimpro_personal_drive_box_folders_name_check check (length(btrim(name)) between 1 and 120 and name !~ '[\\/]'),
  constraint dimpro_personal_drive_box_folders_sort_check check (sort_order between 0 and 999999),
  constraint dimpro_personal_drive_box_folders_status_check check (status in ('ACTIVE','ARCHIVED')),
  constraint dimpro_personal_drive_box_folders_parent_self_check check (parent_id is null or parent_id <> id),
  constraint dimpro_personal_drive_box_folders_owner_box_id_unique unique(owner_user_id,box_id,id),
  constraint dimpro_personal_drive_box_folders_owner_box_fk foreign key(owner_user_id,box_id) references public.dimpro_personal_drive_boxes(owner_user_id,id) on delete cascade,
  constraint dimpro_personal_drive_box_folders_parent_scope_fk foreign key(owner_user_id,box_id,parent_id) references public.dimpro_personal_drive_box_folders(owner_user_id,box_id,id) on delete cascade
);

create unique index if not exists dimpro_personal_drive_box_folders_active_name_unique
  on public.dimpro_personal_drive_box_folders(box_id,coalesce(parent_id,''),lower(btrim(name))) where status='ACTIVE';
create index if not exists dimpro_personal_drive_box_folders_owner_box_idx
  on public.dimpro_personal_drive_box_folders(owner_user_id,box_id,parent_id,sort_order,created_at);

create table if not exists public.dimpro_personal_drive_box_items (
  id text primary key,
  owner_user_id uuid not null references public.dimpro_users(id) on delete cascade,
  box_id text not null references public.dimpro_personal_drive_boxes(id) on delete cascade,
  content_ref_id uuid not null references public.dimpro_content_refs(id) on delete cascade,
  folder_id text null references public.dimpro_personal_drive_box_folders(id) on delete set null,
  sort_order integer not null default 100,
  added_by_user_id uuid null references public.dimpro_users(id) on delete set null,
  added_at timestamptz not null default now(),
  constraint dimpro_personal_drive_box_items_sort_check check (sort_order between 0 and 999999),
  constraint dimpro_personal_drive_box_items_scope_unique unique(box_id,content_ref_id),
  constraint dimpro_personal_drive_box_items_owner_box_fk foreign key(owner_user_id,box_id) references public.dimpro_personal_drive_boxes(owner_user_id,id) on delete cascade,
  constraint dimpro_personal_drive_box_items_owner_box_folder_fk foreign key(owner_user_id,box_id,folder_id) references public.dimpro_personal_drive_box_folders(owner_user_id,box_id,id) on delete set null
);

create index if not exists dimpro_personal_drive_box_items_owner_box_idx
  on public.dimpro_personal_drive_box_items(owner_user_id,box_id,folder_id,sort_order,added_at);

create or replace function public.dimpro_personal_drive_box_item_scope_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists(
    select 1 from public.dimpro_content_refs r
    where r.id=new.content_ref_id
      and r.owner_type='USER'
      and r.owner_user_id=new.owner_user_id
      and r.status='ACTIVE'
  ) then
    raise exception 'PERSONAL_BOX_CONTENT_REF_OWNER_MISMATCH' using errcode='23514';
  end if;
  return new;
end $$;

drop trigger if exists dimpro_personal_drive_box_item_scope_guard_trg on public.dimpro_personal_drive_box_items;
create trigger dimpro_personal_drive_box_item_scope_guard_trg
before insert or update of owner_user_id,content_ref_id on public.dimpro_personal_drive_box_items
for each row execute function public.dimpro_personal_drive_box_item_scope_guard();

create table if not exists public.dimpro_personal_drive_box_events (
  id text primary key,
  owner_user_id uuid not null references public.dimpro_users(id) on delete cascade,
  box_id text not null references public.dimpro_personal_drive_boxes(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  actor_user_id uuid null references public.dimpro_users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint dimpro_personal_drive_box_events_owner_box_fk foreign key(owner_user_id,box_id) references public.dimpro_personal_drive_boxes(owner_user_id,id) on delete cascade
);

create index if not exists dimpro_personal_drive_box_events_owner_box_idx
  on public.dimpro_personal_drive_box_events(owner_user_id,box_id,created_at desc);

alter table public.dimpro_personal_drive_boxes enable row level security;
alter table public.dimpro_personal_drive_box_folders enable row level security;
alter table public.dimpro_personal_drive_box_items enable row level security;
alter table public.dimpro_personal_drive_box_events enable row level security;
revoke all on public.dimpro_personal_drive_boxes, public.dimpro_personal_drive_box_folders, public.dimpro_personal_drive_box_items, public.dimpro_personal_drive_box_events from public, anon, authenticated;
grant select,insert,update,delete on public.dimpro_personal_drive_boxes, public.dimpro_personal_drive_box_folders, public.dimpro_personal_drive_box_items, public.dimpro_personal_drive_box_events to service_role;

create or replace function public.dimpro_personal_drive_create_box_atomic(
  p_owner_user_id uuid,p_name text,p_purpose text,p_color_token text,p_icon_key text,p_note text,p_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_row public.dimpro_personal_drive_boxes; v_sort integer; v_name text;
begin
  if not exists(select 1 from public.dimpro_users where id=p_owner_user_id and status not in ('suspended','disabled','deleted')) then raise exception 'PERSONAL_DRIVE_OWNER_NOT_FOUND' using errcode='P0002'; end if;
  v_name:=left(btrim(coalesce(p_name,'')),120); if length(v_name)=0 then raise exception 'PERSONAL_BOX_NAME_REQUIRED' using errcode='22023'; end if;
  select coalesce(max(sort_order),0)+100 into v_sort from public.dimpro_personal_drive_boxes where owner_user_id=p_owner_user_id and status='ACTIVE';
  insert into public.dimpro_personal_drive_boxes(id,owner_user_id,name,purpose,color_token,icon_key,note,sort_order,status,lifecycle_status,created_by_user_id)
  values('personal-box-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),p_owner_user_id,v_name,case when p_purpose in ('GENERAL','DROP','COMPARE','AI_ANALYSIS','ISSUE','MEETING') then p_purpose else 'GENERAL' end,left(coalesce(nullif(btrim(p_color_token),''),'slate'),40),left(coalesce(nullif(btrim(p_icon_key),''),'box'),80),left(coalesce(p_note,''),2000),least(v_sort,999999),'ACTIVE','DRAFT',p_actor_user_id) returning * into v_row;
  insert into public.dimpro_personal_drive_box_events(id,owner_user_id,box_id,event_type,entity_type,entity_id,summary,metadata,actor_user_id) values('personal-boxevent-'||substr(replace(gen_random_uuid()::text,'-',''),1,18),p_owner_user_id,v_row.id,'DRIVE_BOX_CREATED','box',v_row.id,'CsomagBOX létrehozva: '||v_row.name,jsonb_build_object('boxId',v_row.id,'purpose',v_row.purpose,'colorToken',v_row.color_token),p_actor_user_id);
  return to_jsonb(v_row);
end $$;

create or replace function public.dimpro_personal_drive_add_box_item_atomic(
  p_owner_user_id uuid,p_box_id text,p_content_ref_id uuid,p_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_box public.dimpro_personal_drive_boxes; v_ref public.dimpro_content_refs; v_row public.dimpro_personal_drive_box_items; v_sort integer;
begin
  select * into v_box from public.dimpro_personal_drive_boxes where id=p_box_id and owner_user_id=p_owner_user_id and status='ACTIVE'; if v_box.id is null then raise exception 'PERSONAL_BOX_NOT_FOUND' using errcode='P0002'; end if;
  select * into v_ref from public.dimpro_content_refs where id=p_content_ref_id and owner_type='USER' and owner_user_id=p_owner_user_id and status='ACTIVE'; if v_ref.id is null then raise exception 'PERSONAL_BOX_CONTENT_REF_NOT_FOUND' using errcode='P0002'; end if;
  select * into v_row from public.dimpro_personal_drive_box_items where box_id=p_box_id and content_ref_id=p_content_ref_id limit 1; if v_row.id is not null then return jsonb_build_object('item',to_jsonb(v_row),'idempotent',true); end if;
  select coalesce(max(sort_order),0)+100 into v_sort from public.dimpro_personal_drive_box_items where owner_user_id=p_owner_user_id and box_id=p_box_id;
  insert into public.dimpro_personal_drive_box_items(id,owner_user_id,box_id,content_ref_id,sort_order,added_by_user_id) values('personal-boxitem-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),p_owner_user_id,p_box_id,p_content_ref_id,least(v_sort,999999),p_actor_user_id) returning * into v_row;
  insert into public.dimpro_personal_drive_box_events(id,owner_user_id,box_id,event_type,entity_type,entity_id,summary,metadata,actor_user_id) values('personal-boxevent-'||substr(replace(gen_random_uuid()::text,'-',''),1,18),p_owner_user_id,p_box_id,'DRIVE_BOX_ITEM_ADDED','box_item',v_row.id,'Fájl CsomagBOX-hoz adva: '||v_ref.display_name||' → '||v_box.name,jsonb_build_object('boxId',p_box_id,'contentRefId',p_content_ref_id,'boxItemId',v_row.id),p_actor_user_id);
  return jsonb_build_object('item',to_jsonb(v_row),'idempotent',false);
end $$;

create or replace function public.dimpro_personal_drive_remove_box_item_atomic(
  p_owner_user_id uuid,p_box_id text,p_item_id text,p_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_box public.dimpro_personal_drive_boxes; v_row public.dimpro_personal_drive_box_items; v_ref public.dimpro_content_refs;
begin
  select * into v_box from public.dimpro_personal_drive_boxes where id=p_box_id and owner_user_id=p_owner_user_id and status='ACTIVE'; if v_box.id is null then raise exception 'PERSONAL_BOX_NOT_FOUND' using errcode='P0002'; end if;
  select * into v_row from public.dimpro_personal_drive_box_items where id=p_item_id and owner_user_id=p_owner_user_id and box_id=p_box_id for update; if v_row.id is null then raise exception 'PERSONAL_BOX_ITEM_NOT_FOUND' using errcode='P0002'; end if;
  select * into v_ref from public.dimpro_content_refs where id=v_row.content_ref_id;
  delete from public.dimpro_personal_drive_box_items where id=v_row.id;
  insert into public.dimpro_personal_drive_box_events(id,owner_user_id,box_id,event_type,entity_type,entity_id,summary,metadata,actor_user_id) values('personal-boxevent-'||substr(replace(gen_random_uuid()::text,'-',''),1,18),p_owner_user_id,p_box_id,'DRIVE_BOX_ITEM_REMOVED','box_item',v_row.id,'Fájl eltávolítva CsomagBOX-ból: '||coalesce(v_ref.display_name,v_row.content_ref_id::text)||' ← '||v_box.name,jsonb_build_object('boxId',p_box_id,'contentRefId',v_row.content_ref_id,'boxItemId',v_row.id),p_actor_user_id);
  return to_jsonb(v_row);
end $$;

create or replace function public.dimpro_personal_drive_create_box_folder_atomic(
  p_owner_user_id uuid,p_box_id text,p_parent_id text,p_name text,p_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_box public.dimpro_personal_drive_boxes; v_parent public.dimpro_personal_drive_box_folders; v_row public.dimpro_personal_drive_box_folders; v_sort integer; v_name text;
begin
  select * into v_box from public.dimpro_personal_drive_boxes where id=p_box_id and owner_user_id=p_owner_user_id and status='ACTIVE'; if v_box.id is null then raise exception 'PERSONAL_BOX_NOT_FOUND' using errcode='P0002'; end if;
  v_name:=left(btrim(coalesce(p_name,'')),120); if length(v_name)=0 or v_name ~ '[\\/]' then raise exception 'PERSONAL_BOX_FOLDER_NAME_INVALID' using errcode='22023'; end if;
  if nullif(btrim(coalesce(p_parent_id,'')),'') is not null then select * into v_parent from public.dimpro_personal_drive_box_folders where id=p_parent_id and owner_user_id=p_owner_user_id and box_id=p_box_id and status='ACTIVE'; if v_parent.id is null then raise exception 'PERSONAL_BOX_FOLDER_PARENT_NOT_FOUND' using errcode='P0002'; end if; end if;
  select coalesce(max(sort_order),0)+100 into v_sort from public.dimpro_personal_drive_box_folders where owner_user_id=p_owner_user_id and box_id=p_box_id and coalesce(parent_id,'')=coalesce(nullif(btrim(coalesce(p_parent_id,'')),''),'') and status='ACTIVE';
  insert into public.dimpro_personal_drive_box_folders(id,owner_user_id,box_id,parent_id,name,sort_order,status,created_by_user_id) values('personal-boxfolder-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),p_owner_user_id,p_box_id,nullif(btrim(coalesce(p_parent_id,'')),''),v_name,least(v_sort,999999),'ACTIVE',p_actor_user_id) returning * into v_row;
  insert into public.dimpro_personal_drive_box_events(id,owner_user_id,box_id,event_type,entity_type,entity_id,summary,metadata,actor_user_id) values('personal-boxevent-'||substr(replace(gen_random_uuid()::text,'-',''),1,18),p_owner_user_id,p_box_id,'DRIVE_BOX_FOLDER_CREATED','box_folder',v_row.id,'CsomagBOX mappa létrehozva: '||v_row.name||' → '||v_box.name,jsonb_build_object('boxId',p_box_id,'folderId',v_row.id,'parentId',v_row.parent_id,'name',v_row.name),p_actor_user_id);
  return to_jsonb(v_row);
exception when unique_violation then raise exception 'PERSONAL_BOX_FOLDER_NAME_EXISTS' using errcode='23505'; end $$;

create or replace function public.dimpro_personal_drive_move_box_item_atomic(
  p_owner_user_id uuid,p_box_id text,p_item_id text,p_folder_id text,p_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_box public.dimpro_personal_drive_boxes; v_item public.dimpro_personal_drive_box_items; v_folder public.dimpro_personal_drive_box_folders; v_sort integer; v_target text;
begin
  select * into v_box from public.dimpro_personal_drive_boxes where id=p_box_id and owner_user_id=p_owner_user_id and status='ACTIVE'; if v_box.id is null then raise exception 'PERSONAL_BOX_NOT_FOUND' using errcode='P0002'; end if;
  select * into v_item from public.dimpro_personal_drive_box_items where id=p_item_id and owner_user_id=p_owner_user_id and box_id=p_box_id for update; if v_item.id is null then raise exception 'PERSONAL_BOX_ITEM_NOT_FOUND' using errcode='P0002'; end if;
  v_target:=nullif(btrim(coalesce(p_folder_id,'')),'');
  if v_target is not null then select * into v_folder from public.dimpro_personal_drive_box_folders where id=v_target and owner_user_id=p_owner_user_id and box_id=p_box_id and status='ACTIVE'; if v_folder.id is null then raise exception 'PERSONAL_BOX_FOLDER_NOT_FOUND' using errcode='P0002'; end if; end if;
  select coalesce(max(sort_order),0)+100 into v_sort from public.dimpro_personal_drive_box_items where owner_user_id=p_owner_user_id and box_id=p_box_id and coalesce(folder_id,'')=coalesce(v_target,'');
  update public.dimpro_personal_drive_box_items set folder_id=v_target,sort_order=least(v_sort,999999) where id=v_item.id returning * into v_item;
  insert into public.dimpro_personal_drive_box_events(id,owner_user_id,box_id,event_type,entity_type,entity_id,summary,metadata,actor_user_id) values('personal-boxevent-'||substr(replace(gen_random_uuid()::text,'-',''),1,18),p_owner_user_id,p_box_id,'DRIVE_BOX_ITEM_MOVED','box_item',v_item.id,'CsomagBOX elem áthelyezve → '||coalesce(v_folder.name,'BOX gyökér'),jsonb_build_object('boxId',p_box_id,'boxItemId',v_item.id,'contentRefId',v_item.content_ref_id,'folderId',v_target),p_actor_user_id);
  return to_jsonb(v_item);
end $$;

create or replace function public.dimpro_personal_drive_set_box_lifecycle_atomic(
  p_owner_user_id uuid,p_box_id text,p_next_status text,p_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_box public.dimpro_personal_drive_boxes; v_previous text; v_next text;
begin
  select * into v_box from public.dimpro_personal_drive_boxes where id=p_box_id and owner_user_id=p_owner_user_id and status='ACTIVE' for update; if v_box.id is null then raise exception 'PERSONAL_BOX_NOT_FOUND' using errcode='P0002'; end if;
  v_previous:=coalesce(v_box.lifecycle_status,'DRAFT'); v_next:=upper(btrim(coalesce(p_next_status,'')));
  if v_next not in ('DRAFT','READY','SENT','ARCHIVED') then raise exception 'PERSONAL_BOX_LIFECYCLE_INVALID' using errcode='22023'; end if;
  if v_previous<>v_next and not ((v_previous='DRAFT' and v_next in ('READY','ARCHIVED')) or (v_previous='READY' and v_next in ('DRAFT','SENT','ARCHIVED')) or (v_previous='SENT' and v_next in ('READY','ARCHIVED')) or (v_previous='ARCHIVED' and v_next='DRAFT')) then raise exception 'PERSONAL_BOX_LIFECYCLE_TRANSITION_INVALID' using errcode='22023'; end if;
  update public.dimpro_personal_drive_boxes set lifecycle_status=v_next,ready_at=case when v_next='READY' then coalesce(ready_at,now()) when v_next='DRAFT' then null else ready_at end,sent_at=case when v_next='SENT' then coalesce(sent_at,now()) when v_next in ('DRAFT','READY') then null else sent_at end,archived_at=case when v_next='ARCHIVED' then coalesce(archived_at,now()) when v_next<>'ARCHIVED' then null else archived_at end,updated_at=now() where id=v_box.id returning * into v_box;
  insert into public.dimpro_personal_drive_box_events(id,owner_user_id,box_id,event_type,entity_type,entity_id,summary,metadata,actor_user_id) values('personal-boxevent-'||substr(replace(gen_random_uuid()::text,'-',''),1,18),p_owner_user_id,p_box_id,'DRIVE_BOX_LIFECYCLE_CHANGED','box',v_box.id,'CsomagBOX állapot módosítva: '||v_previous||' → '||v_next||' · '||v_box.name,jsonb_build_object('boxId',v_box.id,'previousStatus',v_previous,'nextStatus',v_next,'readyAt',v_box.ready_at,'sentAt',v_box.sent_at,'archivedAt',v_box.archived_at),p_actor_user_id);
  return to_jsonb(v_box);
end $$;

insert into public.dimpro_content_schema_meta(component,schema_version,migration_count,bootstrap_id,updated_at)
values('personal-drive-boxes','0.1.0',1,'personal-drive-boxes-v010-20261006',now())
on conflict(component) do update set schema_version=excluded.schema_version,migration_count=excluded.migration_count,bootstrap_id=excluded.bootstrap_id,updated_at=excluded.updated_at;

revoke all on function public.dimpro_personal_drive_create_box_atomic(uuid,text,text,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.dimpro_personal_drive_add_box_item_atomic(uuid,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.dimpro_personal_drive_remove_box_item_atomic(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.dimpro_personal_drive_create_box_folder_atomic(uuid,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.dimpro_personal_drive_move_box_item_atomic(uuid,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.dimpro_personal_drive_set_box_lifecycle_atomic(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.dimpro_personal_drive_box_item_scope_guard() from public,anon,authenticated;
grant execute on function public.dimpro_personal_drive_create_box_atomic(uuid,text,text,text,text,text,uuid) to service_role;
grant execute on function public.dimpro_personal_drive_add_box_item_atomic(uuid,text,uuid,uuid) to service_role;
grant execute on function public.dimpro_personal_drive_remove_box_item_atomic(uuid,text,text,uuid) to service_role;
grant execute on function public.dimpro_personal_drive_create_box_folder_atomic(uuid,text,text,text,uuid) to service_role;
grant execute on function public.dimpro_personal_drive_move_box_item_atomic(uuid,text,text,text,uuid) to service_role;
grant execute on function public.dimpro_personal_drive_set_box_lifecycle_atomic(uuid,text,text,uuid) to service_role;
grant execute on function public.dimpro_personal_drive_box_item_scope_guard() to service_role;

commit;
