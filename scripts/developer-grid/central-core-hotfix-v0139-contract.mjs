import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const pkg = JSON.parse(read("desktop/benjadmin-developer-grid/package.json"));
const types = read("app/lib/developer-grid/types.ts");
const engine = read("app/lib/dev-center/engine-repository.ts");
const heartbeat = read("app/lib/developer-grid/session-heartbeat.ts");
const materializer = read("app/lib/developer-grid/task-session-materializer.ts");
const main = read("desktop/benjadmin-developer-grid/src/main.cjs");
const domAdapter = read("desktop/benjadmin-developer-grid/src/chatgpt/chatgpt-dom-adapter.cjs");
const preload = read("desktop/benjadmin-developer-grid/src/preload.cjs");
const ui = read("desktop/benjadmin-developer-grid/src/renderer/context-workspace.js");
const settingsHtml = read("desktop/benjadmin-developer-grid/src/renderer/index.html");
const renderer = read("desktop/benjadmin-developer-grid/src/renderer/renderer.js");
const defaults = read("desktop/benjadmin-developer-grid/src/config/defaults.cjs");

let n=0;
function check(label, fn){ fn(); n+=1; console.log(`PASS ${String(n).padStart(2,"0")} ${label}`); }

check("package version v0.1.58",()=>assert.equal(pkg.version,"0.1.58"));
check("backend version v0.1.58-dev",()=>assert.match(types,/DEVELOPER_GRID_VERSION = "0\.1\.58-dev"/));

check("bind_task records authoritative claimed session id",()=>{
  assert.match(engine,/claimed_by_session_id:\s*sessionId/);
  assert.match(engine,/assigned_worker_id:\s*current\.workerId/);
});
check("bind_task opens task claim lease for heartbeat",()=>{
  assert.match(engine,/claim_expires_at:\s*leaseIso\(900\)/);
  assert.match(engine,/last_claimed_at:\s*claimedAt/);
});
check("heartbeat validates the same claimed session binding",()=>{
  assert.match(heartbeat,/engineTask\.claimedBySessionId !== engineSessionId/);
  assert.match(heartbeat,/engineTask\.assignedWorkerId !== engineWorker\.id/);
});

check("materializer refuses to synthesize work without bridge task+session",()=>{
  assert.match(materializer,/if \(!bridge\.task \|\| !bridge\.session\)/);
  assert.match(materializer,/materialized:\s*false as const/);
  assert.match(materializer,/reason:\s*"NO_ACTIVE_BRIDGE_SESSION"/);
});
check("materializer no longer uses random synthetic session ids",()=>{
  assert.doesNotMatch(materializer,/randomUUID/);
  assert.doesNotMatch(materializer,/outmin-\$\{DEVELOPER_GRID_TASK_ID\}/);
});
check("materializer uses actual bridge task id",()=>{
  assert.match(materializer,/sourceTaskId = text\(bridgeTask\.id\)/);
  assert.match(materializer,/taskId:\s*sourceTaskId/);
});

check("ChatGPT send keeps marker fail-closed",()=>{
  assert.match(main,/marker && !read\(\)\.includes\(marker\)/);
  assert.match(main,/marker-mismatch/);
});
check("ChatGPT send supports current send testid variants through shared DOM adapter",()=>{
  assert.ok(domAdapter.includes('button[data-testid="send-button"]'));
  assert.ok(domAdapter.includes('button[data-testid*="send"]'));
  assert.match(main,/sendSelectorLiteral/);
});
check("ChatGPT send supports same-form submit and semantic requestSubmit fallback",()=>{
  assert.match(main,/composer\.closest\('form'\)/);
  assert.ok(domAdapter.includes('main form button[type="submit"]'));
  assert.match(main,/typeof form\.requestSubmit === 'function'/);
  assert.match(main,/form\.requestSubmit\(\)/);
});
check("ChatGPT send still verifies observed delivery",()=>{
  assert.match(main,/send-not-observed/);
  assert.match(main,/stopSelectorLiteral/);
  assert.match(domAdapter,/stop-button/);
});

check("Launch Packet and BOOT ACK accepted continuation share auto-send helper",()=>{
  const calls=(main.match(/sendPreparedChatPrompt\(/g)||[]).length;
  assert.ok(calls>=3,`expected shared helper calls, got ${calls}`);
  assert.match(main,/BOOT_ACK_ACCEPTED_V1/);
  assert.match(main,/TASK_LAUNCH_V3/);
});

check("Central Core refreshes authoritative active work after normal start",()=>{
  const start=ui.indexOf("async function startWork()");
  const end=ui.indexOf("async function resumeWorkLaunch()",start);
  const block=ui.slice(start,end);
  assert.match(block,/await api\.getDeveloperGridActiveWork\?\.\(\)/);
  assert.match(block,/state\.activeWork=authoritative\.activeWork/);
});

check("Windows autostart toggle is visible in Settings",()=>{
  assert.match(settingsHtml,/id="launchAtLoginInput"/);
  assert.match(settingsHtml,/Developer Grid induljon el a Windows indításakor/);
  assert.match(settingsHtml,/BE: Windows bejelentkezéskor automatikusan elindul/);
  assert.match(settingsHtml,/KI: csak kézi indítással indul/);
});
check("Windows autostart setting has persistent config default",()=>{
  assert.match(defaults,/launchAtLogin:\s*true/);
  assert.match(defaults,/typeof input\.launchAtLogin === "boolean"\) next\.launchAtLogin = input\.launchAtLogin/);
});
check("Settings renderer reads and saves launchAtLogin",()=>{
  assert.match(renderer,/\$\("#launchAtLoginInput"\)\.checked = state\.config\.launchAtLogin === true/);
  assert.match(renderer,/next\.launchAtLogin = \$\("#launchAtLoginInput"\)\.checked/);
});
check("main process applies actual Windows login item state",()=>{
  assert.match(main,/app\.setLoginItemSettings\(/);
  assert.match(main,/openAtLogin:\s*config\?\.launchAtLogin === true/);
  assert.match(main,/args:\s*config\?\.launchAtLogin === true \? \["--autostart"\] : \[\]/);
});
check("config update applies autostart after save",()=>{
  assert.match(main,/function saveConfig\(/);
  assert.match(main,/applyLoginItemSetting\(\)/);
  assert.match(preload,/updateConfig:\s*\(config\) => ipcRenderer\.invoke\("config:update"/);
});

console.log(`Developer Grid Central Core hotfix v0.1.58 contract PASS · ${n}/${n}`);
