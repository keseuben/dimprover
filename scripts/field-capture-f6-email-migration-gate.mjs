#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root=process.cwd();
const mode=(process.argv[2]||"preflight").trim().toLowerCase();
const migrationRel="supabase/migrations/20260821173500_field_capture_report_email_delivery_f6_v010.sql";
const rollbackRel="supabase/rollback/FIELD_CAPTURE_REPORT_EMAIL_F6_V010_ROLLBACK.sql";
const migration=join(root,migrationRel), rollback=join(root,rollbackRel);
const expectedSha="80843faac0897c475a179c9174153638b75769d97ecfb57a69e0f08297d85670";
const expectedRollbackSha="ba059db48ee87b4867140ebe466faef5c37d7f21b912fd0936c0800a04238376";
const db={host:"aws-0-eu-central-1.pooler.supabase.com",port:"5432",database:"postgres",user:"postgres.pbgyuznivqvestuksvif",role:"postgres",projectRef:"pbgyuznivqvestuksvif"};
const approvalPhrase="DEV_ONLY_FIELD_CAPTURE_F6_EMAIL_APPLY_APPROVED";
const approval=(process.env.FIELD_CAPTURE_F6_EMAIL_MIGRATION_APPROVED||"").trim();
const backupRoot=process.env.FIELD_CAPTURE_F6_EMAIL_BACKUP_ROOT?.trim()||"/srv/dimpro-dev/backups/field-capture-report-email-f6-v010";

