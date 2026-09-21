import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=(rel)=>fs.readFileSync(path.join(root,rel),"utf8");
const main=read("desktop/benjadmin-developer-grid/src/main.cjs");
const preload=read("desktop/benjadmin-developer-grid/src/preload.cjs");
const renderer=read("desktop/benjadmin-developer-grid/src/renderer/renderer.js");
const css=read("desktop/benjadmin-developer-grid/src/renderer/styles.css");
const rollover=read("desktop/benjadmin-developer-grid/src/context-workspace/conversation-rollover.cjs");
const types=read("app/lib/developer-grid/types.ts");
const pkg=JSON.parse(read("desktop/benjadmin-developer-grid/package.json"));
let n=0;
function check(label,fn){fn();n+=1;console.log("PASS "+String(n).padStart(2,"0")+" "+label);}

check("desktop version v0.1.64",()=>assert.equal(pkg.version,"0.1.64"));
check("backend version v0.1.64-dev",()=>assert.match(types,/DEVELOPER_GRID_VERSION = "0\.1\.64-dev"/));
check("manual clipboard rollover state exists",()=>{assert.match(rollover,/CLIPBOARD_COPIED/);assert.match(types,/CLIPBOARD_COPIED/)});
check("bootstrap points to Central Core authority",()=>assert.match(rollover,/CENTRAL CORE BOOTSTRAP/));
check("preload exposes rollover prepare/copy/download",()=>{assert.match(preload,/prepareConversationRollover/);assert.match(preload,/copyConversationRollover/);assert.match(preload,/downloadConversationRolloverHandoff/)});
check("main exposes rollover IPC handlers",()=>{assert.match(main,/conversation-rollover:prepare/);assert.match(main,/conversation-rollover:copy/);assert.match(main,/conversation-rollover:download/)});
check("prepare writes fresh conversation memory",()=>assert.match(main,/saveDeveloperGridConversationMemory/));
check("prepare creates PARTIAL continuation MD",()=>{assert.match(main,/buildManualRolloverHandoffMarkdown/);assert.match(main,/status:"PARTIAL"/);assert.match(main,/saveManualRolloverHumanHandoff/)});
check("prepare freezes context handoff and human handoff ids",()=>{assert.match(main,/conversationRolloverContextSnapshotId/);assert.match(main,/conversationRolloverHandoffPackId/);assert.match(main,/conversationRolloverHumanHandoffId/)});
check("copy writes bootstrap to clipboard",()=>{assert.match(main,/clipboard\.writeText\(prepared\.prompt\)/);assert.match(main,/CLIPBOARD_COPIED/)});
check("MD download uses existing verified handoff downloader",()=>assert.match(main,/promptHandoffDownload\(handoffId/));
check("new conversation needs USER rollover marker before bind",()=>{assert.match(main,/observeManualConversationRollover/);assert.match(main,/toUpperCase\(\) === "USER"/);assert.match(main,/ROLLOVER_PROMPT_MARKER/)});
check("successor binds into ACK_WAIT",()=>{assert.match(main,/manual-conversation-rollover-ack-wait/);assert.match(main,/state:ROLLOVER_STATES\.ACK_WAIT/)});
check("manual bind carries MANUAL_CONTINUATION reason",()=>{assert.match(main,/conversationRolloverReason:String\(record\.conversationRolloverReason \|\| "CONTEXT_LIMIT"\)/);assert.match(types,/conversationRolloverReason\?: "CONTEXT_LIMIT" \| "MANUAL_CONTINUATION" \| null/);});
check("existing ACK validator remains authoritative",()=>assert.match(main,/processConversationRolloverAck/));
check("three requested header actions are icon buttons",()=>{assert.match(renderer,/HEADER_ACTION_ICONS/);assert.match(renderer,/"current-task":"☷"/);assert.match(renderer,/"context":"⌘"/);assert.match(renderer,/"checkpoint":"✓"/)});
check("rollover icon has orange green red states",()=>{assert.match(css,/conversation-rollover-button/);assert.match(css,/background:#fff2df/);assert.match(css,/data-rollover-state="ready"/);assert.match(css,/data-rollover-state="blocked"/)});
check("blue MD download icon exists",()=>{assert.match(renderer,/conversation-rollover-download-button/);assert.match(renderer,/Teljes MD átadó letöltése/);assert.match(css,/border:1px solid #2876b6/);assert.match(css,/background:#eaf4ff/)});
check("compact icon buttons match phase control height",()=>{assert.match(css,/stage-action-icon-button,[\s\S]*width:27px;[\s\S]*height:27px/);assert.match(css,/conversation-rollover-download-button \{ width:27px;/)});
check("rollover UI keeps tooltips and aria labels",()=>{assert.match(renderer,/setAttribute\("aria-label", button\.title\)/);assert.match(renderer,/setAttribute\("aria-label", ui\.title\)/);assert.match(renderer,/download\.setAttribute\("aria-label", download\.title\)/)});
check("manual rollover never starts a new task",()=>{const start=main.indexOf("async function prepareManualConversationRollover");const end=main.indexOf("function conversationMemoryTaskForWorker",start);const body=main.slice(start,end);assert.doesNotMatch(body,/startDeveloperGridWork|prepareWorkerTaskLaunch|TASK_LAUNCH_PROMPT_MARKER/)});

console.log("Developer Grid manual conversation rollover v0.1.63 contract PASS · "+n+"/"+n);
