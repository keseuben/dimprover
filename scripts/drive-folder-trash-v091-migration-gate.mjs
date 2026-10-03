#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const mode = (process.argv[2] || "preflight").trim().toLowerCase();
const migrationRel = "supabase/migrations/20261003_drive_folder_trash_v091.sql";
const migration = join(root, migrationRel);
const expectedSha = "a8b8ae1803243edbfe69e69a1c32d4c0f7b3d82f44a602d909cca170ca18fac8";
const expectedRef = "pbgyuznivqvestuksvif";
const expectedDirectHost = `db.${expectedRef}.supabase.co`;
const approvalPhrase = "DEV_ONLY_DRIVE_FOLDER_TRASH_V091_APPLY_APPROVED";
const backupRoot = process.env.DRIVE_FOLDER_TRASH_V091_BACKUP_ROOT || "/srv/dimpro-dev/backups/drive-folder-trash-v091";
const pgpassFile = process.env.DRIVE_FOLDER_TRASH_V091_PGPASS_FILE || "/home/dimproadmin/.pgpass";

function fail(code, message, details = {}) {
  console.error(JSON.stringify({ ok:false, mode, code, message, ...details }, null, 2));
  process.exit(2);
}
function sha(file) { return createHash("sha256").update(readFileSync(file)).digest("hex"); }
function stamp() { return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }
function parsePgpassLine(line) {
  const fields=[]; let current=""; let escaped=false;
  for (const ch of line) {
    if (escaped) { current += ch; escaped=false; continue; }
    if (ch === "\\") { escaped=true; continue; }
    if (ch === ":" && fields.length < 4) { fields.push(current); current=""; continue; }
    current += ch;
  }
  fields.push(current);
  return fields.length === 5 ? fields : null;
}
function canonicalDbCredential() {
  if (!existsSync(pgpassFile)) fail("DB_CREDENTIAL_REQUIRED", "Canonical DEV .pgpass is unavailable");
  const lines=readFileSync(pgpassFile,"utf8").split(/\r?\n/).map(v=>v.trim()).filter(v=>v && !v.startsWith("#"));
  for (const line of lines) {
    const parts=parsePgpassLine(line);
    if (!parts) continue;
    const [host,port,database,user,password]=parts;
    if (host===expectedDirectHost && port==="5432" && database==="postgres" && user==="postgres" && password) {
      return {host,port,database,user,password};
    }
  }
  fail("DEV_DB_CREDENTIAL_MISMATCH", "Canonical DEV .pgpass has no matching direct database entry", { expectedDirectHost });
}
const db=canonicalDbCredential();

function run(cmd,args) {
  const result=spawnSync(cmd,args,{
    cwd:root,
    encoding:"utf8",
    env:{...process.env,PGPASSWORD:db.password},
    maxBuffer:32*1024*1024,
  });
  return {ok:!result.error&&result.status===0,status:result.status,stdout:String(result.stdout||"").trim(),stderr:String(result.stderr||"").trim()};
}
function requireTool(cmd) {
  const r=spawnSync(cmd,["--version"],{encoding:"utf8"});
  if(r.error||r.status!==0) fail("TOOL_MISSING",cmd+" unavailable");
}
if(!["preflight","apply","verify"].includes(mode)) fail("MODE_INVALID","Usage: preflight | apply | verify");
if(!existsSync(migration)) fail("MIGRATION_MISSING","V0.9.1 migration missing");
const actualSha=sha(migration);
if(actualSha!==expectedSha) fail("MIGRATION_SHA_MISMATCH","Migration SHA mismatch",{expectedSha,actualSha});
for(const tool of ["psql","pg_dump","pg_restore"]) requireTool(tool);
if(db.host!==expectedDirectHost||db.user!=="postgres"||db.database!=="postgres") fail("PROD_TARGET_BLOCKED","DEV database identity mismatch");

