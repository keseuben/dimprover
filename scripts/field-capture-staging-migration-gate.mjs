#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root=process.cwd();
const mode=(process.argv[2]||"preflight").trim().toLowerCase();
const migrationRel="supabase/migrations/20260818221500_field_capture_staging_package_v010.sql";
const migration=join(root,migrationRel);
const expectedSha="ed0f9f24867ae6f04e9939ded9e6247ba19cd9614f1cc63190d7103c3fb5135e";
const db={host:"aws-0-eu-central-1.pooler.supabase.com",port:"5432",database:"postgres",user:"postgres.pbgyuznivqvestuksvif",role:"postgres",projectRef:"pbgyuznivqvestuksvif"};
const approvalPhrase="DEV_ONLY_FIELD_CAPTURE_STAGING_APPLY_APPROVED";
const approval=(process.env.FIELD_CAPTURE_STAGING_MIGRATION_APPROVED||"").trim();
const backupRoot=process.env.FIELD_CAPTURE_STAGING_BACKUP_ROOT?.trim()||"/srv/dimpro-dev/backups/field-capture-staging-v010";

function fail(code,message,details={},exitCode=2){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(exitCode)}
function run(command,args,options={}){const r=spawnSync(command,args,{cwd:root,encoding:"utf8",env:{...process.env},...options});return{ok:!r.error&&r.status===0,status:r.status,stdout:(r.stdout||"").trim(),stderr:(r.stderr||"").trim()}}
function requireCommand(c){const r=spawnSync(c,["--version"],{encoding:"utf8"});if(r.error||r.status!==0)fail("FIELD_CAPTURE_STAGING_TOOL_MISSING",`${c} nem érhető el.`)}
function sha(file){return createHash("sha256").update(readFileSync(file)).digest("hex")}
function psqlArgs(extra=[]){return["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra]}
function query(sql){const r=run("psql",psqlArgs(["-Atc",sql]));if(!r.ok)fail("FIELD_CAPTURE_STAGING_DB_QUERY_FAILED","DEV schema probe sikertelen.",{status:r.status,stderr:r.stderr.slice(-800)});return r.stdout}
function json(sql,code){try{return JSON.parse(query(sql))}catch{fail(code,"DEV schema probe invalid JSON.")}}
function pgpassReady(){
  const file="/root/.pgpass";let st;
  try{st=statSync(file)}catch{fail("FIELD_CAPTURE_STAGING_PGPASS_MISSING","A root-only DEV .pgpass hiányzik.")}
  if((st.mode&0o777)!==0o600)fail("FIELD_CAPTURE_STAGING_PGPASS_MODE","A /root/.pgpass jogosultsága nem 0600.");
  const ok=readFileSync(file,"utf8").split(/\r?\n/).filter(Boolean).some(line=>{const p=line.split(":");return p.length>=5&&p[0]===db.host&&p[1]===db.port&&p[2]===db.database&&p[3]===db.user&&Boolean(p.slice(4).join(":"))});
  if(!ok)fail("FIELD_CAPTURE_STAGING_PGPASS_TARGET_MISSING","A .pgpass nem tartalmazza a rögzített DEV Supabase célt.");
}
function identity(){return json("select json_build_object('database',current_database(),'user',current_user,'port',inet_server_port())::text;","FIELD_CAPTURE_STAGING_DB_IDENTITY_INVALID")}
function probe(){return json(`select json_build_object(
 'staging',to_regclass('public.field_capture_staging_packages') is not null,
 'sessionSentinel',to_regclass('public.field_capture_sessions') is not null,
 'userSentinel',to_regclass('public.dimpro_users') is not null,
 'entitlementSentinel',to_regclass('public.dimpro_send_entitlements') is not null,
 'projectSentinel',to_regclass('public.project_core_projects') is not null,
 'dropSentinel',to_regclass('public.drop_packages') is not null,
 'metaSentinel',to_regclass('public.field_capture_schema_meta') is not null
)::text;`,"FIELD_CAPTURE_STAGING_SCHEMA_PROBE_INVALID")}
function marker(){return json("select coalesce((select json_build_object('version',schema_version,'count',migration_count,'bootstrap',bootstrap_id) from public.field_capture_schema_meta where component='field-capture-staging'),'{}'::json)::text;","FIELD_CAPTURE_STAGING_MARKER_INVALID")}
function assertDev(p,id){
  if(id.database!==db.database||id.user!==db.role||Number(id.port)!==5432)fail("FIELD_CAPTURE_STAGING_DB_TARGET_MISMATCH","Nem a várt DEV PostgreSQL cél aktív.",id);
  for(const key of ["sessionSentinel","userSentinel","entitlementSentinel","projectSentinel","dropSentinel","metaSentinel"])if(!p[key])fail("FIELD_CAPTURE_STAGING_DEV_SENTINEL_MISSING",`Kötelező DEV sentinel hiányzik: ${key}.`,{schema:p});
}
function security(){return json(`select json_build_object(
 'rls',coalesce((select relrowsecurity from pg_class where oid='public.field_capture_staging_packages'::regclass),false),
 'anonSelect',has_table_privilege('anon','public.field_capture_staging_packages','SELECT'),
 'authSelect',has_table_privilege('authenticated','public.field_capture_staging_packages','SELECT'),
 'serviceSelect',has_table_privilege('service_role','public.field_capture_staging_packages','SELECT'),
 'serviceInsert',has_table_privilege('service_role','public.field_capture_staging_packages','INSERT'),
 'serviceUpdate',has_table_privilege('service_role','public.field_capture_staging_packages','UPDATE'),
 'serviceDelete',has_table_privilege('service_role','public.field_capture_staging_packages','DELETE')
)::text;`,"FIELD_CAPTURE_STAGING_SECURITY_INVALID")}
function assertSecurity(s){if(!s.rls||s.anonSelect||s.authSelect||!s.serviceSelect||!s.serviceInsert||!s.serviceUpdate||!s.serviceDelete)fail("FIELD_CAPTURE_STAGING_SECURITY_NOT_READY","A staging server-only RLS/grant acceptance nem teljes.",{security:s})}
function assertMarker(){const m=marker();if(m.version!=="0.1.0"||Number(m.count)!==1||m.bootstrap!=="field-capture-staging-v010-20260818")fail("FIELD_CAPTURE_STAGING_MARKER_NOT_READY","A staging schema marker hibás.",{marker:m});return m}
function rollbackBody(){
  const source=readFileSync(migration,"utf8");
  const body=source.replace(/^\s*begin;\s*/i,"").replace(/\s*commit;\s*$/i,"");
  if(body===source||/(^|\n)\s*(begin|commit);\s*($|\n)/i.test(body))fail("FIELD_CAPTURE_STAGING_ROLLBACK_SANITIZE_FAILED","A rollback-próba nem tudta leválasztani a migráció külső tranzakcióját.");
  return body;
}
function stamp(){return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z")}

if(!["preflight","rollback-test","apply","verify"].includes(mode))fail("FIELD_CAPTURE_STAGING_MODE_INVALID","Használat: preflight | rollback-test | apply | verify");
for(const c of ["psql","pg_dump","pg_restore"])requireCommand(c);
pgpassReady();
const actualSha=sha(migration);if(actualSha!==expectedSha)fail("FIELD_CAPTURE_STAGING_MIGRATION_SHA_MISMATCH","A staging migráció SHA-256 eltér.",{expectedSha,actualSha});
const before=probe(),id=identity();assertDev(before,id);

if(mode==="preflight"){
  if(before.staging){const m=assertMarker(),s=security();assertSecurity(s);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,marker:m,security:s},null,2));process.exit(0)}
  const m=marker();if(Object.keys(m).length)fail("FIELD_CAPTURE_STAGING_PARTIAL_SCHEMA","Staging marker létezik, de a tábla hiányzik.",{marker:m});
  console.log(JSON.stringify({ok:true,mode,readyForRollbackTest:true,readyForApply:true,migration:migrationRel,migrationSha256:expectedSha,database:{projectRef:db.projectRef,database:id.database,user:id.user,port:id.port},schema:before,requiredApproval:approvalPhrase},null,2));process.exit(0)
}
if(mode==="verify"){
  if(!before.staging)fail("FIELD_CAPTURE_STAGING_TARGET_NOT_READY","A staging schema még nincs alkalmazva.");
  const m=assertMarker(),s=security();assertSecurity(s);console.log(JSON.stringify({ok:true,mode,schema:before,marker:m,security:s},null,2));process.exit(0)
}
if(mode==="rollback-test"){
  if(before.staging)fail("FIELD_CAPTURE_STAGING_ROLLBACK_BASELINE","Rollback-test csak staging nélküli baseline-on futtatható.");
  const script=`begin;\n${rollbackBody()}\nselect count(*) from public.field_capture_schema_meta where component='field-capture-staging';\nrollback;\n`;
  const r=run("psql",psqlArgs([]),{input:script});
  if(!r.ok)fail("FIELD_CAPTURE_STAGING_ROLLBACK_TEST_FAILED","A tranzakciós rollback-próba sikertelen.",{status:r.status,stderr:r.stderr.slice(-1200)});
  const after=probe(),m=marker();if(after.staging||Object.keys(m).length)fail("FIELD_CAPTURE_STAGING_ROLLBACK_DIRTY","Rollback után staging objektum maradt.",{schema:after,marker:m});
  console.log(JSON.stringify({ok:true,mode,rolledBack:true,schemaAfter:after},null,2));process.exit(0)
}
if(approval!==approvalPhrase)fail("FIELD_CAPTURE_STAGING_APPROVAL_REQUIRED","Az apply módhoz explicit DEV-only approval szükséges.",{requiredApproval:approvalPhrase});
if(before.staging){const m=assertMarker(),s=security();assertSecurity(s);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,marker:m,security:s},null,2));process.exit(0)}

