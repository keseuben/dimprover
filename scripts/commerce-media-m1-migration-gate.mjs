#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root=process.cwd();
const mode=(process.argv[2]||"preflight").trim().toLowerCase();
const migrationRel="supabase/migrations/20260818193000_dimpro_commerce_media_m1.sql";
const migration=join(root,migrationRel);
const expectedSha="448f3894db5f97b225cd25fa2802a4b65b83e1c207113099a21b49b12e482970";
const approvalPhrase="DEV_ONLY_COMMERCE_MEDIA_M1_APPLY_APPROVED";
const approval=(process.env.COMMERCE_MEDIA_M1_MIGRATION_APPROVED||"").trim();
const backupRoot="/srv/dimpro-dev/backups/commerce-media-m1";
const db={host:"aws-0-eu-central-1.pooler.supabase.com",port:"5432",database:"postgres",user:"postgres.pbgyuznivqvestuksvif"};

function fail(code,message,details={}){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(2);}
function run(cmd,args,opt={}){const r=spawnSync(cmd,args,{cwd:root,encoding:"utf8",env:{...process.env},...opt});return{ok:!r.error&&r.status===0,status:r.status,stdout:(r.stdout||"").trim(),stderr:(r.stderr||"").trim()};}
function sha(file){return createHash("sha256").update(readFileSync(file)).digest("hex");}
function args(extra=[]){return["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra];}
function query(sql){const r=run("psql",args(["-Atc",sql]));if(!r.ok)fail("MEDIA_DB_QUERY_FAILED","A Media DEV schema probe sikertelen.",{status:r.status});return r.stdout;}
function json(sql,code){try{return JSON.parse(query(sql));}catch{fail(code,"A Media DEV schema probe invalid JSON-t adott.");}}
function pgpass(){const f="/root/.pgpass";let st;try{st=statSync(f);}catch{fail("MEDIA_PGPASS_MISSING","A root-only DEV .pgpass hiányzik.");}if((st.mode&0o777)!==0o600)fail("MEDIA_PGPASS_MODE","A /root/.pgpass jogosultsága nem 0600.");}
function probe(){return json(`select json_build_object(
  'version',(select schema_version from public.commerce_schema_meta where component='commerce-core'),
  'count',(select migration_count from public.commerce_schema_meta where component='commerce-core'),
  'products',to_regclass('public.commerce_products') is not null,
  'variants',to_regclass('public.commerce_media_variants') is not null,
  'overlays',to_regclass('public.commerce_media_overlays') is not null,
  'rpc',to_regprocedure('public.commerce_media_finalize_upload(uuid,uuid,text,text,integer,integer,bigint,text,boolean,jsonb,jsonb)') is not null
)::text;`,"MEDIA_PROBE_INVALID");}
function security(){return json(`select json_build_object(
  'variantRls',(select relrowsecurity from pg_class where oid='public.commerce_media_variants'::regclass),
  'overlayRls',(select relrowsecurity from pg_class where oid='public.commerce_media_overlays'::regclass),
  'anonVariant',has_table_privilege('anon','public.commerce_media_variants','SELECT'),
  'authVariant',has_table_privilege('authenticated','public.commerce_media_variants','SELECT'),
  'serviceVariant',has_table_privilege('service_role','public.commerce_media_variants','SELECT'),
  'anonRpc',has_function_privilege('anon','public.commerce_media_finalize_upload(uuid,uuid,text,text,integer,integer,bigint,text,boolean,jsonb,jsonb)','EXECUTE'),
  'authRpc',has_function_privilege('authenticated','public.commerce_media_finalize_upload(uuid,uuid,text,text,integer,integer,bigint,text,boolean,jsonb,jsonb)','EXECUTE'),
  'serviceRpc',has_function_privilege('service_role','public.commerce_media_finalize_upload(uuid,uuid,text,text,integer,integer,bigint,text,boolean,jsonb,jsonb)','EXECUTE')
)::text;`,"MEDIA_SECURITY_INVALID");}
function assertReady(p){if(p.version!=="0.1.1"||Number(p.count)!==2||!p.products||!p.variants||!p.overlays||!p.rpc)fail("MEDIA_SCHEMA_NOT_READY","A Media 0.1.1 schema nem teljes.",{probe:p});const s=security();if(!s.variantRls||!s.overlayRls||s.anonVariant||s.authVariant||!s.serviceVariant||s.anonRpc||s.authRpc||!s.serviceRpc)fail("MEDIA_SECURITY_NOT_READY","A Media security gate nem teljes.",{security:s});return s;}
function cleanBaseline(p){return p.version==="0.1.0"&&Number(p.count)===1&&p.products===true&&!p.variants&&!p.overlays&&!p.rpc;}
function stamp(){return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");}

if(!["preflight","apply","verify"].includes(mode))fail("MEDIA_MODE_INVALID","Használat: preflight | apply | verify");
pgpass();
const actualSha=sha(migration);if(actualSha!==expectedSha)fail("MEDIA_SHA_MISMATCH","A Media migráció SHA eltér.",{expectedSha,actualSha});
const before=probe();
if(mode==="verify"){const s=assertReady(before);console.log(JSON.stringify({ok:true,mode,probe:before,security:s},null,2));process.exit(0);}
if(before.version==="0.1.1"){const s=assertReady(before);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,probe:before,security:s},null,2));process.exit(0);}
if(!cleanBaseline(before))fail("MEDIA_BASELINE_MISMATCH","A Media migráció csak Commerce 0.1.0 tiszta baseline-ról alkalmazható.",{probe:before});
if(mode==="preflight"){console.log(JSON.stringify({ok:true,mode,readyForApply:true,migration:migrationRel,migrationSha256:actualSha,requiredApproval:approvalPhrase},null,2));process.exit(0);}
if(approval!==approvalPhrase)fail("MEDIA_APPROVAL_REQUIRED","Explicit DEV-only Media migration approval szükséges.",{requiredApproval:approvalPhrase});
const dir=join(backupRoot,stamp());mkdirSync(dir,{recursive:true,mode:0o700});
const dump=join(dir,"supabase-dev-pre-commerce-media-m1.dump");
const b=run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"--format=custom","--no-owner","--no-privileges",`--file=${dump}`]);
if(!b.ok)fail("MEDIA_BACKUP_FAILED","A Media előtti DEV backup sikertelen.",{status:b.status,backupDir:dir});
chmodSync(dump,0o600);const listing=run("pg_restore",["--list",dump]);if(!listing.ok||!listing.stdout.includes("commerce_products")||!listing.stdout.includes("dimpro_organizations"))fail("MEDIA_BACKUP_VERIFY_FAILED","A Media backup listing ellenőrzése sikertelen.",{backupDir:dir});
const dumpSha=sha(dump);writeFileSync(join(dir,"backup.sha256"),`${dumpSha}  ${basename(dump)}\n`,{mode:0o600});
const apply=run("psql",args(["-1","-f",migration]));if(!apply.ok)fail("MEDIA_APPLY_FAILED","A Media migráció sikertelen; backup megmaradt.",{status:apply.status,backupDir:dir,stderr:apply.stderr.slice(-1600)});
const after=probe();const sec=assertReady(after);const report={ok:true,mode,applied:true,migration:migrationRel,migrationSha256:actualSha,backup:{directory:dir,file:basename(dump),sha256:dumpSha,listingVerified:true},probe:after,security:sec,completedAt:new Date().toISOString()};
writeFileSync(join(dir,"migration-report.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});console.log(JSON.stringify(report,null,2));
