CREATE TABLE IF NOT EXISTS auth_drive_registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  email_original text NOT NULL,
  email_normalized text NOT NULL CHECK (email_normalized = lower(btrim(email_normalized)) AND position('@' in email_normalized) > 1),
  display_name text,
  organization_name text,
  challenge_id uuid REFERENCES auth_email_challenges(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'PENDING_EMAIL' CHECK (status IN ('PENDING_EMAIL','EMAIL_VERIFIED','APPROVED','REJECTED','CANCELLED')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  email_verified_at timestamptz,
  decided_at timestamptz,
  decided_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_drive_registration_email_idx ON auth_drive_registration_requests(email_normalized,updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS auth_drive_registration_one_open_uq
  ON auth_drive_registration_requests(email_normalized)
  WHERE status IN ('PENDING_EMAIL','EMAIL_VERIFIED');

CREATE OR REPLACE FUNCTION auth_begin_drive_registration(
  p_email_original text,
  p_email_normalized text,
  p_display_name text,
  p_organization_name text,
  p_code_hash bytea,
  p_expires_at timestamptz,
  p_requested_ip inet,
  p_user_agent text,
  p_correlation_id text
)
RETURNS TABLE(registration_id uuid, challenge_id uuid, user_id uuid, registration_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_email text := lower(btrim(p_email_normalized));
  v_user public.auth_users%ROWTYPE;
  v_registration public.auth_drive_registration_requests%ROWTYPE;
  v_challenge_id uuid;
  v_count integer;
BEGIN
  IF v_email='' OR position('@' in v_email)<=1 OR v_email<>p_email_normalized THEN
    RAISE EXCEPTION 'AUTH_DRIVE_REGISTRATION_EMAIL_INVALID' USING ERRCODE='22023';
  END IF;
  IF octet_length(p_code_hash)<>32 THEN
    RAISE EXCEPTION 'AUTH_DRIVE_REGISTRATION_CODE_HASH_INVALID' USING ERRCODE='22023';
  END IF;
  IF p_expires_at<=now() OR p_expires_at>now()+interval '6 minutes' THEN
    RAISE EXCEPTION 'AUTH_DRIVE_REGISTRATION_EXPIRY_INVALID' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dimpro-auth:drive-registration:'||v_email,0));

  SELECT u.* INTO v_user FROM public.auth_users u WHERE u.email_normalized=v_email LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF v_user.status<>'ACTIVE' THEN
      RAISE EXCEPTION 'AUTH_DRIVE_REGISTRATION_ACCOUNT_BLOCKED' USING ERRCODE='42501';
    END IF;
  ELSE
    INSERT INTO public.auth_users(email_original,email_normalized,display_name,status,security_level,login_enabled)
    VALUES (btrim(p_email_original),v_email,nullif(btrim(p_display_name),''),'ACTIVE','SIMPLE',false)
    RETURNING * INTO v_user;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.auth_access_grants g
    JOIN public.auth_roles r ON r.id=g.role_id
    JOIN public.auth_products product ON product.id=g.product_id
    WHERE g.user_id=v_user.id AND r.code='DRIVE_PERSONAL_USER' AND product.code='DRIVE'
      AND g.project_id IS NULL AND g.revoked_at IS NULL
      AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>=now())
  ) THEN
    RAISE EXCEPTION 'AUTH_DRIVE_ALREADY_ENABLED' USING ERRCODE='23505';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.auth_email_challenges c
    WHERE c.email_normalized=v_email AND c.purpose='DRIVE_REGISTRATION'
      AND c.created_at>now()-interval '30 seconds'
  ) THEN
    RAISE EXCEPTION 'AUTH_OTP_COOLDOWN' USING ERRCODE='55000';
  END IF;
  SELECT count(*)::integer INTO v_count FROM public.auth_email_challenges c
    WHERE c.email_normalized=v_email AND c.created_at>=now()-interval '15 minutes';
  IF v_count>=5 THEN RAISE EXCEPTION 'AUTH_OTP_RATE_LIMIT' USING ERRCODE='54000'; END IF;
  IF p_requested_ip IS NOT NULL THEN
    SELECT count(*)::integer INTO v_count FROM public.auth_email_challenges c
      WHERE c.requested_ip=p_requested_ip AND c.created_at>=now()-interval '15 minutes';
    IF v_count>=20 THEN RAISE EXCEPTION 'AUTH_OTP_RATE_LIMIT' USING ERRCODE='54000'; END IF;
  END IF;

  UPDATE public.auth_email_challenges SET invalidated_at=now()
   WHERE email_normalized=v_email AND purpose='DRIVE_REGISTRATION'
     AND consumed_at IS NULL AND invalidated_at IS NULL;
  INSERT INTO public.auth_email_challenges(user_id,email_normalized,purpose,code_hash,expires_at,max_attempts,requested_ip,requested_user_agent,correlation_id)
  VALUES(v_user.id,v_email,'DRIVE_REGISTRATION',p_code_hash,p_expires_at,5,p_requested_ip,left(coalesce(p_user_agent,'unknown'),500),p_correlation_id)
  RETURNING id INTO v_challenge_id;

  SELECT r.* INTO v_registration FROM public.auth_drive_registration_requests r
   WHERE r.email_normalized=v_email AND r.status IN ('PENDING_EMAIL','EMAIL_VERIFIED')
   LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    UPDATE public.auth_drive_registration_requests r
       SET user_id=v_user.id,email_original=btrim(p_email_original),display_name=nullif(btrim(p_display_name),''),
           organization_name=nullif(btrim(p_organization_name),''),challenge_id=v_challenge_id,status='PENDING_EMAIL',
           email_verified_at=NULL,updated_at=now()
     WHERE r.id=v_registration.id
     RETURNING * INTO v_registration;
  ELSE
    INSERT INTO public.auth_drive_registration_requests(user_id,email_original,email_normalized,display_name,organization_name,challenge_id,status)
    VALUES(v_user.id,btrim(p_email_original),v_email,nullif(btrim(p_display_name),''),nullif(btrim(p_organization_name),''),v_challenge_id,'PENDING_EMAIL')
    RETURNING * INTO v_registration;
  END IF;

  RETURN QUERY SELECT v_registration.id,v_challenge_id,v_user.id,v_registration.status;
END;
$$;

CREATE OR REPLACE FUNCTION auth_confirm_drive_registration(p_registration_id uuid,p_challenge_id uuid)
RETURNS TABLE(registration_id uuid,user_id uuid,email_normalized text,registration_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_registration public.auth_drive_registration_requests%ROWTYPE;
BEGIN
  SELECT r.* INTO v_registration FROM public.auth_drive_registration_requests r
   WHERE r.id=p_registration_id LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR v_registration.status<>'PENDING_EMAIL' OR v_registration.challenge_id IS DISTINCT FROM p_challenge_id THEN
    RAISE EXCEPTION 'AUTH_DRIVE_REGISTRATION_NOT_PENDING' USING ERRCODE='22023';
  END IF;
  UPDATE public.auth_drive_registration_requests r
     SET status='EMAIL_VERIFIED',email_verified_at=now(),updated_at=now()
   WHERE r.id=v_registration.id;
  UPDATE public.auth_users u
     SET email_verified_at=COALESCE(u.email_verified_at,now()),updated_at=now()
   WHERE u.id=v_registration.user_id;
  RETURN QUERY SELECT v_registration.id,v_registration.user_id,v_registration.email_normalized,'EMAIL_VERIFIED'::text;
END;
$$;

REVOKE ALL ON FUNCTION auth_begin_drive_registration(text,text,text,text,bytea,timestamptz,inet,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_confirm_drive_registration(uuid,uuid) FROM PUBLIC;

DO $$
DECLARE app_role text;
BEGIN
  IF current_user !~ '^dimpro_auth_migrator_(dev|prod)$' THEN
    RAISE EXCEPTION 'DIMPRO AUTH Drive registration migration must run as an environment migrator role; current_user=%', current_user;
  END IF;
  app_role := regexp_replace(current_user, '_migrator_', '_app_');
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=app_role) THEN
    RAISE EXCEPTION 'DIMPRO AUTH runtime role % does not exist', app_role;
  END IF;
  EXECUTE format('GRANT SELECT ON TABLE public.auth_drive_registration_requests TO %I',app_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.auth_begin_drive_registration(text,text,text,text,bytea,timestamptz,inet,text,text) TO %I',app_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.auth_confirm_drive_registration(uuid,uuid) TO %I',app_role);
END;
$$;
