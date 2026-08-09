-- DIMPRO / DIMPROVER backend service-role grants 0.1.0
-- Keeps anon/authenticated exposure explicit while ensuring the trusted server-side
-- service_role can use every application table when Supabase automatic table exposure is disabled.

begin;

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges for role postgres in schema public
  grant usage, select, update on sequences to service_role;

commit;
