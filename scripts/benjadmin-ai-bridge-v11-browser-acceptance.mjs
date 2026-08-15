import fs from "node:fs";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";

try { process.loadEnvFile?.(".env.local"); } catch {}
const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const uiBase = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const marker = `AI-BRIDGE-V11-UI-${Date.now()}`;
const headers = { host, "x-dimpro-license-admin-key": adminKey, "content-type": "application/json" };
let taskId = "";
let sessionIds = [];
let passed = 0;
function check(name, ok, detail = "") { if (!ok) throw new Error(`${name}: ${detail}`); passed += 1; console.log(`PASS ${name}${detail ? ` :: ${detail}` : ""}`); }
async function api(path, method = "GET", body) {
  const response = await fetch(`${apiBase}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}
async function cleanup() {
  if (!taskId) return;
  try { await api(`/api/dev/console/tasks/${taskId}`, "PATCH", { action: "FAIL", note: `${marker} browser cleanup` }); } catch {}
  const sessions = await db.from("dev_center_worker_sessions").select("id").eq("task_id", taskId);
  sessionIds = (sessions.data || []).map((row) => row.id);
  for (const sessionId of sessionIds) {
    for (const query of [
      db.from("dev_center_scope_locks").delete().eq("session_id", sessionId),
      db.from("dev_center_worktree_leases").delete().eq("session_id", sessionId),
      db.from("dev_center_session_events").delete().eq("session_id", sessionId),
    ]) await query;
    await db.from("dev_center_worker_sessions").delete().eq("id", sessionId);
  }
  for (const query of [
    db.from("dev_center_scope_locks").delete().eq("task_id", taskId),
    db.from("dev_center_worktree_leases").delete().eq("task_id", taskId),
    db.from("dev_center_live_worklog").delete().eq("task_id", taskId),
    db.from("dev_center_audit_events").delete().eq("task_id", taskId),
    db.from("dev_center_task_dependencies").delete().eq("task_id", taskId),
    db.from("dev_center_conflicts").delete().eq("task_id", taskId),
  ]) await query;
  await db.from("dev_center_tasks").delete().eq("id", taskId);
  await db.from("dev_center_workers").update({ status: "ready", updated_at: new Date().toISOString() }).eq("id", "worker_jazminai");
}

let browser;
try {
  let result = await api("/api/dev/console/messages", "POST", { text: `${marker} Worker Inbox browser acceptance`, target: "JAZMINAI", projectId: "project_dimprover", createTask: true, kind: "INSTRUCTION" });
  taskId = result.payload?.task?.id || "";
  check("Browser fixture task created", result.response.status === 201 && Boolean(taskId), `task=${taskId}`);
  result = await api(`/api/dev/console/tasks/${taskId}`, "PATCH", { action: "START" });
  check("Browser fixture task started", result.response.status === 200 && result.payload?.result?.task?.status === "claimed", `status=${result.response.status}`);

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
  await page.waitForSelector('[data-testid="benjadmin-developer-console"]', { timeout: 30000 });
  await page.waitForSelector('[data-testid="benjadmin-worker-inbox"]', { timeout: 30000 });
  check("Worker Inbox section visible", true);
  const inboxCount = await page.$$eval('[data-testid="benjadmin-worker-inbox"] [data-worker-code]', (items) => items.length);
  check("Worker Inbox has three worker cards", inboxCount === 3, `cards=${inboxCount}`);
  await page.waitForFunction((task) => document.body.textContent?.includes(task), { timeout: 30000 }, marker);
  const jazmin = await page.$eval('[data-testid="benjadmin-worker-inbox"] [data-worker-code="JAZMINAI"]', (node) => ({ text: node.textContent || "", worker: node.getAttribute("data-worker-code") }));
  check("Jázmin Inbox contains fixture task", jazmin.worker === "JAZMINAI" && jazmin.text.includes(marker), jazmin.text.slice(0, 260));
  const taskSelector = `[data-task-id="${taskId}"]`;
  await page.waitForSelector(taskSelector, { timeout: 30000 });
  const before = await page.$eval(taskSelector, (node) => ({ state: node.getAttribute("data-bridge-state"), handoff: Boolean(node.querySelector('button[data-action="HANDOFF"]')) }));
  check("Task card exposes WAITING_HANDOFF", before.state === "WAITING_HANDOFF", JSON.stringify(before));
  check("Task card exposes handoff action", before.handoff === true, JSON.stringify(before));

  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value) => { window.__benjadminCopiedHandoff = String(value); } } });
  });
  await page.click(`${taskSelector} button[data-action="HANDOFF"]`);
  await page.waitForFunction((selector) => document.querySelector(selector)?.getAttribute("data-bridge-state") === "HANDED_OFF", { timeout: 30000 }, taskSelector);
  const afterHandoff = await page.$eval(taskSelector, (node) => ({ state: node.getAttribute("data-bridge-state"), running: Boolean(node.querySelector('button[data-action="RUNNING"]')) }));
  check("UI handoff advances to HANDED_OFF", afterHandoff.state === "HANDED_OFF", JSON.stringify(afterHandoff));
  check("UI exposes Chat started action", afterHandoff.running === true, JSON.stringify(afterHandoff));
  const copied = await page.evaluate(() => String(window.__benjadminCopiedHandoff || ""));
  check("UI copied task-bound handoff prompt", copied.includes(taskId) && copied.includes(marker) && copied.includes("DEV-only végrehajtás"), copied.slice(0, 260));

  await page.click(`${taskSelector} button[data-action="RUNNING"]`);
  await page.waitForFunction((selector) => document.querySelector(selector)?.getAttribute("data-bridge-state") === "RUNNING", { timeout: 30000 }, taskSelector);
  check("UI Chat started advances RUNNING", true);
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  check("Worker Inbox keeps desktop horizontal overflow closed", noOverflow, "");
  console.log(JSON.stringify({ ok: true, passed, failed: 0, taskId }, null, 2));
} finally {
  if (browser) await browser.close().catch(() => undefined);
  await cleanup();
}
