BEGIN;

CREATE TABLE IF NOT EXISTS auth_schema_migrations (
  version integer PRIMARY KEY,
  name text NOT NULL UNIQUE,
  checksum_sha256 char(64) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_original text NOT NULL,
  email_normalized text NOT NULL UNIQUE CHECK (email_normalized = lower(btrim(email_normalized)) AND position('@' in email_normalized) > 1),
  display_name text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','DISABLED')),
  security_level text NOT NULL DEFAULT 'SIMPLE' CHECK (security_level IN ('SIMPLE','STAFF','PROJECT_MANAGER','ORG_ADMIN','SUPERADMIN')),
  login_enabled boolean NOT NULL DEFAULT true,
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_email_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth_users(id) ON DELETE CASCADE,
  email_normalized text NOT NULL,
  purpose text NOT NULL,
  code_hash bytea NOT NULL CHECK (octet_length(code_hash)=32),
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  consumed_at timestamptz,
  invalidated_at timestamptz,
  requested_ip inet,
  requested_user_agent text,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_email_challenges_lookup_idx
  ON auth_email_challenges(email_normalized, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_email_challenges_ip_idx
  ON auth_email_challenges(requested_ip, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash)=32),
  security_level text NOT NULL CHECK (security_level IN ('SIMPLE','STAFF','PROJECT_MANAGER','ORG_ADMIN','SUPERADMIN')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  absolute_expires_at timestamptz NOT NULL,
  inactivity_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text,
  ip_created inet,
  user_agent text,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_active_idx
  ON auth_sessions(user_id, revoked_at, absolute_expires_at);

CREATE TABLE IF NOT EXISTS auth_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type text NOT NULL,
  user_id uuid REFERENCES auth_users(id) ON DELETE SET NULL,
  email_hash bytea,
  method text,
  result text NOT NULL,
  ip_address inet,
  user_agent text,
  correlation_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_audit_events_created_idx ON auth_audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS auth_audit_events_user_idx ON auth_audit_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES auth_organizations(id) ON DELETE CASCADE,
  external_project_id text,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED','DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_projects_external_project_id_uq
  ON auth_projects(external_project_id) WHERE external_project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  security_level text NOT NULL CHECK (security_level IN ('SIMPLE','STAFF','PROJECT_MANAGER','ORG_ADMIN','SUPERADMIN')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_role_permissions (
  role_id uuid NOT NULL REFERENCES auth_roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES auth_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS auth_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES auth_roles(id) ON DELETE CASCADE,
  product_id uuid REFERENCES auth_products(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES auth_organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES auth_projects(id) ON DELETE CASCADE,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_access_grants_user_idx
  ON auth_access_grants(user_id, revoked_at, valid_from, valid_until);

INSERT INTO auth_products(code,name,status) VALUES ('DRIVE','DIMPRO Drive','ACTIVE')
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,status='ACTIVE';

INSERT INTO auth_roles(code,name,security_level) VALUES ('DRIVE_USER','DIMPRO Drive felhasználó','SIMPLE')
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name;

INSERT INTO auth_permissions(code,description) VALUES ('drive.access','DIMPRO Drive megnyitása és alap API-hozzáférés')
ON CONFLICT (code) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO auth_role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM auth_roles r CROSS JOIN auth_permissions p
WHERE r.code='DRIVE_USER' AND p.code='drive.access'
ON CONFLICT DO NOTHING;

COMMIT;
