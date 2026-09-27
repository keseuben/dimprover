#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const mode = (process.argv[2] || "preflight").trim().toLowerCase();
const migrationRel = "supabase/migrations/20260927_drive_project_quota_atomic_v042.sql";
const migration = join(root, migrationRel);
const expectedMigrationSha256 = "f27aef5dbe1fcf45cb0e95b143971b5f9c77e837138dabdc4a49ad0bfabd3a1d";
const expectedDevProjectRef = "pbgyuznivqvestuksvif";
const expected = {
  component: "drive-object-storage",
  schemaVersion: "0.4.2",
  migrationCount: 2,
  bootstrapId: "drive-object-storage-v042-quota-20260927",
};
const approvalPhrase = "DEV_ONLY_DRIVE_OBJECT_STORAGE_V042_QUOTA_APPLY_APPROVED";
const approval = String(process.env.DRIVE_OBJECT_STORAGE_V042_MIGRATION_APPROVED || "").trim();
const backupRoot = process.env.DRIVE_OBJECT_STORAGE_V042_BACKUP_ROOT?.trim()
  || "/srv/dimpro-dev/backups/drive-object-storage-v042-quota";

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
  if (result.error || result.status !== 0) {
    fail("DRIVE_OBJECT_STORAGE_V042_TOOL_MISSING", `${command} is unavailable.`, { command });
  }
}
function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}
function run(command, args, options = {}) {
  const dbPassword = process.env.DRIVE_OBJECT_STORAGE_V042_DB_PASSWORD || process.env.PGPASSWORD || "";
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
  if (process.env.DRIVE_OBJECT_STORAGE_V042_DB_PASSWORD || process.env.PGPASSWORD) return true;
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
  fail("DRIVE_OBJECT_STORAGE_V042_MODE_INVALID", "Usage: preflight | apply | verify");
}
if (!existsSync(migration)) {
  fail("DRIVE_OBJECT_STORAGE_V042_MIGRATION_MISSING", "Migration file is missing.", { migration: migrationRel });
}
const migrationSha256 = sha256File(migration);
if (migrationSha256 !== expectedMigrationSha256) {
  fail("DRIVE_OBJECT_STORAGE_V042_MIGRATION_SHA_MISMATCH", "Migration SHA-256 mismatch.", {
    migration: migrationRel,
    expectedMigrationSha256,
    actualMigrationSha256: migrationSha256,
  });
}

const envProjectDir = process.env.NEXT_ENV_PROJECT_DIR?.trim()
  || "/srv/dimpro-dev/candidates/drive-pilot";
const envFile = join(envProjectDir, ".env.local");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || readEnvValue(envFile, "NEXT_PUBLIC_SUPABASE_URL");
const projectRef = projectRefFromUrl(supabaseUrl);
if (!projectRef) {
  fail("DRIVE_OBJECT_STORAGE_V042_DEV_PROJECT_REF_MISSING", "DEV Supabase project ref cannot be resolved.", { envFile });
}
if (projectRef !== expectedDevProjectRef) {
  fail("DRIVE_OBJECT_STORAGE_V042_DEV_PROJECT_REF_MISMATCH", "Migration target is not the canonical DEV Supabase project.", {
    expectedProjectRef: expectedDevProjectRef,
    actualProjectRef: projectRef,
  });
}
const prodRef = String(process.env.PROD_SUPABASE_PROJECT_REF || "").trim();
if (prodRef && prodRef === projectRef) {
  fail("DRIVE_OBJECT_STORAGE_V042_PROD_TARGET_BLOCKED", "DEV and PROD Supabase project refs are equal; migration blocked.");
}

requireCommand("psql");
requireCommand("pg_dump");
requireCommand("pg_restore");
if (!hasDbCredential()) {
  fail(
    "DRIVE_OBJECT_STORAGE_V042_DB_CREDENTIAL_REQUIRED",
    "Canonical DEV project is verified, but no PostgreSQL credential is available to the migration gate. No SQL was executed.",
    { projectRef, migration: migrationRel, migrationSha256, requiredApproval: approvalPhrase },
  );
}

