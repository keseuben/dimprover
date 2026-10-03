#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
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
const connectionString = process.env.DIMPRO_AUTH_MIGRATION_DATABASE_URL?.trim();
if (!connectionString) throw new Error("DIMPRO_AUTH_MIGRATION_DATABASE_URL szükséges az --apply futtatáshoz.");
if (process.env.DIMPRO_AUTH_MIGRATION_CONFIRM !== "APPLY_DEV_AUTH_MIGRATIONS") {
  throw new Error("DIMPRO_AUTH_MIGRATION_CONFIRM=APPLY_DEV_AUTH_MIGRATIONS szükséges.");
}
const ssl = process.env.DIMPRO_AUTH_DB_SSL_MODE?.trim().toLowerCase() === "disable" ? false : { rejectUnauthorized: false };
const client = new pg.Client({ connectionString, ssl, application_name: "dimpro-auth-migrator" });
await client.connect();
try {
  for (const item of manifest) {
    const version = Number(item.file.match(/^(\d+)/)?.[1]);
    const exists = await client.query("SELECT checksum_sha256 FROM auth_schema_migrations WHERE version=$1", [version]).catch(() => ({ rows: [] }));
    if (exists.rows[0]?.checksum_sha256) {
      if (exists.rows[0].checksum_sha256 !== item.sha256) throw new Error(`Migration checksum mismatch: ${item.file}`);
      console.log(`SKIP ${item.file}`);
      continue;
    }
    const sql = await readFile(path.join(migrationDir, item.file), "utf8");
    await client.query(sql);
    await client.query(
      "INSERT INTO auth_schema_migrations(version,name,checksum_sha256) VALUES ($1,$2,$3) ON CONFLICT (version) DO NOTHING",
      [version, item.file, item.sha256],
    );
    console.log(`APPLIED ${item.file}`);
  }
} finally {
  await client.end();
}
