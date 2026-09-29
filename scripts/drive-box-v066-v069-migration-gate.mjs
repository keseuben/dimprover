#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const mode = String(process.argv[2] || "preflight").trim().toLowerCase();
const migrations = [
  {
    rel: "supabase/migrations/20260929_drive_box_folders_v020.sql",
    sha256: "709d7312b66dfe8fb618ae2dcbd2f8f879eb1b7f19997c69438e4a5ddb57aee3",
  },
  {
    rel: "supabase/migrations/20260929_drive_box_lifecycle_v010.sql",
    sha256: "d4151faf89c4bfba4889f72ec47a44449a2cd9c04503c4954d16d0c6de8917e4",
  },
];
const db = {
  host: process.env.PGHOST?.trim() || "aws-0-eu-central-1.pooler.supabase.com",
  port: process.env.PGPORT?.trim() || "5432",
  user: process.env.PGUSER?.trim() || "postgres.pbgyuznivqvestuksvif",
  database: process.env.PGDATABASE?.trim() || "postgres",
  projectRef: "pbgyuznivqvestuksvif",
};
const approvalPhrase = "DEV_ONLY_DRIVE_BOX_V066_V069_APPLY_APPROVED";
const approval = String(process.env.DRIVE_BOX_V066_V069_MIGRATION_APPROVED || "").trim();
const backupRoot = process.env.DRIVE_BOX_V066_V069_BACKUP_ROOT?.trim() || "/srv/dimpro-dev/backups/drive-box-v066-v069";
const rpc = {
  createFolder: "public.drive_workspace_create_box_folder_atomic(text,text,text,text,text)",
  moveItem: "public.drive_workspace_move_box_item_atomic(text,text,text,text,text)",
  lifecycle: "public.drive_workspace_set_box_lifecycle_atomic(text,text,text,text)",
};

