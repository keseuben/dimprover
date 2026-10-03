CREATE TABLE IF NOT EXISTS auth_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL UNIQUE CHECK (client_id ~ '^dimpro-[a-z0-9-]{3,80}$'),
  name text NOT NULL,
  product_code text NOT NULL REFERENCES auth_products(code),
  required_permission_code text NOT NULL REFERENCES auth_permissions(code),
  environment text NOT NULL CHECK (environment IN ('DEV','PROD')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_client_redirect_uris (
  client_id uuid NOT NULL REFERENCES auth_clients(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, redirect_uri),
  CHECK (redirect_uri LIKE 'https://%')
);

CREATE TABLE IF NOT EXISTS auth_authorization_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES auth_clients(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL CHECK (redirect_uri LIKE 'https://%'),
  state text NOT NULL CHECK (length(state) BETWEEN 32 AND 200),
  code_challenge text NOT NULL CHECK (length(code_challenge) BETWEEN 43 AND 128),
  code_challenge_method text NOT NULL DEFAULT 'S256' CHECK (code_challenge_method='S256'),
  requested_ip inet,
  user_agent text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_authorization_requests_expiry_idx
  ON auth_authorization_requests(expires_at, consumed_at);

CREATE TABLE IF NOT EXISTS auth_authorization_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash bytea NOT NULL UNIQUE CHECK (octet_length(code_hash)=32),
  client_id uuid NOT NULL REFERENCES auth_clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  auth_session_id uuid NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL CHECK (redirect_uri LIKE 'https://%'),
  code_challenge text NOT NULL CHECK (length(code_challenge) BETWEEN 43 AND 128),
  code_challenge_method text NOT NULL DEFAULT 'S256' CHECK (code_challenge_method='S256'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_authorization_codes_expiry_idx
  ON auth_authorization_codes(expires_at, consumed_at);

CREATE TABLE IF NOT EXISTS auth_app_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES auth_clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  auth_session_id uuid NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash)=32),
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
CREATE INDEX IF NOT EXISTS auth_app_sessions_active_idx
  ON auth_app_sessions(client_id,user_id,revoked_at,absolute_expires_at);

DO $$
DECLARE
  auth_environment text;
  drive_client_id text;
  drive_client_name text;
  drive_redirect_uri text;
  drive_client_db_id uuid;
BEGIN
  IF current_database()='dimpro_auth_dev' THEN
    auth_environment := 'DEV';
    drive_client_id := 'dimpro-drive-dev';
    drive_client_name := 'DIMPRO Drive DEV';
    drive_redirect_uri := 'https://drive.dev.dimpro.hu/api/dimpro-auth/callback';
  ELSIF current_database()='dimpro_auth_prod' THEN
    auth_environment := 'PROD';
    drive_client_id := 'dimpro-drive-prod';
    drive_client_name := 'DIMPRO Drive';
    drive_redirect_uri := 'https://drive.dimpro.hu/api/dimpro-auth/callback';
  ELSE
    RAISE EXCEPTION 'Unsupported DIMPRO AUTH database for SSO client seed: %', current_database();
  END IF;

  INSERT INTO auth_clients(client_id,name,product_code,required_permission_code,environment,status)
  VALUES (drive_client_id,drive_client_name,'DRIVE','drive.access',auth_environment,'ACTIVE')
  ON CONFLICT (client_id) DO UPDATE SET
    name=EXCLUDED.name,
    product_code=EXCLUDED.product_code,
    required_permission_code=EXCLUDED.required_permission_code,
    environment=EXCLUDED.environment,
    status='ACTIVE',
    updated_at=now()
  RETURNING id INTO drive_client_db_id;

  INSERT INTO auth_client_redirect_uris(client_id,redirect_uri)
  VALUES (drive_client_db_id,drive_redirect_uri)
  ON CONFLICT DO NOTHING;
END;
$$;
