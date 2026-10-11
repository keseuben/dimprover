-- DIMPRO Central AUTH V0.5.2 – project+product commercial license foundation.
-- Requires 014_auth_v051_drive_project_licenses.sql. SOURCE ONLY; PROD DENY.
-- Existing DRIVE rows preserved and reclassified as product_code='DRIVE'.
BEGIN;
ALTER TABLE public.auth_drive_project_licenses RENAME TO auth_project_product_licenses;
ALTER TABLE public.auth_project_product_licenses ADD COLUMN product_code text NOT NULL DEFAULT 'DRIVE';
ALTER TABLE public.auth_project_product_licenses DROP CONSTRAINT auth_drive_project_licenses_auth_project_id_key;
ALTER TABLE public.auth_project_product_licenses ADD CONSTRAINT auth_project_product_licenses_project_product_uq
  UNIQUE (auth_project_id,product_code);
ALTER TABLE public.auth_project_product_licenses ADD CONSTRAINT auth_project_product_licenses_product_code_check
  CHECK (product_code IN ('DRIVE','PROJECT_GATE'));
ALTER TABLE public.auth_project_product_licenses ALTER COLUMN product_code DROP DEFAULT;
ALTER TABLE public.auth_project_product_licenses DROP CONSTRAINT auth_drive_project_licenses_license_code_check;
ALTER TABLE public.auth_project_product_licenses ADD CONSTRAINT auth_project_product_licenses_code_check
  CHECK (license_code ~ '^(DPL|PGL)-[A-Z0-9][A-Z0-9-]{4,63}$');
ALTER TABLE public.auth_project_product_licenses DROP CONSTRAINT auth_drive_project_licenses_storage_quota_bytes_check;
ALTER TABLE public.auth_project_product_licenses ADD CONSTRAINT auth_project_product_licenses_quota_check
  CHECK ((product_code='DRIVE' AND storage_quota_bytes>0)
     OR (product_code='PROJECT_GATE' AND storage_quota_bytes>=0));
COMMENT ON TABLE public.auth_project_product_licenses IS
  'Commercial license per project and product; DRIVE and PROJECT_GATE independently versioned. Not Project Core ACL.';

ALTER TABLE public.auth_drive_project_license_audit RENAME TO auth_project_product_license_audit;
ALTER TABLE public.auth_project_product_license_audit ADD COLUMN product_code text NOT NULL DEFAULT 'DRIVE';
ALTER TABLE public.auth_project_product_license_audit ADD CONSTRAINT auth_project_product_license_audit_product_check
  CHECK (product_code IN ('DRIVE','PROJECT_GATE'));
ALTER TABLE public.auth_project_product_license_audit ALTER COLUMN product_code DROP DEFAULT;

-- Replace the existing 014 triggers with a shared audited project-product trigger.
DROP TRIGGER IF EXISTS auth_drive_project_license_audit_trg ON public.auth_project_product_licenses;
DROP TRIGGER IF EXISTS auth_drive_project_license_delete_trg ON public.auth_project_product_licenses;
CREATE OR REPLACE FUNCTION public.auth_audit_project_product_license()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'AUTH_PROJECT_PRODUCT_LICENSE_DELETE_DENIED' USING ERRCODE='22023';
 ELSIF TG_OP='INSERT' THEN
    INSERT INTO public.auth_project_product_license_audit
      (license_id,auth_project_id,product_code,old_value,new_value,operation)
    VALUES(NEW.id,NEW.auth_project_id,NEW.product_code,NULL,to_jsonb(NEW),'CREATE');
 ELSE
    IF NEW.id <> OLD.id OR NEW.auth_project_id <> OLD.auth_project_id
       OR NEW.product_code <> OLD.product_code OR NEW.license_code <> OLD.license_code
       OR NEW.payer_type <> OLD.payer_type
       OR NEW.payer_user_id IS DISTINCT FROM OLD.payer_user_id
       OR NEW.payer_organization_id IS DISTINCT FROM OLD.payer_organization_id THEN
       RAISE EXCEPTION 'AUTH_PROJECT_PRODUCT_LICENSE_IDENTITY_IMMUTABLE' USING ERRCODE='22023';
    END IF;
    IF NEW.revision <> OLD.revision+1 THEN
       RAISE EXCEPTION 'AUTH_PROJECT_PRODUCT_LICENSE_REVISION_INVALID' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.auth_project_product_license_audit
      (license_id,auth_project_id,product_code,old_value,new_value,operation)
    VALUES(NEW.id,NEW.auth_project_id,NEW.product_code,to_jsonb(OLD),to_jsonb(NEW),'CHANGE');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER auth_project_product_license_audit_trg
 AFTER INSERT OR UPDATE ON public.auth_project_product_licenses
 FOR EACH ROW EXECUTE FUNCTION public.auth_audit_project_product_license();
CREATE TRIGGER auth_project_product_license_no_delete_trg
 BEFORE DELETE ON public.auth_project_product_licenses
 FOR EACH ROW EXECUTE FUNCTION public.auth_audit_project_product_license();

REVOKE ALL ON public.auth_project_product_licenses FROM PUBLIC;
REVOKE ALL ON public.auth_project_product_license_audit FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_audit_project_product_license() FROM PUBLIC;

-- No payment, member access or effective runtime entitlement change occurs here.
DO $$
DECLARE app_role text;
BEGIN
 IF current_user !~ '^dimpro_auth_migrator_(dev|prod)$' THEN
   RAISE EXCEPTION 'AUTH_PROJECT_PRODUCT_LICENSE_MIGRATOR_ONLY: %', current_user;
 END IF;
 app_role:=regexp_replace(current_user,'_migrator_','_app_');
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=app_role) THEN
   RAISE EXCEPTION 'AUTH_PROJECT_PRODUCT_LICENSE_APP_ROLE_MISSING: %', app_role;
 END IF;
 EXECUTE format('GRANT SELECT ON public.auth_project_product_licenses TO %I',app_role);
END $$;
COMMIT;
