#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const mode = (process.argv[2] || "preflight").trim().toLowerCase();
const migrationRel = "supabase/migrations/20261002_drive_folder_password_v086.sql";
const migration = join(root, migrationRel);
const expectedSha = "38af4821e8ce50a648e391ed17372590d1dac5159d85bb35bfd56163dd76efd3";
const expectedRef = "pbgyuznivqvestuksvif";
const approvalPhrase = "DEV_ONLY_DRIVE_FOLDER_PASSWORD_V086_APPLY_APPROVED";
const backupRoot = process.env.DRIVE_FOLDER_PASSWORD_V086_BACKUP_ROOT || "/srv/dimpro-dev/backups/drive-folder-password-v086";

function fail(code, message, details = {}) {
  console.error(JSON.stringify({ ok: false, mode, code, message, ...details }, null, 2));
  process.exit(2);
}
function sha(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}
function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
function run(cmd, args) {
  const password = process.env.DRIVE_FOLDER_PASSWORD_V086_DB_PASSWORD || process.env.PGPASSWORD || "";
  const result = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...(password ? { PGPASSWORD: password } : {}) },
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
  };
}
function requireTool(cmd) {
  const result = spawnSync(cmd, ["--version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) fail("TOOL_MISSING", cmd + " unavailable");
}
function readEnv(file, key) {
  if (!existsSync(file)) return "";
  const prefix = key + "=";
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith(prefix)) return line.slice(prefix.length).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

if (!["preflight", "apply", "verify"].includes(mode)) fail("MODE_INVALID", "Usage: preflight | apply | verify");
if (!existsSync(migration)) fail("MIGRATION_MISSING", "V0.8.6 migration missing");
const actualSha = sha(migration);
if (actualSha !== expectedSha) fail("MIGRATION_SHA_MISMATCH", "Migration SHA mismatch", { expectedSha, actualSha });
for (const tool of ["psql", "pg_dump", "pg_restore"]) requireTool(tool);

const envFile = join(process.env.NEXT_ENV_PROJECT_DIR || "/srv/dimpro-dev/candidates/drive-pilot", ".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || readEnv(envFile, "NEXT_PUBLIC_SUPABASE_URL");
const ref = String(url).match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i)?.[1] || "";
if (ref !== expectedRef) fail("DEV_PROJECT_REF_MISMATCH", "Canonical DEV target mismatch", { expectedRef, ref });
if (process.env.PROD_SUPABASE_PROJECT_REF && process.env.PROD_SUPABASE_PROJECT_REF === ref) fail("PROD_TARGET_BLOCKED", "DEV and PROD refs match");

const pgpass = String(process.env.PGPASSFILE || "").trim();
if (!(process.env.DRIVE_FOLDER_PASSWORD_V086_DB_PASSWORD || process.env.PGPASSWORD || (pgpass && existsSync(pgpass)) || existsSync(join(homedir(), ".pgpass")))) {
  fail("DB_CREDENTIAL_REQUIRED", "No PostgreSQL credential");
}

const db = {
  host: process.env.DRIVE_FOLDER_PASSWORD_V086_DB_HOST || "aws-0-eu-central-1.pooler.supabase.com",
  port: process.env.DRIVE_FOLDER_PASSWORD_V086_DB_PORT || "5432",
  user: process.env.DRIVE_FOLDER_PASSWORD_V086_DB_USER || ("postgres." + ref),
  database: process.env.DRIVE_FOLDER_PASSWORD_V086_DB_NAME || "postgres",
};
function args(extra = []) {
  return ["-w", "-h", db.host, "-p", db.port, "-U", db.user, "-d", db.database, "-X", "-v", "ON_ERROR_STOP=1", ...extra];
}
function query(sql) {
  const result = run("psql", args(["-Atc", sql]));
  if (!result.ok) fail("DB_QUERY_FAILED", "DEV query failed", { stderr: result.stderr.slice(-1600) });
  return result.stdout;
}
function jsonQuery(sql, code) {
  try { return JSON.parse(query(sql)); }
  catch { fail(code, "Invalid JSON probe"); }
}

function probe() {
  return jsonQuery(
    "select json_build_object(" +
      "'schemaVersion',coalesce((select schema_version from public.drive_core_schema_meta where component='drive-core'),'')," +
      "'migrationCount',coalesce((select migration_count from public.drive_core_schema_meta where component='drive-core'),0)," +
      "'bootstrapId',coalesce((select bootstrap_id from public.drive_core_schema_meta where component='drive-core'),'')," +
      "'passwordsTable',to_regclass('public.drive_core_folder_passwords') is not null," +
      "'attemptsTable',to_regclass('public.drive_core_folder_password_attempts') is not null" +
    ")::text;",
    "PROBE_INVALID",
  );
}
function counts() {
  return jsonQuery(
    "select json_build_object(" +
      "'folders',(select count(*) from public.drive_core_folders)," +
      "'aclEntries',(select count(*) from public.drive_core_folder_acl_entries)," +
      "'documents',(select count(*) from public.drive_core_documents)," +
      "'versions',(select count(*) from public.drive_core_document_versions)," +
      "'uploadSessions',(select count(*) from public.drive_core_upload_sessions)," +
      "'schemaMeta',(select count(*) from public.drive_core_schema_meta)" +
    ")::text;",
    "COUNTS_INVALID",
  );
}
function startReady(v) {
  return v.schemaVersion === "0.8.4"
    && Number(v.migrationCount) === 6
    && v.bootstrapId === "drive-core-v084-metadata-controls-20261002"
    && !v.passwordsTable && !v.attemptsTable;
}
function targetReady(v) {
  return v.schemaVersion === "0.8.6"
    && Number(v.migrationCount) === 7
    && v.bootstrapId === "drive-core-v086-folder-password-gate-20261002"
    && v.passwordsTable && v.attemptsTable;
}
function targetIntegrity() {
  return jsonQuery(
    "select json_build_object(" +
      "'passwordHashConstraint',exists(select 1 from pg_constraint where conname='drive_core_folder_password_hash_check')," +
      "'passwordVersionConstraint',exists(select 1 from pg_constraint where conname='drive_core_folder_password_version_check')," +
      "'ttlConstraint',exists(select 1 from pg_constraint where conname='drive_core_folder_password_ttl_check')," +
      "'attemptLimitConstraint',exists(select 1 from pg_constraint where conname='drive_core_folder_password_attempt_limit_check')," +
      "'lockoutConstraint',exists(select 1 from pg_constraint where conname='drive_core_folder_password_lockout_check')," +
      "'passwordRls',coalesce((select relrowsecurity from pg_class where oid='public.drive_core_folder_passwords'::regclass),false)," +
      "'attemptRls',coalesce((select relrowsecurity from pg_class where oid='public.drive_core_folder_password_attempts'::regclass),false)," +
      "'setRpc',to_regprocedure('public.drive_core_set_folder_password_atomic(text,text,text,integer,text)') is not null," +
      "'clearRpc',to_regprocedure('public.drive_core_clear_folder_password_atomic(text,text,text)') is not null," +
      "'failureRpc',to_regprocedure('public.drive_core_record_folder_password_failure_atomic(text,text,text)') is not null," +
      "'unlockRpc',to_regprocedure('public.drive_core_record_folder_password_unlock_atomic(text,text,integer,text)') is not null," +
      "'passwordRows',(select count(*) from public.drive_core_folder_passwords)," +
      "'attemptRows',(select count(*) from public.drive_core_folder_password_attempts)" +
    ")::text;",
    "TARGET_INTEGRITY_INVALID",
  );
}
function assertIntegrity(v) {
  for (const key of [
    "passwordHashConstraint",
    "passwordVersionConstraint",
    "ttlConstraint",
    "attemptLimitConstraint",
    "lockoutConstraint",
    "passwordRls",
    "attemptRls",
    "setRpc",
    "clearRpc",
    "failureRpc",
    "unlockRpc",
  ]) {
    if (v[key] !== true) fail("TARGET_INTEGRITY_FAILED", "V0.8.6 integrity check failed", { key, integrity: v });
  }
  if (Number(v.passwordRows) < 0 || Number(v.attemptRows) < 0) fail("TARGET_DATA_INVALID", "Invalid password table counts", { integrity: v });
}

const before = probe();
const beforeCounts = counts();

if (mode === "preflight") {
  if (!startReady(before) && !targetReady(before)) fail("PREDECESSOR_REQUIRED", "Drive Core 0.8.4 must be active before 0.8.6", { schema: before });
  console.log(JSON.stringify({
    ok: true,
    mode,
    projectRef: ref,
    productionAccess: "DENY",
    migration: migrationRel,
    migrationSha256: actualSha,
    alreadyApplied: targetReady(before),
    schema: before,
    rowCounts: beforeCounts,
    requiredApproval: approvalPhrase,
    destructiveActionsPerformed: false,
  }, null, 2));
  process.exit(0);
}

if (mode === "verify") {
  if (!targetReady(before)) fail("TARGET_NOT_READY", "Drive Core 0.8.6 is not active", { schema: before });
  const integrity = targetIntegrity();
  assertIntegrity(integrity);
  console.log(JSON.stringify({
    ok: true, mode, projectRef: ref, productionAccess: "DENY",
    schema: before, rowCounts: beforeCounts, integrity, destructiveActionsPerformed: false,
  }, null, 2));
  process.exit(0);
}

if (String(process.env.DRIVE_FOLDER_PASSWORD_V086_MIGRATION_APPROVED || "") !== approvalPhrase) {
  fail("APPROVAL_REQUIRED", "Explicit DEV approval required", { requiredApproval: approvalPhrase });
}
if (process.env.OPERATION !== "migration") fail("COORDINATED_LOCK_REQUIRED", "Must run through migration operation lock");
if (targetReady(before)) {
  const integrity = targetIntegrity();
  assertIntegrity(integrity);
  console.log(JSON.stringify({ ok: true, mode, alreadyApplied: true, schema: before, rowCounts: beforeCounts, integrity }, null, 2));
  process.exit(0);
}
if (!startReady(before)) fail("UNEXPECTED_START_SCHEMA", "Migration start marker is not Drive Core 0.8.4", { schema: before });

const backupDir = join(backupRoot, stamp());
mkdirSync(backupDir, { recursive: true, mode: 0o700 });
chmodSync(backupDir, 0o700);
const dumpFile = join(backupDir, "drive-core-v086-before.dump");
const dump = run("pg_dump", [
  "-w", "-h", db.host, "-p", db.port, "-U", db.user, "-d", db.database,
  "-Fc", "-f", dumpFile,
  "-t", "public.drive_core_folders",
  "-t", "public.drive_core_folder_acl_entries",
  "-t", "public.drive_core_documents",
  "-t", "public.drive_core_document_versions",
  "-t", "public.drive_core_upload_sessions",
  "-t", "public.drive_core_schema_meta",
]);
if (!dump.ok) fail("BACKUP_FAILED", "Backup failed; migration not applied", { backupDir, stderr: dump.stderr.slice(-1600) });

const list = run("pg_restore", ["-l", dumpFile]);
for (const name of [
  "drive_core_folders",
  "drive_core_folder_acl_entries",
  "drive_core_documents",
  "drive_core_document_versions",
  "drive_core_upload_sessions",
  "drive_core_schema_meta",
]) {
  if (!list.ok || !list.stdout.includes(name)) fail("BACKUP_VERIFY_FAILED", "Backup verify failed", { backupDir, missing: name });
}
chmodSync(dumpFile, 0o600);
writeFileSync(join(backupDir, "backup.sha256"), sha(dumpFile) + "  " + basename(dumpFile) + "\n", { mode: 0o600 });
writeFileSync(join(backupDir, "manifest.json"), JSON.stringify({
  environment: "DEV",
  productionAccess: "DENY",
  projectRef: ref,
  migration: migrationRel,
  migrationSha256: actualSha,
  beforeSchema: before,
  beforeCounts,
  backupFile: dumpFile,
}, null, 2) + "\n", { mode: 0o600 });

const applied = run("psql", args(["-f", migration]));
if (!applied.ok) fail("APPLY_FAILED", "Migration failed after verified backup", { backupDir, stderr: applied.stderr.slice(-2200) });

const after = probe();
if (!targetReady(after)) fail("POST_VERIFY_FAILED", "Drive Core 0.8.6 marker/schema verification failed", { backupDir, schema: after });
const afterCounts = counts();
for (const key of ["folders","aclEntries","documents","versions","uploadSessions","schemaMeta"]) {
  if (Number(afterCounts[key]) !== Number(beforeCounts[key])) fail("ROW_COUNT_CHANGED", "Protected row count changed", { key, before: beforeCounts, after: afterCounts, backupDir });
}
const integrity = targetIntegrity();
assertIntegrity(integrity);
if (Number(integrity.passwordRows) !== 0 || Number(integrity.attemptRows) !== 0) {
  fail("NEW_TABLES_NOT_EMPTY", "New password tables must start empty", { integrity, backupDir });
}

console.log(JSON.stringify({
  ok: true,
  mode,
  projectRef: ref,
  productionAccess: "DENY",
  migrationSha256: actualSha,
  backupDir,
  beforeSchema: before,
  afterSchema: after,
  beforeCounts,
  afterCounts,
  integrity,
}, null, 2));
