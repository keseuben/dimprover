import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read=(file)=>fs.readFileSync(path.join(root,file),"utf8");
const require=createRequire(import.meta.url);
const auto=require(path.join(root,"desktop/benjadmin-developer-grid/src/chatgpt/auto-work-start.cjs"));
const main=read("desktop/benjadmin-developer-grid/src/main.cjs");
const work=read("app/lib/developer-grid/work-start.ts");
const ui=read("desktop/benjadmin-developer-grid/src/renderer/context-workspace.js");
let n=0;
function check(name,fn){fn();n+=1;console.log(`PASS ${String(n).padStart(2,"0")} ${name}`);}
const turns=(...rows)=>rows.map(([role,text],index)=>({role,messageId:`m${index+1}`,text}));

check("explicit AUTH development command triggers",()=>{
  const result=auto.detectChatDevelopmentIntent({conversationTitle:"DIMPRO AUTH Beléptetés fejlesztés",messages:turns(["USER","Kezdd el a DIMPRO AUTH fejlesztést."],["ASSISTANT","Rendben."])});
  assert.equal(result.triggered,true);assert.equal(result.moduleName,"DIMPRO AUTH Beléptetés");
});
check("terse continuation triggers inside development context",()=>{
  const result=auto.detectChatDevelopmentIntent({conversationTitle:"DIMPRO AUTH",messages:turns(["USER","Az OTP backend saját PostgreSQL-re kerüljön."],["ASSISTANT","A következő blokk a session."],["USER","oké, folytasd"])});
  assert.equal(result.triggered,true);assert.match(result.sourcePrompt,/OTP backend/);assert.match(result.sourcePrompt,/folytasd/);
});
check("terse continuation outside development context stays inert",()=>{
  const result=auto.detectChatDevelopmentIntent({conversationTitle:"Hétvégi program",messages:turns(["USER","Beszéljünk a kirándulásról."],["ASSISTANT","Rendben."],["USER","oké, folytasd"])});
  assert.equal(result.triggered,false);assert.equal(result.reason,"TERSE_WITHOUT_DEVELOPMENT_CONTEXT");
});
check("future plural discussion does not auto-start work",()=>{
  const result=auto.detectChatDevelopmentIntent({conversationTitle:"DIMPRO AUTH",messages:turns(["USER","Majd holnap folytatjuk a fejlesztést."])});
  assert.equal(result.triggered,false);
});
check("Drive module inference works",()=>assert.equal(auto.inferAutoWorkModuleName("DIMPRO Drive fejlesztés",turns(["USER","folytasd a Drive mappanézetet"])),"DIMPRO Drive"));
check("machine-only user marker is ignored",()=>{
  const result=auto.detectChatDevelopmentIntent({conversationTitle:"DIMPRO AUTH",messages:turns(["USER","BENJADMIN_EXECUTION_REQUEST_V1 start build"])});
  assert.equal(result.triggered,false);
});
check("main process monitors chat before task memory/autopilot",()=>{
  assert.match(main,/autoStartDeveloperGridWorkFromChat/);
  const loop=main.match(/for \(const code of \["ARMINAI", "OUTMINAI", "BENAI", "JAZMINAI"\]\) \{[\s\S]{0,500}?\n    \}/)?.[0]||"";
  assert.ok(loop.indexOf("autoStartDeveloperGridWorkFromChat(code)")>=0);
  assert.ok(loop.indexOf("autoStartDeveloperGridWorkFromChat(code)")<loop.indexOf("syncConversationMemoryForWorker(code)"));
});
check("auto start binds exact cell worker and existing conversation",()=>{
  assert.match(main,/backendWorkerCode = code === "BENAI" \? "BENJAMINAI" : code/);
  assert.match(main,/chatLaunchMode:"EXISTING_CHAT"/);
  assert.match(main,/preferredWorkerCode:backendWorkerCode/);
});
check("auto start requests guarded stale preboot retirement",()=>assert.match(main,/autoRetireStalePreBoot:true/));
check("auto start automatically sends launch packet",()=>assert.match(main,/prepareWorkerTaskLaunch\(launchWorkerCode, launchTask\.id, \{ autoSend:true/));
check("same active conversation resumes without duplicate task",()=>assert.match(main,/EXISTING_TASK_CONTINUES/));
check("different non-stale active task remains fail closed",()=>assert.match(main,/ACTIVE_TASK_DIFFERENT_CONVERSATION/));
check("backend retirement requires READY stage-1 preboot stale source",()=>{
  assert.match(work,/state\.task\.status !== "READY"/);
  assert.match(work,/Number\(context\.workStageIndex \|\| 1\) !== 1/);
  assert.match(work,/bootAckState/);assert.match(work,/bootAckCodingAllowed/);
  assert.match(work,/verifyCurrentSourceExecutionState\(previous\.sourceProvenance/);
});
check("backend closes stale engine session and Grid session",()=>{
  assert.match(work,/releaseSessionAtomic\(/);assert.match(work,/engineSessionId,[\s\S]{0,180}?false/);
  assert.match(work,/upsertWorkerSession\(\{ \.\.\.previous, endedAt \}\)/);
  assert.match(work,/STALE_PREBOOT_TASK_RETIRED_FOR_CHAT_AUTOSTART/);
});
check("manual Central Core composer remains fallback while AUTO is default",()=>{
  assert.match(ui,/workLaunchDispatchMode:"AUTO"/);
  assert.match(ui,/benjadminWorkLaunchDispatchAutoMigrationV01100/);
  assert.match(ui,/localStorage\.setItem\("benjadminWorkLaunchDispatchMode","AUTO"\)/);
  assert.match(ui,/KÉZI KÖZPONTI KÜLDÉS · FALLBACK/);
  assert.match(ui,/AUTOMATIKUS KÜLDÉS · ALAPÉRTELMEZETT/);
  assert.match(ui,/Automatikus Chat-to-Grid vezérlés/);
});
check("production access remains denied",()=>{assert.match(work,/productionAccess:"DENY"/);assert.match(main,/productionAccess/);});
console.log(`Developer Grid Chat-to-Grid auto work-start v0.1.100 contract PASS · ${n}/${n}`);
