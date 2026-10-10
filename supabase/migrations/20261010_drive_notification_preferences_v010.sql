-- DIMPRO Drive V0.9.34: separate document-change and approval notification preferences,
-- plus idempotent per-recipient delivery ledger. SOURCE ONLY, guarded DEV migration required.
BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.project_core_projects') IS NULL
     OR to_regclass('public.drive_core_change_events') IS NULL THEN
    RAISE EXCEPTION 'DRIVE_NOTIFICATION_DEPENDENCIES_MISSING' USING ERRCODE='55000';
  END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS public.drive_core_notification_preferences (
  project_id text NOT NULL REFERENCES public.project_core_projects(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  category text NOT NULL CHECK (category IN ('DOCUMENT_CHANGES','APPROVAL_DECISIONS')),
  enabled boolean NOT NULL DEFAULT false,
  digest_frequency text NOT NULL DEFAULT 'DAILY'
    CHECK (digest_frequency IN ('FOUR_HOURLY','EIGHT_HOURLY','DAILY','WEEKLY','MONTHLY','NONE')),
  followed_only boolean NOT NULL DEFAULT false,
  last_success_sequence bigint NOT NULL DEFAULT 0 CHECK (last_success_sequence >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id,user_id,category)
);
CREATE TABLE IF NOT EXISTS public.drive_core_digest_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES public.project_core_projects(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  category text NOT NULL CHECK (category IN ('DOCUMENT_CHANGES','APPROVAL_DECISIONS')),
  scheduled_slot text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED')),
  event_ids jsonb NOT NULL CHECK (jsonb_typeof(event_ids)='array' AND octet_length(event_ids::text) <= 30000),
  cursor_from bigint NOT NULL,
  cursor_to bigint NOT NULL CHECK (cursor_to>=cursor_from),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 100),
  last_error_code text NULL,
  message_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz NULL,
  UNIQUE(project_id,user_id,category,scheduled_slot)
);
CREATE INDEX IF NOT EXISTS drive_notification_preferences_user_idx
  ON public.drive_core_notification_preferences(user_id,project_id);
CREATE INDEX IF NOT EXISTS drive_digest_pending_idx
  ON public.drive_core_digest_deliveries(status,created_at) WHERE status IN ('PENDING','FAILED');
ALTER TABLE public.drive_core_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drive_core_digest_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drive_core_notification_preferences, public.drive_core_digest_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.drive_core_notification_preferences TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.drive_core_digest_deliveries TO service_role;
COMMIT;
