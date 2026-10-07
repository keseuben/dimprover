-- DIMPRO AUTH V0.4.8 - constrained self-service profile display-name update.
-- Runtime keeps least-privilege table grants; only this SECURITY DEFINER RPC can
-- update auth_users.display_name and the user's primary identity together.

CREATE OR REPLACE FUNCTION public.auth_update_self_display_name(
  p_user_id uuid,
  p_display_name text
)
RETURNS TABLE(
  id uuid,
  email_original text,
  email_normalized text,
  display_name text,
  status text,
  security_level text,
  login_enabled boolean,
  session_version integer,
  email_verified_at timestamptz,
  previous_display_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_display_name text := btrim(coalesce(p_display_name,''));
  v_previous_display_name text;
  v_identity_count integer := 0;
BEGIN
  IF char_length(v_display_name) < 2 OR char_length(v_display_name) > 160 THEN
    RAISE EXCEPTION 'AUTH_PROFILE_DISPLAY_NAME_INVALID' USING ERRCODE='22023';
  END IF;

  SELECT auth_user.display_name
    INTO v_previous_display_name
    FROM public.auth_users auth_user
   WHERE auth_user.id=p_user_id
     AND auth_user.status='ACTIVE'
     AND auth_user.login_enabled=true
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AUTH_PROFILE_USER_NOT_ACTIVE' USING ERRCODE='42501';
  END IF;

  UPDATE public.auth_users auth_user
     SET display_name=v_display_name,
         updated_at=now()
   WHERE auth_user.id=p_user_id;

  UPDATE public.auth_user_identities identity_row
     SET display_name=v_display_name,
         updated_at=now()
   WHERE identity_row.user_id=p_user_id
     AND identity_row.is_primary=true
     AND identity_row.status<>'DISABLED';

  GET DIAGNOSTICS v_identity_count = ROW_COUNT;
  IF v_identity_count <> 1 THEN
    RAISE EXCEPTION 'AUTH_PROFILE_PRIMARY_IDENTITY_NOT_FOUND' USING ERRCODE='55000';
  END IF;

  RETURN QUERY
  SELECT auth_user.id,
         auth_user.email_original,
         auth_user.email_normalized,
         auth_user.display_name,
         auth_user.status,
         auth_user.security_level,
         auth_user.login_enabled,
         auth_user.session_version,
         auth_user.email_verified_at,
         v_previous_display_name
    FROM public.auth_users auth_user
   WHERE auth_user.id=p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.auth_update_self_display_name(uuid,text) FROM PUBLIC;

DO $$
DECLARE
  app_role text;
BEGIN
  IF current_user !~ '^dimpro_auth_migrator_(dev|prod)$' THEN
    RAISE EXCEPTION 'DIMPRO AUTH profile migration must run as an environment migrator role; current_user=%', current_user;
  END IF;
  app_role := regexp_replace(current_user, '_migrator_', '_app_');
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=app_role) THEN
    RAISE EXCEPTION 'DIMPRO AUTH runtime role % does not exist', app_role;
  END IF;
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.auth_update_self_display_name(uuid,text) TO %I',
    app_role
  );
END;
$$;
