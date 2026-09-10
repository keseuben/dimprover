import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=(rel)=>fs.readFileSync(path.join(root,rel),"utf8");
const work=read("app/lib/developer-grid/work-start.ts");
const main=read("desktop/benjadmin-developer-grid/src/main.cjs");
const preload=read("desktop/benjadmin-developer-grid/src/preload.cjs");
const ui=read("desktop/benjadmin-developer-grid/src/renderer/context-workspace.js");
let n=0; const check=(label,fn)=>{fn();n+=1;console.log(`PASS ${String(n).padStart(2,"0")} ${label}`)};

function status(rawStatus, bridgeState){
  const r=String(rawStatus||"").toLowerCase(); const b=String(bridgeState||"").toUpperCase();
  const claimedAwaitingBootAck=r==="claimed" && !["RUNNING","RESULT_PENDING"].includes(b);
  return r==="completed"?"COMPLETED":r==="blocked"||r==="failed"?"BLOCKED":r==="testing"?"REVIEW":r==="queued"||r==="ready"||claimedAwaitingBootAck?"READY":"RUNNING";
}
check("claimed + HANDed off remains pre-BOOT READY",()=>assert.equal(status("claimed","HANDED_OFF"),"READY"));
check("claimed + TASK_BOUND/empty bridge remains pre-BOOT READY",()=>assert.equal(status("claimed","WAITING_HANDOFF"),"READY"));
check("claimed + RUNNING becomes RUNNING",()=>assert.equal(status("claimed","RUNNING"),"RUNNING"));
check("claimed + RESULT_PENDING stays RUNNING lifecycle",()=>assert.equal(status("claimed","RESULT_PENDING"),"RUNNING"));
check("queued remains READY",()=>assert.equal(status("queued",""),"READY"));
check("testing remains REVIEW",()=>assert.equal(status("testing","RUNNING"),"REVIEW"));
check("status mapper is exported and used by engine conversion",()=>{assert.match(work,/export function gridTaskStatusFromEngine/);assert.match(work,/gridTaskStatusFromEngine\(task\.status, metadata\.bridgeState\)/)});
check("active-session reconciliation reads every open Grid session",()=>assert.match(work,/const allActiveSessions = state\.sessions\.filter\(\(session\) => session\.endedAt === null\)/));
check("active-session reconciliation restores engine task pointer",()=>{assert.match(work,/AUTHORITATIVE_TASK_RESTORED_FROM_ACTIVE_SESSION/);assert.match(work,/state = await upsertGridTask\(task\)/)});
check("terminal engine task cannot be restored as active",()=>assert.match(work,/!\["completed", "blocked", "failed", "cancelled"\]\.includes/));
check("waiting task preserves unrelated active session task pointer",()=>{assert.match(work,/const preservedActiveSession = beforeWaiting\.sessions\.find/);assert.match(work,/preservedActiveSession \? beforeWaiting : await upsertGridTask\(task\)/)});
check("waiting response exposes queued task without fake session",()=>{assert.match(work,/queuedTask: task/);assert.match(work,/preservedActiveTaskId:/);assert.match(work,/session: null/)});
check("validated BOOT ACK promotes local Grid task to RUNNING",()=>assert.match(work,/if \(validated\) \{[\s\S]*?syncEngineBridgeTarget\(taskId, "RUNNING"\)[\s\S]*?status: "RUNNING"/));
check("resume launch IPC exposed to renderer",()=>assert.match(preload,/resumeDeveloperGridTaskLaunch: \(\) => ipcRenderer\.invoke\("work-start:resume-launch"\)/));
check("resume launch IPC exists in main process",()=>assert.match(main,/ipcMain\.handle\("work-start:resume-launch"/));
check("resume launch requires authoritative task and session",()=>assert.match(main,/ACTIVE_TASK_SESSION_REQUIRED/));
check("resume launch rejects stale source reconciliation",()=>assert.match(main,/ACTIVE_TASK_SOURCE_STALE/));
check("BOOT ACK revalidates current source provenance server-side",()=>assert.match(work,/await verifyCurrentSourceExecutionState\(expected, \{ requireClean: false \}\)[\s\S]*?sourceProvenance/));
check("resume launch rejects already validated BOOT ACK",()=>assert.match(main,/BOOT_ACK_ALREADY_VALIDATED/));
check("resume launch checks current bound ChatGPT conversation",()=>assert.match(main,/ACTIVE_TASK_CHAT_MISMATCH/));
check("resume launch auto-sends same task Launch Packet",()=>assert.match(main,/prepareWorkerTaskLaunch\(code, task\.id, \{ autoSend:true, taskOverride:launchTask \}\)/));
check("resume launch never calls work-start create",()=>{const block=main.slice(main.indexOf('ipcMain.handle("work-start:resume-launch"'),main.indexOf('ipcMain.handle("work-close:run"'));assert.ok(block);assert.doesNotMatch(block,/startDeveloperGridWork\(/)});
check("Central Core shows resume button for pre-BOOT active session",()=>{assert.match(ui,/canResumeLaunch/);assert.match(ui,/INDÍTÁS FOLYTATÁSA/)});
check("resume button has explicit click handler",()=>assert.match(ui,/workResumeButton[\s\S]*?resumeWorkLaunch/));
check("resume action calls dedicated IPC not new task creation",()=>{const start=ui.indexOf("async function resumeWorkLaunch");const end=ui.indexOf("function setNotice",start);const block=ui.slice(start,end);assert.match(block,/resumeDeveloperGridTaskLaunch/);assert.doesNotMatch(block,/startDeveloperGridWork/)});
check("waiting UI refreshes authoritative active task",()=>assert.match(ui,/routingState==="WAITING_FOR_WORKER"[\s\S]*?getDeveloperGridActiveWork/));
check("waiting UI reports preserved active task",()=>assert.match(ui,/preservedActiveTaskId/));
console.log(`Developer Grid launch recovery v0.1.36 contract PASS · ${n}/${n}`);
