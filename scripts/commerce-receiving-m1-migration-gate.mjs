#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
const root=process.cwd();
const mode=(process.argv[2]||"preflight").trim().toLowerCase();
const migrationRel="supabase/migrations/20260818224000_dimpro_commerce_receiving_m1.sql";
const migration=join(root,migrationRel);
const expectedSha="20b6ab00df66796e0510045ebadfe43f461a0491ac52e03d8dc3f93ed047ad34";
const approvalPhrase="DEV_ONLY_COMMERCE_RECEIVING_M1_APPLY_APPROVED";
const approval=(process.env.COMMERCE_RECEIVING_M1_MIGRATION_APPROVED||"").trim();
const backupRoot="/srv/dimpro-dev/backups/commerce-receiving-m1";
const db={host:"aws-0-eu-central-1.pooler.supabase.com",port:"5432",database:"postgres",user:"postgres.pbgyuznivqvestuksvif"};
function fail(code,message,details={}){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(2);}
function run(cmd,args,opt={}){const r=spawnSync(cmd,args,{cwd:root,encoding:"utf8",env:{...process.env},...opt});return{ok:!r.error&&r.status===0,status:r.status,stdout:(r.stdout||"").trim(),stderr:(r.stderr||"").trim()};}
function sha(file){return createHash("sha256").update(readFileSync(file)).digest("hex");}
function args(extra=[]){return["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra];}
function query(sql){const r=run("psql",args(["-Atc",sql]));if(!r.ok)fail("RECEIVING_DB_QUERY_FAILED","A Receiving DEV schema probe sikertelen.",{status:r.status,stderr:r.stderr.slice(-800)});return r.stdout;}
function json(sql,code){try{return JSON.parse(query(sql));}catch{fail(code,"A Receiving DEV schema probe invalid JSON-t adott.");}}
function pgpass(){const f="/root/.pgpass";let st;try{st=statSync(f);}catch{fail("RECEIVING_PGPASS_MISSING","A root-only DEV .pgpass hiányzik.");}if((st.mode&0o777)!==0o600)fail("RECEIVING_PGPASS_MODE","A /root/.pgpass jogosultsága nem 0600.");}
const postSig="public.commerce_goods_receipt_post(uuid,uuid,text,timestamptz)";
function probe(){return json(`select json_build_object(
 'version',(select schema_version from public.commerce_schema_meta where component='commerce-core'),
 'count',(select migration_count from public.commerce_schema_meta where component='commerce-core'),
 'receipts',to_regclass('public.commerce_goods_receipts') is not null,
 'items',to_regclass('public.commerce_goods_receipt_items') is not null,
 'postRpc',to_regprocedure('${postSig}') is not null,
 'authPost',case when to_regprocedure('${postSig}') is null then false else has_function_privilege('authenticated',to_regprocedure('${postSig}'),'EXECUTE') end,
 'servicePost',case when to_regprocedure('${postSig}') is null then false else has_function_privilege('service_role',to_regprocedure('${postSig}'),'EXECUTE') end
)::text;`,"RECEIVING_PROBE_INVALID");}
function cleanBaseline(p){return p.version==="0.1.4"&&Number(p.count)===5&&!p.receipts&&!p.items&&!p.postRpc;}
function assertReady(p){if(p.version!=="0.1.5"||Number(p.count)!==6||!p.receipts||!p.items||!p.postRpc||p.authPost||!p.servicePost)fail("RECEIVING_SCHEMA_NOT_READY","A Receiving 0.1.5 schema/security nem teljes.",{probe:p});return p;}
function stamp(){return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");}
if(!["preflight","apply","verify"].includes(mode))fail("RECEIVING_MODE_INVALID","Használat: preflight | apply | verify");
pgpass();
const actualSha=sha(migration);if(actualSha!==expectedSha)fail("RECEIVING_SHA_MISMATCH","A Receiving migráció SHA eltér.",{expectedSha,actualSha});
const before=probe();
if(mode==="verify"){assertReady(before);console.log(JSON.stringify({ok:true,mode,probe:before},null,2));process.exit(0);}
if(before.version==="0.1.5"){assertReady(before);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,probe:before},null,2));process.exit(0);}
if(!cleanBaseline(before))fail("RECEIVING_BASELINE_MISMATCH","A Receiving migráció csak Commerce 0.1.4 tiszta baseline-ról alkalmazható.",{probe:before});
if(mode==="preflight"){console.log(JSON.stringify({ok:true,mode,readyForApply:true,migration:migrationRel,migrationSha256:actualSha,requiredApproval:approvalPhrase},null,2));process.exit(0);}
if(approval!==approvalPhrase)fail("RECEIVING_APPROVAL_REQUIRED","Explicit DEV-only Receiving migration approval szükséges.",{requiredApproval:approvalPhrase});
const dir=join(backupRoot,stamp());mkdirSync(dir,{recursive:true,mode:0o700});
const dump=join(dir,"supabase-dev-pre-commerce-receiving-m1.dump");
const backup=run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"--format=custom","--no-owner","--no-privileges",`--file=${dump}`]);
if(!backup.ok)fail("RECEIVING_BACKUP_FAILED","A Receiving előtti DEV backup sikertelen.",{status:backup.status,backupDir:dir});
chmodSync(dump,0o600);const listing=run("pg_restore",["--list",dump]);if(!listing.ok||!listing.stdout.includes("commerce_inventory_balances")||!listing.stdout.includes("commerce_media_links"))fail("RECEIVING_BACKUP_VERIFY_FAILED","A Receiving backup listing ellenőrzése sikertelen.",{backupDir:dir});
const dumpSha=sha(dump);writeFileSync(join(dir,"backup.sha256"),`${dumpSha}  ${basename(dump)}\n`,{mode:0o600});
const apply=run("psql",args(["-1","-f",migration]));if(!apply.ok)fail("RECEIVING_APPLY_FAILED","A Receiving migráció sikertelen; backup megmaradt.",{status:apply.status,backupDir:dir,stderr:apply.stderr.slice(-1600)});
const after=probe();assertReady(after);
const report={ok:true,mode,applied:true,migration:migrationRel,migrationSha256:actualSha,backup:{directory:dir,file:basename(dump),sha256:dumpSha,listingVerified:true},probe:after,completedAt:new Date().toISOString()};
writeFileSync(join(dir,"migration-report.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});console.log(JSON.stringify(report,null,2));
