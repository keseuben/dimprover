#!/usr/bin/env node
import fs from "node:fs";
import assert from "node:assert/strict";

const migration = fs.readFileSync("supabase/migrations/20260928194500_dimpro_project_drive_safe_folder_v022.sql","utf8");
const order = fs.readFileSync("supabase/DIMPRO_MIGRATION_ORDER_V1.txt","utf8");
const repo = fs.readFileSync("app/lib/identity-core/repository.ts","utf8");
const service = fs.readFileSync("app/lib/identity-core/projectProvisioning.ts","utf8");
const preflight = fs.readFileSync("scripts/dimpro-identity-core-live-preflight.mjs","utf8");
const gate = fs.readFileSync("scripts/dimpro-project-drive-v022-migration-gate.mjs","utf8");

let pass = 0;
function check(name, value) {
  assert.ok(value, name);
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2,"0")} ${name}`);
}
check("V0.2.2 migration exists", migration.includes("DIMPRO Identity Core 0.2.2"));
check("Migration requires safe folder columns", migration.includes("original_name") && migration.includes("display_name") && migration.includes("DIMPRO_DRIVE_SAFE_FOLDER_COLUMNS_REQUIRED"));
check("RPC validates original human name", migration.includes("nullif(f.original_name,'')"));
check("RPC validates display human name", migration.includes("nullif(f.display_name,'')"));
check("RPC retains technical-name legacy fallback", migration.includes("or lower(trim(f.name))"));
check("RPC still validates project ownership", migration.includes("f.project_id=p_project_core_id") && migration.includes("f.parent_id is null") && migration.includes("f.status='ACTIVE'"));
check("V0.2.2 marker is written", migration.includes("schema_version='0.2.2'") && migration.includes("migration_count=greatest(migration_count,6)"));
check("V0.2.2 bootstrap id is written", migration.includes("dimpro-identity-project-drive-safe-folder-v022-20260928"));
check("Capability metadata records safe-folder compatibility", migration.includes("projectDriveHumanFolderIdentity") && migration.includes("projectDriveSafeFolderCompatibility"));
check("RPC remains service-role only", migration.includes("revoke all on function public.dimpro_bind_project_core_atomic") && migration.includes("grant execute on function public.dimpro_bind_project_core_atomic") && migration.includes("to service_role"));
check("PostgREST schema reload retained", migration.includes("notify pgrst, 'reload schema'"));
check("Migration order includes V0.2.2", order.includes("20260928194500_dimpro_project_drive_safe_folder_v022.sql"));
check("Repository accepts latest V0.2.2 marker", repo.includes("LATEST_SCHEMA") && repo.includes('schemaVersion: "0.2.2"') && repo.includes("dimpro-identity-project-drive-safe-folder-v022-20260928"));
check("Repository retains V0.2.1 transition", repo.includes("FORWARD_SCHEMA") && repo.includes('schemaVersion: "0.2.1"'));
check("Provisioning gate accepts V0.2.2", service.includes('health.marker?.schemaVersion === "0.2.2"') && service.includes("migrationCount || 0) >= 6"));
check("Provisioning gate retains V0.2.1 transition", service.includes('health.marker?.schemaVersion === "0.2.1"') && service.includes("migrationCount || 0) >= 5"));
check("Live preflight accepts both bridge markers", preflight.includes('schema_version === "0.2.1"') && preflight.includes('schema_version === "0.2.2"') && preflight.includes("bridgeMarkerReady"));
check("V0.2.2 gate pins migration SHA", gate.includes("efc5eca867a5b74bd2219d35fd7ba187eae1ee931af226519e6c15aa19961522"));
check("V0.2.2 gate requires exact V0.2.1 baseline", gate.includes('schemaVersion: "0.2.1"') && gate.includes('migrationCount: 5') && gate.includes('driveFolderType: "text"'));
check("V0.2.2 gate targets safe-folder marker", gate.includes('schemaVersion: "0.2.2"') && gate.includes('migrationCount: 6') && gate.includes("dimpro-identity-project-drive-safe-folder-v022-20260928"));
check("V0.2.2 gate requires human-name sentinel", gate.includes("driveHumanNameSentinel") && gate.includes("original_name='Beérkező Drop'") && gate.includes("display_name='Beérkező Drop'"));
check("V0.2.2 gate requires explicit DEV approval", gate.includes("DEV_ONLY_IDENTITY_PROJECT_DRIVE_V022_APPLY_APPROVED"));
check("V0.2.2 gate retains backup verification", gate.includes('run("pg_dump"') && gate.includes('run("pg_restore"') && gate.includes("identity-project-drive-v022-before.dump"));
check("V0.2.1 runtime adapter validates human folder identity", service.includes("resolveLegacyV021IncomingFolderBindingName") && service.includes("original_name") && service.includes("display_name") && service.includes("parent_id == null"));
check("V0.2.1 runtime adapter sends technical name only to legacy RPC", service.includes('schemaVersion === "0.2.1"') && service.includes("rpcIncomingFolderName") && service.includes("p_incoming_folder_name: rpcIncomingFolderName"));
check("V0.2.1 runtime adapter restores human Drop name", service.includes("restoreHumanIncomingFolderName") && service.includes("incoming_folder_name: requestedHumanName"));
check("Identity response always exposes requested human name", service.includes("incomingFolderName: requestedIncomingFolderName"));
console.log(JSON.stringify({ok:true,contract:"DIMPRO Identity Core V0.2.2 safe Drive folder bridge",pass,fail:0},null,2));
