#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const mode = (process.argv[2] || "preflight").trim().toLowerCase();
const migrationRel = "supabase/migrations/20260925_drive_document_flow_v010.sql";
const migration = join(root, migrationRel);
const expectedMigrationSha256 = "ecff3a81d3917aaedaa00deee5358eb4dc93b1081c511b24fcb6b85436968fb0";
const expectedDevProjectRef = "pbgyuznivqvestuksvif";
const expected = {
  component: "drive-document-flow",
  schemaVersion: "0.1.0",
  migrationCount: 1,
  bootstrapId: "drive-document-flow-v010-20260925",
};
const approvalPhrase = "DEV_ONLY_DRIVE_DOCUMENT_FLOW_V010_APPLY_APPROVED";
const approval = String(process.env.DRIVE_DOCUMENT_FLOW_V010_MIGRATION_APPROVED || "").trim();
const backupRoot = process.env.DRIVE_DOCUMENT_FLOW_V010_BACKUP_ROOT?.trim()
  || "/srv/dimpro-dev/backups/drive-document-flow-v010";

function fail(code, message, details = {}, exitCode = 2) {
  console.error(JSON.stringify({ ok: false, mode, code, message, ...details }, null, 2));
  process.exit(exitCode);
}
function readEnvValue(file, key) {
  if (!existsSync(file)) return "";
  const prefix = `${key}=`;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.startsWith(prefix)) continue;
    return line.slice(prefix.length).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}
function projectRefFromUrl(value) {
  const match = String(value || "").match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i);
  return match?.[1] || "";
}
function requireCommand(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) fail("DRIVE_DOCUMENT_FLOW_V010_TOOL_MISSING", `${command} is unavailable.`, { command });
}
function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}
function run(command, args, options = {}) {
  const dbPassword = process.env.DRIVE_DOCUMENT_FLOW_DB_PASSWORD || process.env.PGPASSWORD || "";
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...(dbPassword ? { PGPASSWORD: dbPassword } : {}) },
    ...options,
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
  };
}
function hasDbCredential() {
  if (process.env.DRIVE_DOCUMENT_FLOW_DB_PASSWORD || process.env.PGPASSWORD) return true;
  const explicit = String(process.env.PGPASSFILE || "").trim();
  if (explicit && existsSync(explicit)) return true;
  return existsSync(join(homedir(), ".pgpass"));
}
function jsonParse(raw, code) {
  try { return JSON.parse(raw); }
  catch { fail(code, "DEV schema probe returned invalid JSON."); }
}
function utcStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

if (!["preflight", "apply", "verify"].includes(mode)) {
  fail("DRIVE_DOCUMENT_FLOW_V010_MODE_INVALID", "Usage: preflight | apply | verify");
}
if (!existsSync(migration)) fail("DRIVE_DOCUMENT_FLOW_V010_MIGRATION_MISSING", "Migration file is missing.", { migration: migrationRel });
const migrationSha256 = sha256File(migration);
if (migrationSha256 !== expectedMigrationSha256) {
  fail("DRIVE_DOCUMENT_FLOW_V010_MIGRATION_SHA_MISMATCH", "Migration SHA-256 mismatch.", {
    migration: migrationRel,
    expectedMigrationSha256,
    actualMigrationSha256: migrationSha256,
  });
}

const envProjectDir = process.env.NEXT_ENV_PROJECT_DIR?.trim()
  || "/srv/dimpro-dev/worktrees/integration-prod-v1212-benjadmin-m35";
const envFile = join(envProjectDir, ".env.local");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || readEnvValue(envFile, "NEXT_PUBLIC_SUPABASE_URL");
const projectRef = projectRefFromUrl(supabaseUrl);
if (!projectRef) fail("DRIVE_DOCUMENT_FLOW_V010_DEV_PROJECT_REF_MISSING", "DEV Supabase project ref cannot be resolved.", { envFile });
if (projectRef !== expectedDevProjectRef) {
  fail("DRIVE_DOCUMENT_FLOW_V010_DEV_PROJECT_REF_MISMATCH", "Migration target is not the canonical DEV Supabase project.", {
    expectedProjectRef: expectedDevProjectRef,
    actualProjectRef: projectRef,
  });
}
const prodRef = String(process.env.PROD_SUPABASE_PROJECT_REF || "").trim();
if (prodRef && prodRef === projectRef) {
  fail("DRIVE_DOCUMENT_FLOW_V010_PROD_TARGET_BLOCKED", "DEV and PROD Supabase project refs are equal; migration blocked.");
}

