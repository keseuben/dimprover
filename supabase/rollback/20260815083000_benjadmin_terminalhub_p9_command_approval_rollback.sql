begin;

drop function if exists public.dev_center_queue_approved_command(uuid,text,text,text,text,uuid,jsonb);
drop index if exists public.dev_center_command_queue_approval_once_idx;
delete from public.dev_center_control_schema_meta where component='benjadmin-terminal-security-approval';

alter table public.dev_center_approvals
  drop constraint if exists dev_center_approvals_approval_type_check;

-- Rollback csak akkor engedhető, ha nincs P9 DEV approval rekord.
do $$
begin
  if exists(select 1 from public.dev_center_approvals where approval_type like 'dev_%') then
    raise exception 'P9_DEV_APPROVAL_ROWS_EXIST';
  end if;
end $$;

alter table public.dev_center_approvals
  add constraint dev_center_approvals_approval_type_check
  check (approval_type in ('prod_write','prod_migration','prod_restart','prod_deploy','release','recovery'));

commit;
