#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";

const runtimeRoot = path.resolve(process.env.BENJADMIN_RUNTIME_ROOT || process.cwd());
try { process.loadEnvFile?.(path.join(runtimeRoot, ".env.local")); } catch {}
const key = fs.readFileSync(path.join(runtimeRoot, ".dimprover/license/admin-key.txt"), "utf8").trim();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const uiBase = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const headers = { host, "x-dimpro-license-admin-key": key, "content-type": "application/json" };
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = Date.now();
const marker = `CHAT-V2-${stamp}`;
const projectId = `project_chatv2_${stamp.toString(36)}`;
const projectSlug = `chatv2-${stamp.toString(36)}`;
const transitionTaskId = `dev-task-chatv2-transition-${stamp.toString(36)}`;
const summary = `${marker} azonos worker activity`;
const context = {
  mainModule: "BENJADMIN",
  moduleName: "AI Fejlesztői Tér",
  submoduleName: "Közös fejlesztői csevegés",
  workItem: "Task nélküli worker-context acceptance",
  activityAction: "Runtime dedupe és archívum ellenőrzése.",
  activityNarrative: "A fixture ugyanazon worker ismétlődését, worker-váltását és a közös csevegés archívumát ellenőrzi.",
  workStageIndex: 2,
};
let browser;
let passed = 0;

