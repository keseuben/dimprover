import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const pkg = JSON.parse(read("desktop/benjadmin-developer-grid/package.json"));
const types = read("app/lib/developer-grid/types.ts");
const backend = read("app/lib/developer-grid/work-start.ts");
const main = read("desktop/benjadmin-developer-grid/src/main.cjs");
const preload = read("desktop/benjadmin-developer-grid/src/preload.cjs");
const renderer = read("desktop/benjadmin-developer-grid/src/renderer/renderer.js");

let n=0;
function check(name, fn){ fn(); n+=1; console.log(`PASS ${String(n).padStart(2,"0")} ${name}`); }

check("desktop version v0.1.61",()=>assert.equal(pkg.version, "0.1.61"));
check("backend version v0.1.61-dev",()=>assert.match(types,/DEVELOPER_GRID_VERSION = "0\.1\.61-dev"/));
check("manual rebind confirmation provenance is typed",()=>assert.match(types,/USER_MANUAL_REBIND/));
check("backend exposes explicit manualRebind path",()=>assert.match(backend,/const manualRebind = rawInput\.manualRebind === true/));
check("manual rebind requires exact authoritative previous conversation",()=>assert.match(backend,/surfacePreviousConversationId !== authoritativeConversationId/));
check("manual rebind requires a different new conversation",()=>assert.match(backend,/surfaceConversationId === authoritativeConversationId/));
check("manual rebind requires same ChatGPT Project",()=>{ assert.match(backend,/chatProjectKeyFromConversationUrl/); assert.match(backend,/previousProjectKey !== nextProjectKey/); });
check("manual rebind requires validated BOOT ACK",()=>assert.match(backend,/DEVELOPER_GRID_MANUAL_REBIND_BOOT_ACK_REQUIRED/));
check("manual rebind requires Context and Handoff continuity",()=>assert.match(backend,/DEVELOPER_GRID_MANUAL_REBIND_CONTINUITY_REQUIRED/));
check("manual rebind remains PROD DENY",()=>assert.match(backend,/Kézi conversation rebind PROD hozzáféréssel tiltott/));
check("manual rebind keeps engine task RUNNING",()=>assert.match(backend,/conversationRollover \|\| manualRebind\) \? "RUNNING" : "HANDED_OFF"/));
check("manual rebind writes dedicated audit event",()=>assert.match(backend,/CONVERSATION_MANUAL_REBIND/));
check("manual rebind records USER_MANUAL_REBIND",()=>assert.match(backend,/USER_MANUAL_REBIND/));
check("manual rebind clears stale rollover fields",()=>assert.match(backend,/manualRebind \? \{[\s\S]*conversationRolloverState: null[\s\S]*conversationRolloverCompletedAt: null/));
check("same-project different chat becomes REBIND_PENDING",()=>{ assert.match(main,/sameChatProjectConversation\(pin\.conversationUrl, currentUrl\)/); assert.match(main,/conversationGuardState = "REBIND_PENDING"/); });
check("project-root or foreign drift never auto-restores pinned URL",()=>{const a=main.indexOf("async function ensurePinnedConversation");const b=main.indexOf("function schedulePinnedConversationGuard",a);const block=main.slice(a,b);assert.doesNotMatch(block,/loadURL\(pin\.conversationUrl\)/);assert.match(block,/CHAT_CONVERSATION_BROWSE_NO_NAVIGATION/);assert.match(block,/CHAT_CONVERSATION_MISMATCH_NO_NAVIGATION/);});
check("pending rebind is explicit and never auto-adopted",()=>assert.match(main,/CHAT_CONVERSATION_REBIND_PENDING/));
check("desktop rebind action calls backend with manualRebind",()=>{ const start=main.indexOf("async function rebindCurrentTaskConversation"); const end=main.indexOf("function assignedWorkerCodeFromWork",start); const block=main.slice(start,end); assert.match(block,/manualRebind:true/); assert.doesNotMatch(block,/prepareWorkerTaskLaunch/); assert.doesNotMatch(block,/TASK_LAUNCH_PROMPT_MARKER/); });
check("desktop rebind requires pending exact task and conversation",()=>assert.match(main,/MANUAL_REBIND_PENDING_REQUIRED/));
check("IPC exposes explicit rebind action",()=>assert.match(main,/task:rebind-conversation/));
check("preload exposes rebind action",()=>assert.match(preload,/rebindTaskConversation/));
check("renderer exposes CSEVEGŐ ÁTKÖTÉSE state",()=>{ assert.match(renderer,/CSEVEGŐ ÁTKÖTÉSE/); assert.match(renderer,/launchAction = rebindPending \? "rebind"/); });
check("renderer calls rebind API without launch preparation",()=>assert.match(renderer,/rebindMode[\s\S]*api\.rebindTaskConversation/));
check("refresh telemetry exposes pending rebind count",()=>assert.match(main,/conversationRebindPendingCount/));
check("refresh event rerenders worker header immediately",()=>assert.match(renderer,/onChatRefreshState\?\.[\s\S]*renderLive\(\)[\s\S]*renderChatRefreshStatus\(\)/));
check("manual rebind response explicitly preserves same task without new launch",()=>assert.match(main,/Új TASK_LAUNCH nem készült/));

console.log(`Developer Grid manual conversation rebind v0.1.58 contract PASS · ${n}/${n}`);
