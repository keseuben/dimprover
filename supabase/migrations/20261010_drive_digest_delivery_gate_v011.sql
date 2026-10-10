-- DIMPRO Drive notification delivery gate 0.1.1, source only, no email transport is activated.
-- Depends on 20261010_drive_notification_preferences_v010.sql.
-- SERIAL claim, no automatic recovery of SMTP-ambiguous sends. PROD DENY.
BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.drive_core_digest_deliveries') IS NULL
     OR to_regclass('public.drive_core_notification_preferences') IS NULL THEN
    RAISE EXCEPTION 'DRIVE_DIGEST_DELIVERY_V011_PREDECESSOR_REQUIRED' USING ERRCODE='55000';
  END IF;
END
$guard$;

ALTER TABLE public.drive_core_digest_deliveries
  DROP CONSTRAINT IF EXISTS drive_core_digest_deliveries_status_check;
ALTER TABLE public.drive_core_digest_deliveries
  ADD CONSTRAINT drive_core_digest_deliveries_status_check
  CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED','AMBIGUOUS','SUPPRESSED'));
ALTER TABLE public.drive_core_digest_deliveries
  ADD COLUMN IF NOT EXISTS digest_frequency text NOT NULL DEFAULT 'DAILY'
    CHECK (digest_frequency IN ('FOUR_HOURLY','EIGHT_HOURLY','DAILY','WEEKLY','MONTHLY','NONE')),
  ADD COLUMN IF NOT EXISTS worker_token uuid NULL,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS recipient_email_sha256 text NULL,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;

-- Queue registration is insert-only (slot uniqueness). Calling application may not UPDATE a SENT row.
-- This RPC provides atomic single-claim, separate per-recipient/category serialization and bounded retries.
CREATE OR REPLACE FUNCTION public.drive_digest_claim_delivery(
  p_delivery_id uuid, p_worker_token uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $fn$
DECLARE
  v_delivery public.drive_core_digest_deliveries;
BEGIN
  IF p_delivery_id IS NULL OR p_worker_token IS NULL THEN
    RAISE EXCEPTION 'DRIVE_DIGEST_INVALID_CLAIM' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_delivery FROM public.drive_core_digest_deliveries
  WHERE id=p_delivery_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('drive-digest:'||v_delivery.project_id||':'||v_delivery.user_id||':'||v_delivery.category,0)
  );

  IF v_delivery.status NOT IN ('PENDING','FAILED') OR v_delivery.attempt_count>=3 THEN
    RETURN NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.drive_core_digest_deliveries other
    WHERE other.project_id=v_delivery.project_id AND other.user_id=v_delivery.user_id
      AND other.category=v_delivery.category AND other.id<>v_delivery.id
      AND (other.status IN ('PROCESSING','AMBIGUOUS')
        OR (other.status IN ('PENDING','FAILED') AND other.cursor_from<v_delivery.cursor_from))
  ) THEN
    RETURN NULL;
  END IF;

  UPDATE public.drive_core_digest_deliveries SET
    status='PROCESSING',worker_token=p_worker_token,claimed_at=now(),
    verified_at=NULL,attempt_count=attempt_count+1,last_error_code=NULL
  WHERE id=v_delivery.id
  RETURNING * INTO v_delivery;

  RETURN jsonb_build_object('id',v_delivery.id,'projectId',v_delivery.project_id,
    'userId',v_delivery.user_id,'category',v_delivery.category,
    'eventIds',v_delivery.event_ids,'digestFrequency',v_delivery.digest_frequency,
    'cursorFrom',v_delivery.cursor_from,
    'cursorTo',v_delivery.cursor_to,'attemptCount',v_delivery.attempt_count);
END;
$fn$;

-- The calling worker MUST complete ACL and recipient verification immediately before send,
-- and submit only a verified/send-accepted transport message id.
CREATE OR REPLACE FUNCTION public.drive_digest_ack_smtp_acceptance(
  p_delivery_id uuid, p_worker_token uuid, p_message_id text, p_recipient_email_sha256 text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $fn$
DECLARE
  v_delivery public.drive_core_digest_deliveries;
BEGIN
  IF length(btrim(coalesce(p_message_id,''))) NOT BETWEEN 3 AND 400
     OR coalesce(p_recipient_email_sha256,'') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'DRIVE_DIGEST_INVALID_ACCEPTANCE' USING ERRCODE='22023';
  END IF;
  UPDATE public.drive_core_digest_deliveries SET
    status='SENT',message_id=left(p_message_id,400),recipient_email_sha256=p_recipient_email_sha256,
    verified_at=now(),sent_at=now(),completed_at=now(),worker_token=NULL
  WHERE id=p_delivery_id AND status='PROCESSING' AND worker_token=p_worker_token
  RETURNING * INTO v_delivery;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.drive_core_notification_preferences SET
    last_success_sequence=greatest(last_success_sequence,v_delivery.cursor_to),
    updated_at=now()
  WHERE project_id=v_delivery.project_id AND user_id=v_delivery.user_id
    AND category=v_delivery.category;
  RETURN true;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.drive_digest_finish_without_acceptance(
  p_delivery_id uuid, p_worker_token uuid, p_outcome text, p_error_code text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $fn$
BEGIN
  -- FAILED is only for a proven pre-SMTP failure.
  -- AMBIGUOUS means SMTP may have accepted the message and MUST NOT be auto retried.
  -- SUPPRESSED means rights, consent, or original events were revoked.
  IF p_outcome NOT IN ('FAILED','AMBIGUOUS','SUPPRESSED') THEN
    RAISE EXCEPTION 'DRIVE_DIGEST_INVALID_FINISH_STATUS' USING ERRCODE='22023';
  END IF;
  UPDATE public.drive_core_digest_deliveries SET
    status=p_outcome,last_error_code=left(coalesce(p_error_code,''),160),
    completed_at=now(),worker_token=NULL
  WHERE id=p_delivery_id AND status='PROCESSING' AND worker_token=p_worker_token;
  RETURN FOUND;
END;
$fn$;

REVOKE ALL ON FUNCTION public.drive_digest_claim_delivery(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.drive_digest_ack_smtp_acceptance(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.drive_digest_finish_without_acceptance(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.drive_digest_claim_delivery(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.drive_digest_ack_smtp_acceptance(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.drive_digest_finish_without_acceptance(uuid,uuid,text,text) TO service_role;
COMMIT;
