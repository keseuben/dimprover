import {automaticWorkflowVm} from "./automatic-workflow-test-context.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { promisify } from "node:util";
const require=createRequire(import.meta.url);
const ts=require("typescript");
const source=fs.readFileSync("app/lib/developer-grid/execution-bridge.ts","utf8");
const compiled=ts.transpileModule(source+"\nexport const runtimeTest={validateContext,cleanRel,assertReadableScope,assertWritablePath,buildScopePlan};",{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText;
let count=0;
async function check(label,fn){await fn();console.log("PASS",++count,label);}
const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
function fixture() {
  const root="/srv/dimpro-dev/worktrees/test-grid";
  const head="a".repeat(40), branch="worker/benjaminai/test";
  const proof={schemaVersion:1,state:"VERIFIED",authority:"CENTRAL_CORE",verifiedAt:"2026-10-23T12:00:00Z",
    repository:"/srv/dimpro-dev/repositories/dimprover.git",worktree:root,branch,head,engineSessionId:"engine-test",
    handshakeStage:"READY",activeScopeLockCount:1,activeWorktreeLeaseCount:1,productionAccess:"DENY"};
  proof.sha256=digest(proof);
  const session={id:"grid-test",taskId:"task-test",workerCode:"BENJAMINAI",endedAt:null,
    developmentContext:{bootAckState:"VALIDATED",bootAckCodingAllowed:true,sourceExecutionProof:proof,engineSessionId:"engine-test",sourcePrompt:"Drive fejlesztés",moduleName:"Drive"},
    sourceProvenance:{worktree:root,head,branch,sourceState:"VERIFIED"}};
  return {task:{id:"task-test",projectId:"project_dimprover",title:"Drive",status:"RUNNING",environment:"DEV",productionAccess:"DENY"},
    engineTask:{id:"task-test",claimedBySessionId:"engine-test",assignedWorkerId:"worker_benjaminai",projectId:"project_dimprover",status:"in_progress"},
    state:{sessions:[session]}, authorization:{session:{id:"engine-test",taskId:"task-test",workerId:"worker_benjaminai",projectId:"project_dimprover",worktreePath:root,branchName:branch},environment:{kind:"DEV"}},
    input:{schemaVersion:1,requestId:"request-test",taskId:"task-test",sessionId:"grid-test",workerCode:"BENAI",sourceProofSha256:proof.sha256,action:"GIT_STATUS"},
    root,head,branch,engineError:null,gitError:false};
}
function load(data) {
  const calls=[];
  const execFile=()=>{throw new Error("unexpected real process");};
  execFile[promisify.custom]=async(file,args)=>{
    calls.push({file,args});
    return {stdout:args.includes("ls-files")?(data.tracked||""):data.gitError?"invalid":args.includes("rev-parse")?data.head:data.branch,stderr:""};
  };
  const stubs={
    "./reviewed-write-scope":{normalizeReviewedWritePaths:()=>[],boundReviewedWritePaths:()=>[]},
    "@/config/developer-grid-module-sources.json":data.catalog||{sources:[]},
    "./task-operation-lock":{withDeveloperGridTaskOperation:async(_id,fn)=>fn()},
    "node:child_process":{execFile},
    "node:fs/promises":{realpath:async root=>root,lstat:async()=>{if(data.missingPath)throw Object.assign(new Error("missing"),{code:"ENOENT"});return {isSymbolicLink:()=>false};},stat:async()=>({})},
    "@/app/lib/dev-center/ai-worker/scope-analyzer":{analyzeTechnicalScope:async()=>({candidates:[{path:"app/drive/page.tsx",decision:"AUTO_APPROVED",riskLevel:"GREEN"}]})},
    "@/app/lib/dev-center/ai-worker/scope-policy":{classifyScopePath:rel=>data.policy?data.policy(rel):rel.includes(".env")?({decision:"DENIED",riskLevel:"RED",reasons:[]}):({decision:"AUTO_APPROVED",riskLevel:"GREEN",reasons:[]})},
    "@/app/lib/dev-center/engine-repository":{getDevCenterEngineState:async()=>({tasks:data.engineTask?[data.engineTask]:[]}),assertDevEngineOperation:async(id,operation)=>{calls.push({id,operation});if(data.engineError)throw Object.assign(new Error(data.engineError),{code:data.engineError});return data.authorization;}},
    "./work-start":{getDeveloperGridTaskById:async id=>data.task?.id===id?data.task:null},
    "./state-store":{readGridState:async()=>data.state},
  };
  const sandbox={exports:{},require:id=>Object.hasOwn(stubs,id)?stubs[id]:require(id),process:{env:{}},Buffer,console};
  automaticWorkflowVm(vm).runInNewContext(compiled,sandbox,{filename:"execution-bridge.ts"});
  return {...sandbox.exports.runtimeTest,calls};
}
function resign(data) {
  const proof=data.state.sessions[0].developmentContext.sourceExecutionProof;
  const base={...proof};delete base.sha256;
  proof.sha256=digest(base);data.input.sourceProofSha256=proof.sha256;
}
async function blocked(label,mutate,code) {
  await check(label,async()=>{const data=fixture();mutate(data);const bridge=load(data);
    await assert.rejects(()=>bridge.validateContext(data.input),error=>error.code===code);
    assert.equal(bridge.calls.filter(c=>c.file && c.file!=="/usr/bin/git").length,0);
  });
}
await check("valid exact session accepts desktop worker alias",async()=>{
  const data=fixture(),bridge=load(data),context=await bridge.validateContext(data.input);
  assert.equal(context.taskId,"task-test");assert.equal(context.worker,"BENJAMINAI");assert.equal(context.root,data.root);
  assert.equal(bridge.calls.find(c=>c.id)?.operation,"write");
});
await check("non-primary active session remains executable",async()=>{
  const data=fixture();data.state.task={id:"another-primary"};data.state.sessions.unshift({id:"other",taskId:"another-primary",endedAt:null});
  assert.equal((await load(data).validateContext(data.input)).taskId,"task-test");
});
await blocked("missing exact task denied",d=>{d.task=null;},"EXECUTION_ACTIVE_WORK_MISMATCH");
await blocked("ended Grid session denied",d=>{d.state.sessions[0].endedAt="2026-10-23";},"EXECUTION_ACTIVE_WORK_MISMATCH");
await blocked("cross-task Grid session denied",d=>{d.state.sessions[0].taskId="other";},"EXECUTION_ACTIVE_WORK_MISMATCH");
await blocked("wrong worker denied",d=>{d.input.workerCode="ARMINAI";},"EXECUTION_WORKER_MISMATCH");
await blocked("missing BOOT ACK denied",d=>{d.state.sessions[0].developmentContext.bootAckState="WAITING";},"EXECUTION_BOOT_ACK_REQUIRED");
await blocked("coding permission false denied",d=>{d.state.sessions[0].developmentContext.bootAckCodingAllowed=false;},"EXECUTION_BOOT_ACK_REQUIRED");
await blocked("proof mismatch denied",d=>{d.input.sourceProofSha256="b".repeat(64);},"EXECUTION_SOURCE_PROOF_MISMATCH");
await blocked("proof content tampering denied",d=>{d.state.sessions[0].developmentContext.sourceExecutionProof.head="b".repeat(40);},"EXECUTION_SOURCE_PROOF_MISMATCH");
await blocked("foreign proof authority denied",d=>{d.state.sessions[0].developmentContext.sourceExecutionProof.authority="WORKER";resign(d);},"EXECUTION_SOURCE_PROOF_MISMATCH");
await blocked("proof without PROD DENY denied",d=>{d.state.sessions[0].developmentContext.sourceExecutionProof.productionAccess="ALLOW";resign(d);},"EXECUTION_SOURCE_PROOF_MISMATCH");
await blocked("proof for other branch denied",d=>{d.state.sessions[0].developmentContext.sourceExecutionProof.branch="worker/other";resign(d);},"EXECUTION_SOURCE_PROOF_MISMATCH");
await blocked("proof for other HEAD denied",d=>{d.state.sessions[0].developmentContext.sourceExecutionProof.head="b".repeat(40);resign(d);},"EXECUTION_SOURCE_PROOF_MISMATCH");
await blocked("proof for other worktree denied",d=>{d.state.sessions[0].developmentContext.sourceExecutionProof.worktree=d.root+"-other";resign(d);},"EXECUTION_SOURCE_PROOF_MISMATCH");
await blocked("other engine session proof denied",d=>{d.state.sessions[0].developmentContext.sourceExecutionProof.engineSessionId="other-engine";resign(d);},"EXECUTION_WORKTREE_BINDING_MISMATCH");
await blocked("missing authoritative engine task denied",d=>{d.engineTask=null;},"EXECUTION_ENGINE_OWNERSHIP_MISMATCH");
await blocked("task claimed by another engine session denied",d=>{d.engineTask.claimedBySessionId="other-engine";},"EXECUTION_ENGINE_OWNERSHIP_MISMATCH");
await blocked("task assigned to another worker denied",d=>{d.engineTask.assignedWorkerId="worker_arminai";},"EXECUTION_ENGINE_OWNERSHIP_MISMATCH");
await blocked("engine task from another project denied",d=>{d.engineTask.projectId="other-project";},"EXECUTION_ENGINE_OWNERSHIP_MISMATCH");
await blocked("completed engine task denied",d=>{d.engineTask.status="completed";},"EXECUTION_ENGINE_OWNERSHIP_MISMATCH");
await blocked("other engine task denied",d=>{d.authorization.session.taskId="other-task";},"EXECUTION_ENGINE_BINDING_MISMATCH");
await blocked("other engine worker denied",d=>{d.authorization.session.workerId="worker_arminai";},"EXECUTION_ENGINE_BINDING_MISMATCH");
await blocked("other engine project denied",d=>{d.authorization.session.projectId="other-project";},"EXECUTION_ENGINE_BINDING_MISMATCH");
await blocked("PRODUCTION engine environment denied",d=>{d.authorization.environment.kind="PRODUCTION";},"EXECUTION_ENGINE_BINDING_MISMATCH");
await blocked("other engine worktree denied",d=>{d.authorization.session.worktreePath=d.root+"-other";},"EXECUTION_WORKTREE_BINDING_MISMATCH");
await blocked("other engine branch denied",d=>{d.authorization.session.branchName="worker/other";},"EXECUTION_SOURCE_PROOF_MISMATCH");
await blocked("actual Git HEAD drift denied",d=>{d.head="b".repeat(40);},"EXECUTION_SOURCE_STALE");
await blocked("unverified provenance denied",d=>{d.state.sessions[0].sourceProvenance.sourceState="BLOCKED";},"EXECUTION_SOURCE_PROOF_MISMATCH");
await blocked("terminal task denied",d=>{d.task.status="COMPLETED";},"EXECUTION_TASK_DENIED");
await blocked("non DEV task denied",d=>{d.task.environment="PROD";},"EXECUTION_TASK_DENIED");
for(const code of ["DEV_CENTER_SESSION_NOT_READY","DEV_CENTER_SCOPE_LOCK_REQUIRED","DEV_CENTER_WORKTREE_LEASE_REQUIRED","DEV_CENTER_SESSION_LEASE_EXPIRED"]) {
  await blocked("engine refusal is preserved: "+code,d=>{d.engineError=code;},code);
}
await check("traversal and internal paths fail closed",()=>{
  const bridge=load(fixture());
  for(const p of ["../secrets","x/../../secrets",".git/config","node_modules/file",".next/cache"]) assert.throws(()=>bridge.cleanRel(p),error=>["EXECUTION_PATH_ESCAPE","EXECUTION_INTERNAL_PATH_DENIED"].includes(error.code));
});
await check("read outside analyzed scope denied",()=>{
  assert.throws(()=>load(fixture()).assertReadableScope("app/auth/page.tsx",{readablePaths:["app/drive/page.tsx"]}),error=>error.code==="EXECUTION_SCOPE_DENIED");
});
await check("new file outside approved directory denied",async()=>{
  const data=fixture();data.missingPath=true;const bridge=load(data);
  await assert.rejects(()=>bridge.assertWritablePath(data.root,"app/auth/new.tsx",{writablePaths:["app/drive/page.tsx"]}),error=>error.code==="EXECUTION_NEW_FILE_SCOPE_DENIED");
});
await check("registered module files become readable without widening write scope",async()=>{
 const data=fixture();data.catalog={sources:[{projectId:"project_dimprover",modules:["Drive"],readRoots:["app/lib/drive"]}]};data.tracked="app/lib/drive/receipt.ts\0app/lib/drive/.env\0";
 const bridge=load(data),scope=await bridge.buildScopePlan({root:data.root,projectId:"project_dimprover",moduleName:"Drive",taskTitle:"Drive",sourcePrompt:"Drive"});
 assert(scope.readablePaths.includes("app/lib/drive/receipt.ts"));assert(!scope.writablePaths.includes("app/lib/drive/receipt.ts"));assert(!scope.readablePaths.includes("app/lib/drive/.env"));
});
await check("other project does not inherit module read scope",async()=>{
 const data=fixture();data.catalog={sources:[{projectId:"project_dimprover",modules:["Drive"],readRoots:["app/lib/drive"]}]};data.tracked="app/lib/drive/receipt.ts\0";
 const bridge=load(data),scope=await bridge.buildScopePlan({root:data.root,projectId:"other",moduleName:"Drive",taskTitle:"Drive",sourcePrompt:"Drive"});assert(!scope.readablePaths.includes("app/lib/drive/receipt.ts"));
});
await check("exact reviewed YELLOW file is writable while another YELLOW file stays denied",async()=>{
 const data=fixture();data.policy=()=>({decision:"NEEDS_REVIEW",riskLevel:"YELLOW",reasons:[]});const bridge=load(data);
 const rel="app/lib/drive/receipt.ts",scope={writablePaths:[],reviewedWritePaths:[rel]};
 await bridge.assertWritablePath(data.root,rel,scope);
 await assert.rejects(()=>bridge.assertWritablePath(data.root,"app/lib/drive/other.ts",scope),e=>e.code==="EXECUTION_SCOPE_REVIEW_REQUIRED");
});
await check("reviewed file approval never overrides RED denial",async()=>{
 const data=fixture();data.policy=()=>({decision:"DENIED",riskLevel:"RED",reasons:[]});const bridge=load(data),rel="app/lib/drive/.env";
 await assert.rejects(()=>bridge.assertWritablePath(data.root,rel,{writablePaths:[],reviewedWritePaths:[rel]}),e=>e.code==="EXECUTION_RED_PATH_DENIED");
});
console.log("Execution Bridge runtime security PASS · "+count+"/"+count);
