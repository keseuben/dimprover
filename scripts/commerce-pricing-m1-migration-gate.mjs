#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root=process.cwd();
const mode=(process.argv[2]||"preflight").trim().toLowerCase();
const migrationRel="supabase/migrations/20260818203000_dimpro_commerce_pricing_m1.sql";
const migration=join(root,migrationRel);
const expectedSha="d37aebfe4929a7c0e6e293c5e149bb5c8c578c9627ff7c1f5bc8adad277c399a";
const approvalPhrase="DEV_ONLY_COMMERCE_PRICING_M1_APPLY_APPROVED";
const approval=(process.env.COMMERCE_PRICING_M1_MIGRATION_APPROVED||"").trim();
const backupRoot="/srv/dimpro-dev/backups/commerce-pricing-m1";
const db={host:"aws-0-eu-central-1.pooler.supabase.com",port:"5432",database:"postgres",user:"postgres.pbgyuznivqvestuksvif"};

function fail(code,message,details={}){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(2);}
function run(cmd,args,opt={}){const r=spawnSync(cmd,args,{cwd:root,encoding:"utf8",env:{...process.env},...opt});return{ok:!r.error&&r.status===0,status:r.status,stdout:(r.stdout||"").trim(),stderr:(r.stderr||"").trim()};}
function sha(file){return createHash("sha256").update(readFileSync(file)).digest("hex");}
function args(extra=[]){return["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra];}
function query(sql){const r=run("psql",args(["-Atc",sql]));if(!r.ok)fail("PRICING_DB_QUERY_FAILED","A Pricing DEV schema probe sikertelen.",{status:r.status});return r.stdout;}
function json(sql,code){try{return JSON.parse(query(sql));}catch{fail(code,"A Pricing DEV schema probe invalid JSON-t adott.");}}
function pgpass(){const f="/root/.pgpass";let st;try{st=statSync(f);}catch{fail("PRICING_PGPASS_MISSING","A root-only DEV .pgpass hiányzik.");}if((st.mode&0o777)!==0o600)fail("PRICING_PGPASS_MODE","A /root/.pgpass jogosultsága nem 0600.");}
function probe(){return json(`select json_build_object(
  'version',(select schema_version from public.commerce_schema_meta where component='commerce-core'),
  'count',(select migration_count from public.commerce_schema_meta where component='commerce-core'),
  'prices',to_regclass('public.commerce_prices') is not null,
  'rpc',to_regprocedure('public.commerce_price_set_active(uuid,uuid,text,bigint,integer,timestamptz)') is not null,
  'serviceUpdate',has_table_privilege('service_role','public.commerce_prices','UPDATE'),
  'authRpc',case when to_regprocedure('public.commerce_price_set_active(uuid,uuid,text,bigint,integer,timestamptz)') is null then false else has_function_privilege('authenticated',to_regprocedure('public.commerce_price_set_active(uuid,uuid,text,bigint,integer,timestamptz)'),'EXECUTE') end,
  'serviceRpc',case when to_regprocedure('public.commerce_price_set_active(uuid,uuid,text,bigint,integer,timestamptz)') is null then false else has_function_privilege('service_role',to_regprocedure('public.commerce_price_set_active(uuid,uuid,text,bigint,integer,timestamptz)'),'EXECUTE') end
)::text;`,"PRICING_PROBE_INVALID");}
function cleanBaseline(p){return p.version==="0.1.1"&&Number(p.count)===2&&p.prices===true&&p.rpc===false;}
function assertReady(p){if(p.version!=="0.1.2"||Number(p.count)!==3||!p.prices||!p.rpc||p.serviceUpdate||p.authRpc||!p.serviceRpc)fail("PRICING_SCHEMA_NOT_READY","A Pricing 0.1.2 schema/security nem teljes.",{probe:p});return p;}
function stamp(){return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");}

if(!["preflight","apply","verify"].includes(mode))fail("PRICING_MODE_INVALID","Használat: preflight | apply | verify");
pgpass();
const actualSha=sha(migration);if(actualSha!==expectedSha)fail("PRICING_SHA_MISMATCH","A Pricing migráció SHA eltér.",{expectedSha,actualSha});
const before=probe();
if(mode==="verify"){assertReady(before);console.log(JSON.stringify({ok:true,mode,probe:before},null,2));process.exit(0);}
if(before.version==="0.1.2"){assertReady(before);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,probe:before},null,2));process.exit(0);}
if(!cleanBaseline(before))fail("PRICING_BASELINE_MISMATCH","A Pricing migráció csak Commerce 0.1.1 tiszta baseline-ról alkalmazható.",{probe:before});
if(mode==="preflight"){console.log(JSON.stringify({ok:true,mode,readyForApply:true,migration:migrationRel,migrationSha256:actualSha,requiredApproval:approvalPhrase},null,2));process.exit(0);}
if(approval!==approvalPhrase)fail("PRICING_APPROVAL_REQUIRED","Explicit DEV-only Pricing migration approval szükséges.",{requiredApproval:approvalPhrase});
const dir=join(backupRoot,stamp());mkdirSync(dir,{recursive:true,mode:0o700});
const dump=join(dir,"supabase-dev-pre-commerce-pricing-m1.dump");
const backup=run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"--format=custom","--no-owner","--no-privileges",`--file=${dump}`]);
if(!backup.ok)fail("PRICING_BACKUP_FAILED","A Pricing előtti DEV backup sikertelen.",{status:backup.status,backupDir:dir});
chmodSync(dump,0o600);const listing=run("pg_restore",["--list",dump]);if(!listing.ok||!listing.stdout.includes("commerce_prices")||!listing.stdout.includes("commerce_product_variants"))fail("PRICING_BACKUP_VERIFY_FAILED","A Pricing backup listing ellenőrzése sikertelen.",{backupDir:dir});
const dumpSha=sha(dump);writeFileSync(join(dir,"backup.sha256"),`${dumpSha}  ${basename(dump)}\n`,{mode:0o600});
const apply=run("psql",args(["-1","-f",migration]));if(!apply.ok)fail("PRICING_APPLY_FAILED","A Pricing migráció sikertelen; backup megmaradt.",{status:apply.status,backupDir:dir,stderr:apply.stderr.slice(-1600)});
const after=probe();assertReady(after);
const report={ok:true,mode,applied:true,migration:migrationRel,migrationSha256:actualSha,backup:{directory:dir,file:basename(dump),sha256:dumpSha,listingVerified:true},probe:after,completedAt:new Date().toISOString()};
writeFileSync(join(dir,"migration-report.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});console.log(JSON.stringify(report,null,2));
