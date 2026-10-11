-- Central AUTH V0.5.8: DIMPRO Drop as a standalone shared file-transfer product.
-- SOURCE CANDIDATE / NOT APPLIED / PROD DENY.
-- Existing Drop Identity Core and Send-code entitlements remain authoritative.
-- No automatic account/license migration or revoke, no SSO/client activation.
BEGIN;
INSERT INTO public.auth_products(code,name,status) VALUES
  ('DIMPRO_DROP','DIMPRO Drop','DISABLED')
ON CONFLICT(code) DO NOTHING;

CREATE TABLE public.auth_connected_service_catalog (
  product_code text PRIMARY KEY REFERENCES public.auth_products(code) ON DELETE RESTRICT,
  companion_product_code text NOT NULL REFERENCES public.auth_products(code) ON DELETE RESTRICT,
  service_role text NOT NULL DEFAULT 'SHARED_SERVICE'
    CHECK(service_role='SHARED_SERVICE'),
  license_scopes text[] NOT NULL
    CHECK(cardinality(license_scopes)>0
      AND license_scopes <@ ARRAY['USER','ORGANIZATION']::text[]),
  requires_companion_license boolean NOT NULL DEFAULT false
    CHECK(requires_companion_license=false),
  integration_policy text NOT NULL DEFAULT 'OPTIONAL_PROJECT_ACL_GATED'
    CHECK(integration_policy='OPTIONAL_PROJECT_ACL_GATED'),
  storage_policy text NOT NULL DEFAULT 'TEMPORARY_TRANSFER_SEPARATE_FROM_DRIVE'
    CHECK(storage_policy='TEMPORARY_TRANSFER_SEPARATE_FROM_DRIVE'),
  commercial_state text NOT NULL DEFAULT 'MIGRATION_PLANNED'
    CHECK(commercial_state='MIGRATION_PLANNED'),
  legacy_cutover_released boolean NOT NULL DEFAULT false
    CHECK(legacy_cutover_released=false),
  entitlement_enabled boolean NOT NULL DEFAULT false
    CHECK(entitlement_enabled=false),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(product_code='DIMPRO_DROP' AND companion_product_code='DRIVE')
);
COMMENT ON TABLE public.auth_connected_service_catalog IS
  'Planning-only connected shared services. No customer, transfer, email, Send code, entitlement, or migration map data.';
INSERT INTO public.auth_connected_service_catalog
 (product_code,companion_product_code,license_scopes)
VALUES ('DIMPRO_DROP','DRIVE',ARRAY['USER','ORGANIZATION']);

REVOKE ALL ON public.auth_connected_service_catalog FROM PUBLIC;
DO $$
DECLARE app_role text;
BEGIN
 IF current_user !~ '^dimpro_auth_migrator_(dev|prod)$' THEN
  RAISE EXCEPTION 'AUTH_DROP_SERVICE_MIGRATOR_ONLY' USING ERRCODE='42501';
 END IF;
 app_role:=regexp_replace(current_user,'_migrator_','_app_');
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=app_role) THEN
  RAISE EXCEPTION 'AUTH_DROP_SERVICE_APP_ROLE_MISSING' USING ERRCODE='42501';
 END IF;
 EXECUTE format('GRANT SELECT ON public.auth_connected_service_catalog TO %I',app_role);
END $$;
-- No DROP transfer tables, user licenses, mail recipients, SSO, ACL or mappings altered.
COMMIT;
