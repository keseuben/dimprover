#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const files = {
  migration: "supabase/migrations/20260816081500_dimpro_project_drive_binding_v021.sql",
  migrationOrder: "supabase/DIMPRO_MIGRATION_ORDER_V1.txt",
  bootstrap: "supabase/DIMPRO_IDENTITY_CORE_V010_BOOTSTRAP.sql",
  migrationGate: "scripts/dimpro-project-drive-v021-migration-gate.mjs",
  identityRepo: "app/lib/identity-core/repository.ts",
  identityPreflight: "scripts/dimpro-identity-core-live-preflight.mjs",
  service: "app/lib/identity-core/projectProvisioning.ts",
  provisionRoute: "app/api/projects/[projectId]/identity/provision/route.ts",
  projectsRoute: "app/api/projects/route.ts",
  projectRoute: "app/api/projects/[projectId]/route.ts",
  lifecycleRoute: "app/api/projects/[projectId]/lifecycle/route.ts",
  membershipsRoute: "app/api/projects/[projectId]/memberships/route.ts",
  driveProvisioning: "app/lib/drive-core/projectProvisioning.ts",
};
for (const file of Object.values(files)) if (!exists(file)) throw new Error(`Hiányzó fájl: ${file}`);
const s = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`PASS ${String(passed).padStart(2,"0")} ${name}`); }

check("Identity 0.2.1 migration exists", () => assert.ok(s.migration.includes("DIMPRO Identity Core 0.2.1")));
check("drive_folder_id becomes text", () => assert.ok(s.migration.includes("alter column drive_folder_id type text") && s.migration.includes("using drive_folder_id::text")));
check("Fresh bootstrap uses text folder id", () => assert.ok(s.bootstrap.includes("drive_folder_id text null")));
check("Migration order includes V0.2.1", () => assert.ok(s.migrationOrder.includes(files.migration)));
check("Identity marker V0.2.1", () => assert.ok(s.migration.includes("'0.2.1'") && s.migration.includes("dimpro-identity-project-drive-v021-20260816")));
check("Identity migration count 5", () => assert.ok(s.migration.includes("\n  5,\n")));
check("Marker records text folder capability", () => assert.ok(s.migration.includes("projectDriveFolderTextId") && s.migration.includes("projectRuntimeProvisioning") && s.migration.includes("projectLifecycleDropSync")));
check("Purpose-bound atomic bind RPC", () => assert.ok(s.migration.includes("dimpro_bind_project_core_atomic")));
check("Atomic bind locks core project", () => assert.ok(s.migration.includes("for update")));
check("Atomic bind validates Drive folder ownership", () => assert.ok(s.migration.includes("f.project_id=p_project_core_id") && s.migration.includes("f.parent_id is null") && s.migration.includes("f.status='ACTIVE'")));
check("Atomic bind validates incoming folder name", () => assert.ok(s.migration.includes("lower(trim(f.name))") && s.migration.includes("Beérkező Drop")));
check("Atomic bind detects split canonical bridge", () => assert.ok(s.migration.includes("DIMPRO_PROJECT_BIND_CONFLICT")));
check("Atomic bind creates generated public project code", () => assert.ok(s.migration.includes("dimpro_generate_project_code()")));
check("Atomic bind writes legacy Project Core bridge", () => assert.ok(s.migration.includes("legacy_project_core_id") && s.migration.includes("legacy_project_code")));
check("Atomic bind writes reverse core bridge", () => assert.ok(s.migration.includes("set dimpro_project_id=v_identity.id")));
check("Atomic bind upserts Drop settings", () => assert.ok(s.migration.includes("insert into public.dimpro_project_drop_settings") && s.migration.includes("on conflict (project_id) do update")));
check("Atomic bind stores real Drive folder id", () => assert.ok(s.migration.includes("drive_folder_id=excluded.drive_folder_id")));
check("Only ACTIVE lifecycle enables project Drop", () => assert.ok(s.migration.includes("v_drop_enabled := v_status='active'")));
check("Virus scan remains required", () => assert.ok(s.migration.includes("preserve_groups,require_virus_scan,notify_project_admins") && s.migration.includes("true,true,true")));
check("Bind RPC revoked from public", () => assert.ok(s.migration.includes("revoke all on function public.dimpro_bind_project_core_atomic") && s.migration.includes("from public, anon, authenticated")));
check("Bind RPC service-role only", () => assert.ok(s.migration.includes("grant execute on function public.dimpro_bind_project_core_atomic") && s.migration.includes("to service_role")));
check("PostgREST schema reload", () => assert.ok(s.migration.includes("notify pgrst, 'reload schema'")));

