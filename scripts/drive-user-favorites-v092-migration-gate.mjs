#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const mode = (process.argv[2] || "preflight").trim().toLowerCase();
const migrationRel = "supabase/migrations/20261003_drive_user_favorites_v092.sql";
const migration = join(root, migrationRel);
const expectedSha = "7a7b3c9adb41cbd42b3d294d82ad66852045e27478393a656fd8aca49aaa2f73";
const expectedRef = "pbgyuznivqvestuksvif";
const expectedDirectHost = "db." + expectedRef + ".supabase.co";
const approvalPhrase = "DEV_ONLY_DRIVE_USER_FAVORITES_V010_APPLY_APPROVED";
const backupRoot = process.env.DRIVE_USER_FAVORITES_V010_BACKUP_ROOT || "/srv/dimpro-dev/backups/drive-user-favorites-v010";
const pgpassFile = process.env.DRIVE_USER_FAVORITES_V010_PGPASS_FILE || "/home/dimproadmin/.pgpass";

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
if(!existsSync(migration)) fail("MIGRATION_MISSING","Drive Favorites 0.1.0 migration missing");
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
function coreProbe() {
  return jsonQuery(
    "select json_build_object("+
    "'schemaVersion',coalesce((select schema_version from public.drive_core_schema_meta where component='drive-core'),''),"+
    "'migrationCount',coalesce((select migration_count from public.drive_core_schema_meta where component='drive-core'),0),"+
    "'bootstrapId',coalesce((select bootstrap_id from public.drive_core_schema_meta where component='drive-core'),'')"+
    ")::text;","CORE_PROBE_INVALID");
}
function addonTables() {
  return jsonQuery(
    "select json_build_object("+
    "'favoritesTable',to_regclass('public.drive_core_user_favorites') is not null,"+
    "'metaTable',to_regclass('public.drive_favorites_schema_meta') is not null"+
    ")::text;","ADDON_TABLE_PROBE_INVALID");
}
function addonMeta() {
  if (query("select to_regclass('public.drive_favorites_schema_meta') is not null;") !== "t") {
    return { schemaVersion:"", migrationCount:0, bootstrapId:"" };
  }
  return jsonQuery(
    "select json_build_object("+
    "'schemaVersion',coalesce((select schema_version from public.drive_favorites_schema_meta where component='drive-favorites'),''),"+
    "'migrationCount',coalesce((select migration_count from public.drive_favorites_schema_meta where component='drive-favorites'),0),"+
    "'bootstrapId',coalesce((select bootstrap_id from public.drive_favorites_schema_meta where component='drive-favorites'),'')"+
    ")::text;","ADDON_META_INVALID");
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
function favoriteCount() {
  if (query("select to_regclass('public.drive_core_user_favorites') is not null;") !== "t") return 0;
  return Number(query("select count(*) from public.drive_core_user_favorites;") || 0);
}
function coreReady(v){return v.schemaVersion==="0.9.1"&&Number(v.migrationCount)===8&&v.bootstrapId==="drive-core-v091-folder-trash-20261003";}
function targetReady(core,tables,meta){
  return coreReady(core)
    && tables.favoritesTable===true
    && tables.metaTable===true
    && meta.schemaVersion==="0.1.0"
    && Number(meta.migrationCount)===1
    && meta.bootstrapId==="drive-favorites-v010-20261003";
}
function targetIntegrity(){
  return jsonQuery(
    "select json_build_object("+
    "'favoritesTable',to_regclass('public.drive_core_user_favorites') is not null,"+
    "'metaTable',to_regclass('public.drive_favorites_schema_meta') is not null,"+
    "'primaryKey',exists(select 1 from pg_constraint where conname='drive_core_user_favorites_pkey'),"+
    "'entityCheck',exists(select 1 from pg_constraint where conname='drive_core_user_favorites_entity_type_check'),"+
    "'serviceSelect',has_table_privilege('service_role','public.drive_core_user_favorites','SELECT'),"+
    "'serviceInsert',has_table_privilege('service_role','public.drive_core_user_favorites','INSERT'),"+
    "'serviceUpdate',has_table_privilege('service_role','public.drive_core_user_favorites','UPDATE'),"+
    "'serviceDelete',has_table_privilege('service_role','public.drive_core_user_favorites','DELETE'),"+
    "'serviceMetaSelect',has_table_privilege('service_role','public.drive_favorites_schema_meta','SELECT'),"+
    "'anonSelect',has_table_privilege('anon','public.drive_core_user_favorites','SELECT'),"+
    "'authenticatedSelect',has_table_privilege('authenticated','public.drive_core_user_favorites','SELECT')"+
    ")::text;","TARGET_INTEGRITY_INVALID");
}
function assertIntegrity(v){
  if(v.favoritesTable!==true||v.metaTable!==true||v.primaryKey!==true||v.entityCheck!==true||v.serviceSelect!==true||v.serviceInsert!==true||v.serviceUpdate!==true||v.serviceDelete!==true||v.serviceMetaSelect!==true||v.anonSelect!==false||v.authenticatedSelect!==false)
    fail("TARGET_INTEGRITY_FAILED","Drive Favorites table privilege/integrity check failed",{integrity:v});
}

const beforeCore=coreProbe();
const beforeTables=addonTables();
const beforeMeta=addonMeta();
const beforeCounts=counts();

if(mode==="preflight"){
  if(!coreReady(beforeCore)) fail("CORE_V091_REQUIRED","Drive Core 0.9.1 must remain active",{core:beforeCore});
  console.log(JSON.stringify({ok:true,mode,databaseHost:db.host,projectRef:expectedRef,productionAccess:"DENY",migration:migrationRel,migrationSha256:actualSha,alreadyApplied:targetReady(beforeCore,beforeTables,beforeMeta),core:beforeCore,addonTables:beforeTables,addonMeta:beforeMeta,rowCounts:beforeCounts,favoriteRows:favoriteCount(),requiredApproval:approvalPhrase,destructiveActionsPerformed:false},null,2));
  process.exit(0);
}
if(mode==="verify"){
  if(!targetReady(beforeCore,beforeTables,beforeMeta)) fail("TARGET_NOT_READY","Drive Favorites 0.1.0 is not active",{core:beforeCore,addonTables:beforeTables,addonMeta:beforeMeta});
  const integrity=targetIntegrity(); assertIntegrity(integrity);
  console.log(JSON.stringify({ok:true,mode,databaseHost:db.host,projectRef:expectedRef,productionAccess:"DENY",core:beforeCore,addonTables:beforeTables,addonMeta:beforeMeta,rowCounts:beforeCounts,favoriteRows:favoriteCount(),integrity,destructiveActionsPerformed:false},null,2));
  process.exit(0);
}
if(String(process.env.DRIVE_USER_FAVORITES_V010_MIGRATION_APPROVED||"")!==approvalPhrase) fail("APPROVAL_REQUIRED","Explicit DEV approval required",{requiredApproval:approvalPhrase});
if(process.env.OPERATION!=="migration") fail("COORDINATED_LOCK_REQUIRED","Must run through migration operation lock");
if(targetReady(beforeCore,beforeTables,beforeMeta)){
  const integrity=targetIntegrity(); assertIntegrity(integrity);
  console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,core:beforeCore,addonMeta:beforeMeta,rowCounts:beforeCounts,favoriteRows:favoriteCount(),integrity,productionAccess:"DENY"},null,2));
  process.exit(0);
}
if(!coreReady(beforeCore)) fail("UNEXPECTED_CORE_SCHEMA","Migration start marker is not Drive Core 0.9.1",{core:beforeCore});

