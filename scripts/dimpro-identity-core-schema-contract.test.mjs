import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const files = {
  identity: "supabase/migrations/20260806213000_dimpro_identity_license_project_core_v010.sql",
  send: "supabase/migrations/20260806214000_dimpro_send_project_access_v010.sql",
  hardening: "supabase/migrations/20260807083000_dimpro_identity_core_security_hardening_v010.sql",
  rollback: "supabase/rollback/DIMPRO_IDENTITY_CORE_V010_ROLLBACK.sql",
  acceptance: "supabase/tests/DIMPRO_IDENTITY_CORE_V010_ACCEPTANCE.sql",
  security: "app/lib/identity-core/security.ts",
  repository: "app/lib/identity-core/repository.ts",
  health: "app/api/dimpro-identity/health/route.ts",
  sendVerify: "app/api/dimpro-identity/send/verify/route.ts",
  projects: "app/api/dimpro-identity/send/projects/route.ts",
  projectVerify: "app/api/dimpro-identity/projects/verify-code/route.ts",
};

const source = {};
for (const [key, relative] of Object.entries(files)) {
  source[key] = await readFile(path.join(root, relative), "utf8");
}

function includesAll(text, values, label) {
  for (const value of values) {
    assert.ok(text.includes(value), `${label}: hiányzik: ${value}`);
  }
}

const canonicalTables = [
  "dimpro_users",
  "dimpro_organizations",
  "dimpro_organization_memberships",
  "dimpro_licenses",
  "dimpro_license_modules",
  "dimpro_projects",
  "dimpro_project_memberships",
];
for (const table of canonicalTables) {
  assert.match(source.identity, new RegExp(`create table if not exists public\\.${table}\\s*\\(`, "i"), `Hiányzó tábla: ${table}`);
  assert.match(source.identity, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `Hiányzó RLS: ${table}`);
}

const sendTables = [
  "dimpro_project_drop_settings",
  "dimpro_send_entitlements",
  "dimpro_send_recipients",
  "dimpro_access_audit_logs",
  "dimpro_access_rate_limits",
];
for (const table of sendTables) {
  assert.match(source.send, new RegExp(`create table if not exists public\\.${table}\\s*\\(`, "i"), `Hiányzó tábla: ${table}`);
  assert.match(source.send, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `Hiányzó RLS: ${table}`);
}

includesAll(source.identity, [
  "^USR-[0-9]{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$",
  "^ORG-[0-9]{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$",
  "^LIC-[0-9]{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$",
  "^PRJ-[0-9]{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{3}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{3}$",
  "23456789ABCDEFGHJKMNPQRSTUVWXYZ",
], "Nyilvános kódformátum");

includesAll(source.identity, [
  "dimpro_account_users add column if not exists dimpro_user_id",
  "dimpro_companies add column if not exists dimpro_organization_id",
  "dimpro_memberships add column if not exists dimpro_organization_membership_id",
  "dimpro_subscriptions add column if not exists dimpro_license_id",
  "dimpro_product_access add column if not exists dimpro_license_module_id",
  "project_core_projects add column if not exists dimpro_project_id",
  "project_core_memberships add column if not exists dimpro_project_membership_id",
], "Legacy bridge");

includesAll(source.send, [
  "dimpro_verify_send_entitlement",
  "dimpro_allowed_projects_for_entitlement",
  "dimpro_project_drop_access_allowed",
  "dimpro_verify_project_code",
  "dimpro_record_send_completed",
  "A projektkód nem használható.",
  "dimpro_record_access_failure('project_code', v_subject_hash, 5, 15, 15)",
  "dimpro_record_access_failure('send_code', v_subject_hash, 5, 15, 15)",
], "Send/project RPC");

