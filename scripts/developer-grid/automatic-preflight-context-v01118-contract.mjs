import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../../',import.meta.url)));
const require=createRequire(import.meta.url),root=path.resolve('desktop/benjadmin-developer-grid/src');
const main=fs.readFileSync(path.join(root,'main.cjs'),'utf8');
const {automaticPreflightPrompt}=require(path.join(root,'workflow/stage-dispatch.cjs'));
const control=require(path.join(root,'workflow/control.cjs'));
const parser=require(path.join(root,'task-launch/execution-request.cjs'));
const original='Csak a meglévő Drive-forrás olvasása, TSC, belső review és központi BUILD01 engedélyezett. Forrásírás, commit és kihelyezés tilos.';
// Real work-start GET returns a compact gridTaskFromEngine object. The original
// instruction exists only on the bound session, as observed in Windows 117.
const pair={task:{id:'task-current',title:'Drive kapupróba',status:'RUNNING',projectId:'project_dimprover',priority:90,environment:'DEV',productionAccess:'DENY',acceptance:[]},session:{id:'session-current',workerCode:'OUTMINAI',taskId:'task-current',developmentContext:{sourcePrompt:original,workStageIndex:1,bootAckState:'VALIDATED',bootAckCodingAllowed:true,surfaceConversationId:'chat-bound',sourceExecutionProof:{sha256:'b'.repeat(64)}},sourceProvenance:{head:'a'.repeat(40),sourceState:'VERIFIED'}}};
const ctx={};vm.createContext(ctx);
vm.runInContext(main.slice(main.indexOf('function authoritativeAutopilotContext('),main.indexOf('async function prepareInternalReviewFallback('))+';globalThis.context=authoritativeAutopilotContext;',ctx);
const resolve=p=>ctx.context({activeSessionTasks:[p]},'OUTMINAI');
const request={schemaVersion:1,requestId:'req-001',taskId:pair.task.id,sessionId:pair.session.id,workerCode:'OUTMINAI',sourceProofSha256:'b'.repeat(64),action:'GIT_STATUS'};
const lines=[parser.EXECUTION_REQUEST_START,JSON.stringify(request),parser.EXECUTION_REQUEST_END];
let tests=0;async function check(name,fn){await fn();console.log('PASS',++tests,name);}
await check('compact API task retains the original instruction from its exact session',()=>{const c=resolve(pair);assert.equal(c.task.sourcePrompt,original);assert.equal(c.task.sessionId,pair.session.id);const prompt=automaticPreflightPrompt(c.task,'OUTMINAI','b'.repeat(64),lines,'req-preflight-bound');assert(prompt.includes(original));assert.equal(parser.parseDeveloperGridExecutionRequest(prompt).request.action,'GIT_STATUS');assert.equal(parser.parseDeveloperGridExecutionRequest(prompt).request.requestId,'req-preflight-bound');});
await check('authoritative session instruction wins over stale display description',()=>{const p=structuredClone(pair);p.task.description='Régi feladat';const c=resolve(p),prompt=automaticPreflightPrompt(c.task,'OUTMINAI','b'.repeat(64),lines,'req-bound');assert(prompt.includes(original));assert(!prompt.includes('Régi feladat'));});
await check('another worker or task cannot supply the original scope',()=>{const other=structuredClone(pair);other.session.workerCode='ARMINAI';other.session.developmentContext.sourcePrompt='Más worker utasítása';assert.equal(ctx.context({activeSessionTasks:[other]},'OUTMINAI'),null);assert.equal(ctx.context({activeSessionTasks:[pair]},'OUTMINAI','task-other'),null);});
await check('no original instruction fails closed instead of inventing authority',()=>{const p=structuredClone(pair);delete p.session.developmentContext.sourcePrompt;assert.throws(()=>automaticPreflightPrompt(resolve(p).task,'OUTMINAI','b'.repeat(64),lines,'req-bound'),e=>e.code==='PREFLIGHT_ORIGINAL_INSTRUCTION_REQUIRED');});
function autopilotFixture(p){const record={},published=[],c={workflowControl:control,config:{workflowControlModes:{OUTMINAI:'AUTO'}},unlocked:true,readDeviceToken:()=>true,developerGridAutopilotKeys:new Set(),fetchDeveloperGridActiveWork:async()=>({activeSessionTasks:[p]}),authoritativeAutopilotContext:ctx.context,loadTaskLaunchRecords:()=>({[p.task.id]:record}),resolvedExecutionProofSha256:t=>t.sourceProofSha256,publishTaskLaunchPatch:(_t,_w,patch)=>{Object.assign(record,patch);published.push(patch);},prepareAutomaticExecutionPreflight:async(_w,context)=>{const prompt=automaticPreflightPrompt(context.task,'OUTMINAI','b'.repeat(64),lines,'req-preflight-bound');c.prompts.push(prompt);return {ok:true,mode:'sent'};},prompts:[]};vm.createContext(c);vm.runInContext(main.slice(main.indexOf('async function continueDeveloperGridAutopilot('),main.indexOf('async function syncConversationMemoryOnce('))+';globalThis.run=continueDeveloperGridAutopilot;',c);return {c,record,published};}
await check('actual autopilot reaches preflight using the real compact API shape',async()=>{const {c}=autopilotFixture(pair);assert.equal((await c.run('OUTMINAI')).ok,true);assert.equal(c.prompts.length,1);assert(c.prompts[0].includes(original));assert.equal(c.developerGridAutopilotKeys.size,0);});
await check('preflight preparation failure is persisted and visible, no operation is sent',async()=>{const p=structuredClone(pair);delete p.session.developmentContext.sourcePrompt;const {c,record}=autopilotFixture(p);const result=await c.run('OUTMINAI');assert.equal(result.state,'BLOCKED');assert.equal(record.autopilotErrorCode,'PREFLIGHT_ORIGINAL_INSTRUCTION_REQUIRED');assert.match(record.autopilotError,/eredeti feladatutasítás hiányzik/);assert.equal(c.prompts.length,0);assert.equal(c.developerGridAutopilotKeys.size,0);});
console.log(JSON.stringify({ok:true,tests,scope:'real API task/session instruction propagation and honest automatic preflight failure',liveMutation:false}));
