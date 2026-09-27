import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const rollover = require(path.join(root, "desktop/benjadmin-developer-grid/src/context-workspace/conversation-rollover.cjs"));
const main = fs.readFileSync(path.join(root, "desktop/benjadmin-developer-grid/src/main.cjs"), "utf8");
const workStart = fs.readFileSync(path.join(root, "app/lib/developer-grid/work-start.ts"), "utf8");
const types = fs.readFileSync(path.join(root, "app/lib/developer-grid/types.ts"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "desktop/benjadmin-developer-grid/package.json"), "utf8"));

const TASK="dev-task-grid-6d00963673f51c5ccde5";
const SESSION="grid-work-dev-task-grid-6d00963673f51c5ccde5-jazminai";
const PREV="6ab4385f-21b4-83eb-a1ac-ab42866bb947";
const SNAP="ctx-dev-task-grid-6d00963673f51c5ccde5-1790274564574-ed6b56e1";
const HANDOFF="hp-dev-task-grid-6d00963673f51c5ccde5-1790274564732-9692fca5";
const HEAD="117915263210cbe9d0cdcd728e070221e560e161";
const OLD_PROOF="778282e7d407da6e06a4c79351af3e78ce04f0835b6793ba15717c2448a19a2c";
const NEW_PROOF="27333bc8959fb70aa650721ee3fde6838cccf5e5a996f26684663627f6f5bb0b";
const memory={context:{id:SNAP,revision:13,sourceHead:HEAD},handoff:{id:HANDOFF}};
const task={id:TASK,sessionId:SESSION,sourceHead:HEAD};
const prompt=rollover.buildConversationRolloverPrompt({task,workerCode:"JAZMINAI",previousConversationId:PREV,memory,sourceProofSha256:OLD_PROOF});
const expected={taskId:TASK,sessionId:SESSION,workerCode:"JAZMINAI",previousConversationId:PREV,contextSnapshotId:SNAP,contextRevision:13,handoffPackId:HANDOFF,sourceHead:HEAD};

let n=0;
const check=async(label,fn)=>{await fn();n+=1;console.log(`PASS ${String(n).padStart(2,"0")} ${label}`);};