const db = {
  host: process.env.DRIVE_OBJECT_STORAGE_V042_DB_HOST?.trim() || "aws-0-eu-central-1.pooler.supabase.com",
  port: process.env.DRIVE_OBJECT_STORAGE_V042_DB_PORT?.trim() || "5432",
  user: process.env.DRIVE_OBJECT_STORAGE_V042_DB_USER?.trim() || `postgres.${projectRef}`,
  database: process.env.DRIVE_OBJECT_STORAGE_V042_DB_NAME?.trim() || "postgres",
};
function psqlArgs(extra) {
  return ["-w", "-h", db.host, "-p", db.port, "-U", db.user, "-d", db.database, "-X", "-v", "ON_ERROR_STOP=1", ...extra];
}
function psqlQuery(query) {
  const result = run("psql", psqlArgs(["-Atc", query]));
  if (!result.ok) {
    fail("DRIVE_OBJECT_STORAGE_V042_DB_QUERY_FAILED", "DEV schema probe failed.", { status: result.status });
  }
  return result.stdout;
}
function jsonQuery(query, code) {
  return jsonParse(psqlQuery(query), code);
}

const identity = jsonQuery(
  `select json_build_object('database',current_database(),'user',current_user,'port',inet_server_port())::text;`,
  "DRIVE_OBJECT_STORAGE_V042_DB_IDENTITY_INVALID",
);
const prerequisite = jsonQuery(`
  select json_build_object(
    'projects',to_regclass('public.project_core_projects') is not null,
    'documents',to_regclass('public.drive_core_documents') is not null,
    'versions',to_regclass('public.drive_core_document_versions') is not null,
    'uploads',to_regclass('public.drive_core_upload_sessions') is not null,
    'schemaMeta',to_regclass('public.drive_storage_schema_meta') is not null,
    'createRpc',to_regprocedure('public.drive_core_create_upload_session_atomic(text,jsonb,text)') is not null
  )::text;`,
  "DRIVE_OBJECT_STORAGE_V042_PREREQUISITE_PROBE_INVALID",
);
if (!Object.values(prerequisite).every(Boolean)) {
  fail("DRIVE_OBJECT_STORAGE_V042_PREREQUISITES_MISSING", "Required DRIVE Object Storage DEV schema is incomplete.", { prerequisite });
}

