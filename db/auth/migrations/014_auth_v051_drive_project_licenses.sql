-- DIMPRO Central AUTH V0.5.1: per-project Drive license foundation.
-- SOURCE ONLY; PROD DENY. No entitlement gate, billing or migration applied.
BEGIN;
CREATE TABLE IF NOT EXISTS public.auth_drive_project_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_project_id uuid NOT NULL UNIQUE REFERENCES public.auth_projects(id) ON DELETE RESTRICT,
  license_code text NOT NULL UNIQUE CHECK (license_code ~ '^DPL-[A-Z0-9][A-Z0-9-]{4,63}$'),
  plan_code text NOT NULL CHECK (plan_code ~ '^[A-Z0-9][A-Z0-9_-]{1,63}$'),
  status text NOT NULL DEFAULT 'PENDING_APPROVAL'
    CHECK(status IN ('DRAFT','PENDING_APPROVAL','ACTIVE','SUSPENDED','EXPIRED','CANCELLED')),
  payer_type text NOT NULL CHECK (payer_type IN ('USER','ORGANIZATION')),
  payer_user_id uuid REFERENCES public.auth_users(id) ON DELETE RESTRICT,
  payer_organization_id uuid REFERENCES public.auth_organizations(id) ON DELETE RESTRICT,
  storage_quota_bytes bigint NOT NULL CHECK (storage_quota_bytes > 0),
  max_project_members integer CHECK (max_project_members IS NULL OR max_project_members BETWEEN 1 AND 100000),
  starts_at timestamptz,
  expires_at timestamptz,
  approved_at timestamptz,
  approved_by_user_id uuid REFERENCES public.auth_users(id) ON DELETE RESTRICT,
  legacy_identity_license_id uuid,
  revision integer NOT NULL DEFAULT 1 CHECK(revision >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((payer_type='USER' AND payer_user_id IS NOT NULL AND payer_organization_id IS NULL)
    OR (payer_type='ORGANIZATION' AND payer_organization_id IS NOT NULL AND payer_user_id IS NULL)),
  CHECK(expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at),
  CHECK(status <> 'ACTIVE' OR (approved_at IS NOT NULL AND approved_by_user_id IS NOT NULL AND starts_at IS NOT NULL))
);
COMMENT ON TABLE public.auth_drive_project_licenses IS
'Project-owned paid license (not user ACL); read-only until billing and enforcement audited.';
CREATE TABLE IF NOT EXISTS public.auth_drive_project_license_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 license_id uuid NOT NULL REFERENCES public.auth_drive_project_licenses(id) ON DELETE RESTRICT,
 auth_project_id uuid NOT NULL REFERENCES public.auth_projects(id) ON DELETE RESTRICT,
 old_value jsonb,
 new_value jsonb,
 operation text NOT NULL CHECK(operation IN ('CREATE','CHANGE')),
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_drive_project_license_audit_project_idx
 ON public.auth_drive_project_license_audit(auth_project_id,recorded_at DESC);
CREATE OR REPLACE FUNCTION public.auth_audit_drive_project_license()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO public.auth_drive_project_license_audit(license_id,auth_project_id,old_value,new_value,operation)
  VALUES(NEW.id,NEW.auth_project_id,NULL,to_jsonb(NEW),'CREATE');
 ELSIF TG_OP='DELETE' THEN
   RAISE EXCEPTION 'AUTH_PROJECT_LICENSE_DELETE_DENIED' USING ERRCODE='22023';
 ELSIF TG_OP='UPDATE' THEN
  IF NEW.auth_project_id <> OLD.auth_project_id OR NEW.id <> OLD.id
    OR NEW.payer_type <> OLD.payer_type
    OR NEW.payer_user_id IS DISTINCT FROM OLD.payer_user_id
    OR NEW.payer_organization_id IS DISTINCT FROM OLD.payer_organization_id
    OR NEW.license_code <> OLD.license_code THEN
    RAISE EXCEPTION 'AUTH_PROJECT_LICENSE_IDENTITY_IMMUTABLE' USING ERRCODE='22023';
  END IF;
  IF NEW.revision <> OLD.revision+1 THEN
    RAISE EXCEPTION 'AUTH_PROJECT_LICENSE_REVISION_INVALID' USING ERRCODE='22023';
  END IF;
  IF NEW IS DISTINCT FROM OLD THEN
    INSERT INTO public.auth_drive_project_license_audit(license_id,auth_project_id,old_value,new_value,operation)
    VALUES(NEW.id,NEW.auth_project_id,to_jsonb(OLD),to_jsonb(NEW),'CHANGE');
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS auth_drive_project_license_audit_trg ON public.auth_drive_project_licenses;
CREATE TRIGGER auth_drive_project_license_audit_trg
 AFTER INSERT OR UPDATE ON public.auth_drive_project_licenses
 FOR EACH ROW EXECUTE FUNCTION public.auth_audit_drive_project_license();
DROP TRIGGER IF EXISTS auth_drive_project_license_delete_trg ON public.auth_drive_project_licenses;
CREATE TRIGGER auth_drive_project_license_delete_trg
 BEFORE DELETE ON public.auth_drive_project_licenses
 FOR EACH ROW EXECUTE FUNCTION public.auth_audit_drive_project_license();
REVOKE ALL ON public.auth_drive_project_licenses FROM PUBLIC;
REVOKE ALL ON public.auth_drive_project_license_audit FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_audit_drive_project_license() FROM PUBLIC;
DO $$
DECLARE app_role text;
BEGIN
 IF current_user !~ '^dimpro_auth_migrator_(dev|prod)$' THEN
   RAISE EXCEPTION 'AUTH_PROJECT_LICENSE_MIGRATOR_ONLY: %',current_user;
 END IF;
 app_role:=regexp_replace(current_user,'_migrator_','_app_');
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=app_role) THEN
   RAISE EXCEPTION 'AUTH_PROJECT_LICENSE_RUNTIME_ROLE_MISSING: %',app_role;
 END IF;
 EXECUTE format('GRANT SELECT ON TABLE public.auth_drive_project_licenses TO %I',app_role);
END $$;
-- No runtime write privileges, no activation, no default active licenses.
COMMIT;
