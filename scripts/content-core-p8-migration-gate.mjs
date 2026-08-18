#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root=process.cwd();
const mode=(process.argv[2]||"preflight").trim().toLowerCase();
const migrationRel="supabase/migrations/20260818183500_dimpro_content_core_user_drive_v010.sql";
const migration=join(root,migrationRel);
const expectedSha="3ad63454bf0335fc0ec881e7fef6992e315986f699a601ea36206f37f6a41852";
const db={host:"aws-0-eu-central-1.pooler.supabase.com",port:"5432",database:"postgres",user:"postgres.pbgyuznivqvestuksvif",role:"postgres",projectRef:"pbgyuznivqvestuksvif"};
const approvalPhrase="DEV_ONLY_CONTENT_CORE_P8_APPLY_APPROVED";
const approval=(process.env.CONTENT_CORE_P8_MIGRATION_APPROVED||"").trim();
const backupRoot=process.env.CONTENT_CORE_P8_BACKUP_ROOT?.trim()||"/srv/dimpro-dev/backups/content-core-p8-v010";
const tables=["dimpro_content_schema_meta","dimpro_content_objects","dimpro_content_refs"];

function fail(code,message,details={},exitCode=2){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(exitCode)}
function run(command,args,options={}){const r=spawnSync(command,args,{cwd:root,encoding:"utf8",env:{...process.env},...options});return{ok:!r.error&&r.status===0,status:r.status,stdout:(r.stdout||"").trim(),stderr:(r.stderr||"").trim()}}
function requireCommand(c){const r=spawnSync(c,["--version"],{encoding:"utf8"});if(r.error||r.status!==0)fail("CONTENT_CORE_P8_TOOL_MISSING",`${c} nem érhető el.`)}
function sha(file){return createHash("sha256").update(readFileSync(file)).digest("hex")}
function psqlArgs(extra=[]){return["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra]}
function query(sql){const r=run("psql",psqlArgs(["-Atc",sql]));if(!r.ok)fail("CONTENT_CORE_P8_DB_QUERY_FAILED","DEV schema probe sikertelen.",{status:r.status});return r.stdout}
function json(sql,code){try{return JSON.parse(query(sql))}catch{fail(code,"DEV schema probe invalid JSON.")}}
function pgpassReady(){
  const file="/root/.pgpass"; let st;
  try{st=statSync(file)}catch{fail("CONTENT_CORE_P8_PGPASS_MISSING","A root-only DEV .pgpass hiányzik.")}
  if((st.mode&0o777)!==0o600)fail("CONTENT_CORE_P8_PGPASS_MODE","A /root/.pgpass jogosultsága nem 0600.");
  const ok=readFileSync(file,"utf8").split(/\r?\n/).filter(Boolean).some(line=>{const p=line.split(":");return p.length>=5&&p[0]===db.host&&p[1]===db.port&&p[2]===db.database&&p[3]===db.user&&Boolean(p.slice(4).join(":"))});
  if(!ok)fail("CONTENT_CORE_P8_PGPASS_TARGET_MISSING","A .pgpass nem tartalmazza a rögzített DEV Supabase célt.");
}
function identity(){return json("select json_build_object('database',current_database(),'user',current_user,'port',inet_server_port())::text;","CONTENT_CORE_P8_DB_IDENTITY_INVALID")}
function probe(){return json(`select json_build_object(
 'meta',to_regclass('public.dimpro_content_schema_meta') is not null,
 'objects',to_regclass('public.dimpro_content_objects') is not null,
 'refs',to_regclass('public.dimpro_content_refs') is not null,
 'ownerUserType',coalesce((select data_type from information_schema.columns where table_schema='public' and table_name='dimpro_content_refs' and column_name='owner_user_id'),''),
 'ownerProjectType',coalesce((select data_type from information_schema.columns where table_schema='public' and table_name='dimpro_content_refs' and column_name='owner_project_id'),''),
 'userSentinel',to_regclass('public.dimpro_users') is not null,
 'projectSentinel',to_regclass('public.project_core_projects') is not null,
 'fieldSentinel',to_regclass('public.field_capture_destinations') is not null,
 'dropSentinel',to_regclass('public.drop_files') is not null,
 'driveSentinel',to_regclass('public.drive_core_folders') is not null
)::text;`,"CONTENT_CORE_P8_SCHEMA_PROBE_INVALID")}
function marker(){return json("select coalesce((select json_build_object('version',schema_version,'count',migration_count,'bootstrap',bootstrap_id) from public.dimpro_content_schema_meta where component='content-core'),'{}'::json)::text;","CONTENT_CORE_P8_MARKER_INVALID")}
function targetReady(p){return p.meta&&p.objects&&p.refs&&p.ownerUserType==="uuid"&&p.ownerProjectType==="text"}
function cleanBaseline(p){return !p.meta&&!p.objects&&!p.refs}
function assertDev(p,id){
 if(id.database!==db.database||id.user!==db.role||Number(id.port)!==5432)fail("CONTENT_CORE_P8_DB_TARGET_MISMATCH","Nem a várt DEV PostgreSQL cél aktív.",id);
 for(const key of ["userSentinel","projectSentinel","fieldSentinel","dropSentinel","driveSentinel"])if(!p[key])fail("CONTENT_CORE_P8_DEV_SENTINEL_MISSING",`Kötelező DEV sentinel hiányzik: ${key}.`,{schema:p});
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
 return json(`select coalesce(json_agg(row_to_json(x) order by table_name),'[]'::json)::text from (${rows}) x;`,"CONTENT_CORE_P8_SECURITY_INVALID")
}
function assertSecurity(rows){for(const r of rows)if(!r.rls||r.anon_select||r.auth_select||!r.service_select||!r.service_insert||!r.service_update||!r.service_delete)fail("CONTENT_CORE_P8_SECURITY_NOT_READY","A server-only RLS/grant acceptance nem teljes.",{table:r.table_name,security:r})}
function assertMarker(){const m=marker();if(m.version!=="0.1.0"||Number(m.count)!==1||m.bootstrap!=="content-core-user-drive-v010-20260818")fail("CONTENT_CORE_P8_MARKER_NOT_READY","A Content Core schema marker hibás.",{marker:m});return m}
function rollbackBody(){
 const source=readFileSync(migration,"utf8");
 const a=source.replace(/^\s*begin;\s*/i,"");
 const b=a.replace(/\s*commit;\s*$/i,"");
 if(b===source||/(^|\n)\s*(begin|commit);\s*($|\n)/i.test(b))fail("CONTENT_CORE_P8_ROLLBACK_SANITIZE_FAILED","A rollback-próba nem tudta leválasztani a migráció külső tranzakcióját.");
 return b;
}
function stamp(){return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z")}

if(!["preflight","rollback-test","apply","verify"].includes(mode))fail("CONTENT_CORE_P8_MODE_INVALID","Használat: preflight | rollback-test | apply | verify");
for(const c of ["psql","pg_dump","pg_restore"])requireCommand(c);
pgpassReady();
if(sha(migration)!==expectedSha)fail("CONTENT_CORE_P8_MIGRATION_SHA_MISMATCH","A P8 migráció SHA-256 eltér.",{expectedSha,actualSha:sha(migration)});
const before=probe(),id=identity();assertDev(before,id);

if(mode==="preflight"){
 if(targetReady(before)){const m=assertMarker(),s=security();assertSecurity(s);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,marker:m,security:s},null,2));process.exit(0)}
 if(!cleanBaseline(before))fail("CONTENT_CORE_P8_PARTIAL_SCHEMA","Részleges Content Core schema található; automatikus apply tiltva.",{schema:before});
 console.log(JSON.stringify({ok:true,mode,readyForRollbackTest:true,readyForApply:true,migration:migrationRel,migrationSha256:expectedSha,database:{projectRef:db.projectRef,database:id.database,user:id.user,port:id.port},schema:before,requiredApproval:approvalPhrase},null,2));process.exit(0)
}
if(mode==="verify"){
 if(!targetReady(before))fail("CONTENT_CORE_P8_TARGET_NOT_READY","A P8 schema még nincs teljesen alkalmazva.",{schema:before});
 const m=assertMarker(),s=security();assertSecurity(s);console.log(JSON.stringify({ok:true,mode,schema:before,marker:m,security:s},null,2));process.exit(0)
}
if(mode==="rollback-test"){
 if(!cleanBaseline(before))fail("CONTENT_CORE_P8_ROLLBACK_BASELINE","Rollback-test csak tiszta baseline-on futtatható.",{schema:before});
 const script=`begin;\n${rollbackBody()}\nselect count(*) from public.dimpro_content_schema_meta where component='content-core';\nrollback;\n`;
 const r=run("psql",psqlArgs([]),{input:script});
 if(!r.ok)fail("CONTENT_CORE_P8_ROLLBACK_TEST_FAILED","A tranzakciós rollback-próba sikertelen.",{status:r.status,stderr:r.stderr.slice(-1200)});
 const after=probe();if(!cleanBaseline(after))fail("CONTENT_CORE_P8_ROLLBACK_DIRTY","Rollback után Content Core objektum maradt.",{schema:after});
 console.log(JSON.stringify({ok:true,mode,rolledBack:true,schemaAfter:after},null,2));process.exit(0)
}
if(approval!==approvalPhrase)fail("CONTENT_CORE_P8_APPROVAL_REQUIRED","Az apply módhoz explicit DEV-only approval szükséges.",{requiredApproval:approvalPhrase});
if(targetReady(before)){const m=assertMarker(),s=security();assertSecurity(s);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,marker:m,security:s},null,2));process.exit(0)}
if(!cleanBaseline(before))fail("CONTENT_CORE_P8_BASELINE_MISMATCH","Apply csak tiszta Content Core baseline-ról engedett.",{schema:before});

