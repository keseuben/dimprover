#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const mode = (process.argv[2] || "preflight").trim().toLowerCase();
const migrationRel = "supabase/migrations/20260816081500_dimpro_project_drive_binding_v021.sql";
const migration = join(root, migrationRel);
const expectedMigrationSha256 = "c6a6c1c576fb2d2fc1327307fd8592a37faa618cc3932d716f5a9e30dec63f9c";
const baseline = { schemaVersion: "0.2.0", migrationCount: 4, bootstrapId: "dimpro-identity-org-license-v020-20260810", driveFolderType: "uuid" };
const target = { schemaVersion: "0.2.1", migrationCount: 5, bootstrapId: "dimpro-identity-project-drive-v021-20260816", driveFolderType: "text" };
const db = { host: "aws-0-eu-central-1.pooler.supabase.com", port: "5432", user: "postgres.pbgyuznivqvestuksvif", role: "postgres", database: "postgres", projectRef: "pbgyuznivqvestuksvif" };
const approvalPhrase = "DEV_ONLY_IDENTITY_PROJECT_DRIVE_V021_APPLY_APPROVED";
const approval = (process.env.IDENTITY_PROJECT_DRIVE_V021_MIGRATION_APPROVED || "").trim();
const backupRoot = process.env.IDENTITY_PROJECT_DRIVE_V021_BACKUP_ROOT?.trim() || "/srv/dimpro-dev/backups/identity-project-drive-v021";
const bindRpcSignature = "public.dimpro_bind_project_core_atomic(text,text,text,text,text,uuid,uuid,text,text)";

