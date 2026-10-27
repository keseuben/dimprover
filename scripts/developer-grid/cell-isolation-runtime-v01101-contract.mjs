import {automaticWorkflowVm} from "./automatic-workflow-test-context.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const observation=require("../../desktop/benjadmin-developer-grid/src/chatgpt/auto-work-observation.cjs");
const auto=require("../../desktop/benjadmin-developer-grid/src/chatgpt/auto-work-start.cjs");
const prompts=require("../../desktop/benjadmin-developer-grid/src/task-launch/prompt-builder.cjs");
const adapter=require("../../desktop/benjadmin-developer-grid/src/chatgpt/chatgpt-dom-adapter.cjs");
const main=fs.readFileSync("desktop/benjadmin-developer-grid/src/main.cjs","utf8");
const ui=fs.readFileSync("desktop/benjadmin-developer-grid/src/renderer/context-workspace.js","utf8");
let n=0;
async function check(label,fn){await fn();console.log("PASS",++n,label);}
const user=(id,text="Folytasd a BENJADMIN Developer Grid fejlesztést.")=>({role:"USER",messageId:id,text});
const workers=["ARMINAI","OUTMINAI","BENAI","JAZMINAI"];
const input=(code,messages,extra={})=>({workerCode:code,conversationId:"chat-"+code,messages,...extra});
await check("four restored historical commands remain inert",()=>{
 const guard=observation.createAutoWorkStartObservationGuard();
 for(const code of workers) for(let poll=0;poll<3;poll++) assert.equal(guard.observe(input(code,[user("old-"+code)])).eligible,false);
});
await check("only Benjamin's new command becomes eligible",()=>{
 const guard=observation.createAutoWorkStartObservationGuard();
 for(const code of workers)guard.observe(input(code,[user("old-"+code)]));
 const eligible=workers.filter(code=>guard.observe(input(code,[user("old-"+code),...(code==="BENAI"?[user("new-ben")]:[])],{now:1000,submissions:code==="BENAI"?[{at:900,conversationId:"chat-BENAI",text:user("new-ben").text}]:[]})).eligible);
 assert.deepEqual(eligible,["BENAI"]);
});
await check("backend Benjamin alias cannot bypass historical baseline",()=>{
 const guard=observation.createAutoWorkStartObservationGuard();
 guard.observe(input("BENAI",[user("old")],{conversationId:"same-chat"}));
 assert.equal(guard.observe(input("BENJAMINAI",[user("old")],{conversationId:"same-chat"})).eligible,false);
});
await check("assistant instructions never create a new user turn",()=>{
 const guard=observation.createAutoWorkStartObservationGuard();
 const rows=[user("old")];guard.observe(input("BENAI",rows));
 assert.equal(guard.observe(input("BENAI",[...rows,{role:"ASSISTANT",text:"Folytasd a fejlesztést."}])).eligible,false);
});
await check("navigation to another historical chat is also baselined",()=>{
 const guard=observation.createAutoWorkStartObservationGuard();
 guard.observe(input("BENAI",[user("old")]));
 assert.equal(guard.observe(input("BENAI",[user("different-old")],{conversationId:"older-chat"})).eligible,false);
});
await check("empty or missing captures do not establish a false baseline",()=>{
 const guard=observation.createAutoWorkStartObservationGuard();
 assert.equal(guard.observe(input("BENAI",[])).eligible,false);
 assert.equal(guard.observe(input("BENAI",[user("old")])).eligible,false);
});
await check("first live submit in a new chat can start without a second message",()=>{
 const guard=observation.createAutoWorkStartObservationGuard();
 const row=user("first");
 assert.equal(guard.observe(input("BENAI",[row],{now:1000,submissions:[{at:900,conversationId:"",text:row.text}]})).eligible,true);
});
await check("live submit in restored chat is not swallowed by first capture",()=>{
 const guard=observation.createAutoWorkStartObservationGuard();
 const latest=user("new");
 assert.equal(guard.observe(input("BENAI",[user("old"),latest],{now:1000,submissions:[{at:900,conversationId:"chat-BENAI",text:latest.text}]})).eligible,true);
});
await check("expired, future, different-text or different-chat submissions cannot authorize history",()=>{
 for(const row of [
  {at:1,text:user("x").text},{at:2000001,text:user("x").text},
  {at:1999999,text:"other"},{at:1999999,text:user("x").text,conversationId:"other"},
 ]){
  const guard=observation.createAutoWorkStartObservationGuard();
  assert.equal(guard.observe(input("BENAI",[user("old")],{now:2000000,submissions:[row]})).eligible,false);
 }
});
await check("late historical hydration without an actual send gesture never starts work",()=>{
 const guard=observation.createAutoWorkStartObservationGuard();
 guard.observe(input("BENAI",[user("old")]));
 assert.equal(guard.observe(input("BENAI",[user("old"),user("late-history")])).eligible,false);
});
await check("one submission cannot authorize another conversation's identical text",()=>{
 const guard=observation.createAutoWorkStartObservationGuard();
 const extra={now:1000,submissions:[{at:900,conversationId:"",text:user("x").text}]};
 assert.equal(guard.observe(input("BENAI",[user("first")],extra)).eligible,true);
 assert.equal(guard.observe(input("BENAI",[user("other")],{...extra,conversationId:"other-chat"})).eligible,false);
});
function observerFixture(){
 const listeners={};const state={};
 class Textarea {}
 const field={innerText:user("x").text,getClientRects:()=>[1],contains:node=>node===field};
 const button={closest:selector=>selector==='main form button[type="submit"]'?button:null};
 const sandbox={window:state,location:{href:"https://chatgpt.com/g/project"},URL,HTMLTextAreaElement:Textarea,Date,
 document:{querySelector:selector=>adapter.CHATGPT_SELECTORS.composer.includes(selector)?field:null,addEventListener:(name,fn)=>{listeners[name]=fn;}}};
 automaticWorkflowVm(vm).runInNewContext(observation.INSTALL_LIVE_SUBMISSION_OBSERVER_SCRIPT,sandbox);
 return {state,field,button,listeners,sandbox};
}
await check("observer records trusted Enter and send-button click",()=>{
 const f=observerFixture();
 f.listeners.keydown({isTrusted:true,type:"keydown",target:f.field,key:"Enter"});
 f.listeners.click({isTrusted:true,type:"click",target:f.button});
 assert.equal(f.state.__benjadminLiveUserSubmissions.events.length,2);
});
await check("observer ignores typing, Shift-Enter, IME and untrusted synthetic send",()=>{
 const f=observerFixture();
 for(const extra of [{key:"x"},{key:"Enter",shiftKey:true},{key:"Enter",isComposing:true},{key:"Enter",isTrusted:false}]){
  f.listeners.keydown({isTrusted:true,type:"keydown",target:f.field,...extra});
 }
 assert.equal(f.state.__benjadminLiveUserSubmissions.events.length,0);
});
await check("observer ignores machine packets and installs only once",()=>{
 const f=observerFixture();f.field.innerText="BENJADMIN_PROMPT_KIND: TASK_LAUNCH_V3\nStart build";
 f.listeners.click({isTrusted:true,type:"click",target:f.button});
 automaticWorkflowVm(vm).runInNewContext(observation.INSTALL_LIVE_SUBMISSION_OBSERVER_SCRIPT,f.sandbox);
 assert.equal(f.state.__benjadminLiveUserSubmissions.events.length,0);
});
function extract(source,start,end){const a=source.indexOf(start);const b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);}
const autoFn=extract(main,"async function autoStartDeveloperGridWorkFromChat(","\nasync function syncConversationMemoryForWorker");
await check("actual auto-start function creates exactly one task for one fresh cell",async()=>{
 const captures=new Map(workers.map(code=>[code,{ok:true,generating:false,conversationId:"chat-"+code,messages:[user("old-"+code)]}]));
 const calls=[];const prepared=[];const processed=new Set();
 const sandbox={unlocked:true,readDeviceToken:()=>"test-device",config:{benjadminBaseUrl:"https://admin.dev.dimpro.hu"},
  workerCellForCode:code=>({id:code,surfaceType:"CHATGPT"}),
  normalizeWorkerSurfaceType:x=>x,
  chatViews:new Map(workers.map(code=>[code,{code,webContents:{isDestroyed:()=>false,getURL:()=>"https://chatgpt.com/c/chat-"+code,executeJavaScript:async()=>captures.get(code).submissions || []}}])),
  chatConversationIdFromUrl:url=>url.split("/c/")[1],
  captureConversationTranscript:async view=>captures.get(view.code),
  autoWorkStartObservationGuard:observation.createAutoWorkStartObservationGuard(),
  READ_LIVE_SUBMISSIONS_SCRIPT:observation.READ_LIVE_SUBMISSIONS_SCRIPT,
  detectChatDevelopmentIntent:auto.detectChatDevelopmentIntent,createHash,
  autoWorkStartProcessedTurns:processed,autoWorkStartProcessingKeys:new Set(),
  fetchDeveloperGridActiveWork:async()=>({activeSessionTasks:[]}),activeWorkerTaskFromWork:()=>null,
  captureWorkerConversationGuards:()=>[],preserveWorkerConversationsAfterWorkStart:()=>{},
  startDeveloperGridWork:async ({input})=>{calls.push(input.preferredWorkerCode);return {task:{id:"test-task"},session:{workerCode:input.preferredWorkerCode},routingState:"ROUTED"};},
  assignedWorkerCodeFromWork:work=>work.session.workerCode,
  normalizedProofWorkerCode:code=>code==="BENAI"?"BENJAMINAI":code,
  initializeTaskChatPlan:async()=>({conversationBound:true}),
  launchTaskFromWork:work=>work.task,
  prepareWorkerTaskLaunch:async(code)=>{prepared.push(code);return {ok:true,mode:"sent"};},
  rememberAutoWorkStartTurn:key=>processed.add(key),appendChatDiagnostic:()=>{},send:()=>{},
 };
 automaticWorkflowVm(vm).createContext(sandbox);vm.runInContext(autoFn+";globalThis.run=autoStartDeveloperGridWorkFromChat;",sandbox);
 for(const code of workers)await sandbox.run(code);
 assert.deepEqual(calls,[]);assert.deepEqual(prepared,[]);
 captures.get("BENAI").messages.push(user("fresh-ben"));
 captures.get("BENAI").submissions=[{at:Date.now(),conversationId:"chat-BENAI",text:user("fresh-ben").text}];
 for(const code of workers)await sandbox.run(code);
 for(const code of workers)await sandbox.run(code);
 assert.deepEqual(calls,["BENJAMINAI"]);assert.deepEqual(prepared,["BENJAMINAI"]);
});
const pairFn=extract(main,"function centralLaunchPairForSelection(","function activeWorkerTaskFromWork");
const ben={task:{id:"ben-task"},session:{id:"ben-session",taskId:"ben-task",workerCode:"BENJAMINAI",endedAt:null,developmentContext:{surfaceConversationId:"ben-chat"}}};
const armin={task:{id:"armin-task"},session:{id:"armin-session",taskId:"armin-task",workerCode:"ARMINAI",endedAt:null}};
const active={task:armin.task,sessions:[armin.session],activeSessionTasks:[armin,ben]};
const pairContext={normalizedProofWorkerCode:code=>code==="BENAI"?"BENJAMINAI":code};
automaticWorkflowVm(vm).createContext(pairContext);vm.runInContext(pairFn+";globalThis.select=centralLaunchPairForSelection;",pairContext);
await check("Central Core exact selection beats unrelated global active task",()=>{
 assert.equal(pairContext.select(active,{taskId:"ben-task",sessionId:"ben-session",workerCode:"BENAI"}),ben);
});
await check("missing or mismatched Central Core identity fails closed",()=>{
 for(const selection of [undefined,{}, {taskId:"ben-task",sessionId:"armin-session",workerCode:"BENAI"},{taskId:"ben-task",sessionId:"ben-session",workerCode:"ARMINAI"}]) assert.equal(pairContext.select(active,selection),null);
});
await check("duplicate exact sessions are rejected",()=>{
 assert.equal(pairContext.select({...active,activeSessionTasks:[ben,ben]},{taskId:"ben-task",sessionId:"ben-session",workerCode:"BENAI"}),null);
});
const uiFn=extract(ui,"  function selectedWorkLaunchPair()","  function workStartView()");
const uiContext={state:{workStartWorkerCode:"BENJAMINAI",activeWork:active,config:{cells:[{workerCode:"BENAI",url:"https://chatgpt.com/c/ben-chat"}]}},workerUiCode:code=>code==="BENJAMINAI"?"BENAI":code};
automaticWorkflowVm(vm).createContext(uiContext);vm.runInContext(uiFn+";globalThis.select=selectedWorkLaunchPair;",uiContext);
await check("rendered resume action selects Benjamin instead of global Armin",()=>assert.equal(uiContext.select(),ben));
await check("Central Core without explicit worker cannot resume another task",()=>{uiContext.state.workStartWorkerCode="";assert.equal(uiContext.select(),null);uiContext.state.workStartWorkerCode="BENJAMINAI";});
await check("ambiguous worker sessions without matching conversation fail closed",()=>{
 uiContext.state.activeWork={activeSessionTasks:[ben,{...ben,task:{id:"other"},session:{...ben.session,id:"other-session",taskId:"other",developmentContext:{}}}]};
 uiContext.state.config={cells:[]};assert.equal(uiContext.select(),null);
});
const insertFn=extract(main,"async function insertWorkerTaskPrompt(","\nasync function captureComposerDraftText");
const prompt=prompts.TASK_LAUNCH_PROMPT_MARKER+"\nBenjáminAI, új feladat.\nTASK ID: exact-task\nSOURCE: exact-proof";
async function insertFixture(existing="",transform=text=>text.replace(/\n/g,"\n\n")){
 class Textarea {}
 const field={innerText:existing,getClientRects:()=>[1],focus:()=>{},replaceChildren:()=>{field.innerText="";},append:p=>{field.innerText=p.textContent;}};
 const sandbox={HTMLTextAreaElement:Textarea,window:{getSelection:()=>({removeAllRanges:()=>{},addRange:()=>{}})},InputEvent:class {},
 document:{querySelector:()=>field,createRange:()=>({selectNodeContents:()=>{}}),execCommand:(_command,_show,text)=>{field.innerText=transform(text);return true;}}};
 const view={webContents:{isDestroyed:()=>false,executeJavaScript:async script=>automaticWorkflowVm(vm).runInNewContext(script,sandbox)}};
 const host={waitForChatComposer:async()=>true,composerSelectorLiteral:()=>JSON.stringify(adapter.CHATGPT_SELECTORS.composer)};
 automaticWorkflowVm(vm).createContext(host);vm.runInContext(insertFn+";globalThis.run=insertWorkerTaskPrompt;",host);
 return {result:await host.run(view,prompt,prompts.TASK_LAUNCH_PROMPT_MARKER),field};
}
await check("actual insertion accepts editor newline representation across the full prompt",async()=>{
 assert.equal(prompt.replace(/\n/g,"\n\n").includes(prompt.slice(0,80)),false);
 const {result}=await insertFixture();assert.equal(result.inserted,true);assert.equal(result.verifiedMarker,true);
});
await check("existing packet for another task is never accepted from marker alone",async()=>{
 const wrong=prompt.replace("exact-task","another-task");
 const {result,field}=await insertFixture(wrong);assert.equal(result.inserted,false);assert.equal(field.innerText,wrong);
});
await check("corruption after first 80 characters also blocks insertion",async()=>{
 const {result}=await insertFixture("",text=>text.replace("exact-proof","wrong-proof"));assert.equal(result.inserted,false);
});
await check("matching complete existing packet remains idempotent",async()=>{
 const {result}=await insertFixture(prompt);assert.equal(result.inserted,true);assert.equal(result.reason,"already-present");
});
const resumeDraftFn=extract(main,"async function sendExistingOwnedTaskLaunchDraft(","\nasync function initializeTaskChatPlan");
await check("legacy current-proof draft missing original restrictions is not sent",async()=>{
 let sends=0;
 const context={captureComposerDraftText:async()=>({ok:true,text:"BENJADMIN_PROMPT_KIND: TASK_LAUNCH_V3 old packet"}),
  sendPreparedChatPrompt:async()=>{sends++;return {sent:true,verified:true};}};
 automaticWorkflowVm(vm).createContext(context);vm.runInContext(resumeDraftFn+";globalThis.run=sendExistingOwnedTaskLaunchDraft;",context);
 const result=await context.run({view:{},task:{id:"test"},workerCode:"BENAI",launchTask:{sessionId:"session",description:"Csak állapotellenőrzés. Forrásmódosítás és build tilos."},
  decision:{reason:"current-proof",identity:{kind:"TASK_LAUNCH_V3",taskId:"test",sessionId:"session",sourceProofSha256:"a".repeat(64)}}});
 assert.equal(result.ok,false);assert.equal(result.code,"OWNED_TASK_DRAFT_SOURCE_PROMPT_MISSING");assert.equal(sends,0);
});
const launchFn=extract(main,"function launchTaskFromWork(","\nfunction normalizedProofWorkerCode");
await check("launch projection preserves original restrictions from session sourcePrompt",()=>{
 const source="Állapotellenőrzés בלבד. FORRÁSMÓDOSÍTÁS TILOS; build, törlés és DB módosítás TILOS.";
 const context={assignedWorkerCodeFromWork:()=>"BENAI",normalizeWorkerSurfaceType:x=>x};
 automaticWorkflowVm(vm).createContext(context);vm.runInContext(launchFn+";globalThis.run=launchTaskFromWork;",context);
 const task=context.run({task:{id:"test",description:"stale"},session:{id:"session",developmentContext:{sourcePrompt:source}}});
 assert.equal(task.description,source);
});

