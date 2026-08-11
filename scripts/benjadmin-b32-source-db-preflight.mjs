import { spawnSync } from "node:child_process";

const expectedApiUrl = (process.env.BENJADMIN_EXPECTED_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const dbUrl = (process.env.SUPABASE_DB_URL || "").trim();
const dbPassword = (process.env.SUPABASE_DB_PASSWORD || "").trim();
const prodApiUrl = (process.env.BENJADMIN_PROD_SUPABASE_URL || "").trim();

const REQUIRED_TABLES = [
  "dev_center_projects",
  "dev_center_workers",
  "dev_center_environments",
  "dev_center_releases",
  "dev_center_infra_assets",
  "dev_center_schema_meta",
  "dev_center_audit_events",
];

function projectRef(value) {
  if (!value) return "";
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (!host.endsWith(".supabase.co")) return "";
    const parts = host.split(".");
    return parts[0] === "db" ? parts[1] || "" : parts[0] || "";
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

function runReadOnlyQuery(query) {
  const result = spawnSync("psql", [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-Atc", query], {
    env: { ...process.env, PGPASSWORD: dbPassword },
    encoding: "utf8",
  });
  return {
    ok: !result.error && result.status === 0,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
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

const presenceValues = REQUIRED_TABLES.map((name) => `('${name}')`).join(",");
const presenceQuery = `
with required(name) as (values ${presenceValues})
select json_build_object(
  'required_tables_present', bool_and(to_regclass('public.' || name) is not null),
  'required_count', count(*),
  'present_count', count(*) filter (where to_regclass('public.' || name) is not null),
  'missing_tables', coalesce(json_agg(name order by name) filter (where to_regclass('public.' || name) is null), '[]'::json)
)::text
from required;
`;

const presenceProbe = runReadOnlyQuery(presenceQuery);
if (!presenceProbe.ok) {
  fail("SOURCE_DB_PROBE_FAILED", "A source-of-truth DB prerequisite jelenlétvizsgálata sikertelen.", {
    targetMatches: true,
    probeStage: "table_presence",
  });
}

let presence = {};
try {
  presence = JSON.parse(presenceProbe.stdout);
} catch {
  fail("SOURCE_DB_PROBE_INVALID", "A source-of-truth DB prerequisite jelenlétvizsgálat eredménye nem értelmezhető.", {
    targetMatches: true,
    probeStage: "table_presence",
  });
}

if (presence.required_tables_present !== true) {
  fail("SOURCE_DB_PREREQUISITES_MISSING", "A B3/B3.1 generikus prerequisite táblák nem teljesek a céladatbázison.", {
    targetMatches: true,
    database: presence,
  });
}

const markerProbe = runReadOnlyQuery(`
select json_build_object(
  'schema_version', schema_version,
  'migration_count', migration_count,
  'bootstrap_id', bootstrap_id
)::text
from public.dev_center_schema_meta
where component = 'dev-center-engine'
limit 1;
`);
if (!markerProbe.ok) {
  fail("SOURCE_DB_MARKER_PROBE_FAILED", "A Development Center schema marker nem olvasható.", {
    targetMatches: true,
    database: presence,
  });
}
if (!markerProbe.stdout) {
  fail("SOURCE_DB_ENGINE_MARKER_MISSING", "A dev-center-engine schema marker hiányzik a céladatbázisból.", {
    targetMatches: true,
    database: presence,
  });
}

let marker = {};
try {
  marker = JSON.parse(markerProbe.stdout);
} catch {
  fail("SOURCE_DB_MARKER_INVALID", "A Development Center schema marker nem értelmezhető.", {
    targetMatches: true,
    database: presence,
  });
}

const partnerProbe = runReadOnlyQuery(`
select json_build_object(
  'partner_projects_table', to_regclass('public.dev_center_partner_projects') is not null,
  'partner_schema_marker', case
    when to_regclass('public.dev_center_schema_meta') is null then false
    else exists (
      select 1 from public.dev_center_schema_meta
      where component = 'partner-development-plane' and schema_version = '0.1.0'
    )
  end
)::text;
`);
if (!partnerProbe.ok) {
  fail("SOURCE_DB_PARTNER_PROBE_FAILED", "A Partner Development Plane readiness probe sikertelen.", {
    targetMatches: true,
    database: { ...presence, marker },
  });
}

let partner = {};
try {
  partner = JSON.parse(partnerProbe.stdout);
} catch {
  fail("SOURCE_DB_PARTNER_PROBE_INVALID", "A Partner Development Plane readiness eredménye nem értelmezhető.", {
    targetMatches: true,
    database: { ...presence, marker },
  });
}

console.log(JSON.stringify({
  ok: true,
  readyForApply: true,
  targetMatches: true,
  sharedWithProduction: false,
  tooling: { psql: true, pgDump: true },
  database: {
    ...presence,
    generic_schema_version: marker.schema_version || "",
    generic_migration_count: marker.migration_count ?? null,
    generic_bootstrap_id: marker.bootstrap_id || "",
    partner_projects_table: partner.partner_projects_table === true,
    partner_schema_marker: partner.partner_schema_marker === true,
  },
  next: partner.partner_projects_table === true && partner.partner_schema_marker === true
    ? "Partner schema already present; run post-migration acceptance instead of applying again."
    : "Create encrypted source-of-truth backup, verify restore/listing, then run staged migration with an explicit migration gate.",
}, null, 2));
