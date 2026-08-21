#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root=process.cwd();
const mode=(process.argv[2]||"preflight").trim().toLowerCase();
const migrationRel="supabase/migrations/20260821143000_dimpro_commerce_pilot_units_p2.sql";
const migration=join(root,migrationRel);
const expectedSha="66c1a3ed383417d781e31c9a8834344781b705b8da4343a2bc8abc005e7ff65c";
const approvalPhrase="DEV_ONLY_COMMERCE_PILOT_UNITS_P2_APPLY_APPROVED";
const approval=(process.env.COMMERCE_PILOT_UNITS_P2_MIGRATION_APPROVED||"").trim();
const backupRoot="/srv/dimpro-dev/backups/commerce-pilot-units-p2";
const db={host:"aws-0-eu-central-1.pooler.supabase.com",port:"5432",database:"postgres",user:"postgres.pbgyuznivqvestuksvif"};

function fail(code,message,details={}){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(2);}
function run(cmd,args,opt={}){const r=spawnSync(cmd,args,{cwd:root,encoding:"utf8",env:{...process.env},maxBuffer:16*1024*1024,...opt});return{ok:!r.error&&r.status===0,status:r.status,stdout:(r.stdout||"").trim(),stderr:(r.stderr||"").trim()};}
function sha(file){return createHash("sha256").update(readFileSync(file)).digest("hex");}
function args(extra=[]){return["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra];}
function query(sql){const r=run("psql",args(["-Atc",sql]));if(!r.ok)fail("P2_UNITS_DB_QUERY_FAILED","A P2 unit DEV schema probe sikertelen.",{status:r.status,stderr:r.stderr.slice(-1200)});return r.stdout;}
function json(sql,code){try{return JSON.parse(query(sql));}catch{fail(code,"A P2 unit DEV schema probe invalid JSON-t adott.");}}
function pgpass(){const f="/root/.pgpass";let st;try{st=statSync(f);}catch{fail("P2_UNITS_PGPASS_MISSING","A root-only DEV .pgpass hiányzik.");}if((st.mode&0o777)!==0o600)fail("P2_UNITS_PGPASS_MODE","A /root/.pgpass jogosultsága nem 0600.");}
function probe(){return json(`select json_build_object(
 'version',(select schema_version from public.commerce_schema_meta where component='commerce-core'),
 'count',(select migration_count from public.commerce_schema_meta where component='commerce-core'),
 'productConstraint',pg_get_constraintdef((select oid from pg_constraint where conrelid='public.commerce_product_variants'::regclass and conname='commerce_product_variants_unit_check')),
 'receiptConstraint',pg_get_constraintdef((select oid from pg_constraint where conrelid='public.commerce_goods_receipt_items'::regclass and conname='commerce_goods_receipt_items_unit_check')),
 'productRpc',pg_get_functiondef('public.commerce_product_create_atomic(uuid,text,text,text,text,uuid,uuid,uuid,text,jsonb,jsonb)'::regprocedure)
)::text;`,"P2_UNITS_PROBE_INVALID");}
function hasExtended(p){return ["RAKLAP","ZSAK","LADA"].every(unit=>String(p.productConstraint).includes(unit)&&String(p.receiptConstraint).includes(unit)&&String(p.productRpc).includes(unit));}
function noExtended(p){return ["RAKLAP","ZSAK","LADA"].every(unit=>!String(p.productConstraint).includes(unit)&&!String(p.receiptConstraint).includes(unit)&&!String(p.productRpc).includes(unit));}
function cleanBaseline(p){return p.version==="0.1.14"&&Number(p.count)===15&&noExtended(p);}
function assertReady(p){if(p.version!=="0.1.15"||Number(p.count)!==16||!hasExtended(p))fail("P2_UNITS_SCHEMA_NOT_READY","A P2 unit schema nem teljes.",{probe:p});return p;}
function stamp(){return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");}

if(!["preflight","apply","verify"].includes(mode))fail("P2_UNITS_MODE_INVALID","Használat: preflight | apply | verify");
pgpass();
const actualSha=sha(migration);
if(actualSha!==expectedSha)fail("P2_UNITS_SHA_MISMATCH","A P2 unit migration SHA eltér.",{expectedSha,actualSha});
const before=probe();
if(mode==="verify"){assertReady(before);console.log(JSON.stringify({ok:true,mode,probe:before},null,2));process.exit(0);}
if(before.version==="0.1.15"){assertReady(before);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,probe:before},null,2));process.exit(0);}
if(!cleanBaseline(before))fail("P2_UNITS_BASELINE_MISMATCH","A P2 unit migration csak Commerce 0.1.14 / 15 tiszta baseline-ról alkalmazható.",{probe:before});
if(mode==="preflight"){console.log(JSON.stringify({ok:true,mode,readyForApply:true,migration:migrationRel,migrationSha256:actualSha,requiredApproval:approvalPhrase},null,2));process.exit(0);}
if(approval!==approvalPhrase)fail("P2_UNITS_APPROVAL_REQUIRED","Explicit DEV-only P2 unit migration approval szükséges.",{requiredApproval:approvalPhrase});

const dir=join(backupRoot,stamp());mkdirSync(dir,{recursive:true,mode:0o700});
const dump=join(dir,"supabase-dev-pre-commerce-pilot-units-p2.dump");
const backup=run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"--format=custom","--no-owner","--no-privileges",`--file=${dump}`]);
if(!backup.ok)fail("P2_UNITS_BACKUP_FAILED","A P2 unit migration előtti DEV backup sikertelen.",{status:backup.status,backupDir:dir,stderr:backup.stderr.slice(-1200)});
chmodSync(dump,0o600);
const listing=run("pg_restore",["--list",dump]);
if(!listing.ok||!listing.stdout.includes("commerce_product_variants")||!listing.stdout.includes("commerce_goods_receipt_items"))fail("P2_UNITS_BACKUP_VERIFY_FAILED","A P2 backup listing ellenőrzése sikertelen.",{backupDir:dir});
const dumpSha=sha(dump);writeFileSync(join(dir,"backup.sha256"),`${dumpSha}  ${basename(dump)}\n`,{mode:0o600});

const apply=run("psql",args(["-1","-f",migration]));
if(!apply.ok)fail("P2_UNITS_APPLY_FAILED","A P2 unit migration sikertelen; a backup megmaradt.",{status:apply.status,backupDir:dir,stderr:apply.stderr.slice(-1800)});
const after=probe();assertReady(after);
const report={ok:true,mode,applied:true,migration:migrationRel,migrationSha256:actualSha,backup:{directory:dir,file:basename(dump),sha256:dumpSha,listingVerified:true},probe:{version:after.version,count:after.count,extendedUnits:["RAKLAP","ZSAK","LADA"]},completedAt:new Date().toISOString()};
writeFileSync(join(dir,"migration-report.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(report,null,2));
