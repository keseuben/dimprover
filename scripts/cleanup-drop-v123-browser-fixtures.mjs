import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

function required(name) {
  const value = process.env[name]?.trim();
  assert.ok(value, `${name} hiányzik`);
  return value;
}

const client = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function main() {
  const users = await client.from('dimpro_users').select('id,email').ilike('email', 'drop-v123-browser-%');
  if (users.error) throw users.error;
  const userRows = users.data || [];
  for (const row of userRows) {
    assert.match(row.email || '', /^drop-v123-browser-.*@example\.invalid$/);
  }
  const userIds = userRows.map((row) => row.id);
  if (!userIds.length) {
    console.log(JSON.stringify({ ok: true, deletedUsers: 0, deletedOrganizations: 0, deletedEntitlements: 0, deletedLicenses: 0 }));
    return;
  }

  const membershipResult = await client.from('dimpro_organization_memberships').select('organization_id').in('user_id', userIds);
  if (membershipResult.error) throw membershipResult.error;
  const organizationIds = [...new Set((membershipResult.data || []).map((row) => row.organization_id).filter(Boolean))];

  const entitlementResult = await client.from('dimpro_send_entitlements').select('id,license_id').in('user_id', userIds);
  if (entitlementResult.error) throw entitlementResult.error;
  const entitlementIds = (entitlementResult.data || []).map((row) => row.id);
  const licenseIds = [...new Set((entitlementResult.data || []).map((row) => row.license_id).filter(Boolean))];

  if (entitlementIds.length) {
    for (const [table, column] of [
      ['drop_public_sessions', 'dimpro_send_entitlement_id'],
      ['drop_public_package_workflows', 'dimpro_send_entitlement_id'],
      ['dimpro_send_recipients', 'entitlement_id'],
      ['dimpro_access_audit_logs', 'entitlement_id'],
    ]) {
      const result = await client.from(table).delete().in(column, entitlementIds);
      if (result.error) throw result.error;
    }
    const result = await client.from('dimpro_send_entitlements').delete().in('id', entitlementIds);
    if (result.error) throw result.error;
  }

  if (licenseIds.length) {
    let result = await client.from('dimpro_license_modules').delete().in('license_id', licenseIds);
    if (result.error) throw result.error;
    result = await client.from('dimpro_access_audit_logs').delete().in('license_id', licenseIds);
    if (result.error) throw result.error;
    result = await client.from('dimpro_licenses').delete().in('id', licenseIds);
    if (result.error) throw result.error;
  }

  let result = await client.from('dimpro_access_audit_logs').delete().in('user_id', userIds);
  if (result.error) throw result.error;
  result = await client.from('dimpro_organization_memberships').delete().in('user_id', userIds);
  if (result.error) throw result.error;
  result = await client.from('dimpro_users').delete().in('id', userIds);
  if (result.error) throw result.error;

  if (organizationIds.length) {
    const organizationRows = await client.from('dimpro_organizations').select('id,display_name,legal_name').in('id', organizationIds);
    if (organizationRows.error) throw organizationRows.error;
    const removable = (organizationRows.data || []).filter((row) => {
      const name = `${row.display_name || ''} ${row.legal_name || ''}`;
      return /DIMPRO V123 Browser Org/.test(name);
    }).map((row) => row.id);
    if (removable.length) {
      const deleteOrganizations = await client.from('dimpro_organizations').delete().in('id', removable);
      if (deleteOrganizations.error) throw deleteOrganizations.error;
    }
  }

  console.log(JSON.stringify({
    ok: true,
    deletedUsers: userIds.length,
    deletedOrganizations: organizationIds.length,
    deletedEntitlements: entitlementIds.length,
    deletedLicenses: licenseIds.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
