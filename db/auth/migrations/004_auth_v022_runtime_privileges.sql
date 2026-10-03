BEGIN;

-- Runtime least privilege. The migration role owns the schema; the application
-- role receives only the DML it actually needs. The role name is derived from
-- the environment-specific migrator role (dev/prod), so this migration remains
-- environment-safe without hard-coding one deployment.
DO $$
DECLARE
  app_role text;
  audit_sequence text;
BEGIN
  IF current_user !~ '^dimpro_auth_migrator_(dev|prod)$' THEN
    RAISE EXCEPTION 'DIMPRO AUTH privilege migration must run as an environment migrator role; current_user=%', current_user;
  END IF;

  app_role := regexp_replace(current_user, '_migrator_', '_app_');
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=app_role) THEN
    RAISE EXCEPTION 'DIMPRO AUTH runtime role % does not exist', app_role;
  END IF;

  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', app_role);
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', app_role);
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', app_role);

  -- Schema/version and immutable policy/catalog data are read-only at runtime.
  EXECUTE format('GRANT SELECT ON TABLE auth_schema_migrations TO %I', app_role);
  EXECUTE format('GRANT SELECT ON TABLE auth_products,auth_organizations,auth_projects,auth_roles,auth_permissions,auth_role_permissions,auth_access_grants TO %I', app_role);
  EXECUTE format('GRANT SELECT ON TABLE auth_clients,auth_client_redirect_uris TO %I', app_role);

  -- User identity is readable; runtime may only mark e-mail verification time.
  EXECUTE format('GRANT SELECT ON TABLE auth_users TO %I', app_role);
  EXECUTE format('GRANT UPDATE (email_verified_at,updated_at) ON TABLE auth_users TO %I', app_role);

  -- Ephemeral authentication/session state requires bounded DML, never DELETE.
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON TABLE auth_email_challenges TO %I', app_role);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON TABLE auth_sessions TO %I', app_role);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON TABLE auth_authorization_requests TO %I', app_role);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON TABLE auth_authorization_codes TO %I', app_role);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON TABLE auth_app_sessions TO %I', app_role);

  -- Audit is append/read at runtime. Retention DELETE remains migrator-only.
  EXECUTE format('GRANT SELECT,INSERT ON TABLE auth_audit_events TO %I', app_role);
  SELECT pg_get_serial_sequence('public.auth_audit_events','id') INTO audit_sequence;
  IF audit_sequence IS NULL THEN
    RAISE EXCEPTION 'DIMPRO AUTH audit identity sequence is missing';
  END IF;
  EXECUTE format('GRANT USAGE ON SEQUENCE %s TO %I', audit_sequence, app_role);
END;
$$;

COMMIT;
