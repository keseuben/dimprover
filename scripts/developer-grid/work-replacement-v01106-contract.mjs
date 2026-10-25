import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('app/lib/developer-grid/work-replacement.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
let count=0;
async function test(label,fn){await fn();console.log('PASS',++count,label);}
function fixture(){
 const calls=[],events=[];
 const session={id:'session-old',taskId:'task-old',workerCode:'BENJAMINAI',endedAt:null,sourceProvenance:{head:'a'.repeat(40)},developmentContext:{sourceExecutionProof:{sha256:'b'.repeat(64)},workStageIndex:1,engineSessionId:'engine-old'}};
 const task={id:'task-old',projectId:'project_dimprover'};
 const input={taskId:task.id,sessionId:session.id,workerCode:'BENJAMINAI',expectedSourceProofSha256:'b'.repeat(64),sourcePrompt:'Implement a DEV-only UI correction; no deployment.',projectId:task.projectId,moduleName:'Developer Grid V1'};
 const source={schemaVersion:1,head:'c'.repeat(40),branch:'codex/test',authority:'MODULE_CATALOG'};
 const data={audit:'',dirty:false,failStart:false,session,task,input,source,calls,events};
 const stubs={
    "./reviewed-write-scope":{normalizeReviewedWritePaths:raw=>Array.isArray(raw)?raw:[],boundReviewedWritePaths:()=>[]},
    "./task-operation-lock":{withDeveloperGridTaskOperation:async(_id,fn)=>fn()},
  'node:fs/promises':{stat:async()=>({size:data.audit.length}),readFile:async()=>data.audit},
  '@/app/lib/dev-center/engine-repository':{finalizeDevEngineTask:async arg=>{calls.push(['finalize',arg]);}},
  '@/app/lib/dev-center/orchestration-repository':{releaseSessionAtomic:async(...args)=>calls.push(['release',...args])},
  './foundation':{getDeveloperGridFoundation:async()=>({sourceProvenance:{head:'a'.repeat(40)}})},
  './module-source':{resolveDeveloperGridModuleSource:async()=>source},
  './source-provenance':{verifyCurrentSourceExecutionState:async(_p,options)=>{assert.equal(options.requireClean,true);if(data.dirty)throw Object.assign(Error('dirty'),{code:'SOURCE_WORKTREE_DIRTY'});}},
  './state-store':{readGridState:async()=>({sessions:[session],lastSequence:events.length}),listGridEvents:async()=>({events}),appendGridEvent:async e=>events.push(e),upsertWorkerSession:async s=>{calls.push(['end',s]);if(s.id===session.id)Object.assign(session,s);}},
  './events':{encodeEventCursor:n=>String(n)},
  './work-start':{getDeveloperGridTaskById:async()=>task,normalizeWorkStartInput:r=>({...r,sourceCommit:r.sourceCommit||null}),workStartTaskId:k=>'new-'+createHash('sha256').update(k).digest('hex').slice(0,20),startDeveloperGridWork:async i=>{calls.push(['start',i]);if(data.failStart)throw Error('temporary start failure');return {task:{id:'task-new'},session:{id:'session-new',workerCode:'BENJAMINAI',developmentContext:{sourceExecutionProof:{sha256:'e'.repeat(64)}}},routingState:'ROUTED'};}}
 };
 const sandbox={exports:{},require:id=>Object.hasOwn(stubs,id)?stubs[id]:require(id),process:{env:{}},console};
 vm.runInNewContext(code,sandbox);return {...data,data,...sandbox.exports};
}
async function prepare(f){return f.prepareDeveloperGridWorkReplacement(f.input);}
await test('Preview is read-only and binds original identity, proof and new instruction',async()=>{const f=fixture(),p=await prepare(f);assert.equal(f.calls.length,0);assert.equal(f.events.length,0);assert.equal(p.plan.previousTaskId,f.task.id);assert.equal(p.plan.sourcePrompt,f.input.sourcePrompt);assert.equal(p.plan.requiresNewBootAck,true);assert.equal(p.plan.preservesPreviousWorktree,true);});
await test('Wrong source proof cannot replace a task',async()=>{const f=fixture();f.input.expectedSourceProofSha256='d'.repeat(64);await assert.rejects(prepare(f),e=>e.code==='WORK_REPLACEMENT_PROOF_CHANGED');assert.equal(f.calls.length,0);});
await test('Another worker cannot replace selected task',async()=>{const f=fixture();f.input.workerCode='OUTMINAI';await assert.rejects(prepare(f),e=>e.code==='WORK_REPLACEMENT_IDENTITY_MISMATCH');});
await test('Another project cannot replace selected task',async()=>{const f=fixture();f.input.projectId='another';await assert.rejects(prepare(f),e=>e.code==='WORK_REPLACEMENT_IDENTITY_MISMATCH');});
await test('Later-stage work cannot be replaced through stage-one recovery',async()=>{const f=fixture();f.session.developmentContext.workStageIndex=2;await assert.rejects(prepare(f),e=>e.code==='WORK_REPLACEMENT_STAGE_DENIED');});
await test('Uncommitted work blocks replacement',async()=>{const f=fixture();f.data.dirty=true;await assert.rejects(prepare(f),e=>e.code==='SOURCE_WORKTREE_DIRTY');assert.equal(f.calls.length,0);});
await test('Uncertain request blocks replacement',async()=>{const f=fixture();f.data.audit=JSON.stringify({event:'REQUEST',requestId:'req',requestHash:'hash'});await assert.rejects(prepare(f),e=>e.code==='WORK_REPLACEMENT_EXECUTION_PENDING');});
await test('Corrupt audit blocks replacement',async()=>{const f=fixture();f.data.audit='{bad-json';await assert.rejects(prepare(f),e=>e.code==='WORK_REPLACEMENT_AUDIT_INVALID');});
await test('Changed prompt invalidates prior approval hash',async()=>{const f=fixture(),p=await prepare(f);await assert.rejects(f.replaceDeveloperGridWork({...f.input,sourcePrompt:'different work',planSha256:p.planSha256}),e=>e.code==='WORK_REPLACEMENT_PLAN_CHANGED');assert.equal(f.calls.length,0);});
await test('Explicit replacement closes old task as failed and creates isolated new work',async()=>{const f=fixture(),p=await prepare(f);await f.replaceDeveloperGridWork({...f.input,planSha256:p.planSha256});assert.equal(f.calls[0][0],'release');assert.equal(f.calls[0][3],false);assert.equal(f.calls[1][0],'finalize');assert.equal(f.calls[1][1].outcome,'failed');assert.equal(f.calls[1][1].rebalance,false);const start=f.calls.find(c=>c[0]==='start')[1];assert.equal(start.sourceCommit,f.source.head);assert.equal(start.sourcePrompt,f.input.sourcePrompt);assert.equal(start.autoRetireStalePreBoot,false);assert(f.session.endedAt);});
await test('Retry after start failure preserves deterministic new-task idempotency',async()=>{const f=fixture(),p=await prepare(f);f.data.failStart=true;await assert.rejects(f.replaceDeveloperGridWork({...f.input,planSha256:p.planSha256}));f.data.failStart=false;await f.replaceDeveloperGridWork({...f.input,planSha256:p.planSha256});const starts=f.calls.filter(c=>c[0]==='start');assert.equal(starts[0][1].idempotencyKey,starts[1][1].idempotencyKey);assert.equal(f.calls.filter(c=>c[0]==='finalize').length,1);});
await test('Approved file list is part of preview hash and bound to fresh session proof',async()=>{const f=fixture();f.input.reviewedWritePaths=['app/lib/developer-grid/work-start.ts'];const p=await prepare(f);await assert.rejects(f.replaceDeveloperGridWork({...f.input,reviewedWritePaths:[],planSha256:p.planSha256}),e=>e.code==='WORK_REPLACEMENT_PLAN_CHANGED');const r=await f.replaceDeveloperGridWork({...f.input,planSha256:p.planSha256});const approval=r.work.session.developmentContext.reviewedWriteApproval;assert.equal(approval.sessionId,'session-new');assert.equal(approval.proofSha256,'e'.repeat(64));assert.equal(approval.planSha256,p.planSha256);assert.equal(approval.paths[0],f.input.reviewedWritePaths[0]);});
console.log(JSON.stringify({ok:true,tests:count,scope:'replacement-runtime-simulation-only',liveMutation:false}));
