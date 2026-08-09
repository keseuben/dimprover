-- DIMPRO Identity Core 0.1.0 database acceptance suite
-- Run after all three V010 migrations in a Supabase SQL Editor or a staging PostgreSQL database.
-- The suite is transactional and leaves no test data behind.

begin;

create temporary table dimpro_identity_test_results (
  test_no integer primary key,
  test_name text not null,
  passed boolean not null,
  detail text not null default ''
) on commit drop;

create or replace function pg_temp.assert_true(
  p_test_no integer,
  p_test_name text,
  p_condition boolean,
  p_detail text default ''
)
returns void
language plpgsql
as $$
begin
  if coalesce(p_condition, false) is not true then
    raise exception 'TEST % FAILED: % — %', p_test_no, p_test_name, p_detail;
  end if;
  insert into dimpro_identity_test_results (test_no, test_name, passed, detail)
  values (p_test_no, p_test_name, true, coalesce(p_detail, ''));
end;
$$;

do $$
declare
  v_user public.dimpro_users;
  v_second_user public.dimpro_users;
  v_org public.dimpro_organizations;
  v_license public.dimpro_licenses;
  v_project public.dimpro_projects;
  v_other_project public.dimpro_projects;
  v_entitlement public.dimpro_send_entitlements;
  v_expired_entitlement public.dimpro_send_entitlements;
  v_recipient public.dimpro_send_recipients;
  v_foreign_recipient public.dimpro_send_recipients;
  v_locked_without_recipient public.dimpro_send_entitlements;
  v_result jsonb;
  v_projects jsonb;
  v_invalid_hash text := repeat('f', 64);
  v_valid_hash text := repeat('a', 64);
  v_expired_hash text := repeat('b', 64);
  v_duplicate_failed boolean := false;
  v_owner_constraint_failed boolean := false;
  v_cross_recipient_failed boolean := false;
  v_lock_count integer;
  v_audit_success_count integer;
  v_audit_failure_count integer;
  v_loop integer;
