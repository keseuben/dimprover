import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const main=fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/src/main.cjs"),"utf8");
const types=fs.readFileSync(path.join(root,"app/lib/developer-grid/types.ts"),"utf8");
const pkg=JSON.parse(fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/package.json"),"utf8"));
let n=0; const check=(label,fn)=>{fn();n++;console.log("PASS "+String(n).padStart(2,"0")+" "+label);};

check("desktop version v0.1.76",()=>assert.equal(pkg.version,"0.1.76"));
check("backend version v0.1.76-dev",()=>assert.ok(types.includes('DEVELOPER_GRID_VERSION = "0.1.76-dev"')));
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
console.log("Developer Grid local frozen rollover v0.1.76 contract PASS · "+n+"/"+n);
