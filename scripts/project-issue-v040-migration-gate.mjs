import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const mode = (process.argv[2] || "preflight").trim().toLowerCase();
const allowedModes = new Set(["preflight", "apply", "verify"]);

const migrationRel = "supabase/migrations/20260815190500_project_issue_core_v040.sql";
const migration = join(root, migrationRel);
const expectedMigrationSha256 = "7abd051a91c8cfc7450e7ad03670781bb2d08f4292255ff060dcfae1366ccffa";

const db = {
  host: "aws-0-eu-central-1.pooler.supabase.com",
  port: "5432",
  user: "postgres.pbgyuznivqvestuksvif",
  role: "postgres",
  database: "postgres",
  projectRef: "pbgyuznivqvestuksvif",
};

const approval = (process.env.PROJECT_ISSUE_V040_MIGRATION_APPROVED || "").trim();
const approvalPhrase = "DEV_ONLY_PROJECT_ISSUE_V040_APPLY_APPROVED";
const backupRoot = process.env.PROJECT_ISSUE_V040_BACKUP_ROOT?.trim()
  || "/srv/dimpro-dev/backups/project-issue-v040";

function fail(code, message, details = {}, exitCode = 2) {
  console.error(JSON.stringify({ ok: false, mode, code, message, ...details }, null, 2));
  process.exit(exitCode);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env },
    ...options,
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function requireCommand(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) fail("MIGRATION_TOOL_MISSING", `${command} nem érhető el.`);
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function psqlArgs(extra) {
  return [
    "-w",
    "-h", db.host,
    "-p", db.port,
    "-U", db.user,
    "-d", db.database,
    "-X",
    "-v", "ON_ERROR_STOP=1",
    ...extra,
  ];
}

function psqlQuery(query) {
  const result = run("psql", psqlArgs(["-Atc", query]));
  if (!result.ok) fail("PROJECT_ISSUE_V040_DB_QUERY_FAILED", "A V0.4 DEV schema probe sikertelen.", { status: result.status });
  return result.stdout;
}

function readJsonQuery(query, code) {
  const raw = psqlQuery(query);
  try {
    return JSON.parse(raw);
  } catch {
    fail(code, "A DEV schema probe eredménye nem értelmezhető JSON-ként.");
  }
}

function schemaProbe() {
  return readJsonQuery(`
    select json_build_object(
      'markerVersion', coalesce((select schema_version from public.project_issue_schema_meta where component='project-issue-core'), ''),
      'migrationCount', coalesce((select migration_count from public.project_issue_schema_meta where component='project-issue-core'), 0),
      'bootstrapId', coalesce((select bootstrap_id from public.project_issue_schema_meta where component='project-issue-core'), ''),
      'attachmentTable', to_regclass('public.project_issue_attachments') is not null,
      'linkRpc', to_regprocedure('public.project_issue_attachment_link_atomic(text,text,jsonb,text,text)') is not null,
      'unlinkRpc', to_regprocedure('public.project_issue_attachment_unlink_atomic(text,text,text,integer,text,text)') is not null,
      'qaProject', exists(select 1 from public.project_core_projects where id='project-drive-compare-rc1-qa'),
      'qaIssue1', exists(select 1 from public.project_core_issues where serial='HJ-00001' and deleted_at is null),
      'qaIssue2', exists(select 1 from public.project_core_issues where serial='HJ-00002' and deleted_at is null)
    )::text;
  `, "PROJECT_ISSUE_V040_SCHEMA_PROBE_INVALID");
}

function qaIssueSnapshot() {
  return readJsonQuery(`
    select coalesce(json_agg(row_to_json(x) order by x.serial), '[]'::json)::text
    from (
      select serial, source_type, severity, status, version, title, description, location,
             discipline, responsible_user_id, responsible_name, due_at, note
      from public.project_core_issues
      where serial in ('HJ-00001','HJ-00002') and deleted_at is null
      order by serial
    ) x;
  `, "PROJECT_ISSUE_V040_QA_SNAPSHOT_INVALID");
}