function fail(code, message, details = {}, exitCode = 2) {
  console.error(JSON.stringify({ ok:false, mode, code, message, ...details }, null, 2));
  process.exit(exitCode);
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd:root, encoding:"utf8", env:{...process.env}, ...options });
  return { ok:!result.error && result.status===0, status:result.status, stdout:(result.stdout||"").trim(), stderr:(result.stderr||"").trim() };
}
function requireCommand(command) {
  const result = spawnSync(command, ["--version"], { encoding:"utf8" });
  if (result.error || result.status !== 0) fail("DRIVE_BOX_MIGRATION_TOOL_MISSING", command + " is unavailable.");
}
function sha256File(file) { return createHash("sha256").update(readFileSync(file)).digest("hex"); }
function psqlArgs(extra) { return ["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra]; }
function requireDbSecret() {
  if (!String(process.env.PGPASSWORD || "").trim()) {
    fail("DRIVE_BOX_MIGRATION_DB_CREDENTIAL_REQUIRED","PGPASSWORD is not configured for the guarded DEV migration path.",{ projectRef:db.projectRef, database:db.database, user:db.user, port:db.port });
  }
}
function psqlQuery(query) {
  const result = run("psql", psqlArgs(["-Atc",query]));
  if (!result.ok) fail("DRIVE_BOX_MIGRATION_DB_QUERY_FAILED","DEV schema probe failed.",{ status:result.status });
  return result.stdout;
}
function jsonQuery(query, code) {
  try { return JSON.parse(psqlQuery(query)); }
  catch { fail(code,"DEV schema probe returned invalid JSON."); }
}
function schemaProbe() {
  return jsonQuery(`
    select json_build_object(
      'boxesTable',to_regclass('public.drive_core_boxes') is not null,
      'itemsTable',to_regclass('public.drive_core_box_items') is not null,
      'folderTable',to_regclass('public.drive_core_box_folders') is not null,
      'folderIdColumn',exists(select 1 from information_schema.columns where table_schema='public' and table_name='drive_core_box_items' and column_name='folder_id'),
      'lifecycleColumn',exists(select 1 from information_schema.columns where table_schema='public' and table_name='drive_core_boxes' and column_name='lifecycle_status'),
      'readyAtColumn',exists(select 1 from information_schema.columns where table_schema='public' and table_name='drive_core_boxes' and column_name='ready_at'),
      'sentAtColumn',exists(select 1 from information_schema.columns where table_schema='public' and table_name='drive_core_boxes' and column_name='sent_at'),
      'archivedAtColumn',exists(select 1 from information_schema.columns where table_schema='public' and table_name='drive_core_boxes' and column_name='archived_at'),
      'createFolderRpc',to_regprocedure('${rpc.createFolder}') is not null,
      'moveItemRpc',to_regprocedure('${rpc.moveItem}') is not null,
      'lifecycleRpc',to_regprocedure('${rpc.lifecycle}') is not null,
      'boxCount',(select count(*) from public.drive_core_boxes),
      'boxItemCount',(select count(*) from public.drive_core_box_items)
    )::text;
  `,"DRIVE_BOX_MIGRATION_SCHEMA_PROBE_INVALID");
}
function targetReady(p) {
  return p.boxesTable && p.itemsTable && p.folderTable && p.folderIdColumn
    && p.lifecycleColumn && p.readyAtColumn && p.sentAtColumn && p.archivedAtColumn
    && p.createFolderRpc && p.moveItemRpc && p.lifecycleRpc;
}
function cleanBaseline(p) {
  return p.boxesTable && p.itemsTable && !p.folderTable && !p.folderIdColumn
    && !p.lifecycleColumn && !p.readyAtColumn && !p.sentAtColumn && !p.archivedAtColumn
    && !p.createFolderRpc && !p.moveItemRpc && !p.lifecycleRpc;
}
function securityProbe() {
  return jsonQuery(`
    select json_build_object(
      'folderRls',coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.drive_core_box_folders')),false),
      'anonFolderSelect',case when to_regclass('public.drive_core_box_folders') is null then false else has_table_privilege('anon','public.drive_core_box_folders','SELECT') end,
      'authenticatedFolderSelect',case when to_regclass('public.drive_core_box_folders') is null then false else has_table_privilege('authenticated','public.drive_core_box_folders','SELECT') end,
      'serviceFolderSelect',case when to_regclass('public.drive_core_box_folders') is null then false else has_table_privilege('service_role','public.drive_core_box_folders','SELECT') end,
      'serviceCreateFolder',case when to_regprocedure('${rpc.createFolder}') is null then false else has_function_privilege('service_role','${rpc.createFolder}','EXECUTE') end,
      'anonCreateFolder',case when to_regprocedure('${rpc.createFolder}') is null then false else has_function_privilege('anon','${rpc.createFolder}','EXECUTE') end,
      'serviceMoveItem',case when to_regprocedure('${rpc.moveItem}') is null then false else has_function_privilege('service_role','${rpc.moveItem}','EXECUTE') end,
      'anonMoveItem',case when to_regprocedure('${rpc.moveItem}') is null then false else has_function_privilege('anon','${rpc.moveItem}','EXECUTE') end,
      'serviceLifecycle',case when to_regprocedure('${rpc.lifecycle}') is null then false else has_function_privilege('service_role','${rpc.lifecycle}','EXECUTE') end,
      'anonLifecycle',case when to_regprocedure('${rpc.lifecycle}') is null then false else has_function_privilege('anon','${rpc.lifecycle}','EXECUTE') end
    )::text;
  `,"DRIVE_BOX_MIGRATION_SECURITY_PROBE_INVALID");
}
function assertSecurity(s) {
  if (!s.folderRls || s.anonFolderSelect || s.authenticatedFolderSelect || !s.serviceFolderSelect
    || !s.serviceCreateFolder || s.anonCreateFolder || !s.serviceMoveItem || s.anonMoveItem
    || !s.serviceLifecycle || s.anonLifecycle) {
    fail("DRIVE_BOX_MIGRATION_SECURITY_NOT_READY","CsomagBOX folder/lifecycle security is not service-role-only.",{ security:s });
  }
}
function utcStamp() { return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z"); }

if (!["preflight","apply","verify"].includes(mode)) fail("DRIVE_BOX_MIGRATION_MODE_INVALID","Usage: preflight | apply | verify");
for (const command of ["psql","pg_dump","pg_restore"]) requireCommand(command);
for (const migration of migrations) {
  const actual = sha256File(join(root,migration.rel));
  if (actual !== migration.sha256) fail("DRIVE_BOX_MIGRATION_SHA_MISMATCH","Migration SHA-256 mismatch.",{ migration:migration.rel, expected:migration.sha256, actual });
}
requireDbSecret();
const before = schemaProbe();

if (mode === "preflight") {
  if (targetReady(before)) {
    const security = securityProbe(); assertSecurity(security);
    console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,schema:before,security,migrations},null,2)); process.exit(0);
  }
  if (!cleanBaseline(before)) fail("DRIVE_BOX_MIGRATION_BASELINE_MISMATCH","DEV schema is partially migrated or differs from the expected V0.6.5 baseline.",{schema:before});
  console.log(JSON.stringify({ok:true,mode,readyForApply:true,alreadyApplied:false,schema:before,migrations,requiredApproval:approvalPhrase},null,2)); process.exit(0);
}

