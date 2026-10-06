#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root=process.cwd();
const mode=(process.argv[2]||"preflight").trim().toLowerCase();
const migrationRel="supabase/migrations/20261006123000_dimpro_content_personal_folders_v010.sql";
const migration=join(root,migrationRel);
const expectedSha="44857a6d9bd6307b665d6d4cfc1533d9855c4574606b1891ce7273aae98c971c";
const expectedRef="pbgyuznivqvestuksvif";
const poolerTarget={host:"aws-0-eu-central-1.pooler.supabase.com",port:"5432",database:"postgres",user:"postgres."+expectedRef,mode:"POOLER"};
const directTarget={host:`db.${expectedRef}.supabase.co`,port:"5432",database:"postgres",user:"postgres",mode:"DIRECT"};
const requestedHost=String(process.env.CONTENT_PERSONAL_FOLDERS_V010_DB_HOST||"").trim();
const requestedUser=String(process.env.CONTENT_PERSONAL_FOLDERS_V010_DB_USER||"").trim();
const requestedPort=String(process.env.CONTENT_PERSONAL_FOLDERS_V010_DB_PORT||"5432").trim();
const requestedDatabase=String(process.env.CONTENT_PERSONAL_FOLDERS_V010_DB_NAME||"postgres").trim();
const targetCandidates=[poolerTarget,directTarget];
const db=targetCandidates.find((target)=>
  (!requestedHost||target.host===requestedHost)
  && (!requestedUser||target.user===requestedUser)
  && target.port===requestedPort
  && target.database===requestedDatabase
) || poolerTarget;
const approvalPhrase="DEV_ONLY_CONTENT_PERSONAL_FOLDERS_V010_APPLY_APPROVED";
const backupRoot=process.env.CONTENT_PERSONAL_FOLDERS_V010_BACKUP_ROOT?.trim()||"/srv/dimpro-dev/backups/content-personal-folders-v010";

