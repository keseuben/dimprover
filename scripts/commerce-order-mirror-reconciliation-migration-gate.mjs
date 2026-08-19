#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
const root=process.cwd();
const mode=(process.argv[2]||"preflight").trim().toLowerCase();
const migrationRel="supabase/migrations/20260819073000_dimpro_commerce_order_mirror_reconciliation_m1.sql";
const migration=join(root,migrationRel);
const expectedSha="c9cd46b8b9757c13a23da3a319bd3c0d5d70d09db5c93eb060d21eda95653b2a";
const approvalPhrase="DEV_ONLY_COMMERCE_ORDER_MIRROR_RECONCILIATION_M1_APPLY_APPROVED";
const approval=(process.env.COMMERCE_ORDER_MIRROR_RECONCILIATION_M1_MIGRATION_APPROVED||"").trim();
const backupRoot="/srv/dimpro-dev/backups/commerce-order-mirror-reconciliation-m1";
const db={host:"aws-0-eu-central-1.pooler.supabase.com",port:"5432",database:"postgres",user:"postgres.pbgyuznivqvestuksvif"};
function fail(code,message,details={}){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(2);}
function run(cmd,args,opt={}){const r=spawnSync(cmd,args,{cwd:root,encoding:"utf8",env:{...process.env},...opt});return{ok:!r.error&&r.status===0,status:r.status,stdout:(r.stdout||"").trim(),stderr:(r.stderr||"").trim()};}
function sha(file){return createHash("sha256").update(readFileSync(file)).digest("hex");}
function psqlArgs(extra=[]){return["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra];}
function query(sql){const r=run("psql",psqlArgs(["-Atc",sql]));if(!r.ok)fail("MIRROR_RECONCILIATION_DB_QUERY_FAILED","A mirror reconciliation DEV schema probe sikertelen.",{status:r.status,stderr:r.stderr.slice(-800)});return r.stdout;}
function json(sql,code){try{return JSON.parse(query(sql));}catch{fail(code,"A mirror reconciliation DEV schema probe invalid JSON-t adott.");}}
function pgpass(){const file="/root/.pgpass";let st;try{st=statSync(file);}catch{fail("MIRROR_RECONCILIATION_PGPASS_MISSING","A root-only DEV .pgpass hiányzik.");}if((st.mode&0o777)!==0o600)fail("MIRROR_RECONCILIATION_PGPASS_MODE","A /root/.pgpass jogosultsága nem 0600.");}
const rpcSig="public.commerce_order_mirror_record(uuid,uuid,text,text,text,jsonb,text,uuid,integer,integer,text,text)";
function probe(){return json(`select json_build_object(
 'version',(select schema_version from public.commerce_schema_meta where component='commerce-core'),
 'count',(select migration_count from public.commerce_schema_meta where component='commerce-core'),
 'attempts',to_regclass('public.commerce_order_mirror_attempts') is not null,
 'rpc',to_regprocedure('${rpcSig}') is not null,
 'authExec',case when to_regprocedure('${rpcSig}') is null then false else has_function_privilege('authenticated',to_regprocedure('${rpcSig}'),'EXECUTE') end,
 'serviceExec',case when to_regprocedure('${rpcSig}') is null then false else has_function_privilege('service_role',to_regprocedure('${rpcSig}'),'EXECUTE') end,
 'authTable',case when to_regclass('public.commerce_order_mirror_attempts') is null then false else has_table_privilege('authenticated','public.commerce_order_mirror_attempts','SELECT') end,
 'serviceTable',case when to_regclass('public.commerce_order_mirror_attempts') is null then false else has_table_privilege('service_role','public.commerce_order_mirror_attempts','SELECT') end
)::text;`,"MIRROR_RECONCILIATION_PROBE_INVALID");}
function cleanBaseline(p){return p.version==="0.1.7"&&Number(p.count)===8&&!p.attempts&&!p.rpc;}
function assertReady(p){if(p.version!=="0.1.8"||Number(p.count)!==9||!p.attempts||!p.rpc||p.authExec||!p.serviceExec||p.authTable||!p.serviceTable)fail("MIRROR_RECONCILIATION_SCHEMA_NOT_READY","A mirror reconciliation 0.1.8 schema/security nem teljes.",{probe:p});return p;}
function stamp(){return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");}
if(!["preflight","apply","verify"].includes(mode))fail("MIRROR_RECONCILIATION_MODE_INVALID","Használat: preflight | apply | verify");
pgpass();const actualSha=sha(migration);if(actualSha!==expectedSha)fail("MIRROR_RECONCILIATION_SHA_MISMATCH","A mirror reconciliation migráció SHA eltér.",{expectedSha,actualSha});
const before=probe();
if(mode==="verify"){assertReady(before);console.log(JSON.stringify({ok:true,mode,probe:before},null,2));process.exit(0);}
if(before.version==="0.1.8"){assertReady(before);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,probe:before},null,2));process.exit(0);}
if(!cleanBaseline(before))fail("MIRROR_RECONCILIATION_BASELINE_MISMATCH","A mirror reconciliation migráció csak Commerce 0.1.7 tiszta baseline-ról alkalmazható.",{probe:before});
if(mode==="preflight"){console.log(JSON.stringify({ok:true,mode,readyForApply:true,migration:migrationRel,migrationSha256:actualSha,requiredApproval:approvalPhrase},null,2));process.exit(0);}
if(approval!==approvalPhrase)fail("MIRROR_RECONCILIATION_APPROVAL_REQUIRED","Explicit DEV-only mirror reconciliation migration approval szükséges.",{requiredApproval:approvalPhrase});
const dir=join(backupRoot,stamp());mkdirSync(dir,{recursive:true,mode:0o700});
const dump=join(dir,"supabase-dev-pre-commerce-order-mirror-reconciliation-m1.dump");
const backup=run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"--format=custom","--no-owner","--no-privileges",`--file=${dump}`]);
if(!backup.ok)fail("MIRROR_RECONCILIATION_BACKUP_FAILED","A mirror reconciliation előtti DEV backup sikertelen.",{status:backup.status,backupDir:dir});
chmodSync(dump,0o600);const listing=run("pg_restore",["--list",dump]);if(!listing.ok||!listing.stdout.includes("commerce_orders")||!listing.stdout.includes("commerce_order_inventory_events"))fail("MIRROR_RECONCILIATION_BACKUP_VERIFY_FAILED","A mirror reconciliation backup listing ellenőrzése sikertelen.",{backupDir:dir});
const dumpSha=sha(dump);writeFileSync(join(dir,"backup.sha256"),`${dumpSha}  ${basename(dump)}\n`,{mode:0o600});
const apply=run("psql",psqlArgs(["-1","-f",migration]));if(!apply.ok)fail("MIRROR_RECONCILIATION_APPLY_FAILED","A mirror reconciliation migráció sikertelen; backup megmaradt.",{status:apply.status,backupDir:dir,stderr:apply.stderr.slice(-1600)});
const after=probe();assertReady(after);
const report={ok:true,mode,applied:true,migration:migrationRel,migrationSha256:actualSha,backup:{directory:dir,file:basename(dump),sha256:dumpSha,listingVerified:true},probe:after,completedAt:new Date().toISOString()};
writeFileSync(join(dir,"migration-report.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});console.log(JSON.stringify(report,null,2));
