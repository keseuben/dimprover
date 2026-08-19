#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
const root=process.cwd(),mode=(process.argv[2]||"preflight").trim().toLowerCase();
const migrationRel="supabase/migrations/20260819104500_dimpro_commerce_schema_conformance_v019.sql";
const migration=join(root,migrationRel),expectedSha="b98323c7f0826b69b6f837ff1f8707f3958bb1fbfbce881dce926654e601d396";
const approvalPhrase="DEV_ONLY_COMMERCE_SCHEMA_CONFORMANCE_V019_APPLY_APPROVED";
const approval=(process.env.COMMERCE_SCHEMA_CONFORMANCE_V019_MIGRATION_APPROVED||"").trim();
const backupRoot="/srv/dimpro-dev/backups/commerce-schema-conformance-v019";
const db={host:"aws-0-eu-central-1.pooler.supabase.com",port:"5432",database:"postgres",user:"postgres.pbgyuznivqvestuksvif"};
function fail(code,message,details={}){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(2);}
function run(cmd,args,opt={}){const r=spawnSync(cmd,args,{cwd:root,encoding:"utf8",env:{...process.env},...opt});return{ok:!r.error&&r.status===0,status:r.status,stdout:(r.stdout||"").trim(),stderr:(r.stderr||"").trim()};}
function sha(file){return createHash("sha256").update(readFileSync(file)).digest("hex");}
function psqlArgs(extra=[]){return["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra];}
function query(sql){const r=run("psql",psqlArgs(["-Atc",sql]));if(!r.ok)fail("CONFORMANCE_DB_QUERY_FAILED","A Commerce schema probe sikertelen.",{stderr:r.stderr.slice(-1200)});return r.stdout;}
function json(sql,code){try{return JSON.parse(query(sql));}catch{fail(code,"A Commerce schema probe invalid JSON-t adott.");}}
function pgpass(){const file="/root/.pgpass";let st;try{st=statSync(file);}catch{fail("CONFORMANCE_PGPASS_MISSING","A root-only DEV .pgpass hiányzik.");}if((st.mode&0o777)!==0o600)fail("CONFORMANCE_PGPASS_MODE","A /root/.pgpass jogosultsága nem 0600.");}
const priceRpc="public.commerce_price_set_active(uuid,uuid,text,numeric,integer,timestamp with time zone)";
function probe(){return json(`select json_build_object(
 'version',(select schema_version from public.commerce_schema_meta where component='commerce-core'),
 'count',(select migration_count from public.commerce_schema_meta where component='commerce-core'),
 'amount',exists(select 1 from information_schema.columns where table_schema='public' and table_name='commerce_prices' and column_name='amount' and data_type='numeric' and numeric_precision=19 and numeric_scale=4),
 'unitCost',exists(select 1 from information_schema.columns where table_schema='public' and table_name='commerce_goods_receipt_items' and column_name='unit_cost' and data_type='numeric' and numeric_precision=19 and numeric_scale=4),
 'priceNet',exists(select 1 from information_schema.columns where table_schema='public' and table_name='commerce_order_items' and column_name='price_net' and data_type='numeric' and numeric_precision=19 and numeric_scale=4),
 'oldMoney',exists(select 1 from information_schema.columns where table_schema='public' and table_name in ('commerce_prices','commerce_goods_receipt_items','commerce_order_items') and column_name in ('amount_minor','unit_cost_minor','price_net_minor')),
 'badQuantity',(select count(*) from information_schema.columns where table_schema='public' and ((table_name='commerce_external_inventory_snapshots' and column_name='quantity') or (table_name='commerce_goods_receipt_items' and column_name='quantity') or (table_name='commerce_inventory_balances' and column_name in ('physical_quantity','reserved_quantity','available_quantity','incoming_quantity')) or (table_name='commerce_inventory_reservations' and column_name in ('requested_quantity','released_quantity','consumed_quantity','remaining_quantity')) or (table_name='commerce_inventory_reservation_events' and column_name='quantity') or (table_name='commerce_order_items' and column_name='quantity') or (table_name='commerce_stock_movements' and column_name in ('physical_delta','reserved_delta','incoming_delta'))) and not(data_type='numeric' and numeric_precision=19 and numeric_scale=6)),
 'priceRpc',to_regprocedure('${priceRpc}') is not null,
 'authPriceExec',case when to_regprocedure('${priceRpc}') is null then false else has_function_privilege('authenticated',to_regprocedure('${priceRpc}'),'EXECUTE') end,
 'servicePriceExec',case when to_regprocedure('${priceRpc}') is null then false else has_function_privilege('service_role',to_regprocedure('${priceRpc}'),'EXECUTE') end
)::text;`,"CONFORMANCE_PROBE_INVALID");}
function oldBaseline(p){return p.version==="0.1.8"&&Number(p.count)===9&&p.oldMoney===true&&!p.amount&&!p.unitCost&&!p.priceNet;}
function assertReady(p){if(p.version!=="0.1.9"||Number(p.count)!==10||!p.amount||!p.unitCost||!p.priceNet||p.oldMoney||Number(p.badQuantity)!==0||!p.priceRpc||p.authPriceExec||!p.servicePriceExec)fail("CONFORMANCE_SCHEMA_NOT_READY","A Commerce 0.1.9 numerikus schema/security nem teljes.",{probe:p});return p;}
function dataFits(){const q=query(`select case when exists(select 1 from public.commerce_external_inventory_snapshots where abs(quantity)>=10000000000000::numeric) or exists(select 1 from public.commerce_goods_receipt_items where abs(quantity)>=10000000000000::numeric) or exists(select 1 from public.commerce_inventory_balances where abs(physical_quantity)>=10000000000000::numeric or abs(reserved_quantity)>=10000000000000::numeric or abs(incoming_quantity)>=10000000000000::numeric) or exists(select 1 from public.commerce_inventory_reservations where abs(requested_quantity)>=10000000000000::numeric or abs(released_quantity)>=10000000000000::numeric or abs(consumed_quantity)>=10000000000000::numeric) or exists(select 1 from public.commerce_inventory_reservation_events where abs(quantity)>=10000000000000::numeric) or exists(select 1 from public.commerce_order_items where abs(quantity)>=10000000000000::numeric) or exists(select 1 from public.commerce_stock_movements where abs(physical_delta)>=10000000000000::numeric or abs(reserved_delta)>=10000000000000::numeric or abs(incoming_delta)>=10000000000000::numeric) or exists(select 1 from public.commerce_prices where abs(amount_minor)>=1000000000000000::numeric) or exists(select 1 from public.commerce_goods_receipt_items where unit_cost_minor is not null and abs(unit_cost_minor)>=1000000000000000::numeric) or exists(select 1 from public.commerce_order_items where abs(price_net_minor)>=1000000000000000::numeric) then 'NO' else 'YES' end;`);if(q!=="YES")fail("CONFORMANCE_DATA_OVERFLOW","A meglévő Commerce adat nem fér el a kötelező NUMERIC(19,x) tartományban.");}
function stamp(){return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");}
if(!["preflight","apply","verify"].includes(mode))fail("CONFORMANCE_MODE_INVALID","Használat: preflight | apply | verify");
pgpass();const actualSha=sha(migration);if(actualSha!==expectedSha)fail("CONFORMANCE_SHA_MISMATCH","A conformance migráció SHA eltér.",{expectedSha,actualSha});
const before=probe();
if(mode==="verify"){assertReady(before);console.log(JSON.stringify({ok:true,mode,probe:before},null,2));process.exit(0);}
if(before.version==="0.1.9"){assertReady(before);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,probe:before},null,2));process.exit(0);}
if(!oldBaseline(before))fail("CONFORMANCE_BASELINE_MISMATCH","A 0.1.9 migráció csak a Commerce 0.1.8 / 9 canonical előtti baseline-ról alkalmazható.",{probe:before});
dataFits();
if(mode==="preflight"){console.log(JSON.stringify({ok:true,mode,readyForApply:true,migration:migrationRel,migrationSha256:actualSha,requiredApproval:approvalPhrase},null,2));process.exit(0);}
if(approval!==approvalPhrase)fail("CONFORMANCE_APPROVAL_REQUIRED","Explicit DEV-only migration approval szükséges.",{requiredApproval:approvalPhrase});
const dir=join(backupRoot,stamp());mkdirSync(dir,{recursive:true,mode:0o700});const dump=join(dir,"supabase-dev-pre-commerce-schema-conformance-v019.dump");
const backup=run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"--format=custom","--no-owner","--no-privileges",`--file=${dump}`]);
if(!backup.ok)fail("CONFORMANCE_BACKUP_FAILED","A Commerce 0.1.9 előtti DEV backup sikertelen.",{backupDir:dir,status:backup.status,stderr:backup.stderr.slice(-1200)});
chmodSync(dump,0o600);const listing=run("pg_restore",["--list",dump]);if(!listing.ok||!listing.stdout.includes("commerce_prices")||!listing.stdout.includes("commerce_inventory_balances")||!listing.stdout.includes("commerce_orders"))fail("CONFORMANCE_BACKUP_VERIFY_FAILED","A DEV backup listing ellenőrzése sikertelen.",{backupDir:dir});
const dumpSha=sha(dump);writeFileSync(join(dir,"backup.sha256"),`${dumpSha}  ${basename(dump)}\n`,{mode:0o600});
const apply=run("psql",psqlArgs(["-1","-f",migration]));if(!apply.ok)fail("CONFORMANCE_APPLY_FAILED","A Commerce 0.1.9 migráció sikertelen; backup megmaradt.",{backupDir:dir,status:apply.status,stderr:apply.stderr.slice(-1800)});
const after=probe();assertReady(after);const report={ok:true,mode,applied:true,migration:migrationRel,migrationSha256:actualSha,backup:{directory:dir,file:basename(dump),sha256:dumpSha,listingVerified:true},probe:after,completedAt:new Date().toISOString()};writeFileSync(join(dir,"migration-report.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});console.log(JSON.stringify(report,null,2));
