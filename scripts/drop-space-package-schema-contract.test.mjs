import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const bootstrapPath = "supabase/DIMPRO_DROP_032_SPACE_PACKAGES_BOOTSTRAP.sql";
const migrationPath = "supabase/migrations/20260801215500_drop_space_package_creation.sql";
const [bootstrap, migration] = await Promise.all([
  readFile(bootstrapPath, "utf8"),
  readFile(migrationPath, "utf8"),
]);
assert.equal(bootstrap, migration, "A bootstrap és a migráció tartalma eltér.");
assert.match(bootstrap, /^-- DIMPRO Drop space-aware atomic package creation/m);
assert.match(bootstrap, /\nbegin;\n/);
assert.match(bootstrap, /\ncommit;\s*$/);
assert.match(bootstrap, /create or replace function public\.drop_create_package_atomic\([\s\S]*p_event_payload jsonb default '\{\}'::jsonb[\s\S]*\)/);
assert.match(bootstrap, /v_space public\.drop_spaces%rowtype/);
assert.match(bootstrap, /v_membership public\.drop_space_memberships%rowtype/);
assert.match(bootstrap, /DROP_SPACE_CONTEXT_INCOMPLETE/);
assert.match(bootstrap, /DROP_SPACE_PACKAGE_CREATE_FORBIDDEN/);
assert.match(bootstrap, /DROP_SPACE_GUEST_PACKAGE_CREATE_DISABLED/);
assert.match(bootstrap, /DROP_SPACE_PACKAGE_EXCEEDS_ACCESS_END/);
assert.match(bootstrap, /DROP_SPACE_PACKAGE_LIMIT_REACHED/);
assert.match(bootstrap, /DROP_SPACE_PROJECT_NOT_LINKED/);
assert.match(bootstrap, /DROP_SPACE_SELECTED_MEMBER_NOT_ACTIVE/);
assert.match(bootstrap, /space_id,\s*created_by_membership_id,\s*visibility/);
assert.match(bootstrap, /insert into public\.drop_package_members/);
assert.match(bootstrap, /on conflict \(package_id, membership_id\) do update/);
assert.match(bootstrap, /membership\.role in \('owner', 'space_admin', 'contributor', 'uploader'\)/);
assert.match(bootstrap, /'spaceId', v_space_id/);
assert.match(bootstrap, /'selectedMemberCount', v_valid_member_count/);
assert.match(bootstrap, /'DROP 0\.3\.2'/);
assert.match(bootstrap, /'drop-032-space-package-creation-20260801'/);
assert.match(bootstrap, /'legacyPackageCompatibility', true/);
assert.match(bootstrap, /'fileUploadEnabled', false/);
assert.doesNotMatch(bootstrap, /p_package->>'pin'/);
assert.match(bootstrap, /DROP_RAW_CREDENTIAL_REJECTED/);

const signatureCount = (bootstrap.match(/drop_create_package_atomic\(jsonb, jsonb, jsonb, jsonb, jsonb\)/g) || []).length;
assert.ok(signatureCount >= 5, "A legacy ötparaméteres RPC jogosultsági szerződése hiányos.");
const hash = createHash("sha256").update(bootstrap).digest("hex");
assert.equal(hash, "df482acc96c6cd3a711f55da16d223ece43b275f9c07926d9c1d99472e2363ac");

console.log(JSON.stringify({
  ok: true,
  version: "DROP 0.3.2-staged",
  bootstrapPath,
  migrationPath,
  sha256: hash,
  legacyRpcSignaturePreserved: true,
  atomicSpaceContextValidation: true,
  selectedMemberSharing: true,
  rawCredentialsRejected: true,
  fileUploadEnabled: false,
  sqlAppliedByThisScript: false,
  databaseWritesPerformed: false,
}, null, 2));
