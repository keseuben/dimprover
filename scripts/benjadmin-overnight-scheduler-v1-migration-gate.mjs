import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root=process.cwd();
const mode=(process.argv[2]||"preflight").trim().toLowerCase();
const allowed=new Set(["preflight","apply","verify"]);
const migrationRel="supabase/migrations/20260817125500_benjadmin_development_scheduler_v010.sql";
const migration=join(root,migrationRel);
const sidecar=`${migration}.sha256`;
const dbUrl=(process.env.SUPABASE_DB_URL||"").trim();
const dbPassword=(process.env.SUPABASE_DB_PASSWORD||"").trim();
const approval=(process.env.BENJADMIN_SCHEDULER_V1_MIGRATION_APPROVED||"").trim();
const approvalPhrase="DEV_ONLY_SCHEDULER_V1_APPLY_APPROVED";
const backupRoot=process.env.BENJADMIN_SCHEDULER_V1_BACKUP_ROOT?.trim()||"/srv/dimpro-dev/backups/benjadmin-scheduler-v1-db";

function fail(code,message,details={},exitCode=2){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(exitCode)}
function safeRun(command,args,options={}){const r=spawnSync(command,args,{cwd:root,env:{...process.env,PGPASSWORD:dbPassword},encoding:"utf8",...options});return{ok:!r.error&&r.status===0,status:r.status,stdout:(r.stdout||"").trim(),stderr:(r.stderr||"").trim()}}
function sha(file){return createHash("sha256").update(readFileSync(file)).digest("hex")}
function requireCommand(command){const r=spawnSync(command,["--version"],{encoding:"utf8"});if(r.error||r.status!==0)fail("SCHEDULER_MIGRATION_TOOL_MISSING",`${command} nem érhető el.`)}
function verifyHash(){const expected=readFileSync(sidecar,"utf8").trim().split(/\s+/)[0];const actual=sha(migration);if(!/^[0-9a-f]{64}$/.test(expected)||expected!==actual)fail("SCHEDULER_MIGRATION_SHA256_MISMATCH","A scheduler migráció SHA-256 ellenőrzése sikertelen.");return actual}
function sourcePreflight(){const r=safeRun(process.execPath,["scripts/benjadmin-b32-source-db-preflight.mjs"]);let p=null;try{p=JSON.parse(r.stdout||r.stderr)}catch{}if(!r.ok||p?.readyForApply!==true||p?.targetMatches!==true||p?.sharedWithProduction!==false)fail(p?.code||"SCHEDULER_SOURCE_DB_PREFLIGHT_FAILED",p?.message||"A DEV source-of-truth DB preflight nem zöld.",{preflight:p?{readyForApply:p.readyForApply,targetMatches:p.targetMatches,sharedWithProduction:p.sharedWithProduction}:null});return p}
function schemaProbe(){const sql=`select json_build_object(
'schedules',to_regclass('public.dev_center_development_schedules') is not null,
'runs',to_regclass('public.dev_center_scheduler_runs') is not null,
'marker',case when to_regclass('public.dev_center_control_schema_meta') is null then false else exists(select 1 from public.dev_center_control_schema_meta where component='benjadmin-development-scheduler' and schema_version='0.1.0') end,
'run_slot_unique',case when to_regclass('public.dev_center_scheduler_runs') is null then false else exists(select 1 from pg_constraint where conrelid='public.dev_center_scheduler_runs'::regclass and contype='u' and pg_get_constraintdef(oid) ilike '%schedule_id%slot_at%') end,
'schedules_rls',case when to_regclass('public.dev_center_development_schedules') is null then false else (select relrowsecurity from pg_class where oid='public.dev_center_development_schedules'::regclass) end,
'runs_rls',case when to_regclass('public.dev_center_scheduler_runs') is null then false else (select relrowsecurity from pg_class where oid='public.dev_center_scheduler_runs'::regclass) end
)::text;`;const r=safeRun("psql",[dbUrl,"-X","-v","ON_ERROR_STOP=1","-Atc",sql]);if(!r.ok)fail("SCHEDULER_SCHEMA_PROBE_FAILED","A scheduler schema probe sikertelen.");try{return JSON.parse(r.stdout)}catch{fail("SCHEDULER_SCHEMA_PROBE_INVALID","A scheduler schema probe eredménye nem értelmezhető.")}}
function ready(p){return Boolean(p?.schedules&&p?.runs&&p?.marker&&p?.run_slot_unique&&p?.schedules_rls&&p?.runs_rls)}
function stamp(){return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z")}

if(!allowed.has(mode))fail("SCHEDULER_MIGRATION_MODE_INVALID","Használat: preflight | apply | verify");
if(!dbUrl||!dbPassword)fail("SOURCE_DB_CREDENTIAL_MISSING","A DB kapcsolat hiányzik a scheduler migration gate számára.");
requireCommand("psql");requireCommand("pg_dump");requireCommand("pg_restore");
const migrationSha256=verifyHash();
const preflight=sourcePreflight();
const before=schemaProbe();

if(mode==="preflight"){console.log(JSON.stringify({ok:true,mode,readyForApply:!ready(before),alreadyApplied:ready(before),migration:migrationRel,migrationSha256,database:{targetMatches:true,sharedWithProduction:false},schema:before,requiredApproval:approvalPhrase},null,2));process.exit(0)}
if(mode==="verify"){if(!ready(before))fail("SCHEDULER_SCHEMA_NOT_READY","A scheduler schema még nincs teljesen alkalmazva.",{schema:before});console.log(JSON.stringify({ok:true,mode,migration:migrationRel,migrationSha256,schema:before},null,2));process.exit(0)}
if(approval!==approvalPhrase)fail("SCHEDULER_MIGRATION_APPROVAL_REQUIRED","Az apply módhoz explicit DEV-only approval szükséges.",{requiredApproval:approvalPhrase});
if(ready(before)){console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,migration:migrationRel,migrationSha256,schema:before},null,2));process.exit(0)}

