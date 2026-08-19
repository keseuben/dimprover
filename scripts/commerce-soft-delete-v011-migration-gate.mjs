#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root=process.cwd();
const mode=(process.argv[2]||"preflight").trim().toLowerCase();
const migrationRel="supabase/migrations/20260819143000_dimpro_commerce_soft_delete_conformance_v011.sql";
const migration=join(root,migrationRel);
const expectedSha="ddafd28288829e4e63359978bee06cfd0019b104bd117aa3a17538705c13443b";
const approvalPhrase="DEV_ONLY_COMMERCE_SOFT_DELETE_V011_APPLY_APPROVED";
const approval=(process.env.COMMERCE_SOFT_DELETE_V011_MIGRATION_APPROVED||"").trim();
const backupRoot="/srv/dimpro-dev/backups/commerce-soft-delete-v011";
const db={host:"aws-0-eu-central-1.pooler.supabase.com",port:"5432",database:"postgres",user:"postgres.pbgyuznivqvestuksvif"};
const tables=[
  "commerce_brands","commerce_categories","commerce_goods_receipt_items","commerce_goods_receipts",
  "commerce_inventory_balances","commerce_inventory_reservations","commerce_inventory_sources","commerce_manufacturers",
  "commerce_media_assets","commerce_media_links","commerce_media_overlays","commerce_media_variants",
  "commerce_order_items","commerce_order_mirror_attempts","commerce_orders","commerce_prices",
  "commerce_product_identifiers","commerce_product_variants","commerce_products","commerce_storefronts","commerce_warehouses",
];
const tableSql=tables.map((value)=>`'${value}'`).join(",");
function fail(code,message,details={}){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(2);}
function run(cmd,args,opt={}){const r=spawnSync(cmd,args,{cwd:root,encoding:"utf8",env:{...process.env},maxBuffer:16*1024*1024,...opt});return{ok:!r.error&&r.status===0,status:r.status,stdout:(r.stdout||"").trim(),stderr:(r.stderr||"").trim()};}
function sha(file){return createHash("sha256").update(readFileSync(file)).digest("hex");}
function psqlArgs(extra=[]){return["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra];}
function query(sql){const r=run("psql",psqlArgs(["-Atc",sql]));if(!r.ok)fail("SOFT_DELETE_DB_QUERY_FAILED","A Commerce soft-delete schema probe sikertelen.",{stderr:r.stderr.slice(-1200)});return r.stdout;}
function probe(){
  const mismatchSql=tables.map((table)=>`select count(*) c from public.${table} where deleted_at is distinct from archived_at`).join(" union all ");
  const raw=query(`select json_build_object(
    'version',(select schema_version from public.commerce_schema_meta where component='commerce-core'),
    'count',(select migration_count from public.commerce_schema_meta where component='commerce-core'),
    'deletedColumns',(select count(*) from information_schema.columns where table_schema='public' and table_name in (${tableSql}) and column_name='deleted_at' and data_type='timestamp with time zone'),
    'archivedColumns',(select count(*) from information_schema.columns where table_schema='public' and table_name in (${tableSql}) and column_name='archived_at' and data_type='timestamp with time zone'),
    'syncTriggers',(select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${tableSql}) and t.tgname='commerce_soft_delete_sync_trigger' and not t.tgisinternal),
    'syncChecks',(select count(*) from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${tableSql}) and con.conname='commerce_soft_delete_sync_check' and con.contype='c'),
    'syncFunction',to_regprocedure('public.commerce_sync_soft_delete_columns()') is not null
  )::text;`);
  let result;try{result=JSON.parse(raw);}catch{fail("SOFT_DELETE_PROBE_INVALID","A Commerce soft-delete probe invalid JSON-t adott.");}
  if(Number(result.deletedColumns)===21)result.mismatches=Number(query(`select coalesce(sum(c),0) from (${mismatchSql}) q;`));
  return result;
}
function isBaseline(p){return p.version==="0.1.10"&&Number(p.count)===11&&Number(p.deletedColumns)===0&&Number(p.archivedColumns)===21&&!p.syncFunction&&Number(p.syncTriggers)===0&&Number(p.syncChecks)===0;}
function assertReady(p){if(p.version!=="0.1.11"||Number(p.count)!==12||Number(p.deletedColumns)!==21||Number(p.archivedColumns)!==21||Number(p.syncTriggers)!==21||Number(p.syncChecks)!==21||!p.syncFunction||Number(p.mismatches)!==0)fail("SOFT_DELETE_SCHEMA_NOT_READY","A Commerce 0.1.11 soft-delete schema nem teljes.",{probe:p});return p;}
function stamp(){return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");}

if(!["preflight","apply","verify"].includes(mode))fail("SOFT_DELETE_MODE_INVALID","Használat: preflight | apply | verify");
const pgpassStat=statSync("/root/.pgpass");
if((pgpassStat.mode&0o777)!==0o600)fail("SOFT_DELETE_PGPASS_MODE","A /root/.pgpass jogosultsága nem 0600.");
const actualSha=sha(migration);
if(actualSha!==expectedSha)fail("SOFT_DELETE_SHA_MISMATCH","A soft-delete migráció SHA eltér.",{expectedSha,actualSha});
const before=probe();
if(mode==="verify"){console.log(JSON.stringify({ok:true,mode,probe:assertReady(before)},null,2));process.exit(0);}
if(before.version==="0.1.11"){console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,probe:assertReady(before)},null,2));process.exit(0);}
if(!isBaseline(before))fail("SOFT_DELETE_BASELINE_MISMATCH","A 0.1.11 migráció csak Commerce 0.1.10 / 11 baseline-ról alkalmazható.",{probe:before});
if(mode==="preflight"){console.log(JSON.stringify({ok:true,mode,readyForApply:true,migration:migrationRel,migrationSha256:actualSha,tableCount:tables.length,requiredApproval:approvalPhrase},null,2));process.exit(0);}
if(approval!==approvalPhrase)fail("SOFT_DELETE_APPROVAL_REQUIRED","Explicit DEV-only migration approval szükséges.",{requiredApproval:approvalPhrase});

