import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const rollover = require(path.join(root, "desktop/benjadmin-developer-grid/src/context-workspace/conversation-rollover.cjs"));
const main = read("desktop/benjadmin-developer-grid/src/main.cjs");
const backend = read("app/lib/developer-grid/work-start.ts");
const renderer = read("desktop/benjadmin-developer-grid/src/renderer/renderer.js");
const types = read("app/lib/developer-grid/types.ts");
const pkg = JSON.parse(read("desktop/benjadmin-developer-grid/package.json"));

let n=0;
function check(label,fn){fn();n+=1;console.log(`PASS ${String(n).padStart(2,"0")} ${label}`)}

const task={
  id:"dev-task-rollover-1",
  sessionId:"grid-work-dev-task-rollover-1-outminai",
  sourceHead:"a".repeat(40),
  branchName:"worker/outminai/dev-task-rollover-1",
  worktreePath:"/srv/dimpro-dev/worktrees/worker-outminai-dev-task-rollover-1",
  workStageIndex:2,
};
const proof="b".repeat(64);
const memory={
  context:{
    id:"ctx-rollover-1",
    revision:17,
    stage:2,
    stageLabel:"FEJLESZTÉS",
    sourceHead:task.sourceHead,
    branch:task.branchName,
    worktree:task.worktreePath,
    summary:"Ugyanazt a fejlesztési taskot kell folytatni.",
    unresolvedBlockers:[],
  },
  handoff:{id:"hp-rollover-1",summary:"Frozen continuity"},
};

check("desktop version v0.1.62",()=>assert.equal(pkg.version, "0.1.62"));
check("backend version v0.1.62-dev",()=>assert.match(types,/DEVELOPER_GRID_VERSION = "0\.1\.62-dev"/));
check("Hungarian maximum conversation marker detected",()=>{
  const x=rollover.detectConversationLimit([{role:"ASSISTANT",messageId:"hu",text:"Elérted a beszélgetés maximális hosszát, de folytathatod a beszélgetést egy új csevegés indításával. Új csevegés indítása"}]);
  assert.equal(x.reached,true); assert.equal(x.reason,"CONVERSATION_LIMIT_REACHED");
});
check("English maximum conversation marker detected",()=>{
  const x=rollover.detectConversationLimit([{role:"ASSISTANT",messageId:"en",text:"You've reached the maximum length for this conversation. Start a new chat to continue."}]);
  assert.equal(x.reached,true);
});
check("generic long conversation text is not a trigger",()=>{
  assert.equal(rollover.detectConversationLimit([{role:"ASSISTANT",text:"Ez egy hosszú beszélgetés, de még folytatható."}]).reached,false);
});
check("latest assistant message is authoritative for limit detection",()=>{
  const x=rollover.detectConversationLimit([
    {role:"ASSISTANT",messageId:"old",text:"Elérted a beszélgetés maximális hosszát. Új csevegés indítása."},
    {role:"USER",messageId:"u",text:"ok"},
    {role:"ASSISTANT",messageId:"new",text:"Folytatom a munkát."},
  ]);
  assert.equal(x.reached,false);
});
check("ChatGPT project conversation maps to same project root",()=>{
  assert.equal(rollover.chatProjectRootFromConversationUrl("https://chatgpt.com/g/g-p-demo_project/c/abc-123"),"https://chatgpt.com/g/g-p-demo_project");
});
check("non-project ChatGPT conversation cannot auto-rollover",()=>{
  assert.equal(rollover.chatProjectRootFromConversationUrl("https://chatgpt.com/c/abc-123"),"");
});
check("non-ChatGPT origin cannot auto-rollover",()=>{
  assert.equal(rollover.chatProjectRootFromConversationUrl("https://example.com/g/g-p-demo/c/abc"),"");
});

const prompt=rollover.buildConversationRolloverPrompt({
  task,workerCode:"OUTMINAI",previousConversationId:"old-conversation",memory,sourceProofSha256:proof,
});
check("rollover prompt has dedicated marker",()=>assert.match(prompt,/BENJADMIN_PROMPT_KIND: CONVERSATION_ROLLOVER_V1/));
check("rollover prompt preserves exact task and session",()=>{
  assert.match(prompt,new RegExp(task.id)); assert.match(prompt,new RegExp(task.sessionId));
});
check("rollover prompt carries frozen Context and Handoff identity",()=>{
  assert.match(prompt,/ctx-rollover-1/); assert.match(prompt,/revision 17/); assert.match(prompt,/hp-rollover-1/);
});
check("rollover prompt carries exact HEAD and source proof",()=>{
  assert.match(prompt,new RegExp(task.sourceHead)); assert.match(prompt,new RegExp(proof));
});
check("rollover prompt explicitly forbids new TASK_LAUNCH",()=>{
  assert.match(prompt,/NEM új TASK_LAUNCH/); assert.match(prompt,/"newTaskLaunch": false/);
});
check("rollover prompt keeps PROD denied",()=>assert.match(prompt,/DEV ONLY · PROD DENY/));

