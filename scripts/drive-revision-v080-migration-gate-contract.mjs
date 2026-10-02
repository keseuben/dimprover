import assert from "node:assert/strict";
import fs from "node:fs";

const gate = fs.readFileSync("scripts/drive-revision-v080-migration-gate.mjs", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261002_drive_revision_model_v080.sql", "utf8");
let pass = 0;
const check = (label, fn) => { fn(); pass += 1; console.log(`PASS ${String(pass).padStart(2, "0")} ${label}`); };

check("gate pins exact V080 migration", () => assert.match(gate, /20261002_drive_revision_model_v080\.sql/));
check("gate pins exact migration SHA", () => assert.match(gate, /c01770241d36520bee4ecbb7460c892ff180ddd56ab2f8060b1e4c4dade6ea1b/));
check("gate pins canonical DEV Supabase ref", () => assert.match(gate, /pbgyuznivqvestuksvif/));
check("gate blocks matching PROD ref", () => assert.match(gate, /PROD_TARGET_BLOCKED/));
check("gate requires explicit DEV approval phrase", () => assert.match(gate, /DEV_ONLY_DRIVE_REVISION_V080_APPLY_APPROVED/));
check("gate requires migration operation lock", () => assert.match(gate, /OPERATION !== "migration"/));
check("preflight accepts only V070 predecessor or V080 target", () => {
  assert.match(gate, /schemaVersion === "0\.7\.0"/);
  assert.match(gate, /migrationCount\) === 4/);
  assert.match(gate, /drive-core-v070-folder-acl-20261001/);
  assert.match(gate, /schemaVersion === "0\.8\.0"/);
  assert.match(gate, /migrationCount\) === 5/);
  assert.match(gate, /drive-core-v080-revision-model-20261002/);
});
check("gate requires PostgreSQL credentials fail closed", () => assert.match(gate, /DB_CREDENTIAL_REQUIRED/));
check("gate requires psql pg_dump pg_restore", () => {
  for (const tool of ["psql", "pg_dump", "pg_restore"]) assert.match(gate, new RegExp(tool));
});
check("backup includes documents and versions", () => {
  assert.match(gate, /public\.drive_core_documents/);
  assert.match(gate, /public\.drive_core_document_versions/);
});
check("backup includes upload sessions and schema meta", () => {
  assert.match(gate, /public\.drive_core_upload_sessions/);
  assert.match(gate, /public\.drive_core_schema_meta/);
});
check("backup is verified before apply", () => {
  const backup = gate.indexOf('const dump = run("pg_dump"');
  const restore = gate.indexOf('const list = run("pg_restore"');
  const apply = gate.indexOf('const applied = run("psql"');
  assert.ok(backup >= 0 && restore > backup && apply > restore);
});
check("protected row counts are verified after apply", () => {
  assert.match(gate, /ROW_COUNT_CHANGED/);
  for (const key of ["documents","versions","uploadSessions","schemaMeta"]) assert.match(gate, new RegExp(key));
});
check("target integrity requires alias revision kind reason constraints and index", () => {
  for (const key of ["aliasConstraint","revisionConstraint","kindConstraint","reasonConstraint","revisionIndex"]) assert.match(gate, new RegExp(key));
});
check("target integrity rejects invalid revision rows", () => {
  assert.match(gate, /negativeRevisionRows/);
  assert.match(gate, /invalidKindRows/);
});
check("target integrity rejects issuance duplication in Core", () => {
  assert.match(gate, /issueStatusInCore/);
  assert.match(gate, /businessStatusInCore/);
  assert.match(gate, /ISSUANCE_MODEL_DUPLICATED/);
});
check("gate never references production database host", () => assert.doesNotMatch(gate, /dimpro-prod|prod\.supabase/i));
check("migration remains transaction wrapped", () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /commit;\s*$/);
});

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Drive Core 0.8.0 guarded migration gate",
  pass,
  fail: 0,
  productionAccess: "DENY"
}, null, 2));
