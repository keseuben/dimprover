import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {validateArtifact,planDriveRouting,allowedRoutingWrite} from "./dev-delivery-engine.mjs";
const require=createRequire(import.meta.url),ts=require("typescript");
process.chdir(fileURLToPath(new URL("../../",import.meta.url)));
function load(file,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>name.startsWith("node:")?require(name):deps});return exports;}
const policy=load("app/lib/developer-grid/dev-delivery-policy.ts");
let tests=0;async function check(label,fn){await fn();console.log("PASS",++tests,label);}
const session={id:"session",taskId:"task",workerCode:"OUTMINAI",endedAt:null,sourceProvenance:{head:"a".repeat(40),branch:"worker/outminai/task",sourceState:"VERIFIED",blockCode:null},developmentContext:{devDeliveryTarget:"DRIVE_DEV",projectId:"project_dimprover",moduleName:"DIMPRO Drive",workStageIndex:6,bootAckState:"VALIDATED"}};
const run={id:"build-1",taskId:"task",sessionId:"session",workerCode:"OUTMINAI",status:"PASS",exitCode:0,productionAccess:"DENY",sourceCommit:session.sourceProvenance.head,sourceBranch:session.sourceProvenance.branch,buildId:"build_id",artifactSha256:"b".repeat(64),queuedAt:"2026-10-30T08:00:00Z"};
const identity=policy.devDeliveryIdentity(session,[run]);
await check("DEV delivery is explicit and module-bound; existing build-only tasks remain build-only",()=>{
  assert.equal(policy.normalizeDevDeliveryTarget(undefined,"project_dimprover","Developer Grid V1"),"NONE");
  assert.equal(policy.normalizeDevDeliveryTarget("DRIVE_DEV","project_dimprover","DIMPRO Drive"),"DRIVE_DEV");
  for(const args of [["PROD","project_dimprover","DIMPRO Drive"],["DRIVE_DEV","foreign","DIMPRO Drive"],["DRIVE_DEV","project_dimprover","Developer Grid V1"]])assert.throws(()=>policy.normalizeDevDeliveryTarget(...args));
  assert.equal(policy.devDeliveryAllowsClosure({...session,developmentContext:{}},null),true);
});
await check("newer failed or pending builds cannot fall back to old successful artifacts",()=>{
  for(const status of ["FAIL","BLOCKED","RUNNING","QUEUED"])assert.throws(()=>policy.devDeliveryIdentity(session,[run,{...run,id:"build-2",status,queuedAt:"2026-10-30T08:01:00Z"}]));
});
await check("task, session, worker, HEAD, branch and actual exit status are mandatory",()=>{
  for(const key of ["taskId","sessionId","workerCode","sourceCommit","sourceBranch"])assert.throws(()=>policy.devDeliveryIdentity(session,[{...run,[key]:"foreign"}]));
  assert.throws(()=>policy.devDeliveryIdentity(session,[{...run,exitCode:1}]));
  for(const dc of [{devDeliveryTarget:"NONE"},{workStageIndex:5},{bootAckState:"WAITING"}])assert.throws(()=>policy.devDeliveryIdentity({...session,developmentContext:{...session.developmentContext,...dc}},[run]));
  assert.throws(()=>policy.devDeliveryIdentity({...session,endedAt:"closed"},[run]));
});
const receipt={...identity,target:"DRIVE_DEV",environment:"DEV",productionAccess:"DENY",status:"PASS_ASSISTED",browserVerification:{result:"PASS",authority:"PAIRED_OPERATOR"}};
await check("HTTP/public display is not a browser ACK or closure PASS",()=>{
  assert.equal(policy.devDeliveryAllowsClosure(session,null,identity),false);
  for(const status of ["APPROVED","STAGING","CANDIDATE_READY","PUBLIC_PENDING_BROWSER","ROLLED_BACK","BLOCKED"])assert.equal(policy.devDeliveryAllowsClosure(session,{...receipt,status},identity),false);
  assert.equal(policy.devDeliveryAllowsClosure(session,{...receipt,browserVerification:null},identity),false);
  assert.equal(policy.devDeliveryAllowsClosure(session,receipt,identity),true);
  for(const key of Object.keys(identity))assert.equal(policy.devDeliveryAllowsClosure(session,{...receipt,[key]:"stale"},identity),false);
});
await check("actual close endpoint cannot finalize a delivery task without its matching completed proof",async()=>{
  let finalized=0,delivery=null;
  const deps={...policy,readGridState:async()=>({sessions:[session],task:{id:"task"}}),getDeveloperGridTaskById:async()=>({id:"task",projectId:"project_dimprover"}),readBuildRunStore:async()=>({runs:[run]}),getDeveloperGridDevDelivery:async()=>delivery,refreshDerivedConversationMemory:async()=>({}),evaluateDeveloperGridReviewGate:async()=>({ready:true}),finalizeDevEngineTask:async()=>{finalized++;return {task:{status:"COMPLETED"}};},upsertGridTask:async()=>{},upsertWorkerSession:async()=>{},appendGridEvent:async()=>{}};
  const close=load("app/lib/developer-grid/work-close.ts",deps).closeDeveloperGridWork;
  await assert.rejects(close({taskId:"task",sessionId:"session"}),e=>e.code==="DEV_DELIVERY_CLOSURE_BLOCKED");assert.equal(finalized,0);
  delivery=receipt;await close({taskId:"task",sessionId:"session"});assert.equal(finalized,1);
});
const meta={...identity,runId:identity.buildRunId,environment:"DEV",productionAccess:"DENY",runner:{id:"build01"}},result={...meta,status:"PASS",nodeId:"build01"};
await check("artifact metadata binds original worker task and result to exact immutable bytes",()=>{
  validateArtifact(identity,meta,result);
  for(const key of ["taskId","sessionId","workerCode","sourceCommit","sourceBranch","buildId","artifactSha256","runId","environment","productionAccess"])assert.throws(()=>validateArtifact(identity,{...meta,[key]:"foreign"},result));
  assert.throws(()=>validateArtifact(identity,meta,{...result,status:"FAIL"}));
  assert.throws(()=>validateArtifact(identity,meta,{...result,nodeId:"foreign"}));
});
const start="# DIMPRO_DRIVE_DEV_CANDIDATE_18BD6E76_START",end="# DIMPRO_DRIVE_DEV_CANDIDATE_18BD6E76_END";
const block=`${start}\nserver_name drive.dev.dimpro.hu;\nproxy_pass http://127.0.0.1:3414;\nadd_header X-DIMPRO-Drive-Source "old" always;\nadd_header X-DIMPRO-Drive-Build "old" always;\nadd_header X-DIMPRO-Drive-Candidate "old" always;\nadd_header X-DIMPRO-Production-Access "DENY" always;\nserver_name drive.dev.dimpro.hu;\n${end}`;
const before="PROD_SENTINEL_BEFORE\n",after="\nOTHER_DEV_SENTINEL_AFTER";
await check("routing planner changes only the exact Drive DEV section",()=>{
  const planned=planDriveRouting(before+block+after,3460,identity,"0.9.67");assert.ok(planned.startsWith(before)&&planned.endsWith(after));assert.match(planned,/127\.0\.0\.1:3460/);assert.ok(planned.includes(identity.buildId)&&planned.includes(identity.sourceCommit));
  for(const wrong of [block.replace(end,""),block+block,block.replace("DENY","ALLOW"),block.replace("server_name drive.dev.dimpro.hu;","server_name prod.dimpro.hu;")])assert.throws(()=>planDriveRouting(wrong,3460,identity,"0.9.67"));
  assert.throws(()=>planDriveRouting(block,3414,identity,"0.9.67"));
});
await check("crash reconciliation and rollback refuse external routing changes",()=>{
  assert.equal(allowedRoutingWrite("old","old","new"),true);assert.equal(allowedRoutingWrite("new","old","new"),false);assert.throws(()=>allowedRoutingWrite("other operator's config","old","new"));
});
await check("paired device authorization is required on both actual API methods",async()=>{
  let calls=0;
  const api=load("app/api/dev/grid/dev-delivery/route.ts",{NextResponse:{json:(body,init)=>({body,status:init.status})},isChatGridDeviceAuthorized:async()=>false,advanceDeveloperGridDevDelivery:async()=>{calls++;},getDeveloperGridDevDelivery:async()=>{calls++;}});
  assert.equal((await api.GET({headers:{}})).status,401);assert.equal((await api.POST({headers:{}})).status,401);assert.equal(calls,0);
});
console.log(JSON.stringify({ok:true,tests,scope:"DEV delivery acceptance policy, real closure/API gates, artifact identity and routing crash safety",liveMutation:false}));
