#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const mode=(process.argv[2]||'preflight').trim().toLowerCase();
const migrationRel='supabase/migrations/20261006183000_dimpro_personal_drive_boxes_v010.sql';
const migration=join(root,migrationRel);
const expectedSha='7102fc908ea952070dd67f202ecc9fae8d5b9a5714e288c2e97ce5d799fb6e71';
const projectRef='pbgyuznivqvestuksvif';
const db={host:'aws-0-eu-central-1.pooler.supabase.com',port:'5432',database:'postgres',user:'postgres.'+projectRef};
const approval='DEV_ONLY_PERSONAL_DRIVE_BOXES_V010_APPLY_APPROVED';
const backupRoot=process.env.PERSONAL_DRIVE_BOXES_V010_BACKUP_ROOT?.trim()||'/srv/dimpro-dev/backups/personal-drive-boxes-v010';

function fail(code,message,details={}){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(2)}
function sha(file){return createHash('sha256').update(readFileSync(file)).digest('hex')}
function run(command,args,options={}){const r=spawnSync(command,args,{cwd:root,encoding:'utf8',env:{...process.env},maxBuffer:32*1024*1024,...options});return{ok:!r.error&&r.status===0,status:r.status,stdout:(r.stdout||'').trim(),stderr:(r.stderr||'').trim()}}
function requireCommand(c){const r=spawnSync(c,['--version'],{encoding:'utf8'});if(r.error||r.status!==0)fail('TOOL_MISSING',`${c} nem érhető el.`)}
function psqlArgs(extra=[]){return['-w','-h',db.host,'-p',db.port,'-U',db.user,'-d',db.database,'-X','-v','ON_ERROR_STOP=1',...extra]}
function query(sql){const r=run('psql',psqlArgs(['-Atc',sql]));if(!r.ok)fail('DB_QUERY_FAILED','DEV schema probe sikertelen.',{status:r.status,stderr:r.stderr.slice(-1800)});return r.stdout}
function json(sql,code){try{return JSON.parse(query(sql))}catch{fail(code,'DEV schema probe invalid JSON.')}}
function credentialReady(){
  if(String(process.env.PGPASSWORD||'').trim())return 'ENV';
  const candidates=[process.env.PGPASSFILE,'/home/dimproadmin/.pgpass','/root/.pgpass'].filter(Boolean);
  for(const file of candidates){if(!existsSync(file))continue;let st;try{st=statSync(file)}catch{continue}if((st.mode&0o077)!==0)continue;
    const direct=readFileSync(file,'utf8').split(/\r?\n/).find(line=>line.startsWith(`db.${projectRef}.supabase.co:5432:postgres:postgres:`));
    if(!direct)continue;const parts=direct.split(':');const pass=parts.slice(4).join(':');if(!pass)continue;process.env.PGPASSWORD=pass;delete process.env.PGPASSFILE;
    const test=run('psql',psqlArgs(['-Atc','select 1;']));if(test.ok&&test.stdout==='1')return file;
  }
  fail('DB_CREDENTIAL_REQUIRED','Nincs működő canonical DEV PostgreSQL credential. A migráció nem futott.');
}
function probe(){return json(`select json_build_object(
 'baseMeta',to_regclass('public.dimpro_content_schema_meta') is not null,
 'objects',to_regclass('public.dimpro_content_objects') is not null,
 'refs',to_regclass('public.dimpro_content_refs') is not null,
 'users',to_regclass('public.dimpro_users') is not null,
 'folders',to_regclass('public.dimpro_content_personal_folders') is not null,
 'boxes',to_regclass('public.dimpro_personal_drive_boxes') is not null,
 'boxFolders',to_regclass('public.dimpro_personal_drive_box_folders') is not null,
 'boxItems',to_regclass('public.dimpro_personal_drive_box_items') is not null,
 'boxEvents',to_regclass('public.dimpro_personal_drive_box_events') is not null
)::text;`,'SCHEMA_PROBE_INVALID')}
function marker(component){return json(`select coalesce((select json_build_object('version',schema_version,'count',migration_count,'bootstrap',bootstrap_id) from public.dimpro_content_schema_meta where component='${component}'),'{}'::json)::text;`,'MARKER_INVALID')}
function folderMarker(){return json(`select coalesce((select json_build_object('version',schema_version,'count',migration_count,'bootstrap',bootstrap_id) from public.dimpro_content_personal_folder_schema_meta where component='content-personal-folders'),'{}'::json)::text;`,'FOLDER_MARKER_INVALID')}
function counts(){return json(`select json_build_object(
 'objects',(select count(*) from public.dimpro_content_objects),
 'refs',(select count(*) from public.dimpro_content_refs),
 'folders',(select count(*) from public.dimpro_content_personal_folders),
 'users',(select count(*) from public.dimpro_users),
 'meta',(select count(*) from public.dimpro_content_schema_meta)
)::text;`,'COUNTS_INVALID')}
function baseReady(p,base,folders){return p.baseMeta&&p.objects&&p.refs&&p.users&&p.folders&&base.version==='0.1.0'&&Number(base.count)===1&&base.bootstrap==='content-core-user-drive-v010-20260818'&&folders.version==='0.1.0'&&Number(folders.count)===1&&folders.bootstrap==='content-personal-folders-v010-20261006'}
function targetReady(p,m){return p.boxes&&p.boxFolders&&p.boxItems&&p.boxEvents&&m.version==='0.1.0'&&Number(m.count)===1&&m.bootstrap==='personal-drive-boxes-v010-20261006'}
function integrity(){return json(`select json_build_object(
 'boxesOwnerUnique',exists(select 1 from pg_constraint where conname='dimpro_personal_drive_boxes_owner_id_unique'),
 'folderScopeUnique',exists(select 1 from pg_constraint where conname='dimpro_personal_drive_box_folders_owner_box_id_unique'),
 'folderParentScopeFk',exists(select 1 from pg_constraint where conname='dimpro_personal_drive_box_folders_parent_scope_fk'),
 'itemOwnerBoxFk',exists(select 1 from pg_constraint where conname='dimpro_personal_drive_box_items_owner_box_fk'),
 'itemFolderScopeFk',exists(select 1 from pg_constraint where conname='dimpro_personal_drive_box_items_owner_box_folder_fk'),
 'eventOwnerBoxFk',exists(select 1 from pg_constraint where conname='dimpro_personal_drive_box_events_owner_box_fk'),
 'scopeTrigger',exists(select 1 from pg_trigger where tgname='dimpro_personal_drive_box_item_scope_guard_trg' and not tgisinternal),
 'boxesRls',coalesce((select relrowsecurity from pg_class where oid='public.dimpro_personal_drive_boxes'::regclass),false),
 'foldersRls',coalesce((select relrowsecurity from pg_class where oid='public.dimpro_personal_drive_box_folders'::regclass),false),
 'itemsRls',coalesce((select relrowsecurity from pg_class where oid='public.dimpro_personal_drive_box_items'::regclass),false),
 'eventsRls',coalesce((select relrowsecurity from pg_class where oid='public.dimpro_personal_drive_box_events'::regclass),false),
 'anonSelect',has_table_privilege('anon','public.dimpro_personal_drive_boxes','SELECT'),
 'authenticatedSelect',has_table_privilege('authenticated','public.dimpro_personal_drive_boxes','SELECT'),
 'serviceSelect',has_table_privilege('service_role','public.dimpro_personal_drive_boxes','SELECT'),
 'serviceInsert',has_table_privilege('service_role','public.dimpro_personal_drive_boxes','INSERT'),
 'createRpc',to_regprocedure('public.dimpro_personal_drive_create_box_atomic(uuid,text,text,text,text,text,uuid)') is not null,
 'addRpc',to_regprocedure('public.dimpro_personal_drive_add_box_item_atomic(uuid,text,uuid,uuid)') is not null,
 'removeRpc',to_regprocedure('public.dimpro_personal_drive_remove_box_item_atomic(uuid,text,text,uuid)') is not null,
 'folderRpc',to_regprocedure('public.dimpro_personal_drive_create_box_folder_atomic(uuid,text,text,text,uuid)') is not null,
 'moveRpc',to_regprocedure('public.dimpro_personal_drive_move_box_item_atomic(uuid,text,text,text,uuid)') is not null,
 'lifecycleRpc',to_regprocedure('public.dimpro_personal_drive_set_box_lifecycle_atomic(uuid,text,text,uuid)') is not null,
 'boxes',(select count(*) from public.dimpro_personal_drive_boxes),
 'folders',(select count(*) from public.dimpro_personal_drive_box_folders),
 'items',(select count(*) from public.dimpro_personal_drive_box_items),
 'events',(select count(*) from public.dimpro_personal_drive_box_events)
)::text;`,'TARGET_INTEGRITY_INVALID')}
function assertIntegrity(v){for(const key of ['boxesOwnerUnique','folderScopeUnique','folderParentScopeFk','itemOwnerBoxFk','itemFolderScopeFk','eventOwnerBoxFk','scopeTrigger','boxesRls','foldersRls','itemsRls','eventsRls','serviceSelect','serviceInsert','createRpc','addRpc','removeRpc','folderRpc','moveRpc','lifecycleRpc'])if(v[key]!==true)fail('TARGET_INTEGRITY_FAILED','Personal CsomagBOX schema integrity check failed',{key,integrity:v});if(v.anonSelect!==false||v.authenticatedSelect!==false)fail('TARGET_ACCESS_TOO_BROAD','Client roles unexpectedly have direct personal BOX table access',{integrity:v})}
function stamp(){return new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')}

if(!['preflight','apply','verify'].includes(mode))fail('MODE_INVALID','Használat: preflight | apply | verify');
if(!existsSync(migration))fail('MIGRATION_MISSING','A personal CsomagBOX migráció hiányzik.');
for(const c of ['psql','pg_dump','pg_restore'])requireCommand(c);credentialReady();
const actualSha=sha(migration);if(actualSha!==expectedSha)fail('MIGRATION_SHA_MISMATCH','A personal CsomagBOX migráció SHA-256 eltér.',{expectedSha,actualSha});
const id=json("select json_build_object('database',current_database(),'user',current_user,'port',inet_server_port())::text;",'DB_IDENTITY_INVALID');
if(id.database!==db.database||id.user!=='postgres'||Number(id.port)!==5432)fail('DEV_TARGET_MISMATCH','Nem a canonical DEV Supabase PostgreSQL cél aktív.',{identity:id,projectRef,host:db.host});
if(process.env.PROD_SUPABASE_PROJECT_REF===projectRef)fail('PROD_TARGET_BLOCKED','A DEV és PROD Supabase project ref nem lehet azonos.');
const p=probe(),base=marker('content-core'),folders=folderMarker(),boxMarker=marker('personal-drive-boxes');if(!baseReady(p,base,folders))fail('BASELINE_REQUIRED','A Content Core / Personal Folder baseline nem megfelelő.',{schema:p,baseMarker:base,folderMarker:folders});
const beforeCounts=counts();
if(mode==='preflight'){const any=p.boxes||p.boxFolders||p.boxItems||p.boxEvents;if(any&&!targetReady(p,boxMarker))fail('PARTIAL_SCHEMA','Részleges personal CsomagBOX schema található; automatikus apply tiltva.',{schema:p,marker:boxMarker});const already=targetReady(p,boxMarker);const integ=already?integrity():null;if(integ)assertIntegrity(integ);console.log(JSON.stringify({ok:true,mode,projectRef,productionAccess:'DENY',host:db.host,migration:migrationRel,migrationSha256:actualSha,alreadyApplied:already,baseMarker:base,folderMarker:folders,boxMarker,rowCounts:beforeCounts,integrity:integ,requiredApproval:approval,destructiveActionsPerformed:false},null,2));process.exit(0)}
if(mode==='verify'){if(!targetReady(p,boxMarker))fail('TARGET_NOT_READY','A personal CsomagBOX core még nincs alkalmazva.',{schema:p,marker:boxMarker});const integ=integrity();assertIntegrity(integ);console.log(JSON.stringify({ok:true,mode,projectRef,productionAccess:'DENY',boxMarker,rowCounts:beforeCounts,integrity:integ,destructiveActionsPerformed:false},null,2));process.exit(0)}
if(String(process.env.PERSONAL_DRIVE_BOXES_V010_MIGRATION_APPROVED||'')!==approval)fail('APPROVAL_REQUIRED','Explicit DEV approval szükséges.',{requiredApproval:approval});
if(process.env.OPERATION!=='migration')fail('COORDINATED_LOCK_REQUIRED','Az apply csak OPERATION=migration mellett futtatható.');
if(targetReady(p,boxMarker)){const integ=integrity();assertIntegrity(integ);console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,integrity:integ,productionAccess:'DENY'},null,2));process.exit(0)}
if(p.boxes||p.boxFolders||p.boxItems||p.boxEvents)fail('PARTIAL_SCHEMA','Részleges personal CsomagBOX schema található; apply tiltva.',{schema:p});
const dir=join(backupRoot,stamp());mkdirSync(dir,{recursive:true,mode:0o700});const dump=join(dir,'content-core-before-personal-boxes-v010.dump');
const d=run('pg_dump',['-w','-h',db.host,'-p',db.port,'-U',db.user,'-d',db.database,'-Fc','-f',dump,'-t','public.dimpro_content_schema_meta','-t','public.dimpro_content_objects','-t','public.dimpro_content_refs','-t','public.dimpro_content_personal_folders','-t','public.dimpro_users']);
if(!d.ok)fail('BACKUP_FAILED','A Personal Drive DEV backup sikertelen; migráció nem futott.',{backupDir:dir,stderr:d.stderr.slice(-2000)});chmodSync(dump,0o600);
const listing=run('pg_restore',['-l',dump]);for(const name of ['dimpro_content_schema_meta','dimpro_content_objects','dimpro_content_refs','dimpro_content_personal_folders','dimpro_users'])if(!listing.ok||!listing.stdout.includes(name))fail('BACKUP_VERIFY_FAILED','A backup listing ellenőrzése sikertelen.',{backupDir:dir,missing:name});
const dumpSha=sha(dump);writeFileSync(join(dir,'backup.sha256'),`${dumpSha}  ${basename(dump)}\n`,{mode:0o600});writeFileSync(join(dir,'manifest.json'),JSON.stringify({environment:'DEV',productionAccess:'DENY',projectRef,migration:migrationRel,migrationSha256:actualSha,rowCounts:beforeCounts,backupFile:dump},null,2)+'\n',{mode:0o600});
const applied=run('psql',psqlArgs(['-f',migration]));if(!applied.ok)fail('APPLY_FAILED','A personal CsomagBOX migráció sikertelen; backup megmaradt.',{backupDir:dir,stderr:applied.stderr.slice(-2600)});
const afterP=probe(),afterMarker=marker('personal-drive-boxes'),afterCounts=counts();if(!targetReady(afterP,afterMarker))fail('POST_VERIFY_FAILED','A migráció utáni marker/schema ellenőrzés sikertelen.',{backupDir:dir,schema:afterP,marker:afterMarker});
for(const key of ['objects','refs','folders','users'])if(Number(afterCounts[key])!==Number(beforeCounts[key]))fail('BASE_ROW_COUNT_CHANGED','A meglévő Personal Drive sorok száma megváltozott.',{key,before:beforeCounts,after:afterCounts,backupDir:dir});
if(Number(afterCounts.meta)!==Number(beforeCounts.meta)+1)fail('META_ROW_COUNT_UNEXPECTED','A schema meta sorszám nem pontosan eggyel nőtt.',{before:beforeCounts,after:afterCounts,backupDir:dir});
const integ=integrity();assertIntegrity(integ);for(const key of ['boxes','folders','items','events'])if(Number(integ[key])!==0)fail('NEW_TABLE_NOT_EMPTY','Az új personal CsomagBOX tábla nem üres induláskor.',{key,integrity:integ,backupDir:dir});
const report={ok:true,mode,projectRef,productionAccess:'DENY',host:db.host,migration:migrationRel,migrationSha256:actualSha,backup:{directory:dir,file:basename(dump),sha256:dumpSha,listingVerified:true},boxMarker:afterMarker,beforeCounts,afterCounts,integrity:integ,completedAt:new Date().toISOString()};writeFileSync(join(dir,'migration-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report,null,2));
