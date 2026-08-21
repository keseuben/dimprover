#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const mode=(process.argv[2]||'preflight').trim().toLowerCase();
const migrationRel='supabase/migrations/20260821213000_dimpro_commerce_storefront_order_persistence_p5.sql';
const rollbackRel='supabase/rollback/DIMPRO_COMMERCE_STOREFRONT_ORDER_PERSISTENCE_P5_ROLLBACK.sql';
const probeRel='scripts/commerce-storefront-order-persistence-p5-probe.sql';
const migration=join(root,migrationRel),rollback=join(root,rollbackRel),probeFile=join(root,probeRel);
const expectedSha='9f89e934df342cd3fa3a32966b2a497f5c3d98ecef754a48639118038cb8894b';
const expectedRollbackSha='0b92dc89b8a65a1e978fb923238e7bff04ae9aa2f397f0619f94ecc59d3b8bba';
const approvalPhrase='DEV_ONLY_COMMERCE_STOREFRONT_ORDER_P5_APPLY_APPROVED';
const approval=(process.env.COMMERCE_STOREFRONT_ORDER_P5_MIGRATION_APPROVED||'').trim();
const backupRoot='/srv/dimpro-dev/backups/commerce-storefront-order-persistence-p5';
const db={host:'aws-0-eu-central-1.pooler.supabase.com',port:'5432',database:'postgres',user:'postgres.pbgyuznivqvestuksvif'};

