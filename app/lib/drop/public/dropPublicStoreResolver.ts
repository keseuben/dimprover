import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DropPublicRepositoryError,
  getDropPublicFileStateForMigration,
  getDropPublicFileStoreSummary,
} from "./dropPublicFileRepository";
import {
  activateDropPublicPostgresStore,
  getDropPublicPostgresCounts,
  getDropPublicPostgresSchemaHealth,
  importDropPublicFileStateToPostgres,
} from "./dropPublicPostgresRepository";

export type DropPublicStoreName = "file" | "postgresql";
export type DropPublicRequestedStoreMode = "auto" | DropPublicStoreName;

type ActivationMarker = {
  version: "DROP_PUBLIC_STORE_V095";
  activeStore: "postgresql";
  activatedAt: string;
  reason: string;
  schemaVersion: "DROP 0.9.5";
  importCounts: Record<string, number>;
};

function projectRoot() {
  const configured = process.env.DIMPRO_PROJECT_ROOT?.trim();
  if (configured) return path.resolve(configured);
  const cwd = process.cwd();
  const suffix = path.join(".next", "standalone");
  return cwd.endsWith(suffix) ? path.resolve(cwd, "..", "..") : cwd;
}
function requestedMode(): DropPublicRequestedStoreMode {
  const value = process.env.DROP_PUBLIC_STORE_MODE?.trim().toLowerCase();
  return value === "file" || value === "postgresql" ? value : "auto";
}
const markerRoot = process.env.DROP_PUBLIC_STORE_MARKER_DIR?.trim()
  ? path.resolve(process.env.DROP_PUBLIC_STORE_MARKER_DIR.trim())
  : path.join(projectRoot(), ".data", "dimpro-drop-public-v095");
const markerPath = path.join(markerRoot, "postgres-active.json");

