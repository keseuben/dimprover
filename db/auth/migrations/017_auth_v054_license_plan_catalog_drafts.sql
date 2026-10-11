-- DIMPRO AUTH V0.5.4 – non-enforcing, unpriced proposal catalog.
-- SOURCE ONLY; requires previous AUTH migrations 014-016, PROD DENY.
-- This does NOT change current personal 50-GiB or project default 10-GiB quota.
BEGIN;
CREATE TABLE public.auth_license_plan_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text NOT NULL CHECK(product_code IN ('DRIVE','PROJECT_GATE')),
  license_scope text NOT NULL CHECK(license_scope IN ('PERSONAL','PROJECT')),
  plan_code text NOT NULL UNIQUE CHECK(plan_code ~ '^[A-Z][A-Z0-9_]{4,63}$'),
  display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 3 AND 120),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK(status IN ('DRAFT','APPROVED','RETIRED')),
  storage_quota_bytes bigint,
  max_members integer CHECK(max_members IS NULL OR max_members BETWEEN 1 AND 100000),
  proposed_features jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(proposed_features)='array'),
  price_mode text NOT NULL DEFAULT 'PENDING'
    CHECK(price_mode IN ('PENDING','FIXED','QUOTE')),
  monthly_price_huf bigint CHECK(monthly_price_huf IS NULL OR monthly_price_huf>=0),
  annual_price_huf bigint CHECK(annual_price_huf IS NULL OR annual_price_huf>=0),
  public_visible boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  approved_by_user_id uuid REFERENCES public.auth_users(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(product_code<>'PROJECT_GATE' OR license_scope='PROJECT'),
  CHECK(product_code<>'PROJECT_GATE' OR storage_quota_bytes IS NULL),
  CHECK(product_code<>'DRIVE' OR (storage_quota_bytes IS NOT NULL AND storage_quota_bytes>0)),
  CHECK(price_mode<>'PENDING' OR (monthly_price_huf IS NULL AND annual_price_huf IS NULL)),
  CHECK(price_mode<>'QUOTE' OR (monthly_price_huf IS NULL AND annual_price_huf IS NULL)),
  CHECK(price_mode<>'FIXED' OR (monthly_price_huf IS NOT NULL AND annual_price_huf IS NOT NULL)),
  CHECK(status NOT IN ('APPROVED','RETIRED') OR
      (approved_at IS NOT NULL AND approved_by_user_id IS NOT NULL AND price_mode<>'PENDING')),
  CHECK(public_visible=false OR status='APPROVED')
);
COMMENT ON TABLE public.auth_license_plan_catalog IS
'Proposal-only price and service tier catalog. Never a source of storage enforcement unless explicitly released.';
CREATE TABLE public.auth_license_plan_catalog_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES public.auth_license_plan_catalog(id) ON DELETE RESTRICT,
  operation text NOT NULL CHECK(operation IN ('CREATE','CHANGE')),
  old_value jsonb,
  new_value jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_license_plan_catalog_filter_idx
  ON public.auth_license_plan_catalog(product_code,license_scope,status);
CREATE OR REPLACE FUNCTION public.auth_audit_plan_catalog()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'AUTH_PLAN_CATALOG_DELETE_DENIED' USING ERRCODE='22023';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id<>OLD.id OR NEW.plan_code<>OLD.plan_code OR
      NEW.product_code<>OLD.product_code OR NEW.license_scope<>OLD.license_scope THEN
      RAISE EXCEPTION 'AUTH_PLAN_IDENTITY_IMMUTABLE' USING ERRCODE='22023';
    END IF;
    IF NEW.revision<>OLD.revision+1 THEN
      RAISE EXCEPTION 'AUTH_PLAN_REVISION_INVALID' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.auth_license_plan_catalog_audit(plan_id,operation,old_value,new_value)
    VALUES(NEW.id,'CHANGE',to_jsonb(OLD),to_jsonb(NEW));
  ELSE
    INSERT INTO public.auth_license_plan_catalog_audit(plan_id,operation,old_value,new_value)
    VALUES(NEW.id,'CREATE',NULL,to_jsonb(NEW));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER auth_license_plan_catalog_audit_trg
  AFTER INSERT OR UPDATE ON public.auth_license_plan_catalog
  FOR EACH ROW EXECUTE FUNCTION public.auth_audit_plan_catalog();
CREATE TRIGGER auth_license_plan_catalog_delete_trg
  BEFORE DELETE ON public.auth_license_plan_catalog
  FOR EACH ROW EXECUTE FUNCTION public.auth_audit_plan_catalog();

