#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root=process.cwd();
const mode=(process.argv[2]||"preflight").trim().toLowerCase();
const migrationRel="supabase/migrations/20260818074500_field_capture_p7_server_session_v010.sql";
const migration=join(root,migrationRel);
const expectedSha="c77da0e0f55e987d4274d83904ff28ecc73615e79013fca2ec4843917f67d0fd";
const db={host:"aws-0-eu-central-1.pooler.supabase.com",port:"5432",database:"postgres",user:"postgres.pbgyuznivqvestuksvif",role:"postgres",projectRef:"pbgyuznivqvestuksvif"};
const approvalPhrase="DEV_ONLY_FIELD_CAPTURE_P7_APPLY_APPROVED";
const approval=(process.env.FIELD_CAPTURE_P7_MIGRATION_APPROVED||"").trim();
const backupRoot=process.env.FIELD_CAPTURE_P7_BACKUP_ROOT?.trim()||"/srv/dimpro-dev/backups/field-capture-p7-v010";
const tables=["field_capture_sessions","field_capture_items","field_capture_asset_refs","field_capture_locations","field_capture_orientations","field_capture_voice_notes","field_capture_destinations","field_capture_events","field_capture_sync_queue"];

function fail(code,message,details={},exitCode=2){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(exitCode)}
function run(command,args,options={}){const r=spawnSync(command,args,{cwd:root,encoding:"utf8",env:{...process.env},...options});return{ok:!r.error&&r.status===0,status:r.status,stdout:(r.stdout||"").trim(),stderr:(r.stderr||"").trim()}}
function requireCommand(c){const r=spawnSync(c,["--version"],{encoding:"utf8"});if(r.error||r.status!==0)fail("FIELD_CAPTURE_P7_TOOL_MISSING",`${c} nem érhető el.`)}
function sha(file){return createHash("sha256").update(readFileSync(file)).digest("hex")}
function psqlArgs(extra=[]){return["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra]}
function query(sql){const r=run("psql",psqlArgs(["-Atc",sql]));if(!r.ok)fail("FIELD_CAPTURE_P7_DB_QUERY_FAILED","DEV schema probe sikertelen.",{status:r.status});return r.stdout}
function json(sql,code){try{return JSON.parse(query(sql))}catch{fail(code,"DEV schema probe invalid JSON.")}}
function pgpassReady(){
  const file="/root/.pgpass";
  let st; try{st=statSync(file)}catch{fail("FIELD_CAPTURE_P7_PGPASS_MISSING","A root-only DEV .pgpass hiányzik.")}
  if((st.mode&0o777)!==0o600)fail("FIELD_CAPTURE_P7_PGPASS_MODE","A /root/.pgpass jogosultsága nem 0600.");
  const lines=readFileSync(file,"utf8").split(/\r?\n/).filter(Boolean);
  const ok=lines.some(line=>{const p=line.split(":");return p.length>=5&&p[0]===db.host&&p[1]===db.port&&p[2]===db.database&&p[3]===db.user&&Boolean(p.slice(4).join(":"));});
  if(!ok)fail("FIELD_CAPTURE_P7_PGPASS_TARGET_MISSING","A .pgpass nem tartalmazza a rögzített DEV Supabase pooler célt.");
}
function identity(){return json(`select json_build_object('database',current_database(),'user',current_user,'port',inet_server_port())::text;`,"FIELD_CAPTURE_P7_DB_IDENTITY_INVALID")}
function probe(){
  const bools=tables.map(t=>`'${t}',to_regclass('public.${t}') is not null`).join(",");
  return json(`select json_build_object(
    'meta',to_regclass('public.field_capture_schema_meta') is not null,
    ${bools},
    'projectIdType',coalesce((select data_type from information_schema.columns where table_schema='public' and table_name='field_capture_sessions' and column_name='project_id'),''),
    'folderIdType',coalesce((select data_type from information_schema.columns where table_schema='public' and table_name='field_capture_destinations' and column_name='folder_id'),''),
    'identitySentinel',to_regclass('public.dimpro_send_entitlements') is not null,
    'projectSentinel',to_regclass('public.project_core_projects') is not null,
    'driveSentinel',to_regclass('public.drive_core_folders') is not null,
    'uploadSentinel',to_regclass('public.drop_upload_sessions') is not null
  )::text;`,"FIELD_CAPTURE_P7_SCHEMA_PROBE_INVALID");
}
function marker(){return json(`select coalesce((select json_build_object('version',schema_version,'count',migration_count,'bootstrap',bootstrap_id) from public.field_capture_schema_meta where component='field-capture-core'),'{}'::json)::text;`,"FIELD_CAPTURE_P7_MARKER_INVALID")}
function targetReady(p){return p.meta&&tables.every(t=>p[t]===true)&&p.projectIdType==="text"&&p.folderIdType==="text"}
function cleanBaseline(p){return !p.meta&&tables.every(t=>p[t]===false)}
function assertDev(p,id){
  if(id.database!==db.database||id.user!==db.role||Number(id.port)!==5432)fail("FIELD_CAPTURE_P7_DB_TARGET_MISMATCH","Nem a várt DEV PostgreSQL cél aktív.",{database:id.database,user:id.user,port:id.port});
  if(!p.identitySentinel||!p.projectSentinel||!p.driveSentinel||!p.uploadSentinel)fail("FIELD_CAPTURE_P7_DEV_SENTINEL_MISSING","A kötelező DEV Identity/Project/Drive/Drop sentinel hiányzik.",{probe:p});
}
function security(){
  const rows=tables.map(t=>`select '${t}' table_name,
    coalesce((select relrowsecurity from pg_class where oid='public.${t}'::regclass),false) rls,
    has_table_privilege('anon','public.${t}','SELECT') anon_select,
    has_table_privilege('authenticated','public.${t}','SELECT') auth_select,
    has_table_privilege('service_role','public.${t}','SELECT') service_select,
    has_table_privilege('service_role','public.${t}','INSERT') service_insert,
    has_table_privilege('service_role','public.${t}','UPDATE') service_update,
    has_table_privilege('service_role','public.${t}','DELETE') service_delete`).join(" union all ");
  return json(`select coalesce(json_agg(row_to_json(x) order by table_name),'[]'::json)::text from (${rows}) x;`,"FIELD_CAPTURE_P7_SECURITY_INVALID");
}
function assertSecurity(rows){for(const r of rows){if(!r.rls||r.anon_select||r.auth_select||!r.service_select||!r.service_insert||!r.service_update||!r.service_delete)fail("FIELD_CAPTURE_P7_SECURITY_NOT_READY","A server-only RLS/grant acceptance nem teljes.",{table:r.table_name,security:r})}}
function assertMarker(){const m=marker();if(m.version!=="0.1.0"||Number(m.count)!==1||m.bootstrap!=="field-capture-p7-v010-20260818")fail("FIELD_CAPTURE_P7_MARKER_NOT_READY","A Field Capture schema marker hibás.",{marker:m});return m}
function stamp(){return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z")}

if(!["preflight","rollback-test","apply","verify"].includes(mode))fail("FIELD_CAPTURE_P7_MODE_INVALID","Használat: preflight | rollback-test | apply | verify");
for(const c of ["psql","pg_dump","pg_restore"])requireCommand(c);
pgpassReady();
if(sha(migration)!==expectedSha)fail("FIELD_CAPTURE_P7_MIGRATION_SHA_MISMATCH","A P7 migráció SHA-256 eltér.",{expectedSha,actualSha:sha(migration)});
const before=probe(), id=identity(); assertDev(before,id);

if(mode==="preflight"){
  if(targetReady(before)){const m=assertMarker(),s=security();assertSecurity(s);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,migration:migrationRel,schema:before,marker:m,security:s},null,2));process.exit(0)}
  if(!cleanBaseline(before))fail("FIELD_CAPTURE_P7_PARTIAL_SCHEMA","Részleges Field Capture schema található; automatikus apply tiltva.",{schema:before});
  console.log(JSON.stringify({ok:true,mode,readyForRollbackTest:true,readyForApply:true,migration:migrationRel,migrationSha256:expectedSha,database:{projectRef:db.projectRef,database:id.database,user:id.user,port:id.port},schema:before,requiredApproval:approvalPhrase},null,2));process.exit(0)
}
if(mode==="verify"){
  if(!targetReady(before))fail("FIELD_CAPTURE_P7_TARGET_NOT_READY","A P7 schema még nincs teljesen alkalmazva.",{schema:before});
  const m=assertMarker(),s=security();assertSecurity(s);console.log(JSON.stringify({ok:true,mode,schema:before,marker:m,security:s},null,2));process.exit(0)
}
if(mode==="rollback-test"){
  if(!cleanBaseline(before))fail("FIELD_CAPTURE_P7_ROLLBACK_BASELINE","Rollback-test csak tiszta baseline-on futtatható.",{schema:before});
  const script=`begin;\n\\i ${migration}\nselect count(*) from public.field_capture_schema_meta where component='field-capture-core';\nrollback;\n`;
  const r=run("psql",psqlArgs([]),{input:script});
  if(!r.ok)fail("FIELD_CAPTURE_P7_ROLLBACK_TEST_FAILED","A tranzakciós rollback-próba sikertelen.",{status:r.status});
  const after=probe(); if(!cleanBaseline(after))fail("FIELD_CAPTURE_P7_ROLLBACK_DIRTY","Rollback után Field Capture objektum maradt.",{schema:after});
  console.log(JSON.stringify({ok:true,mode,rolledBack:true,schemaAfter:after},null,2));process.exit(0)
}
if(approval!==approvalPhrase)fail("FIELD_CAPTURE_P7_APPROVAL_REQUIRED","Az apply módhoz explicit DEV-only approval szükséges.",{requiredApproval:approvalPhrase});
if(targetReady(before)){const m=assertMarker(),s=security();assertSecurity(s);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,marker:m,security:s},null,2));process.exit(0)}
if(!cleanBaseline(before))fail("FIELD_CAPTURE_P7_BASELINE_MISMATCH","Apply csak tiszta Field Capture baseline-ról engedett.",{schema:before});

