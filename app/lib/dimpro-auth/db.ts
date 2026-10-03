import { readFileSync } from "node:fs";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getDimproAuthConfig } from "./config";

type GlobalWithAuthPool = typeof globalThis & { __dimproAuthPool?: Pool };

function loadDatabaseCa() {
  const inline = process.env.DIMPRO_AUTH_DB_CA_PEM?.trim();
  if (inline) return inline.replace(/\\n/g, "\n");
  const file = process.env.DIMPRO_AUTH_DB_CA_FILE?.trim();
  if (!file) return null;
  return readFileSync(file, "utf8");
}

function createPool() {
  const config = getDimproAuthConfig();
  const ssl = config.dbSslMode === "disable"
    ? false
    : config.dbSslMode === "verify-full"
      ? { rejectUnauthorized: true, ca: loadDatabaseCa() || undefined }
      : { rejectUnauthorized: false };
  if (config.dbSslMode === "verify-full" && !loadDatabaseCa()) {
    throw new Error("DIMPRO_AUTH_DB_CA_FILE vagy DIMPRO_AUTH_DB_CA_PEM szükséges verify-full módban.");
  }
  return new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl,
    application_name: process.env.DIMPRO_AUTH_DB_APPLICATION_NAME?.trim() || "dimpro-auth",
  });
}

export function getDimproAuthPool() {
  const globalRef = globalThis as GlobalWithAuthPool;
  if (!globalRef.__dimproAuthPool) globalRef.__dimproAuthPool = createPool();
  return globalRef.__dimproAuthPool;
}

export async function authQuery<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return getDimproAuthPool().query<T>(text, values);
}

export async function withAuthTransaction<T>(run: (client: PoolClient) => Promise<T>) {
  const client = await getDimproAuthPool().connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
