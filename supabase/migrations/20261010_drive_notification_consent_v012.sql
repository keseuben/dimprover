-- DIMPRO Drive notification consent v0.1.2, source only.
-- Newly opted-in recipients begin at the current journal high-water mark:
-- no automatic historical mail floods on initial enable / re-enable.
BEGIN;
DO $guard$
BEGIN
  IF to_regclass('public.drive_core_notification_preferences') IS NULL
     OR to_regclass('public.drive_core_change_events') IS NULL THEN
    RAISE EXCEPTION 'DRIVE_NOTIFY_CONSENT_PREDECESSOR_REQUIRED' USING ERRCODE='55000';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.drive_set_digest_preference(
  p_project_id text,
  p_user_id text,
  p_category text,
  p_enabled boolean,
  p_digest_frequency text,
  p_followed_only boolean
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $fn$
DECLARE
  v_current_max bigint;
BEGIN
  IF p_project_id IS NULL OR btrim(p_project_id)=''
     OR p_user_id IS NULL OR btrim(p_user_id)=''
     OR p_category NOT IN ('DOCUMENT_CHANGES','APPROVAL_DECISIONS')
     OR p_digest_frequency NOT IN ('FOUR_HOURLY','EIGHT_HOURLY','DAILY','WEEKLY','MONTHLY','NONE')
     OR p_enabled IS NULL OR p_followed_only IS NULL THEN
    RAISE EXCEPTION 'DRIVE_DIGEST_PREFERENCE_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(max(sequence),0) INTO v_current_max
  FROM public.drive_core_change_events WHERE project_id=p_project_id;

  INSERT INTO public.drive_core_notification_preferences(
    project_id,user_id,category,enabled,digest_frequency,followed_only,last_success_sequence
  ) VALUES (
    p_project_id,p_user_id,p_category,p_enabled,p_digest_frequency,p_followed_only,v_current_max
  )
  ON CONFLICT(project_id,user_id,category) DO UPDATE SET
    enabled=excluded.enabled,
    digest_frequency=excluded.digest_frequency,
    followed_only=excluded.followed_only,
    last_success_sequence=CASE
      WHEN public.drive_core_notification_preferences.enabled=false AND excluded.enabled=true
      THEN greatest(public.drive_core_notification_preferences.last_success_sequence,v_current_max)
      ELSE public.drive_core_notification_preferences.last_success_sequence
    END,
    updated_at=now();
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION public.drive_set_digest_preference(text,text,text,boolean,text,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.drive_set_digest_preference(text,text,text,boolean,text,boolean)
  TO service_role;
COMMIT;