const dir=join(backupRoot,stamp());mkdirSync(dir,{recursive:true,mode:0o700});
const dump=join(dir,"supabase-dev-pre-field-capture-p7.dump");
const d=run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"--format=custom","--no-owner","--no-privileges",`--file=${dump}`]);
if(!d.ok)fail("FIELD_CAPTURE_P7_BACKUP_FAILED","A teljes DEV backup sikertelen; migráció nem futott.",{status:d.status,backupDir:dir});
chmodSync(dump,0o600);
const listing=run("pg_restore",["--list",dump]);
if(!listing.ok||!listing.stdout.includes("project_core_projects")||!listing.stdout.includes("dimpro_send_entitlements"))fail("FIELD_CAPTURE_P7_BACKUP_VERIFY_FAILED","A DEV backup listing ellenőrzése sikertelen.",{backupDir:dir});
const dumpSha=sha(dump);
writeFileSync(join(dir,"backup.sha256"),`${dumpSha}  ${basename(dump)}\n`,{mode:0o600});
writeFileSync(join(dir,"migration.sha256"),`${expectedSha}  ${basename(migration)}\n`,{mode:0o600});
writeFileSync(join(dir,"preflight.json"),JSON.stringify({database:{projectRef:db.projectRef,database:id.database,user:id.user,port:id.port},schema:before},null,2)+"\n",{mode:0o600});
const a=run("psql",psqlArgs(["-1","-f",migration]));
if(!a.ok)fail("FIELD_CAPTURE_P7_APPLY_FAILED","A P7 migráció sikertelen; backup megmaradt.",{status:a.status,backupDir:dir});
const after=probe();if(!targetReady(after))fail("FIELD_CAPTURE_P7_POST_SCHEMA_FAILED","Apply után a P7 schema nem teljes.",{backupDir:dir,schema:after});
const m=assertMarker(),s=security();assertSecurity(s);
const report={ok:true,mode,applied:true,migration:migrationRel,migrationSha256:expectedSha,backup:{directory:dir,file:basename(dump),sha256:dumpSha,listingVerified:true},schemaBefore:before,schemaAfter:after,marker:m,security:s,completedAt:new Date().toISOString()};
writeFileSync(join(dir,"migration-report.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(report,null,2));