// The live DEV API excludes pre-BOOT-ACK sessions without a live engine claim
// from activeSessionTasks, but retains their exact identity in allActiveSessions.
const selectableFn=extract(main,"function withSelectableDeveloperGridWork(","function centralLaunchPairForSelection");
const recoveryContext={normalizedProofWorkerCode:code=>code==="BENAI"?"BENJAMINAI":code};
automaticWorkflowVm(vm).createContext(recoveryContext);vm.runInContext(selectableFn+pairFn+";globalThis.decorate=withSelectableDeveloperGridWork;globalThis.select=centralLaunchPairForSelection;",recoveryContext);
const recoverableBen={...ben.session,
 developmentContext:{taskId:ben.task.id,projectId:"project_dimprover",moduleName:"Developer Grid V1",workItem:"Benjámin próba",surfaceConversationId:"ben-chat"},
 sourceProvenance:{taskId:ben.task.id,sessionId:ben.session.id,worker:"BENJAMINAI"},
};
await check("preboot Benjamin can be selected when engine live-pair list is empty",()=>{
 const decorated=recoveryContext.decorate({task:armin.task,sessions:[armin.session],activeSessionTasks:[],allActiveSessions:[recoverableBen]});
 assert.equal(decorated.activeSessionTasks.length,0);
 assert.equal(decorated.selectableSessionTasks.length,1);
 const pair=decorated.selectableSessionTasks[0];
 assert.equal(pair.task.id,"ben-task");assert.equal(pair.task.status,"RECOVERY_REQUIRED");assert.equal(pair.selectionRecoveryRequired,true);
 uiContext.state.activeWork=decorated;uiContext.state.config={cells:[{workerCode:"BENAI",url:"https://chatgpt.com/c/ben-chat"}]};
 assert.equal(uiContext.select().task.id,"ben-task");
});
await check("display-only recovery projection never grants live launch authority",()=>{
 const decorated=recoveryContext.decorate({activeSessionTasks:[],allActiveSessions:[recoverableBen]});
 const selection={taskId:"ben-task",sessionId:"ben-session",workerCode:"BENAI"};
 assert.equal(recoveryContext.select(decorated,selection),null);
 assert.equal(recoveryContext.select(decorated,selection,{allowRecovery:true}).selectionRecoveryRequired,true);
});
await check("mismatched recovery provenance cannot become selectable",()=>{
 for(const sourceProvenance of [{...recoverableBen.sourceProvenance,taskId:"other"},{...recoverableBen.sourceProvenance,sessionId:"other"},{...recoverableBen.sourceProvenance,worker:"ARMINAI"}]){
  assert.equal(recoveryContext.decorate({activeSessionTasks:[],allActiveSessions:[{...recoverableBen,sourceProvenance}]}).selectableSessionTasks.length,0);
 }
});
await check("live pair is retained without duplicate recovery projection",()=>{
 const live={task:ben.task,session:recoverableBen};
 const decorated=recoveryContext.decorate({activeSessionTasks:[live],allActiveSessions:[recoverableBen]});
 assert.equal(decorated.selectableSessionTasks.length,1);assert.equal(decorated.selectableSessionTasks[0],live);
});
const refreshFn=extract(ui,"  async function refresh(showLoading=true)","  function applyLayout(");
function refreshFixture(){
 const state={workStartWorkerCode:"ARMINAI",activeWork:active,snapshot:{},memory:null,workStartStatus:"",evidence:{evidence:[],summary:null}};
 const context={state,selectedWorkerSurface:()=>"CHATGPT",selectedWorkLaunchPair:()=>({task:armin.task,session:armin.session}),
  contextErrorMessage:x=>x,render:()=>{},root:{querySelector:()=>null},
  api:{getContextWorkspace:async()=>({ok:true,context:{}}),getDeveloperGridActiveWork:async()=>({ok:true,activeWork:active}),getSystemHealth:async()=>({ok:true,health:{}}),getDeveloperGridBuildRuns:async()=>({ok:true,buildRuns:{}}),getDeveloperGridWindowsE2E:async()=>({ok:true}),getDeveloperGridEvidence:async()=>({ok:true,evidence:[]}),getDeveloperGridReviewGate:async()=>({ok:true,gate:{ready:false}}),getDeveloperGridConversationMemory:async()=>({ok:true,memory:{taskId:"armin-task"}})}};
 automaticWorkflowVm(vm).createContext(context);vm.runInContext(refreshFn+";globalThis.run=refresh;",context);return context;
}
await check("old worker refresh response cannot replace newly selected worker context",async()=>{
 const context=refreshFixture();let complete;
 context.api.getContextWorkspace=()=>new Promise(resolve=>{complete=resolve;});
 const pending=context.run(false);context.state.workStartWorkerCode="BENJAMINAI";context.state.memory={taskId:"ben-task"};
 complete({ok:true,context:{}});await pending;
 assert.equal(context.state.memory.taskId,"ben-task");
});
await check("late Armin memory response cannot replace Benjamin memory after selection",async()=>{
 const context=refreshFixture();let complete,started;
 const waiting=new Promise(resolve=>{started=resolve;});
 context.api.getDeveloperGridConversationMemory=()=>new Promise(resolve=>{complete=resolve;started();});
 const pending=context.run(false);await waiting;
 context.state.workStartWorkerCode="BENJAMINAI";context.state.memory={taskId:"ben-task"};
 complete({ok:true,memory:{taskId:"armin-task"}});await pending;
 assert.equal(context.state.memory.taskId,"ben-task");
});
await check("task cards and requests resolve the same selected task/session",()=>{
 const section=ui.slice(ui.indexOf("  function memoryView()"),ui.indexOf("  function applyLayout("));
 assert.doesNotMatch(section,/const task=state\.activeWork\?\.task\|\|null/);
 assert.match(section,/const task=selectedWorkLaunchPair\(\)\?\.task\|\|null/);
 assert.match(section,/const session=selectedWorkLaunchPair\(\)\?\.session\|\|null/);
});

