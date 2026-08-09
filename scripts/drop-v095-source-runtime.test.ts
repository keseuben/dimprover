import { getDropRuntimeHealth } from "../app/lib/drop/dropRuntime";
import { getDropPublicStoreStatus } from "../app/lib/drop/public/dropPublicRepository";

async function main() {
  const health = await getDropRuntimeHealth();
  const store = await getDropPublicStoreStatus({ refresh: true });
  const result = {
    version: health.version,
    ok: health.ok,
    send: health.readiness.dimproSend,
    gate: health.readiness.submissionGate,
    storeReady: health.readiness.publicWorkflowStore,
    postgresReady: health.readiness.publicWorkflowPostgres,
    migrationRequired: health.readiness.publicWorkflowMigrationRequired,
    activeStore: health.publicWorkflows.activeStore,
    schemaReady: health.publicWorkflows.postgresSchemaReady,
    multiInstanceReady: health.publicWorkflows.multiInstanceReady,
    failClosed: health.publicWorkflows.failClosed,
    fileCounts: health.publicWorkflows.fileCounts,
    storeReason: health.publicWorkflows.storeReason,
    scanner: health.worker.scannerPing,
    directStore: {
      activeStore: store.activeStore,
      schemaReady: store.schemaReady,
      migrationRequired: store.migrationRequired,
      failClosed: store.failClosed,
    },
  };
  console.log(JSON.stringify(result, null, 2));
  if (!(result.version === "DROP 0.9.5"
    && result.ok
    && result.send
    && result.gate
    && result.storeReady
    && result.activeStore === "file"
    && !result.schemaReady
    && !result.postgresReady
    && !result.multiInstanceReady
    && !result.failClosed
    && result.scanner === "PONG")) process.exit(2);
}
void main().catch((error) => { console.error(error); process.exit(1); });
