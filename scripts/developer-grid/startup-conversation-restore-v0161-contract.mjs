import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const main=fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/src/main.cjs"),"utf8");
const pkg=JSON.parse(fs.readFileSync(path.join(root,"desktop/benjadmin-developer-grid/package.json"),"utf8"));
const types=fs.readFileSync(path.join(root,"app/lib/developer-grid/types.ts"),"utf8");
let n=0;
function check(label,fn){fn();n+=1;console.log("PASS "+String(n).padStart(2,"0")+" "+label);}

const start=main.indexOf("function rememberChatNavigation");
const end=main.indexOf("function captureWorkerConversationGuards",start);
const remember=start>=0&&end>start?main.slice(start,end):"";
const rememberCode=remember.split("\n").filter((line)=>!line.trim().startsWith("//")).join("\n");

check("desktop version v0.1.62",()=>assert.equal(pkg.version,"0.1.62"));
check("backend version v0.1.62-dev",()=>assert.match(types,/DEVELOPER_GRID_VERSION = "0\.1\.62-dev"/));
check("navigation memory function exists",()=>assert.ok(start>=0&&end>start));
check("navigation memory remains opt-in",()=>assert.match(rememberCode,/rememberLastConversation/));
check("only ChatGPT conversation routes are persisted",()=>assert.match(rememberCode,/isChatConversationUrl\(url\)/));
check("visible conversation URL is persisted to cell config",()=>assert.match(rememberCode,/target\.url = url/));
check("startup memory is independent from executable task-pin lookup",()=>assert.ok(!rememberCode.includes("const pin = conversationPinForCell(")));
check("startup loads persisted cell URL",()=>assert.match(main,/const targetUrl = cell\.url \|\| defaultWorkerSurfaceUrl/));
check("normal navigation records visible URL",()=>assert.match(main,/did-navigate", \(_event, url\) => \{\s*rememberChatNavigation\(cell\.id, url\)/));
check("in-page navigation records visible URL",()=>assert.match(main,/did-navigate-in-page", \(_event, url, isMainFrame\) => \{[\s\S]*rememberChatNavigation\(cell\.id, url\)/));
check("task pin remains a separate authority function",()=>assert.match(main,/function conversationPinForCell\(cell\)/));
check("same-project drift remains REBIND_PENDING",()=>assert.match(main,/sameChatProjectConversation\(pin\.conversationUrl, currentUrl\)[\s\S]*conversationGuardState = "REBIND_PENDING"/));
check("mismatched conversation still forbids automatic navigation",()=>assert.match(main,/CHAT_CONVERSATION_MISMATCH_NO_NAVIGATION/));
check("remembering navigation does not launch tasks",()=>assert.doesNotMatch(rememberCode,/TASK_LAUNCH|launch|prepare/i));

console.log("Developer Grid startup conversation restore v0.1.61 contract PASS · "+n+"/"+n);
