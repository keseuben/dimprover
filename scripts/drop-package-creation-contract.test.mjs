import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationPath = "supabase/migrations/20260801110000_drop_atomic_package_creation.sql";
const migration = readFileSync(migrationPath, "utf8");
const repository = readFileSync("app/lib/drop/dropRepository.ts", "utf8");

assert.match(migration, /create or replace function public\.drop_create_package_atomic/i);
assert.match(migration, /security definer/i);
assert.match(migration, /set search_path = public, pg_temp/i);
assert.match(migration, /DROP_RAW_CREDENTIAL_REJECTED/);
assert.match(migration, /p_package \? 'pin'/);
assert.match(migration, /token_value \? 'rawToken'/);
assert.match(migration, /v_token_count <> 4 or v_purpose_count <> 4/i);
assert.match(migration, /insert into public\.drop_packages/i);
assert.match(migration, /insert into public\.drop_recipients/i);
assert.match(migration, /insert into public\.drop_groups/i);
assert.match(migration, /insert into public\.drop_access_tokens/i);
assert.match(migration, /insert into public\.drop_events/i);
assert.match(
  migration,
  /revoke all on function public\.drop_create_package_atomic[\s\S]*?from anon/i,
  "Az anon végrehajtási jog visszavonása hiányzik.",
);
assert.match(
  migration,
  /revoke all on function public\.drop_create_package_atomic[\s\S]*?from authenticated/i,
  "Az authenticated végrehajtási jog visszavonása hiányzik.",
);
assert.match(
  migration,
  /grant execute on function public\.drop_create_package_atomic[\s\S]*?to service_role/i,
  "Az atomi csomaglétrehozó RPC csak service-role számára legyen végrehajtható.",
);
assert.doesNotMatch(migration, /create\s+policy/i);

const start = repository.indexOf("export async function createDropPackage(");
const end = repository.indexOf("\nexport async function listDropPackages", start);
assert.ok(start >= 0 && end > start, "A createDropPackage függvény nem található.");
const createSource = repository.slice(start, end);

assert.match(createSource, /\.rpc\("drop_create_package_atomic"/);
assert.doesNotMatch(createSource, /\.from\("drop_packages"\)\s*\.insert/s);
assert.doesNotMatch(createSource, /\.from\("drop_recipients"\)\s*\.insert/s);
assert.doesNotMatch(createSource, /\.from\("drop_groups"\)\s*\.insert/s);
assert.doesNotMatch(createSource, /\.from\("drop_access_tokens"\)\s*\.insert/s);
assert.doesNotMatch(createSource, /\.delete\(\)\.eq\("id"/);
assert.match(createSource, /p_tokens:\s*tokens/);
assert.match(createSource, /token_hash:\s*token\.tokenHash/);
assert.match(createSource, /token_hint:\s*token\.tokenHint/);
assert.doesNotMatch(
  createSource.match(/const tokens = capabilities\.map[\s\S]*?\}\);/)?.[0] || "",
  /rawToken/,
  "Az SQL tokenpayload nyers tokent tartalmazhat.",
);
assert.match(createSource, /return \{[\s\S]*?package:[\s\S]*?pin,[\s\S]*?rawTokens,[\s\S]*?links:/);

console.log("DROP 0.2.0 atomic package creation contract tests: PASS");
