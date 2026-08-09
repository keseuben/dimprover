import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";

const read=(p)=>fs.readFileSync(p,"utf8");
const checks=[];
function has(name,source,text){assert.ok(source.includes(text),`${name}: ${text}`);checks.push(name)}
function lacks(name,source,text){assert.ok(!source.includes(text),`${name}: ${text}`);checks.push(name)}

const sqlPath="supabase/DIMPRO_DROP_095_PUBLIC_WORKFLOW_STORE_BOOTSTRAP.sql";
const migrationPath="supabase/migrations/20260805_drop_public_workflow_store_v095.sql";
const hashPath=`${sqlPath}.sha256`;
const sql=read(sqlPath);const migration=read(migrationPath);const expectedHash=read(hashPath).trim();
const actualHash=createHash("sha256").update(sql).digest("hex");
const file=read("app/lib/drop/public/dropPublicFileRepository.ts");
const postgres=read("app/lib/drop/public/dropPublicPostgresRepository.ts");
const resolver=read("app/lib/drop/public/dropPublicStoreResolver.ts");
const facade=read("app/lib/drop/public/dropPublicRepository.ts");
const workflowService=read("app/lib/drop/public/dropPublicWorkflowService.ts");
const migrationApi=read("app/api/drop/admin/public/store-migration/route.ts");
const panel=read("components/drop/DropPublicStoreMigrationPanel.tsx");
const manager=read("components/drop/DropPublicWorkflowManager.tsx");
const runtime=read("app/lib/drop/dropRuntime.ts");
const flags=read("app/lib/drop/dropFeatureFlags.ts");
const env=read(".env.local");
const dev=JSON.parse(read(".data/dimpro-dev-center/state.json"));

assert.equal(sql,migration);checks.push("migration-copy-equals-bootstrap");
assert.equal(actualHash,expectedHash);checks.push("bootstrap-sha256-valid");
has("sql-transaction",sql,"begin;");has("sql-commit",sql,"commit;");
has("sql-existing-core-guard",sql,"DROP 0.9.5 requires the existing DIMPRO Drop core schema");
for(const table of ["drop_public_send_codes","drop_public_submission_gates","drop_public_sessions","drop_public_package_workflows","drop_public_usage"]){
 has(`table-${table}`,sql,`create table if not exists public.${table}`);
 has(`rls-${table}`,sql,`alter table public.${table} enable row level security`);
 has(`revoke-${table}`,sql,`revoke all on table public.${table} from public, anon, authenticated`);
 has(`service-role-${table}`,sql,`grant select, insert, update, delete on table public.${table} to service_role`);
}
has("session-source-check",sql,"drop_public_session_source_check");
has("package-fk",sql,"references public.drop_packages(id) on delete cascade");
has("usage-package-unique",sql,"package_id uuid not null unique");
has("send-code-secret-hash",sql,"code_hash text not null");
has("send-code-secret-salt",sql,"code_salt text not null");
lacks("no-raw-send-code-column",sql,"raw_code");
has("recipient-json-check",sql,"jsonb_typeof(recipients) = 'array'");
has("limits-json-check",sql,"jsonb_typeof(limits) = 'object'");
has("cleanup-rpc",sql,"function public.drop_public_cleanup");
has("bind-rpc",sql,"function public.drop_public_bind_session_package_atomic");
has("finalize-rpc",sql,"function public.drop_public_claim_finalization_atomic");
has("activation-rpc",sql,"function public.drop_public_activate_postgres_store");
has("import-rpc",sql,"function public.drop_public_import_file_state_atomic");
has("bind-row-lock-session",sql,"for update;");
has("bind-code-lock",sql,"where id=session_row.send_code_id for update");
has("bind-daily-package-limit",sql,"DROP_SEND_CODE_DAILY_PACKAGE_LIMIT");
has("bind-daily-byte-limit",sql,"DROP_SEND_CODE_DAILY_BYTES_LIMIT");
has("usage-idempotent",sql,"on conflict(package_id) do nothing");
has("finalization-lock-window",sql,"now()-interval '5 minutes'");
has("import-advisory-lock",sql,"pg_advisory_xact_lock");
has("import-upsert-codes",sql,"on conflict(id) do update set label=excluded.label");
has("import-upsert-workflows",sql,"on conflict(package_id) do update set workflow_type=excluded.workflow_type");
has("schema-marker-component",sql,"'drop-public-workflows','DROP 0.9.5',1,'drop-095-public-workflow-store-20260805'");
has("schema-marker-multi-instance",sql,"'multiInstanceReady',true");
has("schema-reload",sql,"notify pgrst, 'reload schema'");
for(const fn of ["drop_public_cleanup(timestamptz)","drop_public_bind_session_package_atomic(text,uuid,bigint)","drop_public_claim_finalization_atomic(uuid)","drop_public_activate_postgres_store(text,jsonb)","drop_public_import_file_state_atomic(jsonb)"]){
 has(`rpc-revoke-${fn}`,sql,`revoke all on function public.${fn} from public, anon, authenticated`);
 has(`rpc-grant-${fn}`,sql,`grant execute on function public.${fn} to service_role`);
}

