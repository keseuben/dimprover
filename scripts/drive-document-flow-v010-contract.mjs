import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(root, "supabase/migrations/20260925_drive_document_flow_v010.sql");
const bootstrapPath = path.join(root, "supabase/DIMPRO_PROJEKTKAPU_DRIVE_DOCUMENT_FLOW_V010_MIGRATION.sql");
const hashPath = bootstrapPath + ".sha256";
const migration = fs.readFileSync(migrationPath, "utf8");
const bootstrap = fs.readFileSync(bootstrapPath, "utf8");
const expectedHash = fs.readFileSync(hashPath, "utf8").trim();

const checks = [];
const check = (name, fn) => {
  try { fn(); checks.push({ name, pass: true }); }
  catch (error) { checks.push({ name, pass: false, error: error instanceof Error ? error.message : String(error) }); }
};

check("transaction wrapper", () => {
  assert.match(migration.trimStart(), /^begin;/i);
  assert.match(migration.trimEnd(), /commit;$/i);
});
check("bootstrap equals migration", () => assert.equal(bootstrap, migration));
check("sha256 matches", () => assert.equal(createHash("sha256").update(bootstrap).digest("hex"), expectedHash));
check("storage version id columns", () => {
  assert.match(migration, /drive_core_document_versions[\s\S]*storage_version_id text null/i);
  assert.match(migration, /drive_core_upload_sessions[\s\S]*storage_version_id text null/i);
});
check("governance table", () => assert.match(migration, /create table if not exists public\.drive_core_document_governance/i));
check("formal issue table", () => assert.match(migration, /create table if not exists public\.drive_core_document_issues/i));
check("recipient table", () => assert.match(migration, /create table if not exists public\.drive_core_document_issue_recipients/i));
check("business lifecycle", () => assert.match(migration, /'BEJOVO','ELLENORZES_ALATT','ERVENYES','KIADOTT','ARCHIV'/));
check("review decisions", () => assert.match(migration, /'PENDING','APPROVED','REJECTED'/));
check("review modes", () => assert.match(migration, /'DRIVE_SIMPLE','DECIDE'/));
check("issue states", () => assert.match(migration, /'NOT_ISSUED','ISSUED','WITHDRAWN','SUPERSEDED'/));
check("incoming requires quarantine", () => assert.match(migration, /DRIVE_DOCUMENT_FLOW_INCOMING_NOT_QUARANTINED/));
check("approval requires AVAILABLE", () => assert.match(migration, /DRIVE_DOCUMENT_FLOW_APPROVE_REQUIRES_AVAILABLE/));
check("approval maps to ERVENYES", () => assert.match(migration, /business_status=case when v_action='APPROVE' then 'ERVENYES'/));
check("formal issue requires approved valid available", () => {
  assert.match(migration, /v_version\.status <> 'AVAILABLE'/);
  assert.match(migration, /v_governance\.review_decision <> 'APPROVED'/);
  assert.match(migration, /v_governance\.business_status <> 'ERVENYES'/);
});
check("formal issue requires recipient", () => assert.match(migration, /DRIVE_DOCUMENT_FLOW_RECIPIENT_REQUIRED/));
check("formal issue sets KIADOTT", () => assert.match(migration, /set business_status='KIADOTT',issue_status='ISSUED'/));
check("direct access revoked", () => assert.match(migration, /revoke all on table public\.drive_core_document_governance from public,anon,authenticated/i));
check("service role grants", () => assert.match(migration, /grant execute on function public\.drive_core_issue_document_version_atomic/));
check("schema marker", () => assert.match(migration, /drive-document-flow-v010-20260925/));
check("no audit constraint rewrite", () => assert.doesNotMatch(migration, /drop constraint.*project_core_audit_entity_type_check/i));

const pass = checks.filter((item) => item.pass).length;
console.log(JSON.stringify({ pass, total: checks.length, checks }, null, 2));
if (pass !== checks.length) process.exit(1);