function schemaProbe() {
  return jsonQuery(`
    select json_build_object(
      'schemaVersion',coalesce((select schema_version from public.drive_storage_schema_meta where component='drive-object-storage'),''),
      'migrationCount',coalesce((select migration_count from public.drive_storage_schema_meta where component='drive-object-storage'),0),
      'bootstrapId',coalesce((select bootstrap_id from public.drive_storage_schema_meta where component='drive-object-storage'),''),
      'advisoryLock',case when to_regprocedure('public.drive_core_create_upload_session_atomic(text,jsonb,text)') is null then false
        else position('pg_advisory_xact_lock' in pg_get_functiondef('public.drive_core_create_upload_session_atomic(text,jsonb,text)'::regprocedure)) > 0 end,
      'quotaRequired',case when to_regprocedure('public.drive_core_create_upload_session_atomic(text,jsonb,text)') is null then false
        else position('DRIVE_PROJECT_QUOTA_REQUIRED' in pg_get_functiondef('public.drive_core_create_upload_session_atomic(text,jsonb,text)'::regprocedure)) > 0 end,
      'quotaExceeded',case when to_regprocedure('public.drive_core_create_upload_session_atomic(text,jsonb,text)') is null then false
        else position('DRIVE_PROJECT_QUOTA_EXCEEDED' in pg_get_functiondef('public.drive_core_create_upload_session_atomic(text,jsonb,text)'::regprocedure)) > 0 end,
      'quotaBytes',case when to_regprocedure('public.drive_core_create_upload_session_atomic(text,jsonb,text)') is null then false
        else position('quota_bytes' in pg_get_functiondef('public.drive_core_create_upload_session_atomic(text,jsonb,text)'::regprocedure)) > 0 end
    )::text;`,
    "DRIVE_OBJECT_STORAGE_V042_SCHEMA_PROBE_INVALID",
  );
}
function targetReady(p) {
  return p.schemaVersion === expected.schemaVersion
    && Number(p.migrationCount) === expected.migrationCount
    && p.bootstrapId === expected.bootstrapId
    && p.advisoryLock && p.quotaRequired && p.quotaExceeded && p.quotaBytes;
}
function rowCounts() {
  return jsonQuery(`
    select json_build_object(
      'versions',(select count(*) from public.drive_core_document_versions),
      'uploads',(select count(*) from public.drive_core_upload_sessions),
      'schemaMeta',(select count(*) from public.drive_storage_schema_meta)
    )::text;`,
    "DRIVE_OBJECT_STORAGE_V042_ROW_COUNT_PROBE_INVALID",
  );
}
function securityProbe() {
  return jsonQuery(`
    select json_build_object(
      'anonExecute',has_function_privilege('anon','public.drive_core_create_upload_session_atomic(text,jsonb,text)','EXECUTE'),
      'authExecute',has_function_privilege('authenticated','public.drive_core_create_upload_session_atomic(text,jsonb,text)','EXECUTE'),
      'serviceExecute',has_function_privilege('service_role','public.drive_core_create_upload_session_atomic(text,jsonb,text)','EXECUTE')
    )::text;`,
    "DRIVE_OBJECT_STORAGE_V042_SECURITY_PROBE_INVALID",
  );
}
function assertSecurity(s) {
  if (s.anonExecute || s.authExecute || !s.serviceExecute) {
    fail("DRIVE_OBJECT_STORAGE_V042_SECURITY_INVALID", "Create-upload RPC privileges are not fail-closed.", { security: s });
  }
}

const before = schemaProbe();
const beforeCounts = rowCounts();
if (mode === "preflight") {
  if (targetReady(before)) {
    const security = securityProbe();
    assertSecurity(security);
    console.log(JSON.stringify({
      ok: true, mode, alreadyApplied: true, projectRef,
      migration: migrationRel, migrationSha256, schema: before, rowCounts: beforeCounts, security,
    }, null, 2));
    process.exit(0);
  }
  console.log(JSON.stringify({
    ok: true, mode, readyForApply: true, alreadyApplied: false, projectRef,
    database: { database: identity.database, user: identity.user, port: identity.port },
    migration: migrationRel, migrationSha256, schema: before, rowCounts: beforeCounts,
    requiredApproval: approvalPhrase,
    requiredCoordinator: "npm run operation:migration -- node scripts/drive-object-storage-v042-quota-migration-gate.mjs apply",
  }, null, 2));
  process.exit(0);
}
if (mode === "verify") {
  if (!targetReady(before)) {
    fail("DRIVE_OBJECT_STORAGE_V042_TARGET_NOT_READY", "Drive Object Storage 0.4.2 quota target schema is not active.", { schema: before });
  }
  const security = securityProbe();
  assertSecurity(security);
  console.log(JSON.stringify({
    ok: true, mode, projectRef, migration: migrationRel, migrationSha256,
    schema: before, rowCounts: beforeCounts, security,
  }, null, 2));
  process.exit(0);
}

if (approval !== approvalPhrase) {
  fail("DRIVE_OBJECT_STORAGE_V042_APPROVAL_REQUIRED", "Explicit DEV-only approval is required for apply mode.", {
    requiredApproval: approvalPhrase,
  });
}
if (process.env.OPERATION !== "migration") {
  fail(
    "DRIVE_OBJECT_STORAGE_V042_COORDINATED_LOCK_REQUIRED",
    "Apply mode must run through the DIMPRO coordinated migration operation lock.",
    { requiredCommand: "npm run operation:migration -- node scripts/drive-object-storage-v042-quota-migration-gate.mjs apply" },
  );
}
if (targetReady(before)) {
  const security = securityProbe();
  assertSecurity(security);
  console.log(JSON.stringify({
    ok: true, mode, alreadyApplied: true, projectRef, schema: before, rowCounts: beforeCounts, security,
  }, null, 2));
  process.exit(0);
}