requireCommand("psql");
requireCommand("pg_dump");
requireCommand("pg_restore");
if (!hasDbCredential()) {
  fail("DRIVE_DOCUMENT_FLOW_V010_DB_CREDENTIAL_REQUIRED",
    "Canonical DEV project is verified, but no PostgreSQL credential is available to the migration gate. No SQL was executed.",
    { projectRef, migration: migrationRel, migrationSha256, requiredApproval: approvalPhrase });
}

const db = {
  host: process.env.DRIVE_DOCUMENT_FLOW_DB_HOST?.trim() || "aws-0-eu-central-1.pooler.supabase.com",
  port: process.env.DRIVE_DOCUMENT_FLOW_DB_PORT?.trim() || "5432",
  user: process.env.DRIVE_DOCUMENT_FLOW_DB_USER?.trim() || `postgres.${projectRef}`,
  database: process.env.DRIVE_DOCUMENT_FLOW_DB_NAME?.trim() || "postgres",
};
function psqlArgs(extra) {
  return ["-w", "-h", db.host, "-p", db.port, "-U", db.user, "-d", db.database, "-X", "-v", "ON_ERROR_STOP=1", ...extra];
}
function psqlQuery(query) {
  const result = run("psql", psqlArgs(["-Atc", query]));
  if (!result.ok) fail("DRIVE_DOCUMENT_FLOW_V010_DB_QUERY_FAILED", "DEV schema probe failed.", { status: result.status });
  return result.stdout;
}
function jsonQuery(query, code) { return jsonParse(psqlQuery(query), code); }

const identity = jsonQuery(
  `select json_build_object('database',current_database(),'user',current_user,'port',inet_server_port())::text;`,
  "DRIVE_DOCUMENT_FLOW_V010_DB_IDENTITY_INVALID",
);
const prerequisite = jsonQuery(`
  select json_build_object(
    'projectCoreProjects',to_regclass('public.project_core_projects') is not null,
    'projectCoreAudit',to_regclass('public.project_core_audit_events') is not null,
    'driveDocuments',to_regclass('public.drive_core_documents') is not null,
    'driveVersions',to_regclass('public.drive_core_document_versions') is not null,
    'driveUploads',to_regclass('public.drive_core_upload_sessions') is not null,
    'driveChanges',to_regclass('public.drive_core_change_events') is not null,
    'driveSchemaMeta',to_regclass('public.drive_storage_schema_meta') is not null
  )::text;`,
  "DRIVE_DOCUMENT_FLOW_V010_PREREQUISITE_PROBE_INVALID",
);
if (!Object.values(prerequisite).every(Boolean)) {
  fail("DRIVE_DOCUMENT_FLOW_V010_PREREQUISITES_MISSING", "Required DRIVE / Project Core DEV schema is incomplete.", { prerequisite });
}

