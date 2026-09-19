import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const desktop=path.resolve(here,"..");
const read=(rel)=>fs.readFileSync(path.join(desktop,rel),"utf8");
const require=createRequire(import.meta.url);
const adapter=require(path.join(desktop,"src/chatgpt/chatgpt-dom-adapter.cjs"));
const main=read("src/main.cjs");
const transcript=read("src/context-workspace/chatgpt-transcript.cjs");
const handoff=read("src/context-workspace/chatgpt-handoff.cjs");

let n=0;
function check(label,fn){fn();n+=1;console.log(`PASS ${String(n).padStart(2,"0")} ${label}`)}

check("DOM adapter has explicit version",()=>assert.equal(adapter.CHATGPT_DOM_ADAPTER_VERSION,"1.0.0"));
check("composer selectors are centralized",()=>assert.ok(Array.isArray(adapter.CHATGPT_SELECTORS.composer)&&adapter.CHATGPT_SELECTORS.composer.length>=4));
check("send stop microphone selectors are centralized",()=>{
  assert.ok(adapter.CHATGPT_SELECTORS.sendButton.length>=3);
  assert.ok(adapter.CHATGPT_SELECTORS.stopButton.length>=3);
  assert.ok(adapter.CHATGPT_SELECTORS.microphoneButton.length>=4);
});
check("message and conversation selectors are centralized",()=>{
  assert.ok(adapter.CHATGPT_SELECTORS.messageRole.includes("data-message-author-role"));
  assert.ok(adapter.CHATGPT_SELECTORS.conversationLink.includes("/c/"));
});
check("DOM health probe checks composer route and messages",()=>{
  assert.ok(adapter.DOM_HEALTH_SCRIPT.includes("missing"));
  assert.ok(adapter.DOM_HEALTH_SCRIPT.includes("PROJECT_ROOT"));
  assert.ok(adapter.DOM_HEALTH_SCRIPT.includes("messageCount"));
});
check("transcript uses shared DOM adapter",()=>{
  assert.ok(transcript.includes("chatgpt-dom-adapter.cjs"));
  assert.equal(transcript.includes("data-message-author-role"),false);
});
check("handoff uses shared DOM adapter",()=>{
  assert.ok(handoff.includes("chatgpt-dom-adapter.cjs"));
  assert.equal(handoff.includes("const LATEST_ASSISTANT_SCRIPT = String.raw"),false);
});
check("main uses shared selector literals",()=>{
  for(const token of ["composerSelectorLiteral","sendSelectorLiteral","stopSelectorLiteral","microphoneSelectorLiteral","conversationLinkSelectorLiteral"]){
    assert.ok(main.includes(token),token);
  }
});
check("main has no duplicated core ChatGPT selectors",()=>{
  for(const token of ['#prompt-textarea','button[data-testid="send-button"]','button[data-testid="stop-button"]','button[data-testid="composer-speech-button"]','button[data-testid="voice-mode-button"]','[data-message-author-role]']){
    assert.equal(main.includes(token),false,token);
  }
});
check("active worker conversation is pinned by exact conversation id",()=>{
  assert.ok(main.includes("function conversationPinForCell"));
  assert.ok(main.includes("chatConversationIdFromUrl(value) === conversationId"));
  assert.ok(main.includes("state.pinnedConversationId = pin.conversationId"));
});
check("rollover transition suspends normal pin guard",()=>assert.ok(main.includes('["HANDOFF_SAVED", "NAVIGATING", "CONTINUATION_SENT"]')));
check("conversation guard restores exact authoritative URL",()=>{
  assert.ok(main.includes("await view.webContents.loadURL(pin.conversationUrl)"));
  assert.ok(main.includes("CHAT_CONVERSATION_RESTORED"));
});
check("same-project alternate conversation waits for explicit rebind",()=>{
  assert.ok(main.includes("sameChatProjectConversation(pin.conversationUrl, currentUrl)"));
  assert.ok(main.includes('state.conversationGuardState = "REBIND_PENDING"'));
  assert.ok(main.includes("CHAT_CONVERSATION_REBIND_PENDING"));
});
check("conversation guard is rate limited",()=>{
  assert.ok(main.includes("30_000"));
  assert.ok(main.includes("count >= 3"));
  assert.ok(main.includes("CHAT_CONVERSATION_GUARD_RATE_LIMIT"));
});
check("navigation events enforce pin guard",()=>{
  assert.ok(main.includes('schedulePinnedConversationGuard(cell, view, "did-navigate", 120)'));
  assert.ok(main.includes('schedulePinnedConversationGuard(cell, view, "did-navigate-in-page", 120)'));
});
check("finished load enforces pin and only idle uses latest named fallback",()=>{
  assert.ok(main.includes('schedulePinnedConversationGuard(cell, view, "did-finish-load", 180)'));
  assert.ok(main.includes("if (!pin) void selectLatestNamedConversation(cell, view)"));
});
check("conversation memory mismatch invokes conversation guard instead of silently skipping",()=>assert.ok(main.includes("conversation-memory-mismatch")));
check("active refresh reloads pinned conversation URL",()=>{
  assert.ok(main.includes("const pin = conversationPinForCell(cell)"));
  assert.ok(main.includes("pinnedConversation: Boolean"));
  assert.ok(main.includes("loadURL(pin.conversationUrl)"));
});
check("shared DOM health is sampled by refresh probe",()=>{
  assert.ok(main.includes("inspectChatGptDom(view)"));
  assert.ok(main.includes('cellState.domHealth = domHealth?.ok === true ? "PASS" : "BLOCKED"'));
});
check("latest turn alignment uses shared adapter",()=>{
  assert.ok(main.includes("scrollToLatestChatTurn(view)"));
  assert.ok(adapter.SCROLL_LATEST_SCRIPT.includes("scrollIntoView"));
  assert.ok(adapter.SCROLL_LATEST_SCRIPT.includes("latest-turn-aligned"));
});
check("latest alignment is event driven not conversation-memory polling loop",()=>{
  const start=main.indexOf("async function syncConversationMemoryForWorker");
  const end=main.indexOf("async function syncConversationMemoryOnce",start);
  const fn=main.slice(start,end);
  assert.equal(fn.includes("scrollToLatestChatTurn"),false);
});
check("DOM health is visible in Grid refresh telemetry",()=>{
  assert.ok(main.includes("domBlockedCount"));
  assert.ok(main.includes("CHATGPT_DOM_ADAPTER_BLOCKED"));
  const renderer=read("src/renderer/renderer.js");
  assert.ok(renderer.includes("DOM BLOCKED"));
  assert.ok(renderer.includes("5 percenként élő DOM-smoke"));
});
check("missing composer fails refresh closed",()=>{
  assert.ok(adapter.REFRESH_SAFETY_SCRIPT.includes("busy: !composer || generating || hasDraft"));
  assert.ok(main.includes("ChatGPT DOM adapter nem kész"));
});
console.log(`Developer Grid ChatGPT DOM adapter v1.0 contract PASS · ${n}/${n}`);