check("Migration gate fixed SHA", () => assert.ok(s.migrationGate.includes("c6a6c1c576fb2d2fc1327307fd8592a37faa618cc3932d716f5a9e30dec63f9c")));
check("Migration gate exact DEV target", () => assert.ok(s.migrationGate.includes("pbgyuznivqvestuksvif") && s.migrationGate.includes("aws-0-eu-central-1.pooler.supabase.com")));
check("Migration gate exact 0.2.0 baseline", () => assert.ok(s.migrationGate.includes('schemaVersion: "0.2.0"') && s.migrationGate.includes('driveFolderType: "uuid"')));
check("Migration gate exact 0.2.1 target", () => assert.ok(s.migrationGate.includes('schemaVersion: "0.2.1"') && s.migrationGate.includes('driveFolderType: "text"')));
check("Migration gate requires Drive text sentinel", () => assert.ok(s.migrationGate.includes("driveTextSentinel") && s.migrationGate.includes("drive-folder-%")));
check("Migration gate snapshots settings", () => assert.ok(s.migrationGate.includes("settingsSnapshot") && s.migrationGate.includes("nonNullDriveFolderCount")));
check("Migration gate creates pg_dump backup", () => assert.ok(s.migrationGate.includes('run("pg_dump"') && s.migrationGate.includes("identity-project-drive-v021-before.dump")));
check("Migration gate verifies backup", () => assert.ok(s.migrationGate.includes('run("pg_restore"') && s.migrationGate.includes("BACKUP_VERIFY_FAILED")));
check("Migration gate requires explicit DEV approval", () => assert.ok(s.migrationGate.includes("DEV_ONLY_IDENTITY_PROJECT_DRIVE_V021_APPLY_APPROVED")));
check("Migration gate verifies table privileges stable", () => assert.ok(s.migrationGate.includes("assertTableSecurityStable")));
check("Migration gate verifies RPC service-only", () => assert.ok(s.migrationGate.includes("assertRpcSecurity") && s.migrationGate.includes("serviceExecute")));