function fail(code,message,details={},exitCode=2){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(exitCode)}
function run(command,args,options={}){const r=spawnSync(command,args,{cwd:root,encoding:"utf8",env:{...process.env},...options});return{ok:!r.error&&r.status===0,status:r.status,stdout:(r.stdout||"").trim(),stderr:(r.stderr||"").trim()}}
function requireCommand(c){const r=spawnSync(c,["--version"],{encoding:"utf8"});if(r.error||r.status!==0)fail("FIELD_CAPTURE_F6_EMAIL_TOOL_MISSING",`${c} nem érhető el.`)}
function sha(file){return createHash("sha256").update(readFileSync(file)).digest("hex")}
function psqlArgs(extra=[]){return["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra]}
function query(sql){const r=run("psql",psqlArgs(["-Atc",sql]));if(!r.ok)fail("FIELD_CAPTURE_F6_EMAIL_DB_QUERY_FAILED","DEV schema probe sikertelen.",{status:r.status,stderr:r.stderr.slice(-1000)});return r.stdout}
function json(sql,code){try{return JSON.parse(query(sql))}catch{fail(code,"DEV schema probe invalid JSON.")}}
function pgpassReady(){
  const file="/root/.pgpass";let st;
  try{st=statSync(file)}catch{fail("FIELD_CAPTURE_F6_EMAIL_PGPASS_MISSING","A root-only DEV .pgpass hiányzik.")}
  if((st.mode&0o777)!==0o600)fail("FIELD_CAPTURE_F6_EMAIL_PGPASS_MODE","A /root/.pgpass jogosultsága nem 0600.");
  const ok=readFileSync(file,"utf8").split(/\r?\n/).filter(Boolean).some(line=>{const p=line.split(":");return p.length>=5&&p[0]===db.host&&p[1]===db.port&&p[2]===db.database&&p[3]===db.user&&Boolean(p.slice(4).join(":"))});
  if(!ok)fail("FIELD_CAPTURE_F6_EMAIL_PGPASS_TARGET_MISSING","A .pgpass nem tartalmazza a rögzített DEV Supabase célt.");
}
function identity(){return json("select json_build_object('database',current_database(),'user',current_user,'port',inet_server_port())::text;","FIELD_CAPTURE_F6_EMAIL_DB_IDENTITY_INVALID")}
function probe(){return json(`select json_build_object(
 'delivery',to_regclass('public.field_capture_report_email_deliveries') is not null,
 'sessionSentinel',to_regclass('public.field_capture_sessions') is not null,
 'userSentinel',to_regclass('public.dimpro_users') is not null,
 'eventSentinel',to_regclass('public.field_capture_events') is not null,
 'metaSentinel',to_regclass('public.field_capture_schema_meta') is not null
)::text;`,"FIELD_CAPTURE_F6_EMAIL_SCHEMA_PROBE_INVALID")}
function marker(){return json("select coalesce((select json_build_object('version',schema_version,'count',migration_count,'bootstrap',bootstrap_id) from public.field_capture_schema_meta where component='field-capture-report-email'),'{}'::json)::text;","FIELD_CAPTURE_F6_EMAIL_MARKER_INVALID")}
function assertDev(p,id){
  if(id.database!==db.database||id.user!==db.role||Number(id.port)!==5432)fail("FIELD_CAPTURE_F6_EMAIL_DB_TARGET_MISMATCH","Nem a várt DEV PostgreSQL cél aktív.",id);
  for(const key of ["sessionSentinel","userSentinel","eventSentinel","metaSentinel"])if(!p[key])fail("FIELD_CAPTURE_F6_EMAIL_DEV_SENTINEL_MISSING",`Kötelező DEV sentinel hiányzik: ${key}.`,{schema:p});
}
function security(){return json(`select json_build_object(
 'rls',coalesce((select relrowsecurity from pg_class where oid='public.field_capture_report_email_deliveries'::regclass),false),
 'anonSelect',has_table_privilege('anon','public.field_capture_report_email_deliveries','SELECT'),
 'authSelect',has_table_privilege('authenticated','public.field_capture_report_email_deliveries','SELECT'),
 'serviceSelect',has_table_privilege('service_role','public.field_capture_report_email_deliveries','SELECT'),
 'serviceInsert',has_table_privilege('service_role','public.field_capture_report_email_deliveries','INSERT'),
 'serviceUpdate',has_table_privilege('service_role','public.field_capture_report_email_deliveries','UPDATE'),
 'serviceDelete',has_table_privilege('service_role','public.field_capture_report_email_deliveries','DELETE'),
 'uniqueKey',exists(select 1 from pg_constraint where conrelid='public.field_capture_report_email_deliveries'::regclass and contype='u' and conname='field_capture_report_email_idempotency_unique')
)::text;`,"FIELD_CAPTURE_F6_EMAIL_SECURITY_INVALID")}
function assertSecurity(s){if(!s.rls||s.anonSelect||s.authSelect||!s.serviceSelect||!s.serviceInsert||!s.serviceUpdate||!s.serviceDelete||!s.uniqueKey)fail("FIELD_CAPTURE_F6_EMAIL_SECURITY_NOT_READY","Az F6 e-mail delivery server-only/idempotencia acceptance nem teljes.",{security:s})}
function assertMarker(){const m=marker();if(m.version!=="0.1.0"||Number(m.count)!==1||m.bootstrap!=="field-capture-report-email-f6-v010-20260821")fail("FIELD_CAPTURE_F6_EMAIL_MARKER_NOT_READY","Az F6 e-mail schema marker hibás.",{marker:m});return m}
function stripTransaction(file){const source=readFileSync(file,"utf8");const body=source.replace(/^\s*begin;\s*/i,"").replace(/\s*commit;\s*$/i,"");if(body===source||/(^|\n)\s*(begin|commit);\s*($|\n)/i.test(body))fail("FIELD_CAPTURE_F6_EMAIL_TRANSACTION_SANITIZE_FAILED",`Nem választható le a külső tranzakció: ${basename(file)}`);return body}
function stamp(){return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z")}

if(!["preflight","rollback-test","apply","verify"].includes(mode))fail("FIELD_CAPTURE_F6_EMAIL_MODE_INVALID","Használat: preflight | rollback-test | apply | verify");
for(const c of ["psql","pg_dump","pg_restore"])requireCommand(c);
pgpassReady();
const actualSha=sha(migration),actualRollbackSha=sha(rollback);
if(actualSha!==expectedSha)fail("FIELD_CAPTURE_F6_EMAIL_MIGRATION_SHA_MISMATCH","A migráció SHA-256 eltér.",{expectedSha,actualSha});
if(actualRollbackSha!==expectedRollbackSha)fail("FIELD_CAPTURE_F6_EMAIL_ROLLBACK_SHA_MISMATCH","A rollback SHA-256 eltér.",{expectedRollbackSha,actualRollbackSha});
const before=probe(),id=identity();assertDev(before,id);

if(mode==="preflight"){
  if(before.delivery){const m=assertMarker(),s=security();assertSecurity(s);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,marker:m,security:s},null,2));process.exit(0)}
  const m=marker();if(Object.keys(m).length)fail("FIELD_CAPTURE_F6_EMAIL_PARTIAL_SCHEMA","F6 e-mail marker létezik, de a delivery tábla hiányzik.",{marker:m});
  console.log(JSON.stringify({ok:true,mode,readyForRollbackTest:true,readyForApply:true,migration:migrationRel,rollback:rollbackRel,migrationSha256:expectedSha,rollbackSha256:expectedRollbackSha,database:{projectRef:db.projectRef,database:id.database,user:id.user,port:id.port},schema:before,requiredApproval:approvalPhrase},null,2));process.exit(0)
}
if(mode==="verify"){
  if(!before.delivery)fail("FIELD_CAPTURE_F6_EMAIL_TARGET_NOT_READY","Az F6 e-mail delivery schema még nincs alkalmazva.");
  const m=assertMarker(),s=security();assertSecurity(s);console.log(JSON.stringify({ok:true,mode,schema:before,marker:m,security:s},null,2));process.exit(0)
}
if(mode==="rollback-test"){
  if(before.delivery)fail("FIELD_CAPTURE_F6_EMAIL_ROLLBACK_BASELINE","Rollback-test csak F6 delivery nélküli baseline-on futtatható.");
  const script=`begin;\n${stripTransaction(migration)}\n${stripTransaction(rollback)}\nrollback;\n`;
  const r=run("psql",psqlArgs([]),{input:script});
  if(!r.ok)fail("FIELD_CAPTURE_F6_EMAIL_ROLLBACK_TEST_FAILED","A forward+rollback tranzakciós próba sikertelen.",{status:r.status,stderr:r.stderr.slice(-1600)});
  const after=probe(),m=marker();if(after.delivery||Object.keys(m).length)fail("FIELD_CAPTURE_F6_EMAIL_ROLLBACK_DIRTY","Rollback-test után F6 objektum maradt.",{schema:after,marker:m});
  console.log(JSON.stringify({ok:true,mode,transactional:true,rolledBack:true,schemaAfter:after},null,2));process.exit(0)
}
if(approval!==approvalPhrase)fail("FIELD_CAPTURE_F6_EMAIL_APPROVAL_REQUIRED","Az apply módhoz explicit DEV-only approval szükséges.",{requiredApproval:approvalPhrase});
if(before.delivery){const m=assertMarker(),s=security();assertSecurity(s);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,marker:m,security:s},null,2));process.exit(0)}

