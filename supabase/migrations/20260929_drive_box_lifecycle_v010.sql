-- DIMPRO Drive V0.6.9 - optional CsomagBOX lifecycle / history
-- Additive migration: existing CsomagBOX records remain ACTIVE technical records.
begin;

alter table public.drive_core_boxes
  add column if not exists lifecycle_status text not null default 'DRAFT',
  add column if not exists ready_at timestamptz null,
  add column if not exists sent_at timestamptz null,
  add column if not exists archived_at timestamptz null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'drive_core_boxes_lifecycle_status_check'
      and conrelid = 'public.drive_core_boxes'::regclass
  ) then
    alter table public.drive_core_boxes
      add constraint drive_core_boxes_lifecycle_status_check
      check (lifecycle_status in ('DRAFT','READY','SENT','ARCHIVED'));
  end if;
end;
$$;

create index if not exists drive_core_boxes_project_lifecycle_idx
  on public.drive_core_boxes (project_id, lifecycle_status, sort_order, updated_at desc)
  where status = 'ACTIVE';

create or replace function public.drive_workspace_set_box_lifecycle_atomic(
  p_project_id text,
  p_box_id text,
  p_next_status text,
  p_actor_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box public.drive_core_boxes;
  v_previous text;
  v_next text;
begin
  select * into v_box
  from public.drive_core_boxes
  where id = p_box_id
    and project_id = p_project_id
    and status = 'ACTIVE'
  for update;

  if v_box.id is null then
    raise exception 'DRIVE_BOX_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_previous := coalesce(v_box.lifecycle_status,'DRAFT');
  v_next := upper(btrim(coalesce(p_next_status,'')));

  if v_next not in ('DRAFT','READY','SENT','ARCHIVED') then
    raise exception 'DRIVE_BOX_LIFECYCLE_INVALID' using errcode = '22023';
  end if;

  if v_previous <> v_next and not (
    (v_previous = 'DRAFT' and v_next in ('READY','ARCHIVED'))
    or (v_previous = 'READY' and v_next in ('DRAFT','SENT','ARCHIVED'))
    or (v_previous = 'SENT' and v_next in ('READY','ARCHIVED'))
    or (v_previous = 'ARCHIVED' and v_next = 'DRAFT')
  ) then
    raise exception 'DRIVE_BOX_LIFECYCLE_TRANSITION_INVALID' using errcode = '22023';
  end if;

  update public.drive_core_boxes
  set lifecycle_status = v_next,
      ready_at = case
        when v_next = 'READY' then coalesce(ready_at, now())
        when v_next = 'DRAFT' then null
        else ready_at
      end,
      sent_at = case
        when v_next = 'SENT' then coalesce(sent_at, now())
        when v_next in ('DRAFT','READY') then null
        else sent_at
      end,
      archived_at = case
        when v_next = 'ARCHIVED' then coalesce(archived_at, now())
        when v_next <> 'ARCHIVED' then null
        else archived_at
      end,
      updated_at = now()
  where id = v_box.id
  returning * into v_box;

  insert into public.project_core_audit_events (
    id, project_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata
  ) values (
    'project-audit-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
    p_project_id,
    p_actor_user_id,
    'DRIVE_BOX_LIFECYCLE_CHANGED',
    'box',
    v_box.id,
    'CsomagBOX állapot módosítva: ' || v_previous || ' → ' || v_next || ' · ' || v_box.name,
    jsonb_build_object(
      'boxId', v_box.id,
      'previousStatus', v_previous,
      'nextStatus', v_next,
      'readyAt', v_box.ready_at,
      'sentAt', v_box.sent_at,
      'archivedAt', v_box.archived_at
    )
  );

  insert into public.drive_core_change_events (
    id, project_id, event_type, entity_type, entity_id, payload, actor_user_id
  ) values (
    'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
    p_project_id,
    'BOX_LIFECYCLE_CHANGED',
    'box',
    v_box.id,
    jsonb_build_object(
      'boxId',v_box.id,
      'previousStatus',v_previous,
      'nextStatus',v_next,
      'box',to_jsonb(v_box)
    ),
    p_actor_user_id
  );

  return to_jsonb(v_box);
end;
$$;

revoke all on function public.drive_workspace_set_box_lifecycle_atomic(text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.drive_workspace_set_box_lifecycle_atomic(text,text,text,text)
  to service_role;

commit;