await check("desktop version v0.1.72", async()=>assert.equal(pkg.version,"0.1.82"));
await check("backend version v0.1.72-dev", async()=>assert.match(types,/DEVELOPER_GRID_VERSION = "0\.1\.82-dev"/));
await check("real rev13 rollover bootstrap parses exactly", async()=>{
  const p=rollover.parseConversationRolloverPrompt(prompt);
  assert.equal(p.ok,true);
  assert.deepEqual(p.prompt,{workerCode:"JAZMINAI",taskId:TASK,sessionId:SESSION,previousConversationId:PREV,contextSnapshotId:SNAP,contextRevision:13,handoffPackId:HANDOFF,sourceHead:HEAD,sourceProofSha256:OLD_PROOF,productionAccess:"DENY"});
});
await check("real rev13 rollover bootstrap validates exact identity", async()=>assert.equal(rollover.validateConversationRolloverPrompt(prompt,expected).validated,true));
await check("wrong previous conversation is rejected", async()=>{
  const v=rollover.validateConversationRolloverPrompt(prompt,{...expected,previousConversationId:"wrong"});
  assert.equal(v.validated,false); assert.ok(v.mismatches.includes("previousConversationId"));
});
await check("wrong context revision is rejected", async()=>{
  const v=rollover.validateConversationRolloverPrompt(prompt,{...expected,contextRevision:12});
  assert.equal(v.validated,false); assert.ok(v.mismatches.includes("contextRevision"));
});
await check("missing PROD DENY is rejected", async()=>{
  const damaged=prompt.replace("DEV ONLY · PROD DENY.","DEV ONLY.");
  const v=rollover.validateConversationRolloverPrompt(damaged,expected);
  assert.equal(v.validated,false); assert.ok(v.mismatches.includes("productionAccess") || v.mismatches.includes("ROLLOVER_PROMPT_IDENTITY_INCOMPLETE"));
});
await check("orphan mode is only allowed inside ChatGPT rollover", async()=>{
  assert.match(workStart,/orphanRolloverRecovery && \(!conversationRollover \|\| manualRebind \|\| legacySurfaceBind \|\| surfaceType !== "CHATGPT"\)/);
});
await check("backend uses current Context Snapshot and Handoff for orphan recovery", async()=>{
  assert.match(workStart,/orphanRolloverRecovery \? ctx\.contextSnapshotId/);
  assert.match(workStart,/orphanRolloverRecovery \? ctx\.contextRevision/);
  assert.match(workStart,/orphanRolloverRecovery \? ctx\.handoffPackId/);
});
await check("backend proof-chain requires Central Core recovery event", async()=>{
  assert.match(workStart,/EXECUTION_AUTHORITY_RECOVERED/);
  assert.match(workStart,/previousSourceProofSha256/);
  assert.match(workStart,/sourceProofSha256/);
  assert.match(workStart,/event\.productionAccess === "DENY"/);
  assert.match(workStart,/String\(delta\.sessionId \|\| ""\) === input\.sessionId/);
  assert.match(workStart,/String\(delta\.engineSessionId \|\| ""\) === input\.currentEngineSessionId/);
});
await check("future recovery persists previous proof on authoritative session", async()=>{
  assert.match(types,/executionAuthorityPreviousSourceProofSha256\?: string \| null/);
  assert.match(workStart,/executionAuthorityPreviousSourceProofSha256:expectedPreviousProofSha256/);
});
await check("orphan successor must remain in same ChatGPT Project", async()=>assert.match(workStart,/orphanProjectIdentityOk/));
await check("desktop derives successor id from current visible conversation", async()=>{
  assert.match(main,/currentConversationId:currentId/);
  assert.match(main,/String\(capture\.conversationId \|\| ""\) !== currentConversationId/);
  assert.doesNotMatch(main,/orphanRolloverRecovery[\s\S]{0,2200}randomUUID/);
});
await check("desktop requires USER rollover bootstrap before orphan bind", async()=>{
  assert.match(main,/role \|\| ""\)\.toUpperCase\(\) === "USER"/);
  assert.match(main,/includes\(ROLLOVER_PROMPT_MARKER\)/);
  assert.match(main,/validateConversationRolloverPrompt\(markerMessage\.text, expected\)/);
});
await check("orphan bind enters ACK_WAIT and propagates orphan flag", async()=>{
  assert.match(main,/conversationRolloverOrphanRecovery:true/);
  assert.match(main,/state:ROLLOVER_STATES\.ACK_WAIT/);
  assert.match(main,/orphanRolloverRecovery:record\.conversationRolloverOrphanRecovery === true/);
});
await check("backend persists orphan recovery flag", async()=>{
  assert.match(workStart,/conversationRolloverOrphanRecovery: orphanRolloverRecovery/);
  assert.match(workStart,/orphanRolloverRecovery: conversationRollover \? orphanRolloverRecovery : false/);
});
await check("physical proof fixtures retain exact 778 to 273 continuity", async()=>{
  assert.equal(OLD_PROOF,"778282e7d407da6e06a4c79351af3e78ce04f0835b6793ba15717c2448a19a2c");
  assert.equal(NEW_PROOF,"27333bc8959fb70aa650721ee3fde6838cccf5e5a996f26684663627f6f5bb0b");
});
await check("orphan recovery creates no new Grid task session worktree or TASK_LAUNCH", async()=>{
  const start=main.indexOf("async function recoverOrphanConversationRollover");
  const end=main.indexOf("function conversationMemoryTaskForWorker",start);
  const block=main.slice(start,end);
  assert.doesNotMatch(block,/prepareDeveloperGridWorkStart|TASK_LAUNCH|create.*worktree|materializeGridTaskSession/);
});
await check("PROD remains denied", async()=>{
  assert.match(prompt,/DEV ONLY · PROD DENY\./);
  assert.match(workStart,/Conversation rollover PROD hozzáféréssel tiltott/);
});

console.log(`Developer Grid orphan rollover recovery v0.1.72 contract PASS · ${n}/${n}`);