function securityProbe() {
  return readJsonQuery(`
    select json_build_object(
      'rls', coalesce((select relrowsecurity from pg_class where oid='public.project_issue_attachments'::regclass), false),
      'anonSelect', has_table_privilege('anon','public.project_issue_attachments','SELECT'),
      'authenticatedSelect', has_table_privilege('authenticated','public.project_issue_attachments','SELECT'),
      'serviceSelect', has_table_privilege('service_role','public.project_issue_attachments','SELECT'),
      'serviceInsert', has_table_privilege('service_role','public.project_issue_attachments','INSERT'),
      'serviceUpdate', has_table_privilege('service_role','public.project_issue_attachments','UPDATE'),
      'serviceDelete', has_table_privilege('service_role','public.project_issue_attachments','DELETE'),
      'anonLinkExecute', has_function_privilege('anon','public.project_issue_attachment_link_atomic(text,text,jsonb,text,text)','EXECUTE'),
      'authenticatedLinkExecute', has_function_privilege('authenticated','public.project_issue_attachment_link_atomic(text,text,jsonb,text,text)','EXECUTE'),
      'serviceLinkExecute', has_function_privilege('service_role','public.project_issue_attachment_link_atomic(text,text,jsonb,text,text)','EXECUTE'),
      'anonUnlinkExecute', has_function_privilege('anon','public.project_issue_attachment_unlink_atomic(text,text,text,integer,text,text)','EXECUTE'),
      'authenticatedUnlinkExecute', has_function_privilege('authenticated','public.project_issue_attachment_unlink_atomic(text,text,text,integer,text,text)','EXECUTE'),
      'serviceUnlinkExecute', has_function_privilege('service_role','public.project_issue_attachment_unlink_atomic(text,text,text,integer,text,text)','EXECUTE')
    )::text;
  `, "PROJECT_ISSUE_V040_SECURITY_PROBE_INVALID");
}

function currentDbIdentity() {
  return readJsonQuery(`
    select json_build_object(
      'database', current_database(),
      'user', current_user,
      'serverAddress', coalesce(inet_server_addr()::text,''),
      'serverPort', inet_server_port()
    )::text;
  `, "PROJECT_ISSUE_V040_DB_IDENTITY_INVALID");
}

function assertDevTarget(probe, identity) {
  if (identity.database !== db.database) fail("PROJECT_ISSUE_V040_DB_NAME_MISMATCH", "Nem a várt DEV adatbázis a cél.");
  if (identity.user !== db.role) fail("PROJECT_ISSUE_V040_DB_USER_MISMATCH", "Nem a várt DEV PostgreSQL role a cél.");
  if (Number(identity.serverPort) !== Number(db.port)) fail("PROJECT_ISSUE_V040_DB_PORT_MISMATCH", "Nem a várt DEV PostgreSQL port a cél.");
  if (!probe.qaProject || !probe.qaIssue1 || !probe.qaIssue2) {
    fail("PROJECT_ISSUE_V040_DEV_SENTINEL_MISSING", "A DEV QA sentinel projekt/HJ-k nem találhatók; apply tiltva.");
  }
}

function v030Ready(probe) {
  return probe.markerVersion === "0.3.0"
    && Number(probe.migrationCount) === 3
    && probe.bootstrapId === "project-issue-core-v030-20260815"
    && probe.attachmentTable === false
    && probe.linkRpc === false
    && probe.unlinkRpc === false;
}

function v040Ready(probe) {
  return probe.markerVersion === "0.4.0"
    && Number(probe.migrationCount) === 4
    && probe.bootstrapId === "project-issue-core-v040-20260815"
    && probe.attachmentTable === true
    && probe.linkRpc === true
    && probe.unlinkRpc === true;
}

function assertSecurityReady(security) {
  const ok = security.rls === true
    && security.anonSelect === false
    && security.authenticatedSelect === false
    && security.serviceSelect === true
    && security.serviceInsert === true
    && security.serviceUpdate === true
    && security.serviceDelete === true
    && security.anonLinkExecute === false
    && security.authenticatedLinkExecute === false
    && security.serviceLinkExecute === true
    && security.anonUnlinkExecute === false
    && security.authenticatedUnlinkExecute === false
    && security.serviceUnlinkExecute === true;
  if (!ok) fail("PROJECT_ISSUE_V040_SECURITY_NOT_READY", "A V0.4 RLS/grant acceptance nem teljes.", { security });
}

function utcStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

if (!allowedModes.has(mode)) fail("PROJECT_ISSUE_V040_MODE_INVALID", "Használat: preflight | apply | verify");

requireCommand("psql");
requireCommand("pg_dump");
requireCommand("pg_restore");

const migrationSha256 = sha256File(migration);
if (migrationSha256 !== expectedMigrationSha256) {
  fail("PROJECT_ISSUE_V040_MIGRATION_SHA_MISMATCH", "A V0.4 migráció SHA-256 ellenőrzése sikertelen.", {
    migration: migrationRel,
    expectedMigrationSha256,
    actualMigrationSha256: migrationSha256,
  });
}

const before = schemaProbe();
const identity = currentDbIdentity();
assertDevTarget(before, identity);
const beforeIssues = qaIssueSnapshot();