function schemaProbe() {
  return jsonQuery(`
    select json_build_object(
      'governanceTable',to_regclass('public.drive_core_document_governance') is not null,
      'issuesTable',to_regclass('public.drive_core_document_issues') is not null,
      'recipientsTable',to_regclass('public.drive_core_document_issue_recipients') is not null,
      'sequenceTable',to_regclass('public.drive_core_document_issue_sequences') is not null,
      'versionStorageVersionId',exists(select 1 from information_schema.columns where table_schema='public' and table_name='drive_core_document_versions' and column_name='storage_version_id'),
      'uploadStorageVersionId',exists(select 1 from information_schema.columns where table_schema='public' and table_name='drive_core_upload_sessions' and column_name='storage_version_id'),
      'registerRpc',to_regprocedure('public.drive_core_register_incoming_document_atomic(text,text,text,text,text,text,text)') is not null,
      'reviewRpc',to_regprocedure('public.drive_core_mark_document_review_atomic(text,text,text,text,text,text)') is not null,
      'issueRpc',to_regprocedure('public.drive_core_issue_document_version_atomic(text,text,text,text,text,jsonb,text)') is not null,
      'schemaVersion',coalesce((select schema_version from public.drive_storage_schema_meta where component='drive-document-flow'),''),
      'migrationCount',coalesce((select migration_count from public.drive_storage_schema_meta where component='drive-document-flow'),0),
      'bootstrapId',coalesce((select bootstrap_id from public.drive_storage_schema_meta where component='drive-document-flow'),'')
    )::text;`,
    "DRIVE_DOCUMENT_FLOW_V010_SCHEMA_PROBE_INVALID",
  );
}
function targetReady(p) {
  return p.governanceTable && p.issuesTable && p.recipientsTable && p.sequenceTable
    && p.versionStorageVersionId && p.uploadStorageVersionId
    && p.registerRpc && p.reviewRpc && p.issueRpc
    && p.schemaVersion === expected.schemaVersion
    && Number(p.migrationCount) === expected.migrationCount
    && p.bootstrapId === expected.bootstrapId;
}
function rowCounts() {
  return jsonQuery(`
    select json_build_object(
      'documents',(select count(*) from public.drive_core_documents),
      'versions',(select count(*) from public.drive_core_document_versions),
      'uploads',(select count(*) from public.drive_core_upload_sessions),
      'projectAudit',(select count(*) from public.project_core_audit_events),
      'driveChanges',(select count(*) from public.drive_core_change_events)
    )::text;`,
    "DRIVE_DOCUMENT_FLOW_V010_ROW_COUNT_PROBE_INVALID",
  );
}
function securityProbe() {
  return jsonQuery(`
    select json_build_object(
      'governanceRls',(select relrowsecurity from pg_class where oid='public.drive_core_document_governance'::regclass),
      'issuesRls',(select relrowsecurity from pg_class where oid='public.drive_core_document_issues'::regclass),
      'recipientsRls',(select relrowsecurity from pg_class where oid='public.drive_core_document_issue_recipients'::regclass),
      'anonGovernanceSelect',has_table_privilege('anon','public.drive_core_document_governance','SELECT'),
      'authGovernanceSelect',has_table_privilege('authenticated','public.drive_core_document_governance','SELECT'),
      'serviceGovernanceSelect',has_table_privilege('service_role','public.drive_core_document_governance','SELECT'),
      'anonRegisterExecute',has_function_privilege('anon','public.drive_core_register_incoming_document_atomic(text,text,text,text,text,text,text)','EXECUTE'),
      'authRegisterExecute',has_function_privilege('authenticated','public.drive_core_register_incoming_document_atomic(text,text,text,text,text,text,text)','EXECUTE'),
      'serviceRegisterExecute',has_function_privilege('service_role','public.drive_core_register_incoming_document_atomic(text,text,text,text,text,text,text)','EXECUTE'),
      'anonIssueExecute',has_function_privilege('anon','public.drive_core_issue_document_version_atomic(text,text,text,text,text,jsonb,text)','EXECUTE'),
      'authIssueExecute',has_function_privilege('authenticated','public.drive_core_issue_document_version_atomic(text,text,text,text,text,jsonb,text)','EXECUTE'),
      'serviceIssueExecute',has_function_privilege('service_role','public.drive_core_issue_document_version_atomic(text,text,text,text,text,jsonb,text)','EXECUTE')
    )::text;`,
    "DRIVE_DOCUMENT_FLOW_V010_SECURITY_PROBE_INVALID",
  );
}
function assertSecurity(s) {
  if (!s.governanceRls || !s.issuesRls || !s.recipientsRls
    || s.anonGovernanceSelect || s.authGovernanceSelect || !s.serviceGovernanceSelect
    || s.anonRegisterExecute || s.authRegisterExecute || !s.serviceRegisterExecute
    || s.anonIssueExecute || s.authIssueExecute || !s.serviceIssueExecute) {
    fail("DRIVE_DOCUMENT_FLOW_V010_SECURITY_INVALID", "Document Flow table/RPC security is not fail-closed.", { security: s });
  }
}