function fail(code, message, details = {}, exitCode = 2) {
  console.error(JSON.stringify({ ok: false, mode, code, message, ...details }, null, 2));
  process.exit(exitCode);
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", env: { ...process.env }, ...options });
  return { ok: !result.error && result.status === 0, status: result.status, stdout: (result.stdout || "").trim(), stderr: (result.stderr || "").trim() };
}
function requireCommand(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) fail("IDENTITY_V021_TOOL_MISSING", `${command} is unavailable.`);
}
function sha256File(file) { return createHash("sha256").update(readFileSync(file)).digest("hex"); }
function psqlArgs(extra) { return ["-w", "-h", db.host, "-p", db.port, "-U", db.user, "-d", db.database, "-X", "-v", "ON_ERROR_STOP=1", ...extra]; }
function psqlQuery(query) {
  const result = run("psql", psqlArgs(["-Atc", query]));
  if (!result.ok) fail("IDENTITY_V021_DB_QUERY_FAILED", "DEV schema probe failed.", { status: result.status });
  return result.stdout;
}
function jsonQuery(query, code) {
  try { return JSON.parse(psqlQuery(query)); }
  catch { fail(code, "DEV schema probe returned invalid JSON."); }
}
function currentDbIdentity() {
  return jsonQuery(`select json_build_object('database',current_database(),'user',current_user,'serverAddress',coalesce(inet_server_addr()::text,''),'serverPort',inet_server_port())::text;`, "IDENTITY_V021_DB_IDENTITY_INVALID");
}
function schemaProbe() {
  return jsonQuery(`
    select json_build_object(
      'markerVersion',coalesce((select schema_version from public.dimpro_identity_schema_meta where component='dimpro-identity-core'),''),
      'migrationCount',coalesce((select migration_count from public.dimpro_identity_schema_meta where component='dimpro-identity-core'),0),
      'bootstrapId',coalesce((select bootstrap_id from public.dimpro_identity_schema_meta where component='dimpro-identity-core'),''),
      'driveFolderType',coalesce((select data_type from information_schema.columns where table_schema='public' and table_name='dimpro_project_drop_settings' and column_name='drive_folder_id'),''),
      'settingsTable',to_regclass('public.dimpro_project_drop_settings') is not null,
      'identityProjectTable',to_regclass('public.dimpro_projects') is not null,
      'identityMembershipTable',to_regclass('public.dimpro_project_memberships') is not null,
      'projectCoreTable',to_regclass('public.project_core_projects') is not null,
      'projectCoreBridgeColumn',exists(select 1 from information_schema.columns where table_schema='public' and table_name='project_core_projects' and column_name='dimpro_project_id'),
      'driveFolderTable',to_regclass('public.drive_core_folders') is not null,
      'bindRpc',to_regprocedure('${bindRpcSignature}') is not null,
      'driveTextSentinel',exists(select 1 from public.drive_core_folders where id like 'drive-folder-%' and name='Beérkező Drop' and status='ACTIVE')
    )::text;`, "IDENTITY_V021_SCHEMA_PROBE_INVALID");
}
function settingsSnapshot() {
  return jsonQuery(`
    select json_build_object(
      'count',count(*),
      'nonNullDriveFolderCount',count(*) filter (where drive_folder_id is not null),
      'rows',coalesce(json_agg(json_build_object('id',id,'projectId',project_id,'driveFolderId',drive_folder_id,'incomingFolderName',incoming_folder_name,'enabled',enabled) order by id) filter (where id is not null),'[]'::json)
    )::text from public.dimpro_project_drop_settings;`, "IDENTITY_V021_SETTINGS_SNAPSHOT_INVALID");
}
function tableSecurityProbe() {
  return jsonQuery(`
    select json_build_object(
      'rls',coalesce((select relrowsecurity from pg_class where oid='public.dimpro_project_drop_settings'::regclass),false),
      'anonSelect',has_table_privilege('anon','public.dimpro_project_drop_settings','SELECT'),
      'authenticatedSelect',has_table_privilege('authenticated','public.dimpro_project_drop_settings','SELECT'),
      'serviceSelect',has_table_privilege('service_role','public.dimpro_project_drop_settings','SELECT'),
      'serviceInsert',has_table_privilege('service_role','public.dimpro_project_drop_settings','INSERT'),
      'serviceUpdate',has_table_privilege('service_role','public.dimpro_project_drop_settings','UPDATE'),
      'serviceDelete',has_table_privilege('service_role','public.dimpro_project_drop_settings','DELETE')
    )::text;`, "IDENTITY_V021_SECURITY_PROBE_INVALID");
}
function rpcSecurityProbe() {
  return jsonQuery(`
    select json_build_object(
      'anonExecute',has_function_privilege('anon','${bindRpcSignature}','EXECUTE'),
      'authenticatedExecute',has_function_privilege('authenticated','${bindRpcSignature}','EXECUTE'),
      'serviceExecute',has_function_privilege('service_role','${bindRpcSignature}','EXECUTE')
    )::text;`, "IDENTITY_V021_RPC_SECURITY_PROBE_INVALID");
}
function assertDevTarget(probe, identity) {
  if (identity.database !== db.database || identity.user !== db.role || Number(identity.serverPort) !== Number(db.port)) fail("IDENTITY_V021_DB_TARGET_MISMATCH", "Unexpected DEV database identity.", { identity });
  if (!probe.settingsTable || !probe.identityProjectTable || !probe.identityMembershipTable || !probe.projectCoreTable || !probe.projectCoreBridgeColumn) fail("IDENTITY_V021_REQUIRED_SCHEMA_MISSING", "Required Identity / Project Core bridge schema is missing.", { schema: probe });
  if (!probe.driveFolderTable || !probe.driveTextSentinel) fail("IDENTITY_V021_DEV_SENTINEL_MISSING", "Expected DEV Drive text-ID sentinel is missing; apply blocked.", { schema: probe });
}
function baselineReady(probe) { return probe.markerVersion === baseline.schemaVersion && Number(probe.migrationCount) === baseline.migrationCount && probe.bootstrapId === baseline.bootstrapId && probe.driveFolderType === baseline.driveFolderType && probe.bindRpc === false; }
function targetReady(probe) { return probe.markerVersion === target.schemaVersion && Number(probe.migrationCount) >= target.migrationCount && probe.bootstrapId === target.bootstrapId && probe.driveFolderType === target.driveFolderType && probe.bindRpc === true; }
function assertTableSecurityStable(before, after) {
  for (const key of Object.keys(before)) if (before[key] !== after[key]) fail("IDENTITY_V021_SECURITY_CHANGED", `Table security privilege changed: ${key}.`, { before, after });
  if (after.rls !== true || after.serviceSelect !== true || after.serviceInsert !== true || after.serviceUpdate !== true) fail("IDENTITY_V021_SECURITY_NOT_READY", "Identity Drop settings security is not ready.", { security: after });
}
function assertRpcSecurity(security) {
  if (security.anonExecute !== false || security.authenticatedExecute !== false || security.serviceExecute !== true) fail("IDENTITY_V021_RPC_SECURITY_NOT_READY", "Project binding RPC must remain service-role only.", { rpcSecurity: security });
}
function utcStamp() { return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }

if (!["preflight", "apply", "verify"].includes(mode)) fail("IDENTITY_V021_MODE_INVALID", "Usage: preflight | apply | verify");
requireCommand("psql"); requireCommand("pg_dump"); requireCommand("pg_restore");
const migrationSha256 = sha256File(migration);
if (migrationSha256 !== expectedMigrationSha256) fail("IDENTITY_V021_MIGRATION_SHA_MISMATCH", "Migration SHA-256 mismatch.", { migration: migrationRel, expectedMigrationSha256, actualMigrationSha256: migrationSha256 });
const before = schemaProbe();
const identity = currentDbIdentity();
assertDevTarget(before, identity);
const beforeSettings = settingsSnapshot();
const beforeTableSecurity = tableSecurityProbe();

