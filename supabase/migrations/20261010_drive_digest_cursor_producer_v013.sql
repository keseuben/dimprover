-- DIMPRO Drive: atomic journal cursor handoff to the digest outbox.
-- SOURCE ONLY, dependent on v010 notification preferences, v011 delivery gate, v012 consent.
-- Entire feature remains disabled pending separate DBA approval and controlled DEV release.
BEGIN;
DO $requirements$
BEGIN
  IF to_regclass('public.drive_core_notification_preferences') IS NULL
     OR to_regclass('public.drive_core_digest_deliveries') IS NULL
     OR to_regclass('public.drive_core_change_events') IS NULL THEN
    RAISE EXCEPTION 'DRIVE_DIGEST_CURSOR_DEPENDENCIES_NOT_READY' USING ERRCODE='55000';
  END IF;
END $requirements$;

CREATE OR REPLACE FUNCTION public.drive_digest_register_journal_page(
  p_project_id text, p_user_id text, p_category text,
  p_frequency text, p_slot text, p_cursor_from bigint, p_cursor_to bigint,
  p_event_ids text[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $fn$
DECLARE
  v_preference public.drive_core_notification_preferences;
  v_id uuid;
  v_count bigint;
  v_existing boolean;
  v_length integer := coalesce(array_length(p_event_ids,1),0);
BEGIN
  IF p_project_id IS NULL OR btrim(p_project_id)=''
    OR p_user_id IS NULL OR btrim(p_user_id)=''
    OR p_category NOT IN ('DOCUMENT_CHANGES','APPROVAL_DECISIONS')
    OR p_frequency NOT IN ('FOUR_HOURLY','EIGHT_HOURLY','DAILY','WEEKLY','MONTHLY')
    OR p_slot IS NULL OR length(p_slot) NOT BETWEEN 15 AND 90
    OR p_cursor_from IS NULL OR p_cursor_to IS NULL
    OR p_cursor_from<0 OR p_cursor_to<=p_cursor_from
    OR p_event_ids IS NULL OR v_length>250 THEN
    RAISE EXCEPTION 'DRIVE_DIGEST_INVALID_JOURNAL_PAGE' USING ERRCODE='22023';
  END IF;

  -- Serializes a recipient/category even when several producer workers scan concurrently.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('drive-digest:'||p_project_id||':'||p_user_id||':'||p_category,0)
  );

  SELECT * INTO v_preference FROM public.drive_core_notification_preferences
    WHERE project_id=p_project_id AND user_id=p_user_id AND category=p_category FOR UPDATE;
  IF NOT FOUND OR NOT v_preference.enabled
    OR v_preference.digest_frequency<>p_frequency
    OR v_preference.digest_frequency='NONE' THEN
    RETURN jsonb_build_object('status','CONSENT_REVOKED');
  END IF;
  IF v_preference.last_success_sequence<>p_cursor_from THEN
    RETURN jsonb_build_object('status','CURSOR_CHANGED',
      'currentCursor',v_preference.last_success_sequence);
  END IF;

  -- Block on unfinished, exhausted or SMTP-ambiguous batches: never silently skip.
  SELECT EXISTS(
    SELECT 1 FROM public.drive_core_digest_deliveries
    WHERE project_id=p_project_id AND user_id=p_user_id AND category=p_category
      AND status IN ('PENDING','PROCESSING','FAILED','AMBIGUOUS')
  ) INTO v_existing;
  IF v_existing THEN RETURN jsonb_build_object('status','OUTSTANDING_DELIVERY'); END IF;

  -- Verify the claimed processed range exists and fits one bounded journal page.
  -- Never let a stale/buggy producer skip unseen events by inventing cursor_to.
  SELECT count(*) INTO v_count
  FROM public.drive_core_change_events
  WHERE project_id=p_project_id AND sequence>p_cursor_from AND sequence<=p_cursor_to;
  IF v_count NOT BETWEEN 1 AND 250 OR NOT EXISTS (
    SELECT 1 FROM public.drive_core_change_events
    WHERE project_id=p_project_id AND sequence=p_cursor_to
  ) THEN
    RAISE EXCEPTION 'DRIVE_DIGEST_CURSOR_RANGE_NOT_VERIFIED' USING ERRCODE='22023';
  END IF;

  IF v_length=0 THEN
    -- No eligible event: cursor-only checkpoint, no mail and no outbox row.
    UPDATE public.drive_core_notification_preferences SET
      last_success_sequence=p_cursor_to,updated_at=now()
    WHERE project_id=p_project_id AND user_id=p_user_id AND category=p_category
      AND last_success_sequence=p_cursor_from;
    RETURN jsonb_build_object('status','ADVANCED','cursorTo',p_cursor_to);
  END IF;

  IF EXISTS(
    SELECT 1 FROM unnest(p_event_ids) AS t(id)
    WHERE t.id IS NULL OR length(t.id) NOT BETWEEN 1 AND 160
  ) THEN
    RAISE EXCEPTION 'DRIVE_DIGEST_EVENT_ID_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT count(DISTINCT id) INTO v_count
    FROM public.drive_core_change_events
    WHERE project_id=p_project_id AND sequence>p_cursor_from AND sequence<=p_cursor_to
      AND id=ANY(p_event_ids);
  IF v_count<>v_length THEN
    RAISE EXCEPTION 'DRIVE_DIGEST_SELECTED_EVENTS_MISSING_OR_DUPLICATE' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.drive_core_digest_deliveries(
    project_id,user_id,category,digest_frequency,scheduled_slot,
    status,event_ids,cursor_from,cursor_to
  ) VALUES(
    p_project_id,p_user_id,p_category,p_frequency,p_slot,
    'PENDING',to_jsonb(p_event_ids),p_cursor_from,p_cursor_to
  )
  ON CONFLICT(project_id,user_id,category,scheduled_slot,cursor_from) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('status','SLOT_ALREADY_RESERVED');
  END IF;
  RETURN jsonb_build_object('status','RESERVED','deliveryId',v_id,
    'cursorFrom',p_cursor_from,'cursorTo',p_cursor_to);
END;
$fn$;

-- SUPPRESSED is a terminal authorized no-send result. Advance checkpoint
-- only after the guarded claim verifies worker ownership; keep failed/ambiguous blocked.
CREATE OR REPLACE FUNCTION public.drive_digest_finish_without_acceptance(
  p_delivery_id uuid, p_worker_token uuid, p_outcome text, p_error_code text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $fn$
DECLARE
  v_row public.drive_core_digest_deliveries;
BEGIN
  IF p_outcome NOT IN ('FAILED','AMBIGUOUS','SUPPRESSED') THEN
    RAISE EXCEPTION 'DRIVE_DIGEST_INVALID_FINISH_STATUS' USING ERRCODE='22023';
  END IF;
  UPDATE public.drive_core_digest_deliveries SET
    status=p_outcome,last_error_code=left(coalesce(p_error_code,''),160),
    completed_at=now(),worker_token=NULL
  WHERE id=p_delivery_id AND status='PROCESSING' AND worker_token=p_worker_token
  RETURNING * INTO v_row;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_outcome='SUPPRESSED' THEN
    UPDATE public.drive_core_notification_preferences
      SET last_success_sequence=greatest(last_success_sequence,v_row.cursor_to),
        updated_at=now()
    WHERE project_id=v_row.project_id AND user_id=v_row.user_id
      AND category=v_row.category;
  END IF;
  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.drive_digest_register_journal_page(text,text,text,text,text,bigint,bigint,text[])
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.drive_digest_register_journal_page(text,text,text,text,text,bigint,bigint,text[])
  TO service_role;
REVOKE ALL ON FUNCTION public.drive_digest_finish_without_acceptance(uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.drive_digest_finish_without_acceptance(uuid,uuid,text,text)
  TO service_role;
COMMIT;
