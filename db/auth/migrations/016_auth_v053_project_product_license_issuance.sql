-- DIMPRO Central AUTH V0.5.3: audited pending license issuance, never auto-grant access.
-- Depends on 014 and 015. SOURCE ONLY: no migration/deployment/PROD changes.
BEGIN;
ALTER TABLE public.auth_project_product_licenses
  ADD COLUMN issued_by_user_id uuid REFERENCES public.auth_users(id) ON DELETE RESTRICT,
  ADD COLUMN issuance_reason text,
  ADD COLUMN last_status_reason text;
CREATE INDEX IF NOT EXISTS auth_project_product_licenses_product_status_idx
  ON public.auth_project_product_licenses(product_code,status,created_at DESC);

CREATE OR REPLACE FUNCTION public.auth_issue_project_product_license_pending(
  p_external_project_id text,
  p_product_code text,
  p_plan_code text,
  p_payer_type text,
  p_payer_id uuid,
  p_quota_bytes bigint,
  p_max_project_members integer,
  p_operator_id uuid,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE
  v_project uuid;
  v_payer_valid boolean;
  v_license_id uuid;
  v_prefix text;
BEGIN
  -- Both role isolation AND API release-gate are required. The ordinary app
  -- role must not impersonate a SUPERADMIN merely by knowing a user UUID.
  IF current_setting('role',true) NOT IN (
    'dimpro_auth_migrator_dev','dimpro_auth_migrator_prod',
    'dimpro_auth_license_operator_dev','dimpro_auth_license_operator_prod'
  ) THEN
    RAISE EXCEPTION 'AUTH_LICENSE_CALLER_ROLE_DENIED' USING ERRCODE='42501';
  END IF;
  IF p_product_code NOT IN ('DRIVE','PROJECT_GATE') THEN
     RAISE EXCEPTION 'AUTH_LICENSE_PRODUCT_INVALID' USING ERRCODE='22023';
  END IF;
  IF length(btrim(coalesce(p_external_project_id,'')))<1 OR
     length(btrim(coalesce(p_external_project_id,'')))>200 OR
     p_external_project_id<>btrim(p_external_project_id) THEN
     RAISE EXCEPTION 'AUTH_LICENSE_PROJECT_INVALID' USING ERRCODE='22023';
  END IF;
  IF p_plan_code IS NULL OR p_plan_code !~ '^[A-Z0-9][A-Z0-9_-]{1,63}$' THEN
     RAISE EXCEPTION 'AUTH_LICENSE_PLAN_INVALID' USING ERRCODE='22023';
  END IF;
  IF length(btrim(coalesce(p_reason,'')))<12 OR length(btrim(p_reason))>500 THEN
     RAISE EXCEPTION 'AUTH_LICENSE_REASON_REQUIRED' USING ERRCODE='22023';
  END IF;
  IF p_max_project_members IS NOT NULL AND
     (p_max_project_members<1 OR p_max_project_members>100000) THEN
     RAISE EXCEPTION 'AUTH_LICENSE_SEATS_INVALID' USING ERRCODE='22023';
  END IF;
  IF (p_product_code='DRIVE' AND coalesce(p_quota_bytes,0)<=0)
     OR (p_product_code='PROJECT_GATE' AND coalesce(p_quota_bytes,-1)<>0) THEN
     RAISE EXCEPTION 'AUTH_LICENSE_QUOTA_INVALID' USING ERRCODE='22023';
  END IF;
  -- Project creation requires both a valid central AUTH SUPERADMIN identity
  -- and the separate operator secret validated by the API (not granted by DB).
  IF NOT EXISTS (SELECT 1 FROM public.auth_users
      WHERE id=p_operator_id AND security_level='SUPERADMIN'
        AND status='ACTIVE' AND login_enabled=true) THEN
    RAISE EXCEPTION 'AUTH_LICENSE_OPERATOR_UNAUTHORIZED' USING ERRCODE='42501';
  END IF;
  SELECT id INTO v_project FROM public.auth_projects
    WHERE external_project_id=p_external_project_id AND status='ACTIVE' FOR UPDATE;
  IF v_project IS NULL THEN
    RAISE EXCEPTION 'AUTH_LICENSE_PROJECT_UNAVAILABLE' USING ERRCODE='22023';
  END IF;
  IF p_payer_type='ORGANIZATION' THEN
    SELECT EXISTS(SELECT 1 FROM public.auth_organizations
      WHERE id=p_payer_id AND status='ACTIVE') INTO v_payer_valid;
  ELSIF p_payer_type='USER' THEN
    SELECT EXISTS(SELECT 1 FROM public.auth_users
      WHERE id=p_payer_id AND status='ACTIVE') INTO v_payer_valid;
  ELSE
    RAISE EXCEPTION 'AUTH_LICENSE_PAYER_TYPE_INVALID' USING ERRCODE='22023';
  END IF;
  IF NOT v_payer_valid THEN
    RAISE EXCEPTION 'AUTH_LICENSE_PAYER_UNAVAILABLE' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.auth_project_product_licenses
      WHERE auth_project_id=v_project AND product_code=p_product_code) THEN
    RAISE EXCEPTION 'AUTH_LICENSE_ALREADY_EXISTS' USING ERRCODE='23505';
  END IF;
  v_prefix:=CASE WHEN p_product_code='DRIVE' THEN 'DPL-' ELSE 'PGL-' END;
  INSERT INTO public.auth_project_product_licenses(
    auth_project_id,product_code,license_code,plan_code,status,payer_type,
    payer_user_id,payer_organization_id,storage_quota_bytes,max_project_members,
    issued_by_user_id,issuance_reason
  ) VALUES (
    v_project,p_product_code,v_prefix||upper(left(replace(gen_random_uuid()::text,'-',''),20)),
    p_plan_code,'PENDING_APPROVAL',p_payer_type,
    CASE WHEN p_payer_type='USER' THEN p_payer_id ELSE NULL END,
    CASE WHEN p_payer_type='ORGANIZATION' THEN p_payer_id ELSE NULL END,
    p_quota_bytes,p_max_project_members,p_operator_id,btrim(p_reason)
  ) RETURNING id INTO v_license_id;
  RETURN v_license_id;
