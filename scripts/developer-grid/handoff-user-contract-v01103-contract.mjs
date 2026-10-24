import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const rollover=require("../../desktop/benjadmin-developer-grid/src/context-workspace/conversation-rollover.cjs");
const adapter=require("../../desktop/benjadmin-developer-grid/src/chatgpt/chatgpt-dom-adapter.cjs");
const main=fs.readFileSync("desktop/benjadmin-developer-grid/src/main.cjs","utf8");
let count=0;async function check(label,fn){await fn();console.log("PASS",++count,label);}
const instruction="GRID-E2E-20261023-BENAI. Kizárólag állapotellenőrzést végezz; alkalmazásforrást, adatbázist és futtatókörnyezetet ne módosíts, buildet és törlést ne indíts.";
const base={task:{id:"task",sessionId:"session",sourceHead:"a".repeat(40)},workerCode:"BENAI",previousConversationId:"old",previousConversationUrl:"https://chatgpt.com/g/g-p-project/project",sourceProofSha256:"b".repeat(64)};
await check("frozen original user restrictions survive a machine latest-user summary",()=>{
 const prompt=rollover.buildConversationRolloverPrompt({...base,memory:{context:{id:"ctx",revision:1,sourcePrompt:instruction,summary:"Utolsó felhasználói kontextus: BENJADMIN_EXECUTION_RESULT_V1"},handoff:{id:"hp"}}});
 assert.ok(prompt.includes(instruction));assert.ok(prompt.includes("nem bővíthetik"));assert.ok(prompt.indexOf(instruction)<prompt.indexOf("FOLYTATÁSI KONTEXTUS:"));
});
await check("missing original user instruction restricts continuation to ACK",()=>{
 const prompt=rollover.buildConversationRolloverPrompt({...base,memory:{context:{id:"ctx",revision:1},handoff:{id:"hp"}}});
 assert.ok(prompt.includes("Csak az átadási ACK adható ki"));assert.ok(prompt.includes("új végrehajtást ne indíts"));
});
function health(composerSelector){
 const root={querySelectorAll:()=>[],querySelector:()=>null,getClientRects:()=>[1]};
 const composer={getClientRects:()=>[1]};
 const document={querySelector:s=>s===adapter.CHATGPT_SELECTORS.main?root:s===composerSelector?composer:null};
 return vm.runInNewContext(adapter.DOM_HEALTH_SCRIPT,{document,location:{href:"https://chatgpt.com/c/new"},URL,Date,getComputedStyle:()=>({visibility:"visible"})});
}
await check("semantic textbox is a healthy composer without legacy IDs or form ancestry",()=>{
 const state=health('[role="textbox"][contenteditable="true"]');
 assert.equal(state.ok,true);assert.equal(state.conversationId,"new");
});
await check("plaintext semantic textbox is accepted while a missing composer fails closed",()=>{
 assert.equal(health('[role="textbox"][contenteditable="plaintext-only"]').ok,true);
 const missing=health("no match");assert.equal(missing.ok,false);assert.ok(missing.missing.includes("composer"));
});
await check("legacy composer remains compatible",()=>assert.equal(health("#prompt-textarea").ok,true));
const handler=main.slice(main.indexOf("function handleLargePasteShortcut("),main.indexOf("\nasync function waitForChatComposer",main.indexOf("function handleLargePasteShortcut(")));
await check("large paste uses native focused-field fallback for missing composer once",async()=>{
 let pastes=0,prevented=0;const ids=new Set();
 const context={largePasteNativeFallbackIds:ids,LARGE_PASTE_THRESHOLD:6000,clipboard:{readText:()=>"x".repeat(7000)},insertLargeClipboardText:async()=>({ok:false,reason:"composer-not-found"}),send:()=>{throw Error("Should use native fallback");}};
 vm.createContext(context);vm.runInContext(handler+";globalThis.handle=handleLargePasteShortcut",context);
 const view={webContents:{id:3,paste:()=>pastes++}};
 assert.equal(context.handle({preventDefault:()=>prevented++},{type:"keyDown",control:true,key:"v"},view,{id:"cell-3"}),true);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(pastes,1);assert.equal(prevented,1);
 assert.equal(context.handle({preventDefault:()=>prevented++},{type:"keyDown",control:true,key:"v"},view,{id:"cell-3"}),false);assert.equal(prevented,1);
});
console.log("HANDOFF_USER_CONTRACT_RUNTIME_PASS",count);
