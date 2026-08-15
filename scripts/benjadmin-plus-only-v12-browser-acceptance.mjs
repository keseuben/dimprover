import fs from "node:fs";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";

try { process.loadEnvFile?.(".env.local"); } catch {}
const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const uiBase = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const marker = `PLUS-V12-UI-${Date.now()}`;
const headers = { host, "x-dimpro-license-admin-key": adminKey, "content-type": "application/json" };
const taskIds = [];
let browser;
let passed = 0;
function check(name, ok, detail = "") { if (!ok) throw new Error(`${name}: ${detail}`); passed += 1; console.log(`PASS ${name}${detail ? ` :: ${detail}` : ""}`); }
async function api(path, method = "GET", body) {
  const response = await fetch(`${apiBase}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}
async function cleanupTask(taskId) {
  if (!taskId) return;
  const sessions = await db.from("dev_center_worker_sessions").select("id").eq("task_id", taskId);
  for (const session of sessions.data || []) {
    for (const q of [
      db.from("dev_center_scope_locks").delete().eq("session_id", session.id),
      db.from("dev_center_worktree_leases").delete().eq("session_id", session.id),
      db.from("dev_center_session_events").delete().eq("session_id", session.id),
    ]) await q;
    await db.from("dev_center_worker_sessions").delete().eq("id", session.id);
  }
  for (const q of [
    db.from("dev_center_scope_locks").delete().eq("task_id", taskId),
    db.from("dev_center_worktree_leases").delete().eq("task_id", taskId),
    db.from("dev_center_live_worklog").delete().eq("task_id", taskId),
    db.from("dev_center_audit_events").delete().eq("task_id", taskId),
    db.from("dev_center_task_dependencies").delete().eq("task_id", taskId),
    db.from("dev_center_conflicts").delete().eq("task_id", taskId),
  ]) await q;
  await db.from("dev_center_tasks").delete().eq("id", taskId);
}
async function cleanup() {
  if (browser) await browser.close().catch(() => undefined);
  for (const id of [...taskIds].reverse()) await cleanupTask(id);
  await db.from("dev_center_workers").update({ status: "ready", updated_at: new Date().toISOString() }).in("id", ["worker_arminai", "worker_jazminai"]);
}

try {
  let result = await api("/api/dev/console/messages", "POST", { text: `${marker}-AUTO elsődleges task`, target: "BENAI", projectId: "project_dimprover", createTask: true, kind: "INSTRUCTION" });
  const primaryTaskId = result.payload?.task?.id || "";
  if (primaryTaskId) taskIds.push(primaryTaskId);
  const primaryWorker = String(result.payload?.autoRouting?.worker?.code || "");
  check("Browser AUTO fixture routed", result.response.status === 201 && Boolean(primaryTaskId) && Boolean(primaryWorker), `${primaryWorker} ${primaryTaskId}`);
  result = await api(`/api/dev/console/plus-bridge/${primaryWorker}/next`, "POST");
  check("Browser AUTO fixture running", result.response.status === 200 && result.payload?.handoff?.bridgeState === "RUNNING", `status=${result.response.status}`);

  result = await api("/api/dev/console/messages", "POST", { text: `${marker}-PREFERRED foglalt worker UI`, target: primaryWorker, projectId: "project_dimprover", createTask: true, kind: "INSTRUCTION" });
  const preferredTaskId = result.payload?.task?.id || "";
  if (preferredTaskId) taskIds.push(preferredTaskId);
  const suggestedWorker = String(result.payload?.autoRouting?.suggestedWorker?.code || "");
  check("Browser preferred fixture gets suggestion", result.response.status === 201 && result.payload?.autoRouting?.reason === "PREFERRED_UNAVAILABLE" && Boolean(suggestedWorker), `${primaryWorker} -> ${suggestedWorker}`);

  browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"] });
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((key) => {
    localStorage.setItem("dimproLicenseAdminKey", key);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.setItem("benjadmin-developer-console-theme", "dark");
    localStorage.setItem("benjadmin-developer-console-project", "project_dimprover");
  }, adminKey);
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${uiBase}/dev-console`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="benjadmin-developer-composer"]', { timeout: 30000 });
  const composerButtons = await page.$$eval('[data-testid="benjadmin-developer-composer"] button', (items) => items.map((item) => (item.textContent || "").trim()).filter(Boolean));
  check("Composer exposes Ben-AI AUTO", composerButtons.some((text) => text.includes("Ben-AI · AUTO")), JSON.stringify(composerButtons.slice(0, 12)));
  check("Composer keeps optional three coders", ["Ármin", "Jázmin", "Outmin"].every((label) => composerButtons.includes(label)), JSON.stringify(composerButtons.slice(0, 12)));

  await page.waitForFunction((m) => document.body.textContent?.includes(m), { timeout: 30000 }, `${marker}-PREFERRED`);
  const taskSelector = `[data-task-id="${preferredTaskId}"]`;
  await page.waitForSelector(`${taskSelector} [data-testid="benjadmin-worker-suggestion"]`, { timeout: 30000 });
  const suggestion = await page.$eval(`${taskSelector} [data-testid="benjadmin-worker-suggestion"]`, (node) => ({ text: node.textContent || "", hasButton: Boolean(node.querySelector("button")) }));
  check("Suggestion card explains busy preferred worker", /foglalt|nem választható/i.test(suggestion.text), suggestion.text);
  check("Suggestion card names next coder", suggestion.text.includes("Javasolt következő kódoló") && suggestion.hasButton, suggestion.text);
  await page.click(`${taskSelector} [data-testid="benjadmin-worker-suggestion"] button`);
  await page.waitForFunction((selector) => !document.querySelector(`${selector} [data-testid="benjadmin-worker-suggestion"]`), { timeout: 30000 }, taskSelector);
  const taskAfter = await db.from("dev_center_tasks").select("requested_worker_id,metadata").eq("id", preferredTaskId).single();
  check("Suggestion acceptance persists PREFERRED_ACCEPTED", taskAfter.data?.metadata?.coordinatorPreferenceState === "PREFERRED_ACCEPTED", JSON.stringify(taskAfter.data?.metadata || {}));

  const commandButton = await page.$x?.("//button[contains(., 'ChatGPT Parancstár')]");
  if (commandButton?.[0]) await commandButton[0].click();
  else {
    const buttons = await page.$$("button");
    for (const button of buttons) { const text = await page.evaluate((n) => n.textContent || "", button); if (text.includes("ChatGPT Parancstár")) { await button.click(); break; } }
  }
  await page.waitForFunction(() => document.body.textContent?.includes("Plus-only · következő BENJADMIN feladat"), { timeout: 30000 });
  const bodyText = await page.evaluate(() => document.body.textContent || "");
  check("Command Library shows Plus-only template", bodyText.includes("Plus-only · következő BENJADMIN feladat"), "");
  check("Command Library shows one-line pull instruction", bodyText.includes("Vedd fel a következő BENJADMIN feladatot"), "");
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  check("V1.2 desktop remains overflow-safe", noOverflow, "");
  console.log(JSON.stringify({ ok: true, passed, failed: 0, primaryTaskId, preferredTaskId, primaryWorker, suggestedWorker }, null, 2));
} finally {
  await cleanup();
}
