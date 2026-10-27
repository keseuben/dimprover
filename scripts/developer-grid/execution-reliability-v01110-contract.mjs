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
function fixture({delivery=true,ack=false,resultStatus='PASS',transport=false,action='READ_FILE'}={}){
  let record={},calls=0,sends=0,current='chat-a',permission=true,clock=1000,receipts=[];
  const result={...payload,action,execution:{...payload.execution,status:resultStatus}};result.resultEnvelope=protocol.makeEnvelope(result);
  const req={...identity,action};
  const observation=()=>({delivered:delivery,deliveryMessageId:'user-result',ack:ack===true?{schemaVersion:1,...Object.fromEntries(['taskId','sessionId','workerCode','requestId','resultId','resultSha256','sourceProofSha256'].map(k=>[k,result.resultEnvelope[k]])),decision:'ACCEPTED'}:ack||null,ackMessageId:'assistant-ack'});
  const deps={read:()=>record,patch:(_t,_w,p)=>{record={...record,...p};},execute:async()=>{calls++;if(transport)throw Error('timeout');return result;},deliver:async()=>{sends++;return {sent:delivery,verified:delivery};},observe:async()=>observation(),receipt:async input=>{receipts.push(input);return {ok:true,stage:input.stage==='DELIVERED'?'DELIVERED':'COMPLETED',workflowContinue:resultStatus==='PASS'&&input.decision==='ACCEPTED'};},lookup:async()=>transport===true?null:result,conversation:()=>current,allowed:()=>permission,running:new Set(),hash,now:()=>clock};
  const input={view:{},task:{id:identity.taskId,sessionId:identity.sessionId},workerCode:identity.workerCode,request:req,expectedProof:identity.sourceProofSha256,localMismatch:false};
  return {run:()=>createExecutionJournal(deps)(input),restart:()=>createExecutionJournal(deps)(input),input,deps,get record(){return record;},set record(r){record=r;},get calls(){return calls;},get sends(){return sends;},receipts,set delivery(v){delivery=v;},set ack(v){ack=v;},set permission(v){permission=v;},set current(v){current=v;},set transport(v){transport=v;},set clock(v){clock=v;}};
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
console.log(JSON.stringify({ok:true,tests:count,scope:'V2 exact result, explicit ACK, durable restart and failure isolation',liveMutation:false}));
