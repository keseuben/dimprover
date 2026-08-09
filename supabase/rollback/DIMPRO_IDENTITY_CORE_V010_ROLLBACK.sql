-- DIMPRO Identity Core 0.1.0 rollback
-- WARNING: this removes all data created in the new canonical dimpro_* tables.
-- Run only after verifying a current backup and only when reverting migrations
-- 20260806213000 and 20260806214000 as one unit.
-- Existing legacy DIMPRO account, Project Core and Drop records are preserved.

begin;

-- Remove compatibility bridges first; legacy source tables and their original columns remain untouched.
alter table if exists public.drop_public_send_codes
  drop constraint if exists drop_public_send_codes_canonical_entitlement_fk;
drop index if exists public.drop_public_send_codes_canonical_entitlement_unique;
alter table if exists public.drop_public_send_codes
  drop column if exists dimpro_send_entitlement_id;

alter table if exists public.drop_space_projects
  drop constraint if exists drop_space_projects_canonical_project_fk;
drop index if exists public.drop_space_projects_canonical_project_idx;
alter table if exists public.drop_space_projects
  drop column if exists dimpro_project_id;

alter table if exists public.project_core_memberships
  drop constraint if exists project_core_memberships_canonical_fk;
drop index if exists public.project_core_memberships_canonical_unique;
alter table if exists public.project_core_memberships
  drop column if exists dimpro_project_membership_id;

alter table if exists public.project_core_projects
  drop constraint if exists project_core_projects_canonical_project_fk;
drop index if exists public.project_core_projects_canonical_project_unique;
alter table if exists public.project_core_projects
  drop column if exists dimpro_project_id;

alter table if exists public.dimpro_product_access
  drop constraint if exists dimpro_product_access_canonical_module_fk;
drop index if exists public.dimpro_product_access_canonical_module_unique;
alter table if exists public.dimpro_product_access
  drop column if exists dimpro_license_module_id;

alter table if exists public.dimpro_subscriptions
  drop constraint if exists dimpro_subscriptions_canonical_license_fk;
drop index if exists public.dimpro_subscriptions_canonical_license_unique;
alter table if exists public.dimpro_subscriptions
  drop column if exists dimpro_license_id;

alter table if exists public.dimpro_memberships
  drop constraint if exists dimpro_memberships_canonical_fk;
drop index if exists public.dimpro_memberships_canonical_unique;
alter table if exists public.dimpro_memberships
  drop column if exists dimpro_organization_membership_id;

alter table if exists public.dimpro_companies
  drop constraint if exists dimpro_companies_dimpro_org_fk;
drop index if exists public.dimpro_companies_dimpro_org_unique;
alter table if exists public.dimpro_companies
  drop column if exists dimpro_organization_id;

alter table if exists public.dimpro_account_users
  drop constraint if exists dimpro_account_users_dimpro_user_fk;
drop index if exists public.dimpro_account_users_dimpro_user_unique;
alter table if exists public.dimpro_account_users
  drop column if exists dimpro_user_id;

-- Drop API/RPC and trigger functions before their composite table types are removed.
drop function if exists public.dimpro_record_send_completed(uuid,uuid,bigint,integer,jsonb);
drop function if exists public.dimpro_verify_project_code(uuid,text,text,text);
drop function if exists public.dimpro_verify_send_entitlement(text,text,text);
drop function if exists public.dimpro_project_drop_access_allowed(uuid,uuid);
drop function if exists public.dimpro_allowed_projects_for_entitlement(uuid);
drop function if exists public.dimpro_entitlement_is_active(uuid,timestamptz);
drop function if exists public.dimpro_clear_access_failures(text,text);
drop function if exists public.dimpro_record_access_failure(text,text,integer,integer,integer);
drop function if exists public.dimpro_is_access_locked(text,text);
drop function if exists public.dimpro_rate_limit_subject_hash(text,text,text);
drop function if exists public.dimpro_license_module_enabled(uuid,text,timestamptz);
drop function if exists public.dimpro_prepare_send_recipient_row();

drop function if exists public.dimpro_create_project(text,text,uuid,uuid,text);
drop function if exists public.dimpro_create_license(text,uuid,uuid,text,text,text,timestamptz,timestamptz,integer);
drop function if exists public.dimpro_create_organization(text,text,text,text,text,text);
drop function if exists public.dimpro_create_user(text,text,uuid,text,uuid);
drop function if exists public.dimpro_has_project_permission(uuid,text);
drop function if exists public.dimpro_is_organization_member(uuid);
drop function if exists public.dimpro_current_user_id();

-- New canonical tables only.
drop table if exists public.dimpro_access_rate_limits;
drop table if exists public.dimpro_access_audit_logs;
alter table if exists public.dimpro_send_entitlements
  drop constraint if exists dimpro_send_entitlements_default_recipient_fk;
drop table if exists public.dimpro_send_recipients;
drop table if exists public.dimpro_send_entitlements;
drop table if exists public.dimpro_project_drop_settings;
drop table if exists public.dimpro_project_memberships;
drop table if exists public.dimpro_projects;
drop table if exists public.dimpro_license_modules;
drop table if exists public.dimpro_licenses;
drop table if exists public.dimpro_organization_memberships;
drop table if exists public.dimpro_organizations;
drop table if exists public.dimpro_users;
drop table if exists public.dimpro_identity_schema_meta;

-- Remaining helper functions.
drop function if exists public.dimpro_prepare_project_row();
drop function if exists public.dimpro_prepare_license_row();
drop function if exists public.dimpro_prepare_organization_row();
drop function if exists public.dimpro_prepare_user_row();
drop function if exists public.dimpro_set_updated_at();
drop function if exists public.dimpro_generate_project_code();
drop function if exists public.dimpro_generate_license_code();
drop function if exists public.dimpro_generate_organization_code();
drop function if exists public.dimpro_generate_user_code();
drop function if exists public.dimpro_build_public_code(text,integer,integer);
drop function if exists public.dimpro_random_token(integer);
drop function if exists public.dimpro_normalize_email(text);

commit;
