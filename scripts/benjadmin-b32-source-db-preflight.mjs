import { spawnSync } from "node:child_process";

const expectedApiUrl = (process.env.BENJADMIN_EXPECTED_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const dbUrl = (process.env.SUPABASE_DB_URL || "").trim();
const dbPassword = (process.env.SUPABASE_DB_PASSWORD || "").trim();
const prodApiUrl = (process.env.BENJADMIN_PROD_SUPABASE_URL || "").trim();

function projectRef(value) {
  if (!value) return "";
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (!host.endsWith(".supabase.co")) return "";
    const first = host.split(".")[0];
    if (first === "db") return host.split(".")[1] || "";
    return first;
  } catch {
    return "";
  }
}

function fail(code, message, details = {}) {
  console.error(JSON.stringify({ ok: false, readyForApply: false, code, message, ...details }, null, 2));
  process.exit(2);
}

function commandAvailable(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return !result.error && result.status === 0;
}

const expectedRef = projectRef(expectedApiUrl);
const dbRef = projectRef(dbUrl);
const prodRef = projectRef(prodApiUrl);

if (!expectedApiUrl || !expectedRef) {
  fail("SOURCE_DB_EXPECTED_TARGET_MISSING", "A DEV Supabase API target nincs biztonságosan azonosítva.");
}
if (!dbUrl || !dbPassword || !dbRef) {
  fail("SOURCE_DB_CREDENTIAL_MISSING", "A source-of-truth PostgreSQL kapcsolat vagy jelszó hiányzik.", { expectedTargetIdentified: true });
}
if (dbRef !== expectedRef) {
  fail("SOURCE_DB_TARGET_MISMATCH", "A rendelkezésre álló DB kapcsolat nem a jelenlegi DEV Supabase projektre mutat. Migráció tiltva.", {
    expectedTargetIdentified: true,
    databaseTargetIdentified: true,
    targetMatches: false,
  });
}
if (!prodApiUrl || !prodRef) {
  fail("SOURCE_DB_PROD_TARGET_UNKNOWN", "A PROD Supabase target nincs megadva, ezért nem igazolható, hogy a DEV DB fizikailag elkülönül a PROD-tól. Migráció tiltva.", {
    targetMatches: true,
  });
}
if (prodRef === expectedRef) {
  fail("SOURCE_DB_SHARED_WITH_PROD", "A DEV és PROD ugyanarra a Supabase projektre mutat. A PROD READ ONLY szabály miatt migráció tiltva explicit PROD schema approval nélkül.", {
    targetMatches: true,
    sharedWithProduction: true,
  });
}
if (!commandAvailable("psql") || !commandAvailable("pg_dump")) {
  fail("SOURCE_DB_TOOLING_MISSING", "A psql és pg_dump eszközök kötelezők a preflight/backup folyamathoz.", { targetMatches: true });
}

const query = `
with required(name) as (
  values
    ('dev_center_projects'),
    ('dev_center_workers'),
    ('dev_center_environments'),
    ('dev_center_releases'),
    ('dev_center_infra_assets'),
    ('dev_center_schema_meta'),
    ('dev_center_audit_events')
), presence as (
  select r.name, to_regclass('public.' || r.name) is not null as present
  from required r
)
select json_build_object(
  'required_tables_present', bool_and(present),
  'required_count', count(*),
  'present_count', count(*) filter (where present),
  'generic_schema_version', coalesce((select schema_version from public.dev_center_schema_meta where component='development-center' limit 1), ''),
  'generic_bootstrap_id', coalesce((select bootstrap_id from public.dev_center_schema_meta where component='development-center' limit 1), '')
)::text
from presence;
`;

const probe = spawnSync("psql", [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-Atc", query], {
  env: { ...process.env, PGPASSWORD: dbPassword },
  encoding: "utf8",
});
if (probe.error || probe.status !== 0) {
  fail("SOURCE_DB_PROBE_FAILED", "A source-of-truth DB read-only preflight lekérdezése sikertelen.", { targetMatches: true });
}

let database = {};
try {
  database = JSON.parse((probe.stdout || "").trim());
} catch {
  fail("SOURCE_DB_PROBE_INVALID", "A source-of-truth DB preflight eredménye nem értelmezhető.", { targetMatches: true });
}

if (database.required_tables_present !== true) {
  fail("SOURCE_DB_PREREQUISITES_MISSING", "A B3/B3.1 generikus prerequisite táblák nem teljesek a céladatbázison.", {
    targetMatches: true,
    database,
  });
}

console.log(JSON.stringify({
  ok: true,
  readyForApply: true,
  targetMatches: true,
  sharedWithProduction: false,
  tooling: { psql: true, pgDump: true },
  database,
  next: "Create encrypted source-of-truth backup, verify restore/listing, then run staged migration with an explicit migration gate.",
}, null, 2));
