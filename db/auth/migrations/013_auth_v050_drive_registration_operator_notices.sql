-- DIMPRO AUTH V0.5.0 – durable notification queue for *verified* Drive registration applications.
-- SOURCE ONLY. Run only by the environment migrator, after explicit approval. PROD DENY.
BEGIN;

CREATE TABLE IF NOT EXISTS public.auth_drive_registration_operator_notices (
  registration_id uuid PRIMARY KEY REFERENCES public.auth_drive_registration_requests(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PROCESSING','SENT','AMBIGUOUS')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 1),
  claim_token uuid,
  attempted_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'SENT' OR sent_at IS NOT NULL),
  CHECK (status <> 'PROCESSING' OR (claim_token IS NOT NULL AND attempted_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS auth_drive_registration_operator_notices_status_idx
  ON public.auth_drive_registration_operator_notices(status, created_at);

CREATE OR REPLACE FUNCTION public.auth_queue_drive_registration_operator_notice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  -- EMAIL_VERIFIED must be reached through the existing authenticated OTP transaction.
  -- A renewed OTP cannot re-enqueue a previously-notified registration.
  IF NEW.status = 'EMAIL_VERIFIED'
     AND OLD.status IS DISTINCT FROM 'EMAIL_VERIFIED' THEN
    INSERT INTO public.auth_drive_registration_operator_notices(registration_id)
    VALUES(NEW.id) ON CONFLICT(registration_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS auth_drive_registration_operator_notice_enqueue
  ON public.auth_drive_registration_requests;
CREATE TRIGGER auth_drive_registration_operator_notice_enqueue
AFTER UPDATE OF status ON public.auth_drive_registration_requests
FOR EACH ROW EXECUTE FUNCTION public.auth_queue_drive_registration_operator_notice();

-- Backfill only already verified, undecided applications. No email is sent by this migration.
INSERT INTO public.auth_drive_registration_operator_notices(registration_id)
SELECT r.id FROM public.auth_drive_registration_requests r
 WHERE r.status = 'EMAIL_VERIFIED'
ON CONFLICT(registration_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.auth_claim_drive_registration_operator_notice(p_registration_id uuid)
RETURNS TABLE (
  notice_registration_id uuid,
  notice_claim_token uuid,
  applicant_email text,
  applicant_name text,
  applicant_organization text,
  verified_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RETURN QUERY
    WITH claimed AS (
      UPDATE public.auth_drive_registration_operator_notices n
         SET status = 'PROCESSING',
             claim_token = gen_random_uuid(),
             attempt_count = 1,
             attempted_at = now(),
             updated_at = now()
        FROM public.auth_drive_registration_requests r
       WHERE n.registration_id = p_registration_id
         AND r.id = n.registration_id
         AND r.status = 'EMAIL_VERIFIED'
         AND n.status = 'PENDING' AND n.attempt_count = 0
       RETURNING n.registration_id, n.claim_token
    )
    SELECT c.registration_id, c.claim_token, r.email_normalized,
           coalesce(r.display_name,''), coalesce(r.organization_name,''),
           r.email_verified_at
      FROM claimed c
      JOIN public.auth_drive_registration_requests r ON r.id=c.registration_id;
END; $$;

CREATE OR REPLACE FUNCTION public.auth_complete_drive_registration_operator_notice(
 p_registration_id uuid, p_claim_token uuid, p_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_updated integer;
BEGIN
  IF p_status NOT IN ('SENT','AMBIGUOUS') THEN
    RAISE EXCEPTION 'AUTH_OPERATOR_NOTICE_FINISH_INVALID' USING ERRCODE='22023';
  END IF;
  UPDATE public.auth_drive_registration_operator_notices n
     SET status=p_status,
         sent_at=CASE WHEN p_status='SENT' THEN now() ELSE NULL END,
         updated_at=now()
   WHERE n.registration_id=p_registration_id AND n.claim_token=p_claim_token
     AND n.status='PROCESSING' AND n.attempt_count=1;
  GET DIAGNOSTICS v_updated=ROW_COUNT;
  RETURN v_updated=1;
END; $$;

REVOKE ALL ON public.auth_drive_registration_operator_notices FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_queue_drive_registration_operator_notice() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_claim_drive_registration_operator_notice(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_complete_drive_registration_operator_notice(uuid,uuid,text) FROM PUBLIC;

DO $$
DECLARE app_role text;
BEGIN
  IF current_user !~ '^dimpro_auth_migrator_(dev|prod)$' THEN
    RAISE EXCEPTION 'AUTH operator notices migration requires an environment migrator role, current_user=%',current_user;
  END IF;
  app_role := regexp_replace(current_user, '_migrator_', '_app_');
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=app_role) THEN
    RAISE EXCEPTION 'AUTH operator notice runtime role does not exist: %',app_role;
  END IF;
  EXECUTE format('GRANT SELECT ON TABLE public.auth_drive_registration_operator_notices TO %I',app_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.auth_claim_drive_registration_operator_notice(uuid) TO %I',app_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.auth_complete_drive_registration_operator_notice(uuid,uuid,text) TO %I',app_role);
END; $$;

COMMENT ON TABLE public.auth_drive_registration_operator_notices IS
'Operator notice ledger: one claim per verified application, no automatic retry after SMTP uncertainty. Independent from Drive grants, login status and subscription.';
COMMIT;
