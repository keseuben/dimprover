import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),ts=require('typescript');
process.chdir(fileURLToPath(new URL('../../',import.meta.url)));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'grid125-retry-contract-'));
const root='/srv/dimpro-dev/coordination/developer-grid',dir=root+'/dev-deliveries';
const map=p=>{assert.ok(String(p).startsWith(root+'/'),`Unexpected fixture path: ${p}`);return path.join(temp,path.relative(root,p));};
const fsp=Object.fromEntries(['mkdir','readFile','writeFile','link','unlink','open'].map(name=>[name,async(...args)=>{args[0]=map(args[0]);if(name==='link')args[1]=map(args[1]);return fs.promises[name](...args);} ]));
const identity={taskId:'task125',sessionId:'session125',workerCode:'OUTMINAI',sourceCommit:'a'.repeat(40),sourceBranch:'worker/outminai/task125',buildRunId:'build125',buildId:'fixture_build125',artifactSha256:'b'.repeat(64)};
const baseId='dev-delivery-'+crypto.createHash('sha256').update(JSON.stringify([identity.taskId,identity.sessionId])).digest('hex').slice(0,32);
let stage=6,runStatus='PASS',starts=[];
const state=()=>({sessions:[{id:identity.sessionId,taskId:identity.taskId,workerCode:identity.workerCode,endedAt:null,developmentContext:{workStageIndex:stage,bootAckState:'VALIDATED',devDeliveryTarget:'DRIVE_DEV',projectId:'project_dimprover',moduleName:'DIMPRO Drive'},sourceProvenance:{head:identity.sourceCommit,branch:identity.sourceBranch,sourceState:'VERIFIED'}}]});
const cache=new Map();
function load(file){
 if(cache.has(file))return cache.get(file);
 const exports={};cache.set(file,exports);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{exports,require:name=>{
  if(name==='server-only')return {};
  if(name==='node:fs/promises')return fsp;
  if(name==='node:fs')return {existsSync:p=>String(p).endsWith('/scripts/developer-grid/dev-delivery-job.sh')||fs.existsSync(map(p))};
  if(name==='node:child_process')return {spawn:(...args)=>{starts.push(args);return {on(){return this;},unref(){}};}};
  if(name==='./state-store')return {DEFAULT_DEVELOPER_GRID_STATE_ROOT:root,readGridState:async()=>state()};
  if(name==='./build-run-store')return {readBuildRunStore:async()=>({runs:[{...identity,id:identity.buildRunId,status:runStatus,exitCode:0,productionAccess:'DENY',queuedAt:new Date().toISOString()}]})};
  if(name==='./review-gate')return {evaluateDeveloperGridReviewGate:async()=>({ready:true})};
  if(name==='./source-provenance')return {verifyCurrentSourceExecutionState:async()=>true};
  if(name.startsWith('./'))return load('app/lib/developer-grid/'+name.slice(2)+'.ts');
  return require(name);
 },process:{env:{DIMPRO_DEVELOPER_GRID_SOURCE_WORKTREE:'/fixture',BENJADMIN_DEVELOPER_GRID_EXECUTION_ROOT:root+'/execution'},cwd:()=>'/fixture'},console,Set,Date,JSON,Buffer});
 return exports;
}
const backend=load('app/lib/developer-grid/dev-delivery.ts');
const old={...identity,schemaVersion:1,id:baseId,target:'DRIVE_DEV',environment:'DEV',productionAccess:'DENY',status:'ROLLED_BACK',approvedAt:'2026-10-31T00:00:00Z',updatedAt:'2026-10-31T00:01:00Z',code:'DEV_DELIVERY_PUBLIC_CHECK_FAILED',browserVerification:null,failureReason:'old failure',runtimeRoot:'/old-runtime'};
fs.mkdirSync(map(dir),{recursive:true});
const write=(id,value)=>fs.writeFileSync(map(dir+'/'+id+'.json'),JSON.stringify(value));
const digest=id=>crypto.createHash('sha256').update(fs.readFileSync(map(dir+'/'+id+'.json'))).digest('hex');
const request={...identity,id:baseId,action:'RETRY'};
let tests=0;async function check(name,fn){await fn();console.log('PASS',++tests,name);}
try{
 write(baseId,old);const before=digest(baseId);
 let child;
 await check('retry keeps the failed attempt byte-identical and creates an isolated attempt',async()=>{child=await backend.retryDeveloperGridDevDelivery(request);assert.notEqual(child.id,baseId);assert.equal(child.retryOfDeliveryId,baseId);assert.equal(child.attemptNumber,2);assert.equal(child.status,'APPROVED');assert.equal(child.runtimeRoot,undefined);assert.equal(child.browserVerification,null);assert.equal(digest(baseId),before);assert.equal(starts.length,1);});
 await check('READ follows the durable retry chain for the same task/session',async()=>{const r=await backend.getDeveloperGridDevDelivery(identity.taskId,identity.sessionId);assert.equal(r.id,child.id);assert.equal(r.buildId,identity.buildId);});
 await check('replayed retry returns the same attempt without another record',async()=>{const r=await backend.retryDeveloperGridDevDelivery(request);assert.equal(r.id,child.id);assert.equal(fs.readdirSync(map(dir)).filter(n=>/^dev-delivery-[0-9a-f]{32}\.json$/.test(n)).length,2);assert.equal(digest(baseId),before);});
 await check('stale build identity on a repeated click is rejected',async()=>{await assert.rejects(backend.retryDeveloperGridDevDelivery({...request,buildId:'wrong'}),e=>e.code==='DEV_DELIVERY_RETRY_IDENTITY_MISMATCH');});
 await check('an active attempt cannot be retried as a terminal failure',async()=>{await assert.rejects(backend.retryDeveloperGridDevDelivery({...request,id:child.id}),e=>e.code==='DEV_DELIVERY_RETRY_NOT_ALLOWED');});
 await check('a newer failed build prevents retry of an older PASS',async()=>{runStatus='FAIL';await assert.rejects(backend.retryDeveloperGridDevDelivery(request),e=>e.code==='DEV_DELIVERY_BUILD_REQUIRED');runStatus='PASS';});
 await check('wrong workflow stage blocks retry even if old delivery passed preflight',async()=>{stage=5;await assert.rejects(backend.retryDeveloperGridDevDelivery(request),e=>e.code==='DEV_DELIVERY_SESSION_REQUIRED');stage=6;});
 await check('broken retry linkage fails closed instead of silently using old success',async()=>{const next=map(dir+'/'+baseId+'.next.json'),saved=fs.readFileSync(next);fs.writeFileSync(next,JSON.stringify({previousId:baseId,nextId:'dev-delivery-'+'f'.repeat(32)}));await assert.rejects(backend.getDeveloperGridDevDelivery(identity.taskId,identity.sessionId),e=>e.code==='DEV_DELIVERY_HISTORY_INVALID');fs.writeFileSync(next,saved);});
 await check('a second rolled-back attempt can retry without reusing its diagnostics or proof',async()=>{write(child.id,{...child,status:'ROLLED_BACK',code:'DEV_DELIVERY_PUBLIC_CHECK_FAILED',failureReason:'second failure',browserVerification:null});const third=await backend.retryDeveloperGridDevDelivery({...request,id:child.id});assert.equal(third.attemptNumber,3);assert.equal(third.retryOfDeliveryId,child.id);assert.equal(third.failureReason,undefined);assert.equal(digest(baseId),before);});
 await check('route accepts RETRY only behind existing device authentication',async()=>{const route=fs.readFileSync('app/api/dev/grid/dev-delivery/route.ts','utf8');assert.ok(route.includes('"RETRY"'));assert.ok(route.indexOf('isChatGridDeviceAuthorized(request.headers)')<route.indexOf('retryDeveloperGridDevDelivery(input)'));});
 console.log(JSON.stringify({ok:true,tests,liveMutation:false,scope:'real retry backend and task lock, isolated filesystem/process dependencies'}));
}finally{assert.ok(temp.startsWith(path.join(os.tmpdir(),'grid125-retry-contract-')));fs.rmSync(temp,{recursive:true,force:true});}
