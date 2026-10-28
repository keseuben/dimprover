import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source=path.join(root,'desktop/benjadmin-developer-grid/src');
const protocol=require(path.join(source,'workflow/execution-result-protocol.cjs'));
const {buildDeveloperGridExecutionResultPrompt:build}=require(path.join(source,'task-launch/execution-request.cjs'));
const {parseDeveloperGridExecutionRequest:parseRequest}=require(path.join(source,'task-launch/execution-request.cjs'));
const {matchesExecutionResultTranscript:matches}=require(path.join(source,'workflow/result-transcript.cjs'));
const {createExecutionJournal}=require(path.join(source,'workflow/execution-journal.cjs'));
const hash=s=>createHash('sha256').update(s).digest('hex');
const identity={schemaVersion:1,requestId:'req-110',taskId:'task-a',sessionId:'session-a',workerCode:'OUTMINAI',sourceProofSha256:'a'.repeat(64),action:'READ_FILE'};
const raw='\ufeffexport const label = `V${version}`;\r\n// árvíztűrő\r\n';
const payload={...identity,execution:{status:'PASS',code:'EXECUTION_READ_OK',summary:'Olvasás sikeres.',data:{rawContent:raw,fileSha256:hash(Buffer.from(raw)),fileBytes:Buffer.byteLength(raw)}}};
let count=0;async function check(name,fn){await fn();console.log('PASS',++count,name);}
const rendered=prompt=>prompt.replace(/```json\n/g,'json\nMásolás\n').replace(/\n```/g,'')+'\n…\nTöbb mutatása';
await check('actual builder preserves template backticks, BOM, CRLF and Hungarian data through rendered fenced JSON',()=>{
  const env=protocol.makeEnvelope(payload),prompt=build({...payload,resultEnvelope:env});
  assert(matches(rendered(prompt),prompt));assert.equal(protocol.parseResult(rendered(prompt)).data.rawContent,raw);
  assert.equal(protocol.parseResult(rendered(prompt)).data.fileSha256,hash(Buffer.from(raw)));
  assert(!matches(rendered(prompt).replace('`V${version}`','V${version}'),prompt));
});
await check('a result marker, copied ID, truncated JSON, changed payload or other identity never proves delivery',()=>{
  const env=protocol.makeEnvelope(payload),prompt=build({...payload,resultEnvelope:env});
  for(const bad of ['BENJADMIN_EXECUTION_RESULT_ID: '+env.resultId,prompt.slice(0,prompt.indexOf(protocol.END)),prompt.replace('task-a','task-b'),prompt.replace('árvíztűrő','changed'),prompt.replace('EXECUTION_READ_OK','WRONG')])assert(!matches(bad,prompt));
  const reordered={};for(const k of Object.keys(env).reverse())reordered[k]=env[k];
  assert(matches(protocol.START+'\n'+JSON.stringify(reordered)+'\n'+protocol.END,prompt));
});
await check('fenced WRITE_FILE request retains literal source and exact conditional hashes',()=>{
  const request={...identity,action:'WRITE_FILE',path:'components/drive/driveBuildInfo.ts',content:raw,expectedContentSha256:hash(Buffer.from(raw)),expectedFileSha256:'c'.repeat(64)};
  const renderedRequest='text\nMásolás\nBENJADMIN_EXECUTION_REQUEST_V1\n'+JSON.stringify(request)+'\nBENJADMIN_EXECUTION_REQUEST_END';
  const parsed=parseRequest(renderedRequest);assert(parsed.ok);assert.equal(parsed.request.content,raw);assert.equal(parsed.request.expectedContentSha256,request.expectedContentSha256);
});
await check('ACK binds exact task/session/worker/request/result ID/hash/proof and explicit decision',()=>{
  const e=protocol.makeEnvelope(payload),ack={schemaVersion:1,...Object.fromEntries(['taskId','sessionId','workerCode','requestId','resultId','resultSha256','sourceProofSha256'].map(k=>[k,e[k]])),decision:'ACCEPTED'};
  assert(protocol.ackMatches(ack,e));
  for(const k of ['taskId','sessionId','workerCode','requestId','resultId','resultSha256','sourceProofSha256','decision'])assert(!protocol.ackMatches({...ack,[k]:'WRONG'},e),k);
  assert(!protocol.parseAck(protocol.ACK+'\n{}'));assert(!protocol.parseAck(protocol.ACK+'\n{}\n'+protocol.ACK_END+'\n'+protocol.ACK+'\n{}\n'+protocol.ACK_END));
});
function fixture({delivery=true,ack=false,resultStatus='PASS',transport=false,action='READ_FILE',nextRequest=null}={}){
  let record={},calls=0,sends=0,current='chat-a',permission=true,clock=1000,receipts=[];
  const result={...payload,action,execution:{...payload.execution,status:resultStatus}};result.resultEnvelope=protocol.makeEnvelope(result);
  const req={...identity,action};
  const observation=()=>({delivered:delivery,deliveryMessageId:'user-result',ack:ack===true?{schemaVersion:1,...Object.fromEntries(['taskId','sessionId','workerCode','requestId','resultId','resultSha256','sourceProofSha256'].map(k=>[k,result.resultEnvelope[k]])),decision:'ACCEPTED'}:ack||null,ackMessageId:'assistant-ack',nextRequest});
  const deps={read:()=>record,patch:(_t,_w,p)=>{record={...record,...p};},execute:async()=>{calls++;if(transport)throw Error('timeout');return result;},deliver:async()=>{sends++;return {sent:delivery,verified:delivery};},observe:async()=>observation(),receipt:async input=>{receipts.push(input);return {ok:true,stage:input.stage==='DELIVERED'?'DELIVERED':'COMPLETED',workflowContinue:resultStatus==='PASS'&&input.decision==='ACCEPTED'};},lookup:async()=>transport===true?null:result,conversation:()=>current,allowed:()=>permission,running:new Set(),hash,now:()=>clock};
  const input={view:{},task:{id:identity.taskId,sessionId:identity.sessionId},workerCode:identity.workerCode,request:req,expectedProof:identity.sourceProofSha256,localMismatch:false};
  return {run:()=>createExecutionJournal(deps)(input),restart:()=>createExecutionJournal(deps)(input),input,deps,get record(){return record;},set record(r){record=r;},get calls(){return calls;},get sends(){return sends;},receipts,set delivery(v){delivery=v;},set ack(v){ack=v;},set permission(v){permission=v;},set current(v){current=v;},set transport(v){transport=v;},set clock(v){clock=v;},set nextRequest(v){nextRequest=v;}};
}
await check('DELIVERED is not ACKNOWLEDGED or COMPLETED; a next operation waits',async()=>{
  const f=fixture();assert.equal((await f.run()).reason,'WORKER_ACK_REQUIRED');assert.equal(f.record.executionBridgeState,'WAITING_ACK');assert(f.record.pendingExecutionResult.deliveredAt);assert(!f.record.lastExecutionRequestId);
  f.input.request={...identity,requestId:'req-next'};assert.equal((await f.run()).reason,'PREVIOUS_RESULT_PENDING');assert.equal(f.calls,1);
});
await check('restart after delivery accepts the exact ACK once, without another operation or message',async()=>{
  const f=fixture();await f.run();f.ack=true;assert.equal((await f.restart()).processed,true);assert.equal(f.calls,1);assert.equal(f.sends,0);assert.equal(f.record.executionBridgeState,'COMPLETED');assert(f.record.executionHistory[0].acknowledgedAt);assert.equal((await f.restart()).duplicate,true);
});
await check('uncertain delivery never floods messages, but later transcript evidence can settle it',async()=>{
  const f=fixture({delivery:false});await f.run();await f.restart();await f.restart();assert.equal(f.calls,1);assert.equal(f.sends,1);assert.equal(f.record.executionBridgeState,'DELIVERY_UNCERTAIN');
  f.delivery=true;f.ack=true;assert.equal((await f.restart()).processed,true);assert.equal(f.sends,1);assert.equal(f.calls,1);
});
await check('pause and wrong conversation do not send stored data or execute a next request',async()=>{
  const f=fixture({delivery:false});await f.run();f.permission=false;await f.restart();assert.equal(f.sends,1);assert.equal(f.calls,1);
  f.current='other-chat';f.permission=true;await f.restart();assert.equal(f.sends,1);assert.equal(f.calls,1);
});
await check('unknown write outcome is recovered read-only from server audit or remains blocked, never repeated',async()=>{
  const f=fixture({transport:true,delivery:false});f.input.request={...identity,action:'WRITE_FILE'};
  await f.run();f.clock=100000;assert.equal((await f.restart()).reason,'EXECUTION_OUTCOME_UNCERTAIN');assert.equal(f.calls,1);
});
await check('a completed server write is recovered after a lost response without issuing WRITE_FILE again',async()=>{
  const f=fixture({transport:true,delivery:false,action:'WRITE_FILE'});await f.run();assert.equal(f.calls,1);
  f.clock=100000;f.transport=false;f.delivery=true;f.ack=true;
  assert.equal((await f.restart()).processed,true);assert.equal(f.calls,1);
});
await check('restart after stored worker ACK retries only Central Core acceptance, even if the transcript ACK disappeared',async()=>{
  const f=fixture({ack:true});const real=f.deps.receipt;let lost=true;
  f.deps.receipt=async input=>{const result=await real(input);if(input.stage==='ACKNOWLEDGED'&&lost){lost=false;throw Error('response lost');}return result;};
  await f.run();assert(f.record.pendingExecutionResult.acknowledgedAt);f.ack=false;
  assert.equal((await f.restart()).processed,true);assert.equal(f.calls,1);assert.equal(f.sends,0);
});
await check('failed outcomes may finish ACK processing but never continue the workflow',async()=>{
  const f=fixture({ack:true,resultStatus:'FAIL'});assert.equal((await f.run()).workflowContinue,false);assert.equal(f.record.executionBridgeState,'COMPLETED');assert.equal(f.record.executionResultStatus,'FAIL');
  f.input.request={...identity,requestId:'req-next'};assert.equal((await f.run()).reason,'PREVIOUS_RESULT_BLOCKED');assert.equal(f.calls,1);
});
await check('worker ACK is observed only in a later ASSISTANT turn in the bound chat',async()=>{
  const main=fs.readFileSync(path.join(source,'main.cjs'),'utf8'),a=main.indexOf('async function observeExecutionResult('),b=main.indexOf('\nasync function sendExecutionResultToWorker(',a),e=protocol.makeEnvelope(payload);
  const prompt=build({...payload,resultEnvelope:e}),ack=protocol.ACK+'\n'+JSON.stringify({schemaVersion:1,...Object.fromEntries(['taskId','sessionId','workerCode','requestId','resultId','resultSha256','sourceProofSha256'].map(k=>[k,e[k]])),decision:'ACCEPTED'})+'\n'+protocol.ACK_END;
  let capture={ok:true,generating:false,conversationId:'chat-a',messages:[{role:'USER',messageId:'u',text:rendered(prompt)},{role:'USER',messageId:'bad',text:ack}]};
  const ctx={require:id=>require(path.join(source,id)),captureConversationTranscript:async()=>capture};vm.createContext(ctx);vm.runInContext(main.slice(a,b)+';globalThis.run=observeExecutionResult',ctx);
  const pending={payload:{...payload,resultEnvelope:e},conversationId:'chat-a'};
  assert(!(await ctx.run({},pending)).ack);capture.messages[1].role='ASSISTANT';assert((await ctx.run({},pending)).ack);
  capture.conversationId='other-chat';assert(!(await ctx.run({},pending)).delivered);
});

