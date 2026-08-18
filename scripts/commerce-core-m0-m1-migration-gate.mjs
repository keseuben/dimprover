#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const mode = (process.argv[2] || "preflight").trim().toLowerCase();
const allowedModes = new Set(["preflight", "rollback-test", "apply", "verify"]);
const migrationRel = "supabase/migrations/20260818183000_dimpro_commerce_core_m0_m1.sql";
const migration = join(root, migrationRel);
const expectedSha = "7ffb80339d3d129da59acbb85fcf4c8957940efcb067fddf36953935b453a367";
const approvalPhrase = "DEV_ONLY_COMMERCE_CORE_M0_M1_APPLY_APPROVED";
const approval = (process.env.COMMERCE_CORE_M0_M1_MIGRATION_APPROVED || "").trim();
const backupRoot = process.env.COMMERCE_CORE_M0_M1_BACKUP_ROOT?.trim() || "/srv/dimpro-dev/backups/commerce-core-m0-m1";
const db = {
  host: "aws-0-eu-central-1.pooler.supabase.com",
  port: "5432",
  database: "postgres",
  user: "postgres.pbgyuznivqvestuksvif",
  role: "postgres",
  projectRef: "pbgyuznivqvestuksvif",
};
const tables = [
  "commerce_schema_meta","commerce_storefronts","commerce_warehouses","commerce_categories","commerce_brands","commerce_manufacturers",
  "commerce_products","commerce_product_variants","commerce_product_identifiers","commerce_prices","commerce_media_assets","commerce_media_links",
  "commerce_inventory_sources","commerce_external_inventory_snapshots","commerce_inventory_balances","commerce_stock_movements","commerce_audit_events","commerce_outbox_events",
];

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
  if (result.error || result.status !== 0) fail("COMMERCE_MIGRATION_TOOL_MISSING", `${command} nem érhető el.`);
}
function sha(file) { return createHash("sha256").update(readFileSync(file)).digest("hex"); }
function psqlArgs(extra = []) { return ["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra]; }
function query(sql) {
  const result = run("psql", psqlArgs(["-Atc", sql]));
  if (!result.ok) fail("COMMERCE_DB_QUERY_FAILED", "A Commerce DEV schema probe sikertelen.", { status: result.status });
  return result.stdout;
}
function jsonQuery(sql, code) {
  try { return JSON.parse(query(sql)); }
  catch { fail(code, "A Commerce DEV schema probe invalid JSON eredményt adott."); }
}
function pgpassReady() {
  const file = "/root/.pgpass";
  let st; try { st = statSync(file); } catch { fail("COMMERCE_PGPASS_MISSING", "A root-only DEV .pgpass hiányzik."); }
  if ((st.mode & 0o777) !== 0o600) fail("COMMERCE_PGPASS_MODE", "A /root/.pgpass jogosultsága nem 0600.");
  const lines = readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  const ok = lines.some((line) => {
    const p = line.split(":");
    return p.length >= 5 && p[0] === db.host && p[1] === db.port && p[2] === db.database && p[3] === db.user && Boolean(p.slice(4).join(":"));
  });
  if (!ok) fail("COMMERCE_PGPASS_TARGET_MISSING", "A .pgpass nem tartalmazza a rögzített DEV Supabase célt.");
}
function identity() {
  return jsonQuery(`select json_build_object('database',current_database(),'user',current_user,'port',inet_server_port())::text;`, "COMMERCE_DB_IDENTITY_INVALID");
}
function probe() {
  const tablePairs = tables.map((t) => `'${t}',to_regclass('public.${t}') is not null`).join(",");
  return jsonQuery(`select json_build_object(
    ${tablePairs},
    'identitySentinel',to_regclass('public.dimpro_organizations') is not null,
    'membershipSentinel',to_regclass('public.dimpro_organization_memberships') is not null,
    'identityFunction',to_regprocedure('public.dimpro_is_organization_member(uuid)') is not null,
    'updatedAtFunction',to_regprocedure('public.dimpro_set_updated_at()') is not null,
    'productRpc',to_regprocedure('public.commerce_product_create_atomic(uuid,text,text,text,text,uuid,uuid,uuid,text,jsonb,jsonb)') is not null,
    'inventoryRpc',to_regprocedure('public.commerce_inventory_apply_movement(uuid,uuid,uuid,text,text,numeric,numeric,numeric,text,text,uuid,timestamptz)') is not null
  )::text;`, "COMMERCE_SCHEMA_PROBE_INVALID");
}
function cleanBaseline(p) { return tables.every((t) => p[t] === false) && !p.productRpc && !p.inventoryRpc; }
function targetReady(p) { return tables.every((t) => p[t] === true) && p.productRpc && p.inventoryRpc; }
function assertDev(p, id) {
  if (id.database !== db.database || id.user !== db.role || Number(id.port) !== 5432) fail("COMMERCE_DB_TARGET_MISMATCH", "Nem a rögzített DEV PostgreSQL cél aktív.", { database: id.database, user: id.user, port: id.port });
  if (!p.identitySentinel || !p.membershipSentinel || !p.identityFunction || !p.updatedAtFunction) fail("COMMERCE_DEV_SENTINEL_MISSING", "A DIMPRO Identity Core DEV sentinel hiányzik; migráció tiltva.", { probe: p });
}
function marker() {
  return jsonQuery(`select coalesce((select json_build_object('version',schema_version,'count',migration_count,'bootstrap',bootstrap_id) from public.commerce_schema_meta where component='commerce-core'),'{}'::json)::text;`, "COMMERCE_MARKER_INVALID");
}
function security() {
  const rows = tables.map((t) => `select '${t}' table_name,
    coalesce((select relrowsecurity from pg_class where oid='public.${t}'::regclass),false) rls,
    has_table_privilege('anon','public.${t}','SELECT') anon_select,
    has_table_privilege('authenticated','public.${t}','SELECT') auth_select,
    has_table_privilege('service_role','public.${t}','SELECT') service_select`).join(" union all ");
  return jsonQuery(`select coalesce(json_agg(row_to_json(x) order by table_name),'[]'::json)::text from (${rows}) x;`, "COMMERCE_SECURITY_INVALID");
}
function assertSecurity(rows) {
  for (const row of rows) {
    if (!row.rls || row.anon_select || row.auth_select || !row.service_select) fail("COMMERCE_SECURITY_NOT_READY", "A Commerce server-only table security acceptance nem teljes.", { table: row.table_name, security: row });
  }
  const fn = jsonQuery(`select json_build_object(
    'anonProduct',has_function_privilege('anon','public.commerce_product_create_atomic(uuid,text,text,text,text,uuid,uuid,uuid,text,jsonb,jsonb)','EXECUTE'),
    'authProduct',has_function_privilege('authenticated','public.commerce_product_create_atomic(uuid,text,text,text,text,uuid,uuid,uuid,text,jsonb,jsonb)','EXECUTE'),
    'serviceProduct',has_function_privilege('service_role','public.commerce_product_create_atomic(uuid,text,text,text,text,uuid,uuid,uuid,text,jsonb,jsonb)','EXECUTE'),
    'anonInventory',has_function_privilege('anon','public.commerce_inventory_apply_movement(uuid,uuid,uuid,text,text,numeric,numeric,numeric,text,text,uuid,timestamptz)','EXECUTE'),
    'authInventory',has_function_privilege('authenticated','public.commerce_inventory_apply_movement(uuid,uuid,uuid,text,text,numeric,numeric,numeric,text,text,uuid,timestamptz)','EXECUTE'),
    'serviceInventory',has_function_privilege('service_role','public.commerce_inventory_apply_movement(uuid,uuid,uuid,text,text,numeric,numeric,numeric,text,text,uuid,timestamptz)','EXECUTE')
  )::text;`, "COMMERCE_FUNCTION_SECURITY_INVALID");
  if (fn.anonProduct || fn.authProduct || !fn.serviceProduct || fn.anonInventory || fn.authInventory || !fn.serviceInventory) fail("COMMERCE_FUNCTION_SECURITY_NOT_READY", "A Commerce RPC EXECUTE jogosultságok hibásak.", { functions: fn });
}
function assertMarker() {
  const m = marker();
  if (m.version !== "0.1.0" || Number(m.count) !== 1 || m.bootstrap !== "commerce-core-m0-m1-20260818") fail("COMMERCE_MARKER_NOT_READY", "A Commerce schema marker hibás.", { marker: m });
  return m;
}
function stamp() { return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }

if (!allowedModes.has(mode)) fail("COMMERCE_MIGRATION_MODE_INVALID", "Használat: preflight | rollback-test | apply | verify");
for (const tool of ["psql","pg_dump","pg_restore"]) requireCommand(tool);
pgpassReady();
const actualSha = sha(migration);
if (actualSha !== expectedSha) fail("COMMERCE_MIGRATION_SHA_MISMATCH", "A Commerce migráció SHA-256 eltér.", { expectedSha, actualSha });
const before = probe();
const id = identity();
assertDev(before, id);

if (mode === "preflight") {
  if (targetReady(before)) { const m = assertMarker(); const s = security(); assertSecurity(s); console.log(JSON.stringify({ ok:true, mode, alreadyApplied:true, marker:m, security:s }, null, 2)); process.exit(0); }
  if (!cleanBaseline(before)) fail("COMMERCE_PARTIAL_SCHEMA", "Részleges Commerce schema található; automatikus apply tiltva.", { schema: before });
  console.log(JSON.stringify({ ok:true, mode, readyForRollbackTest:true, readyForApply:true, migration:migrationRel, migrationSha256:actualSha, database:{ projectRef:db.projectRef, database:id.database, user:id.user, port:id.port }, requiredApproval:approvalPhrase }, null, 2));
  process.exit(0);
}
if (mode === "verify") {
  if (!targetReady(before)) fail("COMMERCE_TARGET_NOT_READY", "A Commerce schema még nincs teljesen alkalmazva.", { schema: before });
  const m = assertMarker(); const s = security(); assertSecurity(s); console.log(JSON.stringify({ ok:true, mode, marker:m, security:s }, null, 2)); process.exit(0);
}
if (mode === "rollback-test") {
  if (!cleanBaseline(before)) fail("COMMERCE_ROLLBACK_BASELINE", "Rollback-test csak tiszta Commerce baseline-on futtatható.", { schema: before });
  const script = `begin;\n\\i ${migration}\nselect count(*) from public.commerce_schema_meta where component='commerce-core';\nrollback;\n`;
  const result = run("psql", psqlArgs([]), { input: script });
  if (!result.ok) fail("COMMERCE_ROLLBACK_TEST_FAILED", "A Commerce tranzakciós rollback-próba sikertelen.", { status: result.status, stderr: result.stderr.slice(-1500) });
  const after = probe();
  if (!cleanBaseline(after)) fail("COMMERCE_ROLLBACK_DIRTY", "Rollback után Commerce objektum maradt.", { schema: after });
  console.log(JSON.stringify({ ok:true, mode, rolledBack:true, schemaAfter:after }, null, 2)); process.exit(0);
}
if (approval !== approvalPhrase) fail("COMMERCE_APPROVAL_REQUIRED", "Az apply módhoz explicit DEV-only approval szükséges.", { requiredApproval: approvalPhrase });
if (targetReady(before)) { const m = assertMarker(); const s = security(); assertSecurity(s); console.log(JSON.stringify({ ok:true, mode, alreadyApplied:true, marker:m, security:s }, null, 2)); process.exit(0); }
if (!cleanBaseline(before)) fail("COMMERCE_BASELINE_MISMATCH", "Apply csak tiszta Commerce baseline-ról engedett.", { schema: before });

const dir = join(backupRoot, stamp());
mkdirSync(dir, { recursive:true, mode:0o700 });
const dump = join(dir, "supabase-dev-pre-commerce-core-m0-m1.dump");
const backup = run("pg_dump", ["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"--format=custom","--no-owner","--no-privileges",`--file=${dump}`]);
if (!backup.ok) fail("COMMERCE_BACKUP_FAILED", "A teljes DEV backup sikertelen; migráció nem futott.", { status: backup.status, backupDir: dir });
chmodSync(dump, 0o600);
const listing = run("pg_restore", ["--list", dump]);
if (!listing.ok || !listing.stdout.includes("dimpro_organizations") || !listing.stdout.includes("field_capture_sessions")) fail("COMMERCE_BACKUP_VERIFY_FAILED", "A DEV backup listing ellenőrzése sikertelen.", { backupDir: dir });
const dumpSha = sha(dump);
writeFileSync(join(dir, "backup.sha256"), `${dumpSha}  ${basename(dump)}\n`, { mode:0o600 });
writeFileSync(join(dir, "migration.sha256"), `${actualSha}  ${basename(migration)}\n`, { mode:0o600 });
const apply = run("psql", psqlArgs(["-1","-f",migration]));
if (!apply.ok) fail("COMMERCE_APPLY_FAILED", "A Commerce migráció sikertelen; backup megmaradt.", { status: apply.status, backupDir: dir, stderr: apply.stderr.slice(-1500) });
const after = probe();
if (!targetReady(after)) fail("COMMERCE_POST_SCHEMA_FAILED", "Apply után a Commerce schema nem teljes.", { schema: after, backupDir: dir });
const m = assertMarker(); const s = security(); assertSecurity(s);
const report = { ok:true, mode, applied:true, migration:migrationRel, migrationSha256:actualSha, backup:{ directory:dir, file:basename(dump), sha256:dumpSha, listingVerified:true }, marker:m, security:s, completedAt:new Date().toISOString() };
writeFileSync(join(dir, "migration-report.json"), JSON.stringify(report,null,2)+"\n", { mode:0o600 });
console.log(JSON.stringify(report,null,2));