const ackObject={
  schemaVersion:1,
  taskId:task.id,
  sessionId:task.sessionId,
  workerCode:"OUTMINAI",
  previousConversationId:"old-conversation",
  contextSnapshotId:"ctx-rollover-1",
  contextRevision:17,
  handoffPackId:"hp-rollover-1",
  sourceHead:task.sourceHead,
  sourceProofSha256:proof,
  productionAccess:"DENY",
  sameTask:true,
  newTaskLaunch:false,
};
const ack=`BENJADMIN_CONVERSATION_ROLLOVER_ACK_V1\n\`\`\`json\n${JSON.stringify(ackObject,null,2)}\n\`\`\``;
const expected={...ackObject};
check("exact rollover ACK validates",()=>assert.equal(rollover.validateConversationRolloverAck(ack,expected).validated,true));
check("task mismatch blocks rollover ACK",()=>{
  const body=ack.replace(task.id,"different-task");
  assert.equal(rollover.validateConversationRolloverAck(body,expected).validated,false);
});
check("session mismatch blocks rollover ACK",()=>{
  const body=ack.replace(task.sessionId,"different-session");
  assert.equal(rollover.validateConversationRolloverAck(body,expected).validated,false);
});
check("Context revision mismatch blocks rollover ACK",()=>{
  const body=ack.replace('"contextRevision": 17','"contextRevision": 18');
  assert.equal(rollover.validateConversationRolloverAck(body,expected).validated,false);
});
check("source proof mismatch blocks rollover ACK",()=>{
  const body=ack.replace(proof,"c".repeat(64));
  assert.equal(rollover.validateConversationRolloverAck(body,expected).validated,false);
});
check("PROD access cannot validate",()=>{
  const body=ack.replace('"productionAccess": "DENY"','"productionAccess": "ALLOW"');
  assert.equal(rollover.validateConversationRolloverAck(body,expected).validated,false);
});
check("newTaskLaunch true cannot validate",()=>{
  const body=ack.replace('"newTaskLaunch": false','"newTaskLaunch": true');
  assert.equal(rollover.validateConversationRolloverAck(body,expected).validated,false);
});
check("main flow verifies USER transcript before rebind",()=>{
  assert.match(main,/verifyPromptMarkerInTranscript\(view, ROLLOVER_PROMPT_MARKER/);
  assert.match(main,/waitForConversationIdChange\(view, previousConversationId/);
  assert.match(main,/conversationRolloverState:ROLLOVER_STATES\.ACK_WAIT/);
});
check("Execution Bridge stays fail-closed until rollover ACK",()=>{
  assert.match(main,/CONVERSATION_ROLLOVER_ACK_REQUIRED/);
  assert.match(main,/rolloverPendingState\(rolloverState\)/);
});
check("backend binds rollover only to same authoritative predecessor",()=>{
  assert.match(backend,/DEVELOPER_GRID_ROLLOVER_PREVIOUS_CONVERSATION_MISMATCH/);
  assert.match(backend,/authoritativeConversationId === surfacePreviousConversationId/);
});
check("backend verifies BOOT ACK and frozen source identity",()=>{
  assert.match(backend,/DEVELOPER_GRID_ROLLOVER_BOOT_ACK_REQUIRED/);
  assert.match(backend,/DEVELOPER_GRID_ROLLOVER_IDENTITY_MISMATCH/);
  assert.match(backend,/sourceExecutionProof\?\.sha256/);
});
check("backend keeps engine target RUNNING during rollover and manual rebind",()=>assert.match(backend,/conversationRollover \|\| manualRebind\) \? "RUNNING" : "HANDED_OFF"/));
check("backend preserves PROD DENY guard",()=>assert.match(backend,/Conversation rollover PROD hozzáféréssel tiltott/));
check("Task Inspector exposes rollover proof",()=>{
  assert.match(renderer,/Conversation rollover/);
  assert.match(renderer,/conversationRolloverTranscriptVerified/);
  assert.match(renderer,/conversationRolloverAckSha256/);
});
check("rollover state type is explicit",()=>assert.match(types,/ConversationRolloverState = "HANDOFF_SAVED" \| "NAVIGATING" \| "CONTINUATION_SENT" \| "ACK_WAIT" \| "READY" \| "BLOCKED"/));

check("conversation binding authority is exact active task-worker session",()=>{
  assert.match(backend,/state\.sessions\.find\(\(item\) =>[\s\S]*item\.taskId === taskId[\s\S]*item\.workerCode === workerCode[\s\S]*item\.endedAt === null/);
});
check("non-primary active worker keeps project authority from its own session",()=>{
  assert.match(backend,/state\.task\?\.id === taskId[\s\S]*session\.developmentContext\.projectId/);
});
check("conversation binding no longer requires global primary task identity",()=>{
  assert.doesNotMatch(backend,/DEVELOPER_GRID_CHAT_TASK_MISMATCH/);
});

console.log(`Developer Grid conversation rollover v0.1.58 contract PASS · ${n}/${n}`);
