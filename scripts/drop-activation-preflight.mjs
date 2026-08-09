#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const bootstrapPath = "supabase/DIMPRO_DROP_020_SUPABASE_BOOTSTRAP.sql";
const checksumPath = `${bootstrapPath}.sha256`;
const migrationPaths = [
  "supabase/migrations/20260731143500_drop_core.sql",
  "supabase/migrations/20260801003000_drop_access_engine.sql",
  "supabase/migrations/20260801090000_drop_admin_lifecycle.sql",
  "supabase/migrations/20260801100000_drop_token_transactions.sql",
  "supabase/migrations/20260801110000_drop_atomic_package_creation.sql",
  "supabase/migrations/20260801120000_drop_schema_version.sql",
];

const bootstrap = await readFile(bootstrapPath, "utf8");
const checksumFile = await readFile(checksumPath, "utf8");
const expectedChecksum = checksumFile.trim().split(/\s+/)[0];
const actualChecksum = createHash("sha256").update(bootstrap).digest("hex");
assert.equal(actualChecksum, expectedChecksum, "A bootstrap SHA256 értéke eltér a kísérő checksum fájltól.");

let cursor = 0;
for (const migrationPath of migrationPaths) {
  const migration = await readFile(migrationPath, "utf8");
  const position = bootstrap.indexOf(migration, cursor);
  assert.ok(position >= cursor, `${migrationPath} hiányzik vagy hibás sorrendben szerepel a bootstrapban.`);
  cursor = position + migration.length;
}

assert.match(bootstrap, /^\s*begin;/i);
assert.match(bootstrap, /commit;\s*$/i);
assert.match(bootstrap, /'DROP 0\.2\.0'/);
assert.match(bootstrap, /migration_count[\s\S]*?6/);
assert.match(bootstrap, /drop_create_package_atomic/);
assert.match(bootstrap, /drop_transition_package_status/);
assert.match(bootstrap, /drop_mark_access_token_used/);
assert.match(bootstrap, /drop_reissue_access_token/);
assert.match(bootstrap, /drop_revoke_access_token/);
assert.doesNotMatch(bootstrap, /create\s+policy/i);
assert.doesNotMatch(bootstrap, /^\s*raw_tokens?\s+/im);

const releaseGateEnabled = process.env.DROP_RELEASE_GATE_ENABLED?.trim().toLowerCase() === "true";
const expectedReleaseGateEnabled = process.env.DROP_PREFLIGHT_EXPECT_RELEASE_GATE?.trim().toLowerCase() === "true";
const uploadFlags = [
  "DROP_IMAGE_DROP_ENABLED",
  "DROP_FILE_DROP_ENABLED",
  "DROP_ZIP_UPLOAD_ENABLED",
  "DROP_MIXED_PACKAGE_ENABLED",
].filter((name) => process.env[name]?.trim().toLowerCase() === "true");

assert.equal(
  releaseGateEnabled,
  expectedReleaseGateEnabled,
  expectedReleaseGateEnabled
    ? "Private-pilot ellenőrzésnél a DROP_RELEASE_GATE_ENABLED értékének true-nak kell lennie."
    : "Az SQL aktiválása előtt a DROP_RELEASE_GATE_ENABLED nem lehet true.",
);
assert.deepEqual(uploadFlags, [], "Egyetlen feltöltési feature flag sem lehet aktív a Storage motor kiadásáig.");

console.log(JSON.stringify({
  ok: true,
  version: "DROP 0.2.0",
  bootstrapPath,
  sha256: actualChecksum,
  migrationCount: migrationPaths.length,
  releaseGateEnabled,
  expectedReleaseGateEnabled,
  uploadFlagsEnabled: uploadFlags,
  sqlAppliedByThisScript: false,
  databaseWritesPerformed: false,
}, null, 2));
