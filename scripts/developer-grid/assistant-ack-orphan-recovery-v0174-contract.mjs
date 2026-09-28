import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const rollover = require(path.join(root,"desktop/benjadmin-developer-grid/src/context-workspace/conversation-rollover.cjs"));
const main = fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/src/main.cjs"),"utf8");
const workStart = fs.readFileSync(path.join(root,"app/lib/developer-grid/work-start.ts"),"utf8");
const types = fs.readFileSync(path.join(root,"app/lib/developer-grid/types.ts"),"utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/package.json"),"utf8"));

const TASK="dev-task-grid-6d00963673f51c5ccde5";
const SESSION="grid-work-dev-task-grid-6d00963673f51c5ccde5-jazminai";
const PREV="6ab4385f-21b4-83eb-a1ac-ab42866bb947";
const SNAP="ctx-dev-task-grid-6d00963673f51c5ccde5-1790274564574-ed6b56e1";
const HANDOFF="hp-dev-task-grid-6d00963673f51c5ccde5-1790274564732-9692fca5";
const HEAD="117915263210cbe9d0cdcd728e070221e560e161";
const OLD_PROOF="778282e7d407da6e06a4c79351af3e78ce04f0835b6793ba15717c2448a19a2c";
const ackBody=JSON.stringify({schemaVersion:1,taskId:TASK,sessionId:SESSION,workerCode:"JAZMINAI",previousConversationId:PREV,contextSnapshotId:SNAP,contextRevision:13,handoffPackId:HANDOFF,sourceHead:HEAD,sourceProofSha256:OLD_PROOF,productionAccess:"DENY",sameTask:true,newTaskLaunch:false});
const expected={taskId:TASK,sessionId:SESSION,workerCode:"JAZMINAI",previousConversationId:PREV,contextSnapshotId:SNAP,contextRevision:13,handoffPackId:HANDOFF,sourceHead:HEAD,sourceProofSha256:OLD_PROOF};

let n=0; const check=(label,fn)=>{fn();n++;console.log(`PASS ${String(n).padStart(2,"0")} ${label}`);};

check("desktop version v0.1.74",()=>assert.equal(pkg.version,"0.1.90"));
check("backend version v0.1.74-dev",()=>assert.match(types,/DEVELOPER_GRID_VERSION = "0\.1\.90-dev"/));
check("physical rev13 markerless assistant ACK remains strict-valid",()=>{
  const v=rollover.validateConversationRolloverAck(ackBody,expected);
  assert.equal(v.validated,true);
  assert.equal(v.parseMode,"STRICT_JSON_ONLY_FALLBACK");
});
check("assistant evidence is considered only after USER bootstrap path",()=>{
  const p=main.indexOf("if (markerMessage)");
  const a=main.indexOf("if (!identity && ackCandidates.length)",p);
  assert.ok(p>0 && a>p);
});
check("assistant fallback requires ASSISTANT role",()=>assert.match(main,/toUpperCase\(\) === "ASSISTANT"/));
check("assistant fallback uses canonical ACK parser and validator",()=>{
  assert.match(main,/parseConversationRolloverAck\(candidate\.text\)/);
  assert.match(main,/validateConversationRolloverAck\(candidate\.text/);
});
check("assistant fallback requires 64-hex source proof before bind",()=>assert.match(main,/\^\[0-9a-f\]\{64\}\$\/\.test\(ackProofSha256\)/));
check("assistant proof is carried to backend rather than converted to current proof",()=>{
  assert.match(main,/conversationRolloverSourceProofSha256:String\(identity\.sourceProofSha256/);
  assert.doesNotMatch(main,/ASSISTANT_ACK[\s\S]{0,2200}resolvedExecutionProofSha256\(task\)/);
});
check("backend remains authoritative for recovered proof chain",()=>{
  assert.match(workStart,/recoveredProofChainAllows/);
  assert.match(workStart,/previousSourceProofSha256/);
  assert.match(workStart,/sourceProofSha256/);
  assert.match(workStart,/event\.productionAccess === "DENY"/);
});
check("orphan fallback still binds ACK_WAIT before ACK processing",()=>{
  const bind=main.indexOf("state:ROLLOVER_STATES.ACK_WAIT",main.indexOf("async function recoverOrphanConversationRollover"));
  const proc=main.indexOf("processConversationRolloverAck({",bind);
  assert.ok(bind>0 && proc>bind);
});
check("existing ACK processor is reused to reach READY and continuation",()=>assert.match(main,/ackRecovery = await processConversationRolloverAck/));
check("same-project guard remains mandatory and transcript-verified",()=>assert.match(main,/sameChatProjectConversation\(authoritativeUrl, captureUrl\)/));
check("no new Grid task/session/worktree/TASK_LAUNCH is created",()=>{
  const start=main.indexOf("async function recoverOrphanConversationRollover");
  const end=main.indexOf("function conversationMemoryTaskForWorker",start);
  const block=main.slice(start,end);
  assert.doesNotMatch(block,/prepareDeveloperGridWorkStart|TASK_LAUNCH|materializeGridTaskSession|worktree add/);
});
check("PROD remains denied through binding and ACK validators",()=>{
  assert.match(workStart,/productionAccess !== "DENY"/);
  assert.match(ackBody,/"productionAccess":"DENY"/);
});

console.log(`Developer Grid assistant ACK orphan recovery v0.1.74 contract PASS · ${n}/${n}`);
