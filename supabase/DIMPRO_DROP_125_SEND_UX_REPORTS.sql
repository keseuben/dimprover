-- DIMPRO DROP 1.2.5 – Send UX, címjegyzék, szabályelfogadás és csoport-export
-- Additív, visszafelé kompatibilis migráció.

begin;

alter table public.dimpro_send_entitlements
  add column if not exists max_saved_contacts integer not null default 10,
  add column if not exists upload_rules_acceptance_count integer not null default 0,
  add column if not exists upload_rules_version text null,
  add column if not exists upload_rules_last_accepted_at timestamptz null;

alter table public.dimpro_send_entitlements
  drop constraint if exists dimpro_send_entitlements_max_saved_contacts_check;
alter table public.dimpro_send_entitlements
  add constraint dimpro_send_entitlements_max_saved_contacts_check
  check (max_saved_contacts between 0 and 100);

alter table public.dimpro_send_entitlements
  drop constraint if exists dimpro_send_entitlements_rules_acceptance_count_check;
alter table public.dimpro_send_entitlements
  add constraint dimpro_send_entitlements_rules_acceptance_count_check
  check (upload_rules_acceptance_count between 0 and 3);

alter table public.drop_public_package_workflows
  add column if not exists export_groups_as_folders boolean not null default false,
  add column if not exists append_group_name_to_filename boolean not null default true;

comment on column public.dimpro_send_entitlements.max_saved_contacts is
  'A felhasználó saját Send-címjegyzékében aktívan tárolható címzettek maximális száma.';
comment on column public.dimpro_send_entitlements.upload_rules_acceptance_count is
  'Az aktuális feltöltési szabályverzióhoz rögzített kötelező elfogadások száma, legfeljebb 3.';
comment on column public.dimpro_send_entitlements.upload_rules_version is
  'A legutóbb elfogadott DIMPRO Drop feltöltési szabályverzió.';
comment on column public.drop_public_package_workflows.export_groups_as_folders is
  'Ha true, a ZIP/Drive export a logikai képcsoportokat fizikai mappákként is létrehozhatja.';
comment on column public.drop_public_package_workflows.append_group_name_to_filename is
  'Ha true, a rendezett fotónév csoportszintű megnevezése a fájlnévben is megjelenik.';

commit;