-- User-selected storage variants: 7 PERSONAL + 7 PROJECT, plus 3 PROJECT_GATE packages = 17 DRAFT.
-- No records are inserted into auth_project_product_licenses.
INSERT INTO public.auth_license_plan_catalog(
  product_code,license_scope,plan_code,display_name,description,
  storage_quota_bytes,max_members,proposed_features
) VALUES
('DRIVE','PERSONAL','DRIVE_PERSONAL_START','Saját Drive · 5 GiB','Személyes dokumentumtár',5::bigint*1073741824,1,'["PERSONAL_FILES","MANUAL_UPLOAD"]'::jsonb),
('DRIVE','PERSONAL','DRIVE_PERSONAL_10G','Saját Drive · 10 GiB','Személyes dokumentumtár',10::bigint*1073741824,1,'["PERSONAL_FILES","MANUAL_UPLOAD"]'::jsonb),
('DRIVE','PERSONAL','DRIVE_PERSONAL_PLUS','Saját Drive · 25 GiB','Személyes dokumentumtár',25::bigint*1073741824,1,'["PERSONAL_FILES","MANUAL_UPLOAD"]'::jsonb),
('DRIVE','PERSONAL','DRIVE_PERSONAL_50G','Saját Drive · 50 GiB','Személyes dokumentumtár',50::bigint*1073741824,1,'["PERSONAL_FILES","MANUAL_UPLOAD"]'::jsonb),
('DRIVE','PERSONAL','DRIVE_PERSONAL_PRO','Saját Drive · 100 GiB','Személyes dokumentumtár',100::bigint*1073741824,1,'["PERSONAL_FILES","MANUAL_UPLOAD"]'::jsonb),
('DRIVE','PERSONAL','DRIVE_PERSONAL_250G','Saját Drive · 250 GiB','Személyes dokumentumtár',250::bigint*1073741824,1,'["PERSONAL_FILES","MANUAL_UPLOAD"]'::jsonb),
('DRIVE','PERSONAL','DRIVE_PERSONAL_500G','Saját Drive · 500 GiB','Személyes dokumentumtár',500::bigint*1073741824,1,'["PERSONAL_FILES","MANUAL_UPLOAD"]'::jsonb),
('DRIVE','PROJECT','DRIVE_PROJECT_5G','Projekt Drive · 5 GiB','Közös projektfájlok, verziók és külsős résztvevők',5::bigint*1073741824,NULL,'["PROJECT_FILES","FILE_HISTORY","PROJECT_ACL"]'::jsonb),
('DRIVE','PROJECT','DRIVE_PROJECT_10G','Projekt Drive · 10 GiB','Közös projektfájlok, verziók és külsős résztvevők',10::bigint*1073741824,NULL,'["PROJECT_FILES","FILE_HISTORY","PROJECT_ACL"]'::jsonb),
('DRIVE','PROJECT','DRIVE_PROJECT_START','Projekt Drive · 25 GiB','Közös projektfájlok, verziók és külsős résztvevők',25::bigint*1073741824,NULL,'["PROJECT_FILES","FILE_HISTORY","PROJECT_ACL"]'::jsonb),
('DRIVE','PROJECT','DRIVE_PROJECT_50G','Projekt Drive · 50 GiB','Közös projektfájlok, verziók és külsős résztvevők',50::bigint*1073741824,NULL,'["PROJECT_FILES","FILE_HISTORY","PROJECT_ACL"]'::jsonb),
('DRIVE','PROJECT','DRIVE_PROJECT_TEAM','Projekt Drive · 100 GiB','Közös projektfájlok, verziók és külsős résztvevők',100::bigint*1073741824,NULL,'["PROJECT_FILES","FILE_HISTORY","PROJECT_ACL"]'::jsonb),
('DRIVE','PROJECT','DRIVE_PROJECT_250G','Projekt Drive · 250 GiB','Közös projektfájlok, verziók és külsős résztvevők',250::bigint*1073741824,NULL,'["PROJECT_FILES","FILE_HISTORY","PROJECT_ACL"]'::jsonb),
('DRIVE','PROJECT','DRIVE_PROJECT_ENTERPRISE','Projekt Drive · 500 GiB','Közös projektfájlok, verziók és külsős résztvevők',500::bigint*1073741824,NULL,'["PROJECT_FILES","FILE_HISTORY","PROJECT_ACL"]'::jsonb),
('PROJECT_GATE','PROJECT','GATE_PROJECT_BASIC','Projektkapu Alap','Projektirányítás, modulok és munkafolyamatok – alap',NULL,10,'["PROJECT_OVERVIEW","PROJECT_MEMBERS"]'::jsonb),
('PROJECT_GATE','PROJECT','GATE_PROJECT_PRO','Projektkapu Pro','Projektirányítás, modulok és munkafolyamatok – Pro',NULL,25,'["PROJECT_OVERVIEW","PROJECT_MEMBERS","DIALOG_CANDIDATE","DECIDE_CANDIDATE"]'::jsonb),
('PROJECT_GATE','PROJECT','GATE_PROJECT_ENTERPRISE','Projektkapu Enterprise','Projektirányítás, modulok és munkafolyamatok – Enterprise',NULL,100,'["PROJECT_OVERVIEW","PROJECT_MEMBERS","DIALOG_CANDIDATE","DECIDE_CANDIDATE","REPORTS_CANDIDATE"]'::jsonb);

REVOKE ALL ON public.auth_license_plan_catalog FROM PUBLIC;
REVOKE ALL ON public.auth_license_plan_catalog_audit FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_audit_plan_catalog() FROM PUBLIC;
DO $$
DECLARE app_role text;
BEGIN
 IF current_user !~ '^dimpro_auth_migrator_(dev|prod)$' THEN
   RAISE EXCEPTION 'AUTH_PLAN_CATALOG_MIGRATOR_ONLY' USING ERRCODE='42501';
 END IF;
 app_role:=regexp_replace(current_user,'_migrator_','_app_');
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=app_role) THEN
   RAISE EXCEPTION 'AUTH_PLAN_CATALOG_APP_ROLE_MISSING' USING ERRCODE='42501';
 END IF;
 EXECUTE format('GRANT SELECT ON public.auth_license_plan_catalog TO %I',app_role);
END $$;
COMMIT;
