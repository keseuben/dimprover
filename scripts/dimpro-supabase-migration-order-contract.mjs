import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const orderPath = path.join(root, 'supabase/DIMPRO_MIGRATION_ORDER_V1.txt');
const migrationDir = path.join(root, 'supabase/migrations');

const order = (await readFile(orderPath, 'utf8'))
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const actual = (await readdir(migrationDir))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => `supabase/migrations/${name}`)
  .sort();

assert.equal(new Set(order).size, order.length, 'A migrációs sorrendlistában duplikált fájl van.');
assert.deepEqual([...order].sort(), actual, 'A sorrendlista és a migrations könyvtár SQL-készlete eltér.');

const pos = new Map(order.map((file, index) => [file, index]));
function before(a, b) {
  assert.ok(pos.has(a), `Hiányzik a sorrendből: ${a}`);
  assert.ok(pos.has(b), `Hiányzik a sorrendből: ${b}`);
  assert.ok(pos.get(a) < pos.get(b), `Hibás migrációs függőség: ${a} megelőzi ${b} fájlt.`);
}

before('supabase/migrations/20260802010000_drop_resumable_multipart.sql', 'supabase/migrations/20260802_drop_private_s3_storage_v040.sql');
before('supabase/migrations/20260802_drop_private_s3_storage_v040.sql', 'supabase/migrations/20260803_drop_malware_retention_download_v050.sql');
before('supabase/migrations/20260802_project_core_v020.sql', 'supabase/migrations/20260802_project_calendar_core_v050.sql');
before('supabase/migrations/20260802_project_core_v020.sql', 'supabase/migrations/20260802_drive_core_v030.sql');
before('supabase/migrations/20260802_drive_core_v030.sql', 'supabase/migrations/20260802_drive_object_storage_v040.sql');
before('supabase/migrations/20260802_drive_object_storage_v040.sql', 'supabase/migrations/20260802_drive_quarantine_review_v041.sql');
for (const dependent of [
  'supabase/migrations/20260802_dialog_core_v060.sql',
  'supabase/migrations/20260802_decide_core_v070.sql',
  'supabase/migrations/20260802_diary_core_v080.sql',
]) {
  before('supabase/migrations/20260802_project_calendar_core_v050.sql', dependent);
}
before('supabase/migrations/20260805_drop_public_workflow_store_v095.sql', 'supabase/migrations/20260807110000_drop_identity_core_consumer_bridge_v110.sql');
before('supabase/migrations/20260806213000_dimpro_identity_license_project_core_v010.sql', 'supabase/migrations/20260806214000_dimpro_send_project_access_v010.sql');
before('supabase/migrations/20260806214000_dimpro_send_project_access_v010.sql', 'supabase/migrations/20260807083000_dimpro_identity_core_security_hardening_v010.sql');
before('supabase/migrations/20260807083000_dimpro_identity_core_security_hardening_v010.sql', 'supabase/migrations/20260807110000_drop_identity_core_consumer_bridge_v110.sql');
before('supabase/migrations/20260807110000_drop_identity_core_consumer_bridge_v110.sql', 'supabase/migrations/20260807111500_dimpro_identity_send_admin_bridge_v110.sql');
before('supabase/migrations/20260807111500_dimpro_identity_send_admin_bridge_v110.sql', 'supabase/migrations/20260810063500_dimpro_org_license_seats_invites_v020.sql');
before('supabase/migrations/20260809214500_service_role_backend_grants_v010.sql', 'supabase/migrations/20260810063500_dimpro_org_license_seats_invites_v020.sql');
before('supabase/migrations/20260810063500_dimpro_org_license_seats_invites_v020.sql', 'supabase/migrations/20260815133000_drive_compare_findings_v200.sql');
assert.equal(order.at(-1), 'supabase/migrations/20260815133000_drive_compare_findings_v200.sql', 'A Drive Compare Findings V2 migrációnak a jelenlegi sorrendlista végén kell lennie.');

console.log(JSON.stringify({
  ok: true,
  contract: 'DIMPRO Supabase migration order V1',
  migrationCount: order.length,
  dependencyChecks: 16,
  first: order[0],
  last: order.at(-1),
}, null, 2));