const before = schemaProbe();
const beforeCounts = rowCounts();
if (mode === "preflight") {
  if (targetReady(before)) {
    const security = securityProbe(); assertSecurity(security);
    console.log(JSON.stringify({ ok: true, mode, alreadyApplied: true, projectRef, migration: migrationRel, migrationSha256, schema: before, rowCounts: beforeCounts, security }, null, 2));
    process.exit(0);
  }
  console.log(JSON.stringify({
    ok: true, mode, readyForApply: true, alreadyApplied: false, projectRef,
    database: { database: identity.database, user: identity.user, port: identity.port },
    migration: migrationRel, migrationSha256, schema: before, rowCounts: beforeCounts,
    requiredApproval: approvalPhrase,
  }, null, 2));
  process.exit(0);
}
if (mode === "verify") {
  if (!targetReady(before)) fail("DRIVE_DOCUMENT_FLOW_V010_TARGET_NOT_READY", "Document Flow 0.1.0 target schema is not active.", { schema: before });
  const security = securityProbe(); assertSecurity(security);
  console.log(JSON.stringify({ ok: true, mode, projectRef, migration: migrationRel, migrationSha256, schema: before, rowCounts: beforeCounts, security }, null, 2));
  process.exit(0);
}
if (approval !== approvalPhrase) {
  fail("DRIVE_DOCUMENT_FLOW_V010_APPROVAL_REQUIRED", "Explicit DEV-only approval is required for apply mode.", { requiredApproval: approvalPhrase });
}
if (targetReady(before)) {
  const security = securityProbe(); assertSecurity(security);
  console.log(JSON.stringify({ ok: true, mode, alreadyApplied: true, projectRef, schema: before, rowCounts: beforeCounts, security }, null, 2));
  process.exit(0);
}

const stamp = utcStamp();
const backupDir = join(backupRoot, stamp);
mkdirSync(backupDir, { recursive: true, mode: 0o700 });
chmodSync(backupDir, 0o700);
const backupFile = join(backupDir, "drive-document-flow-v010-before.dump");
const manifestFile = join(backupDir, "manifest.json");
const dump = run("pg_dump", [
  "-w", "-h", db.host, "-p", db.port, "-U", db.user, "-d", db.database, "-Fc", "-f", backupFile,
  "-t", "public.drive_core_documents",
  "-t", "public.drive_core_document_versions",
  "-t", "public.drive_core_upload_sessions",
  "-t", "public.drive_storage_schema_meta",
]);
if (!dump.ok) fail("DRIVE_DOCUMENT_FLOW_V010_BACKUP_FAILED", "DEV backup failed; migration was not applied.", { status: dump.status });
const listed = run("pg_restore", ["-l", backupFile]);
if (!listed.ok || !listed.stdout.includes("drive_core_document_versions") || !listed.stdout.includes("drive_core_upload_sessions")) {
  fail("DRIVE_DOCUMENT_FLOW_V010_BACKUP_VERIFY_FAILED", "Backup archive verification failed; migration was not applied.");
}
writeFileSync(manifestFile, JSON.stringify({
  createdAt: new Date().toISOString(), environment: "DEV", productionAccess: "DENY",
  projectRef, migration: migrationRel, migrationSha256, beforeSchema: before, beforeCounts, backupFile,
}, null, 2) + "\n", { mode: 0o600 });
chmodSync(backupFile, 0o600);
chmodSync(manifestFile, 0o600);

const applied = run("psql", psqlArgs(["-f", migration]));
if (!applied.ok) fail("DRIVE_DOCUMENT_FLOW_V010_APPLY_FAILED", "DEV migration apply failed after verified backup.", { backupDir, status: applied.status });

const after = schemaProbe();
const afterCounts = rowCounts();
if (!targetReady(after)) fail("DRIVE_DOCUMENT_FLOW_V010_POST_APPLY_SCHEMA_INVALID", "Target schema verification failed.", { backupDir, schema: after });
for (const key of ["documents", "versions", "uploads"]) {
  if (Number(afterCounts[key]) !== Number(beforeCounts[key])) {
    fail("DRIVE_DOCUMENT_FLOW_V010_EXISTING_ROW_COUNT_CHANGED", `Existing ${key} row count changed unexpectedly.`, { backupDir, before: beforeCounts, after: afterCounts });
  }
}
const security = securityProbe(); assertSecurity(security);
console.log(JSON.stringify({
  ok: true, mode, applied: true, environment: "DEV", productionAccess: "DENY",
  projectRef, migration: migrationRel, migrationSha256, backupDir,
  beforeSchema: before, schema: after, beforeCounts, rowCounts: afterCounts, security,
}, null, 2));
