#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync("desktop/benjadmin-developer-grid/src/main.cjs","utf8");
const parser = fs.readFileSync("desktop/benjadmin-developer-grid/src/task-launch/execution-request.cjs","utf8");
let n=0;
const check=(label,fn)=>{fn();n++;console.log("PASS "+String(n).padStart(2,"0")+" "+label)};

check("legacy proofless request remains parser-invalid",()=>assert.match(parser,/EXECUTION_REQUEST_IDENTITY_INVALID/));
check("recovery has dedicated control marker",()=>assert.match(main,/BENJADMIN_PROMPT_KIND: EXECUTION_REQUEST_RECOVERY_V1/));
check("recovery requires exact parser identity failure",()=>assert.match(main,/EXECUTION_REQUEST_IDENTITY_INVALID/));
check("recovery requires validated BOOT ACK",()=>assert.match(main,/ackState !== "VALIDATED"/));
check("recovery requires authoritative 64-char proof",()=>assert.match(main,/proofSha256/));
check("recovery candidate requires same task session worker",()=>{
  assert.match(main,/row\.taskId/);
  assert.match(main,/row\.sessionId/);
  assert.match(main,/actualWorker !== expectedWorker/);
});
check("recovery only accepts empty proof",()=>{assert.match(main,/const suppliedProof/);assert.match(main,/if \(suppliedProof\) return null/);});
check("recovery is read-only only",()=>{
  const m=main.match(/const EXECUTION_RECOVERY_ACTIONS = new Set\(\[([^\]]+)\]\)/);
  assert.ok(m);
  const body=m[1];
  for(const action of ["LIST_FILES","READ_FILE","SEARCH_FILES","GIT_STATUS","GIT_DIFF","GIT_DIFF_CHECK"]) assert.match(body,new RegExp(action));
  assert.doesNotMatch(body,/WRITE_FILE|RUN_DEV_COMMAND/);
});
check("recovery uses new deterministic request id",()=>assert.match(main,/req-recovery-/));
check("recovery injects authoritative proof",()=>assert.match(main,/sourceProofSha256:proofSha256/));
check("recovery explicitly forbids new Task Launch",()=>assert.match(main,/új TASK_LAUNCH küldése TILOS/));
check("recovery is persisted and deduplicated",()=>{
  assert.match(main,/executionRecoveryState:"SENT"/);
  assert.match(main,/executionRecoveryInvalidSha256/);
  assert.match(main,/executionRequestRecoveryKeys/);
});
check("invalid branch invokes recovery before normal backend execution",()=>{
  const start=main.indexOf("async function processCapturedExecutionRequest");
  const body=main.slice(start,start+9000);
  const invalidIndex=body.indexOf("if (!parsed?.ok || !parsed.request)");
  const recoveryIndex=body.indexOf("sendExecutionRequestRecoveryContinuation");
  const backendIndex=body.indexOf("executeDeveloperGridRequest");
  assert.ok(invalidIndex>=0 && recoveryIndex>invalidIndex && backendIndex>recoveryIndex);
});
check("normal valid execution flow remains intact",()=>{
  assert.match(main,/executeDeveloperGridRequest/);
  assert.match(main,/sendExecutionResultToWorker/);
  assert.match(main,/lastExecutionRequestId/);
});

console.log("Developer Grid execution request recovery v0.1.48 contract PASS · "+n+"/"+n);
