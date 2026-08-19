#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
const root=process.cwd(),mode=(process.argv[2]||"preflight").trim().toLowerCase();
const migrationRel="supabase/migrations/20260819182500_dimpro_commerce_storefront_queue_idempotency_m1.sql";
const rollbackRel="supabase/rollback/DIMPRO_COMMERCE_STOREFRONT_QUEUE_IDEMPOTENCY_M1_ROLLBACK.sql";
const migration=join(root,migrationRel),rollback=join(root,rollbackRel);
const expectedSha="28987671904417b6c37e9b73e33e1f12848188804da5fc7aab8d484a7ab96e07";
const expectedRollbackSha="81d0cd0576aab6b512583dffd99ca5ba3758cfadce721facef610090d783e3e4";
const approvalPhrase="DEV_ONLY_COMMERCE_STOREFRONT_QUEUE_IDEMPOTENCY_M1_APPLY_APPROVED";
const approval=(process.env.COMMERCE_STOREFRONT_QUEUE_IDEMPOTENCY_M1_APPROVED||"").trim();
const backupRoot="/srv/dimpro-dev/backups/commerce-storefront-queue-idempotency-m1";
const db={host:"aws-0-eu-central-1.pooler.supabase.com",port:"5432",database:"postgres",user:"postgres.pbgyuznivqvestuksvif"};
function fail(code,message,details={}){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(2);}
function run(cmd,args,opt={}){const r=spawnSync(cmd,args,{cwd:root,encoding:"utf8",env:{...process.env},maxBuffer:16*1024*1024,...opt});return{ok:!r.error&&r.status===0,status:r.status,stdout:(r.stdout||"").trim(),stderr:(r.stderr||"").trim()};}
function sha(file){return createHash("sha256").update(readFileSync(file)).digest("hex");}
function args(extra=[]){return["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra];}
function query(sql){const r=run("psql",args(["-Atc",sql]));if(!r.ok)fail("QUEUE_IDEMPOTENCY_DB_QUERY_FAILED","A schema probe sikertelen.",{stderr:r.stderr.slice(-1200)});return r.stdout;}
function probe(){const raw=query(`select json_build_object(
'version',(select schema_version from public.commerce_schema_meta where component='commerce-core'),
'count',(select migration_count from public.commerce_schema_meta where component='commerce-core'),
'enqueueFunction',to_regprocedure('public.commerce_order_mirror_enqueue(uuid,text,text,text,jsonb)') is not null,
'anonExec',has_function_privilege('anon','public.commerce_order_mirror_enqueue(uuid,text,text,text,jsonb)','EXECUTE'),
'authExec',has_function_privilege('authenticated','public.commerce_order_mirror_enqueue(uuid,text,text,text,jsonb)','EXECUTE'),
'serviceExec',has_function_privilege('service_role','public.commerce_order_mirror_enqueue(uuid,text,text,text,jsonb)','EXECUTE'),
'hasNoop',position('v_noop' in pg_get_functiondef('public.commerce_order_mirror_enqueue(uuid,text,text,text,jsonb)'::regprocedure))>0,
'hasDuplicate',position('duplicate' in pg_get_functiondef('public.commerce_order_mirror_enqueue(uuid,text,text,text,jsonb)'::regprocedure))>0,
'hasPendingSucceeded',position('PENDING' in pg_get_functiondef('public.commerce_order_mirror_enqueue(uuid,text,text,text,jsonb)'::regprocedure))>0 and position('SUCCEEDED' in pg_get_functiondef('public.commerce_order_mirror_enqueue(uuid,text,text,text,jsonb)'::regprocedure))>0
)::text;`);try{return JSON.parse(raw);}catch{fail("QUEUE_IDEMPOTENCY_PROBE_INVALID","Invalid JSON probe.");}}
function baseline(p){return p.version==="0.1.12"&&Number(p.count)===13&&p.enqueueFunction&&!p.anonExec&&!p.authExec&&p.serviceExec&&!p.hasNoop&&!p.hasDuplicate;}
function ready(p){if(p.version!=="0.1.13"||Number(p.count)!==14||!p.enqueueFunction||p.anonExec||p.authExec||!p.serviceExec||!p.hasNoop||!p.hasDuplicate||!p.hasPendingSucceeded)fail("QUEUE_IDEMPOTENCY_SCHEMA_NOT_READY","A 0.1.13 queue idempotency schema nem teljes.",{probe:p});return p;}
function stamp(){return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");}
if(!["preflight","rollback-test","apply","verify"].includes(mode))fail("QUEUE_IDEMPOTENCY_MODE_INVALID","Használat: preflight | rollback-test | apply | verify");
if((statSync("/root/.pgpass").mode&0o777)!==0o600)fail("QUEUE_IDEMPOTENCY_PGPASS_MODE","A /root/.pgpass nem 0600.");
const actualSha=sha(migration),actualRollbackSha=sha(rollback);if(actualSha!==expectedSha)fail("QUEUE_IDEMPOTENCY_SHA_MISMATCH","Migration SHA eltér.",{actualSha});if(actualRollbackSha!==expectedRollbackSha)fail("QUEUE_IDEMPOTENCY_ROLLBACK_SHA_MISMATCH","Rollback SHA eltér.",{actualRollbackSha});
const before=probe();if(mode==="verify"){console.log(JSON.stringify({ok:true,mode,probe:ready(before)},null,2));process.exit(0);}if(before.version==="0.1.13"){console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,probe:ready(before)},null,2));process.exit(0);}if(!baseline(before))fail("QUEUE_IDEMPOTENCY_BASELINE_MISMATCH","Csak 0.1.12 / 13 baseline-ról alkalmazható.",{probe:before});
if(mode==="preflight"){console.log(JSON.stringify({ok:true,mode,readyForApply:true,migrationSha256:actualSha,rollbackSha256:actualRollbackSha,requiredApproval:approvalPhrase},null,2));process.exit(0);}
if(mode==="rollback-test"){const r=run("psql",args(["-1","-f",migration,"-f",rollback]));if(!r.ok)fail("QUEUE_IDEMPOTENCY_ROLLBACK_TEST_FAILED","Forward+rollback próba sikertelen.",{stderr:r.stderr.slice(-1800)});const restored=probe();if(!baseline(restored))fail("QUEUE_IDEMPOTENCY_BASELINE_NOT_RESTORED","Rollback után nem állt vissza a baseline.",{probe:restored});console.log(JSON.stringify({ok:true,mode,transactional:true,restoredBaseline:restored},null,2));process.exit(0);}
if(approval!==approvalPhrase)fail("QUEUE_IDEMPOTENCY_APPROVAL_REQUIRED","Explicit DEV approval szükséges.",{requiredApproval:approvalPhrase});
const dir=join(backupRoot,stamp());mkdirSync(dir,{recursive:true,mode:0o700});const dump=join(dir,"supabase-dev-pre-commerce-storefront-queue-idempotency-m1.dump");const backup=run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"--format=custom","--no-owner","--no-privileges",`--file=${dump}`]);if(!backup.ok)fail("QUEUE_IDEMPOTENCY_BACKUP_FAILED","DEV backup sikertelen.",{stderr:backup.stderr.slice(-1200)});chmodSync(dump,0o600);const listing=run("pg_restore",["--list",dump]);if(!listing.ok||!listing.stdout.includes("commerce_order_mirror_attempts")||!listing.stdout.includes("commerce_outbox_events")||!listing.stdout.includes("commerce_audit_events"))fail("QUEUE_IDEMPOTENCY_BACKUP_VERIFY_FAILED","Backup listing sikertelen.");const dumpSha=sha(dump);writeFileSync(join(dir,"backup.sha256"),`${dumpSha}  ${basename(dump)}\n`,{mode:0o600});
const applied=run("psql",args(["-1","-f",migration]));if(!applied.ok)fail("QUEUE_IDEMPOTENCY_APPLY_FAILED","0.1.13 apply sikertelen; backup megmaradt.",{backupDir:dir,stderr:applied.stderr.slice(-1800)});const after=ready(probe());const report={ok:true,mode,applied:true,migrationSha256:actualSha,rollbackSha256:actualRollbackSha,backup:{directory:dir,file:basename(dump),sha256:dumpSha,listingVerified:true},probe:after,completedAt:new Date().toISOString()};writeFileSync(join(dir,"migration-report.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});console.log(JSON.stringify(report,null,2));