function fail(code,message,details={}){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(2)}
function assertTargetAllowlist(){
  const matched=targetCandidates.some((target)=>target.host===db.host&&target.port===db.port&&target.database===db.database&&target.user===db.user);
  if(!matched)fail("DEV_TARGET_NOT_ALLOWLISTED","A PostgreSQL cél nincs a canonical DEV allowlistben.",{host:db.host,port:db.port,database:db.database,user:db.user});
  if(requestedHost&&db.host!==requestedHost)fail("DEV_TARGET_REQUEST_INVALID","A kért DB host/user kombináció nem canonical DEV cél.",{requestedHost,requestedUser});
}
function sha(file){return createHash("sha256").update(readFileSync(file)).digest("hex")}
function run(command,args,options={}){const r=spawnSync(command,args,{cwd:root,encoding:"utf8",env:{...process.env},maxBuffer:32*1024*1024,...options});return{ok:!r.error&&r.status===0,status:r.status,stdout:(r.stdout||"").trim(),stderr:(r.stderr||"").trim()}}
function requireCommand(c){const r=spawnSync(c,["--version"],{encoding:"utf8"});if(r.error||r.status!==0)fail("TOOL_MISSING",`${c} nem érhető el.`)}
function psqlArgs(extra=[]){return["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-X","-v","ON_ERROR_STOP=1",...extra]}
function query(sql){const r=run("psql",psqlArgs(["-Atc",sql]));if(!r.ok)fail("DB_QUERY_FAILED","DEV schema probe sikertelen.",{status:r.status,stderr:r.stderr.slice(-1600)});return r.stdout}
function json(sql,code){try{return JSON.parse(query(sql))}catch{fail(code,"DEV schema probe invalid JSON.")}}
function credentialReady(){
  const explicit=String(process.env.CONTENT_PERSONAL_FOLDERS_V010_DB_PASSWORD||process.env.SUPABASE_DB_PASSWORD||process.env.PGPASSWORD||"").trim();
  if(explicit){process.env.PGPASSWORD=explicit;delete process.env.PGPASSFILE;return "ENV";}
  const candidates=[process.env.PGPASSFILE,"/root/.pgpass","/home/dimproadmin/.pgpass"].filter(Boolean);
  for(const file of candidates){
    if(!existsSync(file))continue;
    let st;try{st=statSync(file)}catch{continue}
    if((st.mode&0o077)!==0)continue;
    const hasTarget=readFileSync(file,"utf8").split(/\r?\n/).filter(Boolean).some(line=>{const p=line.split(":");return p.length>=5&&p[0]===db.host&&p[1]===db.port&&p[2]===db.database&&p[3]===db.user&&Boolean(p.slice(4).join(":"))});
    if(!hasTarget)continue;
    process.env.PGPASSFILE=file;
    const test=run("psql",psqlArgs(["-Atc","select 1;"]));
    if(test.ok&&test.stdout==="1")return file;
  }
  fail("DB_CREDENTIAL_REQUIRED","Nincs működő canonical DEV PostgreSQL credential. A migráció nem futott.");
}
function identity(){return json("select json_build_object('database',current_database(),'user',current_user,'port',inet_server_port())::text;","DB_IDENTITY_INVALID")}
function baseMarker(){return json("select coalesce((select json_build_object('version',schema_version,'count',migration_count,'bootstrap',bootstrap_id) from public.dimpro_content_schema_meta where component='content-core'),'{}'::json)::text;","BASE_MARKER_INVALID")}
function addonMarker(){
  if(query("select to_regclass('public.dimpro_content_personal_folder_schema_meta') is not null;")!=="t")return{version:"",count:0,bootstrap:""};
  return json("select coalesce((select json_build_object('version',schema_version,'count',migration_count,'bootstrap',bootstrap_id) from public.dimpro_content_personal_folder_schema_meta where component='content-personal-folders'),'{}'::json)::text;","ADDON_MARKER_INVALID");
}
function probe(){return json(`select json_build_object(
 'baseMeta',to_regclass('public.dimpro_content_schema_meta') is not null,
 'objects',to_regclass('public.dimpro_content_objects') is not null,
 'refs',to_regclass('public.dimpro_content_refs') is not null,
 'users',to_regclass('public.dimpro_users') is not null,
 'folderMeta',to_regclass('public.dimpro_content_personal_folder_schema_meta') is not null,
 'folders',to_regclass('public.dimpro_content_personal_folders') is not null
)::text;`,"SCHEMA_PROBE_INVALID")}
function counts(){return json(`select json_build_object(
 'baseMeta',(select count(*) from public.dimpro_content_schema_meta),
 'objects',(select count(*) from public.dimpro_content_objects),
 'refs',(select count(*) from public.dimpro_content_refs)
)::text;`,"COUNTS_INVALID")}
function baseReady(p,m){return p.baseMeta&&p.objects&&p.refs&&p.users&&m.version==="0.1.0"&&Number(m.count)===1&&m.bootstrap==="content-core-user-drive-v010-20260818"}
function targetReady(p,m){return p.folderMeta&&p.folders&&m.version==="0.1.0"&&Number(m.count)===1&&m.bootstrap==="content-personal-folders-v010-20261006"}
function integrity(){return json(`select json_build_object(
 'ownerCompositeUnique',exists(select 1 from pg_constraint where conname='dimpro_content_personal_folders_owner_id_unique'),
 'sameOwnerParentFk',exists(select 1 from pg_constraint where conname='dimpro_content_personal_folders_parent_owner_fk'),
 'nameCheck',exists(select 1 from pg_constraint where conname='dimpro_content_personal_folders_name_check'),
 'trashCheck',exists(select 1 from pg_constraint where conname='dimpro_content_personal_folders_trash_state_check'),
 'rootNameUnique',to_regclass('public.dimpro_content_personal_folders_root_name_unique') is not null,
 'childNameUnique',to_regclass('public.dimpro_content_personal_folders_child_name_unique') is not null,
 'folderRls',coalesce((select relrowsecurity from pg_class where oid='public.dimpro_content_personal_folders'::regclass),false),
 'metaRls',coalesce((select relrowsecurity from pg_class where oid='public.dimpro_content_personal_folder_schema_meta'::regclass),false),
 'anonSelect',has_table_privilege('anon','public.dimpro_content_personal_folders','SELECT'),
 'authenticatedSelect',has_table_privilege('authenticated','public.dimpro_content_personal_folders','SELECT'),
 'serviceSelect',has_table_privilege('service_role','public.dimpro_content_personal_folders','SELECT'),
 'serviceInsert',has_table_privilege('service_role','public.dimpro_content_personal_folders','INSERT'),
 'serviceUpdate',has_table_privilege('service_role','public.dimpro_content_personal_folders','UPDATE'),
 'serviceDelete',has_table_privilege('service_role','public.dimpro_content_personal_folders','DELETE'),
 'folderRows',(select count(*) from public.dimpro_content_personal_folders)
)::text;`,"TARGET_INTEGRITY_INVALID")}
function assertIntegrity(v){for(const key of ['ownerCompositeUnique','sameOwnerParentFk','nameCheck','trashCheck','rootNameUnique','childNameUnique','folderRls','metaRls','serviceSelect','serviceInsert','serviceUpdate','serviceDelete'])if(v[key]!==true)fail("TARGET_INTEGRITY_FAILED","Personal folder schema integrity check failed",{key,integrity:v});if(v.anonSelect!==false||v.authenticatedSelect!==false)fail("TARGET_ACCESS_TOO_BROAD","Client roles unexpectedly have direct folder table access",{integrity:v})}
function stamp(){return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z")}

if(!["preflight","apply","verify"].includes(mode))fail("MODE_INVALID","Használat: preflight | apply | verify");
if(!existsSync(migration))fail("MIGRATION_MISSING","A personal folder migráció hiányzik.");
for(const c of ["psql","pg_dump","pg_restore"])requireCommand(c);
assertTargetAllowlist();
credentialReady();
const actualSha=sha(migration);if(actualSha!==expectedSha)fail("MIGRATION_SHA_MISMATCH","A personal folder migráció SHA-256 eltér.",{expectedSha,actualSha});
const id=identity();if(id.database!==db.database||id.user!=="postgres"||Number(id.port)!==5432)fail("DEV_TARGET_MISMATCH","Nem a canonical DEV Supabase PostgreSQL cél aktív.",{identity:id,projectRef:expectedRef,targetMode:db.mode,host:db.host});
if(process.env.PROD_SUPABASE_PROJECT_REF===expectedRef)fail("PROD_TARGET_BLOCKED","A DEV és PROD Supabase project ref nem lehet azonos.");
const beforeProbe=probe(),beforeBase=baseMarker(),beforeAddon=addonMarker();
if(!baseReady(beforeProbe,beforeBase))fail("CONTENT_CORE_BASELINE_REQUIRED","A Content Core 0.1.0 baseline nem megfelelő.",{schema:beforeProbe,marker:beforeBase});
const beforeCounts=counts();

if(mode==="preflight"){
  if((beforeProbe.folderMeta||beforeProbe.folders)&&!targetReady(beforeProbe,beforeAddon))fail("PARTIAL_SCHEMA","Részleges personal folder schema található; automatikus apply tiltva.",{schema:beforeProbe,marker:beforeAddon});
  const already=targetReady(beforeProbe,beforeAddon);
  const integ=already?integrity():null;if(integ)assertIntegrity(integ);
  console.log(JSON.stringify({ok:true,mode,projectRef:expectedRef,productionAccess:"DENY",targetMode:db.mode,host:db.host,migration:migrationRel,migrationSha256:actualSha,alreadyApplied:already,baseMarker:beforeBase,addonMarker:beforeAddon,rowCounts:beforeCounts,integrity:integ,requiredApproval:approvalPhrase,destructiveActionsPerformed:false},null,2));process.exit(0)
}
if(mode==="verify"){
  if(!targetReady(beforeProbe,beforeAddon))fail("TARGET_NOT_READY","A personal folder core még nincs alkalmazva.",{schema:beforeProbe,marker:beforeAddon});
  const integ=integrity();assertIntegrity(integ);console.log(JSON.stringify({ok:true,mode,projectRef:expectedRef,productionAccess:"DENY",baseMarker:beforeBase,addonMarker:beforeAddon,rowCounts:beforeCounts,integrity:integ,destructiveActionsPerformed:false},null,2));process.exit(0)
}
if(String(process.env.CONTENT_PERSONAL_FOLDERS_V010_MIGRATION_APPROVED||"")!==approvalPhrase)fail("APPROVAL_REQUIRED","Explicit DEV approval szükséges.",{requiredApproval:approvalPhrase});
if(process.env.OPERATION!=="migration")fail("COORDINATED_LOCK_REQUIRED","Az apply csak OPERATION=migration mellett futtatható.");
if(targetReady(beforeProbe,beforeAddon)){const integ=integrity();assertIntegrity(integ);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,integrity:integ,productionAccess:"DENY"},null,2));process.exit(0)}
if(beforeProbe.folderMeta||beforeProbe.folders)fail("PARTIAL_SCHEMA","Részleges personal folder schema található; apply tiltva.",{schema:beforeProbe});

