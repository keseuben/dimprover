import fs from "node:fs";
import assert from "node:assert/strict";

const root="/srv/dimpro-dev/worktrees/benjadmin-grid-v0168-stale-engine-recovery-20260924";
const work=fs.readFileSync(root+"/app/lib/developer-grid/work-start.ts","utf8");
const exec=fs.readFileSync(root+"/app/lib/developer-grid/execution-bridge.ts","utf8");
const main=fs.readFileSync(root+"/desktop/benjadmin-developer-grid/src/main.cjs","utf8");
const req=fs.readFileSync(root+"/desktop/benjadmin-developer-grid/src/task-launch/execution-request.cjs","utf8");
let passed=0;
function check(name,fn){fn();passed++;console.log("PASS "+String(passed).padStart(2,"0")+" "+name);}

check("recovery helper exported",()=>assert.ok(work.includes("export async function recoverDeveloperGridExecutionBridgeSession")));
check("recovery requires exact grid task",()=>assert.ok(work.includes("DEVELOPER_GRID_EXECUTION_RECOVERY_TASK_MISMATCH")));
check("recovery requires exact grid session and worker",()=>assert.ok(work.includes("DEVELOPER_GRID_EXECUTION_RECOVERY_SESSION_MISMATCH")));
check("recovery requires validated boot ack",()=>assert.ok(work.includes("bootAckState !== \"VALIDATED\"") && work.includes("bootAckCodingAllowed !== true")));
check("recovery requires ready rollover when present",()=>assert.ok(work.includes("DEVELOPER_GRID_EXECUTION_RECOVERY_ROLLOVER_NOT_READY")));
check("recovery requires exact verified central core proof",()=>assert.ok(work.includes("DEVELOPER_GRID_EXECUTION_RECOVERY_PROOF_MISMATCH") && work.includes('previousProof.authority !== "CENTRAL_CORE"')));
check("recovery recomputes stored source proof integrity",()=>assert.ok(work.includes("previousComputedProofSha256 = sourceExecutionProofSha256(previousProofBase)") && work.includes("previousComputedProofSha256 !== sourceProofSha256")));
check("recovery verifies current source state",()=>assert.ok(work.includes("verifyCurrentSourceExecutionState(session.sourceProvenance, { requireClean:false })")));
check("automatic recovery only accepts closed internal engine session",()=>assert.ok(work.includes('previousEngineSession.status !== "closed"') && work.includes("DEVELOPER_GRID_EXECUTION_RECOVERY_ENGINE_NOT_CLOSED")));
check("uses existing closed engine recovery helper",()=>assert.ok(work.includes("recoverClosedDevEngineTaskManualBridgeSession({")));
check("fresh internal engine session required",()=>assert.ok(work.includes("DEVELOPER_GRID_EXECUTION_RECOVERY_FRESH_SESSION_MISSING")));
check("same module scope reused",()=>assert.ok(work.includes('scope:[{ type:"module", key:moduleName }]')));
check("same grid session id is retained",()=>assert.ok(work.includes("gridSessionId,") && work.includes("sessionId:gridSessionId")));
check("recovered provenance must match same source",()=>assert.ok(work.includes("DEVELOPER_GRID_EXECUTION_RECOVERY_SOURCE_MISMATCH")));
check("same grid session is upserted not newly materialized",()=>{
  const a=work.indexOf("export async function recoverDeveloperGridExecutionBridgeSession");
  const b=work.indexOf("export async function recordDeveloperGridBootAck",a);
  const body=work.slice(a,b);
  assert.ok(body.includes("upsertWorkerSession(updated)"));
  assert.ok(!body.includes("materializeGridTaskSession("));
  assert.ok(!body.includes("createDevEngineTask("));
});
check("boot ack and rollover fields are preserved by spread update",()=>{
  const a=work.indexOf("export async function recoverDeveloperGridExecutionBridgeSession");
  const b=work.indexOf("export async function recordDeveloperGridBootAck",a);
  const body=work.slice(a,b);
  assert.ok(body.includes("...session.developmentContext"));
  assert.ok(!body.includes('bootAckState:"WAITING"'));
  assert.ok(!body.includes("conversationRolloverState:null"));
});
check("recovery emits central core event",()=>assert.ok(work.includes('eventType:"EXECUTION_ENGINE_SESSION_RECOVERED"')));
check("execution bridge imports recovery helper",()=>assert.ok(exec.includes("recoverDeveloperGridExecutionBridgeSession")));
check("execution bridge recovery is limited to explicit engine gate failures",()=>{
  for(const code of ["DEV_CENTER_SESSION_NOT_READY","DEV_CENTER_SESSION_LEASE_EXPIRED","DEV_CENTER_SCOPE_LOCK_REQUIRED","DEV_CENTER_WORKTREE_LEASE_REQUIRED"]) assert.ok(exec.includes(code));
});
check("execution bridge reauthorizes after recovery",()=>{
  const a=exec.indexOf("recoverDeveloperGridExecutionBridgeSession({");
  assert.ok(a>0);
  const tail=exec.slice(a,a+2500);
  assert.ok(tail.includes("authorization = await assertDevEngineOperation(engineSessionId, operation)"));
});
check("result carries fresh authoritative proof",()=>assert.ok(exec.includes("authoritativeSourceProofSha256:context.authoritativeSourceProofSha256")));
check("result carries execution recovery evidence",()=>assert.ok(exec.includes("executionSessionRecovery:context.recovery")));
check("desktop result tells worker to refresh proof",()=>assert.ok(req.includes("data.authoritativeSourceProofSha256") && req.includes("következő execution request sourceProofSha256")));
check("desktop accepts server-issued transition proof",()=>assert.ok(main.includes("executionBridgeAuthoritativeSourceProofSha256") && main.includes("acceptedProofs")));
check("primary proof resolver still prioritizes authoritative task proof",()=>{
  const a=main.indexOf("function resolvedExecutionProofSha256");
  const b=main.indexOf("function bootAckExpected",a);
  const body=main.slice(a,b);
  const p1=body.indexOf("task?.sourceProofSha256");
  const p2=body.indexOf("launchRecord?.sourceProofSha256");
  assert.ok(p1>=0 && p2>p1);
  assert.ok(!body.includes("executionBridgeAuthoritativeSourceProofSha256"));
});
check("no new grid task launch is created by recovery helper",()=>{
  const a=work.indexOf("export async function recoverDeveloperGridExecutionBridgeSession");
  const b=work.indexOf("export async function recordDeveloperGridBootAck",a);
  const body=work.slice(a,b);
  assert.ok(!body.includes("TASK_LAUNCH"));
  assert.ok(!body.includes("startDeveloperGridWork"));
});
check("prod remains deny",()=>assert.ok(work.includes('productionAccess:"DENY" as const') && exec.includes('productionAccess: "DENY" as const')));

console.log(JSON.stringify({ok:true,passed,contract:"Developer Grid v0.1.68 stale engine recovery"}));