async function readActivationMarker(): Promise<ActivationMarker | null> {
  try {
    const parsed = JSON.parse(await readFile(markerPath, "utf8")) as Partial<ActivationMarker>;
    return parsed.version === "DROP_PUBLIC_STORE_V095" && parsed.activeStore === "postgresql" ? parsed as ActivationMarker : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw new DropPublicRepositoryError("A DROP 0.9.5 PostgreSQL aktiválási marker sérült vagy nem olvasható.", "DROP_PUBLIC_STORE_MARKER_CORRUPT", 503);
  }
}
async function writeActivationMarker(reason: string, counts: Record<string, number>) {
  await mkdir(markerRoot, { recursive: true, mode: 0o700 });
  await chmod(markerRoot, 0o700).catch(() => undefined);
  const marker: ActivationMarker = {
    version: "DROP_PUBLIC_STORE_V095",
    activeStore: "postgresql",
    activatedAt: new Date().toISOString(),
    reason,
    schemaVersion: "DROP 0.9.5",
    importCounts: counts,
  };
  const temporary = `${markerPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, markerPath);
  await chmod(markerPath, 0o600).catch(() => undefined);
  return marker;
}
function totalCounts(counts: Record<string, number>) { return Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0); }

let statusCache: { expiresAt: number; value: Awaited<ReturnType<typeof computeDropPublicStoreStatus>> } | null = null;

async function computeDropPublicStoreStatus() {
  const mode = requestedMode();
  const [schema, file, localMarker] = await Promise.all([
    getDropPublicPostgresSchemaHealth().catch((error) => ({
      ready: false,
      marker: null,
      checks: { marker: false, sendCodes: false, gates: false, sessions: false, workflows: false, usage: false },
      errors: [{ code: (error as { code?: string }).code || "DROP_PUBLIC_SCHEMA_CHECK_FAILED", message: error instanceof Error ? error.message : String(error) }],
    })),
    getDropPublicFileStoreSummary(),
    readActivationMarker(),
  ]);
  const databaseActivated = schema.marker?.metadata?.activeStore === "postgresql";
  let effectiveLocalMarker = localMarker;
  if (databaseActivated && schema.ready && !effectiveLocalMarker) {
    const imported = schema.marker?.metadata?.importCounts;
    const importCounts = imported && typeof imported === "object"
      ? Object.fromEntries(Object.entries(imported).map(([key, value]) => [key, Number(value || 0)]))
      : {};
    effectiveLocalMarker = await writeActivationMarker(
      typeof schema.marker?.metadata?.activationReason === "string" ? schema.marker.metadata.activationReason : "database-marker-recovery",
      importCounts,
    );
  }
  const postgresLocked = Boolean(effectiveLocalMarker || databaseActivated || mode === "postgresql");
  let postgresCounts: Record<string, number> | null = null;
  if (schema.ready) postgresCounts = await getDropPublicPostgresCounts().catch(() => null);
  const migrationRequired = Boolean(schema.ready && !postgresLocked && file.migratableRecordCount > 0);
  let activeStore: DropPublicStoreName = "file";
  let reason = "A PostgreSQL-séma még nem aktív; a biztonságos fájltár működik.";
  let failClosed = false;

  if (mode === "file") {
    activeStore = "file";
    reason = "A DROP_PUBLIC_STORE_MODE=file kényszerített fájltárat ír elő.";
  } else if (postgresLocked) {
    activeStore = "postgresql";
    failClosed = true;
    reason = schema.ready ? "A PostgreSQL workflow-tár aktiválva és zárolva van." : "A PostgreSQL workflow-tár aktiválva van, de jelenleg nem elérhető; a rendszer fail-closed állapotú.";
  } else if (schema.ready && file.migratableRecordCount === 0) {
    const counts = postgresCounts || { sendCodes: 0, gates: 0, sessions: 0, workflows: 0, usage: 0 };
    await activateDropPublicPostgresStore("empty-file-auto-activation", counts);
    await writeActivationMarker("empty-file-auto-activation", counts);
    activeStore = "postgresql";
    failClosed = true;
    reason = "Az üres fájltár mellett a PostgreSQL workflow-tár automatikusan aktiválva lett.";
  } else if (migrationRequired) {
    activeStore = "file";
    reason = "A PostgreSQL-séma kész, de a fájltár adatait még importálni kell.";
  }

  return {
    version: "DROP 0.9.5" as const,
    requestedMode: mode,
    activeStore,
    reason,
    failClosed,
    schemaReady: schema.ready,
    schema,
    databaseActivated,
    localMarker: effectiveLocalMarker,
    migrationRequired,
    file,
    postgresCounts,
    sqlBootstrapPath: "supabase/DIMPRO_DROP_095_PUBLIC_WORKFLOW_STORE_BOOTSTRAP.sql",
    markerPath,
  };
}

export async function getDropPublicStoreStatus(options: { refresh?: boolean } = {}) {
  if (!options.refresh && statusCache && statusCache.expiresAt > Date.now()) return statusCache.value;
  const value = await computeDropPublicStoreStatus();
  statusCache = { expiresAt: Date.now() + 15_000, value };
  return value;
}

export function invalidateDropPublicStoreStatusCache() { statusCache = null; }

export async function resolveDropPublicStore(): Promise<DropPublicStoreName> {
  const status = await getDropPublicStoreStatus();
  if (status.activeStore === "postgresql" && !status.schemaReady) {
    throw new DropPublicRepositoryError(
      "A központi PostgreSQL workflow-tár aktiválva van, de nem érhető el. A rendszer biztonsági okból nem ír a régi fájltárba.",
      "DROP_PUBLIC_POSTGRES_FAIL_CLOSED",
      503,
    );
  }
  return status.activeStore;
}

export async function migrateDropPublicFileStoreToPostgres() {
  const schema = await getDropPublicPostgresSchemaHealth();
  if (!schema.ready) throw new DropPublicRepositoryError(
    "A DROP 0.9.5 PostgreSQL-séma még nincs telepítve. Előbb futtassa a bootstrap SQL-t a Supabase SQL Editorban.",
    "DROP_PUBLIC_POSTGRES_SCHEMA_REQUIRED",
    503,
  );
  const state = await getDropPublicFileStateForMigration();
  const fileSummary = await getDropPublicFileStoreSummary();
  const imported = await importDropPublicFileStateToPostgres(state);
  const postgresCounts = await getDropPublicPostgresCounts();
  const comparableCounts = postgresCounts as Record<string, number>;
  for (const [key, value] of Object.entries(fileSummary.counts)) {
    if (Number(comparableCounts[key] || 0) < value) throw new DropPublicRepositoryError(
      `A PostgreSQL-import ellenőrzése sikertelen: ${key}.`,
      "DROP_PUBLIC_POSTGRES_IMPORT_COUNT_MISMATCH",
      500,
    );
  }
  const marker = await writeActivationMarker("file-import", imported);
  invalidateDropPublicStoreStatusCache();
  return { imported, postgresCounts, fileSummary, marker, activeStore: "postgresql" as const, totalImported: totalCounts(imported) };
}
