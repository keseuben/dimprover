import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getDimproAuthConfig } from "./config";

type GlobalWithAuthPool = typeof globalThis & { __dimproAuthPool?: Pool };

function createPool() {
  const config = getDimproAuthConfig();
  return new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: config.dbSslMode === "require" ? { rejectUnauthorized: false } : false,
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
