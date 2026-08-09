-- DIMPRO DROP 1.2.4 – Gyors KépSend letöltőoldali címzettláthatóság
-- Additív, visszafelé kompatibilis migráció.

begin;

alter table public.drop_public_package_workflows
  add column if not exists show_recipients_on_download boolean not null default true;

comment on column public.drop_public_package_workflows.show_recipients_on_download is
  'Ha true, a biztonságos letöltőoldal megmutatja a küldemény címzettjeit. Alapértelmezés: bekapcsolva.';

commit;
