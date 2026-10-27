import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const source=fs.readFileSync('app/lib/developer-grid/work-start.ts','utf8');
const start=source.indexOf('export async function startDeveloperGridWork('),end=source.indexOf('export async function recoverDeveloperGridLaunchExecution(',start);
const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){
 const input={sourceCheckpointMode:'DISABLED',reviewedWritePaths:[],sourcePrompt:'Continue scoped development',projectId:'project_dimprover',moduleName:'Developer Grid V1',preferredWorkerCode:'BENJAMINAI',idempotencyKey:'same',chatLaunchMode:'EXISTING_CHAT',surfaceType:'CHATGPT'};
 const session={id:'grid-session',taskId:'task',workerCode:'BENJAMINAI',endedAt:null,sourceProvenance:{head:'a'.repeat(40)},developmentContext:{workStageIndex:3,bootAckState:'VALIDATED',sourceExecutionProof:{sha256:'b'.repeat(64)}}};
 const task={id:'task',projectId:input.projectId,status:'in_progress',metadata:{...input,moduleSourceBinding:{head:'a'.repeat(40)}}};
 const data={input,session,task,verifications:0};
 const sandbox={exports:{},normalizeWorkStartInput:r=>r,getDeveloperGridFoundation:async()=>({sourceProvenance:{sourceState:'VERIFIED',head:'a'.repeat(40)}}),workStartTaskId:()=>task.id,ensureDeveloperGridCodingWorkerRegistry:async()=>{},retireStalePreBootWorkerSessionForAutoStart:async()=>({retired:false}),getDevCenterEngineState:async()=>({tasks:[task]}),resolveContinuityContext:async()=>({}),readGridState:async()=>({sessions:[session],revision:4}),resolveDeveloperGridModuleSource:async()=>({head:'a'.repeat(40)}),estimateDevelopmentMinutes:()=>({minutes:5}),verifyCurrentSourceExecutionState:async(_p,options)=>{assert.equal(options,undefined,'Existing uncommitted work must not be discarded');data.verifications++;},gridTaskFromEngine:t=>({...t}),text:value=>String(value||'')};
 vm.runInNewContext(code,sandbox);return {...data,data,run:()=>sandbox.exports.startDeveloperGridWork(input)};
}
const f=fixture(),result=await f.run();assert.equal(result.reused,true);assert.equal(result.session,f.session);assert.equal(result.session.developmentContext.workStageIndex,3);assert.equal(result.session.developmentContext.bootAckState,'VALIDATED');assert.equal(f.data.verifications,1);
for(const [name,mutate]of [['checkpoint mode',f=>f.input.sourceCheckpointMode='SCOPED_GIT'],['checkpoint paths',f=>f.input.reviewedWritePaths=['components/drive/driveBuildInfo.ts']],['module',f=>f.input.moduleName='DIMPRO Drive'],['project',f=>f.input.projectId='another-project'],['worker',f=>f.session.workerCode='OUTMINAI'],['terminal task',f=>f.task.status='completed']]){const f=fixture();mutate(f);await assert.rejects(f.run(),undefined,name);}
console.log(JSON.stringify({ok:true,tests:7,scope:'idempotent-start-preserves-work-stage-and-ACK',liveMutation:false}));
