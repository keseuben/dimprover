#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const mode = (process.argv[2] || "preflight").trim().toLowerCase();
const migrationRel = "supabase/migrations/20261001_drive_folder_acl_v070.sql";
const migration = join(root, migrationRel);
const expectedSha = "52a07112e35345b729419709d960aeed32b0174ce113f86c5dc25f11878216cc";
const expectedRef = "pbgyuznivqvestuksvif";
const approvalPhrase = "DEV_ONLY_DRIVE_FOLDER_ACL_V070_APPLY_APPROVED";
const backupRoot = process.env.DRIVE_FOLDER_ACL_V070_BACKUP_ROOT || "/srv/dimpro-dev/backups/drive-folder-acl-v070";

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
  const password = process.env.DRIVE_FOLDER_ACL_V070_DB_PASSWORD || process.env.PGPASSWORD || "";
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

if (!["preflight", "apply", "verify"].includes(mode)) {
  fail("MODE_INVALID", "Usage: preflight | apply | verify");
}
if (!existsSync(migration)) fail("MIGRATION_MISSING", "Folder ACL migration missing");
const actualSha = sha(migration);
if (actualSha !== expectedSha) {
  fail("MIGRATION_SHA_MISMATCH", "Migration SHA mismatch", { expectedSha, actualSha });
}
for (const tool of ["psql", "pg_dump", "pg_restore"]) requireTool(tool);

const envFile = join(process.env.NEXT_ENV_PROJECT_DIR || "/srv/dimpro-dev/candidates/drive-pilot", ".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || readEnv(envFile, "NEXT_PUBLIC_SUPABASE_URL");
const ref = String(url).match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i)?.[1] || "";
if (ref !== expectedRef) fail("DEV_PROJECT_REF_MISMATCH", "Canonical DEV target mismatch", { expectedRef, ref });
if (process.env.PROD_SUPABASE_PROJECT_REF && process.env.PROD_SUPABASE_PROJECT_REF === ref) {
  fail("PROD_TARGET_BLOCKED", "DEV and PROD refs match");
}

const pgpass = String(process.env.PGPASSFILE || "").trim();
if (!(
  process.env.DRIVE_FOLDER_ACL_V070_DB_PASSWORD ||
  process.env.PGPASSWORD ||
  (pgpass && existsSync(pgpass)) ||
  existsSync(join(homedir(), ".pgpass"))
)) {
  fail("DB_CREDENTIAL_REQUIRED", "No PostgreSQL credential");
}

const db = {
  host: process.env.DRIVE_FOLDER_ACL_V070_DB_HOST || "aws-0-eu-central-1.pooler.supabase.com",
  port: process.env.DRIVE_FOLDER_ACL_V070_DB_PORT || "5432",
  user: process.env.DRIVE_FOLDER_ACL_V070_DB_USER || ("postgres." + ref),
  database: process.env.DRIVE_FOLDER_ACL_V070_DB_NAME || "postgres",
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
  try {
    return JSON.parse(query(sql));
  } catch {
    fail(code, "Invalid JSON probe");
  }
}

const prereq = jsonQuery(
  "select json_build_object(" +
    "'projects',to_regclass('public.project_core_projects') is not null," +
    "'memberships',to_regclass('public.project_core_memberships') is not null," +
    "'folders',to_regclass('public.drive_core_folders') is not null," +
    "'schemaMeta',to_regclass('public.drive_core_schema_meta') is not null" +
  ")::text;",
  "PREREQ_INVALID",
);
if (!Object.values(prereq).every(Boolean)) {
  fail("PREREQUISITES_MISSING", "Drive ACL prerequisites incomplete", { prereq });
}