const backupDir=join(backupRoot,stamp());
mkdirSync(backupDir,{recursive:true,mode:0o700}); chmodSync(backupDir,0o700);
const dumpFile=join(backupDir,"drive-favorites-v010-before.dump");
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
writeFileSync(join(backupDir,"manifest.json"),JSON.stringify({environment:"DEV",productionAccess:"DENY",databaseHost:db.host,projectRef:expectedRef,migration:migrationRel,migrationSha256:actualSha,beforeCore,beforeCounts,backupFile:dumpFile},null,2)+"\n",{mode:0o600});

const applied=run("psql",args(["-f",migration]));
if(!applied.ok) fail("APPLY_FAILED","Migration failed after verified backup",{backupDir,stderr:applied.stderr.slice(-2400)});

const afterCore=coreProbe();
const afterTables=addonTables();
const afterMeta=addonMeta();
if(!targetReady(afterCore,afterTables,afterMeta)) fail("POST_VERIFY_FAILED","Drive Favorites 0.1.0 verification failed",{backupDir,core:afterCore,addonTables:afterTables,addonMeta:afterMeta});
const afterCounts=counts();
for(const key of ["folders","documents","versions","aclEntries","passwords","passwordAttempts","schemaMeta"]){
  if(Number(afterCounts[key])!==Number(beforeCounts[key])) fail("ROW_COUNT_CHANGED","Protected row count changed during additive migration",{key,before:beforeCounts,after:afterCounts,backupDir});
}
const integrity=targetIntegrity(); assertIntegrity(integrity);
console.log(JSON.stringify({ok:true,mode,databaseHost:db.host,projectRef:expectedRef,productionAccess:"DENY",migrationSha256:actualSha,backupDir,beforeCore,afterCore,afterMeta,beforeCounts,afterCounts,favoriteRows:favoriteCount(),integrity},null,2));
