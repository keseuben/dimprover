import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const bootstrapPath = "supabase/DIMPRO_DROP_033_PRIVATE_STORAGE_BOOTSTRAP.sql";
const migrationPath = "supabase/migrations/20260801231500_drop_private_storage.sql";
const [bootstrap, migration] = await Promise.all([
  readFile(bootstrapPath, "utf8"),
  readFile(migrationPath, "utf8"),
]);

assert.equal(bootstrap, migration, "A bootstrap és migration SQL tartalma eltér.");
assert.match(bootstrap, /^-- DIMPRO Drop private storage/m);
assert.match(bootstrap, /begin;/);
assert.match(bootstrap, /commit;/);
assert.match(bootstrap, /add column if not exists uploaded_by_membership_id/);
assert.match(bootstrap, /add column if not exists security_status/);
assert.match(bootstrap, /add column if not exists reservation_released/);
assert.match(bootstrap, /create or replace function public\.drop_initialize_upload_atomic/);
assert.match(bootstrap, /create or replace function public\.drop_mark_upload_received/);
assert.match(bootstrap, /create or replace function public\.drop_finalize_quarantine_upload/);
assert.match(bootstrap, /create or replace function public\.drop_abort_upload_atomic/);
assert.match(bootstrap, /for update;/);
assert.match(bootstrap, /DROP_PACKAGE_STORAGE_LIMIT_REACHED/);
assert.match(bootstrap, /DROP_SPACE_STORAGE_LIMIT_REACHED/);
assert.match(bootstrap, /DROP_PACKAGE_UPLOAD_FORBIDDEN/);
assert.match(bootstrap, /current_file_count = current_file_count \+ 1/);
assert.match(bootstrap, /current_storage_bytes = current_storage_bytes \+ v_size/);
assert.match(bootstrap, /reservation_released = reservation_released or v_released/);
assert.match(bootstrap, /virus_scan_status = 'scanner_required'/);
assert.match(bootstrap, /security_status = 'scanner_required'/);
assert.match(bootstrap, /'drop-storage'/);
assert.match(bootstrap, /'DROP 0\.3\.3'/);
assert.match(bootstrap, /'drop-033-private-storage-quarantine-20260801'/);
assert.match(bootstrap, /'publicDownloadEnabled', false/);
assert.doesNotMatch(bootstrap, /raw[_ ]?token/i, "A storage migráció nem tárolhat nyers tokent.");

const sha256 = createHash("sha256").update(bootstrap).digest("hex");
assert.equal(sha256, "253ceb07d7620ca84a909ccc1882b9841f38d061743bf2f7e60ba92793d17d9d");

console.log(JSON.stringify({
  ok: true,
  version: "DROP 0.3.3-staged",
  bootstrapPath,
  migrationPath,
  sha256,
  lineCount: bootstrap.split("\n").length,
  atomicQuotaReservation: true,
  streamingUploadPrepared: true,
  quarantineRequired: true,
  publicDownloadEnabled: false,
  sqlAppliedByThisScript: false,
  databaseWritesPerformed: false,
}, null, 2));
