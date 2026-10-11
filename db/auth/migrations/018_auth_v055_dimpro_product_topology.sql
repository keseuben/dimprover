-- Central AUTH V0.5.5 – classified five-layer product architecture + shared Drive.
-- SOURCE CANDIDATE / NO LIVE MIGRATION / PROD DENY.
-- This is a product CATALOG ONLY. No automatic entitlement, client SSO,
-- access grant, billable license, published plan, quota or user is created.
BEGIN;
INSERT INTO public.auth_products(code,name,status) VALUES
  ('DIMPRO_ONE','DIMPROONE','DISABLED'),
  ('DIMPRO_WORK','DIMPRO WORK','DISABLED'),
  ('PROJECT_GATE','DIMPRO Projektkapu','DISABLED'),
  ('DIMPRO_BUILD','DIMPRO BUILD','DISABLED'),
  ('DIMPROVER','DIMPROVER','DISABLED')
ON CONFLICT(code) DO NOTHING;
-- Preserve any preexisting active product exactly as configured.
-- Shared DRIVE was previously inserted by migration 001 and is never mutated.

CREATE TABLE public.auth_product_scope_catalog (
  product_code text PRIMARY KEY REFERENCES public.auth_products(code) ON DELETE RESTRICT,
  architectural_level integer CHECK(architectural_level IS NULL OR architectural_level BETWEEN 1 AND 5),
  product_role text NOT NULL CHECK(product_role IN ('PRIMARY_PRODUCT','SHARED_SERVICE')),
  license_scopes text[] NOT NULL CHECK(cardinality(license_scopes)>0
    AND license_scopes <@ ARRAY['USER','ORGANIZATION','PROJECT']::text[]),
  storage_policy text NOT NULL CHECK(storage_policy IN
    ('PERSONAL_DRIVE','PROJECT_DRIVE','SHARED_DRIVE','NO_INDEPENDENT_DRIVE_QUOTA')),
  commercial_source text NOT NULL CHECK(commercial_source IN
    ('PROJECT_LICENSE_SOURCE_ONLY','NOT_IMPLEMENTED')),
  entitlement_enabled boolean NOT NULL DEFAULT false CHECK(entitlement_enabled=false),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((product_role='PRIMARY_PRODUCT' AND architectural_level IS NOT NULL)
    OR (product_role='SHARED_SERVICE' AND architectural_level IS NULL)),
  CHECK(product_code<>'PROJECT_GATE' OR storage_policy='NO_INDEPENDENT_DRIVE_QUOTA')
);
CREATE UNIQUE INDEX auth_product_scope_catalog_layer_unique
  ON public.auth_product_scope_catalog(architectural_level)
  WHERE architectural_level IS NOT NULL;

INSERT INTO public.auth_product_scope_catalog
  (product_code,architectural_level,product_role,license_scopes,storage_policy,commercial_source)
VALUES
  ('DIMPRO_ONE',1,'PRIMARY_PRODUCT',ARRAY['USER'],'SHARED_DRIVE','NOT_IMPLEMENTED'),
  ('DIMPRO_WORK',2,'PRIMARY_PRODUCT',ARRAY['ORGANIZATION'],'SHARED_DRIVE','NOT_IMPLEMENTED'),
  ('PROJECT_GATE',3,'PRIMARY_PRODUCT',ARRAY['PROJECT'],'NO_INDEPENDENT_DRIVE_QUOTA','PROJECT_LICENSE_SOURCE_ONLY'),
  ('DIMPRO_BUILD',4,'PRIMARY_PRODUCT',ARRAY['PROJECT','ORGANIZATION'],'SHARED_DRIVE','NOT_IMPLEMENTED'),
  ('DIMPROVER',5,'PRIMARY_PRODUCT',ARRAY['ORGANIZATION','PROJECT'],'SHARED_DRIVE','NOT_IMPLEMENTED'),
  ('DRIVE',NULL,'SHARED_SERVICE',ARRAY['USER','PROJECT'],'SHARED_DRIVE','PROJECT_LICENSE_SOURCE_ONLY');

REVOKE ALL ON public.auth_product_scope_catalog FROM PUBLIC;
DO $$
DECLARE app_role text;
BEGIN
 IF current_user !~ '^dimpro_auth_migrator_(dev|prod)$' THEN
  RAISE EXCEPTION 'AUTH_PRODUCT_TOPOLOGY_MIGRATOR_ONLY' USING ERRCODE='42501';
 END IF;
 app_role:=regexp_replace(current_user,'_migrator_','_app_');
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=app_role) THEN
  RAISE EXCEPTION 'AUTH_PRODUCT_TOPOLOGY_APP_ROLE_MISSING' USING ERRCODE='42501';
 END IF;
 EXECUTE format('GRANT SELECT ON public.auth_product_scope_catalog TO %I',app_role);
END $$;
COMMIT;
