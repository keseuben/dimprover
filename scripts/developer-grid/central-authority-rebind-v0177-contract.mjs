import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const main=fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/src/main.cjs"),"utf8");
const types=fs.readFileSync(path.join(root,"app/lib/developer-grid/types.ts"),"utf8");
const pkg=JSON.parse(fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/package.json"),"utf8"));
let n=0; const check=(label,fn)=>{fn();n++;console.log("PASS "+String(n).padStart(2,"0")+" "+label);};

check("desktop version v0.1.77",()=>assert.equal(pkg.version,"0.1.84"));
check("backend version v0.1.77-dev",()=>assert.ok(types.includes('DEVELOPER_GRID_VERSION = "0.1.84-dev"')));

check("cell pin derives Central authoritative conversation separately",()=>{
  const a=main.indexOf("function conversationPinForCell");
  const b=main.indexOf("function clearConversationRebindCandidate",a);
  const block=main.slice(a,b);
  assert.match(block,/const authoritativeConversationId = String\(/);
  assert.match(block,/task\.surfaceConversationId/);
  assert.match(block,/const localConversationId = String\(/);
});

check("Central authoritative conversation wins cell pin",()=>{
  const a=main.indexOf("function conversationPinForCell");
  const b=main.indexOf("function clearConversationRebindCandidate",a);
  const block=main.slice(a,b);
  assert.match(block,/const conversationId = String\(authoritativeConversationId \|\| localConversationId\)\.trim\(\)/);
});

check("stale local successor mismatch disables local transition suspension",()=>{
  const a=main.indexOf("function conversationPinForCell");
  const b=main.indexOf("function clearConversationRebindCandidate",a);
  const block=main.slice(a,b);
  assert.match(block,/const localTargetsDifferentConversation = Boolean\(/);
  assert.match(block,/localConversationId !== authoritativeConversationId/);
  assert.match(block,/&& \(!authoritativeConversationId \|\| !localTargetsDifferentConversation\)/);
});

check("authoritative transition still suspends navigation guard",()=>{
  assert.match(main,/const shouldSuspendForAuthoritativeTransition = transitionStates\.includes\(authoritativeRolloverState\)/);
  assert.match(main,/if \(shouldSuspendForAuthoritativeTransition \|\| shouldSuspendForLocalTransition\)/);
});

check("conversation memory expected id is Central-first",()=>{
  assert.match(main,/const expectedConversationId = authoritativeConversationId \|\| localConversationId/);
});

check("authoritative mismatch recovery is no longer gated out by manual clipboard",()=>{
  const a=main.indexOf("if (currentId\n    && live.authoritativeConversationId");
  const b=main.indexOf("if (!currentId || currentId !== live.expectedConversationId)",a);
  const block=main.slice(a,b);
  assert.ok(a>0 && b>a);
  assert.doesNotMatch(block,/&& !manualClipboardActive/);
});

check("manual clipboard gets first chance on authoritative mismatch",()=>{
  const a=main.indexOf("if (currentId\n    && live.authoritativeConversationId");
  const b=main.indexOf("if (!currentId || currentId !== live.expectedConversationId)",a);
  const block=main.slice(a,b);
  const manual=block.indexOf("if (manualClipboardActive)");
  const observe=block.indexOf("observeManualConversationRollover",manual);
  const orphan=block.indexOf("recoverOrphanConversationRollover",observe);
  assert.ok(manual>=0 && observe>manual && orphan>observe);
});

check("missing mounted USER bootstrap no longer creates permanent pending state",()=>{
  assert.match(main,/if \(!markerMessage\) return \{ observed:false, pending:false, markerMissing:true \}/);
});

check("local frozen recovery still requires REBIND_PENDING",()=>{
  assert.match(main,/refreshState\.conversationGuardState === "REBIND_PENDING"/);
  assert.match(main,/LOCAL_FROZEN_MEMORY_USER_REBIND/);
});

check("same-project guard remains mandatory",()=>{
  assert.match(main,/sameChatProjectConversation/);
});

check("strict re-ACK path remains present",()=>{
  assert.match(main,/requestConversationRolloverReAck/);
  assert.match(main,/conversationRolloverReAckState/);
});

check("no task session worktree launch added by authority fix",()=>{
  const a=main.indexOf("function conversationPinForCell");
  const b=main.indexOf("function clearConversationRebindCandidate",a);
  const pin=main.slice(a,b);
  const c=main.indexOf("function conversationMemoryTaskForWorker");
  const d=main.indexOf("async function syncConversationMemoryOnce",c);
  const sync=main.slice(c,d);
  assert.doesNotMatch(pin,/TASK_LAUNCH|worktree add|materializeGridTaskSession/);
  assert.doesNotMatch(sync,/TASK_LAUNCH|worktree add|materializeGridTaskSession/);
});

check("PROD remains denied",()=>assert.match(main,/productionAccess:"DENY"/));

console.log("Developer Grid Central authority rebind v0.1.77 contract PASS · "+n+"/"+n);
