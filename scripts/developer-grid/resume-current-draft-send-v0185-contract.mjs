import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const main=fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/src/main.cjs"),"utf8");
const pkg=JSON.parse(fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/package.json"),"utf8"));
let n=0;
function check(name,fn){fn();n+=1;console.log("PASS "+String(n).padStart(2,"0")+" "+name);}

check("desktop version v0.1.93",()=>assert.equal(pkg.version,"0.1.93"));
check("READY Central proof can be reused without rotation",()=>{
  assert.ok(main.includes("function reusableLaunchExecutionProof(task, session)"));
  assert.ok(main.includes('proof?.state === "VERIFIED"'));
  assert.ok(main.includes('proof?.authority === "CENTRAL_CORE"'));
  assert.ok(main.includes('proof?.handshakeStage === "READY"'));
  assert.ok(main.includes("Number(proof?.activeScopeLockCount || 0) >= 1"));
  assert.ok(main.includes("Number(proof?.activeWorktreeLeaseCount || 0) >= 1"));
});
check("reusable proof requires exact provenance identity",()=>{
  for(const token of ["provenance?.taskId","provenance?.sessionId","provenance?.repository","provenance?.worktree","provenance?.branch","provenance?.head"]) assert.ok(main.includes(token));
});
check("execution recovery is conditional instead of unconditional",()=>{
  const start=main.indexOf('ipcMain.handle("work-start:resume-launch"');
  const end=main.indexOf('ipcMain.handle("work-close:run"',start);
  const body=main.slice(start,end);
  assert.ok(body.includes("const reusableProof = reusableLaunchExecutionProof(task, session);"));
  const gate=body.indexOf("if (!reusableProof.ok) {");
  const recovery=body.indexOf("recoverDeveloperGridLaunchExecution",gate);
  assert.ok(gate>=0 && recovery>gate);
});
check("current owned draft is sent directly",()=>{
  assert.ok(main.includes("async function sendExistingOwnedTaskLaunchDraft"));
  assert.ok(main.includes('decision?.reason !== "current-proof"'));
  assert.ok(main.includes('identity?.kind !== "TASK_LAUNCH_V3"'));
  assert.ok(main.includes("await sendPreparedChatPrompt(view, TASK_LAUNCH_PROMPT_MARKER)"));
});
check("owned draft identity is exact task session and source proof",()=>{
  for(const token of ["identity?.taskId","identity?.sessionId","identity?.sourceProofSha256"]) assert.ok(main.includes(token));
});
check("successful direct send persists SENT and starts BOOT ACK monitor",()=>{
  assert.ok(main.includes('autoSendState:"SENT"'));
  assert.ok(main.includes("existingDraftResumedAt:new Date().toISOString()"));
  assert.ok(main.includes("void monitorWorkerBootAck({ view, task:launchTask, workerCode, baselineResponseSha256"));
});
check("resume path short-circuits after direct current-draft send",()=>{
  assert.ok(main.includes('staleDraftRecovery?.decision?.reason === "current-proof"'));
  assert.ok(main.includes("task-launch-existing-draft-sent"));
  assert.ok(main.includes("return { ok:resumedDraft?.ok === true, activeWork, taskLaunch:resumedDraft"));
});
check("stale draft clearing remains present",()=>{
  assert.ok(main.includes("await clearStaleOwnedTaskLaunchDraft(view"));
  assert.ok(main.includes("staleDraftPreviousSourceProofSha256"));
});
check("fail-closed behavior remains for unverifiable direct send",()=>{
  assert.ok(main.includes("OWNED_TASK_DRAFT_SEND_NOT_VERIFIED"));
  assert.ok(main.includes("OWNED_TASK_DRAFT_NOT_CURRENT"));
});

console.log("Developer Grid v0.1.93 resume current-draft send contract PASS · "+n+"/"+n);