const dir=join(backupRoot,stamp());mkdirSync(dir,{recursive:true,mode:0o700});
const dump=join(dir,"supabase-dev-pre-field-capture-report-email-f6.dump");
const backup=run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"--format=custom","--no-owner","--no-privileges",`--file=${dump}`]);
if(!backup.ok)fail("FIELD_CAPTURE_F6_EMAIL_BACKUP_FAILED","A teljes DEV backup sikertelen; migráció nem futott.",{status:backup.status,backupDir:dir,stderr:backup.stderr.slice(-1200)});
chmodSync(dump,0o600);
const listing=run("pg_restore",["--list",dump]);
if(!listing.ok||!listing.stdout.includes("field_capture_sessions")||!listing.stdout.includes("field_capture_events")||!listing.stdout.includes("dimpro_users"))fail("FIELD_CAPTURE_F6_EMAIL_BACKUP_VERIFY_FAILED","A DEV backup listing ellenőrzése sikertelen.",{backupDir:dir});
const dumpSha=sha(dump);
writeFileSync(join(dir,"backup.sha256"),`${dumpSha}  ${basename(dump)}\n`,{mode:0o600});
writeFileSync(join(dir,"migration.sha256"),`${expectedSha}  ${basename(migration)}\n`,{mode:0o600});
writeFileSync(join(dir,"rollback.sha256"),`${expectedRollbackSha}  ${basename(rollback)}\n`,{mode:0o600});
const applied=run("psql",psqlArgs(["-1","-f",migration]));
if(!applied.ok)fail("FIELD_CAPTURE_F6_EMAIL_APPLY_FAILED","Az F6 e-mail migráció sikertelen; backup megmaradt.",{status:applied.status,backupDir:dir,stderr:applied.stderr.slice(-1600)});
const after=probe();if(!after.delivery)fail("FIELD_CAPTURE_F6_EMAIL_POST_SCHEMA_FAILED","Apply után az F6 delivery tábla hiányzik.",{backupDir:dir,schema:after});
const m=assertMarker(),s=security();assertSecurity(s);
const report={ok:true,mode,applied:true,migration:migrationRel,migrationSha256:expectedSha,rollback:rollbackRel,rollbackSha256:expectedRollbackSha,backup:{directory:dir,file:basename(dump),sha256:dumpSha,listingVerified:true},schemaBefore:before,schemaAfter:after,marker:m,security:s,completedAt:new Date().toISOString()};
writeFileSync(join(dir,"migration-report.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(report,null,2));
