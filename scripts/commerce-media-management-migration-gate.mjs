#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root=process.cwd();
const mode=(process.argv[2]||"preflight").toLowerCase();
const migrationRel="supabase/migrations/20260818220500_dimpro_commerce_media_management_m1.sql";
const migration=join(root,migrationRel);
const expectedSha="0c2760d8e84abaf60bf92ae28bd76c696cba2754c0c60c7421f38604c709bbea";
const approvalPhrase="DEV_ONLY_COMMERCE_MEDIA_MANAGEMENT_M1_APPLY_APPROVED";
const approval=((process.argv[3]==="--approved-dev-only"?approvalPhrase:process.env.COMMERCE_MEDIA_MANAGEMENT_M1_MIGRATION_APPROVED)||"").trim();
const backupRoot="/srv/dimpro-dev/backups/commerce-media-management-m1";
const db={host:"aws-0-eu-central-1.pooler.supabase.com",port:"5432",database:"postgres",user:"postgres.pbgyuznivqvestuksvif"};
const rpcSig="public.commerce_media_set_product_order(uuid,uuid,uuid[],uuid)";

function fail(code,message,details={}){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(2);}
function run(cmd,args,opt={}){const r=spawnSync(cmd,args,{cwd:root,encoding:"utf8",env:{...process.env},...opt});return{ok:!r.error&&r.status===0,status:r.status,stdout:(r.stdout||"").trim(),stderr:(r.stderr||"").trim()};}
function sha(file){return createHash("sha256").update(readFileSync(file)).digest("hex");}
function args(extra=[]){return["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra];}
function query(sql){const r=run("psql",args(["-Atc",sql]));if(!r.ok)fail("MEDIA_MANAGEMENT_DB_QUERY_FAILED","A Media management DEV schema probe sikertelen.",{stderr:r.stderr.slice(-800)});return r.stdout;}
function probe(){return JSON.parse(query(`select json_build_object(
'version',(select schema_version from public.commerce_schema_meta where component='commerce-core'),
'count',(select migration_count from public.commerce_schema_meta where component='commerce-core'),
'rpc',to_regprocedure('${rpcSig}') is not null,
'primaryIndex',to_regclass('public.commerce_media_links_one_primary_per_entity_idx') is not null,
'authRpc',case when to_regprocedure('${rpcSig}') is null then false else has_function_privilege('authenticated',to_regprocedure('${rpcSig}'),'EXECUTE') end,
'serviceRpc',case when to_regprocedure('${rpcSig}') is null then false else has_function_privilege('service_role',to_regprocedure('${rpcSig}'),'EXECUTE') end
)::text;`));}
function clean(p){return p.version==="0.1.3"&&Number(p.count)===4&&!p.rpc&&!p.primaryIndex;}
function ready(p){if(p.version!=="0.1.4"||Number(p.count)!==5||!p.rpc||!p.primaryIndex||p.authRpc||!p.serviceRpc)fail("MEDIA_MANAGEMENT_SCHEMA_NOT_READY","A Media management 0.1.4 schema/security nem teljes.",{probe:p});return p;}
if(!["preflight","apply","verify"].includes(mode))fail("MEDIA_MANAGEMENT_MODE_INVALID","Használat: preflight | apply | verify");
const pgpass="/root/.pgpass";let st;try{st=statSync(pgpass);}catch{fail("MEDIA_MANAGEMENT_PGPASS_MISSING","A root-only DEV .pgpass hiányzik.");}
if((st.mode&0o777)!==0o600)fail("MEDIA_MANAGEMENT_PGPASS_MODE","A /root/.pgpass jogosultsága nem 0600.");
const actualSha=sha(migration);if(actualSha!==expectedSha)fail("MEDIA_MANAGEMENT_SHA_MISMATCH","A Media management migráció SHA eltér.",{expectedSha,actualSha});
const before=probe();
if(mode==="verify"){ready(before);console.log(JSON.stringify({ok:true,mode,probe:before},null,2));process.exit(0);}
if(before.version==="0.1.4"){ready(before);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,probe:before},null,2));process.exit(0);}
if(!clean(before))fail("MEDIA_MANAGEMENT_BASELINE_MISMATCH","A migráció csak Commerce 0.1.3 tiszta baseline-ról alkalmazható.",{probe:before});
if(mode==="preflight"){console.log(JSON.stringify({ok:true,mode,readyForApply:true,migration:migrationRel,migrationSha256:actualSha,requiredApproval:approvalPhrase},null,2));process.exit(0);}
if(approval!==approvalPhrase)fail("MEDIA_MANAGEMENT_APPROVAL_REQUIRED","Explicit DEV-only approval szükséges.",{requiredApproval:approvalPhrase});
const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
const dir=join(backupRoot,stamp);mkdirSync(dir,{recursive:true,mode:0o700});
const dump=join(dir,"supabase-dev-pre-commerce-media-management-m1.dump");
const backup=run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"--format=custom","--no-owner","--no-privileges",`--file=${dump}`]);
if(!backup.ok)fail("MEDIA_MANAGEMENT_BACKUP_FAILED","A Media management előtti DEV backup sikertelen.",{stderr:backup.stderr.slice(-800)});
chmodSync(dump,0o600);
const listing=run("pg_restore",["--list",dump]);if(!listing.ok||!listing.stdout.includes("commerce_media_links")||!listing.stdout.includes("commerce_media_assets"))fail("MEDIA_MANAGEMENT_BACKUP_VERIFY_FAILED","A Media management backup listing ellenőrzése sikertelen.");
const dumpSha=sha(dump);writeFileSync(join(dir,"backup.sha256"),`${dumpSha}  ${basename(dump)}\n`,{mode:0o600});
const apply=run("psql",args(["-1","-f",migration]));if(!apply.ok)fail("MEDIA_MANAGEMENT_APPLY_FAILED","A Media management migráció sikertelen; backup megmaradt.",{stderr:apply.stderr.slice(-1600)});
const after=ready(probe());
const report={ok:true,mode,applied:true,migration:migrationRel,migrationSha256:actualSha,backup:{directory:dir,file:basename(dump),sha256:dumpSha,listingVerified:true},probe:after,completedAt:new Date().toISOString()};
writeFileSync(join(dir,"migration-report.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});console.log(JSON.stringify(report,null,2));