const backupDir=join(backupRoot,stamp());mkdirSync(backupDir,{recursive:true,mode:0o700});
const backupFile=join(backupDir,"dev-center-before-scheduler-v1.dump");
const backup=safeRun("pg_dump",[dbUrl,"--format=custom","--no-owner","--no-privileges","--table=public.dev_center_*",`--file=${backupFile}`]);
if(!backup.ok)fail("SCHEDULER_BACKUP_FAILED","A scheduler előtti dev_center_* backup sikertelen.",{backupDir});
const listing=safeRun("pg_restore",["--list",backupFile]);
if(!listing.ok||!listing.stdout.includes("dev_center_"))fail("SCHEDULER_BACKUP_VERIFY_FAILED","A scheduler előtti backup listing ellenőrzése sikertelen.",{backupDir});
const backupSha256=sha(backupFile);writeFileSync(join(backupDir,"backup.sha256"),`${backupSha256}  ${basename(backupFile)}\n`,{mode:0o600});

const apply=safeRun("psql",[dbUrl,"-X","-v","ON_ERROR_STOP=1","-f",migration]);
if(!apply.ok)fail("SCHEDULER_MIGRATION_APPLY_FAILED","A scheduler migráció alkalmazása sikertelen; a backup megmaradt.",{backupDir,stderr:apply.stderr.slice(0,500)});
const after=schemaProbe();
if(!ready(after))fail("SCHEDULER_POST_MIGRATION_VERIFY_FAILED","A scheduler migráció lefutott, de a schema acceptance nem teljes.",{backupDir,schema:after});
const report={ok:true,mode,applied:true,migration:migrationRel,migrationSha256,backup:{directory:backupDir,file:basename(backupFile),sha256:backupSha256,listingVerified:true},preflight:{targetMatches:preflight.targetMatches,sharedWithProduction:preflight.sharedWithProduction},schema:after,completedAt:new Date().toISOString()};
writeFileSync(join(backupDir,"migration-report.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(report,null,2));
