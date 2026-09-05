import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, "..");
const repo = path.resolve(desktop, "../..");
const read = (rel) => fs.readFileSync(path.join(repo, rel), "utf8");
const main = read("desktop/benjadmin-developer-grid/src/main.cjs");
const renderer = read("desktop/benjadmin-developer-grid/src/renderer/renderer.js");
const workspace = read("desktop/benjadmin-developer-grid/src/renderer/context-workspace.js");
const styles = read("desktop/benjadmin-developer-grid/src/renderer/styles.css");
const index = read("desktop/benjadmin-developer-grid/src/renderer/index.html");
const preload = read("desktop/benjadmin-developer-grid/src/preload.cjs");
const client = read("desktop/benjadmin-developer-grid/src/context-workspace/context-workspace-client.cjs");
const live = read("desktop/benjadmin-developer-grid/src/live/benjadmin-live-client.cjs");
const types = read("app/lib/developer-grid/types.ts");
const workStart = read("app/lib/developer-grid/work-start.ts");
const route = read("app/api/dev/grid/work-start/route.ts");
const taskPrompt = read("desktop/benjadmin-developer-grid/src/task-launch/prompt-builder.cjs");
let checks = 0;
function check(ok,label){checks+=1;if(!ok)throw new Error(`FAIL ${String(checks).padStart(2,"0")} ${label}`);console.log(`PASS ${String(checks).padStart(2,"0")} ${label}`)}

check((index.match(/class="context-row"/g)||[]).length===4,"worker header merges context and work item into row 2");
check(!index.includes('cell-header__bottom"><span data-role="work-item"'),"old standalone work-item row removed");
check(main.includes("const CELL_HEADER_HEIGHT = 108;"),"native worker header uses 108px large-display geometry");
check(styles.includes("--cell-header-h: 108px"),"CSS worker header matches native 108px geometry");
check(styles.includes("min-height:33px; height:33px") && styles.includes("font-size:clamp(9.5px,.31vw,11.5px)"),"workflow timeline enlarged and readable on large displays");
check(main.includes("const DEVELOPER_FOOTER_HEIGHT = 42;"),"native footer uses 42px large-display geometry");
check(styles.includes("--developer-footer-h: 42px"),"CSS footer matches native 42px geometry");
check(styles.includes("font-size:clamp(10.5px,.32vw,13px)"),"footer typography scales for large displays");
check(renderer.includes('dot.closest(".footer-status")') && styles.includes(".footer-status.is-online"),"footer health tone colors the entire segment");

check(types.includes('ChatLaunchMode = "EXISTING_CHAT" | "NEW_PROJECT_CHAT"'),"authoritative chat launch modes typed");
check(workspace.includes('value="EXISTING_CHAT"') && workspace.includes('value="NEW_PROJECT_CHAT"'),"control center exposes existing/new project chat choice");
check(workspace.includes("chatLaunchMode:state.workStartChatMode"),"work-start submits selected chat mode");
check(workStart.includes("chatLaunchMode: input.chatLaunchMode"),"work-start stores chat mode in developmentContext");
check(route.includes("export async function PATCH") && route.includes("bindDeveloperGridConversation"),"paired DEV API binds conversation authoritatively");
check(client.includes('method: "PATCH"') && preload.includes("bindTaskConversation"),"desktop exposes conversation binding IPC path");
check(main.includes("TASK_NEW_PROJECT_CHAT_REQUIRED") && main.includes("previousConversationId"),"new project chat must differ from prior conversation");
check(main.includes("taskOverride: task"),"existing-chat auto binding does not race next DELTA snapshot");
check(renderer.includes('"CSEVEGÉS RÖGZÍTÉSE"') && renderer.includes('dataset.launchAction = needsConversationBinding ? "bind" : "prepare"'),"worker launch is binding-first when required");
check(main.includes("TASK_CHAT_CONVERSATION_MISMATCH"),"task launch fails closed on wrong current conversation");
check(renderer.includes("explicitChatPlan") && main.includes("launchProbe"),"chat-planned READY task remains launchable despite session startedAt");
check(live.includes("chatConversationConfirmedAt") && main.includes("authoritative = task?.chatLaunchMode"),"conversation binding survives desktop restart through authoritative state");
check(!workspace.includes("Automatikus · Central Core választ") && workspace.includes("Válassz kódmérnököt") && workStart.includes("DEVELOPER_GRID_WORKER_REQUIRED"),"work-start requires explicit worker and has no automatic fallback");
check(workspace.includes(">ÁrminAI<") && workspace.includes(">OutminAI<") && workspace.includes(">BenjáminAI<") && workspace.includes(">JázminAI<"),"all four coding engineers are explicitly selectable");
check(renderer.includes('api.contextWorkspaceMode?.("open")') && !renderer.includes("api.prepareDailyStart();"),"daily start opens Central Core control panel instead of a worker chat");
check(!main.includes("prepareBenAiDailyStart") && !main.includes('daily:prepare-start') && !preload.includes("prepareDailyStart"),"legacy BenAI coordinator daily-start IPC is removed, not merely hidden");
check(live.includes("continuityPreviousWorkerCode") && live.includes("continuityHandoffId"),"continuity metadata survives authoritative live adapter");
check(taskPrompt.includes("FOLYTATÁSI KONTEXTUS – CENTRAL CORE") && taskPrompt.includes("Legfrissebb hiteles handoff ID"),"worker task prompt carries continuity handoff context");
check(taskPrompt.includes("Minden érdemi munkarész után frissítsd a Developer Grid központi fejlesztési állapotát"),"worker is required to report work segments to central state");

check(main.includes("async function applyWorkspaceStandbyLock"),"workspace standby lock has native controller");
check(main.includes("__benjadmin_workspace_standby__"),"standby overlay is injected into ChatGPT WebContents");
check(main.includes('opacity:".72"'),"standby avatar is visually softened to preserve active-worker focus");
check(main.includes('rgba(${accent.rgb},0.20)') && main.includes('brightness(94%)'),"standby overlay uses lighter low-emphasis glass");
check(main.includes("workerVisualAccent(cell)"),"standby overlay follows worker avatar accent");
check(main.includes("sessionStorage.setItem(key,\"1\")"),"avatar click unlock persists for current app tab session");
check(main.includes("syncWorkspaceStandbyLocks(snapshot)"),"live snapshot automatically unlocks assigned worker");
check(main.includes('cell.id === "central"'),"DevminAI central view excluded from primary workspace standby lock");
check(!main.includes('NEW_PROJECT_CHAT") await view.webContents.loadURL'),"Developer Grid does not auto-create external ChatGPT project chats");

console.log(`Developer Grid workspace/chat regression contract PASS · ${checks}/${checks}`);
