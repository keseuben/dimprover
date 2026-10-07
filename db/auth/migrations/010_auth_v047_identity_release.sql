DROP INDEX IF EXISTS auth_user_identities_email_uq;

CREATE UNIQUE INDEX IF NOT EXISTS auth_user_identities_email_active_uq
  ON auth_user_identities(email_normalized)
  WHERE status <> 'DISABLED';

DO $$
DECLARE app_role text;
BEGIN
  IF current_user !~ '^dimpro_auth_migrator_(dev|prod)$' THEN
    RAISE EXCEPTION 'DIMPRO AUTH identity release migration must run as an environment migrator role; current_user=%', current_user;
  END IF;
  app_role := regexp_replace(current_user, '_migrator_', '_app_');
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=app_role) THEN
    RAISE EXCEPTION 'DIMPRO AUTH runtime role % does not exist', app_role;
  END IF;
END;
$$;