function fail(code,message,details={}){console.error(JSON.stringify({ok:false,mode,code,message,...details},null,2));process.exit(2);}
function run(cmd,args,opt={}){const r=spawnSync(cmd,args,{cwd:root,encoding:'utf8',env:{...process.env},maxBuffer:16*1024*1024,...opt});return{ok:!r.error&&r.status===0,status:r.status,stdout:(r.stdout||'').trim(),stderr:(r.stderr||'').trim()};}
function sha(file){return createHash('sha256').update(readFileSync(file)).digest('hex');}
function psqlArgs(extra=[]){return['-w','-h',db.host,'-p',db.port,'-U',db.user,'-d',db.database,'-X','-v','ON_ERROR_STOP=1',...extra];}
function probe(){const r=run('psql',psqlArgs(['-Atf',probeFile]));if(!r.ok)fail('P5_DB_QUERY_FAILED','A P5 DEV schema probe sikertelen.',{stderr:r.stderr.slice(-1400)});try{return JSON.parse(r.stdout);}catch{fail('P5_PROBE_INVALID','A P5 DEV schema probe invalid JSON-t adott.',{stdout:r.stdout.slice(-1000)});}}
function baseline(p){return p.version==='0.1.15'&&Number(p.count)===16&&!p.ordersTable&&!p.createRpc&&!p.statusRpc;}
function ready(p){if(p.version!=='0.1.16'||Number(p.count)!==17||p.bootstrap!=='commerce-storefront-order-persistence-p5-20260821'||!p.ordersTable||!p.numberSequence||!p.createRpc||!p.statusRpc||!p.rls||p.anonSelect||p.authSelect||!p.serviceSelect||p.anonCreateExec||p.authCreateExec||!p.serviceCreateExec||p.anonStatusExec||p.authStatusExec||!p.serviceStatusExec||!p.createHasAdvisoryLock||!p.statusHasTransitionGuard)fail('P5_SCHEMA_NOT_READY','A P5 Storefront order schema/security nem teljes.',{probe:p});return p;}
function stamp(){return new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');}

if(!['preflight','rollback-test','apply','verify'].includes(mode))fail('P5_MODE_INVALID','Használat: preflight | rollback-test | apply | verify');
const pgpass=statSync('/root/.pgpass');if((pgpass.mode&0o777)!==0o600)fail('P5_PGPASS_MODE','A /root/.pgpass jogosultsága nem 0600.');
const actualSha=sha(migration),actualRollbackSha=sha(rollback);
if(actualSha!==expectedSha)fail('P5_SHA_MISMATCH','A P5 migration SHA eltér.',{expectedSha,actualSha});
if(actualRollbackSha!==expectedRollbackSha)fail('P5_ROLLBACK_SHA_MISMATCH','A P5 rollback SHA eltér.',{expectedRollbackSha,actualRollbackSha});
const before=probe();
if(mode==='verify'){console.log(JSON.stringify({ok:true,mode,probe:ready(before)},null,2));process.exit(0);}
if(before.version==='0.1.16'){console.log(JSON.stringify({ok:true,mode,alreadyApplied:true,probe:ready(before)},null,2));process.exit(0);}
if(!baseline(before))fail('P5_BASELINE_MISMATCH','A P5 migration csak Commerce 0.1.15 / 16 tiszta baseline-ról alkalmazható.',{probe:before});
if(mode==='preflight'){console.log(JSON.stringify({ok:true,mode,readyForApply:true,migration:migrationRel,migrationSha256:actualSha,rollback:rollbackRel,rollbackSha256:actualRollbackSha,requiredApproval:approvalPhrase},null,2));process.exit(0);}
if(mode==='rollback-test'){
  const test=run('psql',psqlArgs(['-1','-f',migration,'-f',rollback]));
  if(!test.ok)fail('P5_ROLLBACK_TEST_FAILED','A P5 forward + rollback tranzakciós próba sikertelen.',{status:test.status,stderr:test.stderr.slice(-2000)});
  const restored=probe();if(!baseline(restored))fail('P5_ROLLBACK_BASELINE_NOT_RESTORED','A P5 rollback-test után nem állt vissza a 0.1.15 / 16 baseline.',{probe:restored});
  console.log(JSON.stringify({ok:true,mode,transactional:true,restoredBaseline:restored},null,2));process.exit(0);
}
if(approval!==approvalPhrase)fail('P5_APPROVAL_REQUIRED','Explicit DEV-only P5 migration approval szükséges.',{requiredApproval:approvalPhrase});
const dir=join(backupRoot,stamp());mkdirSync(dir,{recursive:true,mode:0o700});
const dump=join(dir,'supabase-dev-pre-commerce-storefront-order-p5.dump');
const backup=run('pg_dump',['-w','-h',db.host,'-p',db.port,'-U',db.user,'-d',db.database,'--format=custom','--no-owner','--no-privileges','--file='+dump]);
if(!backup.ok)fail('P5_BACKUP_FAILED','A P5 előtti DEV backup sikertelen.',{backupDir:dir,stderr:backup.stderr.slice(-1400)});chmodSync(dump,0o600);
const listing=run('pg_restore',['--list',dump]);if(!listing.ok||!listing.stdout.includes('commerce_schema_meta')||!listing.stdout.includes('commerce_order_mirror_attempts')||!listing.stdout.includes('commerce_orders'))fail('P5_BACKUP_VERIFY_FAILED','A P5 DEV backup listing ellenőrzése sikertelen.',{backupDir:dir});
const dumpSha=sha(dump);writeFileSync(join(dir,'backup.sha256'),dumpSha+'  '+basename(dump)+String.fromCharCode(10),{mode:0o600});
const apply=run('psql',psqlArgs(['-1','-f',migration]));if(!apply.ok)fail('P5_APPLY_FAILED','A P5 migration sikertelen; backup megmaradt.',{backupDir:dir,stderr:apply.stderr.slice(-2200)});
const after=ready(probe());const report={ok:true,mode,applied:true,migration:migrationRel,migrationSha256:actualSha,rollbackSha256:actualRollbackSha,backup:{directory:dir,file:basename(dump),sha256:dumpSha,listingVerified:true},probe:after,completedAt:new Date().toISOString()};
writeFileSync(join(dir,'migration-report.json'),JSON.stringify(report,null,2)+String.fromCharCode(10),{mode:0o600});console.log(JSON.stringify(report,null,2));
