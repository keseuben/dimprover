import fs from "node:fs";
import assert from "node:assert/strict";

const files = {
  engine: fs.readFileSync("app/lib/dev-center/engine-repository.ts", "utf8"),
  messages: fs.readFileSync("app/api/dev/console/messages/route.ts", "utf8"),
  tasks: fs.readFileSync("app/api/dev/console/tasks/[taskId]/route.ts", "utf8"),
  plus: fs.readFileSync("app/api/dev/console/plus-bridge/[workerCode]/next/route.ts", "utf8"),
  manual: fs.readFileSync("app/lib/dev-center/manual-bridge.ts", "utf8"),
  composer: fs.readFileSync("components/admin/developer-console/DeveloperComposer.tsx", "utf8"),
  panel: fs.readFileSync("components/admin/developer-console/LiveWorkPanel.tsx", "utf8"),
  css: fs.readFileSync("components/admin/developer-console/DeveloperConsole.module.css", "utf8"),
  cli: fs.readFileSync("scripts/benjadmin-plus-bridge-cli.mjs", "utf8"),
  commands: fs.readFileSync("components/admin/developer-console/commandLibrary.ts", "utf8"),
};
let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }

check("Composer default is Ben-AI AUTO", () => assert.ok(files.composer.includes('useState<ConsoleTarget>("BENAI")') && files.composer.includes('Ben-AI · AUTO')));
check("Composer keeps optional Armin preference", () => assert.ok(files.composer.includes('{ value: "ARMINAI", label: "Ármin" }')));
check("Composer keeps optional Jazmin preference", () => assert.ok(files.composer.includes('{ value: "JAZMINAI", label: "Jázmin" }')));
check("Composer keeps optional Outmin preference", () => assert.ok(files.composer.includes('{ value: "OUTMINAI", label: "Outmin" }')));
check("Message API delegates AUTO to Ben-AI capacity router", () => assert.ok(files.messages.includes("autoRouteDevEngineTaskByAvailability") && files.messages.includes("preferredWorkerCode: requestedWorkerId ? target : null")));
check("No normal direct route in message API", () => assert.ok(!files.messages.includes("routeDevEngineTask({ taskId: String(created.task.id)")));
check("Capacity router checks active sessions", () => assert.ok(files.engine.includes('select("worker_id,task_id,status")') && files.engine.includes("activeSessionCount")));
check("Stale task without session does not block", () => assert.ok(files.engine.includes("activeSessionTaskIds.has(text(row.id))")));
check("Capacity router tracks queued load", () => assert.ok(files.engine.includes("queuedTasks")));
check("Capacity router validates project isolation", () => assert.ok(files.engine.includes("assertWorkerProjectIsolation(client")));
check("Capacity router validates repository write isolation", () => assert.ok(files.engine.includes("assertRepositoryIsolation(client")));
check("Preferred worker busy is detected", () => assert.ok(files.engine.includes('"PREFERRED_BUSY"')));
check("Preferred worker authorization failure is detected", () => assert.ok(files.engine.includes('"PREFERRED_NOT_AUTHORIZED"')));
check("Alternative worker suggestion is persisted", () => assert.ok(files.engine.includes("coordinatorSuggestedWorker")));
check("Unavailable preference does not silently reassign", () => assert.ok(files.engine.includes('reason: "PREFERRED_UNAVAILABLE"') && files.messages.includes("A feladat egyelőre vár")));
check("Suggestion accept action exists", () => assert.ok(files.tasks.includes('action === "ACCEPT_SUGGESTION"') && files.engine.includes("acceptBenAiSuggestedWorker")));
check("Suggestion is revalidated before assignment", () => assert.ok(files.engine.includes("DEV_CENTER_BENAI_SUGGESTION_STALE")));
check("Waiting Ben-AI tasks can rebalance", () => assert.ok(files.engine.includes("rebalanceBenAiWaitingTasks")));
check("Rebalance only touches waiting coordinator states", () => assert.ok(files.engine.includes('queueState !== "WAITING_FOR_FREE_WORKER"')));
check("Plus pull engine exists", () => assert.ok(files.engine.includes("pullDevEngineTaskForPlusWorker")));
check("Plus pull rebalances before worker inbox", () => assert.ok(files.engine.includes("await rebalanceBenAiWaitingTasks(12)")));
check("Plus pull validates worker identity code", () => assert.ok(files.engine.includes("DEV_CENTER_PLUS_WORKER_INVALID")));
check("Plus pull starts real M3 session", () => assert.ok(files.engine.includes("startDevEngineTaskManualBridge(task.id)")));
check("Plus pull moves handoff to RUNNING", () => assert.ok(files.engine.includes('target: "HANDED_OFF"') && files.engine.includes('target: "RUNNING"')));
check("Plus pull is idempotent for running task", () => assert.ok(files.engine.includes('bridgeState === "WAITING_HANDOFF"') && files.engine.includes('bridgeState === "HANDED_OFF"')));
check("Plus pull audit exists", () => assert.ok(files.engine.includes('action: "TASK_PLUS_BRIDGE_PULLED"')));
check("Plus pull audit denies PROD", () => assert.ok(files.engine.includes('productionAccess: "DENY", pulledAt: now')));
check("Plus endpoint requires mutation auth", () => assert.ok(files.plus.includes("getDevCenterMutationSubject") && files.plus.includes("engineUnauthorized")));
check("Plus endpoint writes Ben-AI worklog", () => assert.ok(files.plus.includes('action: "PLUS_PULL"')));
check("Structured result action exists", () => assert.ok(files.tasks.includes('action === "RESULT_REPORT"')));
check("Structured result requires summary", () => assert.ok(files.engine.includes("DEV_CENTER_BRIDGE_RESULT_SUMMARY_REQUIRED")));
check("Structured result validates commit", () => assert.ok(files.engine.includes("DEV_CENTER_BRIDGE_RESULT_COMMIT_INVALID")));
check("Structured result validates build id", () => assert.ok(files.engine.includes("DEV_CENTER_BRIDGE_RESULT_BUILD_INVALID")));
check("Structured result sanitizes text", () => assert.ok(files.manual.includes("buildManualBridgeResult") && files.manual.includes("scanSensitiveText(raw)")));
check("Structured result stores SHA", () => assert.ok(files.engine.includes("bridgeResultSha256")));
check("Structured result stores bounded history", () => assert.ok(files.engine.includes("bridgeResultHistory") && files.engine.includes("slice(-19)")));
check("Structured result suggests testing", () => assert.ok(files.engine.includes("testingSuggested")));
check("Result audit denies PROD", () => assert.ok(files.engine.includes('action: "TASK_BRIDGE_RESULT_RECORDED"') && files.engine.includes('productionAccess: "DENY"')));
check("Result card visible in console", () => assert.ok(files.panel.includes('data-testid="benjadmin-bridge-result"')));
check("Worker suggestion card visible in console", () => assert.ok(files.panel.includes('data-testid="benjadmin-worker-suggestion"')));
check("Worker suggestion has accept button", () => assert.ok(files.panel.includes('onTaskAction(task.id, "ACCEPT_SUGGESTION")')));
check("V1.2 UI styling exists", () => assert.ok(files.css.includes(".aiCoordinatorSuggestion") && files.css.includes(".aiBridgeResult")));
check("Plus CLI supports one-command pull", () => assert.ok(files.cli.includes('["pull", "next", "claim"]') && files.cli.includes("plus-bridge/${encodeURIComponent(workerCode)}/next")));
check("Command library exposes Plus continuation instruction", () => assert.ok((files.commands.includes("Vedd fel a következő BENJADMIN feladatot") || files.commands.includes('text: "Folytasd."')) && (files.commands.includes("Plus-only · következő BENJADMIN feladat") || files.commands.includes("Plus-only · Folytasd"))));
check("Plus CLI supports result report", () => assert.ok(files.cli.includes('action === "report"') && files.cli.includes('action: "RESULT_REPORT"')));
check("Plus CLI supports testing and completion", () => assert.ok(files.cli.includes('action === "testing"') && files.cli.includes('action === "complete"')));
check("No OpenAI API call required by Plus bridge", () => assert.ok(!files.plus.includes("OPENAI_API_KEY") && !files.cli.includes("OPENAI_API_KEY") && !files.engine.includes("responses.create")));

console.log(JSON.stringify({ ok: true, passed, failed: 0 }, null, 2));
