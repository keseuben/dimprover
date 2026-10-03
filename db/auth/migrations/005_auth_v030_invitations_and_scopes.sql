-- DIMPRO AUTH V0.3 · invitation-only onboarding + scoped Drive entitlements

CREATE TABLE IF NOT EXISTS auth_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized text NOT NULL CHECK (email_normalized = lower(btrim(email_normalized)) AND position('@' in email_normalized) > 1),
  invited_user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  invited_by_user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES auth_products(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES auth_organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES auth_projects(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES auth_roles(id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash)=32),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REVOKED','EXPIRED')),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK ((status='ACCEPTED') = (accepted_at IS NOT NULL)),
  CHECK ((status='REVOKED') = (revoked_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS auth_invitations_email_idx
  ON auth_invitations(email_normalized, status, expires_at DESC);
CREATE INDEX IF NOT EXISTS auth_invitations_project_idx
  ON auth_invitations(project_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS auth_invitations_one_pending_uq
  ON auth_invitations(email_normalized, product_id, project_id, role_id)
  WHERE status='PENDING';

-- Prevent accidental duplicate active grants for the same exact scope.
CREATE UNIQUE INDEX IF NOT EXISTS auth_access_grants_active_scope_uq
  ON auth_access_grants(user_id, role_id, product_id, organization_id, project_id) NULLS NOT DISTINCT
  WHERE revoked_at IS NULL;

INSERT INTO auth_permissions(code,description) VALUES
  ('drive.personal.access','Saját DIMPRO Drive terület megnyitása'),
  ('drive.project.access','Egy explicit projekthez tartozó DIMPRO Drive terület megnyitása'),
  ('project.members.invite','Projektmeghívások létrehozása és visszavonása')
ON CONFLICT (code) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO auth_roles(code,name,security_level) VALUES
  ('DRIVE_PERSONAL_USER','DIMPRO Drive saját tárhely felhasználó','SIMPLE'),
  ('DRIVE_PROJECT_MEMBER','DIMPRO Drive projektmeghívott','SIMPLE'),
  ('DRIVE_PROJECT_MANAGER','DIMPRO Drive projekt jogosultságkezelő','SIMPLE')
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name;

INSERT INTO auth_role_permissions(role_id,permission_id)
SELECT r.id,p.id
FROM auth_roles r
JOIN auth_permissions p ON (
  (r.code='DRIVE_PERSONAL_USER' AND p.code IN ('drive.access','drive.personal.access'))
  OR (r.code='DRIVE_PROJECT_MEMBER' AND p.code IN ('drive.access','drive.project.access'))
  OR (r.code='DRIVE_PROJECT_MANAGER' AND p.code IN ('drive.access','drive.project.access','project.members.invite'))
)
ON CONFLICT DO NOTHING;

-- Migration 003 trigger functions were created with unqualified relation names.
-- Invitation/security-definer functions intentionally pin search_path to pg_catalog,
-- so redefine the trigger functions with fully qualified relations before runtime use.
CREATE OR REPLACE FUNCTION public.auth_bump_grant_user_session_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.auth_users auth_user
       SET session_version=auth_user.session_version+1,updated_at=now()
     WHERE auth_user.id=OLD.user_id;
    RETURN OLD;
  END IF;
  UPDATE public.auth_users auth_user
     SET session_version=auth_user.session_version+1,updated_at=now()
   WHERE auth_user.id=NEW.user_id;
  IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    UPDATE public.auth_users auth_user
       SET session_version=auth_user.session_version+1,updated_at=now()
     WHERE auth_user.id=OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_bump_role_users_session_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  target_role_id uuid;
  previous_role_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    previous_role_id := OLD.role_id;
  ELSE
    target_role_id := NEW.role_id;
    IF TG_OP = 'UPDATE' THEN previous_role_id := OLD.role_id; END IF;
  END IF;
  IF target_role_id IS NOT NULL THEN
    UPDATE public.auth_users auth_user
       SET session_version=auth_user.session_version+1,updated_at=now()
     WHERE EXISTS (
       SELECT 1 FROM public.auth_access_grants grant_row
        WHERE grant_row.user_id=auth_user.id AND grant_row.role_id=target_role_id AND grant_row.revoked_at IS NULL
     );
  END IF;
  IF previous_role_id IS NOT NULL AND previous_role_id IS DISTINCT FROM target_role_id THEN
    UPDATE public.auth_users auth_user
       SET session_version=auth_user.session_version+1,updated_at=now()
     WHERE EXISTS (
       SELECT 1 FROM public.auth_access_grants grant_row
        WHERE grant_row.user_id=auth_user.id AND grant_row.role_id=previous_role_id AND grant_row.revoked_at IS NULL
     );
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION auth_invite_project_member(
  p_inviter_user_id uuid,
  p_email_original text,
  p_display_name text,
  p_project_id uuid,
  p_role_code text,
  p_token_hash bytea,
  p_expires_at timestamptz
)
RETURNS TABLE(
  invitation_id uuid,
  invited_user_id uuid,
  email_normalized text,
  project_id uuid,
  project_name text,
  organization_id uuid,
  role_code text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_email text := lower(btrim(p_email_original));
  v_product_id uuid;
  v_project public.auth_projects%ROWTYPE;
  v_role_id uuid;
  v_user public.auth_users%ROWTYPE;
  v_invitation_id uuid;
BEGIN
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(v_email) > 320 THEN
    RAISE EXCEPTION 'AUTH_INVITATION_EMAIL_INVALID' USING ERRCODE='22023';
  END IF;
  IF octet_length(p_token_hash) <> 32 THEN
    RAISE EXCEPTION 'AUTH_INVITATION_TOKEN_INVALID' USING ERRCODE='22023';
  END IF;
  IF p_expires_at <= now() OR p_expires_at > now() + interval '30 days' THEN
    RAISE EXCEPTION 'AUTH_INVITATION_EXPIRY_INVALID' USING ERRCODE='22023';
  END IF;
  IF p_role_code NOT IN ('DRIVE_PROJECT_MEMBER','DRIVE_PROJECT_MANAGER') THEN
    RAISE EXCEPTION 'AUTH_INVITATION_ROLE_INVALID' USING ERRCODE='22023';
  END IF;

  SELECT project.* INTO v_project FROM public.auth_projects project WHERE project.id=p_project_id AND project.status='ACTIVE';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AUTH_INVITATION_PROJECT_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT product.id INTO v_product_id FROM public.auth_products product WHERE product.code='DRIVE' AND product.status='ACTIVE';
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_INVITATION_PRODUCT_UNAVAILABLE' USING ERRCODE='55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.auth_access_grants g
    JOIN public.auth_role_permissions rp ON rp.role_id=g.role_id
    JOIN public.auth_permissions permission ON permission.id=rp.permission_id
    WHERE g.user_id=p_inviter_user_id
      AND g.product_id=v_product_id
      AND g.project_id=p_project_id
      AND permission.code='project.members.invite'
      AND g.revoked_at IS NULL
      AND g.valid_from<=now()
      AND (g.valid_until IS NULL OR g.valid_until>=now())
  ) THEN
    RAISE EXCEPTION 'AUTH_INVITATION_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;

  SELECT role.id INTO v_role_id FROM public.auth_roles role WHERE role.code=p_role_code;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_INVITATION_ROLE_MISSING' USING ERRCODE='55000';
  END IF;

  SELECT auth_user.* INTO v_user FROM public.auth_users auth_user WHERE auth_user.email_normalized=v_email FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.auth_users(email_original,email_normalized,display_name,status,security_level,login_enabled)
    VALUES (btrim(p_email_original),v_email,NULLIF(btrim(p_display_name),''),'ACTIVE','SIMPLE',false)
    RETURNING * INTO v_user;
  ELSIF v_user.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'AUTH_INVITATION_USER_BLOCKED' USING ERRCODE='42501';
  ELSE
    UPDATE public.auth_users auth_user
       SET display_name=COALESCE(auth_user.display_name,NULLIF(btrim(p_display_name),'')),updated_at=now()
     WHERE auth_user.id=v_user.id;
  END IF;

  UPDATE public.auth_invitations invitation
     SET status='REVOKED',revoked_at=now(),updated_at=now()
   WHERE invitation.email_normalized=v_email
     AND invitation.product_id=v_product_id
     AND invitation.project_id=p_project_id
     AND invitation.role_id=v_role_id
     AND invitation.status='PENDING';

  INSERT INTO public.auth_invitations(
    email_normalized,invited_user_id,invited_by_user_id,product_id,organization_id,project_id,role_id,token_hash,expires_at
  ) VALUES (
    v_email,v_user.id,p_inviter_user_id,v_product_id,v_project.organization_id,p_project_id,v_role_id,p_token_hash,p_expires_at
  ) RETURNING id INTO v_invitation_id;

  RETURN QUERY SELECT v_invitation_id,v_user.id,v_email,v_project.id,v_project.name,v_project.organization_id,p_role_code,p_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION auth_accept_project_invitation(p_token_hash bytea)
RETURNS TABLE(
  invitation_id uuid,
  invited_user_id uuid,
  product_code text,
  project_id uuid,
  project_name text,
  role_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_invitation public.auth_invitations%ROWTYPE;
  v_user public.auth_users%ROWTYPE;
  v_project public.auth_projects%ROWTYPE;
  v_product_code text;
  v_role_code text;
BEGIN
  IF octet_length(p_token_hash) <> 32 THEN
    RAISE EXCEPTION 'AUTH_INVITATION_TOKEN_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT invitation.* INTO v_invitation
    FROM public.auth_invitations invitation
   WHERE invitation.token_hash=p_token_hash
   LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR v_invitation.status <> 'PENDING' THEN
    RAISE EXCEPTION 'AUTH_INVITATION_NOT_ACTIVE' USING ERRCODE='22023';
  END IF;
  IF v_invitation.expires_at<=now() THEN
    RAISE EXCEPTION 'AUTH_INVITATION_EXPIRED' USING ERRCODE='22023';
  END IF;
  SELECT auth_user.* INTO v_user FROM public.auth_users auth_user WHERE auth_user.id=v_invitation.invited_user_id FOR SHARE;
  IF NOT FOUND OR v_user.status<>'ACTIVE' THEN
    RAISE EXCEPTION 'AUTH_INVITATION_USER_BLOCKED' USING ERRCODE='42501';
  END IF;
  SELECT project.* INTO v_project FROM public.auth_projects project WHERE project.id=v_invitation.project_id AND project.status='ACTIVE';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AUTH_INVITATION_PROJECT_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT product.code INTO v_product_code FROM public.auth_products product WHERE product.id=v_invitation.product_id AND product.status='ACTIVE';
  SELECT role.code INTO v_role_code FROM public.auth_roles role WHERE role.id=v_invitation.role_id;
  IF v_product_code IS NULL OR v_role_code IS NULL THEN
    RAISE EXCEPTION 'AUTH_INVITATION_SCOPE_INVALID' USING ERRCODE='55000';
  END IF;

  INSERT INTO public.auth_access_grants(user_id,role_id,product_id,organization_id,project_id)
  SELECT v_invitation.invited_user_id,v_invitation.role_id,v_invitation.product_id,v_invitation.organization_id,v_invitation.project_id
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.auth_access_grants grant_row
      WHERE grant_row.user_id=v_invitation.invited_user_id
        AND grant_row.role_id=v_invitation.role_id
        AND grant_row.product_id=v_invitation.product_id
        AND grant_row.organization_id IS NOT DISTINCT FROM v_invitation.organization_id
        AND grant_row.project_id IS NOT DISTINCT FROM v_invitation.project_id
        AND grant_row.revoked_at IS NULL
   );

  UPDATE public.auth_users auth_user
     SET login_enabled=true,updated_at=now()
   WHERE auth_user.id=v_invitation.invited_user_id AND auth_user.status='ACTIVE';

  UPDATE public.auth_invitations invitation
     SET status='ACCEPTED',accepted_at=now(),updated_at=now()
   WHERE invitation.id=v_invitation.id;

  RETURN QUERY SELECT v_invitation.id,v_invitation.invited_user_id,v_product_code,v_project.id,v_project.name,v_role_code;
END;
$$;

CREATE OR REPLACE FUNCTION auth_revoke_project_invitation(
  p_actor_user_id uuid,
  p_invitation_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_invitation public.auth_invitations%ROWTYPE;
BEGIN
  SELECT invitation.* INTO v_invitation FROM public.auth_invitations invitation WHERE invitation.id=p_invitation_id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.auth_access_grants g
    JOIN public.auth_role_permissions rp ON rp.role_id=g.role_id
    JOIN public.auth_permissions permission ON permission.id=rp.permission_id
    WHERE g.user_id=p_actor_user_id
      AND g.product_id=v_invitation.product_id
      AND g.project_id=v_invitation.project_id
      AND permission.code='project.members.invite'
      AND g.revoked_at IS NULL
      AND g.valid_from<=now()
      AND (g.valid_until IS NULL OR g.valid_until>=now())
  ) THEN
    RAISE EXCEPTION 'AUTH_INVITATION_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  IF v_invitation.status<>'PENDING' THEN RETURN false; END IF;
  UPDATE public.auth_invitations invitation SET status='REVOKED',revoked_at=now(),updated_at=now() WHERE invitation.id=p_invitation_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION auth_revoke_project_access(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_project_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_product_id uuid;
  v_count integer := 0;
BEGIN
  SELECT product.id INTO v_product_id
    FROM public.auth_products product
   WHERE product.code='DRIVE' AND product.status='ACTIVE';
  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_INVITATION_PRODUCT_UNAVAILABLE' USING ERRCODE='55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.auth_access_grants grant_row
      JOIN public.auth_role_permissions rp ON rp.role_id=grant_row.role_id
      JOIN public.auth_permissions permission ON permission.id=rp.permission_id
     WHERE grant_row.user_id=p_actor_user_id
       AND grant_row.product_id=v_product_id
       AND grant_row.project_id=p_project_id
       AND permission.code='project.members.invite'
       AND grant_row.revoked_at IS NULL
       AND grant_row.valid_from<=now()
       AND (grant_row.valid_until IS NULL OR grant_row.valid_until>=now())
  ) THEN
    RAISE EXCEPTION 'AUTH_INVITATION_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  UPDATE public.auth_access_grants grant_row
     SET revoked_at=now()
   WHERE grant_row.user_id=p_target_user_id
     AND grant_row.product_id=v_product_id
     AND grant_row.project_id=p_project_id
     AND grant_row.revoked_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION auth_invite_project_member(uuid,text,text,uuid,text,bytea,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_accept_project_invitation(bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_revoke_project_invitation(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_revoke_project_access(uuid,uuid,uuid) FROM PUBLIC;

DO $$
DECLARE
  app_role text;
BEGIN
  IF current_user !~ '^dimpro_auth_migrator_(dev|prod)$' THEN
    RAISE EXCEPTION 'DIMPRO AUTH invitation migration must run as an environment migrator role; current_user=%', current_user;
  END IF;
  app_role := regexp_replace(current_user, '_migrator_', '_app_');
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=app_role) THEN
    RAISE EXCEPTION 'DIMPRO AUTH runtime role % does not exist', app_role;
  END IF;
  EXECUTE format('GRANT SELECT ON TABLE public.auth_invitations TO %I',app_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.auth_invite_project_member(uuid,text,text,uuid,text,bytea,timestamptz) TO %I',app_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.auth_accept_project_invitation(bytea) TO %I',app_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.auth_revoke_project_invitation(uuid,uuid) TO %I',app_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.auth_revoke_project_access(uuid,uuid,uuid) TO %I',app_role);
END;
$$;