function args(extra=[]) { return ["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra]; }
function query(sql) {
  const r=run("psql",args(["-Atc",sql]));
  if(!r.ok) fail("DB_QUERY_FAILED","DEV query failed",{stderr:r.stderr.slice(-1800)});
  return r.stdout;
}
function jsonQuery(sql,code) { try{return JSON.parse(query(sql));}catch{fail(code,"Invalid JSON probe");} }
function probe() {
  return jsonQuery(
    "select json_build_object("+
    "'schemaVersion',coalesce((select schema_version from public.drive_core_schema_meta where component='drive-core'),''),"+
    "'migrationCount',coalesce((select migration_count from public.drive_core_schema_meta where component='drive-core'),0),"+
    "'bootstrapId',coalesce((select bootstrap_id from public.drive_core_schema_meta where component='drive-core'),''),"+
    "'folderTrashRpc',to_regprocedure('public.drive_core_soft_delete_folder_tree_atomic(text,text,text)') is not null"+
    ")::text;","PROBE_INVALID");
}
function counts() {
  return jsonQuery(
    "select json_build_object("+
    "'folders',(select count(*) from public.drive_core_folders),"+
    "'documents',(select count(*) from public.drive_core_documents),"+
    "'versions',(select count(*) from public.drive_core_document_versions),"+
    "'aclEntries',(select count(*) from public.drive_core_folder_acl_entries),"+
    "'passwords',(select count(*) from public.drive_core_folder_passwords),"+
    "'passwordAttempts',(select count(*) from public.drive_core_folder_password_attempts),"+
    "'schemaMeta',(select count(*) from public.drive_core_schema_meta)"+
    ")::text;","COUNTS_INVALID");
}
function predecessorReady(v){return v.schemaVersion==="0.8.6"&&Number(v.migrationCount)===7&&v.bootstrapId==="drive-core-v086-folder-password-gate-20261002";}
function targetReady(v){return v.schemaVersion==="0.9.1"&&Number(v.migrationCount)===8&&v.bootstrapId==="drive-core-v091-folder-trash-20261003"&&v.folderTrashRpc===true;}
function targetIntegrity(){
  return jsonQuery(
    "select json_build_object("+
    "'rpc',to_regprocedure('public.drive_core_soft_delete_folder_tree_atomic(text,text,text)') is not null,"+
    "'securityDefiner',coalesce((select prosecdef from pg_proc where oid=to_regprocedure('public.drive_core_soft_delete_folder_tree_atomic(text,text,text)')),false),"+
    "'serviceRoleExecute',has_function_privilege('service_role','public.drive_core_soft_delete_folder_tree_atomic(text,text,text)','EXECUTE'),"+
    "'anonExecute',has_function_privilege('anon','public.drive_core_soft_delete_folder_tree_atomic(text,text,text)','EXECUTE'),"+
    "'authenticatedExecute',has_function_privilege('authenticated','public.drive_core_soft_delete_folder_tree_atomic(text,text,text)','EXECUTE')"+
    ")::text;","TARGET_INTEGRITY_INVALID");
}
function assertIntegrity(v){
  if(v.rpc!==true||v.securityDefiner!==true||v.serviceRoleExecute!==true||v.anonExecute!==false||v.authenticatedExecute!==false)
    fail("TARGET_INTEGRITY_FAILED","V0.9.1 RPC privilege/integrity check failed",{integrity:v});
}
const before=probe();
const beforeCounts=counts();

if(mode==="preflight"){
  if(!predecessorReady(before)&&!targetReady(before)) fail("PREDECESSOR_REQUIRED","Drive Core 0.8.6 must be active before 0.9.1",{schema:before});
  console.log(JSON.stringify({ok:true,mode,databaseHost:db.host,projectRef:expectedRef,productionAccess:"DENY",migration:migrationRel,migrationSha256:actualSha,alreadyApplied:targetReady(before),schema:before,rowCounts:beforeCounts,requiredApproval:approvalPhrase,destructiveActionsPerformed:false},null,2));
  process.exit(0);
}
if(mode==="verify"){
  if(!targetReady(before)) fail("TARGET_NOT_READY","Drive Core 0.9.1 is not active",{schema:before});
  const integrity=targetIntegrity(); assertIntegrity(integrity);
  console.log(JSON.stringify({ok:true,mode,databaseHost:db.host,projectRef:expectedRef,productionAccess:"DENY",schema:before,rowCounts:beforeCounts,integrity,destructiveActionsPerformed:false},null,2));
  process.exit(0);
}
if(String(process.env.DRIVE_FOLDER_TRASH_V091_MIGRATION_APPROVED||"")!==approvalPhrase) fail("APPROVAL_REQUIRED","Explicit DEV approval required",{requiredApproval:approvalPhrase});
if(process.env.OPERATION!=="migration") fail("COORDINATED_LOCK_REQUIRED","Must run through migration operation lock");
if(targetReady(before)){
  const integrity=targetIntegrity(); assertIntegrity(integrity);
  console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,schema:before,rowCounts:beforeCounts,integrity,productionAccess:"DENY"},null,2));
  process.exit(0);
}
if(!predecessorReady(before)) fail("UNEXPECTED_START_SCHEMA","Migration start marker is not Drive Core 0.8.6",{schema:before});