function ipcFixture(channel,activeWork){
 const handlers={};const calls=[];const context={
  ipcMain:{handle:(name,fn)=>{handlers[name]=fn;}},unlocked:true,config:{benjadminBaseUrl:"https://admin.dev.dimpro.hu"},readDeviceToken:()=>"test",
  fetchDeveloperGridActiveWork:async()=>activeWork,
  withSelectableDeveloperGridWork:recoveryContext.decorate,centralLaunchPairForSelection:recoveryContext.select,
  normalizedProofWorkerCode:code=>code==="BENAI"?"BENJAMINAI":code,
  assignedWorkerCodeFromWork:work=>work.session.workerCode==="BENJAMINAI"?"BENAI":work.session.workerCode,
  launchTaskFromWork:work=>({...work.task,sessionId:work.session.id}),
  recoverDeveloperGridLaunchExecution:async({input})=>{calls.push(input);return {recovery:{task:{id:input.taskId},session:{id:input.sessionId,workerCode:"ARMINAI"}}};},
  sendPreparedWorkerTaskLaunch:async(code,taskId,options)=>{calls.push({code,taskId,options});return {ok:true};},
 };
 const marker='  ipcMain.handle("'+channel+'"';
 const start=main.indexOf(marker);const end=main.indexOf('\n  ipcMain.handle(',start+marker.length);
 assert.ok(start>=0&&end>start);
 automaticWorkflowVm(vm).createContext(context);vm.runInContext(main.slice(start,end),context);
 return {context,calls,run:handlers[channel]};
}
await check("automatic recovery targets Benjamin and rejects a mismatched returned worker",async()=>{
 const activeWork={task:armin.task,sessions:[armin.session],activeSessionTasks:[],allActiveSessions:[recoverableBen]};
 const f=ipcFixture("work-start:resume-launch",activeWork);
 const result=await f.run({}, {taskId:"ben-task",sessionId:"ben-session",workerCode:"BENJAMINAI"});
 assert.equal(result.ok,false);assert.equal(result.code,"ACTIVE_TASK_RECOVERY_SESSION_REQUIRED");
 assert.equal(f.calls.length,1);assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0])),{taskId:"ben-task",sessionId:"ben-session",workerCode:"BENJAMINAI"});
});
await check("manual recovery also rejects the wrong returned worker before sending",async()=>{
 const activeWork={task:armin.task,sessions:[armin.session],activeSessionTasks:[],allActiveSessions:[recoverableBen]};
 const f=ipcFixture("work-start:send-prepared-launch",activeWork);
 const result=await f.run({}, {taskId:"ben-task",sessionId:"ben-session",workerCode:"BENJAMINAI"});
 assert.equal(result.ok,false);assert.equal(result.code,"ACTIVE_TASK_RECOVERY_IDENTITY_MISMATCH");assert.equal(f.calls.length,1);
});
await check("manual live launch sends the selected Benjamin identity instead of global Armin",async()=>{
 const f=ipcFixture("work-start:send-prepared-launch",active);
 const result=await f.run({}, {taskId:"ben-task",sessionId:"ben-session",workerCode:"BENJAMINAI"});
 assert.equal(result.ok,true);assert.equal(f.calls.length,1);assert.equal(f.calls[0].code,"BENJAMINAI");assert.equal(f.calls[0].taskId,"ben-task");assert.equal(f.calls[0].options.taskOverride.sessionId,"ben-session");
});
console.log("Developer Grid cell isolation/runtime v0.1.110 PASS "+n+"/"+n);