const stamp = utcStamp();
const backupDir = join(backupRoot, stamp);
mkdirSync(backupDir, { recursive: true, mode: 0o700 });
chmodSync(backupDir, 0o700);
const backupFile = join(backupDir, "drive-object-storage-v042-before.dump");
const functionFile = join(backupDir, "drive_core_create_upload_session_atomic.before.sql");
const manifestFile = join(backupDir, "manifest.json");

const oldFunction = psqlQuery(
  "select pg_get_functiondef('public.drive_core_create_upload_session_atomic(text,jsonb,text)'::regprocedure);",
);
writeFileSync(functionFile, `${oldFunction}\n`, { mode: 0o600 });
chmodSync(functionFile, 0o600);

const dump = run("pg_dump", [
  "-w", "-h", db.host, "-p", db.port, "-U", db.user, "-d", db.database, "-Fc", "-f", backupFile,
  "-t", "public.drive_core_upload_sessions",
  "-t", "public.drive_core_document_versions",
  "-t", "public.drive_storage_schema_meta",
]);
if (!dump.ok) {
  fail("DRIVE_OBJECT_STORAGE_V042_BACKUP_FAILED", "DEV backup failed; migration was not applied.", { status: dump.status });
}
const listed = run("pg_restore", ["-l", backupFile]);
if (!listed.ok
  || !listed.stdout.includes("drive_core_upload_sessions")
  || !listed.stdout.includes("drive_core_document_versions")
  || !listed.stdout.includes("drive_storage_schema_meta")) {
  fail("DRIVE_OBJECT_STORAGE_V042_BACKUP_VERIFY_FAILED", "Backup archive verification failed; migration was not applied.");
}
writeFileSync(manifestFile, JSON.stringify({
  createdAt: new Date().toISOString(),
  environment: "DEV",
  productionAccess: "DENY",
  projectRef,
  migration: migrationRel,
  migrationSha256,
  beforeSchema: before,
  beforeCounts,
  backupFile,
  functionFile,
}, null, 2) + "\n", { mode: 0o600 });
chmodSync(backupFile, 0o600);
chmodSync(manifestFile, 0o600);

const applied = run("psql", psqlArgs(["-f", migration]));
if (!applied.ok) {
  fail("DRIVE_OBJECT_STORAGE_V042_APPLY_FAILED", "DEV migration apply failed after verified backup.", {
    backupDir, status: applied.status,
  });
}

const after = schemaProbe();
if (!targetReady(after)) {
  fail("DRIVE_OBJECT_STORAGE_V042_POST_VERIFY_FAILED", "Migration completed but target schema verification failed.", {
    backupDir, schema: after,
  });
}
const afterCounts = rowCounts();
if (Number(afterCounts.versions) !== Number(beforeCounts.versions)
  || Number(afterCounts.uploads) !== Number(beforeCounts.uploads)
  || Number(afterCounts.schemaMeta) !== Number(beforeCounts.schemaMeta)) {
  fail("DRIVE_OBJECT_STORAGE_V042_EXISTING_ROW_COUNT_CHANGED", "Migration unexpectedly changed protected table row counts.", {
    beforeCounts, afterCounts, backupDir,
  });
}
const security = securityProbe();
assertSecurity(security);

console.log(JSON.stringify({
  ok: true,
  mode,
  applied: true,
  projectRef,
  migration: migrationRel,
  migrationSha256,
  backupDir,
  schema: after,
  rowCounts: afterCounts,
  security,
}, null, 2));
