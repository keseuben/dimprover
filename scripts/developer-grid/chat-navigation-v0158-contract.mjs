import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const main=fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/src/main.cjs"),"utf8");
let n=0; function check(name,fn){fn();n+=1;console.log("PASS "+String(n).padStart(2,"0")+" "+name);}
check("ChatGPT window.open is denied as separate window",()=>{const a=main.indexOf("view.webContents.setWindowOpenHandler");const b=main.indexOf("view.webContents.on(\"will-navigate\"",a);const block=main.slice(a,b);assert.match(block,/if \(isChatGptUrl\(url\)\)/);assert.match(block,/return \{ action: "deny" \}/);assert.doesNotMatch(block,/action: "allow"/);});
check("ChatGPT window.open loads same worker view",()=>{const a=main.indexOf("view.webContents.setWindowOpenHandler");const b=main.indexOf("view.webContents.on(\"will-navigate\"",a);const block=main.slice(a,b);assert.match(block,/view\.webContents\.loadURL\(url\)/);});
check("external https links leave embedded view",()=>{const a=main.indexOf("view.webContents.setWindowOpenHandler");const b=main.indexOf("view.webContents.on(\"will-navigate\"",a);const block=main.slice(a,b);assert.match(block,/shell\.openExternal\(url\)/);});
check("ordinary conversation mismatch becomes no-navigation block",()=>assert.match(main,/CHAT_CONVERSATION_MISMATCH_NO_NAVIGATION/));
check("home or non-conversation browsing becomes no-navigation state",()=>assert.match(main,/CHAT_CONVERSATION_BROWSE_NO_NAVIGATION/));
check("guard exposes MISMATCH_BLOCKED state",()=>assert.match(main,/conversationGuardState = "MISMATCH_BLOCKED"/));
check("guard exposes BROWSING state",()=>assert.match(main,/conversationGuardState = "BROWSING"/));
check("ordinary guard tail no longer auto-loads pinned URL",()=>{const a=main.indexOf("async function ensurePinnedConversation");const b=main.indexOf("function schedulePinnedConversationGuard",a);const block=main.slice(a,b);const tail=block.slice(block.indexOf("clearConversationNavigationGrace(state);",block.indexOf("if (!currentId && sameChatProjectRoute")));assert.doesNotMatch(tail,/loadURL\(pin\.conversationUrl\)/);});
check("proven same-project rebind still remains pending",()=>assert.match(main,/conversationGuardState = "REBIND_PENDING"/));
check("conversation memory monitor remains no-navigation",()=>{const a=main.indexOf("async function syncConversationMemoryForWorker");const b=main.indexOf("async function syncConversationMemoryOnce",a);const block=main.slice(a,b);assert.doesNotMatch(block,/loadURL\(/);assert.doesNotMatch(block,/ensurePinnedConversation\(/);});
console.log("Developer Grid chat navigation v0.1.58 contract PASS · "+n+"/"+n);