function probe() {
  return jsonQuery(
    "select json_build_object(" +
      "'schemaVersion',coalesce((select schema_version from public.drive_core_schema_meta where component='drive-core'),'')," +
      "'migrationCount',coalesce((select migration_count from public.drive_core_schema_meta where component='drive-core'),0)," +
      "'bootstrapId',coalesce((select bootstrap_id from public.drive_core_schema_meta where component='drive-core'),'')," +
      "'aclInheritColumn',exists(select 1 from information_schema.columns where table_schema='public' and table_name='drive_core_folders' and column_name='acl_inherit')," +
      "'aclTable',to_regclass('public.drive_core_folder_acl_entries') is not null" +
    ")::text;",
    "PROBE_INVALID",
  );
}
function counts() {
  return jsonQuery(
    "select json_build_object(" +
      "'folders',(select count(*) from public.drive_core_folders)," +
      "'activeFolders',(select count(*) from public.drive_core_folders where status='ACTIVE')," +
      "'schemaMeta',(select count(*) from public.drive_core_schema_meta)" +
    ")::text;",
    "COUNTS_INVALID",
  );
}
function targetReady(value) {
  return value.schemaVersion === "0.7.0"
    && Number(value.migrationCount) === 4
    && value.bootstrapId === "drive-core-v070-folder-acl-20261001"
    && value.aclInheritColumn
    && value.aclTable;
}
function startReady(value) {
  return value.schemaVersion === "0.6.0"
    && Number(value.migrationCount) === 3
    && value.bootstrapId === "drive-core-v060-safe-folder-names-20260928"
    && !value.aclTable;
}
function targetIntegrity() {
  return jsonQuery(
    "select json_build_object(" +
      "'aclInheritNotNull',coalesce((select is_nullable='NO' from information_schema.columns where table_schema='public' and table_name='drive_core_folders' and column_name='acl_inherit'),false)," +
      "'aclInheritDefaultTrue',coalesce((select column_default in ('true','true::boolean') from information_schema.columns where table_schema='public' and table_name='drive_core_folders' and column_name='acl_inherit'),false)," +
      "'aclInheritNullRows',(select count(*) from public.drive_core_folders where acl_inherit is null)," +
      "'aclRows',(select count(*) from public.drive_core_folder_acl_entries)," +
      "'rls',(select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='drive_core_folder_acl_entries')," +
      "'anonSelect',has_table_privilege('anon','public.drive_core_folder_acl_entries','SELECT')," +
      "'authSelect',has_table_privilege('authenticated','public.drive_core_folder_acl_entries','SELECT')," +
      "'principalShape',exists(select 1 from pg_constraint where conname='drive_core_folder_acl_principal_shape_check')," +
      "'principalType',exists(select 1 from pg_constraint where conname='drive_core_folder_acl_principal_type_check')," +
      "'permissionCheck',exists(select 1 from pg_constraint where conname='drive_core_folder_acl_permission_check')," +
      "'effectCheck',exists(select 1 from pg_constraint where conname='drive_core_folder_acl_effect_check')," +
      "'userUnique',to_regclass('public.drive_core_folder_acl_user_permission_unique') is not null," +
      "'roleUnique',to_regclass('public.drive_core_folder_acl_role_permission_unique') is not null," +
      "'projectFolderIndex',to_regclass('public.drive_core_folder_acl_project_folder_idx') is not null," +
      "'membershipIndex',to_regclass('public.drive_core_folder_acl_membership_idx') is not null," +
      "'roleIndex',to_regclass('public.drive_core_folder_acl_role_idx') is not null" +
    ")::text;",
    "TARGET_INTEGRITY_INVALID",
  );
}
function assertTargetIntegrity(value) {
  const booleanKeys = [
    "aclInheritNotNull", "aclInheritDefaultTrue", "rls",
    "principalShape", "principalType", "permissionCheck", "effectCheck",
    "userUnique", "roleUnique", "projectFolderIndex", "membershipIndex", "roleIndex",
  ];
  for (const key of booleanKeys) {
    if (value[key] !== true) fail("TARGET_INTEGRITY_FAILED", "ACL target integrity check failed", { key, integrity: value });
  }
  if (value.anonSelect || value.authSelect) {
    fail("TARGET_SECURITY_INVALID", "ACL table direct read privilege is not fail-closed", { integrity: value });
  }
  if (Number(value.aclInheritNullRows) !== 0) {
    fail("ACL_INHERIT_NULL_ROWS", "acl_inherit contains null rows", { integrity: value });
  }
}

