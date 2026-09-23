import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=(rel)=>fs.readFileSync(path.join(root,rel),"utf8");
const main=read("desktop/benjadmin-developer-grid/src/main.cjs");
const rollover=read("desktop/benjadmin-developer-grid/src/context-workspace/conversation-rollover.cjs");
const types=read("app/lib/developer-grid/types.ts");
const pkg=JSON.parse(read("desktop/benjadmin-developer-grid/package.json"));

let n=0;
const check=(label,fn)=>{fn();n+=1;console.log("PASS "+String(n).padStart(2,"0")+" "+label);};

check("desktop v0.1.67",()=>assert.equal(pkg.version,"0.1.67"));
check("backend v0.1.67-dev",()=>assert.match(types,/DEVELOPER_GRID_VERSION = "0.1.67-dev"/));
check("rollover bootstrap requires ACK-only first response",()=>assert.match(rollover,/első assistant-válasz KIZÁRÓLAG/));
check("rollover bootstrap forbids tools before ACK",()=>assert.match(rollover,/NE hívj semmilyen eszközt, MCP-t, VPS-t, shellt/));
check("rollover bootstrap waits for automatic ready continuation",()=>assert.match(rollover,/CONVERSATION_ROLLOVER_READY_V1/));
check("rollover bootstrap denies direct MCP for DEV source",()=>assert.match(rollover,/közvetlen DIMPROVER VPS MCP vagy raw shell használata TILOS/));
check("ready continuation builder exists",()=>assert.match(main,/function buildConversationRolloverReadyContinuationPrompt/));
check("ready continuation sender exists",()=>assert.match(main,/async function sendConversationRolloverReadyContinuation/));
check("ready continuation denies direct MCP",()=>assert.ok(main.includes("Közvetlen DIMPROVER VPS MCP, közvetlen VPS shell vagy más raw shell DEV source/provenance művelethez TILOS.")));
check("ready continuation rejects MCP base host as DEV authority",()=>assert.match(main,/MCP alap hostja nem tekinthető az authoritative DEV execution környezetnek/));
check("ready continuation requires first GIT_STATUS",()=>assert.match(main,/Első kötelező execution lépés: pontosan EGY GIT_STATUS kérés/));
check("ready continuation embeds Execution Bridge protocol",()=>{
  const a=main.indexOf("function buildConversationRolloverReadyContinuationPrompt");
  const b=main.indexOf("async function sendConversationRolloverReadyContinuation",a);
  assert.match(main.slice(a,b),/executionBridgeProtocolLines/);
});
check("ACK success sends ready continuation",()=>{
  const a=main.indexOf("async function processConversationRolloverAck");
  const b=main.indexOf("async function handleConversationRollover",a);
  assert.match(main.slice(a,b),/sendConversationRolloverReadyContinuation/);
});
check("ready continuation is idempotently recorded",()=>assert.match(main,/conversationRolloverReadyContinuationState:"SENT"/));
check("READY rollover self-heals missing continuation",()=>{
  const a=main.indexOf("async function handleConversationRollover");
  const b=main.indexOf("function rolloverEvidenceSummary",a);
  const body=main.slice(a,b);
  assert.match(body,/currentState === ROLLOVER_STATES.READY/);
  assert.match(body,/WAITING_FOR_BOUND_CONVERSATION/);
  assert.match(body,/sendConversationRolloverReadyContinuation/);
});
check("READY recovery requires exact bound conversation",()=>{
  const a=main.indexOf("async function handleConversationRollover");
  const b=main.indexOf("function rolloverEvidenceSummary",a);
  assert.match(main.slice(a,b),/currentConversationId !== expectedConversationId/);
});
check("reconstructed task exposes authoritative proof",()=>assert.ok(main.includes("sourceProofSha256: session.developmentContext?.sourceExecutionProof?.sha256 || null")));
check("execution request expected proof has no local explicit override",()=>{
  const a=main.indexOf("async function processCapturedExecutionRequest");
  const b=main.indexOf("async function processCapturedStageReport",a);
  const body=main.slice(a,b);
  assert.ok(body.includes("const expectedProof = resolvedExecutionProofSha256(task);"));
  assert.ok(!body.includes("resolvedExecutionProofSha256(task, launchRecord"));
});
check("execution recovery proof has no local explicit override",()=>{
  const a=main.indexOf("async function resolveExecutionRecoveryAuthority");
  const b=main.indexOf("async function sendExecutionRequestRecoveryContinuation",a);
  const body=main.slice(a,b);
  assert.ok(body.includes("resolvedExecutionProofSha256(task)"));
  assert.ok(!body.includes("resolvedExecutionProofSha256(task, launchRecord"));
});
check("automatic rollover proof has no local explicit override",()=>{
  const a=main.indexOf("async function handleConversationRollover");
  const b=main.indexOf("function rolloverEvidenceSummary",a);
  assert.ok(main.slice(a,b).includes("const sourceProofSha256 = resolvedExecutionProofSha256(task);"));
});
check("downloaded MD forbids direct MCP DEV source operations",()=>assert.ok(main.includes("DEV source/provenance ellenőrzéshez közvetlen DIMPROVER VPS MCP vagy raw shell használata tilos.")));

console.log("Developer Grid rollover execution bridge v0.1.67 contract PASS · "+n+"/"+n);