assert.match(source.send, /code_hash text not null/i, "A Send hash mező hiányzik.");
assert.doesNotMatch(source.send, /\braw_code\b\s+text/i, "Nyers Send-kód oszlop nem hozható létre.");
assert.doesNotMatch(source.send, /grant\s+select\s+on\s+public\.dimpro_send_entitlements\s+to\s+(anon|authenticated)/i, "Érzékeny Send tábla kliensnek grantolva.");
assert.match(source.send, /grant execute on function public\.dimpro_verify_send_entitlement\(text,text,text\) to service_role/i, "Send RPC nem service_role-only.");

includesAll(source.hardening, [
  "dimpro_send_recipients_id_entitlement_unique",
  "foreign key (default_recipient_id, id)",
  "rateLimitCandidateRotationSafe",
  "lockedDefaultRecipientFailClosed",
  "internalRpcPrivilegesHardened",
  "revoke all on function public.dimpro_record_access_failure",
], "Identity Core hardening");
assert.match(source.hardening, /when 'send_code' then 'ip'/i, "A Send rate limit továbbra is candidate-kódhoz kötött.");
assert.match(source.hardening, /when 'project_code' then coalesce\(nullif\(split_part/i, "A projektkód rate limit nem entitlement+IP alapú.");

includesAll(source.security, [
  "DIMPRO_SEND_CODE_PEPPER",
  "DIMPRO_ACCESS_HASH_PEPPER",
  "DIMPRO_SEND_SESSION_SECRET",
  "createHmac(\"sha256\"",
  "timingSafeEqual",
  "dss1.",
], "Szerveroldali biztonság");
assert.doesNotMatch(source.security, /console\.(log|error|warn)\s*\(/, "A security modul nem naplózhat kódot vagy tokent.");

includesAll(source.repository, [
  ".rpc(\"dimpro_verify_send_entitlement\"",
  ".rpc(\"dimpro_verify_project_code\"",
  "dimpro_allowed_projects_for_entitlement",
  "hashDimproSendCode",
  "hashDimproRequestIp",
], "Repository szerződés");

for (const key of ["health", "sendVerify", "projects", "projectVerify"]) {
  assert.match(source[key], /force-dynamic/, `${files[key]} nem dinamikus.`);
}
assert.match(source.sendVerify, /createDimproSendSession/, "A Send ellenőrzés nem ad rövid munkamenetet.");
assert.match(source.projects, /verifyDimproSendSession/, "A projektlista nincs Send-munkamenethez kötve.");
assert.match(source.projectVerify, /verifyDimproSendSession/, "A projektkód-ellenőrzés nincs Send-munkamenethez kötve.");

for (const table of [...canonicalTables, ...sendTables, "dimpro_identity_schema_meta"]) {
  assert.match(source.rollback, new RegExp(`drop table if exists public\\.${table}`, "i"), `Rollbackból hiányzik: ${table}`);
}
assert.match(source.rollback, /Existing legacy DIMPRO account, Project Core and Drop records are preserved/i, "A rollback nem dokumentálja a legacy adatok megőrzését.");

const acceptanceTests = [...source.acceptance.matchAll(/perform pg_temp\.assert_true\(\s*(\d+),/g)].map((match) => Number(match[1]));
assert.ok(acceptanceTests.length >= 15, `Legalább 15 SQL elfogadási teszt kell, jelenleg: ${acceptanceTests.length}`);
assert.equal(new Set(acceptanceTests).size, acceptanceTests.length, "Az SQL tesztsorszámok nem egyediek.");
assert.ok(acceptanceTests.includes(20), "A kompatibilitási hídteszt hiányzik.");
assert.ok(acceptanceTests.includes(24), "A security hardening elfogadási tesztjei hiányoznak.");

console.log(JSON.stringify({
  ok: true,
  contract: "DIMPRO Identity Core V010",
  canonicalTables: canonicalTables.length,
  sendTables: sendTables.length,
  apiRoutes: 4,
  acceptanceTests: acceptanceTests.length,
  checkedFiles: Object.values(files),
}, null, 2));
