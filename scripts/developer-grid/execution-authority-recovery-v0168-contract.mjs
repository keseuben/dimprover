
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = "/srv/dimpro-dev/worktrees/benjadmin-grid-v0168-engine-session-recovery-20260924";
const read = (p) => fs.readFileSync(path.join(root,p),"utf8");
const workStart = read("app/lib/developer-grid/work-start.ts");
const route = read("app/api/dev/grid/work-start/route.ts");
const types = read("app/lib/developer-grid/types.ts");
const client = read("desktop/benjadmin-developer-grid/src/context-workspace/context-workspace-client.cjs");
const main = read("desktop/benjadmin-developer-grid/src/main.cjs");
const pkg = JSON.parse(read("desktop/benjadmin-developer-grid/package.json"));

let passed=0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("PASS", String(passed).padStart(2,"0"), name);
}
const start = workStart.indexOf("export async function recoverDeveloperGridExecutionAuthority");
const end = workStart.indexOf("export async function recordDeveloperGridBootAck", start);
assert.ok(start >= 0 && end > start);
const recovery = workStart.slice(start,end);

check("version is 0.1.68",()=>{ assert.equal(pkg.version,"0.1.68"); assert.match(types,/0\.1\.68-dev/); });
check("recovery requires explicit task session worker and proof",()=>{
  for (const token of ["rawInput.taskId","rawInput.sessionId","rawInput.workerCode","rawInput.sourceProofSha256"]) assert.ok(recovery.includes(token),token);
});
check("recovery selects exact active Grid session",()=>{
  assert.ok(recovery.includes("item.id === gridSessionId"));
  assert.ok(recovery.includes("item.taskId === taskId"));
  assert.ok(recovery.includes("item.endedAt === null"));
  assert.ok(recovery.includes("routableWorkerCode(item.workerCode) === workerCode"));
});
check("BOOT ACK must remain validated and coding allowed",()=>{
  assert.ok(recovery.includes('bootAckState !== "VALIDATED"'));
  assert.ok(recovery.includes("bootAckCodingAllowed !== true"));
  assert.ok(recovery.includes('bootAckState:"VALIDATED"'));
  assert.ok(recovery.includes("bootAckCodingAllowed:true"));
});
check("rollover must be READY when present",()=>{
  assert.ok(recovery.includes('rolloverState !== "READY"'));
  assert.ok(recovery.includes("DEVELOPER_GRID_EXECUTION_AUTHORITY_ROLLOVER_NOT_READY"));
});
check("previous Central Core proof is recomputed and must equal request proof",()=>{
  assert.ok(recovery.includes("sourceExecutionProofSha256(previousProofBase)"));
  assert.ok(recovery.includes("expectedPreviousProofSha256"));
  assert.ok(recovery.includes('previousProof.authority !== "CENTRAL_CORE"'));
  assert.ok(recovery.includes('previousProof.handshakeStage !== "READY"'));
  assert.ok(recovery.includes('previousProof.productionAccess !== "DENY"'));
});
check("current source is verified against physical worktree",()=>{
  assert.ok(recovery.includes("verifyCurrentSourceExecutionState(session.sourceProvenance, { requireClean:false })"));
  assert.ok(recovery.includes('sourceProvenance.sourceState !== "VERIFIED"'));
});
check("Dev Center task is resolved by explicit taskId not implicit Grid pointer",()=>{
  assert.ok(recovery.includes("engineState.tasks.find((item) => item.id === taskId)"));
  assert.ok(recovery.includes("state.task?.id === taskId"));
  assert.ok(recovery.includes("gridTaskFromEngine(engineTask"));
});
check("only closed engine session triggers manual bridge recovery",()=>{
  assert.ok(recovery.includes('previousEngineSession.status === "closed"'));
  assert.ok(recovery.includes("recoverClosedDevEngineTaskManualBridgeSession"));
  assert.ok(recovery.includes("closedSessionId"));
  assert.ok(recovery.includes("expectedWorkerCode:workerCode"));
});
check("non-active non-closed engine session fails closed",()=>{
  assert.ok(recovery.includes('previousEngineSession.status !== "active"'));
  assert.ok(recovery.includes("DEVELOPER_GRID_EXECUTION_AUTHORITY_ENGINE_STATE_DENIED"));
});
check("fresh execution reuses same Grid task session head and module scope",()=>{
  assert.ok(recovery.includes("taskId,"));
  assert.ok(recovery.includes("gridSessionId,"));
  assert.ok(recovery.includes("baseHead:sourceHead"));
  assert.ok(recovery.includes('scope:[{ type:"module", key:moduleName }]'));
});
check("recovered provenance must equal authoritative repository worktree branch head",()=>{
  for (const key of ["repository","worktree","branch","head"]) assert.ok(recovery.includes("ready.provenance."+key+" !== expected."+key),key);
});
check("same Grid WorkerSession is upserted; no new Grid task/session materialization",()=>{
  assert.ok(recovery.includes("upsertWorkerSession(updatedSession)"));
  assert.ok(!recovery.includes("materializeGridTaskSession("));
  assert.ok(!recovery.includes("createDevEngineTask("));
  assert.ok(!recovery.includes("startDeveloperGridWork("));
  assert.ok(!recovery.includes("upsertGridTask("));
});
check("recovery event records old and fresh proof",()=>{
  assert.ok(recovery.includes("EXECUTION_AUTHORITY_RECOVERED"));
  assert.ok(recovery.includes("previousSourceProofSha256:expectedPreviousProofSha256"));
  assert.ok(recovery.includes("sourceProofSha256:ready.proof.sha256"));
});
check("route exposes explicit RECOVER_EXECUTION_AUTHORITY action",()=>{
  assert.ok(route.includes('action === "RECOVER_EXECUTION_AUTHORITY"'));
  assert.ok(route.includes("recoverDeveloperGridExecutionAuthority(body as Record<string, unknown>)"));
});
check("desktop client sends exact identity payload",()=>{
  assert.ok(client.includes('action:"RECOVER_EXECUTION_AUTHORITY", ...(input || {})'));
  assert.ok(main.includes("taskId,"));
  assert.ok(main.includes("sessionId,"));
  assert.ok(main.includes("workerCode:normalizedWorkerCode"));
  assert.ok(main.includes("sourceProofSha256:previousProofSha256"));
});
check("desktop prefers exact recovery task/session over singleton activeWork pointer",()=>{
  assert.ok(main.includes("const recoverySession = recovery?.session || null"));
  assert.ok(main.includes("const recoveryTask = recovery?.task || null"));
  assert.ok(main.includes("const refreshedSession = recoverySession || activeWorkSession"));
});
check("old v0.1.67 SENT rollover is incomplete without V0168 authority",()=>{
  assert.ok(main.includes('readyAuthorityVersion === "V0168"'));
  assert.ok(main.includes('authorityVersion === "V0168"'));
});
check("already-SENT rollover gets dedicated recovery control marker",()=>{
  assert.ok(main.includes("BENJADMIN_PROMPT_KIND: EXECUTION_AUTHORITY_RECOVERED_V1"));
  assert.ok(main.includes("sendExecutionAuthorityRecoveredContinuation"));
  assert.ok(main.includes('hadPriorReadyContinuation = readyState === "SENT"'));
});
check("recovery prompt carries fresh proof and exactly one GIT_STATUS request",()=>{
  assert.ok(main.includes('requestId:"req-auth-" + proofSha256.slice(0,12)'));
  assert.ok(main.includes('sourceProofSha256:proofSha256'));
  assert.ok(main.includes('action:"GIT_STATUS"'));
  assert.ok(main.includes("EXECUTION_REQUEST_START"));
  assert.ok(main.includes("EXECUTION_REQUEST_END"));
});
check("recovery prompt explicitly forbids new Grid task session worktree TASK_LAUNCH",()=>{
  assert.ok(main.includes("No new Grid task, Grid session, worktree or TASK_LAUNCH was created."));
  assert.ok(main.includes("Direct DIMPROVER VPS MCP, VPS shell or raw shell remains forbidden"));
});
check("local fresh proof acceptance is narrowly bound to V0168 task session and source head",()=>{
  assert.ok(main.includes('executionAuthorityRecoveryVersion || "").toUpperCase() === "V0168"'));
  assert.ok(main.includes("executionAuthorityTaskId"));
  assert.ok(main.includes("executionAuthoritySessionId"));
  assert.ok(main.includes("executionAuthoritySourceHead"));
  assert.ok(main.includes("const expectedProof = recoveredProofBound ? recoveredProof : resolvedExecutionProofSha256(task)"));
});
check("recovery metadata is persisted on same launch record",()=>{
  for (const token of ["executionAuthorityRecoveryVersion","executionAuthorityProofSha256","executionAuthorityEngineSessionId","executionAuthorityRecoveredFromEngineSessionId"]) assert.ok(main.includes(token),token);
});
check("PROD stays denied",()=>{
  assert.ok(recovery.includes('productionAccess:"DENY" as const'));
  assert.ok(main.includes("DEV ONLY - PROD DENY."));
});

console.log(JSON.stringify({ok:true,passed,contract:"BENJADMIN Developer Grid v0.1.68 execution authority recovery"}));
