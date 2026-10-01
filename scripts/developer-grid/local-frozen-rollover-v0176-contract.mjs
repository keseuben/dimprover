import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const main=fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/src/main.cjs"),"utf8");
const types=fs.readFileSync(path.join(root,"app/lib/developer-grid/types.ts"),"utf8");
const pkg=JSON.parse(fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/package.json"),"utf8"));
const reAck=require(path.join(root,"desktop/benjadmin-developer-grid/src/context-workspace/rollover-reack.cjs"));
let n=0; const check=(label,fn)=>{fn();n++;console.log("PASS "+String(n).padStart(2,"0")+" "+label);};

check("desktop version v0.1.76",()=>assert.equal(pkg.version,"0.1.96"));
check("backend version v0.1.76-dev",()=>assert.ok(types.includes('DEVELOPER_GRID_VERSION = "0.1.96-dev"')));
check("local frozen helper exists",()=>assert.match(main,/async function recoverLocalFrozenRolloverIdentity/));
check("fallback requires explicit REBIND_PENDING",()=>assert.match(main,/conversationGuardState === "REBIND_PENDING"/));
check("rebind task previous and current ids must match",()=>{
  assert.match(main,/rebindTaskId \|\| ""\) === taskId/);
  assert.match(main,/rebindPreviousConversationId \|\| ""\) === previousConversationId/);
  assert.match(main,/rebindConversationId \|\| ""\) === currentConversationId/);
});
check("rebind remains same ChatGPT project",()=>assert.match(main,/sameChatProjectConversation\(String\(task\?\.surfaceConversationUrl/));
check("only frozen rollover modes can fallback",()=>assert.match(main,/\["MANUAL_CLIPBOARD", "ORPHAN_RECOVERY"\]\.includes\(mode\)/));
check("local frozen identity requires source head and 64hex proof",()=>{
  assert.match(main,/\^\[0-9a-f\]\{40\}\$\/\.test\(sourceHead\)/);
  assert.match(main,/\^\[0-9a-f\]\{64\}\$\/\.test\(sourceProofSha256\)/);
});
check("local frozen fallback requires verified source and boot ack",()=>{
  assert.match(main,/sourceState \|\| ""\)\.toUpperCase\(\) === "VERIFIED"/);
  assert.match(main,/bootAckState \|\| task\?\.chatLaunch\?\.bootAckState/);
  assert.match(main,/bootAckCodingAllowed === true/);
});
check("server memory is fetched for exact predecessor task and session",()=>{
  assert.match(main,/fetchDeveloperGridConversationMemory\(\{/);
  assert.match(main,/conversationId:previousConversationId/);
});
check("context snapshot exact identity is mandatory",()=>{
  for(const token of ["context.id","context.revision","context.taskId","context.sessionId","context.conversationId","context.sourceHead","context.productionAccess"]) assert.ok(main.includes(token));
});
check("handoff pack exact identity is mandatory",()=>{
  for(const token of ["handoff.id","handoff.taskId","handoff.sessionId","handoff.conversationId","handoff.contextSnapshotId","handoff.sourceHead","handoff.productionAccess"]) assert.ok(main.includes(token));
});
check("local fallback is used only when mounted bootstrap and ACK evidence are absent",()=>assert.match(main,/if \(!identity && !markerMessage && !ackCandidates\.length\)/));
check("mounted markerless ACK search is not limited to latest assistant",()=>{
  assert.match(main,/assistantMessages\.filter\(\(item\) => parseConversationRolloverAck\(item\.text\)\?\.ok\)/);
  assert.doesNotMatch(main,/markerlessLatestAck/);
});
check("ACK processor accepts only self-consistent observed id and url",()=>{
  assert.match(main,/observedConversationId = "", observedConversationUrl = ""/);
  assert.match(main,/observedUrlId === observedId/);
  assert.match(main,/chatConversationIdFromUrl\(currentConversationUrl\) !== currentConversationId/);
});
check("READY bind uses verified conversationUrl instead of stale webContents url",()=>assert.match(main,/conversationUrl:currentConversationUrl/));
check("orphan ACK call passes DOM transcript observed identity",()=>{
  assert.match(main,/observedConversationId:currentConversationId/);
  assert.match(main,/observedConversationUrl:currentUrl/);
});
check("normal ACK call passes DOM observed identity",()=>{
  assert.match(main,/observedConversationId:currentId/);
  assert.match(main,/observedConversationUrl:currentConversationUrl/);
});
check("orphan bind still enters ACK_WAIT first",()=>assert.match(main,/state:ROLLOVER_STATES\.ACK_WAIT/));
check("local frozen evidence mode is explicit",()=>assert.match(main,/LOCAL_FROZEN_MEMORY_USER_REBIND/));
check("no task session worktree launch is created by fallback helper",()=>{
  const a=main.indexOf("async function recoverLocalFrozenRolloverIdentity");
  const b=main.indexOf("async function recoverOrphanConversationRollover",a);
  const block=main.slice(a,b);
  assert.doesNotMatch(block,/prepareDeveloperGridWorkStart|materializeGridTaskSession|TASK_LAUNCH|worktree add/);
});
check("PROD remains denied",()=>assert.match(main,/productionAccess:"DENY"/));
check("re-ACK prompt identity is deterministic and strict",()=>{
  const identity={
    taskId:"dev-task-grid-6d00963673f51c5ccde5",
    sessionId:"grid-work-dev-task-grid-6d00963673f51c5ccde5-jazminai",
    workerCode:"JAZMINAI",
    previousConversationId:"6ab4385f-21b4-83eb-a1ac-ab42866bb947",
    contextSnapshotId:"ctx-dev-task-grid-6d00963673f51c5ccde5-1790274564574-ed6b56e1",
    contextRevision:13,
    handoffPackId:"hp-dev-task-grid-6d00963673f51c5ccde5-1790274564732-9692fca5",
    sourceHead:"117915263210cbe9d0cdcd728e070221e560e161",
    sourceProofSha256:"778282e7d407da6e06a4c79351af3e78ce04f0835b6793ba15717c2448a19a2c",
  };
  const a=reAck.buildConversationRolloverReAckPrompt(identity);
  const b=reAck.buildConversationRolloverReAckPrompt(identity);
  assert.equal(a.key,b.key);
  assert.match(a.key,/^[0-9a-f]{64}$/);
  assert.ok(a.prompt.includes("BENJADMIN_PROMPT_KIND: CONVERSATION_ROLLOVER_REACK_V1"));
  assert.ok(a.prompt.includes("BENJADMIN_CONVERSATION_ROLLOVER_ACK_V1"));
  assert.ok(a.prompt.includes(identity.contextSnapshotId));
  assert.ok(a.prompt.includes(identity.handoffPackId));
  assert.ok(a.prompt.includes(identity.sourceProofSha256));
  assert.ok(a.prompt.includes("PROD DENY"));
  assert.ok(a.prompt.includes("NE hívj semmilyen eszközt"));
  assert.ok(a.prompt.includes("Ne hozz létre új taskot"));
});
check("re-ACK request is transcript-idempotent",()=>{
  assert.match(main,/String\(record\.conversationRolloverReAckState \|\| ""\)\.toUpperCase\(\) === "SENT"/);
  assert.match(main,/includes\(request\.verificationMarker\)/);
  assert.match(main,/conversation-rollover-reack-recovered/);
});
check("re-ACK send is transcript verified before SENT state",()=>{
  assert.match(main,/verifyPromptMarkerInTranscript\(view, request\.verificationMarker, 12000\)/);
  assert.match(main,/conversationRolloverReAckState:"SENT"/);
});
check("local frozen bind without mounted ACK requests re-ACK",()=>{
  assert.match(main,/else if \(evidenceMode === "LOCAL_FROZEN_MEMORY_USER_REBIND"\)/);
  assert.match(main,/requestConversationRolloverReAck\(\{/);
});
check("ACK_WAIT retry is limited to local frozen evidence mode",()=>{
  assert.match(main,/rolloverState === ROLLOVER_STATES\.ACK_WAIT/);
  assert.match(main,/conversationRolloverRecoveryEvidenceMode \|\| ""\) === "LOCAL_FROZEN_MEMORY_USER_REBIND"/);
});
check("mounted assistant ACK has precedence over re-ACK retry",()=>{
  const ack=main.indexOf("if (bodyWithRolloverAck)");
  const retry=main.indexOf('else if (rolloverState === ROLLOVER_STATES.ACK_WAIT',ack);
  assert.ok(ack>0 && retry>ack);
});
check("re-ACK never directly marks rollover READY",()=>{
  const a=main.indexOf("async function requestConversationRolloverReAck");
  const b=main.indexOf("async function processConversationRolloverAck",a);
  const block=main.slice(a,b);
  assert.doesNotMatch(block,/conversationRolloverState:ROLLOVER_STATES\.READY/);
  assert.doesNotMatch(block,/state:ROLLOVER_STATES\.READY/);
});
console.log("Developer Grid local frozen rollover v0.1.76 contract PASS · "+n+"/"+n);
