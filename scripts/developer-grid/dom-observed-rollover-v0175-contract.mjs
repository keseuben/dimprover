import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const main=fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/src/main.cjs"),"utf8");
const dom=fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/src/chatgpt/chatgpt-dom-adapter.cjs"),"utf8");
const types=fs.readFileSync(path.join(root,"app/lib/developer-grid/types.ts"),"utf8");
const pkg=JSON.parse(fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/package.json"),"utf8"));
let n=0; const check=(label,fn)=>{fn();n++;console.log("PASS "+String(n).padStart(2,"0")+" "+label);};

check("desktop version v0.1.75",()=>assert.equal(pkg.version,"0.1.91"));
check("backend version v0.1.75-dev",()=>assert.ok(types.includes('DEVELOPER_GRID_VERSION = "0.1.91-dev"')));
check("DOM adapter derives conversation id from page location",()=>{assert.match(dom,/location\.href/);assert.match(dom,/conversationId/);});
check("conversation sync observes DOM before mismatch decisions",()=>{
  const fn=main.indexOf("async function syncConversationMemoryForWorker");
  const domObs=main.indexOf("inspectChatGptDom(view)",fn);
  const firstMismatch=main.indexOf("if (currentId",domObs);
  const transcript=main.indexOf("captureConversationTranscript(view)",firstMismatch);
  assert.ok(fn>0 && domObs>fn && firstMismatch>domObs && transcript>firstMismatch);
});
check("verified DOM location outranks stale webContents URL",()=>{
  assert.match(main,/const currentId = domConversationVerified \? domConversationId : webContentsConversationId/);
  assert.match(main,/chatConversationIdFromUrl\(domConversationUrl\) === domConversationId/);
});
check("DOM observation requires ChatGPT URL",()=>assert.match(main,/isChatGptUrl\(domConversationUrl\)/));
check("orphan recovery receives observed conversation URL",()=>assert.match(main,/observedConversationUrl:currentConversationUrl/));
check("orphan recovery validates transcript id against observed id",()=>assert.match(main,/capture\.conversationId \|\| ""\) !== currentConversationId/));
check("orphan recovery uses transcript URL for same-project guard",()=>{
  assert.match(main,/const captureUrl = String\(capture\.conversationUrl/);
  assert.match(main,/sameChatProjectConversation\(authoritativeUrl, captureUrl\)/);
});
check("orphan recovery verifies transcript URL id",()=>assert.match(main,/chatConversationIdFromUrl\(captureUrl\) !== currentConversationId/));
check("normal conversation memory also verifies transcript URL id",()=>assert.match(main,/chatConversationIdFromUrl\(String\(capture\.conversationUrl \|\| ""\)\) !== currentId/));
check("mismatch telemetry exposes web and DOM observations",()=>{
  for(const token of ["currentObservationSource","webContentsConversationId","domConversationId","webContentsUrl","domConversationUrl","domRoute","domOk"]) assert.ok(main.includes(token));
});
check("same-project and PROD safeguards remain",()=>{assert.match(main,/sameChatProjectConversation/);assert.match(main,/productionAccess/);});
check("no new Grid task session worktree or TASK_LAUNCH added by observation",()=>{
  const fn=main.slice(main.indexOf("async function syncConversationMemoryForWorker"),main.indexOf("async function syncConversationMemoryOnce"));
  assert.doesNotMatch(fn,/prepareDeveloperGridWorkStart|materializeGridTaskSession|TASK_LAUNCH|worktree add/);
});
console.log("Developer Grid DOM-observed rollover v0.1.75 contract PASS · "+n+"/"+n);
