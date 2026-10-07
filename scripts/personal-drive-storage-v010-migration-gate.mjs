#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
const root=process.cwd(), mode=(process.argv[2]||"preflight").trim().toLowerCase();
const migrationRel="supabase/migrations/20261007_personal_drive_storage_v010.sql", migration=join(root,migrationRel);
const expectedSha="2c4884b3b8ad0c216295777bbecba07880e70a80138c9e211a24edb11b75b943", expectedRef="pbgyuznivqvestuksvif", expectedHost="db."+expectedRef+".supabase.co";
const approval="DEV_ONLY_PERSONAL_DRIVE_STORAGE_V010_APPLY_APPROVED";
const backupRoot=process.env.PERSONAL_DRIVE_STORAGE_BACKUP_ROOT||"/srv/dimpro-dev/backups/personal-drive-storage-v010";
const pgpass=process.env.PERSONAL_DRIVE_STORAGE_PGPASS_FILE||"/home/dimproadmin/.pgpass";
function fail(code,message,details={}){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(2)}
function sha(file){return createHash("sha256").update(readFileSync(file)).digest("hex")}
function parse(line){const f=[];let c="",e=false;for(const ch of line){if(e){c+=ch;e=false;continue}if(ch==="\\"){e=true;continue}if(ch===":"&&f.length<4){f.push(c);c="";continue}c+=ch}f.push(c);return f.length===5?f:null}
if(!existsSync(pgpass))fail("DB_CREDENTIAL_REQUIRED","DEV .pgpass unavailable");let db=null;for(const line of readFileSync(pgpass,"utf8").split(/\r?\n/)){const p=parse(line.trim());if(p&&p[0]===expectedHost&&p[1]==="5432"&&p[2]==="postgres"&&p[3]==="postgres"&&p[4]){db={host:p[0],port:p[1],database:p[2],user:p[3],password:p[4]};break}}if(!db)fail("DEV_DB_CREDENTIAL_MISMATCH","Canonical DEV DB credential missing");
function run(cmd,args){const r=spawnSync(cmd,args,{cwd:root,encoding:"utf8",env:{...process.env,PGPASSWORD:db.password},maxBuffer:32*1024*1024});return{ok:!r.error&&r.status===0,stdout:String(r.stdout||"").trim(),stderr:String(r.stderr||"").trim()}}
function args(extra=[]){return["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra]}
function query(sql){const r=run("psql",args(["-Atc",sql]));if(!r.ok)fail("DB_QUERY_FAILED","DEV query failed",{stderr:r.stderr.slice(-2200)});return r.stdout}
function json(sql,code){try{return JSON.parse(query(sql))}catch{fail(code,"Invalid JSON probe")}}
if(!["preflight","apply","verify"].includes(mode))fail("MODE_INVALID","Usage: preflight | apply | verify");
if(!existsSync(migration))fail("MIGRATION_MISSING","Personal Drive storage migration missing");const actualSha=sha(migration);if(actualSha!==expectedSha)fail("MIGRATION_SHA_MISMATCH","Migration SHA mismatch",{expectedSha,actualSha});
function probe(){return json("select json_build_object("+
"'contentCore',(select json_build_object('version',schema_version,'count',migration_count,'bootstrap',bootstrap_id) from public.dimpro_content_schema_meta where component='content-core'),"+
"'storageMeta',(select json_build_object('version',schema_version,'count',migration_count,'bootstrap',bootstrap_id) from public.dimpro_content_schema_meta where component='personal-drive-storage'),"+
"'limitTable',to_regclass('public.dimpro_personal_drive_storage_limits') is not null,"+
"'ensureRpc',to_regprocedure('public.dimpro_personal_drive_ensure_ref_atomic(uuid,uuid,text,text,text,bigint)') is not null,"+
"'restoreRpc',to_regprocedure('public.dimpro_personal_drive_restore_refs_atomic(uuid,uuid[])') is not null"+")::text;","PROBE_INVALID")}
function counts(){return json("select json_build_object("+
"'objects',(select count(*) from public.dimpro_content_objects),"+
"'refs',(select count(*) from public.dimpro_content_refs),"+
"'boxItems',(select count(*) from public.dimpro_personal_drive_box_items),"+
"'boxes',(select count(*) from public.dimpro_personal_drive_boxes),"+
"'meta',(select count(*) from public.dimpro_content_schema_meta)"+")::text;","COUNTS_INVALID")}
function baseline(v){return v.contentCore?.version==="0.1.0"&&Number(v.contentCore?.count)===1&&v.contentCore?.bootstrap==="content-core-user-drive-v010-20260818"}
function target(v){return baseline(v)&&v.storageMeta?.version==="0.1.0"&&Number(v.storageMeta?.count)===1&&v.storageMeta?.bootstrap==="personal-drive-storage-v010-20261007"&&v.limitTable&&v.ensureRpc&&v.restoreRpc}
function integrity(){return json("select json_build_object("+
"'rls',(select relrowsecurity from pg_class where oid='public.dimpro_personal_drive_storage_limits'::regclass),"+
"'ensureSecurityDefiner',(select prosecdef from pg_proc where oid=to_regprocedure('public.dimpro_personal_drive_ensure_ref_atomic(uuid,uuid,text,text,text,bigint)')),"+
"'restoreSecurityDefiner',(select prosecdef from pg_proc where oid=to_regprocedure('public.dimpro_personal_drive_restore_refs_atomic(uuid,uuid[])')),"+
"'ensureService',has_function_privilege('service_role','public.dimpro_personal_drive_ensure_ref_atomic(uuid,uuid,text,text,text,bigint)','EXECUTE'),"+
"'restoreService',has_function_privilege('service_role','public.dimpro_personal_drive_restore_refs_atomic(uuid,uuid[])','EXECUTE'),"+
"'ensureAuth',has_function_privilege('authenticated','public.dimpro_personal_drive_ensure_ref_atomic(uuid,uuid,text,text,text,bigint)','EXECUTE'),"+
"'restoreAnon',has_function_privilege('anon','public.dimpro_personal_drive_restore_refs_atomic(uuid,uuid[])','EXECUTE'),"+
"'quotaLock',position('personal-drive-quota:' in pg_get_functiondef(to_regprocedure('public.dimpro_personal_drive_ensure_ref_atomic(uuid,uuid,text,text,text,bigint)')))>0,"+
"'quotaGuard',position('PERSONAL_DRIVE_QUOTA_EXCEEDED' in pg_get_functiondef(to_regprocedure('public.dimpro_personal_drive_ensure_ref_atomic(uuid,uuid,text,text,text,bigint)')))>0,"+
"'trashCounts',position('REMOVED' in pg_get_functiondef(to_regprocedure('public.dimpro_personal_drive_ensure_ref_atomic(uuid,uuid,text,text,text,bigint)')))>0,"+
"'restoreScope',position('PERSONAL_DRIVE_RESTORE_SCOPE_MISMATCH' in pg_get_functiondef(to_regprocedure('public.dimpro_personal_drive_restore_refs_atomic(uuid,uuid[])')))>0"+")::text;","INTEGRITY_INVALID")}
function assertIntegrity(i){if(!i.rls||!i.ensureSecurityDefiner||!i.restoreSecurityDefiner||!i.ensureService||!i.restoreService||i.ensureAuth||i.restoreAnon||!i.quotaLock||!i.quotaGuard||!i.trashCounts||!i.restoreScope)fail("TARGET_INTEGRITY_FAILED","Personal Drive storage integrity failed",{integrity:i})}
const before=probe(), beforeCounts=counts();
if(mode==="preflight"){if(!baseline(before))fail("CONTENT_CORE_BASELINE_REQUIRED","Content Core V0.1.0 baseline required",{schema:before});if(before.storageMeta&&!target(before))fail("PARTIAL_TARGET_DETECTED","Personal Drive storage target is partially applied",{schema:before});console.log(JSON.stringify({ok:true,mode,databaseHost:db.host,projectRef:expectedRef,productionAccess:"DENY",migration:migrationRel,migrationSha256:actualSha,alreadyApplied:target(before),schema:before,rowCounts:beforeCounts,requiredApproval:approval,destructiveActionsPerformed:false},null,2));process.exit(0)}
if(mode==="verify"){if(!target(before))fail("TARGET_NOT_READY","Personal Drive storage V0.1.0 not active",{schema:before});const i=integrity();assertIntegrity(i);console.log(JSON.stringify({ok:true,mode,productionAccess:"DENY",schema:before,rowCounts:beforeCounts,integrity:i,destructiveActionsPerformed:false},null,2));process.exit(0)}
if(String(process.env.PERSONAL_DRIVE_STORAGE_MIGRATION_APPROVED||"")!==approval)fail("APPROVAL_REQUIRED","Explicit DEV approval required",{requiredApproval:approval});if(process.env.OPERATION!=="migration")fail("COORDINATED_LOCK_REQUIRED","Must run through migration operation lock");
if(target(before)){const i=integrity();assertIntegrity(i);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,schema:before,rowCounts:beforeCounts,integrity:i,productionAccess:"DENY"},null,2));process.exit(0)}
if(before.storageMeta||before.limitTable||before.ensureRpc||before.restoreRpc)fail("PARTIAL_TARGET_DETECTED","Refusing apply over partial target",{schema:before});
const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z"),dir=join(backupRoot,stamp);mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);const dump=join(dir,"personal-drive-storage-before.dump");
const tables=["dimpro_content_objects","dimpro_content_refs","dimpro_personal_drive_box_items","dimpro_personal_drive_boxes","dimpro_content_schema_meta"];
const d=run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-Fc","-f",dump,...tables.flatMap(t=>["-t","public."+t])]);if(!d.ok)fail("BACKUP_FAILED","Backup failed",{stderr:d.stderr.slice(-2200)});const l=run("pg_restore",["-l",dump]);for(const t of tables)if(!l.ok||!l.stdout.includes(t))fail("BACKUP_VERIFY_FAILED","Backup verify failed",{missing:t});chmodSync(dump,0o600);writeFileSync(join(dir,"backup.sha256"),sha(dump)+"  "+basename(dump)+"\n",{mode:0o600});
const applied=run("psql",args(["-f",migration]));if(!applied.ok)fail("APPLY_FAILED","Migration failed after backup",{backupDir:dir,stderr:applied.stderr.slice(-3000)});const after=probe();if(!target(after))fail("POST_VERIFY_FAILED","Personal Drive storage marker/RPC verify failed",{schema:after,backupDir:dir});const afterCounts=counts();for(const key of ["objects","refs","boxItems","boxes"])if(Number(afterCounts[key])!==Number(beforeCounts[key]))fail("ROW_COUNT_CHANGED","Migration changed protected row count",{key,before:beforeCounts,after:afterCounts,backupDir:dir});if(Number(afterCounts.meta)!==Number(beforeCounts.meta)+1)fail("META_COUNT_INVALID","Expected exactly one new schema marker",{before:beforeCounts,after:afterCounts,backupDir:dir});const i=integrity();assertIntegrity(i);console.log(JSON.stringify({ok:true,mode,productionAccess:"DENY",migrationSha256:actualSha,backupDir:dir,beforeSchema:before,afterSchema:after,beforeCounts,afterCounts,integrity:i},null,2));
