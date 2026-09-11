import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const main = fs.readFileSync(path.join(root, "desktop/benjadmin-developer-grid/src/main.cjs"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "desktop/benjadmin-developer-grid/package.json"), "utf8"));
const types = fs.readFileSync(path.join(root, "app/lib/developer-grid/types.ts"), "utf8");

let n = 0;
function check(label, fn) { fn(); n += 1; console.log(`PASS ${String(n).padStart(2,"0")} ${label}`); }

check("current package keeps v0.1.37 recovery", () => assert.equal(pkg.version, "0.1.38"));
check("current backend keeps v0.1.37 recovery", () => assert.match(types, /DEVELOPER_GRID_VERSION = "0\.1\.38-dev"/));
check("shared BOOT ACK processor exists", () => assert.match(main, /async function processCapturedBootAck\(/));
check("shared BOOT ACK processor persists authoritative ACK", () => {
  const start = main.indexOf("async function processCapturedBootAck(");
  const end = main.indexOf("\nasync function monitorWorkerBootAck", start);
  const block = main.slice(start, end);
  assert.match(block, /validateBootAcknowledgement/);
  assert.match(block, /recordDeveloperGridBootAck/);
  assert.match(block, /ackRecoverySource: source/);
});
check("launch monitor uses shared ACK processor", () => {
  const start = main.indexOf("async function monitorWorkerBootAck(");
  const end = main.indexOf("\nasync function bindCurrentTaskConversation", start);
  assert.match(main.slice(start, end), /processCapturedBootAck\(\{ view, body:capture\.text, task, workerCode, baselineResponseSha256, source:"LAUNCH_MONITOR" \}\)/);
});
check("Conversation Memory recovers valid ACK before transcript hash dedupe", () => {
  const start = main.indexOf("async function syncConversationMemoryForWorker");
  const end = main.indexOf("\nasync function syncConversationMemoryOnce", start);
  const block = main.slice(start, end);
  const ack = block.indexOf("source:\"CONVERSATION_MEMORY\"");
  const dedupe = block.indexOf("conversationMemoryHashes.get(cacheKey) === transcriptHash");
  assert.ok(ack > 0 && dedupe > ack);
  assert.match(block, /bodyWithBootAck/);
});
check("resume launch probes existing assistant ACK before relaunch", () => {
  const start = main.indexOf('ipcMain.handle("work-start:resume-launch"');
  const end = main.indexOf('ipcMain.handle("work-close:run"', start);
  const block = main.slice(start, end);
  const capture = block.indexOf("captureLatestAssistantText(view)");
  const recover = block.indexOf('source:"RESUME_EXISTING_ACK"');
  const relaunch = block.indexOf("prepareWorkerTaskLaunch(code, task.id");
  assert.ok(capture > 0 && recover > capture && relaunch > recover);
});
check("resume recovery avoids duplicate Launch Packet on valid ACK", () => {
  const start = main.indexOf('ipcMain.handle("work-start:resume-launch"');
  const end = main.indexOf('ipcMain.handle("work-close:run"', start);
  const block = main.slice(start, end);
  assert.match(block, /recoveredBootAck:true/);
  assert.match(block, /mode:"boot-ack-recovered"/);
});
check("invalid existing ACK blocks relaunch fail-closed", () => {
  const start = main.indexOf('ipcMain.handle("work-start:resume-launch"');
  const end = main.indexOf('ipcMain.handle("work-close:run"', start);
  const block = main.slice(start, end);
  assert.match(block, /BOOT_ACK_RECOVERY_BLOCKED/);
  assert.match(block, /Új Launch Packet automatikus küldése letiltva/);
});
check("ACK processing is de-duplicated by task session response hash", () => {
  assert.match(main, /processedBootAckHashes = new Set\(\)/);
  assert.match(main, /bootAckProcessingKeys = new Set\(\)/);
  assert.match(main, /const processKey = `\$\{taskId\}:\$\{sessionId\}:\$\{responseSha256\}`/);
});
check("validated continuation is idempotent", () => {
  assert.match(main, /ackContinuationState \|\| ""\)\.toUpperCase\(\) === "SENT"/);
  assert.match(main, /continuation = \{ sent:true, verified:true, duplicate:true \}/);
});
check("temporary persist failure remains retryable", () => {
  const start = main.indexOf("async function processCapturedBootAck(");
  const end = main.indexOf("\nasync function monitorWorkerBootAck", start);
  assert.match(main.slice(start, end), /retryable:true/);
});

console.log(`Developer Grid BOOT ACK recovery v0.1.37 contract PASS · ${n}/${n}`);
