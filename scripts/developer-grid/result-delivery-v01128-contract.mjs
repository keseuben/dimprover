import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const desktop=path.join(root,'desktop/benjadmin-developer-grid/src');
const protocol=require(path.join(desktop,'workflow/execution-result-protocol.cjs'));
const {buildDeveloperGridExecutionResultPrompt}=require(path.join(desktop,'task-launch/execution-request.cjs'));
const {captureExecutionResultTranscript}=require(path.join(desktop,'workflow/result-capture.cjs'));
const {createExecutionJournal}=require(path.join(desktop,'workflow/execution-journal-v2.cjs'));
const envelope=protocol.makeEnvelope({taskId:'task-128',sessionId:'session-128',workerCode:'OUTMINAI',requestId:'req-128',sourceProofSha256:'a'.repeat(64),action:'RUN_DEV_COMMAND',execution:{status:'FAIL',code:'EXECUTION_COMMAND_FAIL',summary:'LINT sikertelen.',data:{command:'LINT',exitCode:1,output:'\ufeff<p className="érték">árvíz `code` & jel</p>\r\nC:\\source\\file\n'+'x'.repeat(100000)}}});
const prompt=buildDeveloperGridExecutionResultPrompt({resultEnvelope:envelope});
let count=0;const check=async(label,fn)=>{await fn();console.log('PASS '+(++count)+' '+label);};
function surface({role='USER',cid='chat-128',collapsed=true,full=prompt,generating=false,foreign=false,buttons=1,changeConversationOnClick=false}={}){
 let clicks=0,expanded=!collapsed,currentCid=cid;
 const button={getClientRects:()=>[{}],innerText:'Több mutatása',getAttribute:()=>null,click:()=>{clicks++;expanded=true;if(changeConversationOnClick)currentCid='other-chat';}};
 const message={getAttribute:name=>name==='data-message-author-role'?role:name==='data-message-id'?'message-128':null,matches:selector=>selector==='[data-testid^="conversation-turn-"]',querySelector:()=>null,querySelectorAll:selector=>selector==='button,[role="button"]'?Array(buttons).fill(button):[],compareDocumentPosition:()=>0};
 Object.defineProperty(message,'innerText',{get:()=>expanded?full:('BENJADMIN_PROMPT_KIND: EXECUTION_RESULT_V1\nBENJADMIN_EXECUTION_RESULT_ID: '+(foreign?'res-'+ 'b'.repeat(64):envelope.resultId)+'\nBENJADMIN_EXECUTION_RESULT_V1\n{"schemaVersion":2,\n…\nTöbb mutatása')});
 const main={querySelectorAll:selector=>selector==='[data-testid^="conversation-turn-"]'?[message]:[]};
 const document={querySelector:selector=>selector==="main, [role='main']"?main:generating&&selector==='button[data-testid="stop-button"]'?button:null};
 const view={webContents:{isDestroyed:()=>false,executeJavaScript:async script=>vm.runInNewContext(script,{document,location:{get href(){return 'https://chatgpt.com/c/'+currentCid;}},URL,Date,getComputedStyle:()=>({visibility:'visible'})})}};
 return {view,clicks:()=>clicks};
}
await check('large markup-bearing failure keeps exact envelope and digest',()=>{
 assert(!protocol.serializeEnvelope(envelope).includes('<p'));
 assert(!protocol.serializeEnvelope(envelope).includes('`'));
 const decoded=protocol.parseResult(prompt);assert(protocol.verifyEnvelope(decoded));assert.deepEqual(decoded,envelope);
 assert.equal(decoded.data.output,envelope.data.output);assert.equal(decoded.status,'FAIL');
});
await check('only bound collapsed USER result expands, then full >80k payload verifies',async()=>{
 const s=surface(),captured=await captureExecutionResultTranscript(s.view,envelope,'chat-128');assert.equal(s.clicks(),1);assert.equal(captured.messages[0].role,'USER');assert(captured.messages[0].text.length>80000);assert.deepEqual(protocol.parseResult(captured.messages[0].text),envelope);
});
await check('already complete result never clicks or modifies disclosure',async()=>{const s=surface({collapsed:false});await captureExecutionResultTranscript(s.view,envelope,'chat-128');assert.equal(s.clicks(),0);});
await check('foreign conversation never clicks',async()=>{const s=surface({cid:'other-chat'});const c=await captureExecutionResultTranscript(s.view,envelope,'chat-128');assert.equal(s.clicks(),0);assert.equal(c.ok,false);});
await check('assistant quoted result never clicks',async()=>{const s=surface({role:'ASSISTANT'});await captureExecutionResultTranscript(s.view,envelope,'chat-128');assert.equal(s.clicks(),0);});
await check('foreign result marker never clicks',async()=>{const s=surface({foreign:true});await captureExecutionResultTranscript(s.view,envelope,'chat-128');assert.equal(s.clicks(),0);});
await check('ambiguous disclosure fails closed',async()=>{const s=surface({buttons:2});const c=await captureExecutionResultTranscript(s.view,envelope,'chat-128');assert.equal(s.clicks(),0);assert.equal(protocol.parseResult(c.messages[0].text),null);});
await check('generating surface is not touched',async()=>{const s=surface({generating:true});const c=await captureExecutionResultTranscript(s.view,envelope,'chat-128');assert.equal(s.clicks(),0);assert(c.generating);});
await check('navigation during disclosure is rejected by bound capture',async()=>{const s=surface({changeConversationOnClick:true});const c=await captureExecutionResultTranscript(s.view,envelope,'chat-128');assert.equal(s.clicks(),1);assert.equal(c.ok,false);});
await check('expanded altered result remains unverifiable',async()=>{const s=surface({full:prompt.replace(protocol.serializeEnvelope(envelope),protocol.serializeEnvelope({...envelope,summary:'hamis siker'}))});const c=await captureExecutionResultTranscript(s.view,envelope,'chat-128');assert.equal(s.clicks(),1);assert.equal(protocol.verifyEnvelope(protocol.parseResult(c.messages[0].text)),false);});
await check('failure receipt completes ACK lifecycle without another execution or continuation',async()=>{
 const request={schemaVersion:1,taskId:envelope.taskId,sessionId:envelope.sessionId,workerCode:'OUTMINAI',requestId:envelope.requestId,sourceProofSha256:envelope.sourceProofSha256,action:envelope.action,command:'LINT'},task={id:request.taskId,sessionId:request.sessionId};
 const ack={schemaVersion:1,...Object.fromEntries(['taskId','sessionId','workerCode','requestId','resultId','resultSha256','sourceProofSha256'].map(k=>[k,envelope[k]])),decision:'ACCEPTED'};
 let executions=0,sends=0;const stages=[];const control=require(path.join(desktop,'workflow/control.cjs')),hash=protocol.digest,key=control.requestKey(request,hash(JSON.stringify(request)));
 let record={pendingExecutionResult:{key,payload:{resultEnvelope:envelope},taskId:task.id,sessionId:task.sessionId,workerCode:'OUTMINAI',conversationId:'chat-128',sourceProofSha256:envelope.sourceProofSha256,phase:'EXECUTED',executedAt:'2026-11-04T19:00:00Z'}};
 const process=createExecutionJournal({read:()=>record,patch:(_,__,p)=>{record={...record,...p};},execute:async()=>{executions++;throw Error('must not rerun');},deliver:async()=>{sends++;},observe:async()=>({delivered:true,deliveryMessageId:'user-128',ack,ackMessageId:'assistant-128'}),receipt:async p=>{stages.push(p.stage);return {ok:true,stage:p.stage==='ACKNOWLEDGED'?'COMPLETED':'DELIVERED',workflowContinue:false};},conversation:()=> 'chat-128',allowed:()=>true,running:new Set(),hash});
 const result=await process({view:{},task,workerCode:'OUTMINAI',request,expectedProof:envelope.sourceProofSha256,localMismatch:false});
 assert.equal(executions,0);assert.equal(sends,0);assert.deepEqual(stages,['DELIVERED','ACKNOWLEDGED']);assert.equal(result.completed.resultStatus,'FAIL');assert.equal(record.executionWorkflowBlocked,true);assert.equal(record.pendingExecutionResult,null);assert.equal(record.queuedExecutionRequest,null);
});
console.log(`Grid 0.1.135 result delivery runtime PASS ${count}/${count}`);