begin
  -- 1. User creation and automatic public code.
  v_user := public.dimpro_create_user(
    'Identity Core Test User',
    'identity-core-v010-user@example.invalid',
    null,
    '+36000000000',
    null
  );
  update public.dimpro_users
  set status = 'active', email_verified_at = now()
  where id = v_user.id
  returning * into v_user;
  perform pg_temp.assert_true(
    1,
    'Új felhasználó automatikus USR-kódot kap',
    v_user.public_user_code ~ '^USR-[0-9]{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$',
    v_user.public_user_code
  );

  -- 2. Organization creation and automatic public code.
  v_org := public.dimpro_create_organization(
    'Identity Core Test Organization Kft.',
    'Identity Core Test Org',
    '00000000-0-00',
    'TEST-REG-001',
    'org@example.invalid',
    null
  );
  perform pg_temp.assert_true(
    2,
    'Új szervezet automatikus ORG-kódot kap',
    v_org.public_organization_code ~ '^ORG-[0-9]{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$',
    v_org.public_organization_code
  );

  insert into public.dimpro_organization_memberships (
    user_id, organization_id, role_code, role_label, status, is_primary
  ) values (
    v_user.id, v_org.id, 'organization_admin', 'Szervezeti admin', 'active', true
  );

  -- 3. License creation and automatic public code.
  v_license := public.dimpro_create_license(
    'organization',
    null,
    v_org.id,
    'DIMPRO',
    'TEST',
    'active',
    now() - interval '1 hour',
    now() + interval '30 days',
    3
  );
  perform pg_temp.assert_true(
    3,
    'Új licenc automatikus LIC-kódot kap',
    v_license.public_license_code ~ '^LIC-[0-9]{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$',
    v_license.public_license_code
  );

  -- 4. Project creation and automatic public code.
  v_project := public.dimpro_create_project(
    'Identity Core Engedélyezett Tesztprojekt',
    'IC Engedélyezett',
    v_org.id,
    v_user.id,
    'Tranzakciós elfogadási teszt'
  );
  update public.dimpro_projects
  set status = 'active', project_drop_enabled = true
  where id = v_project.id
  returning * into v_project;
  perform pg_temp.assert_true(
    4,
    'Új projekt automatikus PRJ-kódot kap',
    v_project.public_project_code ~ '^PRJ-[0-9]{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{3}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{3}$',
    v_project.public_project_code
  );

  -- 5. Public code uniqueness is enforced.
  begin
    insert into public.dimpro_users (
      public_user_code, full_name, email, email_normalized, status
    ) values (
      v_user.public_user_code,
      'Duplicate Test',
      'identity-core-duplicate@example.invalid',
      'identity-core-duplicate@example.invalid',
      'active'
    );
  exception when unique_violation then
    v_duplicate_failed := true;
  end;
  perform pg_temp.assert_true(
    5,
    'Nyilvános kódütközést unique constraint megakadályoz',
    v_duplicate_failed,
    'A duplikált USR-kód beszúrásának meg kell hiúsulnia.'
  );

  -- 6. Exactly one license owner is required.
  begin
    insert into public.dimpro_licenses (
      public_license_code, owner_type, owner_user_id, owner_organization_id,
      product_code, status, max_devices
    ) values (
      public.dimpro_generate_license_code(), 'organization', v_user.id, v_org.id,
      'DIMPRO', 'active', 1
    );
  exception when check_violation then
    v_owner_constraint_failed := true;
  end;
  perform pg_temp.assert_true(
    6,
    'Licencnél pontosan egy tulajdonos kötelező',
    v_owner_constraint_failed,
    'Egyidejű user és organization tulajdonos nem engedélyezett.'
  );

  insert into public.dimpro_license_modules (license_id, module_code, enabled)
  values
    (v_license.id, 'DROP_SEND', true),
    (v_license.id, 'DROP_QUICK_IMAGE_SEND', true),
    (v_license.id, 'DROP_PROJECT_INBOX', true),
    (v_license.id, 'DROP_PACKAGE', true)
  on conflict (license_id, module_code) do update set enabled = excluded.enabled;

  insert into public.dimpro_project_memberships (
    project_id, user_id, organization_id, role_code,
    can_view, can_upload_to_drop, can_download, can_manage_inbox,
    status, valid_from
  ) values (
    v_project.id, v_user.id, v_org.id, 'project_manager',
    true, true, true, true, 'active', now() - interval '1 hour'
  );

  insert into public.dimpro_project_drop_settings (
    project_id, enabled, incoming_folder_name, preserve_groups,
    require_virus_scan, notify_project_admins
  ) values (
    v_project.id, true, 'Beérkező Drop', true, true, true
  )
  on conflict (project_id) do update set enabled = true;

  insert into public.dimpro_send_entitlements (
    user_id, license_id, organization_id, code_hash, code_hint,
    status, valid_from, expires_at,
    can_use_standard_send, can_use_quick_image_send,
    can_use_image_groups, can_use_file_comments, can_use_project_drop,
    recipient_mode, max_recipients, max_package_size_bytes, monthly_send_limit
  ) values (
    v_user.id, v_license.id, v_org.id, v_valid_hash, '***-456',
    'active', now() - interval '1 hour', now() + interval '30 days',
    true, true, true, true, true,
    'locked_default', 3, 262144000, 100
  ) returning * into v_entitlement;

  insert into public.dimpro_send_recipients (
    entitlement_id, recipient_name, recipient_email,
    recipient_email_normalized, organization_name,
    label, is_default, is_locked, active
  ) values (
    v_entitlement.id, 'Teszt Címzett', 'recipient@example.invalid',
    'recipient@example.invalid', 'Teszt Címzett Kft.',
    'Alapértelmezett', true, true, true
  ) returning * into v_recipient;

  update public.dimpro_send_entitlements
  set default_recipient_id = v_recipient.id
  where id = v_entitlement.id;

  -- 7. Valid Send entitlement returns the contract.
  v_result := public.dimpro_verify_send_entitlement(v_valid_hash, repeat('1', 64), 'DIMPRO acceptance test');
  perform pg_temp.assert_true(
    7,
    'Érvényes Send-jogosultság megfelelő adatokat ad vissza',
    v_result->>'ok' = 'true'
      and v_result->'user'->>'publicCode' = v_user.public_user_code
      and v_result->'entitlement'->>'id' = v_entitlement.id::text
      and v_result->'entitlement'->>'recipientMode' = 'locked_default',
    v_result::text
  );

  -- 8. Expired entitlement is rejected generically.
  insert into public.dimpro_send_entitlements (
    user_id, license_id, organization_id, code_hash, code_hint,
    status, valid_from, expires_at,
    can_use_standard_send, recipient_mode
  ) values (
    v_user.id, v_license.id, v_org.id, v_expired_hash, '***-999',
    'active', now() - interval '10 days', now() - interval '1 day',
    true, 'approved_list'
  ) returning * into v_expired_entitlement;
  v_result := public.dimpro_verify_send_entitlement(v_expired_hash, repeat('2', 64), 'DIMPRO acceptance test');
  perform pg_temp.assert_true(
    8,
    'Lejárt Send-jogosultság elutasításra kerül',
    v_result->>'ok' = 'false'
      and v_result->>'error' = 'A küldési jogosultságkód nem használható.',
    v_result::text
  );

  -- Create another user and project that must not be visible.
  v_second_user := public.dimpro_create_user(
    'Identity Core Other User',
    'identity-core-v010-other@example.invalid',
    null,
    null,
    null
  );
  update public.dimpro_users
  set status = 'active', email_verified_at = now()
  where id = v_second_user.id;

  v_other_project := public.dimpro_create_project(
    'Identity Core Másik Felhasználó Projektje',
    'IC Másik',
    v_org.id,
    v_second_user.id,
    'Nem jelenhet meg az első felhasználónál.'
  );
  update public.dimpro_projects
  set status = 'active', project_drop_enabled = true
  where id = v_other_project.id
  returning * into v_other_project;
  insert into public.dimpro_project_memberships (
    project_id, user_id, organization_id, role_code,
    can_view, can_upload_to_drop, can_download, can_manage_inbox,
    status, valid_from
  ) values (
    v_other_project.id, v_second_user.id, v_org.id, 'project_manager',
    true, true, true, true, 'active', now() - interval '1 hour'
  );
  insert into public.dimpro_project_drop_settings (project_id, enabled)
  values (v_other_project.id, true)
  on conflict (project_id) do update set enabled = true;

  -- 9. Other user's project is not returned.
  select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
  into v_projects
  from public.dimpro_allowed_projects_for_entitlement(v_entitlement.id) p;
  perform pg_temp.assert_true(
    9,
    'Másik felhasználó projektje nem jelenik meg',
    not exists (
      select 1
      from jsonb_array_elements(v_projects) item
      where item->>'id' = v_other_project.id::text
    ),
    v_projects::text
  );

  -- 10. Authorized project is returned.
  perform pg_temp.assert_true(
    10,
    'Engedélyezett projekt megjelenik a projektlistában',
    exists (
      select 1
      from jsonb_array_elements(v_projects) item
      where item->>'id' = v_project.id::text
        and item->>'public_code' = v_project.public_project_code
        and item->>'can_upload_to_drop' = 'true'
    ),
    v_projects::text
  );

  -- 11. Unauthorized but existing project code gives the same generic error.
  v_result := public.dimpro_verify_project_code(
    v_entitlement.id,
    v_other_project.public_project_code,
    repeat('3', 64),
    'DIMPRO acceptance test'
  );
  perform pg_temp.assert_true(
    11,
    'Nem engedélyezett projektkód általános hibát ad',
    v_result = jsonb_build_object('ok', false, 'error', 'A projektkód nem használható.'),
    v_result::text
  );

  -- 12. Valid project code returns destination contract.
  v_result := public.dimpro_verify_project_code(
    v_entitlement.id,
    v_project.public_project_code,
    repeat('4', 64),
    'DIMPRO acceptance test'
  );
  perform pg_temp.assert_true(
    12,
    'Engedélyezett projektkód visszaadja a Beérkező Drop célt',
    v_result->>'ok' = 'true'
      and v_result->'project'->>'publicCode' = v_project.public_project_code
      and v_result->'destination'->>'type' = 'project_drop_inbox'
      and v_result->'destination'->>'label' = 'Beérkező Drop',
    v_result::text
  );

  -- 13. Turning off project Drop hides the project.
  update public.dimpro_project_drop_settings set enabled = false where project_id = v_project.id;
  select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
  into v_projects
  from public.dimpro_allowed_projects_for_entitlement(v_entitlement.id) p;
  perform pg_temp.assert_true(
    13,
    'Projekt Drop kikapcsolásakor a projekt nem választható',
    jsonb_array_length(v_projects) = 0,
    v_projects::text
  );
  update public.dimpro_project_drop_settings set enabled = true where project_id = v_project.id;

  -- 14. Sensitive Send hash is not readable by client roles.
  perform pg_temp.assert_true(
    14,
    'Hash vagy nyers jogosultságkód nem olvasható kliensoldalról',
    not has_table_privilege('anon', 'public.dimpro_send_entitlements', 'SELECT')
      and not has_table_privilege('authenticated', 'public.dimpro_send_entitlements', 'SELECT'),
    'anon/authenticated SELECT privilege must be absent'
  );

  -- 15. RLS is enabled on all canonical security tables.
  perform pg_temp.assert_true(
    15,
    'RLS aktív a központi érzékeny táblákon',
    not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = any(array[
          'dimpro_users',
          'dimpro_organizations',
          'dimpro_organization_memberships',
          'dimpro_licenses',
          'dimpro_license_modules',
          'dimpro_projects',
          'dimpro_project_memberships',
          'dimpro_project_drop_settings',
          'dimpro_send_entitlements',
          'dimpro_send_recipients',
          'dimpro_access_audit_logs',
          'dimpro_access_rate_limits'
        ])
        and not c.relrowsecurity
    ),
    'Minden felsorolt táblán relrowsecurity=true szükséges.'
  );

  -- 16. Successful and failed attempts both create audit events.
  select count(*) into v_audit_success_count
  from public.dimpro_access_audit_logs
  where entitlement_id = v_entitlement.id and success;
  select count(*) into v_audit_failure_count
  from public.dimpro_access_audit_logs
  where event_type in ('send_code_failed','project_code_failed') and not success;
  perform pg_temp.assert_true(
    16,
    'Auditnapló sikeres és sikertelen próbálkozásnál is létrejön',
    v_audit_success_count >= 2 and v_audit_failure_count >= 1,
    format('success=%s failure=%s', v_audit_success_count, v_audit_failure_count)
  );

  -- 17. Five invalid attempts lock the subject for 15 minutes.
  for v_loop in 1..5 loop
    v_result := public.dimpro_verify_send_entitlement(
      v_invalid_hash,
      repeat('5', 64),
      'DIMPRO acceptance test'
    );
  end loop;
  select count(*) into v_lock_count
  from public.dimpro_access_rate_limits
  where scope = 'send_code' and locked_until > now();
  perform pg_temp.assert_true(
    17,
    'Öt hibás Send-próba után 15 perces ideiglenes zárolás jön létre',
    v_lock_count >= 1,
    format('active locks=%s', v_lock_count)
  );

  -- 18. Send completion increments monthly usage.
  v_result := public.dimpro_record_send_completed(
    v_entitlement.id,
    v_project.id,
    1024,
    1,
    jsonb_build_object('acceptanceTest', true)
  );
  perform pg_temp.assert_true(
    18,
    'Sikeres Send lezárás növeli a havi felhasználást',
    v_result->>'ok' = 'true'
      and (v_result->>'currentMonthSendCount')::integer = 1,
    v_result::text
  );

  -- 19. Schema marker identifies the complete three-migration V010 package.
  perform pg_temp.assert_true(
    19,
    'A sémajelölő a teljes V010 magot azonosítja',
    exists (
      select 1
      from public.dimpro_identity_schema_meta
      where component = 'dimpro-identity-core'
        and schema_version = '0.1.0'
        and migration_count >= 3
        and bootstrap_id = 'dimpro-identity-core-security-hardening-v010-20260807'
    ),
    'A schema meta marker hiányzik vagy elavult.'
  );

  -- 20. Existing modules can be bridged without parallel identity records.
  perform pg_temp.assert_true(
    20,
    'A meglévő account és Project Core táblákhoz egyedi hídkapcsolat készült',
    (to_regclass('public.dimpro_account_users') is null or exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'dimpro_account_users' and column_name = 'dimpro_user_id'
    ))
    and
    (to_regclass('public.project_core_projects') is null or exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'project_core_projects' and column_name = 'dimpro_project_id'
    )),
    'A kompatibilitási hídkapcsolat hiányzik.'
  );


  -- 21. Internal security-definer helpers are not client-callable RPCs.
  perform pg_temp.assert_true(
    21,
    'Belső Identity Core RPC-k nem hívhatók anon/authenticated szerepkörből',
    not has_function_privilege('anon', 'public.dimpro_record_access_failure(text,text,integer,integer,integer)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.dimpro_record_access_failure(text,text,integer,integer,integer)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.dimpro_entitlement_is_active(uuid,timestamp with time zone)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.dimpro_entitlement_is_active(uuid,timestamp with time zone)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.dimpro_current_user_id()', 'EXECUTE'),
    'A belső helper függvények privilege-hardeningje hibás.'
  );

  -- 22. A default recipient from another entitlement cannot be attached.
  insert into public.dimpro_send_recipients (
    entitlement_id, recipient_name, recipient_email, recipient_email_normalized,
    is_default, is_locked, active
  ) values (
    v_expired_entitlement.id, 'Másik entitlement címzett',
    'foreign-recipient@example.invalid', 'foreign-recipient@example.invalid',
    true, false, true
  ) returning * into v_foreign_recipient;
  begin
    update public.dimpro_send_entitlements
    set default_recipient_id = v_foreign_recipient.id
    where id = v_entitlement.id;
  exception when foreign_key_violation then
    v_cross_recipient_failed := true;
  end;
  perform pg_temp.assert_true(
    22,
    'Alapértelmezett címzett csak a saját entitlementhez tartozhat',
    v_cross_recipient_failed,
    'A kereszt-entitlement default_recipient_id módosításnak FK hibával kell leállnia.'
  );

  -- 23. locked_default mode fails closed if its active default recipient is missing.
  insert into public.dimpro_send_entitlements (
    user_id, license_id, organization_id, code_hash, code_hint,
    status, valid_from, expires_at, can_use_standard_send, recipient_mode
  ) values (
    v_user.id, v_license.id, v_org.id, repeat('c', 64), '***-000',
    'active', now() - interval '1 hour', now() + interval '1 day',
    true, 'locked_default'
  ) returning * into v_locked_without_recipient;
  v_result := public.dimpro_verify_send_entitlement(
    v_locked_without_recipient.code_hash,
    repeat('7', 64),
    'DIMPRO acceptance test'
  );
  perform pg_temp.assert_true(
    23,
    'locked_default címzett nélkül fail-closed módon inaktív',
    v_result->>'ok' = 'false'
      and v_result->>'error' = 'A küldési jogosultságkód nem használható.',
    v_result::text
  );

  -- 24. Rotating invalid candidate codes cannot bypass the per-IP Send rate limit.
  for v_loop in 1..5 loop
    v_result := public.dimpro_verify_send_entitlement(
      encode(extensions.digest('rotating-invalid-' || v_loop::text, 'sha256'), 'hex'),
      repeat('8', 64),
      'DIMPRO acceptance test'
    );
  end loop;
  select count(*) into v_lock_count
  from public.dimpro_access_rate_limits
  where scope = 'send_code' and locked_until > now();
  perform pg_temp.assert_true(
    24,
    'Eltérő hibás kódokkal sem kerülhető meg az IP-alapú Send rate limit',
    v_lock_count >= 2,
    format('active locks after rotating candidates=%s', v_lock_count)
  );
end;
$$;

select test_no, test_name, passed, detail
from dimpro_identity_test_results
order by test_no;

-- The existing Drop regression suite and application build must be executed separately.
rollback;