check("Runtime supports 0.2.0 to 0.2.1 transition", () => assert.ok(s.identityRepo.includes("FORWARD_SCHEMA") && s.identityRepo.includes('schemaVersion: "0.2.0"') && s.identityRepo.includes('schemaVersion: "0.2.1"') && s.identityRepo.includes("markerCompatible")));
check("Live preflight expects 0.2.1", () => assert.ok(s.identityPreflight.includes('schema_version === "0.2.1"') && s.identityPreflight.includes(">= 5")));
check("Identity bridge version 1.0.0", () => assert.ok(s.service.includes('DIMPRO_PROJECT_IDENTITY_BRIDGE_VERSION = "1.0.0"')));
check("Identity service gates specifically on 0.2.1", () => assert.ok(s.service.includes("getDimproIdentitySchemaHealth") && s.service.includes('health.marker?.schemaVersion === "0.2.1"') && s.service.includes("DIMPRO_PROJECT_IDENTITY_SCHEMA_NOT_READY")));
check("Canonical actor resolves by id/auth/email", () => assert.ok(s.service.includes('from("dimpro_users")') && s.service.includes('eq("auth_user_id"') && s.service.includes('eq("email_normalized"')));
check("Canonical organization resolution is UUID-safe", () => assert.ok(s.service.includes("resolveCanonicalOrganization") && s.service.includes("normalizeUuid(organizationId)")));
check("Service calls atomic bind RPC", () => assert.ok(s.service.includes('client.rpc("dimpro_bind_project_core_atomic"')));
check("Service maps lifecycle to canonical status", () => assert.ok(s.service.includes("identityStatus(core.status)")));
check("Service syncs Project Core memberships", () => assert.ok(s.service.includes("syncMemberships") && s.service.includes("legacy_project_core_membership_id")));
check("Membership reverse bridge is stored", () => assert.ok(s.service.includes("dimpro_project_membership_id")));
check("Upload roles are bounded", () => assert.ok(s.service.includes('["OWNER", "PROJECT_MANAGER", "CONTRIBUTOR"]')));
check("Inbox management roles are bounded", () => assert.ok(s.service.includes('["OWNER", "PROJECT_MANAGER"]')));
check("Unresolved canonical users fail closed", () => assert.ok(s.service.includes("canonical-user-not-found") && s.service.includes("unresolved")));
check("Drop binding readiness needs active uploader", () => assert.ok(s.service.includes("memberships.activeUploaders > 0")));
check("Project Identity audit is written", () => assert.ok(s.service.includes("PROJECT_IDENTITY_DRIVE_SYNCED")));

check("Provision GET requires project.read", () => assert.ok(s.provisionRoute.includes('"project.read"')));
check("Provision POST requires project.update", () => assert.ok(s.provisionRoute.includes('"project.update"')));
check("Provision POST ensures Drive first", () => assert.ok(s.provisionRoute.includes("provisionProjectDrive") && s.provisionRoute.includes("incomingDropFolder")));
check("Project creation auto-provisions Identity", () => assert.ok(s.projectsRoute.includes("provisionProjectIdentityBridge") && s.projectsRoute.includes("identityProvisioning")));
check("Project creation survives Identity retry", () => assert.ok(s.projectsRoute.includes("retryRequired: true") && s.projectsRoute.includes("DIMPRO_PROJECT_IDENTITY_PROVISIONING_FAILED")));
check("Project update resyncs Identity", () => assert.ok(s.projectRoute.includes("syncIdentityProject") && s.projectRoute.includes("identityProvisioning")));
check("Lifecycle resyncs Identity", () => assert.ok(s.lifecycleRoute.includes("syncIdentityLifecycle") && s.lifecycleRoute.includes("identityProvisioning")));
check("Deleted lifecycle does not bootstrap new Drive", () => assert.ok(s.lifecycleRoute.includes('nextStatus !== "DELETED"')));
check("Membership create resyncs canonical memberships", () => assert.ok(s.membershipsRoute.includes("syncIdentityMemberships") && s.membershipsRoute.includes("identityProvisioning")));
check("Drive incoming folder canonical name retained", () => assert.ok(s.driveProvisioning.includes('DRIVE_INCOMING_DROP_FOLDER_NAME = "Beérkező Drop"')));

const combined = Object.values(s).join("\n");
check("No SmartSync implementation introduced", () => assert.ok(!/CfConnectSyncRoot|Cloud Files placeholder|SmartSync activation/i.test(combined)));
check("No Private Vault implementation introduced", () => assert.ok(!/PRIVATE_VAULT_ENABLE|activatePrivateVault/i.test(combined)));
check("No Drop feature gate activation introduced", () => assert.ok(!/releaseGateEnabled\s*[:=]\s*true|driveArchiveEnabled\s*[:=]\s*true|sendEnabled\s*[:=]\s*true/.test(combined)));
check("No generic SQL executor introduced", () => assert.ok(!/generic sql executor|execute arbitrary sql|rawSql/i.test(combined)));

console.log(JSON.stringify({ ok: true, contract: "Project Identity + Drive Bridge V1.0", passed, failed: 0 }, null, 2));
