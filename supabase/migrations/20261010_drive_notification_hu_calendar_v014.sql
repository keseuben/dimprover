-- DIMPRO Drive v0.9.34 controlled HU workday calendar, SOURCE ONLY.
-- This migration defines schema; it does NOT guess or insert working days.
-- A DBA must load official, reviewed, complete calendar records through a separate process.
BEGIN;
CREATE TABLE IF NOT EXISTS public.drive_notification_hu_calendar (
  calendar_date date PRIMARY KEY,
  is_working_day boolean NOT NULL,
  source_reference text NOT NULL CHECK (length(btrim(source_reference)) BETWEEN 12 AND 500),
  approved_by text NOT NULL CHECK (length(btrim(approved_by)) BETWEEN 3 AND 160),
  approved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drive_hu_calendar_year_check CHECK (
    calendar_date >= date '2020-01-01' AND calendar_date < date '2100-01-01'
  )
);
CREATE INDEX IF NOT EXISTS drive_hu_calendar_approved_idx
  ON public.drive_notification_hu_calendar (approved_at DESC);
ALTER TABLE public.drive_notification_hu_calendar ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drive_notification_hu_calendar FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.drive_notification_hu_calendar TO service_role;
-- No mutation grant: allow calendar updates only through DBA-managed migration authority.
COMMENT ON TABLE public.drive_notification_hu_calendar IS
  'Authoritative, human-approved Hungary working-day records; must cover every day of a month. No automatic inference.';
COMMIT;
