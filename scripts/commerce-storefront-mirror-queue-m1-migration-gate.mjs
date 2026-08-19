#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root=process.cwd();
const mode=(process.argv[2]||"preflight").trim().toLowerCase();
const migrationRel="supabase/migrations/20260819175000_dimpro_commerce_storefront_mirror_queue_m1.sql";
const rollbackRel="supabase/rollback/DIMPRO_COMMERCE_STOREFRONT_MIRROR_QUEUE_M1_ROLLBACK.sql";
const migration=join(root,migrationRel),rollback=join(root,rollbackRel);
const expectedSha="8248076ed8d36c140eae3c6cccdeae7015bef1f122c0e5b4a13a482182017507";
const expectedRollbackSha="700cf6e224a0dc024543129e82fb2dd0f737fa134b42a15008f6db2c548be120";
const approvalPhrase="DEV_ONLY_COMMERCE_STOREFRONT_MIRROR_QUEUE_M1_APPLY_APPROVED";
const approval=(process.env.COMMERCE_STOREFRONT_MIRROR_QUEUE_M1_APPROVED||"").trim();
const backupRoot="/srv/dimpro-dev/backups/commerce-storefront-mirror-queue-m1";
const db={host:"aws-0-eu-central-1.pooler.supabase.com",port:"5432",database:"postgres",user:"postgres.pbgyuznivqvestuksvif"};
function fail(code,message,details={}){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(2);}
function run(cmd,args,opt={}){const r=spawnSync(cmd,args,{cwd:root,encoding:"utf8",env:{...process.env},maxBuffer:16*1024*1024,...opt});return{ok:!r.error&&r.status===0,status:r.status,stdout:(r.stdout||"").trim(),stderr:(r.stderr||"").trim()};}
function sha(file){return createHash("sha256").update(readFileSync(file)).digest("hex");}
function psqlArgs(extra=[]){return["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra];}
function query(sql){const r=run("psql",psqlArgs(["-Atc",sql]));if(!r.ok)fail("STOREFRONT_QUEUE_DB_QUERY_FAILED","A Storefront queue schema probe sikertelen.",{stderr:r.stderr.slice(-1400)});return r.stdout;}
function probe(){
  const raw=query(`select json_build_object(
    'version',(select schema_version from public.commerce_schema_meta where component='commerce-core'),
    'count',(select migration_count from public.commerce_schema_meta where component='commerce-core'),
    'enqueueFunction',to_regprocedure('public.commerce_order_mirror_enqueue(uuid,text,text,text,jsonb)') is not null,
    'anonExec',case when to_regprocedure('public.commerce_order_mirror_enqueue(uuid,text,text,text,jsonb)') is null then false else has_function_privilege('anon','public.commerce_order_mirror_enqueue(uuid,text,text,text,jsonb)','EXECUTE') end,
    'authExec',case when to_regprocedure('public.commerce_order_mirror_enqueue(uuid,text,text,text,jsonb)') is null then false else has_function_privilege('authenticated','public.commerce_order_mirror_enqueue(uuid,text,text,text,jsonb)','EXECUTE') end,
    'serviceExec',case when to_regprocedure('public.commerce_order_mirror_enqueue(uuid,text,text,text,jsonb)') is null then false else has_function_privilege('service_role','public.commerce_order_mirror_enqueue(uuid,text,text,text,jsonb)','EXECUTE') end,
    'retryIndex',coalesce((select indexdef from pg_indexes where schemaname='public' and indexname='commerce_order_mirror_attempts_retry_idx'),'')
  )::text;`);
  try{return JSON.parse(raw);}catch{fail("STOREFRONT_QUEUE_PROBE_INVALID","A Storefront queue probe invalid JSON-t adott.");}
}
function baseline(p){return p.version==="0.1.11"&&Number(p.count)===12&&!p.enqueueFunction;}
function ready(p){const index=String(p.retryIndex||"").toLowerCase();if(p.version!=="0.1.12"||Number(p.count)!==13||!p.enqueueFunction||p.anonExec||p.authExec||!p.serviceExec||!index.includes("deleted_at is null")||!index.includes("'pending'::text")||!index.includes("'failed'::text"))fail("STOREFRONT_QUEUE_SCHEMA_NOT_READY","A Commerce Storefront queue 0.1.12 schema nem teljes.",{probe:p});return p;}
function stamp(){return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");}
if(!["preflight","rollback-test","apply","verify"].includes(mode))fail("STOREFRONT_QUEUE_MODE_INVALID","Használat: preflight | rollback-test | apply | verify");
const pgpass=statSync("/root/.pgpass");if((pgpass.mode&0o777)!==0o600)fail("STOREFRONT_QUEUE_PGPASS_MODE","A /root/.pgpass jogosultsága nem 0600.");
const actualSha=sha(migration),actualRollbackSha=sha(rollback);
if(actualSha!==expectedSha)fail("STOREFRONT_QUEUE_SHA_MISMATCH","A Storefront queue migráció SHA eltér.",{expectedSha,actualSha});
if(actualRollbackSha!==expectedRollbackSha)fail("STOREFRONT_QUEUE_ROLLBACK_SHA_MISMATCH","A Storefront queue rollback SHA eltér.",{expectedRollbackSha,actualRollbackSha});
const before=probe();
if(mode==="verify"){console.log(JSON.stringify({ok:true,mode,probe:ready(before)},null,2));process.exit(0);}
if(before.version==="0.1.12"){console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,probe:ready(before)},null,2));process.exit(0);}
if(!baseline(before))fail("STOREFRONT_QUEUE_BASELINE_MISMATCH","A Storefront queue migráció csak Commerce 0.1.11 / 12 baseline-ról alkalmazható.",{probe:before});
if(mode==="preflight"){console.log(JSON.stringify({ok:true,mode,readyForApply:true,migration:migrationRel,migrationSha256:actualSha,rollback:rollbackRel,rollbackSha256:actualRollbackSha,requiredApproval:approvalPhrase},null,2));process.exit(0);}
if(mode==="rollback-test"){
  const test=run("psql",psqlArgs(["-1","-f",migration,"-f",rollback]));
  if(!test.ok)fail("STOREFRONT_QUEUE_ROLLBACK_TEST_FAILED","A Storefront queue forward + rollback tranzakciós próba sikertelen.",{status:test.status,stderr:test.stderr.slice(-1800)});
  const restored=probe();if(!baseline(restored))fail("STOREFRONT_QUEUE_ROLLBACK_BASELINE_NOT_RESTORED","A rollback-test után nem állt vissza a 0.1.11 / 12 baseline.",{probe:restored});
  console.log(JSON.stringify({ok:true,mode,transactional:true,restoredBaseline:restored},null,2));process.exit(0);
}
if(approval!==approvalPhrase)fail("STOREFRONT_QUEUE_APPROVAL_REQUIRED","Explicit DEV-only migration approval szükséges.",{requiredApproval:approvalPhrase});
const dir=join(backupRoot,stamp());mkdirSync(dir,{recursive:true,mode:0o700});const dump=join(dir,"supabase-dev-pre-commerce-storefront-mirror-queue-m1.dump");
const backup=run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"--format=custom","--no-owner","--no-privileges",`--file=${dump}`]);
if(!backup.ok)fail("STOREFRONT_QUEUE_BACKUP_FAILED","A Storefront queue előtti DEV backup sikertelen.",{stderr:backup.stderr.slice(-1400)});chmodSync(dump,0o600);
const listing=run("pg_restore",["--list",dump]);if(!listing.ok||!listing.stdout.includes("commerce_order_mirror_attempts")||!listing.stdout.includes("commerce_orders")||!listing.stdout.includes("commerce_outbox_events")||!listing.stdout.includes("commerce_audit_events"))fail("STOREFRONT_QUEUE_BACKUP_VERIFY_FAILED","A DEV backup listing ellenőrzése sikertelen.");
const dumpSha=sha(dump);writeFileSync(join(dir,"backup.sha256"),`${dumpSha}  ${basename(dump)}\n`,{mode:0o600});
const apply=run("psql",psqlArgs(["-1","-f",migration]));if(!apply.ok)fail("STOREFRONT_QUEUE_APPLY_FAILED","A Storefront queue 0.1.12 migráció sikertelen; backup megmaradt.",{backupDir:dir,stderr:apply.stderr.slice(-1800)});
const after=ready(probe());const report={ok:true,mode,applied:true,migration:migrationRel,migrationSha256:actualSha,rollbackSha256:actualRollbackSha,backup:{directory:dir,file:basename(dump),sha256:dumpSha,listingVerified:true},probe:after,completedAt:new Date().toISOString()};writeFileSync(join(dir,"migration-report.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});console.log(JSON.stringify(report,null,2));