const next={...identity,requestId:'req-next',action:'READ_FILE',path:'components/drive/driveBuildInfo.ts'};
await check('ACK and next request are persisted before completion and block the next phase',async()=>{
 const f=fixture({ack:true,nextRequest:next});const receipt=f.deps.receipt;f.deps.receipt=async q=>{if(q.stage==='ACKNOWLEDGED')assert.equal(f.record.pendingExecutionResult.nextRequest.requestId,next.requestId);return receipt(q);};
 assert.equal((await f.run()).processed,true);assert.equal(f.record.queuedExecutionRequest.requestId,next.requestId);assert.equal(f.record.executionRequest,null);assert(require(path.join(source,'workflow/control.cjs')).executionPending(f.record));
});
await check('restart after lost ACK receipt response retains the same next request without another operation',async()=>{
 const f=fixture({ack:true,nextRequest:next});const real=f.deps.receipt;let lost=true;f.deps.receipt=async q=>{const r=await real(q);if(q.stage==='ACKNOWLEDGED'&&lost){lost=false;throw Error('lost acceptance');}return r;};
 await f.run();assert(f.record.pendingExecutionResult.nextRequest);f.ack=false;f.nextRequest=null;assert.equal((await f.restart()).processed,true);assert.equal(f.record.queuedExecutionRequest.requestId,next.requestId);assert.equal(f.calls,1);
});
await check('an unstarted queued request is executed normally and only once after restart',async()=>{
 const f=fixture({ack:true,nextRequest:next});await f.run();const g=fixture({ack:true});g.record=structuredClone(f.record);g.input.request=parseRequest('BENJADMIN_EXECUTION_REQUEST_V1\n'+JSON.stringify(next)+'\nBENJADMIN_EXECUTION_REQUEST_END').request;let calls=0;
 const data={...next,execution:payload.execution},e=protocol.makeEnvelope(data);g.deps.execute=async()=>{calls++;return {...data,resultEnvelope:e};};g.deps.observe=async()=>({delivered:true,ack:{schemaVersion:1,...Object.fromEntries(['taskId','sessionId','workerCode','requestId','resultId','resultSha256','sourceProofSha256'].map(k=>[k,e[k]])),decision:'ACCEPTED'}});
 assert.equal((await g.restart()).processed,true);assert.equal(g.record.queuedExecutionRequest,null);assert.equal((await g.restart()).duplicate,true);assert.equal(calls,1);
});
await check('pause preserves a queued request without allowing a different request to overtake it',async()=>{
 const f=fixture({ack:true,nextRequest:next});await f.run();f.input.request=parseRequest('BENJADMIN_EXECUTION_REQUEST_V1\n'+JSON.stringify(next)+'\nBENJADMIN_EXECUTION_REQUEST_END').request;f.permission=false;assert.equal((await f.restart()).reason,'MANUAL_PERMISSION_REQUIRED');assert(f.record.queuedExecutionRequest);assert.equal(f.calls,1);f.input.request={...next,requestId:'req-overtake'};assert.equal((await f.restart()).reason,'QUEUED_EXECUTION_REQUIRED');assert.equal(f.calls,1);
});
await check('foreign task/session/worker/proof or reused request ID in the ACK cannot authorize the next operation',async()=>{
 for(const [field,value]of [['taskId','foreign'],['sessionId','foreign'],['workerCode','ARMINAI'],['sourceProofSha256','b'.repeat(64)],['requestId',identity.requestId]]){const f=fixture({ack:true,nextRequest:{...next,[field]:value}});assert.equal((await f.run()).reason,'EXECUTION_NEXT_REQUEST_IDENTITY_MISMATCH');assert(!f.record.queuedExecutionRequest);assert(!f.record.executionHistory?.length);assert.equal(f.calls,1);}
});
await check('a failed result is acknowledged without retaining or running a next request',async()=>{
 const f=fixture({ack:true,resultStatus:'FAIL',nextRequest:next});assert.equal((await f.run()).workflowContinue,false);assert.equal(f.record.queuedExecutionRequest,null);assert.equal(f.record.executionWorkflowBlocked,true);assert.equal(f.calls,1);
});

