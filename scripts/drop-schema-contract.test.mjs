import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const bootstrap = readFileSync("supabase/DIMPRO_DROP_020_SUPABASE_BOOTSTRAP.sql", "utf8");
const contract = readFileSync("app/lib/drop/dropSchemaContract.ts", "utf8");
const repository = readFileSync("app/lib/drop/dropRepository.ts", "utf8");
const proxy = readFileSync("proxy.ts", "utf8");
const nginx = readFileSync("/etc/nginx/sites-available/drop.dimpro.hu", "utf8");

assert.match(bootstrap, /^\s*begin;/i, "A bootstrapnak explicit tranzakcióval kell indulnia.");
assert.match(bootstrap, /commit;\s*$/i, "A bootstrapnak explicit COMMIT utasítással kell zárulnia.");

const requiredTables = [
  "drop_packages",
  "drop_recipients",
  "drop_groups",
  "drop_access_tokens",
  "drop_access_attempts",
  "drop_events",
  "drop_schema_meta",
];

for (const table of requiredTables) {
  assert.match(contract, new RegExp(`\\b${table}\\b`), `${table} hiányzik a sémaszerződésből.`);
  assert.match(bootstrap, new RegExp(`create table if not exists public\\.${table}\\b`, "i"), `${table} hiányzik a bootstrap SQL-ből.`);
  assert.match(bootstrap, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `${table} RLS aktiválása hiányzik.`);
}

const requiredColumns = {
  drop_packages: ["public_code", "access_policy", "expires_at", "grace_expires_at", "pin_hash", "pin_salt"],
  drop_access_tokens: ["purpose", "token_hash", "token_hint", "status", "expires_at", "use_count"],
  drop_access_attempts: ["attempt_type", "purpose", "ip_hash", "token_fingerprint", "success", "failure_code"],
  drop_events: ["event_type", "severity", "ip_hash", "payload", "created_at"],
  drop_schema_meta: ["component", "schema_version", "migration_count", "bootstrap_id"],
};

for (const [table, columns] of Object.entries(requiredColumns)) {
  const tableMatch = bootstrap.match(new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`, "i"));
  assert.ok(tableMatch, `${table} definíciója nem olvasható.`);
  for (const column of columns) {
    assert.match(tableMatch[1], new RegExp(`\\b${column}\\b`, "i"), `${table}.${column} hiányzik.`);
  }
}

assert.match(bootstrap, /insert into public\.drop_schema_meta/i, "A DROP 0.2.0 sémaverzió-jelölő hiányzik.");
assert.match(bootstrap, /'DROP 0\.2\.0'/, "A várt DROP sémaverzió hiányzik.");
assert.match(bootstrap, /'drop-020-atomic-package-engine-20260801'/, "A bootstrap azonosító hiányzik.");
assert.match(repository, /schemaVersion[\s\S]*?DROP_SCHEMA_VERSION/, "A repository nem ellenőrzi a sémaverziót.");
const schemaHealthStart = repository.indexOf("export async function getDropSchemaHealth()");
const schemaHealthEnd = repository.indexOf("\nasync function generateUniquePublicCode", schemaHealthStart);
assert.ok(schemaHealthStart >= 0 && schemaHealthEnd > schemaHealthStart, "A getDropSchemaHealth függvény nem található.");
const schemaHealthSource = repository.slice(schemaHealthStart, schemaHealthEnd);
assert.doesNotMatch(schemaHealthSource, /head:\s*true/, "A Supabase HEAD sémaellenőrzés elfedheti a PGRST205 hibát.");
assert.match(schemaHealthSource, /getDropSchemaSelect[\s\S]*?\.limit\(0\)/, "A sémaellenőrzésnek adatot nem visszaadó normál SELECT-et kell használnia.");


assert.match(bootstrap, /create or replace function public\.drop_mark_access_token_used/i, "Az atomi tokenhasználati RPC hiányzik.");
assert.match(bootstrap, /set use_count = use_count \+ 1/i, "A tokenhasználatnak adatbázisoldalon atomian kell növekednie.");
assert.match(bootstrap, /create or replace function public\.drop_reissue_access_token/i, "Az atomi token-újrakiadási RPC hiányzik.");
assert.match(bootstrap, /create or replace function public\.drop_revoke_access_token/i, "Az atomi token-visszavonási RPC hiányzik.");
assert.match(bootstrap, /grant execute on function public\.drop_mark_access_token_used\(uuid\) to service_role/i);
assert.match(bootstrap, /grant execute on function public\.drop_reissue_access_token[\s\S]*?to service_role/i);
assert.match(bootstrap, /grant execute on function public\.drop_revoke_access_token[\s\S]*?to service_role/i);
assert.match(bootstrap, /revoke all on function public\.drop_reissue_access_token[\s\S]*?from anon/i);
assert.match(bootstrap, /revoke all on function public\.drop_revoke_access_token[\s\S]*?from authenticated/i);

assert.match(bootstrap, /create or replace function public\.drop_transition_package_status/i, "Az atomi állapotváltó RPC hiányzik.");
assert.match(bootstrap, /for update/i, "Az atomi állapotváltásnak sorzárolást kell használnia.");
assert.match(bootstrap, /DROP_PACKAGE_STATUS_CONFLICT/, "Az optimista állapotütközés hibakódja hiányzik.");
assert.match(bootstrap, /get diagnostics v_revoked = row_count/i, "A visszavont tokenek számlálása hiányzik.");
assert.match(bootstrap, /grant execute on function public\.drop_transition_package_status[\s\S]*?to service_role/i, "Az RPC csak service-role számára legyen végrehajtható.");
assert.match(bootstrap, /revoke all on function public\.drop_transition_package_status[\s\S]*?from anon/i, "Az anon végrehajtási jog visszavonása hiányzik.");
assert.match(bootstrap, /revoke all on function public\.drop_transition_package_status[\s\S]*?from authenticated/i, "Az authenticated végrehajtási jog visszavonása hiányzik.");

assert.doesNotMatch(bootstrap, /create\s+policy/i, "A bootstrap nem hozhat létre anonim vagy kliens RLS policy-t.");
assert.doesNotMatch(bootstrap, /^\s*raw_tokens?\s+/im, "A bootstrap nem tartalmazhat nyers token oszlopot.");
assert.match(repository, /DROP_REQUIRED_TABLES\.map/, "A repositorynak minden kötelező táblát ellenőriznie kell.");
assert.match(repository, /token_hash:\s*token\.tokenHash/, "A repositorynak csak tokenhasht szabad mentenie.");
assert.match(proxy, /pathname\.startsWith\("\/api\/drop\/admin\/"\)/, "A belső admin API-nak az alkalmazáshoston elérhetőnek kell lennie.");
assert.doesNotMatch(proxy, /console\.log\([^\n]*request\.nextUrl\.pathname/, "A proxy nem naplózhat nyers tokenes útvonalat.");
assert.match(nginx, /location ~ \^\/\(u\|p\|d\|report\)\/\[\^\/\]\+\/\?\$[\s\S]*?access_log off;/, "A tokenes útvonalakon ki kell kapcsolni az Nginx access logot.");
assert.doesNotMatch(nginx, /TEMP DROP 0\.2\.0 SQL HANDOFF/, "Az ideiglenes SQL-átadó útvonal nem maradhat aktív.");

console.log("DROP 0.2.0 schema contract tests: PASS");
