begin;
drop function if exists public.dev_center_windows_bridge_activate_device(uuid,uuid,text,text,uuid);
drop table if exists public.dev_center_windows_bridge_sessions;
drop table if exists public.dev_center_windows_bridge_pairings;
drop table if exists public.dev_center_windows_bridge_devices;
delete from public.dev_center_control_schema_meta where component = 'benjadmin-windows-bridge';
commit;
