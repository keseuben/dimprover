#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { assertDevAuthDatabaseUrl, requireDevAuthEnvironment, strictDevAuthPgSsl } from "./strict-dev-db.mjs";
import path from "node:path";
import pg from "pg";

const root = process.cwd();
const migrationDir = path.join(root, "db", "auth", "migrations");
const apply = process.argv.includes("--apply");
const files = (await readdir(migrationDir)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
const manifest = [];
for (const file of files) {
  const sql = await readFile(path.join(migrationDir, file), "utf8");
  manifest.push({ file, sha256: createHash("sha256").update(sql).digest("hex"), bytes: Buffer.byteLength(sql) });
}
if (!apply) {
  console.log(JSON.stringify({ ok: true, mode: "dry-run", migrationDir, migrations: manifest }, null, 2));
  process.exit(0);
}
requireDevAuthEnvironment();
const connectionString = process.env.DIMPRO_AUTH_MIGRATION_DATABASE_URL?.trim();
if (!connectionString) throw new Error("DIMPRO_AUTH_MIGRATION_DATABASE_URL szükséges az --apply futtatáshoz.");
if (process.env.DIMPRO_AUTH_MIGRATION_CONFIRM !== "APPLY_DEV_AUTH_MIGRATIONS") {
  throw new Error("DIMPRO_AUTH_MIGRATION_CONFIRM=APPLY_DEV_AUTH_MIGRATIONS szükséges.");
}
assertDevAuthDatabaseUrl(connectionString, "dimpro_auth_migrator_dev");
const ssl = await strictDevAuthPgSsl();
const client = new pg.Client({ connectionString, ssl, application_name: "dimpro-auth-migrator" });
await client.connect();
const migrationLockKey = "dimpro-auth:migrations:dev";
let migrationLockHeld = false;
try {
  await client.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [migrationLockKey]);
  migrationLockHeld = true;
  const ledgerProbe = await client.query("SELECT to_regclass('public.auth_schema_migrations')::text AS ledger");
  let ledgerExists = Boolean(ledgerProbe.rows[0]?.ledger);
  const firstVersion = Number(manifest[0]?.file.match(/^(\d+)/)?.[1]);
  if (!ledgerExists && firstVersion !== 1) throw new Error("AUTH migration ledger is missing and migration 001 is not first.");

  for (const item of manifest) {
    const version = Number(item.file.match(/^(\d+)/)?.[1]);
    if (!Number.isSafeInteger(version) || version < 1) throw new Error(`Invalid migration version: ${item.file}`);
    const existing = ledgerExists
      ? await client.query("SELECT checksum_sha256 FROM auth_schema_migrations WHERE version=$1", [version])
      : { rows: [] };
    if (existing.rows[0]?.checksum_sha256) {
      if (existing.rows[0].checksum_sha256 !== item.sha256) throw new Error(`Migration checksum mismatch: ${item.file}`);
      console.log(`SKIP ${item.file}`);
      continue;
    }
    const sql = await readFile(path.join(migrationDir, item.file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      const recorded = await client.query(
        "INSERT INTO auth_schema_migrations(version,name,checksum_sha256) VALUES ($1,$2,$3) RETURNING version",
        [version, item.file, item.sha256],
      );
      if (recorded.rowCount !== 1) throw new Error(`Migration ledger insert failed: ${item.file}`);
      await client.query("COMMIT");
      ledgerExists = true;
      console.log(`APPLIED ${item.file}`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
} finally {
  if (migrationLockHeld) await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [migrationLockKey]).catch(() => undefined);
  await client.end();
}