const dir=join(backupRoot,stamp());mkdirSync(dir,{recursive:true,mode:0o700});
const dump=join(dir,"supabase-dev-pre-content-core-p8.dump");
const d=run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"--format=custom","--no-owner","--no-privileges",`--file=${dump}`]);
if(!d.ok)fail("CONTENT_CORE_P8_BACKUP_FAILED","A teljes DEV backup sikertelen; migráció nem futott.",{status:d.status,backupDir:dir});
chmodSync(dump,0o600);
const listing=run("pg_restore",["--list",dump]);
if(!listing.ok||!listing.stdout.includes("project_core_projects")||!listing.stdout.includes("dimpro_users")||!listing.stdout.includes("drop_files"))fail("CONTENT_CORE_P8_BACKUP_VERIFY_FAILED","A DEV backup listing ellenőrzése sikertelen.",{backupDir:dir});
const dumpSha=sha(dump);
writeFileSync(join(dir,"backup.sha256"),`${dumpSha}  ${basename(dump)}\n`,{mode:0o600});
writeFileSync(join(dir,"migration.sha256"),`${expectedSha}  ${basename(migration)}\n`,{mode:0o600});
writeFileSync(join(dir,"preflight.json"),JSON.stringify({database:{projectRef:db.projectRef,database:id.database,user:id.user,port:id.port},schema:before},null,2)+"\n",{mode:0o600});
const a=run("psql",psqlArgs(["-1","-f",migration]));
if(!a.ok)fail("CONTENT_CORE_P8_APPLY_FAILED","A P8 migráció sikertelen; backup megmaradt.",{status:a.status,backupDir:dir,stderr:a.stderr.slice(-1200)});
const after=probe();if(!targetReady(after))fail("CONTENT_CORE_P8_POST_SCHEMA_FAILED","Apply után a P8 schema nem teljes.",{backupDir:dir,schema:after});
const m=assertMarker(),s=security();assertSecurity(s);
const report={ok:true,mode,applied:true,migration:migrationRel,migrationSha256:expectedSha,backup:{directory:dir,file:basename(dump),sha256:dumpSha,listingVerified:true},schemaBefore:before,schemaAfter:after,marker:m,security:s,completedAt:new Date().toISOString()};
writeFileSync(join(dir,"migration-report.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(report,null,2));
