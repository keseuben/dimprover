import assert from "node:assert/strict";

const originalMode = process.env.DIMPRO_BENJADMIN_AI_BRIDGE_MODE;
const originalKey = process.env.OPENAI_API_KEY;
const originalExecutor = process.env.DIMPRO_BENJADMIN_WORKER_EXECUTOR_URL;
delete process.env.OPENAI_API_KEY;
delete process.env.DIMPRO_BENJADMIN_WORKER_EXECUTOR_URL;
process.env.DIMPRO_BENJADMIN_AI_BRIDGE_MODE = "manual_chatgpt_bridge";

const mod = await import(`../app/lib/dev-center/benai-dispatch.ts?contract=${Date.now()}`);
let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }

try {
  const bridge = mod.getBenAiBridgeStatus();
  check("Kulcs nélkül kézi ChatGPT híd", () => assert.equal(bridge.mode, "MANUAL_CHATGPT_BRIDGE"));
  check("Natív executor alapból nincs bekötve", () => assert.equal(bridge.executorConfigured, false));

  const chat = mod.buildBenAiDispatch({ text: "Beszéljük meg a Drive UI-t", target: "BENAI" });
  check("Task nélkül chat-only", () => assert.equal(chat.stage, "CHAT_ONLY"));
  check("Chat-only nem állít be worker taskot", () => assert.equal(chat.taskId, null));

  const routed = mod.buildBenAiDispatch({ text: "Folytassuk a Drive-ot", target: "BENAI", taskId: "dev-task-test", projectId: "project_drive_drop" });
  check("Ben-AI cél koordinációs sorba kerül", () => assert.equal(routed.stage, "COORDINATOR_ROUTING"));
  check("Koordináció nem talál ki workert", () => assert.equal(routed.selectedWorkerId, null));
  check("Koordinációs átadó PROD read-only szabályt tartalmaz", () => assert.match(routed.handoffPrompt, /PROD maradjon read-only/i));

  const armin = mod.buildBenAiDispatch({ text: "A Commander UI-t készítsd el", target: "ARMINAI", taskId: "dev-task-armin", projectId: "project_drive_drop" });
  check("Ármin-AI explicit cél helyesen feloldva", () => assert.equal(armin.selectedWorkerId, "worker_arminai"));
  check("Executor nélkül nem állít autonóm végrehajtást", () => assert.equal(armin.stage, "EXECUTOR_NOT_CONFIGURED"));
  check("Átadó DEV-only végrehajtást ír elő", () => assert.match(armin.handoffPrompt, /DEV-only végrehajtás/i));
  check("Átadó tartalmazza a task azonosítót", () => assert.match(armin.handoffPrompt, /dev-task-armin/));

  const jazmin = mod.buildBenAiDispatch({ text: "API ellenőrzés", target: "JAZMINAI", taskId: "dev-task-jazmin", projectId: "project_dimprover" });
  check("Jázmin-AI explicit cél helyesen feloldva", () => assert.equal(jazmin.selectedWorkerCode, "JAZMINAI"));

  process.env.DIMPRO_BENJADMIN_AI_BRIDGE_MODE = "openai_responses";
  delete process.env.OPENAI_API_KEY;
  const fallback = mod.getBenAiBridgeStatus();
  check("API mód kulcs nélkül fail-safe kézi hídra esik vissza", () => assert.equal(fallback.mode, "MANUAL_CHATGPT_BRIDGE"));

  console.log(JSON.stringify({ ok: true, passed, failed: 0 }, null, 2));
} finally {
  if (originalMode == null) delete process.env.DIMPRO_BENJADMIN_AI_BRIDGE_MODE; else process.env.DIMPRO_BENJADMIN_AI_BRIDGE_MODE = originalMode;
  if (originalKey == null) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  if (originalExecutor == null) delete process.env.DIMPRO_BENJADMIN_WORKER_EXECUTOR_URL; else process.env.DIMPRO_BENJADMIN_WORKER_EXECUTOR_URL = originalExecutor;
}