const dir=join(backupRoot,stamp());mkdirSync(dir,{recursive:true,mode:0o700});
const dump=join(dir,"supabase-dev-pre-commerce-soft-delete-v011.dump");
const backup=run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"--format=custom","--no-owner","--no-privileges",`--file=${dump}`]);
if(!backup.ok)fail("SOFT_DELETE_BACKUP_FAILED","A Commerce 0.1.11 előtti DEV backup sikertelen.",{backupDir:dir,status:backup.status,stderr:backup.stderr.slice(-1200)});
chmodSync(dump,0o600);
const listing=run("pg_restore",["--list",dump]);
if(!listing.ok||!listing.stdout.includes("commerce_products")||!listing.stdout.includes("commerce_orders")||!listing.stdout.includes("commerce_inventory_reservations")||!listing.stdout.includes("commerce_media_assets"))fail("SOFT_DELETE_BACKUP_VERIFY_FAILED","A DEV backup listing ellenőrzése sikertelen.",{backupDir:dir});
const dumpSha=sha(dump);writeFileSync(join(dir,"backup.sha256"),`${dumpSha}  ${basename(dump)}\n`,{mode:0o600});
const apply=run("psql",psqlArgs(["-1","-f",migration]));
if(!apply.ok)fail("SOFT_DELETE_APPLY_FAILED","A Commerce 0.1.11 migráció sikertelen; backup megmaradt.",{backupDir:dir,status:apply.status,stderr:apply.stderr.slice(-1800)});
const after=assertReady(probe());
const report={ok:true,mode,applied:true,migration:migrationRel,migrationSha256:actualSha,backup:{directory:dir,file:basename(dump),sha256:dumpSha,listingVerified:true},probe:after,completedAt:new Date().toISOString()};
writeFileSync(join(dir,"migration-report.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(report,null,2));
