import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, "..");
const root = path.resolve(desktop, "../..");
const require = createRequire(import.meta.url);
const { validateBootAcknowledgement } = require(path.join(desktop, "src/task-launch/boot-ack.cjs"));
const main = fs.readFileSync(path.join(desktop, "src/main.cjs"), "utf8");
const route = fs.readFileSync(path.join(root, "app/api/dev/grid/work-start/route.ts"), "utf8");
const engine = fs.readFileSync(path.join(root, "app/lib/developer-grid/work-start.ts"), "utf8");

let n = 0;
function check(name, fn) { fn(); n += 1; console.log(`PASS ${String(n).padStart(2,"0")} ${name}`); }
const expected = {
  workerCode: "OUTMINAI",
  taskId: "dev-task-grid-abc",
  sessionId: "grid-work-dev-task-grid-abc-outminai",
  branch: "feature/benjadmin-v013",
  worktree: "/srv/dimpro-dev/worktrees/benjadmin-v013",
  baseHead: "a".repeat(40),
};
const validBody = `BOOT ACKNOWLEDGEMENT\nWorker: OUTMINAI\nTask: dev-task-grid-abc\nSession: grid-work-dev-task-grid-abc-outminai\nProject/Module: project_dimprover / Developer Grid V1\nBranch: feature/benjadmin-v013\nWorktree: /srv/dimpro-dev/worktrees/benjadmin-v013\nBase HEAD: ${"a".repeat(40)}\nRead/Write scope: module:Developer Grid V1\nDeny scope: PROD, más worker scope\nActive directive: DEV ONLY · PROD DENY\nPrior state: canonical handoff\nFirst check: branch + HEAD + worktree + lock\nRisk/blocker: nincs\nCoding allowed: YES`;

check("valid BOOT ACK matches authoritative Launch Packet", () => {
  const result = validateBootAcknowledgement(validBody, expected);
  assert.equal(result.validated, true);
  assert.deepEqual(result.mismatches, []);
});
check("HEAD mismatch fails closed", () => {
  const result = validateBootAcknowledgement(validBody.replace("a".repeat(40), "b".repeat(40)), expected);
  assert.equal(result.validated, false); assert.ok(result.mismatches.includes("baseHead"));
});
check("Coding allowed NO fails closed", () => {
  const result = validateBootAcknowledgement(validBody.replace("Coding allowed: YES", "Coding allowed: NO"), expected);
  assert.equal(result.validated, false); assert.ok(result.mismatches.includes("codingAllowed"));
});
check("missing PROD DENY fails closed", () => {
  const result = validateBootAcknowledgement(validBody.replaceAll("PROD DENY", "PRODUCTION"), expected);
  assert.equal(result.validated, false); assert.ok(result.mismatches.includes("PROD_DENY"));
});
check("central MUNKA INDÍTÁSA sends Launch Packet automatically only after explicit action", () => {
  assert.match(main, /prepareWorkerTaskLaunch\(launchWorkerCode, launchTask\.id, \{ autoSend:true/);
  assert.match(main, /sendPreparedChatPrompt/);
  assert.match(main, /TASK_PROMPT_SEND_NOT_VERIFIED/);
});
check("desktop monitors assistant response and records structured BOOT ACK", () => {
  assert.match(main, /monitorWorkerBootAck/); assert.match(main, /captureLatestAssistantText/); assert.match(main, /recordDeveloperGridBootAck/);
});
check("validated ACK emits automatic continuation while failed ACK stays blocked", () => {
  assert.match(main, /BOOT_ACK_ACCEPTED_V1/); assert.match(main, /ackContinuationState: "SENT"/); assert.match(main, /ackState:"BLOCKED"/);
});
check("paired DEV route persists BOOT ACK authoritatively", () => {
  assert.match(route, /export async function PUT/); assert.match(route, /recordDeveloperGridBootAck/);
  assert.match(engine, /BOOT_ACK_VALIDATED/); assert.match(engine, /BOOT_ACK_BLOCKED/); assert.match(engine, /bootAckSha256/);
});

console.log(`Developer Grid BOOT ACK contract PASS · ${n}/${n}`);
