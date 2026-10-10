-- DIMPRO Drive V0.9.34 - atomic decision-change projection into existing event journal.
-- The existing drive_workspace_upsert_metadata_atomic RPC remains authoritative.
-- SOURCE ONLY: requires approved migration, PROD DENY.
BEGIN;
DO $guard$
BEGIN
  IF to_regclass('public.drive_core_document_metadata') IS NULL
     OR to_regclass('public.drive_core_change_events') IS NULL THEN
    RAISE EXCEPTION 'DRIVE_REVIEW_EVENT_REQUIRED_SCHEMA_MISSING' USING ERRCODE='55000';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.drive_emit_review_decision_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE
  v_previous jsonb := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE COALESCE(OLD.extra,'{}'::jsonb) END;
  v_current jsonb := COALESCE(NEW.extra,'{}'::jsonb);
  v_changed text[] := ARRAY[]::text[];
  v_key text;
BEGIN
  FOREACH v_key IN ARRAY ARRAY[
    'reviewChecked', 'reviewResult', 'workflowStatus',
    'customerApproval', 'projectManagerApproval',
    'investorProjectManagerApproval', 'lifecycleStatus'
  ] LOOP
    IF (v_previous -> v_key) IS DISTINCT FROM (v_current -> v_key) THEN
      v_changed := array_append(v_changed, v_key);
    END IF;
  END LOOP;
  IF array_length(v_changed,1) IS NOT NULL THEN
    INSERT INTO public.drive_core_change_events(
      id,project_id,event_type,entity_type,entity_id,payload,actor_user_id
    ) VALUES (
      'drive-change-' || substr(replace(gen_random_uuid()::text,'-',''),1,16),
      NEW.project_id,'DOCUMENT_REVIEW_DECISION_CHANGED','document',NEW.document_id,
      jsonb_build_object('documentId',NEW.document_id,'changedFields',to_jsonb(v_changed)),
      NEW.updated_by
    );
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.drive_emit_review_decision_change() FROM PUBLIC;
DROP TRIGGER IF EXISTS drive_emit_review_decision_event ON public.drive_core_document_metadata;
CREATE TRIGGER drive_emit_review_decision_event
AFTER INSERT OR UPDATE OF extra ON public.drive_core_document_metadata
FOR EACH ROW EXECUTE FUNCTION public.drive_emit_review_decision_change();
COMMIT;