const dir=join(backupRoot,stamp());mkdirSync(dir,{recursive:true,mode:0o700});
const dump=join(dir,"supabase-dev-pre-field-capture-staging.dump");
const backup=run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"--format=custom","--no-owner","--no-privileges",`--file=${dump}`]);
if(!backup.ok)fail("FIELD_CAPTURE_STAGING_BACKUP_FAILED","A teljes DEV backup sikertelen; migráció nem futott.",{status:backup.status,backupDir:dir});
chmodSync(dump,0o600);
const listing=run("pg_restore",["--list",dump]);
if(!listing.ok||!listing.stdout.includes("field_capture_sessions")||!listing.stdout.includes("drop_packages")||!listing.stdout.includes("dimpro_send_entitlements"))fail("FIELD_CAPTURE_STAGING_BACKUP_VERIFY_FAILED","A DEV backup listing ellenőrzése sikertelen.",{backupDir:dir});
const dumpSha=sha(dump);
writeFileSync(join(dir,"backup.sha256"),`${dumpSha}  ${basename(dump)}\n`,{mode:0o600});
writeFileSync(join(dir,"migration.sha256"),`${expectedSha}  ${basename(migration)}\n`,{mode:0o600});
const applied=run("psql",psqlArgs(["-1","-f",migration]));
if(!applied.ok)fail("FIELD_CAPTURE_STAGING_APPLY_FAILED","A staging migráció sikertelen; backup megmaradt.",{status:applied.status,backupDir:dir,stderr:applied.stderr.slice(-1200)});
const after=probe();if(!after.staging)fail("FIELD_CAPTURE_STAGING_POST_SCHEMA_FAILED","Apply után a staging tábla hiányzik.",{backupDir:dir,schema:after});
const m=assertMarker(),s=security();assertSecurity(s);
const report={ok:true,mode,applied:true,migration:migrationRel,migrationSha256:expectedSha,backup:{directory:dir,file:basename(dump),sha256:dumpSha,listingVerified:true},schemaBefore:before,schemaAfter:after,marker:m,security:s,completedAt:new Date().toISOString()};
writeFileSync(join(dir,"migration-report.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(report,null,2));