const dir=join(backupRoot,stamp());mkdirSync(dir,{recursive:true,mode:0o700});
const dump=join(dir,"content-core-before-personal-folders-v010.dump");
const d=run("pg_dump",["-w","-h",db.host,"-p",db.port,"-U",db.user,"-d",db.database,"-Fc","-f",dump,"-t","public.dimpro_content_schema_meta","-t","public.dimpro_content_objects","-t","public.dimpro_content_refs"]);
if(!d.ok)fail("BACKUP_FAILED","A Content Core DEV backup sikertelen; migráció nem futott.",{backupDir:dir,stderr:d.stderr.slice(-1800)});
chmodSync(dump,0o600);
const listing=run("pg_restore",["-l",dump]);for(const name of ["dimpro_content_schema_meta","dimpro_content_objects","dimpro_content_refs"])if(!listing.ok||!listing.stdout.includes(name))fail("BACKUP_VERIFY_FAILED","A backup listing ellenőrzése sikertelen.",{backupDir:dir,missing:name});
const dumpSha=sha(dump);writeFileSync(join(dir,"backup.sha256"),`${dumpSha}  ${basename(dump)}\n`,{mode:0o600});
writeFileSync(join(dir,"manifest.json"),JSON.stringify({environment:"DEV",productionAccess:"DENY",projectRef:expectedRef,migration:migrationRel,migrationSha256:actualSha,baseMarker:beforeBase,rowCounts:beforeCounts,backupFile:dump},null,2)+"\n",{mode:0o600});
const applied=run("psql",psqlArgs(["-f",migration]));if(!applied.ok)fail("APPLY_FAILED","A personal folder migráció sikertelen; backup megmaradt.",{backupDir:dir,stderr:applied.stderr.slice(-2400)});
const afterProbe=probe(),afterBase=baseMarker(),afterAddon=addonMarker(),afterCounts=counts();
if(!baseReady(afterProbe,afterBase)||!targetReady(afterProbe,afterAddon))fail("POST_VERIFY_FAILED","A migráció utáni marker/schema ellenőrzés sikertelen.",{backupDir:dir,schema:afterProbe,baseMarker:afterBase,addonMarker:afterAddon});
for(const key of ['baseMeta','objects','refs'])if(Number(afterCounts[key])!==Number(beforeCounts[key]))fail("BASE_ROW_COUNT_CHANGED","A Content Core meglévő sorainak száma megváltozott.",{key,before:beforeCounts,after:afterCounts,backupDir:dir});
const integ=integrity();assertIntegrity(integ);if(Number(integ.folderRows)!==0)fail("NEW_TABLE_NOT_EMPTY","A personal folder tábla nem üres induláskor.",{integrity:integ,backupDir:dir});
const report={ok:true,mode,projectRef:expectedRef,productionAccess:"DENY",targetMode:db.mode,host:db.host,migration:migrationRel,migrationSha256:actualSha,backup:{directory:dir,file:basename(dump),sha256:dumpSha,listingVerified:true},baseMarker:afterBase,addonMarker:afterAddon,beforeCounts,afterCounts,integrity:integ,completedAt:new Date().toISOString()};writeFileSync(join(dir,"migration-report.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});console.log(JSON.stringify(report,null,2));
