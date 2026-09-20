import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const main=fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/src/main.cjs"),"utf8");
let n=0; function check(name,fn){fn();n+=1;console.log("PASS "+String(n).padStart(2,"0")+" "+name);}

check("cookie suppression window is 5 seconds",()=>assert.match(main,/CHAT_COOKIE_SYNC_SUPPRESS_MS = 5000/));
check("auth cookie sync is restricted to ChatGPT/OpenAI domains",()=>{assert.match(main,/function isSharedChatAuthCookie\(cookie\)/);assert.match(main,/domain === "chatgpt\.com"/);assert.match(main,/domain === "openai\.com"/);});
check("cookie deletion is never propagated",()=>{const a=main.indexOf('const listener = (_event, cookie, _cause, removed) => {');const b=main.indexOf('sourceSession.cookies.on("changed", listener)',a);const block=main.slice(a,b);assert.match(block,/if \(removed \|\| !isSharedChatAuthCookie\(cookie\)\) return/);assert.doesNotMatch(block,/cookies\.remove/);});
check("cookie apply is set-only",()=>{const a=main.indexOf("async function applyChatCookieToPartition");const b=main.indexOf("function configureChatSession",a);const block=main.slice(a,b);assert.match(block,/cookies\.set\(normalized\)/);assert.doesNotMatch(block,/cookies\.remove/);});
check("suppression remains active for whole TTL",()=>{const a=main.indexOf("function isChatCookieEventSuppressed");const b=main.indexOf("async function applyChatCookieToPartition",a);const block=main.slice(a,b);assert.match(block,/return Number\(chatCookieSyncSuppressions\.get\(key\) \|\| 0\) > now/);assert.doesNotMatch(block,/chatCookieSyncSuppressions\.delete\(key\).*return true/s);});
check("bootstrap copies only missing auth cookies",()=>assert.match(main,/!existingKeys\.has\(key\) && isSharedChatAuthCookie\(cookie\)/));
check("Google OAuth popup is recognized",()=>assert.match(main,/host === "accounts\.google\.com"/));
check("Apple OAuth popup is recognized",()=>assert.match(main,/host === "appleid\.apple\.com"/));
check("OpenAI auth popup hosts are recognized",()=>{assert.match(main,/host === "auth\.openai\.com"/);assert.match(main,/host === "auth0\.openai\.com"/);});
check("OAuth popup uses current worker partition",()=>{const a=main.indexOf("if (isChatAuthPopupUrl(url))");const b=main.indexOf("if (isChatGptUrl(url))",a);const block=main.slice(a,b);assert.match(block,/chatSessionPartitions\.get\(cell\.id\) \|\| chatPartitionForCell\(cell\)/);assert.match(block,/action: "allow"/);assert.match(block,/partition,/);});
check("ChatGPT window-open still stays in same worker view",()=>{const a=main.indexOf("if (isChatGptUrl(url))");const b=main.indexOf("setImmediate\(\(\) => void shell\.openExternal",a);const block=main.slice(a,b);assert.match(block,/view\.webContents\.loadURL\(url\)/);assert.match(block,/return \{ action: "deny" \}/);});
check("unrelated https links still leave embedded view",()=>assert.match(main,/shell\.openExternal\(url\)/));
console.log("Developer Grid auth isolation v0.1.59 contract PASS · "+n+"/"+n);
