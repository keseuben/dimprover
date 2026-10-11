-- DIMPRO AUTH V0.5.7: five independent digital mini-app product definitions.
-- SOURCE ONLY · requires 018 product topology · PROD DENY.
-- No customer, SSO client, grant, license, price, storage or entitlement activation.
BEGIN;
INSERT INTO public.auth_products(code,name,status) VALUES
  ('DIMPRO_ARUTER','DIMPRO Árutér','DISABLED'),
  ('DIMPRO_FELUJITASI_GYORSKALKULATOR','DIMPRO Felújítási Gyorskalkulátor','DISABLED'),
  ('DIMPRO_INGATLANFELMERO','DIMPRO Ingatlanfelmérő','DISABLED'),
  ('DIMPRO_GAZDASEGED','DIMPRO Gazdasegéd','DISABLED'),
  ('DIMPRO_ONE_EGESZSEG','DIMPRO ONE Egészség','DISABLED')
ON CONFLICT(code) DO NOTHING;
-- Existing product rows (including any pre-existing SSO configuration) preserved.

CREATE TABLE public.auth_mini_app_catalog (
  product_code text PRIMARY KEY REFERENCES public.auth_products(code) ON DELETE RESTRICT,
  license_scopes text[] NOT NULL CHECK(
    cardinality(license_scopes)>0
    AND license_scopes <@ ARRAY['USER','ORGANIZATION']::text[]),
  app_group text NOT NULL CHECK(app_group IN ('BUSINESS','PROPERTY','AGRICULTURE','HEALTH')),
  related_primary_product text REFERENCES public.auth_products(code) ON DELETE RESTRICT,
  requires_primary_subscription boolean NOT NULL DEFAULT false CHECK(requires_primary_subscription=false),
  data_sensitivity text NOT NULL CHECK(data_sensitivity IN ('STANDARD','SPECIAL_CATEGORY_HEALTH')),
  commercial_state text NOT NULL DEFAULT 'PLANNED' CHECK(commercial_state='PLANNED'),
  entitlement_enabled boolean NOT NULL DEFAULT false CHECK(entitlement_enabled=false),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mini_app_health_scope CHECK(
    product_code<>'DIMPRO_ONE_EGESZSEG'
    OR (license_scopes=ARRAY['USER']::text[] AND app_group='HEALTH'
        AND data_sensitivity='SPECIAL_CATEGORY_HEALTH'
        AND related_primary_product='DIMPRO_ONE')),
  CONSTRAINT mini_app_no_health_data_storage CHECK (
    (product_code='DIMPRO_ONE_EGESZSEG' AND data_sensitivity='SPECIAL_CATEGORY_HEALTH')
    OR (product_code<>'DIMPRO_ONE_EGESZSEG' AND data_sensitivity='STANDARD')
  )
);
COMMENT ON TABLE public.auth_mini_app_catalog IS
  'Public product metadata only. No patient/health data, user account, PII, paid subscription or effective access.';

INSERT INTO public.auth_mini_app_catalog
 (product_code,license_scopes,app_group,related_primary_product,data_sensitivity)
VALUES
 ('DIMPRO_ARUTER',ARRAY['ORGANIZATION'],'BUSINESS',NULL,'STANDARD'),
 ('DIMPRO_FELUJITASI_GYORSKALKULATOR',ARRAY['USER','ORGANIZATION'],'PROPERTY',NULL,'STANDARD'),
 ('DIMPRO_INGATLANFELMERO',ARRAY['USER','ORGANIZATION'],'PROPERTY',NULL,'STANDARD'),
 ('DIMPRO_GAZDASEGED',ARRAY['USER','ORGANIZATION'],'AGRICULTURE',NULL,'STANDARD'),
 ('DIMPRO_ONE_EGESZSEG',ARRAY['USER'],'HEALTH','DIMPRO_ONE','SPECIAL_CATEGORY_HEALTH');

REVOKE ALL ON public.auth_mini_app_catalog FROM PUBLIC;
DO $$
DECLARE app_role text;
BEGIN
  IF current_user !~ '^dimpro_auth_migrator_(dev|prod)$' THEN
    RAISE EXCEPTION 'AUTH_MINI_APP_MIGRATOR_ONLY' USING ERRCODE='42501';
  END IF;
  app_role:=regexp_replace(current_user,'_migrator_','_app_');
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=app_role) THEN
    RAISE EXCEPTION 'AUTH_MINI_APP_APP_ROLE_MISSING' USING ERRCODE='42501';
  END IF;
  EXECUTE format('GRANT SELECT ON public.auth_mini_app_catalog TO %I',app_role);
END $$;
COMMIT;