const recover=require(path.join(source,'task-launch/execution-request.cjs')).recoverAcknowledgedNextRequest;
function legacyMessages(extra={}){const e=protocol.makeEnvelope(payload),ack={schemaVersion:1,...Object.fromEntries(['taskId','sessionId','workerCode','requestId','resultId','resultSha256','sourceProofSha256'].map(k=>[k,e[k]])),decision:'ACCEPTED',...extra};return [{role:'ASSISTANT',text:protocol.ACK+'\n'+JSON.stringify(ack)+'\n'+protocol.ACK_END+'\nBENJADMIN_EXECUTION_REQUEST_V1\n'+JSON.stringify(next)+'\nBENJADMIN_EXECUTION_REQUEST_END'},{role:'USER',text:'BENJADMIN_PROMPT_KIND: DEVELOPER_GRID_STAGE_ACTION_V1 '+identity.taskId+' '+identity.sessionId},{role:'ASSISTANT',text:'BLOCKED – a már kért fájlolvasás eredményére várok.'}];}
await check('an already accepted legacy ACK recovers its unsent next request across a later stage directive',async()=>{const f=fixture({ack:true});await f.run();assert.equal(recover(legacyMessages(),f.input.task,'OUTMINAI',f.record,identity.sourceProofSha256).requestId,next.requestId);});
await check('legacy recovery requires the exact completed result, task, session, proof and ACCEPTED decision',async()=>{const f=fixture({ack:true});await f.run();for(const extra of [{resultSha256:'b'.repeat(64)},{resultId:'res-'+'b'.repeat(64)},{requestId:'req-wrong'},{taskId:'other'},{sessionId:'other'},{workerCode:'ARMINAI'},{sourceProofSha256:'b'.repeat(64)},{decision:'REJECTED'}])assert.equal(recover(legacyMessages(extra),f.input.task,'OUTMINAI',f.record,identity.sourceProofSha256),null);});
await check('a later authoritative launch or recovery invalidates historical ACK chaining',async()=>{const f=fixture({ack:true});await f.run();for(const marker of ['TASK_LAUNCH_V3','EXECUTION_AUTHORITY_RECOVERED_V1','MANUAL_CONTINUE_V1','CONVERSATION_ROLLOVER_READY_V1']){const messages=[...legacyMessages(),{role:'USER',text:'BENJADMIN_PROMPT_KIND: '+marker+' '+identity.taskId+' '+identity.sessionId}];assert.equal(recover(messages,f.input.task,'OUTMINAI',f.record,identity.sourceProofSha256),null);}});
await check('legacy recovery cannot overwrite a live queue or replay a completed next request',async()=>{const f=fixture({ack:true});await f.run();for(const record of [{...f.record,queuedExecutionRequest:next},{...f.record,pendingExecutionResult:{}},{...f.record,executionWorkflowBlocked:true},{...f.record,executionHistory:[...f.record.executionHistory,{requestId:next.requestId,completedAt:'done',resultStatus:'PASS',workflowContinue:true}]}])assert.equal(recover(legacyMessages(),f.input.task,'OUTMINAI',record,identity.sourceProofSha256),null);});
console.log(JSON.stringify({ok:true,tests:count,scope:'V2 exact result, explicit ACK, durable restart and failure isolation',liveMutation:false}));