if (mode === "verify") {
  if (!targetReady(before)) fail("DRIVE_BOX_MIGRATION_TARGET_NOT_READY","CsomagBOX V0.6.6/V0.6.9 target schema is not active.",{schema:before});
  const security = securityProbe(); assertSecurity(security);
  console.log(JSON.stringify({ok:true,mode,schema:before,security,migrations},null,2)); process.exit(0);
}

if (approval !== approvalPhrase) fail("DRIVE_BOX_MIGRATION_APPROVAL_REQUIRED","Explicit DEV-only approval is required for apply mode.",{requiredApproval:approvalPhrase});
if (targetReady(before)) {
  const security = securityProbe(); assertSecurity(security);
  console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,schema:before,security},null,2)); process.exit(0);
}
if (!cleanBaseline(before)) fail("DRIVE_BOX_MIGRATION_BASELINE_MISMATCH","Apply requires an exact non-migrated CsomagBOX baseline.",{schema:before});

const backupDir = join(backupRoot,utcStamp());
mkdirSync(backupDir,{recursive:true,mode:0o700}); chmodSync(backupDir,0o700);
const backupFile = join(backupDir,"drive-box-before.dump");
const manifestFile = join(backupDir,"manifest.json");
const dumped = run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-Fc","-f",backupFile,
  "-t","public.drive_core_boxes","-t","public.drive_core_box_items","-t","public.project_core_audit_events","-t","public.drive_core_change_events"]);
if (!dumped.ok) fail("DRIVE_BOX_MIGRATION_BACKUP_FAILED","DEV backup failed; migration not applied.",{status:dumped.status});
const listed = run("pg_restore",["-l",backupFile]);
if (!listed.ok || !listed.stdout.includes("drive_core_boxes") || !listed.stdout.includes("drive_core_box_items")) {
  fail("DRIVE_BOX_MIGRATION_BACKUP_VERIFY_FAILED","Backup archive verification failed.");
}
writeFileSync(manifestFile,JSON.stringify({createdAt:new Date().toISOString(),projectRef:db.projectRef,migrations,beforeSchema:before,backupFile},null,2)+"\n",{mode:0o600});
chmodSync(backupFile,0o600); chmodSync(manifestFile,0o600);

for (const migration of migrations) {
  const applied = run("psql",psqlArgs(["-f",join(root,migration.rel)]));
  if (!applied.ok) fail("DRIVE_BOX_MIGRATION_APPLY_FAILED","Migration apply failed after verified backup.",{migration:migration.rel,backupDir,status:applied.status});
}
const after = schemaProbe();
if (!targetReady(after)) fail("DRIVE_BOX_MIGRATION_POST_APPLY_INVALID","Target schema verification failed.",{backupDir,schema:after});
if (Number(after.boxCount)!==Number(before.boxCount) || Number(after.boxItemCount)!==Number(before.boxItemCount)) {
  fail("DRIVE_BOX_MIGRATION_ROW_COUNT_CHANGED","CsomagBOX row counts changed unexpectedly.",{backupDir,before:{boxCount:before.boxCount,boxItemCount:before.boxItemCount},after:{boxCount:after.boxCount,boxItemCount:after.boxItemCount}});
}
const security = securityProbe(); assertSecurity(security);
console.log(JSON.stringify({ok:true,mode,applied:true,backupDir,schema:after,security,migrations},null,2));