has("file-migration-state-export",file,"getDropPublicFileStateForMigration");
has("file-summary-export",file,"getDropPublicFileStoreSummary");
has("file-state-v094",file,'STATE_VERSION = "DROP_PUBLIC_V094"');
has("postgres-schema-health",postgres,"getDropPublicPostgresSchemaHealth");
has("postgres-expected-version",postgres,'version: "DROP 0.9.5"');
has("postgres-row-mapping",postgres,"mapSendCode");
has("postgres-timing-safe-code",postgres,"timingSafeEqual");
has("postgres-no-raw-code-write",postgres,"code_hash: hashed.hash");
has("postgres-active-code-scrypt-scan",postgres,".some((row) => verifyCode");
has("postgres-code-hint-filter",postgres,'.eq("code_hint", codeHint)');
has("postgres-bind-rpc-call",postgres,'rpc("drop_public_bind_session_package_atomic"');
has("postgres-finalize-rpc-call",postgres,'rpc("drop_public_claim_finalization_atomic"');
has("postgres-import-rpc-call",postgres,'rpc("drop_public_import_file_state_atomic"');
has("postgres-activation-rpc-call",postgres,'rpc("drop_public_activate_postgres_store"');
has("postgres-error-code-map",postgres,"ERROR_MAP");

has("resolver-auto-mode",resolver,'return value === "file" || value === "postgresql" ? value : "auto"');
has("resolver-secure-marker-mode",resolver,"mode: 0o600");
has("resolver-secure-marker-dir",resolver,"mode: 0o700");
has("resolver-schema-missing-file",resolver,'let activeStore: DropPublicStoreName = "file"');
has("resolver-migration-required",resolver,"migrationRequired");
has("resolver-empty-auto-activation",resolver,'empty-file-auto-activation');
has("resolver-postgres-lock",resolver,"postgresLocked");
has("resolver-database-marker-recovery",resolver,"database-marker-recovery");
has("resolver-fail-closed",resolver,"DROP_PUBLIC_POSTGRES_FAIL_CLOSED");
has("resolver-count-check",resolver,"DROP_PUBLIC_POSTGRES_IMPORT_COUNT_MISMATCH");
has("resolver-cache",resolver,"15_000");

has("facade-file-adapter",facade,'import * as file');
has("facade-postgres-adapter",facade,'import * as postgres');
has("facade-store-resolution",facade,"resolveDropPublicStore");
has("facade-no-api-import-change",facade,"createDropSendCode");
has("facade-safe-store-meta",facade,"multiInstanceReady");
has("facade-migration-export",facade,"runDropPublicStoreMigration");
has("workflow-race-compensation-helper",workflowService,"rollbackUnboundPublicPackage");
has("workflow-race-compensation-delete",workflowService,'from("drop_packages")');
has("workflow-race-compensation-error",workflowService,"DROP_PUBLIC_PACKAGE_COMPENSATION_FAILED");
has("workflow-race-compensation-on-bind",workflowService,"await rollbackUnboundPublicPackage(created.package.id, error)");

has("admin-api-auth",migrationApi,"isLicenseAdminAuthorized");
has("admin-api-status",migrationApi,'getDropPublicStoreStatus({ refresh: true })');
has("admin-api-sql-download",migrationApi,'download") === "sql"');
has("admin-api-content-disposition",migrationApi,"DIMPRO_DROP_095_PUBLIC_WORKFLOW_STORE_BOOTSTRAP.sql");
has("admin-api-migrate",migrationApi,'body?.action !== "migrate"');
has("admin-api-no-secrets",migrationApi,"safeStatus");

has("ui-store-panel",manager,"DropPublicStoreMigrationPanel");
has("ui-version",manager,"DROP 0.9.5");
has("ui-sql-download",panel,"Bootstrap SQL letöltése");
has("ui-migrate",panel,"Import és aktiválás");
has("ui-multi-instance",panel,"Többpéldányos működés");
has("ui-fail-closed-text",panel,"csendes fájltári visszaesés tiltva");

has("runtime-version",runtime,'version: "DROP 0.9.5"');
has("feature-version",flags,'version: "DROP 0.9.5"');
has("runtime-postgres-readiness",runtime,"publicWorkflowPostgres");
has("runtime-migration-readiness",runtime,"publicWorkflowMigrationRequired");
has("runtime-active-store",runtime,"activeStore: publicStore?.activeStore");
has("runtime-fail-closed",runtime,"publicWorkflowFailClosedAfterPostgresActivation");
has("runtime-centralized",runtime,"publicWorkflowConfigurationCentralized");
has("runtime-multi-instance",runtime,"publicWorkflowMultiInstanceReady");
has("env-auto-store",env,"DROP_PUBLIC_STORE_MODE=auto");

const v095=dev.versions.find((row)=>row.projectId==="project_drive_drop"&&row.version==="DROP 0.9.5");
assert.equal(v095?.status,"released");assert.equal(v095?.metadata?.buildId,"SP_JZkDQCPf4sjWDlcOXD");assert.equal(v095?.metadata?.lifecycle,"released-postgresql");checks.push("dev-center-v095-released-postgresql");
const v095Sessions=dev.workSessions.filter((row)=>row.versionId===v095.id);assert.ok(v095Sessions.length>0&&v095Sessions.every((row)=>row.endedAt)&&v095Sessions.reduce((sum,row)=>sum+Number(row.durationMinutes||0),0)>=118);checks.push("dev-center-v095-timers-closed");
console.log(JSON.stringify({ok:true,version:"DROP 0.9.5",checks:checks.length,names:checks},null,2));