function check(name, ok, detail = "") {
  if (!ok) throw new Error(`${name}${detail ? ` :: ${detail}` : ""}`);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")} ${name}${detail ? ` :: ${detail}` : ""}`);
}
async function api(pathname, method = "GET", body, authorized = true) {
  const response = await fetch(`${apiBase}${pathname}`, {
    method,
    headers: authorized ? headers : { host, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}
async function cleanup() {
  if (browser) await browser.close().catch(() => {});
  await db.from("dev_center_live_worklog").delete().ilike("summary", `%${marker}%`);
  await db.from("dev_center_audit_events").delete().eq("task_id", transitionTaskId);
  await db.from("dev_center_tasks").delete().eq("id", transitionTaskId);
  await db.from("dev_center_projects").delete().eq("id", projectId);
}
function localDayKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function localMondayKey(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const shift = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - shift);
  return localDayKey(date.toISOString());
}
function activityBody(workerCode, overrides = {}) {
  return {
    workerCode,
    projectId,
    phase: "coding",
    kind: "CODE_ACTIVITY",
    summary,
    detail: `${marker} részletes activity`,
    progressPercent: 40,
    ...context,
    ...overrides,
  };
}
async function openConsoleWithClock(offsetDays) {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((adminKey, selectedProjectId, offsetMs) => {
    const RealDate = Date;
    const fakeNow = RealDate.now() + offsetMs;
    class MockDate extends RealDate {
      constructor(...args) { super(...(args.length ? args : [fakeNow])); }
      static now() { return fakeNow; }
    }
    globalThis.Date = MockDate;
    localStorage.setItem("dimproLicenseAdminKey", adminKey);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.setItem("benjadmin-developer-console-theme", "light");
    localStorage.setItem("benjadmin-developer-console-project", selectedProjectId);
  }, key, projectId, offsetDays * 86400000);
  await page.setViewport({ width: 1536, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${uiBase}/dev-console`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="benjadmin-developer-console"]', { timeout: 30000 });
  return page;
}

try {
  const project = await db.from("dev_center_projects").insert({
    id: projectId,
    name: `${marker} projekt`,
    slug: projectSlug,
    category: "Acceptance",
    description: "Common Chat V2 runtime/browser acceptance",
    status: "active",
    accent: "cyan",
    metadata: { marker, productionAccess: "DENY" },
  });
  check("Isolated chat project created", !project.error, project.error?.message || projectId);
  const transitionTask = await db.from("dev_center_tasks").insert({
    id: transitionTaskId,
    project_id: projectId,
    title: `${marker} worker transition task`,
    description: "Common Chat V2 worker transition fixture",
    status: "testing",
    priority: 90,
    created_by: "ARMINAI",
    metadata: { marker, productionAccess: "DENY", developmentContext: { projectId, mainModule: context.mainModule, moduleName: context.moduleName, submoduleName: context.submoduleName, workItem: "Worker transition acceptance", workStageIndex: 3 } },
  });
  check("Worker transition task fixture created", !transitionTask.error, transitionTask.error?.message || transitionTaskId);

  let result = await api("/api/dev/console/activity", "POST", activityBody("ARMINAI"), false);
  check("Worker activity API denies unauthenticated writes", result.response.status === 401, `status=${result.response.status}`);

  result = await api("/api/dev/console/activity", "POST", activityBody("ARMINAI"));
  const arminFirst = result.payload?.message;
  check("First ARMINAI activity is persisted", result.response.status === 201 && result.payload?.ok === true && Boolean(arminFirst?.id), JSON.stringify(result.payload));
  check("Taskless activity keeps explicit hierarchy", arminFirst?.metadata?.mainModule === context.mainModule && arminFirst?.metadata?.moduleName === context.moduleName && arminFirst?.metadata?.submoduleName === context.submoduleName && arminFirst?.metadata?.workItem === context.workItem, JSON.stringify(arminFirst?.metadata || {}));
  check("Taskless activity keeps explicit 6/2 stage", Number(arminFirst?.metadata?.workStageIndex) === 2, JSON.stringify(arminFirst?.metadata || {}));
  check("Worker activity metadata remains PROD denied", arminFirst?.metadata?.productionAccess === "DENY", JSON.stringify(arminFirst?.metadata || {}));

  result = await api("/api/dev/console/activity", "POST", activityBody("ARMINAI"));
  const arminDuplicate = result.payload?.message;
  check("Exact ARMINAI repeat returns the same persisted message", result.response.status === 201 && arminDuplicate?.id === arminFirst?.id, JSON.stringify({ first: arminFirst?.id, duplicate: arminDuplicate?.id }));
  let rows = await db.from("dev_center_live_worklog").select("id,worker_code,metadata").eq("source", "worker-activity").eq("worker_code", "ARMINAI").eq("summary", summary);
  check("Exact ARMINAI repeat creates only one DB row", !rows.error && (rows.data || []).length === 1, rows.error?.message || `rows=${(rows.data || []).length}`);
  check("Persistent dedupe key is stored", Boolean(rows.data?.[0]?.metadata?.activityDedupeKey), JSON.stringify(rows.data?.[0]?.metadata || {}));

  result = await api("/api/dev/console/activity", "POST", activityBody("JAZMINAI"));
  const jazmin = result.payload?.message;
  check("Same summary under JAZMINAI remains a distinct event", result.response.status === 201 && Boolean(jazmin?.id) && jazmin?.id !== arminFirst?.id, JSON.stringify({ armin: arminFirst?.id, jazmin: jazmin?.id }));

  result = await api("/api/dev/console/activity", "POST", activityBody("ARMINAI", { workItem: "Másik munkarész ugyanazzal a summaryval" }));
  const arminOtherContext = result.payload?.message;
  check("Same worker same summary in another context remains distinct", result.response.status === 201 && Boolean(arminOtherContext?.id) && arminOtherContext?.id !== arminFirst?.id, JSON.stringify({ first: arminFirst?.id, other: arminOtherContext?.id }));

  result = await api("/api/dev/console/messages?limit=40");
  const markerMessages = (result.payload?.messages || []).filter((message) => String(message.summary || "").includes(marker));
  check("Messages API exposes both internal workers", result.response.status === 200 && markerMessages.some((message) => message.author === "ARMINAI") && markerMessages.some((message) => message.author === "JAZMINAI"), markerMessages.map((message) => `${message.author}:${message.id}`).join(","));

  const transitionAt1 = new Date(Date.now() - 2000).toISOString();
  const transitionAt2 = new Date(Date.now() - 1000).toISOString();
  const transitionRows = [
    { worker_code: "ARMINAI", task_id: transitionTaskId, phase: "coding", level: "info", summary: `${marker} presence ARMINAI`, detail: `${marker} worker transition`, source: "worker-presence-bridge", created_at: transitionAt1, metadata: { recordType: "WORKER_PRESENCE_V1", kind: "CODE_ACTIVITY", presenceState: "ENDED", presenceKey: `${marker}:transition:ARMINAI`, detectedAt: transitionAt1, lastSeenAt: transitionAt1, endedAt: transitionAt1, endReason: "ACCEPTANCE_FIXTURE", inferredBy: "acceptance-fixture", confidence: "explicit", projectId, mainModule: context.mainModule, moduleName: context.moduleName, submoduleName: context.submoduleName, workItem: "Worker transition acceptance", productionAccess: "DENY" } },
    { worker_code: "JAZMINAI", task_id: transitionTaskId, phase: "coding", level: "info", summary: `${marker} presence JAZMINAI`, detail: `${marker} worker transition`, source: "worker-presence-bridge", created_at: transitionAt2, metadata: { recordType: "WORKER_PRESENCE_V1", kind: "CODE_ACTIVITY", presenceState: "ENDED", presenceKey: `${marker}:transition:JAZMINAI`, detectedAt: transitionAt2, lastSeenAt: transitionAt2, endedAt: transitionAt2, endReason: "ACCEPTANCE_FIXTURE", inferredBy: "acceptance-fixture", confidence: "explicit", projectId, mainModule: context.mainModule, moduleName: context.moduleName, submoduleName: context.submoduleName, workItem: "Worker transition acceptance", productionAccess: "DENY" } },
  ];
  const transitionInsert = await db.from("dev_center_live_worklog").insert(transitionRows);
  check("Worker presence transition fixture inserted", !transitionInsert.error, transitionInsert.error?.message || "ARMINAI -> JAZMINAI");
  const liveResult = await api("/api/dev/console/live");
  const transition = (liveResult.payload?.live?.workerTransitions || []).find((item) => item.taskId === transitionTaskId && item.fromWorkerCode === "ARMINAI" && item.toWorkerCode === "JAZMINAI");
  check("Live API derives ARMINAI to JAZMINAI transition", liveResult.response.status === 200 && Boolean(transition), JSON.stringify(transition || {}));
  check("Derived transition keeps task hierarchy", transition?.projectId === projectId && transition?.mainModule === context.mainModule && transition?.moduleName === context.moduleName && transition?.submoduleName === context.submoduleName && transition?.workItem === "Worker transition acceptance", JSON.stringify(transition || {}));

  const pagingRows = [];
  const futureBase = Date.now() + 60_000;
  for (let index = 0; index < 25; index += 1) {
    pagingRows.push({
      worker_code: index % 2 === 0 ? "ARMINAI" : "JAZMINAI",
      task_id: null,
      phase: "coding",
      level: "info",
      summary: `${marker} cursor ${String(index).padStart(2, "0")}`,
      detail: `${marker} cursor detail`,
      progress_percent: null,
      source: "worker-activity",
      metadata: { kind: "CODE_ACTIVITY", projectId, origin: "COMMON_CHAT_V2_CURSOR_ACCEPTANCE", ...context, activityDedupeKey: `${marker}:cursor:${index}`, productionAccess: "DENY" },
      created_at: new Date(futureBase + index * 1000).toISOString(),
    });
  }
  const pagingInsert = await db.from("dev_center_live_worklog").insert(pagingRows);
  check("Cursor fixture page inserted", !pagingInsert.error, pagingInsert.error?.message || "25 rows");

  const page1 = await api("/api/dev/console/messages?limit=20");
  const page1Ids = new Set((page1.payload?.messages || []).map((message) => message.id));
  check("Messages first page reports older history", page1.response.status === 200 && page1.payload?.page?.hasMore === true && Boolean(page1.payload?.page?.oldestAt), JSON.stringify(page1.payload?.page || {}));
  const page2 = await api(`/api/dev/console/messages?limit=20&before=${encodeURIComponent(page1.payload.page.oldestAt)}`);
  const page2Ids = (page2.payload?.messages || []).map((message) => message.id);
  check("Cursor loads a non-overlapping older page", page2.response.status === 200 && page2Ids.length > 0 && page2Ids.every((id) => !page1Ids.has(id)), JSON.stringify({ first: page1Ids.size, second: page2Ids.length }));
  check("Cursor page reaches remaining acceptance fixtures", (page2.payload?.messages || []).some((message) => String(message.summary || "").includes(`${marker} cursor`)), (page2.payload?.messages || []).slice(0, 5).map((message) => message.summary).join(" | "));

  browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"] });

  const recentPage = await openConsoleWithClock(3);
  await recentPage.waitForFunction((m) => (document.body.textContent || "").includes(m), { timeout: 30000 }, marker);
  await recentPage.waitForFunction((workItem) => { const strip = document.querySelector("[data-testid=benjadmin-worker-transition-strip]"); return Boolean(strip) && (strip.textContent || "").includes(workItem); }, { timeout: 30000 }, "Worker transition acceptance");
  const transitionStrip = await recentPage.evaluate((workItem) => {
    const strip = document.querySelector('[data-testid="benjadmin-worker-transition-strip"]');
    return { present: Boolean(strip), text: strip?.textContent || "", hasContext: (strip?.textContent || "").includes(workItem) };
  }, "Worker transition acceptance");
  check("Common chat renders worker transition strip", transitionStrip.present && transitionStrip.text.includes("ARMINAI") && transitionStrip.text.includes("JAZMINAI") && transitionStrip.hasContext, JSON.stringify(transitionStrip));

  const recentArchive = await recentPage.evaluate(() => ({
    archive: Boolean(document.querySelector('[data-testid="benjadmin-conversation-archive"]')),
    text: document.querySelector('[data-testid="benjadmin-conversation-archive"]')?.textContent || "",
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  check("+3 day browser clock groups fixture into recent archive", recentArchive.archive && recentArchive.text.includes("ELMÚLT 7 NAP"), recentArchive.text.slice(0, 500));
  const fixtureDayKey = localDayKey(arminFirst.createdAt);
  const recentToggle = await recentPage.$(`[data-archive-toggle="day:${fixtureDayKey}"]`);
  check("Recent archive has the fixture day group", Boolean(recentToggle), fixtureDayKey);
  await recentToggle.click();
  await recentPage.waitForFunction((m) => [...document.querySelectorAll('[data-message-id]')].some((node) => (node.textContent || "").includes(m)), { timeout: 10000 }, summary);
  const tasklessCard = await recentPage.evaluate((m) => {
    const card = [...document.querySelectorAll('[data-message-id]')].find((node) => (node.textContent || "").includes(m));
    const ctx = card?.querySelector('[data-testid="benjadmin-message-work-context"]');
    return { author: card?.getAttribute("data-author") || "", text: card?.textContent || "", stage: ctx?.getAttribute("data-work-stage") || "", overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  }, summary);
  check("Taskless worker card renders explicit context and 6/2", tasklessCard.stage === "2" && tasklessCard.text.includes("BENJADMIN") && tasklessCard.text.includes("AI Fejlesztői Tér") && tasklessCard.text.includes("Közös fejlesztői csevegés") && tasklessCard.text.includes(context.workItem), JSON.stringify(tasklessCard));
  check("Recent archive desktop overflow safe", tasklessCard.overflow === false, JSON.stringify(tasklessCard));
  const workerCards = await recentPage.evaluate((m) => [...document.querySelectorAll('[data-message-id]')].filter((node) => (node.textContent || "").includes(m)).map((node) => node.getAttribute("data-author")) , summary);
  check("Browser keeps ARMINAI and JAZMINAI as separate cards", workerCards.includes("ARMINAI") && workerCards.includes("JAZMINAI"), JSON.stringify(workerCards));
  await recentPage.close();

  const earlierPage = await openConsoleWithClock(9);
  await earlierPage.waitForSelector('[data-testid="benjadmin-conversation-archive"]', { timeout: 30000 });
  const earlierBefore = await earlierPage.evaluate(() => ({ text: document.querySelector('[data-testid="benjadmin-conversation-archive"]')?.textContent || "", showButton: Boolean(document.querySelector('[data-testid="benjadmin-archive-show-earlier"]')) }));
  check("+9 day browser clock exposes earlier archive gate", earlierBefore.showButton && earlierBefore.text.includes("Korábbi archívum megjelenítése"), earlierBefore.text.slice(0, 500));
  await earlierPage.click('[data-testid="benjadmin-archive-show-earlier"]');
  await earlierPage.waitForFunction(() => document.querySelector('[data-testid="benjadmin-conversation-archive"]')?.getAttribute("data-show-earlier") === "true", { timeout: 15000 });
  const fixtureWeekKey = localMondayKey(arminFirst.createdAt);
  const earlierToggle = await earlierPage.$(`[data-archive-toggle="week:${fixtureWeekKey}"]`);
  check("Earlier archive groups fixture messages by week", Boolean(earlierToggle), fixtureWeekKey);
  await earlierToggle.click();
  await earlierPage.waitForFunction((m) => [...document.querySelectorAll('[data-message-id]')].some((node) => (node.textContent || "").includes(m)), { timeout: 10000 }, summary);
  await earlierPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const mobile = await earlierPage.evaluate(() => ({ archive: Boolean(document.querySelector('[data-testid="benjadmin-conversation-archive"]')), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
  check("Earlier archive remains visible on mobile", mobile.archive, JSON.stringify(mobile));
  check("Common Chat V2 mobile overflow safe", mobile.overflow === false, JSON.stringify(mobile));

  console.log(JSON.stringify({ ok: true, passed, failed: 0, marker, projectId, arminMessageId: arminFirst?.id, jazminMessageId: jazmin?.id, productionAccess: "DENY" }, null, 2));
} finally {
  await cleanup();
}
