import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const source='desktop/benjadmin-developer-grid/src/';
const control=require('../../'+source+'workflow/control.cjs');
const {createExecutionJournal}=require('../../'+source+'workflow/execution-journal.cjs');
const {sanitizeConfig}=require('../../'+source+'config/defaults.cjs');
const main=fs.readFileSync(source+'main.cjs','utf8');
let count=0;
async function check(label,fn){await fn();console.log('PASS',++count,label);}
const task={id:'task',sessionId:'session',surfaceConversationId:'chat',description:'Kizárólag állapotellenőrzés. Forrást ne módosíts; buildet ne indíts.',sourceHead:'a'.repeat(40)};
const request={schemaVersion:1,requestId:'req-1',taskId:'task',sessionId:'session',workerCode:'OUTMINAI',sourceProofSha256:'b'.repeat(64),action:'WRITE_FILE',path:'app/probe.ts',content:'hello'};
const permission={taskId:'task',sessionId:'session',workerCode:'OUTMINAI',sourceProofSha256:'b'.repeat(64),conversationId:'chat',access:'DEV'};
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture({manual=false,delivery=true,executeError=null}={}){
 let record=manual?{}:{manualExecutionPermission:{...permission}}, calls=0,sends=0,current='chat',clock=100000;
 const running=new Set(), config=sanitizeConfig({});
 const make=()=>createExecutionJournal({read:()=>record,patch:(_task,_code,patch)=>{record={...record,...patch};},execute:async()=>{calls++;if(executeError)throw executeError;return {requestId:request.requestId,execution:{status:'PASS',code:'FILE_WRITTEN'}};},deliver:async()=>{sends++;assert.ok(record.pendingExecutionResult,'result persisted before send');return {sent:delivery,verified:delivery};},conversation:()=>current,allowed:(code,t,r,p,c,a)=>control.executionAllowed(config,code,t,r,p,c,a),running,hash,now:()=>clock});
 const input={view:{},task,workerCode:'OUTMINAI',request,expectedProof:request.sourceProofSha256,localMismatch:false};
 return {run:()=>make()(input),restart:()=>make()(input),input,get record(){return record;},set record(value){record=value;},get calls(){return calls;},get sends(){return sends;},set delivery(value){delivery=value;},set current(value){current=value;},set clock(value){clock=value;},config};
}
await check('upgrade defaults all four workers to manual and preserves explicit per-worker AUTO',()=>{
 const config=sanitizeConfig({version:14});for(const w of control.WORKERS)assert.equal(control.mode(config,w),'MANUAL');
 const saved=sanitizeConfig({workflowControlModes:{OUTMINAI:'AUTO',BENJAMINAI:'AUTO',ARMINAI:'invalid'}});
 assert.equal(control.mode(saved,'OUTMINAI'),'AUTO');assert.equal(control.mode(saved,'BENAI'),'AUTO');assert.equal(control.mode(saved,'ARMINAI'),'MANUAL');
 assert.deepEqual(sanitizeConfig(JSON.parse(JSON.stringify(saved))).workflowControlModes,saved.workflowControlModes);
});
await check('manual permissions reject wrong worker, session, proof, conversation and write under read-only access',()=>{
 const cfg=sanitizeConfig({}),record={manualExecutionPermission:permission};
 assert.equal(control.executionAllowed(cfg,'OUTMINAI',task,record,'b'.repeat(64),'chat','WRITE_FILE'),true);
 for(const [code,t,proof,cid] of [['BENAI',task,'b'.repeat(64),'chat'],['OUTMINAI',{...task,sessionId:'other'},'b'.repeat(64),'chat'],['OUTMINAI',task,'c'.repeat(64),'chat'],['OUTMINAI',task,'b'.repeat(64),'other']])assert.equal(control.executionAllowed(cfg,code,t,record,proof,cid,'GIT_STATUS'),false);
 const readOnly={manualExecutionPermission:{...permission,access:'READ_ONLY'}};
 assert.equal(control.executionAllowed(cfg,'OUTMINAI',task,readOnly,'b'.repeat(64),'chat','WRITE_FILE'),false);
 assert.equal(control.executionAllowed(cfg,'OUTMINAI',task,readOnly,'b'.repeat(64),'chat','SEARCH_FILES'),true);
});
await check('manual continuation retains original restrictions and fails when original instruction is missing',()=>{
 assert.ok(control.continuationPrompt(task,'OUTMINAI','b'.repeat(64),[]).includes(task.description));
 assert.throws(()=>control.continuationPrompt({...task,description:''},'OUTMINAI','b'.repeat(64),[]),/ORIGINAL_INSTRUCTION/);
});
await check('legacy pending-send label cannot become a replayable queue item or permanently block explicit recovery',()=>{
 assert.equal(control.executionPending({executionBridgeState:'RESULT_SEND_PENDING',lastExecutionRequestId:'req-001'}),false);
 assert.equal(control.executionPending({executionBridgeState:'RESULT_SEND_PENDING',executionRequest:{request}}),true);
});
await check('manual mode cannot execute or deliver before explicit task permission',async()=>{
 const f=fixture({manual:true});assert.equal((await f.run()).reason,'MANUAL_PERMISSION_REQUIRED');assert.equal(f.calls,0);assert.equal(f.sends,0);
});
await check('failed delivery persists result and restart delivers without repeating write',async()=>{
 const f=fixture({delivery:false});await f.run();assert.equal(f.calls,1);assert.ok(f.record.pendingExecutionResult);assert.equal(control.executionPending(f.record),true);
 f.delivery=true;assert.equal((await f.restart()).processed,true);assert.equal(f.calls,1);assert.equal(f.sends,2);assert.equal(control.executionPending(f.record),false);
 assert.equal((await f.restart()).duplicate,true);assert.equal(f.calls,1);
});
await check('a different request waits behind the pending result',async()=>{
 const f=fixture({delivery:false});await f.run();f.input.request={...request,requestId:'req-2'};
 assert.equal((await f.run()).reason,'PREVIOUS_RESULT_PENDING');assert.equal(f.calls,1);
});
await check('reusing a delivered request ID with changed content is blocked',async()=>{
 const f=fixture();await f.run();f.input.request={...request,content:'different'};
 assert.equal((await f.run()).reason,'EXECUTION_REQUEST_ID_REUSED');assert.equal(f.calls,1);
});
await check('pausing after a completed operation preserves the result without sending or re-executing',async()=>{
 const f=fixture({delivery:false});await f.run();f.record={...f.record,manualExecutionPermission:null};
 await f.restart();assert.equal(f.calls,1);assert.equal(f.sends,1);assert.ok(f.record.pendingExecutionResult);
});
await check('wrong conversation cannot receive a stored result',async()=>{
 const f=fixture({delivery:false});await f.run();f.current='other';await f.restart();assert.equal(f.calls,1);assert.equal(f.sends,1);
});
await check('authoritative HTTP error retains real code and is delivered as blocked',async()=>{
 const error=Object.assign(new Error('READY worker session required'),{status:409,code:'READY_SESSION_REQUIRED'});
 const f=fixture({executeError:error});const result=await f.run();assert.equal(result.payload.execution.code,'READY_SESSION_REQUIRED');assert.equal(f.record.executionBridgeCode,'READY_SESSION_REQUIRED');
});
await check('uncertain network transport backs off without issuing a fake final result',async()=>{
 const f=fixture({executeError:new Error('timeout')});f.input.request={...request,action:"GIT_STATUS"};assert.equal((await f.run()).reason,'TRANSPORT_RETRY');assert.equal(f.sends,0);assert.equal(f.record.executionRequest.request.requestId,request.requestId);
 assert.equal((await f.restart()).reason,'TRANSPORT_BACKOFF');assert.equal(f.calls,1);
});
await check('uncertain write never automatically re-executes after timeout or restart',async()=>{
 const f=fixture({executeError:new Error('timeout')});await f.run();f.clock=999999;assert.equal((await f.restart()).reason,'EXECUTION_OUTCOME_UNCERTAIN');assert.equal(f.calls,1);assert.equal(f.sends,0);
});
function extract(name){const start=main.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(start>=0,name);const rest=main.slice(start);const end=rest.slice(1).search(/\n(?:async )?function /);return end<0?rest:rest.slice(0,end+1);}
await check('all four workers are inert at automatic startup, autopilot, recovery and rollover entry points',async()=>{
 for(const name of ['autoStartDeveloperGridWorkFromChat','continueDeveloperGridAutopilot','recoverExecutionAuthorityFromHeartbeat','handleConversationRollover','requestConversationRolloverReAck','sendBootAckAcceptedContinuation','sendConversationRolloverReadyContinuation','sendExecutionAuthorityRecoveredContinuation','sendExecutionRequestRecoveryContinuation']){
  const sandbox={workflowControl:control,config:sanitizeConfig({})};vm.createContext(sandbox);vm.runInContext(extract(name)+';globalThis.run='+name,sandbox);
  for(const code of control.WORKERS){const first=name==='autoStartDeveloperGridWorkFromChat'||name==='continueDeveloperGridAutopilot'?code:name==='recoverExecutionAuthorityFromHeartbeat'||name==='handleConversationRollover'||name==='requestConversationRolloverReAck'?{workerCode:code}:{};const result=await sandbox.run(first,task,code);assert.equal(result.reason,'MANUAL_CONTROL',name+' '+code);}
 }
});
await check('manual phase report waits without server ingestion or autopilot',async()=>{
 let saved=null;const report={workerCode:'OUTMINAI',taskId:'task',sessionId:'session',stage:1,result:'PASS',summary:'Status checked'};
 const sandbox={workflowControl:control,config:sanitizeConfig({}),createHash,STAGE_REPORT_START:'REPORT',loadTaskLaunchRecords:()=>({}),processedStageReportHashes:new Set(),parseDeveloperGridStageReport:()=>({ok:true,report}),saveTaskLaunchPatch:(_t,_w,p)=>{saved=p;}};
 vm.createContext(sandbox);vm.runInContext(extract('processCapturedStageReport')+';globalThis.run=processCapturedStageReport',sandbox);
 const result=await sandbox.run({body:'REPORT status',workerCode:'OUTMINAI',task});assert.equal(result.reason,'WAITING_MANUAL_ACCEPT');assert.equal(saved.pendingStageReport.summary,report.summary);
});
await check('native send fallback retains its marker outside the injected browser script',async()=>{
 let events=0;
 const sandbox={waitForChatComposer:async()=>true,composerSelectorLiteral:()=>"[]",sendSelectorLiteral:()=>"[]",stopSelectorLiteral:()=>"[]",captureComposerDraftText:async()=>({ok:true,text:'UNIQUE_MARKER draft'}),verifyPromptMarkerInTranscript:async()=>({verified:true})};
 const view={webContents:{isDestroyed:()=>false,executeJavaScript:async()=>({sent:false,reason:'send-control-not-found'}),focus:()=>{},sendInputEvent:()=>{events++;}}};
 vm.createContext(sandbox);vm.runInContext(extract('sendPreparedChatPrompt')+';globalThis.run=sendPreparedChatPrompt',sandbox);
 const result=await sandbox.run(view,'UNIQUE_MARKER');assert.equal(result.verified,true);assert.equal(events,2);
});
await check('old execution-result marker is insufficient without the exact result text',async()=>{
 const sandbox={captureConversationTranscript:async()=>({ok:true,messages:[{role:'USER',text:'BENJADMIN_PROMPT_KIND: EXECUTION_RESULT_V1 old request'}]})};
 vm.createContext(sandbox);vm.runInContext(extract('executionResultTranscriptProof')+';globalThis.run=executionResultTranscriptProof',sandbox);
 assert.equal((await sandbox.run({},'BENJADMIN_PROMPT_KIND: EXECUTION_RESULT_V1 new request')).verified,false);
 assert.equal((await sandbox.run({},'BENJADMIN_PROMPT_KIND: EXECUTION_RESULT_V1 old request')).verified,true);
});
await check('manual IPC and actual navigation page are wired through preload',()=>{
 const preload=fs.readFileSync(source+'preload.cjs','utf8'),renderer=fs.readFileSync(source+'renderer/context-workspace.js','utf8');
 for(const channel of ['manual-control:get','manual-control:run'])assert.ok(preload.includes(channel)&&main.includes('ipcMain.handle("'+channel+'"'));
 assert.ok(renderer.includes('["manual","KÉZI VEZÉRLÉS"]'));assert.ok(renderer.includes('root.innerHTML=cardNavView()+manualControlView()'));
});
console.log('MANUAL_CONTROL_RUNTIME_PASS',count);
