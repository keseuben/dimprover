begin;

drop function if exists public.dev_center_record_terminal_command(text,text,text,text,text,text,text,text,text,text,text,text,text[],text,jsonb);
drop table if exists public.dev_center_terminal_command_events;
drop table if exists public.dev_center_terminal_command_catalog;
delete from public.dev_center_control_schema_meta where component = 'benjadmin-terminal-command-library';

commit;
