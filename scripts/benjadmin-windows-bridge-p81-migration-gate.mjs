import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const mode = (process.argv[2] || "preflight").trim().toLowerCase();
const allowedModes = new Set(["preflight", "apply", "verify"]);
const migrationRel = "supabase/migrations/20260814230000_benjadmin_windows_bridge_p81.sql";
const sidecarRel = `${migrationRel}.sha256`;
const migration = join(root, migrationRel);
const sidecar = join(root, sidecarRel);
const dbUrl = (process.env.SUPABASE_DB_URL || "").trim();
const dbPassword = (process.env.SUPABASE_DB_PASSWORD || "").trim();
const approval = (process.env.BENJADMIN_WINDOWS_BRIDGE_P81_MIGRATION_APPROVED || "").trim();
const approvalPhrase = "DEV_ONLY_P81_APPLY_APPROVED";
const backupRoot = process.env.BENJADMIN_WINDOWS_BRIDGE_P81_BACKUP_ROOT?.trim() || "/srv/dimpro-dev/backups/benjadmin-windows-bridge-p81-db";

function fail(code, message, details = {}, exitCode = 2) {
  console.error(JSON.stringify({ ok: false, mode, code, message, ...details }, null, 2));
  process.exit(exitCode);
}
function safeRun(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env, PGPASSWORD: dbPassword }, encoding: "utf8", ...options });
  return { ok: !result.error && result.status === 0, status: result.status, stdout: (result.stdout || "").trim(), stderr: (result.stderr || "").trim() };
}
function requireCommand(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) fail("MIGRATION_TOOL_MISSING", `${command} nem érhető el.`);
}
function sha256File(file) { return createHash("sha256").update(readFileSync(file)).digest("hex"); }
function assertFlagsOff() {
  const names = ["BENJADMIN_WINDOWS_BRIDGE_ENABLED", "BENJADMIN_WINDOWS_BRIDGE_PAIRING_ENABLED", "BENJADMIN_WINDOWS_BRIDGE_EXECUTION_ENABLED", "BENJADMIN_TERMINAL_EXECUTION_ENABLED", "BENJADMIN_PROD_TERMINAL_ENABLED"];
  const unsafe = names.filter((name) => ["1", "true", "yes", "on", "enabled"].includes((process.env[name] || "").trim().toLowerCase()));
  if (unsafe.length) fail("MIGRATION_RUNTIME_FLAGS_NOT_OFF", "A P8.1 DB migráció csak lekapcsolt Bridge/Pairing/Execution/PROD állapotban futtatható.", { unsafeFlags: unsafe });
}
function verifyMigrationHash() {
  const expected = readFileSync(sidecar, "utf8").trim().split(/\s+/)[0];
  const actual = sha256File(migration);
  if (!/^[0-9a-f]{64}$/.test(expected) || expected !== actual) fail("MIGRATION_SHA256_MISMATCH", "A P8.1 migráció SHA-256 ellenőrzése sikertelen.", { migration: migrationRel });
  return actual;
}
function runTargetPreflight() {
  const result = safeRun(process.execPath, ["scripts/benjadmin-b32-source-db-preflight.mjs"]);
  if (!result.ok) {
    let payload = null;
    try { payload = JSON.parse(result.stderr || result.stdout); } catch {}
    fail(payload?.code || "SOURCE_DB_PREFLIGHT_FAILED", payload?.message || "A DEV source-of-truth DB preflight sikertelen.", { preflight: payload ? { readyForApply: payload.readyForApply, targetMatches: payload.targetMatches, sharedWithProduction: payload.sharedWithProduction } : null });
  }
  let payload;
  try { payload = JSON.parse(result.stdout); } catch { fail("SOURCE_DB_PREFLIGHT_INVALID", "A DEV DB preflight eredménye nem értelmezhető."); }
  if (payload?.readyForApply !== true || payload?.targetMatches !== true || payload?.sharedWithProduction !== false) fail("SOURCE_DB_PREFLIGHT_NOT_READY", "A DEV DB preflight nem adott biztonságos migrációs engedélyt.");
  return payload;
}
function schemaProbe() {
  const query = `select json_build_object(
    'devices', to_regclass('public.dev_center_windows_bridge_devices') is not null,
    'pairings', to_regclass('public.dev_center_windows_bridge_pairings') is not null,
    'sessions', to_regclass('public.dev_center_windows_bridge_sessions') is not null,
    'activate_function', to_regprocedure('public.dev_center_windows_bridge_activate_device(uuid,uuid,text,text,uuid)') is not null,
    'schema_marker', exists(select 1 from public.dev_center_control_schema_meta where component='benjadmin-windows-bridge' and schema_version='0.1.0')
  )::text;`;
  const result = safeRun("psql", [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-Atc", query]);
  if (!result.ok) fail("P81_SCHEMA_PROBE_FAILED", "A P8.1 schema probe sikertelen.");
  try { return JSON.parse(result.stdout); } catch { fail("P81_SCHEMA_PROBE_INVALID", "A P8.1 schema probe eredménye nem értelmezhető."); }
}
function schemaReady(probe) { return Boolean(probe?.devices && probe?.pairings && probe?.sessions && probe?.activate_function && probe?.schema_marker); }
function utcStamp() { return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }

if (!allowedModes.has(mode)) fail("MIGRATION_MODE_INVALID", "Használat: preflight | apply | verify");
assertFlagsOff();
const migrationSha256 = verifyMigrationHash();
requireCommand("psql"); requireCommand("pg_dump"); requireCommand("pg_restore");
const preflight = runTargetPreflight();
if (!dbUrl || !dbPassword) fail("SOURCE_DB_CREDENTIAL_MISSING", "A DB kapcsolat hiányzik a P8.1 migration gate számára.");
const before = schemaProbe();

if (mode === "preflight") {
  console.log(JSON.stringify({ ok: true, mode, readyForApply: !schemaReady(before), alreadyApplied: schemaReady(before), migration: migrationRel, migrationSha256, database: { targetMatches: true, sharedWithProduction: false }, schema: before, requiredApproval: approvalPhrase }, null, 2));
  process.exit(0);
}
if (mode === "verify") {
  if (!schemaReady(before)) fail("P81_SCHEMA_NOT_READY", "A P8.1 schema még nincs teljesen alkalmazva.", { schema: before });
  console.log(JSON.stringify({ ok: true, mode, migration: migrationRel, migrationSha256, schema: before }, null, 2));
  process.exit(0);
}
if (approval !== approvalPhrase) fail("MIGRATION_APPROVAL_REQUIRED", "Az apply módhoz explicit DEV-only approval szükséges.", { requiredApproval: approvalPhrase });
if (schemaReady(before)) {
  console.log(JSON.stringify({ ok: true, mode, alreadyApplied: true, migration: migrationRel, migrationSha256, schema: before }, null, 2));
  process.exit(0);
}

const stamp = utcStamp();
const backupDir = join(backupRoot, stamp);
mkdirSync(backupDir, { recursive: true, mode: 0o700 });
const backupFile = join(backupDir, "dev-center-before-p81.dump");
const backup = safeRun("pg_dump", [dbUrl, "--format=custom", "--no-owner", "--no-privileges", "--table=public.dev_center_*", `--file=${backupFile}`]);
if (!backup.ok) fail("P81_BACKUP_FAILED", "A dev_center_* source-of-truth backup sikertelen.", { backupDir });
const listing = safeRun("pg_restore", ["--list", backupFile]);
if (!listing.ok || !listing.stdout.includes("dev_center_")) fail("P81_BACKUP_VERIFY_FAILED", "A P8.1 előtti backup visszaolvashatósági/listing ellenőrzése sikertelen.", { backupDir });
const backupSha256 = sha256File(backupFile);
writeFileSync(join(backupDir, "backup.sha256"), `${backupSha256}  ${basename(backupFile)}\n`, { mode: 0o600 });

const apply = safeRun("psql", [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-f", migration]);
if (!apply.ok) fail("P81_MIGRATION_APPLY_FAILED", "A P8.1 migráció alkalmazása sikertelen; a backup megmaradt.", { backupDir });
const after = schemaProbe();
if (!schemaReady(after)) fail("P81_POST_MIGRATION_VERIFY_FAILED", "A P8.1 migráció lefutott, de a schema acceptance nem teljes.", { backupDir, schema: after });
const report = { ok: true, mode, applied: true, migration: migrationRel, migrationSha256, backup: { directory: backupDir, file: basename(backupFile), sha256: backupSha256, listingVerified: true }, preflight: { targetMatches: preflight.targetMatches, sharedWithProduction: preflight.sharedWithProduction }, schema: after, completedAt: new Date().toISOString() };
writeFileSync(join(backupDir, "migration-report.json"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