END $$;

-- Approval is a separate explicit operator action; no automatic grant changes.
CREATE OR REPLACE FUNCTION public.auth_approve_project_product_license(
  p_license_id uuid,
  p_operator_id uuid,
  p_expires_at timestamptz,
  p_reason text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE v_updated integer;
BEGIN
  IF current_setting('role',true) NOT IN (
    'dimpro_auth_migrator_dev','dimpro_auth_migrator_prod',
    'dimpro_auth_license_operator_dev','dimpro_auth_license_operator_prod'
  ) THEN
    RAISE EXCEPTION 'AUTH_LICENSE_CALLER_ROLE_DENIED' USING ERRCODE='42501';
  END IF;
  IF length(btrim(coalesce(p_reason,'')))<12 OR length(btrim(p_reason))>500 THEN
    RAISE EXCEPTION 'AUTH_LICENSE_APPROVAL_REASON_REQUIRED' USING ERRCODE='22023';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'AUTH_LICENSE_EXPIRY_REQUIRED' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.auth_users
      WHERE id=p_operator_id AND security_level='SUPERADMIN'
        AND status='ACTIVE' AND login_enabled=true) THEN
    RAISE EXCEPTION 'AUTH_LICENSE_OPERATOR_UNAUTHORIZED' USING ERRCODE='42501';
  END IF;
  UPDATE public.auth_project_product_licenses
     SET status='ACTIVE',approved_at=now(),approved_by_user_id=p_operator_id,
         starts_at=now(),expires_at=p_expires_at,last_status_reason=btrim(p_reason),
         revision=revision+1,updated_at=now()
   WHERE id=p_license_id AND status='PENDING_APPROVAL';
  GET DIAGNOSTICS v_updated=ROW_COUNT;
  RETURN v_updated=1;
END $$;

REVOKE ALL ON FUNCTION public.auth_issue_project_product_license_pending(text,text,text,text,uuid,bigint,integer,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_approve_project_product_license(uuid,uuid,timestamptz,text) FROM PUBLIC;
-- SECURITY: the ordinary app role must NEVER be able to impersonate an
-- operator by supplying someone else's SUPERADMIN UUID.
-- Keep EXECUTE denied to PUBLIC and dimpro_auth_app_*.
-- Future deployment requires a separate tightly scoped operator DB role,
-- explicit identity binding and security review. DO NOT grant here.
DO $$
BEGIN
 IF current_user !~ '^dimpro_auth_migrator_(dev|prod)$' THEN
   RAISE EXCEPTION 'AUTH_LICENSE_MIGRATOR_ONLY' USING ERRCODE='42501';
 END IF;
END $$;
COMMIT;
