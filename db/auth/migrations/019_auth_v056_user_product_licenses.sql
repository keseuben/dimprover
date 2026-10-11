-- DIMPRO AUTH V0.5.6: personal product license registry, SOURCE ONLY.
-- Requires 001 and 018. Migration must be approved, not executed as part of build.
-- Commercial records never grant permissions, products, quota, sessions or storage.
-- PROD DENY.
BEGIN;

CREATE TABLE public.auth_user_product_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.auth_users(id) ON DELETE RESTRICT,
  product_code text NOT NULL REFERENCES public.auth_products(code) ON DELETE RESTRICT
    CHECK(product_code IN ('DRIVE','DIMPRO_ONE')),
  license_code text NOT NULL UNIQUE
    CHECK(license_code ~ '^(UDL|UOL)-[A-Z0-9][A-Z0-9-]{4,63}$'),
  plan_code text NOT NULL CHECK(plan_code ~ '^[A-Z0-9][A-Z0-9_-]{1,63}$'),
  status text NOT NULL DEFAULT 'PENDING_APPROVAL'
    CHECK(status IN ('DRAFT','PENDING_APPROVAL','ACTIVE','SUSPENDED','EXPIRED','CANCELLED')),
  payer_type text NOT NULL CHECK(payer_type IN ('USER','ORGANIZATION')),
  payer_user_id uuid REFERENCES public.auth_users(id) ON DELETE RESTRICT,
  payer_organization_id uuid REFERENCES public.auth_organizations(id) ON DELETE RESTRICT,
  storage_quota_bytes bigint NOT NULL DEFAULT 0
    CHECK(storage_quota_bytes >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  approved_at timestamptz,
  approved_by_user_id uuid REFERENCES public.auth_users(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1 CHECK(revision >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_user_product_licenses_owner_product_uq UNIQUE(owner_user_id,product_code),
  CONSTRAINT auth_user_product_license_prefix_check CHECK(
    (product_code='DRIVE' AND license_code LIKE 'UDL-%') OR
    (product_code='DIMPRO_ONE' AND license_code LIKE 'UOL-%')
  ),
  CONSTRAINT auth_user_product_license_quota_check CHECK(
    (product_code='DRIVE' AND storage_quota_bytes > 0) OR
    (product_code='DIMPRO_ONE' AND storage_quota_bytes = 0)
  ),
  CONSTRAINT auth_user_product_license_payer_check CHECK(
    (payer_type='USER' AND payer_user_id IS NOT NULL AND payer_organization_id IS NULL)
    OR (payer_type='ORGANIZATION' AND payer_organization_id IS NOT NULL AND payer_user_id IS NULL)
  ),
  CONSTRAINT auth_user_product_license_active_proof_check CHECK(
    status<>'ACTIVE'
    OR (approved_at IS NOT NULL AND approved_by_user_id IS NOT NULL
        AND starts_at IS NOT NULL AND expires_at IS NOT NULL)
  ),
  CONSTRAINT auth_user_product_license_dates_check CHECK(
    starts_at IS NULL OR expires_at IS NULL OR expires_at>starts_at
  )
);
COMMENT ON TABLE public.auth_user_product_licenses IS
  'Commercial USER-owned product subscriptions only; no implicit app access, ACL, paid status or runtime quota.';
CREATE INDEX auth_user_product_licenses_status_idx
  ON public.auth_user_product_licenses(product_code,status,created_at DESC);

CREATE TABLE public.auth_user_product_license_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  license_id uuid NOT NULL REFERENCES public.auth_user_product_licenses(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES public.auth_users(id) ON DELETE RESTRICT,
  product_code text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  operation text NOT NULL CHECK(operation IN ('CREATE','CHANGE')),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_user_product_license_audit_owner_idx
  ON public.auth_user_product_license_audit(owner_user_id,recorded_at DESC);

CREATE FUNCTION public.auth_audit_user_product_license()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'AUTH_USER_LICENSE_DELETE_DENIED' USING ERRCODE='22023';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id<>OLD.id OR NEW.owner_user_id<>OLD.owner_user_id
      OR NEW.product_code<>OLD.product_code OR NEW.license_code<>OLD.license_code
      OR NEW.payer_type<>OLD.payer_type
      OR NEW.payer_user_id IS DISTINCT FROM OLD.payer_user_id
      OR NEW.payer_organization_id IS DISTINCT FROM OLD.payer_organization_id THEN
      RAISE EXCEPTION 'AUTH_USER_LICENSE_OWNER_IMMUTABLE' USING ERRCODE='22023';
    END IF;
    IF NEW.revision<>OLD.revision+1 THEN
      RAISE EXCEPTION 'AUTH_USER_LICENSE_REVISION_INVALID' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.auth_user_product_license_audit
      (license_id,owner_user_id,product_code,old_value,new_value,operation)
    VALUES(NEW.id,NEW.owner_user_id,NEW.product_code,to_jsonb(OLD),to_jsonb(NEW),'CHANGE');
  ELSIF TG_OP='INSERT' THEN
    INSERT INTO public.auth_user_product_license_audit
      (license_id,owner_user_id,product_code,old_value,new_value,operation)
    VALUES(NEW.id,NEW.owner_user_id,NEW.product_code,NULL,to_jsonb(NEW),'CREATE');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER auth_user_product_license_audit_trg
  AFTER INSERT OR UPDATE ON public.auth_user_product_licenses
  FOR EACH ROW EXECUTE FUNCTION public.auth_audit_user_product_license();
CREATE TRIGGER auth_user_product_license_delete_trg
  BEFORE DELETE ON public.auth_user_product_licenses
  FOR EACH ROW EXECUTE FUNCTION public.auth_audit_user_product_license();

REVOKE ALL ON public.auth_user_product_licenses FROM PUBLIC;
REVOKE ALL ON public.auth_user_product_license_audit FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_audit_user_product_license() FROM PUBLIC;

DO $$
DECLARE app_role text;
BEGIN
  IF current_user !~ '^dimpro_auth_migrator_(dev|prod)$' THEN
    RAISE EXCEPTION 'AUTH_USER_LICENSE_MIGRATOR_ONLY' USING ERRCODE='42501';
  END IF;
  app_role:=regexp_replace(current_user,'_migrator_','_app_');
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=app_role) THEN
    RAISE EXCEPTION 'AUTH_USER_LICENSE_APP_ROLE_MISSING' USING ERRCODE='42501';
  END IF;
  EXECUTE format('GRANT SELECT ON public.auth_user_product_licenses TO %I',app_role);
END $$;
-- No INSERTs into this table; no commercial licenses silently created.
-- The runtime role has SELECT only, never UPDATE/INSERT/DELETE/audit access.
COMMIT;
