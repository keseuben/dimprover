import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const migrationPath = "supabase/migrations/20260801195500_drop_spaces_access_model.sql";
const bootstrapPath = "supabase/DIMPRO_DROP_030_SPACES_BOOTSTRAP.sql";
const checksumPath = `${bootstrapPath}.sha256`;

const [migration, bootstrap, checksumFile] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(bootstrapPath, "utf8"),
  readFile(checksumPath, "utf8"),
]);
const expectedChecksum = checksumFile.trim().split(/\s+/)[0];
const actualChecksum = createHash("sha256").update(bootstrap).digest("hex");

assert.equal(bootstrap, migration, "A DROP 0.3.0 bootstrap nem egyezik a jóváhagyott migrációval.");
assert.equal(actualChecksum, expectedChecksum, "A DROP 0.3.0 bootstrap SHA256 ellenőrzése sikertelen.");
assert.match(bootstrap, /^\s*--[\s\S]*?begin;/i);
assert.match(bootstrap, /commit;\s*$/i);

for (const table of [
  "drop_spaces",
  "drop_space_memberships",
  "drop_space_projects",
  "drop_package_members",
]) {
  assert.match(bootstrap, new RegExp(`create table if not exists public\\.${table}\\s*\\(`, "i"), `${table}: hiányzó tábla.`);
  assert.match(bootstrap, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `${table}: hiányzó RLS.`);
}

assert.match(bootstrap, /alter table public\.drop_packages[\s\S]*?space_id uuid/i);
assert.match(bootstrap, /created_by_membership_id uuid/i);
assert.match(bootstrap, /visibility text not null default 'selected_members'/i);
assert.match(bootstrap, /owner_license_id text not null/i);
assert.match(bootstrap, /allow_guest_package_creation boolean not null default true/i);
assert.match(bootstrap, /allow_guest_invites boolean not null default false/i);
assert.match(bootstrap, /guestLicenseRequired', false/i);
assert.match(bootstrap, /legacyPackageCompatibility', true/i);
assert.match(bootstrap, /fileUploadEnabled', false/i);
assert.match(bootstrap, /'drop-spaces'/i);
assert.match(bootstrap, /'DROP 0\.3\.0'/i);
assert.match(bootstrap, /drop-030-spaces-access-model-20260801/i);
assert.doesNotMatch(bootstrap, /drop\s+table/i, "A staged migráció nem törölhet táblát.");
assert.doesNotMatch(bootstrap, /truncate/i, "A staged migráció nem üríthet táblát.");
assert.doesNotMatch(bootstrap, /delete\s+from/i, "A staged migráció nem törölhet adatot.");

console.log(JSON.stringify({
  ok: true,
  version: "DROP 0.3.0-staged",
  migrationPath,
  bootstrapPath,
  sha256: actualChecksum,
  newTables: 4,
  legacyPackageCompatibility: true,
  sqlAppliedByThisScript: false,
  databaseWritesPerformed: false,
}, null, 2));
