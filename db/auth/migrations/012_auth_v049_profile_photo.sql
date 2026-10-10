-- DIMPRO AUTH 0.4.9: self-service, optimized profile photos.
-- SOURCE ONLY. Must run through guarded AUTH migrator; not deployed by a Drive build.
BEGIN;

CREATE TABLE IF NOT EXISTS public.auth_profile_photos (
  user_id uuid PRIMARY KEY REFERENCES public.auth_users(id) ON DELETE CASCADE,
  image_data bytea NOT NULL CHECK (octet_length(image_data) BETWEEN 100 AND 150000),
  content_type text NOT NULL DEFAULT 'image/webp' CHECK (content_type='image/webp'),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE public.auth_profile_photos FROM PUBLIC;
-- No direct table privileges for the app runtime role.

CREATE OR REPLACE FUNCTION public.auth_read_profile_photo(p_user_id uuid)
RETURNS TABLE(image_data bytea, content_type text, sha256 text, updated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
  SELECT photo.image_data, photo.content_type, photo.sha256, photo.updated_at
  FROM public.auth_profile_photos photo
  JOIN public.auth_users usr ON usr.id=photo.user_id
  WHERE photo.user_id=p_user_id AND usr.status='ACTIVE' AND usr.login_enabled=true;
$fn$;

CREATE OR REPLACE FUNCTION public.auth_upsert_self_profile_photo(
  p_user_id uuid, p_image_data bytea, p_sha256 text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.auth_users WHERE id=p_user_id AND status='ACTIVE' AND login_enabled=true
  ) THEN
    RAISE EXCEPTION 'AUTH_PROFILE_USER_NOT_ACTIVE' USING ERRCODE='42501';
  END IF;
  IF octet_length(p_image_data) NOT BETWEEN 100 AND 150000 OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AUTH_PROFILE_PHOTO_INVALID' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.auth_profile_photos(user_id,image_data,sha256)
  VALUES(p_user_id,p_image_data,p_sha256)
  ON CONFLICT(user_id) DO UPDATE SET image_data=EXCLUDED.image_data,
    sha256=EXCLUDED.sha256,updated_at=now();
END;
$fn$;

CREATE OR REPLACE FUNCTION public.auth_delete_self_profile_photo(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
BEGIN
  DELETE FROM public.auth_profile_photos WHERE user_id=p_user_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.auth_read_profile_photo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_upsert_self_profile_photo(uuid,bytea,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_delete_self_profile_photo(uuid) FROM PUBLIC;

DO $guard$
DECLARE app_role text;
BEGIN
  IF current_user !~ '^dimpro_auth_migrator_(dev|prod)$' THEN
    RAISE EXCEPTION 'DIMPRO AUTH photo migration requires environment migrator: %', current_user;
  END IF;
  app_role := regexp_replace(current_user, '_migrator_', '_app_');
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=app_role) THEN
    RAISE EXCEPTION 'DIMPRO AUTH runtime role % missing', app_role;
  END IF;
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.auth_read_profile_photo(uuid) TO %I',app_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.auth_upsert_self_profile_photo(uuid,bytea,text) TO %I',app_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.auth_delete_self_profile_photo(uuid) TO %I',app_role);
END;
$guard$;
COMMIT;
