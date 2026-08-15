import fs from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const bridge = read("app/lib/dev-center/manual-bridge.ts");
const engine = read("app/lib/dev-center/engine-repository.ts");
const api = read("app/api/dev/console/tasks/[taskId]/route.ts");
const panel = read("components/admin/developer-console/LiveWorkPanel.tsx");
const shell = read("components/admin/developer-console/DeveloperConsoleShell.tsx");
const dispatch = read("app/lib/dev-center/benai-dispatch.ts");
const css = read("components/admin/developer-console/DeveloperConsole.module.css");
const checks = [];
function check(name, fn) {
  let ok = false;
  try { fn(); ok = true; } finally { checks.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${name}`); }
}

check("Manual bridge state machine defines four V1.1 states", () => {
  for (const state of ["WAITING_HANDOFF", "HANDED_OFF", "RUNNING", "RESULT_PENDING"]) assert.ok(bridge.includes(`"${state}"`));
});
check("Manual bridge prompt uses central secret scanner", () => assert.ok(bridge.includes('scanSensitiveText')));
check("Sensitive handoff is masked", () => assert.ok(bridge.includes("ÉRZÉKENY ADAT MASZKOLVA")));
check("Handoff prompt gets SHA256", () => assert.ok(bridge.includes('createHash("sha256")')));
check("Prompt is DEV-only", () => assert.ok(bridge.includes("DEV-only végrehajtás")));
check("Prompt explicitly denies PROD mutation", () => assert.ok(bridge.includes("PROD módosítás nincs")));
check("Prompt warns against raw credentials", () => assert.ok(bridge.includes("nyers credentialt")));
check("Ben-AI dispatch reuses safe handoff builder", () => assert.ok(dispatch.includes("buildManualBridgeHandoff")));
check("Route persists WAITING_HANDOFF", () => assert.ok(engine.includes('bridgeState: "WAITING_HANDOFF"')));
check("Route persists handoff prompt", () => assert.ok(engine.includes("handoffPrompt: handoff.prompt")));
check("Route persists handoff SHA", () => assert.ok(engine.includes("handoffPromptSha256: handoff.sha256")));
check("Route persists sanitization state", () => assert.ok(engine.includes("handoffSanitized: handoff.sanitized")));
check("START remains TASK_BOUND", () => assert.ok(engine.includes('executionGate: "TASK_BOUND"')));
check("START does not open branch/worktree write gate", () => assert.ok(!engine.slice(engine.indexOf("export async function startDevEngineTaskManualBridge"), engine.indexOf("export async function advanceDevEngineTaskManualBridge")).includes('"READY"')));
check("Bridge transition requires started task", () => assert.ok(engine.includes("DEV_CENTER_BRIDGE_TASK_NOT_STARTED")));
check("Bridge transition requires active session", () => assert.ok(engine.includes("DEV_CENTER_BRIDGE_SESSION_REQUIRED") && engine.includes("DEV_CENTER_BRIDGE_SESSION_INVALID")));
check("Out-of-order transition is 409 fail-closed", () => assert.ok(engine.includes("DEV_CENTER_BRIDGE_TRANSITION_DENIED") && engine.includes("409")));
check("Bridge audit carries PROD deny", () => assert.ok(engine.includes('productionAccess: "DENY"')));
check("HANDOFF action is exposed", () => assert.ok(api.includes('"HANDOFF"')));
check("RUNNING action is exposed", () => assert.ok(api.includes('"RUNNING"')));
check("RESULT_PENDING action is exposed", () => assert.ok(api.includes('"RESULT_PENDING"')));
check("Bridge transition creates Ben-AI worklog", () => assert.ok(api.includes("A kézi ChatGPT/MCP átadás időpontja")));
check("Worker Inbox exists", () => assert.ok(panel.includes("WORKER INBOX") && panel.includes("aiWorkerInboxGrid")));
check("Worker Inbox lists all three worker definitions", () => assert.ok(panel.includes('code: "ARMINAI"') && panel.includes('code: "JAZMINAI"') && panel.includes('code: "OUTMINAI"')));
check("Task card shows bridge state", () => assert.ok(panel.includes("aiBridgeState") && panel.includes('metadataText(task, "bridgeState")')));
check("Handoff copy is task-local", () => assert.ok(panel.includes("copyHandoffAndMark") && panel.includes('metadataText(task, "handoffPrompt")')));
check("Handoff copy marks HANDOFF only after clipboard write", () => assert.ok(panel.indexOf("navigator.clipboard.writeText(prompt)") < panel.indexOf('onTaskAction(task.id, "HANDOFF")')));
check("UI has explicit Chat started action", () => assert.ok(panel.includes("Chat elindult") && panel.includes('"RUNNING"')));
check("UI has explicit result arrived action", () => assert.ok(panel.includes("Eredmény jött") && panel.includes('"RESULT_PENDING"')));
check("TESTING is offered after RESULT_PENDING", () => assert.ok(panel.includes('bridgeState === "RESULT_PENDING"') && panel.includes('"TESTING"')));
check("UI warns when handoff was sanitized", () => assert.ok(panel.includes("érzékeny adatot észlelt és maszkolta")));
check("Shell accepts V1.1 bridge actions", () => assert.ok(shell.includes('"HANDOFF" | "RUNNING" | "RESULT_PENDING"')));
check("Worker Inbox exposes stable browser hooks", () => assert.ok(panel.includes('data-testid="benjadmin-worker-inbox"') && panel.includes('data-worker-code={item.code}') && panel.includes('data-task-id={task.id}') && panel.includes('data-bridge-state={bridgeState || "ROUTING"}')));
check("Bridge actions expose stable browser hooks", () => assert.ok(panel.includes('data-action="HANDOFF"') && panel.includes('data-action="RUNNING"') && panel.includes('data-action="RESULT_PENDING"') && panel.includes('data-action="TESTING"')));
check("Worker Inbox prioritizes latest updated task", () => assert.ok(panel.includes('String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || ""))')));
check("Worker Inbox CSS exists", () => assert.ok(css.includes(".aiWorkerInboxGrid")));
check("Bridge button CSS exists", () => assert.ok(css.includes(".aiBridgeHandoffButton") && css.includes(".aiBridgeRunningButton")));
check("Team avatars bypass server-side image upscale", () => assert.ok(read("components/admin/developer-console/BenjadminAvatar.tsx").includes("priority={eager || member === \"BENJADMIN\" || member === \"BENAI\"} unoptimized")));
check("No PROD task action added", () => assert.ok(!api.match(/PROD_[A-Z_]+|DEPLOY_PROD|WRITE_PROD/)));

console.log(`SUMMARY ${checks.filter(Boolean).length}/${checks.length} PASS`);
if (checks.some((value) => !value)) process.exit(1);
