#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root=process.cwd();
const mode=(process.argv[2]||"preflight").trim().toLowerCase();
const migrationRel="supabase/migrations/20261007_drive_link_guard_password_ttl_v093.sql";
const migration=join(root,migrationRel);
const expectedSha="5aa8a913389d7c45ef137e3d425288b094d9b8f85be3ca37c80d10afee8318a9";
const expectedRef="pbgyuznivqvestuksvif";
const expectedDirectHost="db."+expectedRef+".supabase.co";
const approvalPhrase="DEV_ONLY_DRIVE_LINK_GUARD_PASSWORD_V093_APPLY_APPROVED";
const backupRoot=process.env.DRIVE_V093_BACKUP_ROOT||"/srv/dimpro-dev/backups/drive-v093-link-guard-password";
const pgpassFile=process.env.DRIVE_V093_PGPASS_FILE||"/home/dimproadmin/.pgpass";

function fail(code,message,details={}){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(2)}
function sha(file){return createHash("sha256").update(readFileSync(file)).digest("hex")}
function stamp(){return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z")}
function parsePgpassLine(line){const fields=[];let current="",escaped=false;for(const ch of line){if(escaped){current+=ch;escaped=false;continue}if(ch==="\\"){escaped=true;continue}if(ch===":"&&fields.length<4){fields.push(current);current="";continue}current+=ch}fields.push(current);return fields.length===5?fields:null}
function canonicalDbCredential(){if(!existsSync(pgpassFile))fail("DB_CREDENTIAL_REQUIRED","Canonical DEV .pgpass is unavailable");for(const line of readFileSync(pgpassFile,"utf8").split(/\r?\n/).map(v=>v.trim()).filter(v=>v&&!v.startsWith("#"))){const p=parsePgpassLine(line);if(!p)continue;const [host,port,database,user,password]=p;if(host===expectedDirectHost&&port==="5432"&&database==="postgres"&&user==="postgres"&&password)return{host,port,database,user,password}}fail("DEV_DB_CREDENTIAL_MISMATCH","Canonical DEV .pgpass has no matching direct database entry",{expectedDirectHost})}
const db=canonicalDbCredential();
function run(cmd,args){const r=spawnSync(cmd,args,{cwd:root,encoding:"utf8",env:{...process.env,PGPASSWORD:db.password},maxBuffer:32*1024*1024});return{ok:!r.error&&r.status===0,status:r.status,stdout:String(r.stdout||"").trim(),stderr:String(r.stderr||"").trim()}}
function requireTool(cmd){const r=spawnSync(cmd,["--version"],{encoding:"utf8"});if(r.error||r.status!==0)fail("TOOL_MISSING",cmd+" unavailable")}
function args(extra=[]){return["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra]}
function query(sql){const r=run("psql",args(["-Atc",sql]));if(!r.ok)fail("DB_QUERY_FAILED","DEV query failed",{stderr:r.stderr.slice(-1800)});return r.stdout}
function jsonQuery(sql,code){try{return JSON.parse(query(sql))}catch{fail(code,"Invalid JSON probe")}}

if(!["preflight","apply","verify"].includes(mode))fail("MODE_INVALID","Usage: preflight | apply | verify");
if(!existsSync(migration))fail("MIGRATION_MISSING","Drive Core V0.9.3 migration missing");
const actualSha=sha(migration);if(actualSha!==expectedSha)fail("MIGRATION_SHA_MISMATCH","Migration SHA mismatch",{expectedSha,actualSha});
for(const tool of ["psql","pg_dump","pg_restore"])requireTool(tool);
if(db.host!==expectedDirectHost||db.user!=="postgres"||db.database!=="postgres")fail("PROD_TARGET_BLOCKED","DEV database identity mismatch");

function probe(){return jsonQuery("select json_build_object("+
"'schemaVersion',coalesce((select schema_version from public.drive_core_schema_meta where component='drive-core'),''),"+
"'migrationCount',coalesce((select migration_count from public.drive_core_schema_meta where component='drive-core'),0),"+
"'bootstrapId',coalesce((select bootstrap_id from public.drive_core_schema_meta where component='drive-core'),''),"+
"'deleteGuardFunction',to_regprocedure('public.drive_core_guard_linked_document_soft_delete()') is not null,"+
"'deleteGuardTrigger',exists(select 1 from pg_trigger where tgname='drive_core_documents_linked_delete_guard' and not tgisinternal),"+
"'passwordFunction',to_regprocedure('public.drive_core_set_folder_password_atomic(text,text,text,integer,text)') is not null"+
")::text;","PROBE_INVALID")}
function counts(){return jsonQuery("select json_build_object("+
"'documents',(select count(*) from public.drive_core_documents),"+
"'formalIssues',(select count(*) from public.drive_core_document_issues),"+
"'issueAttachments',(select count(*) from public.project_issue_attachments),"+
"'projectIssues',(select count(*) from public.project_core_issues),"+
"'boxItems',(select count(*) from public.drive_core_box_items),"+
"'boxes',(select count(*) from public.drive_core_boxes),"+
"'compareFindings',(select count(*) from public.drive_core_compare_findings),"+
"'entityLinks',(select count(*) from public.project_core_entity_links),"+
"'passwords',(select count(*) from public.drive_core_folder_passwords),"+
"'attempts',(select count(*) from public.drive_core_folder_password_attempts),"+
"'meta',(select count(*) from public.drive_core_schema_meta)"+
")::text;","COUNTS_INVALID")}
function predecessor(v){return v.schemaVersion==="0.9.2"&&Number(v.migrationCount)===9&&v.bootstrapId==="drive-core-v092-trash-restore-purge-20261007"}
function target(v){return v.schemaVersion==="0.9.3"&&Number(v.migrationCount)===10&&v.bootstrapId==="drive-core-v093-link-guard-password-ttl-20261007"&&v.deleteGuardFunction&&v.deleteGuardTrigger&&v.passwordFunction}
function integrity(){return jsonQuery("select json_build_object("+
"'guardSecurityDefiner',coalesce((select prosecdef from pg_proc where oid=to_regprocedure('public.drive_core_guard_linked_document_soft_delete()')),false),"+
"'passwordSecurityDefiner',coalesce((select prosecdef from pg_proc where oid=to_regprocedure('public.drive_core_set_folder_password_atomic(text,text,text,integer,text)')),false),"+
"'guardServiceExecute',has_function_privilege('service_role','public.drive_core_guard_linked_document_soft_delete()','EXECUTE'),"+
"'passwordServiceExecute',has_function_privilege('service_role','public.drive_core_set_folder_password_atomic(text,text,text,integer,text)','EXECUTE'),"+
"'guardAnonExecute',has_function_privilege('anon','public.drive_core_guard_linked_document_soft_delete()','EXECUTE'),"+
"'passwordAuthExecute',has_function_privilege('authenticated','public.drive_core_set_folder_password_atomic(text,text,text,integer,text)','EXECUTE'),"+
"'triggerEnabled',coalesce((select tgenabled='O' from pg_trigger where tgname='drive_core_documents_linked_delete_guard' and not tgisinternal),false),"+
"'passwordOneYearClamp',position('525600' in pg_get_functiondef(to_regprocedure('public.drive_core_set_folder_password_atomic(text,text,text,integer,text)')))>0,"+
"'guardIssueAttachmentCheck',position('project_issue_attachments' in pg_get_functiondef(to_regprocedure('public.drive_core_guard_linked_document_soft_delete()')))>0,"+
"'guardFormalIssueCheck',position('drive_core_document_issues' in pg_get_functiondef(to_regprocedure('public.drive_core_guard_linked_document_soft_delete()')))>0,"+
"'guardBoxCheck',position('drive_core_box_items' in pg_get_functiondef(to_regprocedure('public.drive_core_guard_linked_document_soft_delete()')))>0,"+
"'guardCompareCheck',position('drive_core_compare_findings' in pg_get_functiondef(to_regprocedure('public.drive_core_guard_linked_document_soft_delete()')))>0,"+
"'guardEntityLinkCheck',position('project_core_entity_links' in pg_get_functiondef(to_regprocedure('public.drive_core_guard_linked_document_soft_delete()')))>0"+
")::text;","INTEGRITY_INVALID")}
function assertIntegrity(i){if(!i.guardSecurityDefiner||!i.passwordSecurityDefiner||!i.guardServiceExecute||!i.passwordServiceExecute||i.guardAnonExecute||i.passwordAuthExecute||!i.triggerEnabled||!i.passwordOneYearClamp||!i.guardIssueAttachmentCheck||!i.guardFormalIssueCheck||!i.guardBoxCheck||!i.guardCompareCheck||!i.guardEntityLinkCheck)fail("TARGET_INTEGRITY_FAILED","Drive Core V0.9.3 integrity failed",{integrity:i})}

const before=probe(),beforeCounts=counts();
if(mode==="preflight"){
  if(!predecessor(before)&&!target(before))fail("PREDECESSOR_REQUIRED","Drive Core 0.9.2 required before 0.9.3",{schema:before});
  console.log(JSON.stringify({ok:true,mode,databaseHost:db.host,projectRef:expectedRef,productionAccess:"DENY",migration:migrationRel,migrationSha256:actualSha,alreadyApplied:target(before),schema:before,rowCounts:beforeCounts,requiredApproval:approvalPhrase,destructiveActionsPerformed:false},null,2));process.exit(0);
}
if(mode==="verify"){
  if(!target(before))fail("TARGET_NOT_READY","Drive Core 0.9.3 is not active",{schema:before});
  const i=integrity();assertIntegrity(i);
  console.log(JSON.stringify({ok:true,mode,databaseHost:db.host,projectRef:expectedRef,productionAccess:"DENY",schema:before,rowCounts:beforeCounts,integrity:i,destructiveActionsPerformed:false},null,2));process.exit(0);
}
if(String(process.env.DRIVE_V093_MIGRATION_APPROVED||"")!==approvalPhrase)fail("APPROVAL_REQUIRED","Explicit DEV approval required",{requiredApproval:approvalPhrase});
if(process.env.OPERATION!=="migration")fail("COORDINATED_LOCK_REQUIRED","Must run through migration operation lock");
if(target(before)){const i=integrity();assertIntegrity(i);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,schema:before,rowCounts:beforeCounts,integrity:i,productionAccess:"DENY"},null,2));process.exit(0)}
if(!predecessor(before))fail("UNEXPECTED_START_SCHEMA","Migration start marker is not Drive Core 0.9.2",{schema:before});

