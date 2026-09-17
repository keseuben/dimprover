import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const { validateStageReportAsBootAck }=require(path.join(root,"src/task-launch/stage-report.cjs"));
let checks=0;function check(label,fn){fn();checks++;console.log(`PASS ${String(checks).padStart(2,"0")} ${label}`)}
const expected={
  workerCode:"BENAI",
  taskId:"dev-task-grid-22b48c4d9bae10e22e09",
  sessionId:"grid-work-dev-task-grid-22b48c4d9bae10e22e09-benjaminai",
  branch:"worker/benjaminai/dev-task-grid-22b48c4d9bae10e22e09",
  worktree:"/srv/dimpro-dev/worktrees/worker-benjaminai-dev-task-grid-22b48c4d9bae10e22e09",
  baseHead:"eea3bbb8a08888b205728b795096cd3fb35684bf",
  sourceProofSha256:"1ac8e3b82ee0b0332690182dc72b3d29e26f8e1ecbccb5946b61a329b071690d",
};
function body(mutator=(x)=>x){
  const report={schemaVersion:1,workerCode:"BENAI",taskId:expected.taskId,sessionId:expected.sessionId,head:expected.baseHead,stage:1,result:"PASS",summary:"CENTRAL_CORE source/scope preflight VERIFIED.",evidence:[
    {kind:"TEST",status:"PASS",severity:"INFO",summary:"CENTRAL_CORE_SOURCE_PREFLIGHT_VERIFIED",attributes:{authority:"CENTRAL_CORE",proofSha256:expected.sourceProofSha256,handshake:"READY",scopeLocks:1,worktreeLeases:1,productionAccess:"DENY",codingAllowed:true}},
    {kind:"TEST",status:"PASS",severity:"INFO",summary:"Context Snapshot és Launch Packet source egyezik",attributes:{sourceConflict:false,branch:expected.branch,worktree:expected.worktree}},
  ]};
  const out=mutator(structuredClone(report))||report;
  return `BENJADMIN_STAGE_REPORT_V1\n${JSON.stringify(out)}\nBENJADMIN_STAGE_REPORT_END`;
}
check("exact Stage-1 PASS qualifies as BOOT ACK fallback",()=>{const r=validateStageReportAsBootAck(body(),expected);assert.equal(r.validated,true);assert.equal(r.parsed.codingAllowed,true);assert.equal(r.parsed.sourceProofSha256,expected.sourceProofSha256)});
check("BENAI aliases to BENJAMINAI identity",()=>{const r=validateStageReportAsBootAck(body(x=>{x.workerCode="BENJAMINAI";return x}),expected);assert.equal(r.validated,true)});
check("stage must be exactly 1",()=>{const r=validateStageReportAsBootAck(body(x=>{x.stage=2;return x}),expected);assert.equal(r.validated,false);assert.ok(r.mismatches.includes("stage"))});
check("result must be PASS",()=>{const r=validateStageReportAsBootAck(body(x=>{x.result="BLOCKED";return x}),expected);assert.equal(r.validated,false)});
check("task mismatch fails",()=>{const r=validateStageReportAsBootAck(body(x=>{x.taskId="wrong-task";return x}),expected);assert.equal(r.validated,false);assert.ok(r.mismatches.includes("taskId"))});
check("session mismatch fails",()=>{const r=validateStageReportAsBootAck(body(x=>{x.sessionId="wrong-session";return x}),expected);assert.equal(r.validated,false);assert.ok(r.mismatches.includes("sessionId"))});
check("HEAD mismatch fails",()=>{const r=validateStageReportAsBootAck(body(x=>{x.head="a".repeat(40);return x}),expected);assert.equal(r.validated,false);assert.ok(r.mismatches.includes("head"))});
check("source proof mismatch fails",()=>{const r=validateStageReportAsBootAck(body(x=>{x.evidence[0].attributes.proofSha256="b".repeat(64);return x}),expected);assert.equal(r.validated,false);assert.ok(r.mismatches.includes("centralCoreProofEvidence"))});
check("CENTRAL_CORE authority required",()=>{const r=validateStageReportAsBootAck(body(x=>{x.evidence[0].attributes.authority="LOCAL";return x}),expected);assert.equal(r.validated,false)});
check("READY handshake required",()=>{const r=validateStageReportAsBootAck(body(x=>{x.evidence[0].attributes.handshake="TASK_BOUND";return x}),expected);assert.equal(r.validated,false)});
check("scope lock required",()=>{const r=validateStageReportAsBootAck(body(x=>{x.evidence[0].attributes.scopeLocks=0;return x}),expected);assert.equal(r.validated,false)});
check("worktree lease required",()=>{const r=validateStageReportAsBootAck(body(x=>{x.evidence[0].attributes.worktreeLeases=0;return x}),expected);assert.equal(r.validated,false)});
check("PROD DENY required",()=>{const r=validateStageReportAsBootAck(body(x=>{x.evidence[0].attributes.productionAccess="ALLOW";return x}),expected);assert.equal(r.validated,false)});
check("codingAllowed true required",()=>{const r=validateStageReportAsBootAck(body(x=>{x.evidence[0].attributes.codingAllowed=false;return x}),expected);assert.equal(r.validated,false)});
check("negative evidence fails closed",()=>{const r=validateStageReportAsBootAck(body(x=>{x.evidence.push({kind:"ERROR",status:"BLOCKED",summary:"x",attributes:{}});return x}),expected);assert.equal(r.validated,false);assert.ok(r.mismatches.includes("negativeEvidence"))});
check("branch evidence must match",()=>{const r=validateStageReportAsBootAck(body(x=>{x.evidence[1].attributes.branch="wrong";return x}),expected);assert.equal(r.validated,false);assert.ok(r.mismatches.includes("sourceContextEvidence"))});
check("worktree evidence must match",()=>{const r=validateStageReportAsBootAck(body(x=>{x.evidence[1].attributes.worktree="/wrong";return x}),expected);assert.equal(r.validated,false)});
check("sourceConflict must be false",()=>{const r=validateStageReportAsBootAck(body(x=>{x.evidence[1].attributes.sourceConflict=true;return x}),expected);assert.equal(r.validated,false)});
console.log(`Developer Grid Stage-1 BOOT ACK fallback contract PASS · ${checks}/${checks}`);
