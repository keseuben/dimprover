import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const adapter = require("../../desktop/benjadmin-developer-grid/src/chatgpt/chatgpt-dom-adapter.cjs");
const handoff = require("../../desktop/benjadmin-developer-grid/src/context-workspace/chatgpt-handoff.cjs");
const auto = require("../../desktop/benjadmin-developer-grid/src/chatgpt/auto-work-start.cjs");
let count = 0;
async function check(label, fn) { await fn(); console.log("PASS", ++count, label); }
function runDom(script, rows, generating = false) {
  const nodes = rows.map((row, index) => ({
    innerText: row.text, textContent: row.text,
    matches: () => true, querySelectorAll: () => [], querySelector: () => null,
    getAttribute: (key) => key === "data-message-author-role" ? row.role : key === "data-testid" ? "conversation-turn-" + index : "",
  }));
  return vm.runInNewContext(script, {
    URL, location: { href: "https://chatgpt.com/c/test-conversation" },
    getComputedStyle: () => ({ visibility: "visible" }),
    document: {
      title: "DIMPRO Drive",
      querySelectorAll: (selector) => selector === adapter.CHATGPT_SELECTORS.conversationTurn ? nodes : [],
      querySelector: (selector) => generating && adapter.CHATGPT_SELECTORS.stopButton.includes(selector)
        ? { getClientRects: () => [1] } : null,
    },
  });
}
const meta = {
  schemaVersion: 2, workerCode: "BENJAMINAI", chatSessionId: "test-chat",
  chatTitle: "Drive fejlesztés", workedMainProject: "DIMPRO", workedProject: "project_dimprover",
  workedModule: "Drive", primaryDevelopmentArea: "feltöltés", fileAreaKey: "upload",
  workedTaskTitle: "Feltöltés javítása", summary: "Forrásjavítás.", prodDeny: "PROD DENY",
};
await check("markerless V2 is recognized from actual DOM script", () => {
  const capture = runDom(adapter.HANDOFF_ASSISTANT_SCRIPT, [{role:"assistant",text:JSON.stringify(meta,null,2)}]);
  assert.equal(capture.ok,true); assert.equal(capture.format,"v2-markerless");
});
await check("marked V2 remains supported", () => {
  const capture = runDom(adapter.HANDOFF_ASSISTANT_SCRIPT, [{role:"assistant",text:"BENJADMIN_HANDOFF_META_V2\n"+JSON.stringify(meta)}]);
  assert.equal(capture.format,"v2");
});
await check("legacy handoff whitespace is recognized", () => {
  const capture = runDom(adapter.HANDOFF_ASSISTANT_SCRIPT,[{role:"assistant",text:"MUNKA VISSZAADVA\nÁTADÓ\n"+"Elvégzett forrásmunka. ".repeat(10)}]);
  assert.equal(capture.format,"legacy");
});
await check("ordinary assistant response is not a handoff", () => {
  assert.equal(runDom(adapter.HANDOFF_ASSISTANT_SCRIPT,[{role:"assistant",text:"Készen vagyok."}]).ok,false);
});
await check("incomplete schema is not a markerless handoff", () => {
  assert.equal(runDom(adapter.HANDOFF_ASSISTANT_SCRIPT,[{role:"assistant",text:'{"schemaVersion":2,"workerCode":"BENAI"}'}]).ok,false);
});
await check("streaming handoff is never ready", () => {
  const capture=runDom(adapter.HANDOFF_ASSISTANT_SCRIPT,[{role:"assistant",text:JSON.stringify(meta)}],true);
  assert.equal(capture.ok,false); assert.equal(capture.generating,true);
});
await check("user-quoted handoff cannot become assistant evidence", () => {
  assert.equal(runDom(adapter.HANDOFF_ASSISTANT_SCRIPT,[{role:"user",text:JSON.stringify(meta)}]).ok,false);
});
await check("backend Benjamin alias becomes the desktop identity", () => {
  assert.equal(handoff.parseHandoffV2(JSON.stringify(meta)).workerCode,"BENAI");
});
await check("desktop Benjamin identity stays stable", () => {
  assert.equal(handoff.parseHandoffV2(JSON.stringify({...meta,workerCode:"BENAI"})).workerCode,"BENAI");
});
await check("another worker is not normalized to Benjamin", () => {
  assert.equal(handoff.parseHandoffV2(JSON.stringify({...meta,workerCode:"ARMINAI"})).workerCode,"ARMINAI");
});
await check("handoff keeps PROD DENY validation", () => {
  assert.throws(()=>handoff.parseHandoffV2(JSON.stringify({...meta,prodDeny:""})),/PROD DENY/);
});
const rows = [{role:"USER",messageId:"old",text:"Folytasd a DIMPRO Drive fejlesztést."}];
for (const marker of ["BENJADMIN_PROMPT_KIND: HANDOFF_V2", "BENJADMIN_PROMPT_KIND: EXECUTION_RESULT_V1", "BENJADMIN_CONTINUATION_V2", "BENJADMIN_TASK_LAUNCH_V3"]) {
  await check("protocol turn does not replay old development: "+marker, () => {
    const result=auto.detectChatDevelopmentIntent({conversationTitle:"DIMPRO Drive",messages:[...rows,{role:"USER",text:marker}]});
    assert.equal(result.triggered,false); assert.equal(result.reason,"MACHINE_PROTOCOL_TURN");
  });
}
await check("real new continuation after protocol is still recognized", () => {
  assert.equal(auto.detectChatDevelopmentIntent({conversationTitle:"DIMPRO Drive",messages:[...rows,{role:"USER",text:"BENJADMIN_PROMPT_KIND: HANDOFF_V2"},{role:"USER",text:"folytasd"}]}).triggered,true);
});
await check("long transcript retains latest command and stays bounded", () => {
  const many=Array.from({length:505},(_,index)=>({role:index%2?"assistant":"user",text:"turn "+index}));
  many.push({role:"user",text:"Folytasd a DIMPRO Drive fejlesztést."});
  const capture=runDom(adapter.TRANSCRIPT_SCRIPT,many);
  assert.equal(capture.messages.length,500);
  assert.equal(capture.messages[0].text,"turn 6");
  assert.equal(capture.messages.at(-1).text,many.at(-1).text);
  assert.equal(auto.detectChatDevelopmentIntent({messages:capture.messages,conversationTitle:capture.conversationTitle}).triggered,true);
});
const main=fs.readFileSync("desktop/benjadmin-developer-grid/src/main.cjs","utf8");
await check("handoff save blocks streaming before recovery or persistence", async () => {
  const start=main.indexOf("async function captureAndSaveWorkerHandoff(");
  const end=main.indexOf("\nasync function inspectWorkerHandoffState",start);
  const fn=main.slice(start,end);
  let saves=0;
  const sandbox={unlocked:true,normalizeDesktopWorkerCode:c=>c==="BENJAMINAI"?"BENAI":c,
    workerCellForCode:()=>({id:"cell-3"}),chatViews:new Map([["cell-3",{}]]),config:{cells:[]},
    getConversationInfo:async()=>({chatSessionId:"test-chat"}),handoffRecordForConversation:()=>({state:"RECOVERY_REQUIRED"}),
    captureLatestAssistantMarkdown:async()=>({ok:false,generating:true}),prepareWorkerHandoff:()=>{saves++;},
    saveHandoff:()=>{saves++;},
  };
  vm.createContext(sandbox);
  vm.runInContext(fn+"; globalThis.run=captureAndSaveWorkerHandoff;",sandbox);
  const result=await sandbox.run("BENJAMINAI");
  assert.equal(result.ok,false); assert.equal(result.code,"HANDOFF_RESPONSE_NOT_READY"); assert.equal(saves,0);
});
console.log("Grid launch/handoff runtime regression PASS · "+count+"/"+count);
