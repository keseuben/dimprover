#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root=process.cwd(), mode=(process.argv[2]||"preflight").trim().toLowerCase();
const migrationRel="supabase/migrations/20260928_drive_document_soft_delete_v050.sql";
const migration=join(root,migrationRel);
const expectedSha="7018cdfa392cc81110ae45e8c21849cd50026fdf901615ddd5a9c9a8f8e89f5e";
const expectedRef="pbgyuznivqvestuksvif";
const approvalPhrase="DEV_ONLY_DRIVE_DOCUMENT_SOFT_DELETE_V050_APPLY_APPROVED";
const backupRoot=process.env.DRIVE_DOCUMENT_SOFT_DELETE_V050_BACKUP_ROOT||"/srv/dimpro-dev/backups/drive-document-soft-delete-v050";
function fail(code,message,details={}){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(2)}
function run(cmd,args){const pw=process.env.DRIVE_DOCUMENT_SOFT_DELETE_V050_DB_PASSWORD||process.env.PGPASSWORD||"";const r=spawnSync(cmd,args,{cwd:root,encoding:"utf8",env:{...process.env,...(pw?{PGPASSWORD:pw}:{})},maxBuffer:16*1024*1024});return{ok:!r.error&&r.status===0,status:r.status,stdout:String(r.stdout||"").trim(),stderr:String(r.stderr||"").trim()}}
function req(cmd){const r=spawnSync(cmd,["--version"],{encoding:"utf8"});if(r.error||r.status!==0)fail("TOOL_MISSING",cmd+" unavailable")}
function readEnv(file,key){if(!existsSync(file))return"";const p=key+"=";for(const raw of readFileSync(file,"utf8").split(/\r?\n/)){const l=raw.trim();if(l.startsWith(p))return l.slice(p.length).trim().replace(/^["']|["']$/g,"")}return""}
function sha(file){return createHash("sha256").update(readFileSync(file)).digest("hex")}
function stamp(){return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z")}
if(!["preflight","apply","verify"].includes(mode))fail("MODE_INVALID","Usage: preflight | apply | verify");
if(!existsSync(migration))fail("MIGRATION_MISSING","Migration missing");
const actualSha=sha(migration); if(actualSha!==expectedSha)fail("MIGRATION_SHA_MISMATCH","Migration SHA mismatch",{expectedSha,actualSha});
for(const c of ["psql","pg_dump","pg_restore"])req(c);
const envFile=join(process.env.NEXT_ENV_PROJECT_DIR||"/srv/dimpro-dev/candidates/drive-pilot",".env.local");
const url=process.env.NEXT_PUBLIC_SUPABASE_URL||readEnv(envFile,"NEXT_PUBLIC_SUPABASE_URL");
const m=String(url).match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i), ref=m?.[1]||"";
if(ref!==expectedRef)fail("DEV_PROJECT_REF_MISMATCH","Canonical DEV target mismatch",{expectedRef,ref});
if(process.env.PROD_SUPABASE_PROJECT_REF&&process.env.PROD_SUPABASE_PROJECT_REF===ref)fail("PROD_TARGET_BLOCKED","DEV and PROD refs match");
const pgpass=String(process.env.PGPASSFILE||"").trim();
if(!(process.env.DRIVE_DOCUMENT_SOFT_DELETE_V050_DB_PASSWORD||process.env.PGPASSWORD||(pgpass&&existsSync(pgpass))||existsSync(join(homedir(),".pgpass"))))fail("DB_CREDENTIAL_REQUIRED","No PostgreSQL credential");
const db={host:process.env.DRIVE_DOCUMENT_SOFT_DELETE_V050_DB_HOST||"aws-0-eu-central-1.pooler.supabase.com",port:process.env.DRIVE_DOCUMENT_SOFT_DELETE_V050_DB_PORT||"5432",user:process.env.DRIVE_DOCUMENT_SOFT_DELETE_V050_DB_USER||("postgres."+ref),database:process.env.DRIVE_DOCUMENT_SOFT_DELETE_V050_DB_NAME||"postgres"};
function args(extra=[]){return["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra]}
function q(sql){const r=run("psql",args(["-Atc",sql]));if(!r.ok)fail("DB_QUERY_FAILED","DEV query failed",{stderr:r.stderr.slice(-1200)});return r.stdout}
function jq(sql,code){try{return JSON.parse(q(sql))}catch{fail(code,"Invalid JSON probe")}}
const prereq=jq("select json_build_object('projects',to_regclass('public.project_core_projects') is not null,'documents',to_regclass('public.drive_core_documents') is not null,'schemaMeta',to_regclass('public.drive_core_schema_meta') is not null,'audit',to_regclass('public.project_core_audit_events') is not null,'changes',to_regclass('public.drive_core_change_events') is not null)::text;","PREREQ_INVALID");
if(!Object.values(prereq).every(Boolean))fail("PREREQUISITES_MISSING","Drive Core prerequisites incomplete",{prereq});
function probe(){return jq("select json_build_object('schemaVersion',coalesce((select schema_version from public.drive_core_schema_meta where component='drive-core'),''),'migrationCount',coalesce((select migration_count from public.drive_core_schema_meta where component='drive-core'),0),'bootstrapId',coalesce((select bootstrap_id from public.drive_core_schema_meta where component='drive-core'),''),'rpc',to_regprocedure('public.drive_core_soft_delete_documents_atomic(text,text[],text)') is not null)::text;","PROBE_INVALID")}
function counts(){return jq("select json_build_object('documents',(select count(*) from public.drive_core_documents),'activeDocuments',(select count(*) from public.drive_core_documents where status<>'DELETED'),'audit',(select count(*) from public.project_core_audit_events),'changes',(select count(*) from public.drive_core_change_events),'schemaMeta',(select count(*) from public.drive_core_schema_meta))::text;","COUNTS_INVALID")}
function security(){return jq("select json_build_object('anonExecute',case when to_regprocedure('public.drive_core_soft_delete_documents_atomic(text,text[],text)') is null then false else has_function_privilege('anon','public.drive_core_soft_delete_documents_atomic(text,text[],text)','EXECUTE') end,'authExecute',case when to_regprocedure('public.drive_core_soft_delete_documents_atomic(text,text[],text)') is null then false else has_function_privilege('authenticated','public.drive_core_soft_delete_documents_atomic(text,text[],text)','EXECUTE') end,'serviceExecute',case when to_regprocedure('public.drive_core_soft_delete_documents_atomic(text,text[],text)') is null then false else has_function_privilege('service_role','public.drive_core_soft_delete_documents_atomic(text,text[],text)','EXECUTE') end)::text;","SECURITY_INVALID")}
function ready(p){return p.schemaVersion==="0.5.0"&&Number(p.migrationCount)===2&&p.bootstrapId==="drive-core-v050-soft-delete-20260928"&&p.rpc}
function secok(s){if(s.anonExecute||s.authExecute||!s.serviceExecute)fail("SECURITY_INVALID","RPC privileges not fail-closed",{security:s})}
const before=probe(), beforeCounts=counts();
if(mode==="preflight"){console.log(JSON.stringify({ok:true,mode,projectRef:ref,migration:migrationRel,migrationSha256:actualSha,alreadyApplied:ready(before),schema:before,rowCounts:beforeCounts,requiredApproval:approvalPhrase,requiredCoordinator:"npm run operation:migration -- node scripts/drive-document-soft-delete-v050-migration-gate.mjs apply"},null,2));process.exit(0)}
if(mode==="verify"){if(!ready(before))fail("TARGET_NOT_READY","Drive Core 0.5.0 not active",{schema:before});const s=security();secok(s);console.log(JSON.stringify({ok:true,mode,projectRef:ref,schema:before,rowCounts:beforeCounts,security:s},null,2));process.exit(0)}
if(String(process.env.DRIVE_DOCUMENT_SOFT_DELETE_V050_MIGRATION_APPROVED||"")!==approvalPhrase)fail("APPROVAL_REQUIRED","Explicit DEV approval required",{requiredApproval:approvalPhrase});
if(process.env.OPERATION!=="migration")fail("COORDINATED_LOCK_REQUIRED","Must run through migration operation lock");
if(ready(before)){const s=security();secok(s);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,schema:before,rowCounts:beforeCounts,security:s},null,2));process.exit(0)}
const dir=join(backupRoot,stamp());mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);
const dumpFile=join(dir,"drive-core-v050-before.dump");
const dump=run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-Fc","-f",dumpFile,"-t","public.drive_core_documents","-t","public.drive_core_schema_meta","-t","public.project_core_audit_events","-t","public.drive_core_change_events"]);
if(!dump.ok)fail("BACKUP_FAILED","Backup failed; migration not applied",{backupDir:dir,stderr:dump.stderr.slice(-1200)});
const list=run("pg_restore",["-l",dumpFile]);for(const name of ["drive_core_documents","drive_core_schema_meta","project_core_audit_events","drive_core_change_events"]){if(!list.ok||!list.stdout.includes(name))fail("BACKUP_VERIFY_FAILED","Backup verify failed",{backupDir:dir,missing:name})}
chmodSync(dumpFile,0o600);writeFileSync(join(dir,"backup.sha256"),sha(dumpFile)+"  "+basename(dumpFile)+"\n",{mode:0o600});writeFileSync(join(dir,"manifest.json"),JSON.stringify({environment:"DEV",productionAccess:"DENY",projectRef:ref,migration:migrationRel,migrationSha256:actualSha,beforeSchema:before,beforeCounts,backupFile:dumpFile},null,2)+"\n",{mode:0o600});
const applied=run("psql",args(["-f",migration]));if(!applied.ok)fail("APPLY_FAILED","Migration failed after verified backup",{backupDir:dir,stderr:applied.stderr.slice(-1800)});
const after=probe();if(!ready(after))fail("POST_VERIFY_FAILED","Schema verification failed",{backupDir:dir,schema:after});
const afterCounts=counts();for(const key of ["documents","activeDocuments","audit","changes","schemaMeta"]){if(Number(afterCounts[key])!==Number(beforeCounts[key]))fail("ROW_COUNT_CHANGED","Protected row count changed",{key,before:beforeCounts,after:afterCounts,backupDir:dir})}
const s=security();secok(s);console.log(JSON.stringify({ok:true,mode,applied:true,projectRef:ref,migration:migrationRel,migrationSha256:actualSha,backupDir:dir,schema:after,rowCounts:afterCounts,security:s},null,2));
