import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const bootstrapPath = "supabase/DIMPRO_DROP_034_RESUMABLE_MULTIPART_BOOTSTRAP.sql";
const migrationPath = "supabase/migrations/20260802010000_drop_resumable_multipart.sql";
const [bootstrap, migration] = await Promise.all([
  readFile(bootstrapPath, "utf8"),
  readFile(migrationPath, "utf8"),
]);
assert.equal(bootstrap, migration);
assert.match(bootstrap, /^-- DIMPRO Drop resumable multipart upload workflow/m);
assert.match(bootstrap, /^begin;$/m);
assert.match(bootstrap, /^commit;$/m);
assert.match(bootstrap, /alter column max_file_size_bytes set default 524288000/);
assert.match(bootstrap, /create or replace function public\.drop_initialize_upload_atomic/);
assert.match(bootstrap, /chunk_size_bytes/);
assert.match(bootstrap, /storage_multipart_id/);
assert.match(bootstrap, /for v_part_number in 1\.\.v_total_parts loop/);
assert.match(bootstrap, /create or replace function public\.drop_mark_upload_part_received/);
assert.match(bootstrap, /create or replace function public\.drop_finalize_multipart_received/);
assert.match(bootstrap, /DROP_UPLOAD_PART_CONFLICT/);
assert.match(bootstrap, /DROP_UPLOAD_PARTS_INCOMPLETE/);
assert.match(bootstrap, /'DROP 0\.3\.4'/);
assert.match(bootstrap, /'drop-034-resumable-multipart-20260802'/);
assert.match(bootstrap, /'resumableMultipartUpload', true/);
assert.match(bootstrap, /'defaultChunkSizeBytes', 67108864/);
assert.match(bootstrap, /'maxFileSizeBytes', 524288000/);
assert.match(bootstrap, /'hetznerS3Prepared', true/);
assert.doesNotMatch(bootstrap, /secret_access_key|DROP_STORAGE_SECRET_ACCESS_KEY/i);
const sha256 = createHash("sha256").update(bootstrap).digest("hex");
console.log(JSON.stringify({
  ok: true,
  version: "DROP 0.3.4-staged",
  bootstrapPath,
  migrationPath,
  lineCount: bootstrap.split(/\r?\n/).length - 1,
  bytes: Buffer.byteLength(bootstrap),
  sha256,
  maxFileBytes: 524_288_000,
  defaultChunkBytes: 67_108_864,
  maxParts: 10_000,
  resumableMultipart: true,
  hetznerS3Prepared: true,
  sqlAppliedByThisScript: false,
  databaseWritesPerformed: false,
}, null, 2));