if (mode === "preflight") {
  if (v040Ready(before)) {
    const security = securityProbe();
    assertSecurityReady(security);
    console.log(JSON.stringify({
      ok: true,
      mode,
      alreadyApplied: true,
      migration: migrationRel,
      migrationSha256,
      database: { projectRef: db.projectRef, database: identity.database, user: identity.user, port: identity.serverPort },
      schema: before,
      security,
    }, null, 2));
    process.exit(0);
  }
  if (!v030Ready(before)) {
    fail("PROJECT_ISSUE_V040_PREFLIGHT_NOT_READY", "A V0.4 apply csak pontos Project Issue Core V0.3 baseline-ról engedett.", { schema: before });
  }
  console.log(JSON.stringify({
    ok: true,
    mode,
    readyForApply: true,
    alreadyApplied: false,
    migration: migrationRel,
    migrationSha256,
    database: { projectRef: db.projectRef, database: identity.database, user: identity.user, port: identity.serverPort },
    schema: before,
    qaIssueCount: beforeIssues.length,
    requiredApproval: approvalPhrase,
  }, null, 2));
  process.exit(0);
}

if (mode === "verify") {
  if (!v040Ready(before)) fail("PROJECT_ISSUE_V040_SCHEMA_NOT_READY", "A Project Issue Core V0.4 schema még nincs teljesen alkalmazva.", { schema: before });
  const security = securityProbe();
  assertSecurityReady(security);
  console.log(JSON.stringify({
    ok: true,
    mode,
    migration: migrationRel,
    migrationSha256,
    schema: before,
    security,
    qaIssueCount: beforeIssues.length,
  }, null, 2));
  process.exit(0);
}

if (approval !== approvalPhrase) {
  fail("PROJECT_ISSUE_V040_APPROVAL_REQUIRED", "A V0.4 apply módhoz explicit DEV-only approval szükséges.", { requiredApproval: approvalPhrase });
}

if (v040Ready(before)) {
  const security = securityProbe();
  assertSecurityReady(security);
  console.log(JSON.stringify({ ok: true, mode, alreadyApplied: true, migration: migrationRel, migrationSha256, schema: before, security }, null, 2));
  process.exit(0);
}

if (!v030Ready(before)) {
  fail("PROJECT_ISSUE_V040_BASELINE_MISMATCH", "A V0.4 migráció csak pontos V0.3 baseline-ról alkalmazható.", { schema: before });
}

const stamp = utcStamp();
const backupDir = join(backupRoot, stamp);
mkdirSync(backupDir, { recursive: true, mode: 0o700 });
const backupFile = join(backupDir, "supabase-dev-pre-project-issue-v040.dump");

const backup = run("pg_dump", [
  "-w",
  "-h", db.host,
  "-p", db.port,
  "-U", db.user,
  "-d", db.database,
  "--format=custom",
  "--no-owner",
  "--no-privileges",
  `--file=${backupFile}`,
]);
if (!backup.ok) fail("PROJECT_ISSUE_V040_BACKUP_FAILED", "A V0.4 előtti teljes DEV backup sikertelen.", { backupDir, status: backup.status });
chmodSync(backupFile, 0o600);

const listing = run("pg_restore", ["--list", backupFile]);
if (!listing.ok || !listing.stdout.includes("project_core_issues")) {
  fail("PROJECT_ISSUE_V040_BACKUP_VERIFY_FAILED", "A V0.4 előtti backup listing ellenőrzése sikertelen.", { backupDir });
}

const backupSha256 = sha256File(backupFile);
writeFileSync(join(backupDir, "backup.sha256"), `${backupSha256}  ${basename(backupFile)}\n`, { mode: 0o600 });
writeFileSync(join(backupDir, "migration.sha256"), `${migrationSha256}  ${basename(migration)}\n`, { mode: 0o600 });
writeFileSync(join(backupDir, "preflight.json"), JSON.stringify({ schema: before, qaIssues: beforeIssues }, null, 2) + "\n", { mode: 0o600 });

const apply = run("psql", psqlArgs(["-f", migration]));
if (!apply.ok) {
  fail("PROJECT_ISSUE_V040_MIGRATION_APPLY_FAILED", "A V0.4 migráció alkalmazása sikertelen; a backup megmaradt.", { backupDir, status: apply.status });
}

const after = schemaProbe();
if (!v040Ready(after)) fail("PROJECT_ISSUE_V040_POST_SCHEMA_FAILED", "A migráció lefutott, de a V0.4 schema acceptance nem teljes.", { backupDir, schema: after });

const security = securityProbe();
assertSecurityReady(security);

const afterIssues = qaIssueSnapshot();
assert.deepEqual(afterIssues, beforeIssues, "A QA HJ üzleti állapot a schema migráció során nem változhat.");

const report = {
  ok: true,
  mode,
  applied: true,
  migration: migrationRel,
  migrationSha256,
  database: { projectRef: db.projectRef, database: identity.database, user: identity.user, port: identity.serverPort },
  backup: { directory: backupDir, file: basename(backupFile), sha256: backupSha256, listingVerified: true },
  schemaBefore: before,
  schemaAfter: after,
  security,
  qaIssueCount: afterIssues.length,
  completedAt: new Date().toISOString(),
};
writeFileSync(join(backupDir, "migration-report.json"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