const backupDir=join(backupRoot,stamp());mkdirSync(backupDir,{recursive:true,mode:0o700});chmodSync(backupDir,0o700);
const dumpFile=join(backupDir,"drive-core-v093-before.dump");
const tables=["drive_core_documents","drive_core_document_issues","project_issue_attachments","project_core_issues","drive_core_box_items","drive_core_boxes","drive_core_compare_findings","project_core_entity_links","drive_core_folder_passwords","drive_core_folder_password_attempts","drive_core_schema_meta"];
const dump=run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-Fc","-f",dumpFile,...tables.flatMap(t=>["-t","public."+t])]);
if(!dump.ok)fail("BACKUP_FAILED","Backup failed; migration not applied",{backupDir,stderr:dump.stderr.slice(-1800)});
const list=run("pg_restore",["-l",dumpFile]);for(const name of tables)if(!list.ok||!list.stdout.includes(name))fail("BACKUP_VERIFY_FAILED","Backup verify failed",{backupDir,missing:name});
chmodSync(dumpFile,0o600);
writeFileSync(join(backupDir,"backup.sha256"),sha(dumpFile)+"  "+basename(dumpFile)+"\n",{mode:0o600});
writeFileSync(join(backupDir,"manifest.json"),JSON.stringify({environment:"DEV",productionAccess:"DENY",databaseHost:db.host,projectRef:expectedRef,migration:migrationRel,migrationSha256:actualSha,beforeSchema:before,beforeCounts,backupFile:dumpFile},null,2)+"\n",{mode:0o600});
const applied=run("psql",args(["-f",migration]));if(!applied.ok)fail("APPLY_FAILED","Migration failed after verified backup",{backupDir,stderr:applied.stderr.slice(-3000)});
const after=probe();if(!target(after))fail("POST_VERIFY_FAILED","Drive Core V0.9.3 marker/trigger verification failed",{backupDir,schema:after});
const afterCounts=counts();for(const key of Object.keys(beforeCounts))if(Number(afterCounts[key])!==Number(beforeCounts[key]))fail("ROW_COUNT_CHANGED","Protected row count changed during schema migration",{key,before:beforeCounts,after:afterCounts,backupDir});
const i=integrity();assertIntegrity(i);
console.log(JSON.stringify({ok:true,mode,databaseHost:db.host,projectRef:expectedRef,productionAccess:"DENY",migrationSha256:actualSha,backupDir,beforeSchema:before,afterSchema:after,beforeCounts,afterCounts,integrity:i},null,2));
