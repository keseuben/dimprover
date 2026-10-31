import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const control=require('../../desktop/benjadmin-developer-grid/src/workflow/control.cjs');
const main=fs.readFileSync(new URL('../../desktop/benjadmin-developer-grid/src/main.cjs',import.meta.url),'utf8');
const task={id:'task',sessionId:'session',sourceHead:'a'.repeat(40)};
const proof='b'.repeat(64);
const request={schemaVersion:1,requestId:'read-next',taskId:task.id,sessionId:task.sessionId,workerCode:'OUTMINAI',sourceProofSha256:proof,action:'GIT_STATUS'};
const history=[{requestId:'tsc-before',key:'old-key',completedAt:'2026-10-30T18:56:57Z',resultStatus:'PASS'}];
const initial={queuedExecutionRequest:request,executionRequest:null,pendingExecutionResult:null,executionBridgeState:'WAITING_MANUAL_EXECUTION',executionHistory:history};
let count=0;
async function check(label,fn){await fn();console.log('PASS',++count,label);}
const start=main.indexOf('async function runManualControl(');
const end=main.indexOf('\nfunction registerIpc()',start);
assert(start>=0&&end>start);
function fixture(record=initial,{running=false,contextTask=task,contextProof=proof}={}){
 let current=structuredClone(record),recoveries=0,patches=0;
 const sandbox={workflowControl:control,config:{workflowControlModes:{OUTMINAI:'MANUAL'}},manualControlKeys:new Set(),executionRequestProcessingKeys:new Set(running?['task:session']:[]),
  manualControlContext:async()=>({code:'OUTMINAI',task:contextTask,proof:contextProof,conversationId:'chat',view:{},pair:{session:{developmentContext:{bootAckState:'VALIDATED'}}}}),
  loadTaskLaunchRecords:()=>({task:current}),captureLatestAssistantText:async()=>({ok:true,generating:false,text:'pending read'}),
  normalizedProofWorkerCode:code=>code==='BENAI'?'BENJAMINAI':code,
  saveTaskLaunchPatch:(_task,_code,patch)=>{patches++;current={...current,...structuredClone(patch)};},
  recoverConversationExecutionAuthority:async()=>{recoveries++;assert.equal(current.queuedExecutionRequest,null);assert.equal(current.executionRequest,null);assert.deepEqual(current.executionHistory,history);return {proofSha256:'c'.repeat(64)};},
  createHash,send:()=>{},Date};
 vm.createContext(sandbox);vm.runInContext(main.slice(start,end)+';globalThis.run=runManualControl',sandbox);
 return {run:()=>sandbox.run({action:'recover'}),get record(){return current;},get recoveries(){return recoveries;},get patches(){return patches;}};
}
await check('paused acknowledged TSC plus undispatched next read can recover without replaying either operation',async()=>{
 assert.equal(control.executionPending(initial),true);
 const selected=control.recoverableReadRequest(initial);
 assert.equal(selected.source,'UNDISPATCHED_READ');assert.equal(selected.request.requestId,request.requestId);
 const f=fixture();assert.equal((await f.run()).ok,true);assert.equal(f.recoveries,1);
 assert.equal(f.record.abandonedReadRequests.length,1);
 assert.deepEqual(f.record.abandonedReadRequests[0].request,request);
 assert.deepEqual(f.record.executionHistory,history);
 assert.equal(f.record.manualExecutionPermission,null);assert.equal(f.record.pendingExecutionResult,null);
});
await check('queued reads are eligible for all readonly bridge operations',()=>{
 for(const action of ['READ_FILE','LIST_FILES','SEARCH_FILES','GIT_STATUS','GIT_DIFF','GIT_DIFF_CHECK'])
  assert.equal(control.recoverableReadFailure({...initial,queuedExecutionRequest:{...request,action}}),true);
});
await check('queued writes and test commands retain their pending guard',async()=>{
 for(const action of ['WRITE_FILE','RUN_DEV_COMMAND']){
  const f=fixture({...initial,queuedExecutionRequest:{...request,action}});
  await assert.rejects(f.run(),/függő végrehajtási/);assert.equal(f.patches,0);assert.equal(f.recoveries,0);
 }
});
await check('in-flight, uncertain, executed and simultaneous operations cannot be discarded',async()=>{
 for(const [patch,running] of [[{},true],[{executionBridgeState:'EXECUTION_UNCERTAIN'},false],[{executionBridgeState:'REQUEST_RUNNING'},false],[{pendingExecutionResult:{phase:'EXECUTED'}},false],[{executionRequest:{key:'other',request:{...request,requestId:'other'}}},false]]){
  const f=fixture({...initial,...patch},{running});await assert.rejects(f.run(),/függő végrehajtási/);assert.equal(f.patches,0);
 }
});
await check('a completed queued request is never reclassified as undispatched',()=>{
 assert.equal(control.recoverableReadFailure({...initial,executionHistory:[...history,{requestId:request.requestId,completedAt:'now'}]}),false);
});
await check('foreign task, session, worker and stale proof fail before any journal patch or recovery',async()=>{
 for(const patch of [{taskId:'foreign'},{sessionId:'foreign'},{workerCode:'ARMINAI'},{sourceProofSha256:'c'.repeat(64)}]){
  const f=fixture({...initial,queuedExecutionRequest:{...request,...patch}});await assert.rejects(f.run(),/függő végrehajtási/);assert.equal(f.patches,0);assert.equal(f.recoveries,0);
 }
});
await check('existing attempted-read recovery remains supported and still preserves mutation guards',async()=>{
 const f=fixture({...initial,queuedExecutionRequest:null,executionRequest:{key:'attempt-key',request},executionBridgeState:'BLOCKED'});
 await f.run();assert.equal(f.record.abandonedReadRequests[0].key,'attempt-key');assert.equal(f.record.abandonedReadRequests[0].source,'ATTEMPTED_READ');
});
await check('an archived read cannot be recaptured or replayed while the recovery awaits its server response',async()=>{
 const f=fixture();await f.run();assert.equal(control.wasAbandonedRead(f.record,request),true);
 assert.equal(control.wasAbandonedRead(f.record,{...request,sourceProofSha256:'c'.repeat(64)}),false);
 assert.equal(control.wasAbandonedRead(f.record,{...request,action:'WRITE_FILE'}),false);
 const begin=main.indexOf('async function processCapturedExecutionRequest('),finish=main.indexOf('\nasync function processCapturedStageReport(',begin);
 const sandbox={workflowControl:control,EXECUTION_REQUEST_START:'BENJADMIN_EXECUTION_REQUEST_V1',parseDeveloperGridExecutionRequest:()=>({ok:true,request}),loadTaskLaunchRecords:()=>({task:f.record})};
 vm.createContext(sandbox);vm.runInContext(main.slice(begin,finish)+';globalThis.run=processCapturedExecutionRequest',sandbox);
 assert.equal((await sandbox.run({view:{webContents:{isDestroyed:()=>false}},body:'BENJADMIN_EXECUTION_REQUEST_V1',workerCode:'OUTMINAI',task})).reason,'EXECUTION_READ_ABANDONED');
});
await check('the acknowledged-next selector does not reconstruct an explicitly abandoned read',()=>{
 const protocol=require('../../desktop/benjadmin-developer-grid/src/task-launch/execution-request.cjs');
 const completed={...history[0],requestId:'tsc-before',resultId:'res-'+'d'.repeat(64),resultSha256:'d'.repeat(64),workflowContinue:true};
 const ack={schemaVersion:1,taskId:task.id,sessionId:task.sessionId,workerCode:'OUTMINAI',requestId:completed.requestId,resultId:completed.resultId,resultSha256:completed.resultSha256,sourceProofSha256:proof,decision:'ACCEPTED'};
 const messages=[{role:'ASSISTANT',text:['BENJADMIN_EXECUTION_RESULT_ACK_V1',JSON.stringify(ack),'BENJADMIN_EXECUTION_RESULT_ACK_END','BENJADMIN_EXECUTION_REQUEST_V1',JSON.stringify(request),'BENJADMIN_EXECUTION_REQUEST_END'].join('\n')}];
 const record={executionHistory:[completed]};assert.equal(protocol.recoverAcknowledgedNextRequest(messages,task,'OUTMINAI',record,proof).requestId,request.requestId);
 assert.equal(protocol.recoverAcknowledgedNextRequest(messages,task,'OUTMINAI',{...record,abandonedReadRequests:[{request}]},proof),null);
});
console.log('QUEUED_READ_RECOVERY_RUNTIME_PASS',count);
