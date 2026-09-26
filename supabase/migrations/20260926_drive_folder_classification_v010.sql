begin;

alter table public.drive_core_folders
  add column if not exists discipline text not null default '',
  add column if not exists topic text not null default '';

comment on column public.drive_core_folders.discipline is 'Optional folder-level discipline. Descendant documents inherit the nearest non-empty value unless overridden.';
comment on column public.drive_core_folders.topic is 'Optional folder-level topic/location. Descendant documents inherit the nearest non-empty value unless overridden.';

create or replace function public.drive_core_set_folder_classification(
  p_project_id text, p_folder_id text, p_discipline text, p_topic text, p_actor_user_id text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_folder public.drive_core_folders;
begin
  update public.drive_core_folders
  set discipline = left(btrim(coalesce(p_discipline, '')), 120),
      topic = left(btrim(coalesce(p_topic, '')), 160),
      updated_at = now()
  where id = p_folder_id and project_id = p_project_id and status = 'ACTIVE'
  returning * into v_folder;
  if v_folder.id is null then
    raise exception 'DRIVE_CORE_FOLDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.drive_core_change_events(id, project_id, event_type, entity_type, entity_id, payload, actor_user_id)
  values(
    'drive-change-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
    p_project_id,
    'FOLDER_CLASSIFICATION_UPDATED',
    'folder',
    v_folder.id,
    to_jsonb(v_folder),
    p_actor_user_id
  );
  return to_jsonb(v_folder);
end; $$;

revoke all on function public.drive_core_set_folder_classification(text,text,text,text,text) from public, anon, authenticated;

commit;
