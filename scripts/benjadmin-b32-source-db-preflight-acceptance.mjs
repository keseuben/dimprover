import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "benjadmin-b32-source-db-preflight.mjs");
const checks = [];

function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}

function runCase(name, expectedCode, env) {
  const result = spawnSync(process.execPath, [script], {
    env: {
      PATH: process.env.PATH,
      ...env,
    },
    encoding: "utf8",
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  check(name, result.status === 2 && output.includes(expectedCode), `exit=${result.status} code=${expectedCode}`);
}

runCase("missing expected DEV target fails closed", "SOURCE_DB_EXPECTED_TARGET_MISSING", {});
runCase("missing DB credential fails closed", "SOURCE_DB_CREDENTIAL_MISSING", {
  BENJADMIN_EXPECTED_SUPABASE_URL: "https://aaa.supabase.co",
});
runCase("wrong DB project fails before DB access", "SOURCE_DB_TARGET_MISMATCH", {
  BENJADMIN_EXPECTED_SUPABASE_URL: "https://aaa.supabase.co",
  SUPABASE_DB_URL: "postgres://postgres@db.bbb.supabase.co/postgres",
  SUPABASE_DB_PASSWORD: "acceptance-fake",
});
runCase("unknown PROD target blocks migration", "SOURCE_DB_PROD_TARGET_UNKNOWN", {
  BENJADMIN_EXPECTED_SUPABASE_URL: "https://aaa.supabase.co",
  SUPABASE_DB_URL: "postgres://postgres@db.aaa.supabase.co/postgres",
  SUPABASE_DB_PASSWORD: "acceptance-fake",
});
runCase("shared DEV/PROD project blocks migration", "SOURCE_DB_SHARED_WITH_PROD", {
  BENJADMIN_EXPECTED_SUPABASE_URL: "https://aaa.supabase.co",
  SUPABASE_DB_URL: "postgres://postgres@db.aaa.supabase.co/postgres",
  SUPABASE_DB_PASSWORD: "acceptance-fake",
  BENJADMIN_PROD_SUPABASE_URL: "https://aaa.supabase.co",
});

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0, checks }, null, 2));
