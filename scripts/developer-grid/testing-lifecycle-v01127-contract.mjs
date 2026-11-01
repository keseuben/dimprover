import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const root=new URL('../../',import.meta.url);
const repo=fs.readFileSync(new URL('app/lib/dev-center/engine-repository.ts',root),'utf8');
const start=repo.indexOf('export async function synchronizeDevEngineTaskTestingForGrid('),end=repo.indexOf('\nexport async function ',start+1);assert(start>=0&&end>start);
const compiled=ts.transpileModule(repo.slice(start,end).replace('export async','async'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
let tests=0;async function check(name,fn){await fn();console.log('PASS',++tests,name);}
class EngineError extends Error {constructor(message,code){super(message);this.code=code;}}
const expected={taskId:'task',sessionId:'engine',workerCode:'OUTMINAI',branch:'worker/outminai/task',worktree:'/srv/dimpro-dev/worktrees/task',head:'a'.repeat(40)};
function fixture({status='in_progress',taskPatch={},sessionPatch={},race=false}={}){
 const task={id:'task',title:'Drive probe',projectId:'project',status,requestedWorkerId:'worker_outminai',assignedWorkerId:'worker_outminai',claimedBySessionId:'engine',branchName:expected.branch,worktreePath:expected.worktree,updatedAt:'before',metadata:{activeSessionId:'engine',sourcePrompt:'immutable instruction',testingStartedAt:'original-test-time'},...taskPatch};
 const session={id:'engine',taskId:'task',workerId:'worker_outminai',handshakeStage:'READY',status:'active',branchName:expected.branch,worktreePath:expected.worktree,leaseExpiresAt:'2099-01-01T00:00:00Z',...sessionPatch};let writes=0,audits=0,update;
 const client={from(table){const filters=[];return {select(){return this;},eq(k,v){filters.push([k,v]);return this;},update(value){update=value;return this;},async maybeSingle(){if(table==='dev_center_worker_sessions')return {data:session,error:null};assert.equal(table,'dev_center_tasks');assert(filters.some(([k,v])=>k==='updated_at'&&v==='before'));if(race)return {data:null,error:null};writes++;Object.assign(task,update);return {data:task,error:null};}};}};
 const box={requireClient:async()=>client,getTaskForConsoleControl:async()=>structuredClone(task),CONSOLE_ROUTABLE_WORKERS:{OUTMINAI:'worker_outminai',ARMINAI:'worker_arminai'},text:x=>typeof x==='string'?x.trim():'',jsonRecord:x=>x||{},mapSession:x=>x,mapTask:x=>x,DevCenterEngineError:EngineError,databaseError:()=>{throw Error('database');},nowIso:()=> 'now',addAudit:async()=>{audits++;},Date,Number};
 vm.createContext(box);vm.runInContext(compiled+';globalThis.run=synchronizeDevEngineTaskTestingForGrid',box);
 return {run:(input=expected)=>box.run(input),task,get writes(){return writes;},get audits(){return audits;}};
}
await check('recovered in-progress task returns to TESTING through identity-bound CAS and audit',async()=>{const f=fixture();assert.equal((await f.run()).synchronized,true);assert.equal(f.task.status,'testing');assert.equal(f.task.metadata.testingStartedAt,'original-test-time');assert.equal(f.task.metadata.sourcePrompt,'immutable instruction');assert.equal(f.writes,1);assert.equal(f.audits,1);});
await check('already-testing and previously-finalized tasks are idempotent',async()=>{for(const status of ['testing','completed']){const f=fixture({status,sessionPatch:status==='completed'?{status:'closed'}:{}});assert.equal((await f.run()).synchronized,false);assert.equal(f.writes,0);assert.equal(f.audits,0);}});
await check('queued, ready, blocked and cancelled tasks cannot be promoted',async()=>{for(const status of ['queued','ready','blocked','cancelled']){const f=fixture({status});await assert.rejects(f.run(),e=>e.code==='DEV_CENTER_GRID_TESTING_RECOVERY_REQUIRED');assert.equal(f.writes,0);}});
await check('foreign task/worker/claim or stale metadata session cannot be promoted',async()=>{for(const taskPatch of [{requestedWorkerId:'foreign'},{assignedWorkerId:'foreign'},{claimedBySessionId:'foreign'},{metadata:{activeSessionId:'foreign'}}]){const f=fixture({taskPatch});await assert.rejects(f.run(),e=>e.code==='DEV_CENTER_GRID_TESTING_IDENTITY_MISMATCH');assert.equal(f.writes,0);}});
await check('foreign session task, source, worker and incomplete handshake cannot be promoted',async()=>{for(const sessionPatch of [{taskId:'foreign'},{workerId:'foreign'},{branchName:'other'},{worktreePath:'/other'},{handshakeStage:'TASK_BOUND'}]){const f=fixture({sessionPatch});await assert.rejects(f.run(),e=>e.code==='DEV_CENTER_GRID_TESTING_SESSION_MISMATCH');assert.equal(f.writes,0);}});
await check('expired, missing, malformed and inactive engine leases stop promotion',async()=>{for(const sessionPatch of [{leaseExpiresAt:'2000-01-01T00:00:00Z'},{leaseExpiresAt:null},{leaseExpiresAt:'invalid'},{status:'closed'},{status:'blocked'}]){const f=fixture({sessionPatch});await assert.rejects(f.run(),e=>e.code==='DEV_CENTER_GRID_TESTING_RECOVERY_REQUIRED');assert.equal(f.writes,0);}});
await check('concurrent task change fails CAS without audit or state mutation',async()=>{const f=fixture({race:true});await assert.rejects(f.run(),e=>e.code==='DEV_CENTER_GRID_TESTING_RACE');assert.equal(f.writes,0);assert.equal(f.audits,0);});
const closeSource=fs.readFileSync(new URL('app/lib/developer-grid/work-close.ts',root),'utf8');
const closeJs=ts.transpileModule(closeSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function closeFixture({ready=true,delivery='PASS_ASSISTED',syncError=false}={}){
 const calls=[],task={id:'task',title:'Drive'},session={id:'grid',taskId:'task',workerCode:'OUTMINAI',endedAt:null,sourceProvenance:{head:'a'.repeat(40),branch:expected.branch,worktree:expected.worktree},developmentContext:{workStageIndex:6,bootAckState:'VALIDATED',devDeliveryTarget:'DRIVE_DEV',engineSessionId:'engine'}};
 const state={task,sessions:[session]};const exports={};
 const box={exports,require:name=>{
  if(name.endsWith('engine-repository'))return {synchronizeDevEngineTaskTestingForGrid:async input=>{calls.push('testing');assert.equal(input.sessionId,'engine');assert.equal(input.worktree,expected.worktree);if(syncError)throw Error('identity denied');return {};},finalizeDevEngineTask:async()=>{calls.push('finalize');return {task:{status:'completed'}};}};
  if(name==='./task-operation-lock')return {withDeveloperGridTaskOperation:async(id,fn)=>{calls.push('lock');assert.equal(id,'task');return fn();}};
  if(name==='./dev-delivery-policy')return {devDeliveryIdentity:()=>({}),devDeliveryAllowsClosure:(_s,r)=>r.status==='PASS_ASSISTED'};
  if(name==='./dev-delivery')return {getDeveloperGridDevDelivery:async()=>({status:delivery})};
  if(name==='./build-run-store')return {readBuildRunStore:async()=>({runs:[]})};
  if(name==='./conversation-memory')return {refreshDerivedConversationMemory:async()=>null};
  if(name==='./review-gate')return {evaluateDeveloperGridReviewGate:async()=>{calls.push('gate');return {ready,checks:[{required:true,pass:ready,label:'TEST'}]};}};
  if(name==='./work-start')return {getDeveloperGridTaskById:async()=>task};
  if(name==='./state-store')return {readGridState:async()=>state,upsertGridTask:async t=>{calls.push('grid-task');state.task=t;},upsertWorkerSession:async()=>{calls.push('grid-session');},appendGridEvent:async()=>{calls.push('event');}};
  throw Error('unexpected import '+name);
 },Error,Date};vm.createContext(box);vm.runInContext(closeJs,box);return {run:()=>exports.closeDeveloperGridWork({taskId:'task',sessionId:'grid'}),calls};
}
await check('closure synchronizes TESTING only after delivery and all current-HEAD gates pass',async()=>{const f=closeFixture();await f.run();assert.deepEqual(f.calls,['lock','gate','testing','finalize','grid-task','grid-session','event']);});
await check('missing test/review/build/handoff or failed delivery cannot trigger TESTING',async()=>{for(const option of [{ready:false},{delivery:'ROLLED_BACK'}]){const f=closeFixture(option);await assert.rejects(f.run());assert(!f.calls.includes('testing'));assert(!f.calls.includes('finalize'));assert(!f.calls.includes('grid-session'));}});
await check('engine identity rejection leaves Grid session open',async()=>{const f=closeFixture({syncError:true});await assert.rejects(f.run(),/identity denied/);assert(!f.calls.includes('finalize'));assert(!f.calls.includes('grid-task'));assert(!f.calls.includes('grid-session'));});
console.log('TESTING_LIFECYCLE_RUNTIME_PASS',tests);