if (mode === "preflight") {
  if (targetReady(before)) {
    const rpcSecurity = rpcSecurityProbe(); assertRpcSecurity(rpcSecurity);
    console.log(JSON.stringify({ ok: true, mode, alreadyApplied: true, migration: migrationRel, migrationSha256, schema: before, settings: beforeSettings, tableSecurity: beforeTableSecurity, rpcSecurity }, null, 2)); process.exit(0);
  }
  if (!baselineReady(before)) fail("IDENTITY_V021_BASELINE_MISMATCH", "Migration requires exact Identity Core 0.2.0 baseline.", { schema: before });
  console.log(JSON.stringify({ ok: true, mode, readyForApply: true, alreadyApplied: false, migration: migrationRel, migrationSha256, database: { projectRef: db.projectRef, database: identity.database, user: identity.user, port: identity.serverPort }, schema: before, settings: beforeSettings, tableSecurity: beforeTableSecurity, requiredApproval: approvalPhrase }, null, 2));
  process.exit(0);
}
if (mode === "verify") {
  if (!targetReady(before)) fail("IDENTITY_V021_TARGET_NOT_READY", "Identity Core 0.2.1 target schema is not active.", { schema: before });
  const rpcSecurity = rpcSecurityProbe(); assertRpcSecurity(rpcSecurity);
  console.log(JSON.stringify({ ok: true, mode, migration: migrationRel, migrationSha256, schema: before, settings: beforeSettings, tableSecurity: beforeTableSecurity, rpcSecurity }, null, 2));
  process.exit(0);
}
if (approval !== approvalPhrase) fail("IDENTITY_V021_APPROVAL_REQUIRED", "Explicit DEV-only approval is required for apply mode.", { requiredApproval: approvalPhrase });
if (targetReady(before)) {
  const rpcSecurity = rpcSecurityProbe(); assertRpcSecurity(rpcSecurity);
  console.log(JSON.stringify({ ok: true, mode, alreadyApplied: true, schema: before, settings: beforeSettings, tableSecurity: beforeTableSecurity, rpcSecurity }, null, 2)); process.exit(0);
}
if (!baselineReady(before)) fail("IDENTITY_V021_BASELINE_MISMATCH", "Migration requires exact Identity Core 0.2.0 baseline.", { schema: before });

const stamp = utcStamp();
const backupDir = join(backupRoot, stamp);
mkdirSync(backupDir, { recursive: true, mode: 0o700 }); chmodSync(backupDir, 0o700);
const backupFile = join(backupDir, "identity-project-drive-v021-before.dump");
const manifestFile = join(backupDir, "manifest.json");
const dumpArgs = ["-w", "-h", db.host, "-p", db.port, "-U", db.user, "-d", db.database, "-Fc", "-f", backupFile,
  "-t", "public.dimpro_identity_schema_meta", "-t", "public.dimpro_projects", "-t", "public.dimpro_project_memberships", "-t", "public.dimpro_project_drop_settings", "-t", "public.project_core_projects", "-t", "public.project_core_memberships"];
const dumped = run("pg_dump", dumpArgs);
if (!dumped.ok) fail("IDENTITY_V021_BACKUP_FAILED", "DEV backup failed; migration not applied.", { status: dumped.status });
const listed = run("pg_restore", ["-l", backupFile]);
if (!listed.ok || !listed.stdout.includes("dimpro_project_drop_settings")) fail("IDENTITY_V021_BACKUP_VERIFY_FAILED", "Backup archive verification failed.");
writeFileSync(manifestFile, JSON.stringify({ createdAt: new Date().toISOString(), projectRef: db.projectRef, migration: migrationRel, migrationSha256, beforeSchema: before, beforeSettings, beforeTableSecurity, backupFile }, null, 2) + "\n", { mode: 0o600 });
chmodSync(backupFile, 0o600); chmodSync(manifestFile, 0o600);
const applied = run("psql", psqlArgs(["-f", migration]));
if (!applied.ok) fail("IDENTITY_V021_APPLY_FAILED", "Migration apply failed after backup.", { backupDir, status: applied.status });
const after = schemaProbe();
const afterSettings = settingsSnapshot();
const afterTableSecurity = tableSecurityProbe();
if (!targetReady(after)) fail("IDENTITY_V021_POST_APPLY_SCHEMA_INVALID", "Target schema verification failed.", { backupDir, schema: after });
if (Number(afterSettings.count) !== Number(beforeSettings.count) || Number(afterSettings.nonNullDriveFolderCount) !== Number(beforeSettings.nonNullDriveFolderCount)) fail("IDENTITY_V021_DATA_COUNT_CHANGED", "Drop settings row counts changed unexpectedly.", { backupDir, before: beforeSettings, after: afterSettings });
assertTableSecurityStable(beforeTableSecurity, afterTableSecurity);
const afterRpcSecurity = rpcSecurityProbe(); assertRpcSecurity(afterRpcSecurity);
console.log(JSON.stringify({ ok: true, mode, applied: true, migration: migrationRel, migrationSha256, backupDir, schema: after, settings: afterSettings, tableSecurity: afterTableSecurity, rpcSecurity: afterRpcSecurity }, null, 2));