const before = probe();
const beforeCounts = counts();

if (mode === "preflight") {
  if (!startReady(before) && !targetReady(before)) {
    fail("UNEXPECTED_SCHEMA", "Drive Core is neither expected 0.6.0 start nor 0.7.0 target", { schema: before });
  }
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
  if (!targetReady(before)) fail("TARGET_NOT_READY", "Drive Core 0.7.0 Folder ACL is not active", { schema: before });
  const integrity = targetIntegrity();
  assertTargetIntegrity(integrity);
  console.log(JSON.stringify({
    ok: true,
    mode,
    projectRef: ref,
    productionAccess: "DENY",
    schema: before,
    rowCounts: beforeCounts,
    integrity,
    destructiveActionsPerformed: false,
  }, null, 2));
  process.exit(0);
}

if (String(process.env.DRIVE_FOLDER_ACL_V070_MIGRATION_APPROVED || "") !== approvalPhrase) {
  fail("APPROVAL_REQUIRED", "Explicit DEV approval required", { requiredApproval: approvalPhrase });
}
if (process.env.OPERATION !== "migration") {
  fail("COORDINATED_LOCK_REQUIRED", "Must run through migration operation lock");
}
if (targetReady(before)) {
  const integrity = targetIntegrity();
  assertTargetIntegrity(integrity);
  console.log(JSON.stringify({ ok: true, mode, alreadyApplied: true, schema: before, rowCounts: beforeCounts, integrity }, null, 2));
  process.exit(0);
}
if (!startReady(before)) {
  fail("UNEXPECTED_START_SCHEMA", "Migration start marker is not Drive Core 0.6.0", { schema: before });
}

const backupDir = join(backupRoot, stamp());
mkdirSync(backupDir, { recursive: true, mode: 0o700 });
chmodSync(backupDir, 0o700);
const dumpFile = join(backupDir, "drive-core-v070-before.dump");
const dump = run("pg_dump", [
  "-w", "-h", db.host, "-p", db.port, "-U", db.user, "-d", db.database,
  "-Fc", "-f", dumpFile,
  "-t", "public.drive_core_folders",
  "-t", "public.drive_core_schema_meta",
]);
if (!dump.ok) fail("BACKUP_FAILED", "Backup failed; migration not applied", { backupDir, stderr: dump.stderr.slice(-1600) });

const list = run("pg_restore", ["-l", dumpFile]);
for (const name of ["drive_core_folders", "drive_core_schema_meta"]) {
  if (!list.ok || !list.stdout.includes(name)) {
    fail("BACKUP_VERIFY_FAILED", "Backup verify failed", { backupDir, missing: name });
  }
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
if (!applied.ok) fail("APPLY_FAILED", "Migration failed after verified backup", { backupDir, stderr: applied.stderr.slice(-2000) });

const after = probe();
if (!targetReady(after)) fail("POST_VERIFY_FAILED", "Drive Core 0.7.0 marker/schema verification failed", { backupDir, schema: after });
const afterCounts = counts();
for (const key of ["folders", "activeFolders", "schemaMeta"]) {
  if (Number(afterCounts[key]) !== Number(beforeCounts[key])) {
    fail("ROW_COUNT_CHANGED", "Protected row count changed", { key, before: beforeCounts, after: afterCounts, backupDir });
  }
}
const integrity = targetIntegrity();
assertTargetIntegrity(integrity);
if (Number(integrity.aclRows) !== 0) {
  fail("UNEXPECTED_INITIAL_ACL_ROWS", "Phase 1A migration must not create ACL grants/denies", { integrity, backupDir });
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
