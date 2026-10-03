BEGIN;

ALTER TABLE auth_users
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1 CHECK (session_version > 0);

ALTER TABLE auth_sessions
  ADD COLUMN IF NOT EXISTS user_session_version integer;
UPDATE auth_sessions s
SET user_session_version=u.session_version
FROM auth_users u
WHERE u.id=s.user_id AND s.user_session_version IS NULL;
ALTER TABLE auth_sessions
  ALTER COLUMN user_session_version SET NOT NULL;

ALTER TABLE auth_app_sessions
  ADD COLUMN IF NOT EXISTS user_session_version integer;
UPDATE auth_app_sessions s
SET user_session_version=u.session_version
FROM auth_users u
WHERE u.id=s.user_id AND s.user_session_version IS NULL;
ALTER TABLE auth_app_sessions
  ALTER COLUMN user_session_version SET NOT NULL;

CREATE OR REPLACE FUNCTION auth_bump_user_session_version_on_security_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.security_level IS DISTINCT FROM OLD.security_level
     OR NEW.login_enabled IS DISTINCT FROM OLD.login_enabled
     OR NEW.email_normalized IS DISTINCT FROM OLD.email_normalized THEN
    NEW.session_version := OLD.session_version + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auth_users_security_change_session_version ON auth_users;
CREATE TRIGGER auth_users_security_change_session_version
BEFORE UPDATE OF status,security_level,login_enabled,email_normalized ON auth_users
FOR EACH ROW EXECUTE FUNCTION auth_bump_user_session_version_on_security_change();

CREATE OR REPLACE FUNCTION auth_bump_grant_user_session_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE auth_users SET session_version=session_version+1,updated_at=now() WHERE id=OLD.user_id;
    RETURN OLD;
  END IF;

  UPDATE auth_users SET session_version=session_version+1,updated_at=now() WHERE id=NEW.user_id;
  IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    UPDATE auth_users SET session_version=session_version+1,updated_at=now() WHERE id=OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auth_access_grants_session_version ON auth_access_grants;
CREATE TRIGGER auth_access_grants_session_version
AFTER INSERT OR UPDATE OR DELETE ON auth_access_grants
FOR EACH ROW EXECUTE FUNCTION auth_bump_grant_user_session_version();

CREATE OR REPLACE FUNCTION auth_bump_role_users_session_version()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  current_role uuid;
  previous_role uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    previous_role := OLD.role_id;
  ELSE
    current_role := NEW.role_id;
    IF TG_OP = 'UPDATE' THEN previous_role := OLD.role_id; END IF;
  END IF;

  IF current_role IS NOT NULL THEN
    UPDATE auth_users u
       SET session_version=u.session_version+1,updated_at=now()
     WHERE EXISTS (
       SELECT 1 FROM auth_access_grants g
        WHERE g.user_id=u.id AND g.role_id=current_role AND g.revoked_at IS NULL
     );
  END IF;

  IF previous_role IS NOT NULL AND previous_role IS DISTINCT FROM current_role THEN
    UPDATE auth_users u
       SET session_version=u.session_version+1,updated_at=now()
     WHERE EXISTS (
       SELECT 1 FROM auth_access_grants g
        WHERE g.user_id=u.id AND g.role_id=previous_role AND g.revoked_at IS NULL
     );
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auth_role_permissions_session_version ON auth_role_permissions;
CREATE TRIGGER auth_role_permissions_session_version
AFTER INSERT OR UPDATE OR DELETE ON auth_role_permissions
FOR EACH ROW EXECUTE FUNCTION auth_bump_role_users_session_version();

COMMIT;
