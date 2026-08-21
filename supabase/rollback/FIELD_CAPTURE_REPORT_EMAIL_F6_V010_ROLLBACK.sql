begin;
delete from public.field_capture_schema_meta where component = 'field-capture-report-email';
drop table if exists public.field_capture_report_email_deliveries;
commit;
