#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
const root=process.cwd();
const mode=(process.argv[2]||"preflight").trim().toLowerCase();
const migrationRel="supabase/migrations/20260818234500_dimpro_commerce_order_core_m1.sql";
const migration=join(root,migrationRel);
const expectedSha="dcb720b6e7842bd19cd8ecff09becb648feea34159a45122745b7298f2dce1e1";
const approvalPhrase="DEV_ONLY_COMMERCE_ORDER_CORE_M1_APPLY_APPROVED";
const approval=(process.env.COMMERCE_ORDER_CORE_M1_MIGRATION_APPROVED||"").trim();
const backupRoot="/srv/dimpro-dev/backups/commerce-order-core-m1";
const db={host:"aws-0-eu-central-1.pooler.supabase.com",port:"5432",database:"postgres",user:"postgres.pbgyuznivqvestuksvif"};
function fail(code,message,details={}){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(2);}
function run(cmd,args,opt={}){const r=spawnSync(cmd,args,{cwd:root,encoding:"utf8",env:{...process.env},...opt});return{ok:!r.error&&r.status===0,status:r.status,stdout:(r.stdout||"").trim(),stderr:(r.stderr||"").trim()};}
function sha(file){return createHash("sha256").update(readFileSync(file)).digest("hex");}
function args(extra=[]){return["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra];}
function query(sql){const r=run("psql",args(["-Atc",sql]));if(!r.ok)fail("ORDER_CORE_DB_QUERY_FAILED","A Order Core DEV schema probe sikertelen.",{status:r.status,stderr:r.stderr.slice(-800)});return r.stdout;}
function json(sql,code){try{return JSON.parse(query(sql));}catch{fail(code,"A Order Core DEV schema probe invalid JSON-t adott.");}}
function pgpass(){const f="/root/.pgpass";let st;try{st=statSync(f);}catch{fail("ORDER_CORE_PGPASS_MISSING","A root-only DEV .pgpass hiányzik.");}if((st.mode&0o777)!==0o600)fail("ORDER_CORE_PGPASS_MODE","A /root/.pgpass jogosultsága nem 0600.");}
const createSig="public.commerce_order_create_atomic(uuid,text,text,text,text,text,text,timestamptz,text,text,jsonb,uuid,text)";
const statusSig="public.commerce_order_set_status(uuid,uuid,text,text,text,text,uuid,text)";
function probe(){return json(`select json_build_object(
 'version',(select schema_version from public.commerce_schema_meta where component='commerce-core'),
 'count',(select migration_count from public.commerce_schema_meta where component='commerce-core'),
 'orders',to_regclass('public.commerce_orders') is not null,
 'items',to_regclass('public.commerce_order_items') is not null,
 'events',to_regclass('public.commerce_order_status_events') is not null,
 'createRpc',to_regprocedure('${createSig}') is not null,
 'statusRpc',to_regprocedure('${statusSig}') is not null,
 'authCreate',case when to_regprocedure('${createSig}') is null then false else has_function_privilege('authenticated',to_regprocedure('${createSig}'),'EXECUTE') end,
 'authStatus',case when to_regprocedure('${statusSig}') is null then false else has_function_privilege('authenticated',to_regprocedure('${statusSig}'),'EXECUTE') end,
 'serviceCreate',case when to_regprocedure('${createSig}') is null then false else has_function_privilege('service_role',to_regprocedure('${createSig}'),'EXECUTE') end,
 'serviceStatus',case when to_regprocedure('${statusSig}') is null then false else has_function_privilege('service_role',to_regprocedure('${statusSig}'),'EXECUTE') end
)::text;`,"ORDER_CORE_PROBE_INVALID");}
function cleanBaseline(p){return p.version==="0.1.5"&&Number(p.count)===6&&!p.orders&&!p.items&&!p.events&&!p.createRpc&&!p.statusRpc;}
function assertReady(p){if(p.version!=="0.1.6"||Number(p.count)!==7||!p.orders||!p.items||!p.events||!p.createRpc||!p.statusRpc||p.authCreate||p.authStatus||!p.serviceCreate||!p.serviceStatus)fail("ORDER_CORE_SCHEMA_NOT_READY","Az Order Core 0.1.6 schema/security nem teljes.",{probe:p});return p;}
function stamp(){return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");}
if(!["preflight","apply","verify"].includes(mode))fail("ORDER_CORE_MODE_INVALID","Használat: preflight | apply | verify");
pgpass();
const actualSha=sha(migration);if(actualSha!==expectedSha)fail("ORDER_CORE_SHA_MISMATCH","A Order Core migráció SHA eltér.",{expectedSha,actualSha});
const before=probe();
if(mode==="verify"){assertReady(before);console.log(JSON.stringify({ok:true,mode,probe:before},null,2));process.exit(0);}
if(before.version==="0.1.6"){assertReady(before);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,probe:before},null,2));process.exit(0);}
if(!cleanBaseline(before))fail("ORDER_CORE_BASELINE_MISMATCH","A Order Core migráció csak Commerce 0.1.5 tiszta baseline-ról alkalmazható.",{probe:before});
if(mode==="preflight"){console.log(JSON.stringify({ok:true,mode,readyForApply:true,migration:migrationRel,migrationSha256:actualSha,requiredApproval:approvalPhrase},null,2));process.exit(0);}
if(approval!==approvalPhrase)fail("ORDER_CORE_APPROVAL_REQUIRED","Explicit DEV-only Order Core migration approval szükséges.",{requiredApproval:approvalPhrase});
const dir=join(backupRoot,stamp());mkdirSync(dir,{recursive:true,mode:0o700});
const dump=join(dir,"supabase-dev-pre-commerce-order-core-m1.dump");
const backup=run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"--format=custom","--no-owner","--no-privileges",`--file=${dump}`]);
if(!backup.ok)fail("ORDER_CORE_BACKUP_FAILED","A Order Core előtti DEV backup sikertelen.",{status:backup.status,backupDir:dir});
chmodSync(dump,0o600);const listing=run("pg_restore",["--list",dump]);if(!listing.ok||!listing.stdout.includes("commerce_goods_receipts")||!listing.stdout.includes("commerce_inventory_balances"))fail("ORDER_CORE_BACKUP_VERIFY_FAILED","A Order Core backup listing ellenőrzése sikertelen.",{backupDir:dir});
const dumpSha=sha(dump);writeFileSync(join(dir,"backup.sha256"),`${dumpSha}  ${basename(dump)}\n`,{mode:0o600});
const apply=run("psql",args(["-1","-f",migration]));if(!apply.ok)fail("ORDER_CORE_APPLY_FAILED","A Order Core migráció sikertelen; backup megmaradt.",{status:apply.status,backupDir:dir,stderr:apply.stderr.slice(-1600)});
const after=probe();assertReady(after);
const report={ok:true,mode,applied:true,migration:migrationRel,migrationSha256:actualSha,backup:{directory:dir,file:basename(dump),sha256:dumpSha,listingVerified:true},probe:after,completedAt:new Date().toISOString()};
writeFileSync(join(dir,"migration-report.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});console.log(JSON.stringify(report,null,2));