const backupDir=join(backupRoot,stamp());
mkdirSync(backupDir,{recursive:true,mode:0o700}); chmodSync(backupDir,0o700);
const dumpFile=join(backupDir,"drive-core-v091-before.dump");
const dump=run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-Fc","-f",dumpFile,
  "-t","public.drive_core_folders","-t","public.drive_core_documents","-t","public.drive_core_document_versions",
  "-t","public.drive_core_folder_acl_entries","-t","public.drive_core_folder_passwords","-t","public.drive_core_folder_password_attempts","-t","public.drive_core_schema_meta"]);
if(!dump.ok) fail("BACKUP_FAILED","Backup failed; migration not applied",{backupDir,stderr:dump.stderr.slice(-1800)});
const list=run("pg_restore",["-l",dumpFile]);
for(const name of ["drive_core_folders","drive_core_documents","drive_core_document_versions","drive_core_folder_acl_entries","drive_core_folder_passwords","drive_core_folder_password_attempts","drive_core_schema_meta"]){
  if(!list.ok||!list.stdout.includes(name)) fail("BACKUP_VERIFY_FAILED","Backup verify failed",{backupDir,missing:name});
}
chmodSync(dumpFile,0o600);
writeFileSync(join(backupDir,"backup.sha256"),sha(dumpFile)+"  "+basename(dumpFile)+"\n",{mode:0o600});
writeFileSync(join(backupDir,"manifest.json"),JSON.stringify({environment:"DEV",productionAccess:"DENY",databaseHost:db.host,projectRef:expectedRef,migration:migrationRel,migrationSha256:actualSha,beforeSchema:before,beforeCounts,backupFile:dumpFile},null,2)+"\n",{mode:0o600});
const applied=run("psql",args(["-f",migration]));
if(!applied.ok) fail("APPLY_FAILED","Migration failed after verified backup",{backupDir,stderr:applied.stderr.slice(-2400)});
const after=probe();
if(!targetReady(after)) fail("POST_VERIFY_FAILED","Drive Core 0.9.1 marker/RPC verification failed",{backupDir,schema:after});
const afterCounts=counts();
for(const key of ["folders","documents","versions","aclEntries","passwords","passwordAttempts","schemaMeta"]){
  if(Number(afterCounts[key])!==Number(beforeCounts[key])) fail("ROW_COUNT_CHANGED","Protected row count changed during schema-only migration",{key,before:beforeCounts,after:afterCounts,backupDir});
}
const integrity=targetIntegrity(); assertIntegrity(integrity);
console.log(JSON.stringify({ok:true,mode,databaseHost:db.host,projectRef:expectedRef,productionAccess:"DENY",migrationSha256:actualSha,backupDir,beforeSchema:before,afterSchema:after,beforeCounts,afterCounts,integrity},null,2));
