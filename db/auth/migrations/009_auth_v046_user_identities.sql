CREATE TABLE IF NOT EXISTS auth_user_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  identity_type text NOT NULL DEFAULT 'PERSONAL' CHECK (identity_type IN ('PERSONAL','WORK')),
  email_original text NOT NULL,
  email_normalized text NOT NULL CHECK (email_normalized = lower(btrim(email_normalized)) AND position('@' in email_normalized) > 1),
  display_name text,
  organization_name text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','VERIFIED','DISABLED')),
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  challenge_id uuid REFERENCES auth_email_challenges(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT is_primary OR status <> 'DISABLED')
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_user_identities_email_uq
  ON auth_user_identities(email_normalized);
CREATE UNIQUE INDEX IF NOT EXISTS auth_user_identities_primary_uq
  ON auth_user_identities(user_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS auth_user_identities_user_status_idx
  ON auth_user_identities(user_id,status,created_at);

INSERT INTO auth_user_identities(
  user_id,identity_type,email_original,email_normalized,display_name,organization_name,status,is_primary,verified_at
)
SELECT
  u.id,
  'PERSONAL',
  u.email_original,
  u.email_normalized,
  u.display_name,
  NULL,
  CASE WHEN u.email_verified_at IS NOT NULL THEN 'VERIFIED' ELSE 'PENDING' END,
  true,
  u.email_verified_at
FROM auth_users u
ON CONFLICT (email_normalized) DO NOTHING;

DO $$
DECLARE app_role text;
BEGIN
  IF current_user !~ '^dimpro_auth_migrator_(dev|prod)$' THEN
    RAISE EXCEPTION 'DIMPRO AUTH user identities migration must run as an environment migrator role; current_user=%', current_user;
  END IF;
  app_role := regexp_replace(current_user, '_migrator_', '_app_');
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=app_role) THEN
    RAISE EXCEPTION 'DIMPRO AUTH runtime role % does not exist', app_role;
  END IF;
  EXECUTE format('GRANT SELECT,INSERT ON TABLE public.auth_user_identities TO %I', app_role);
  EXECUTE format('GRANT UPDATE (identity_type,display_name,organization_name,status,verified_at,challenge_id,updated_at) ON TABLE public.auth_user_identities TO %I', app_role);
END;
$$;
