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
const marker = `WEEKLY-V1-${stamp}`;
const projectId = `project_weekly_${stamp.toString(36)}`;
const projectSlug = `weekly-${stamp.toString(36)}`;
const openTaskId = `dev-task-weekly-open-${stamp.toString(36)}`;
const blockedTaskId = `dev-task-weekly-blocked-${stamp.toString(36)}`;
const completedTaskId = `dev-task-weekly-done-${stamp.toString(36)}`;
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
async function activity(workerCode, phase, kind, workItem, stage, summary) {
  return api("/api/dev/console/activity", "POST", {
    workerCode,
    projectId,
    phase,
    kind,
    summary: `${marker} ${summary}`,
    detail: `${marker} weekly summary acceptance`,
    mainModule: "BENJADMIN",
    moduleName: "Fejlesztői Konzol",
    submoduleName: "Heti fejlesztési összesítő",
    workItem,
    workStageIndex: stage,
    activityAction: `${summary} művelet`,
    activityNarrative: `${summary} weekly acceptance narratíva.`,
  });
}
async function cleanup() {
  if (browser) await browser.close().catch(() => {});
  await db.from("dev_center_live_worklog").delete().ilike("summary", `%${marker}%`);
  await db.from("dev_center_audit_events").delete().eq("project_id", projectId);
  await db.from("dev_center_tasks").delete().in("id", [openTaskId, blockedTaskId, completedTaskId]);
  await db.from("dev_center_projects").delete().eq("id", projectId);
}

try {
  let result = await api(`/api/dev/console/weekly-summary?projectId=${encodeURIComponent(projectId)}`, "GET", undefined, false);
  check("Weekly summary API denies unauthenticated read", result.response.status === 401, `status=${result.response.status}`);

  const project = await db.from("dev_center_projects").insert({ id: projectId, name: `${marker} projekt`, slug: projectSlug, category: "Acceptance", description: "Weekly Summary V1 acceptance", status: "active", accent: "cyan", metadata: { marker, productionAccess: "DENY" } });
  check("Isolated weekly project created", !project.error, project.error?.message || projectId);
  const now = new Date().toISOString();
  const taskInsert = await db.from("dev_center_tasks").insert([
    { id: openTaskId, project_id: projectId, title: `${marker} nyitott task`, description: "Weekly open task", status: "testing", priority: 90, created_by: "ARMINAI", metadata: { marker, productionAccess: "DENY" } },
    { id: blockedTaskId, project_id: projectId, title: `${marker} blokkolt task`, description: "Weekly blocked task", status: "blocked", priority: 80, blocked_reason: "acceptance blocker", created_by: "ARMINAI", metadata: { marker, productionAccess: "DENY" } },
    { id: completedTaskId, project_id: projectId, title: `${marker} lezárt task`, description: "Weekly completed task", status: "completed", priority: 70, completed_at: now, created_by: "JAZMINAI", metadata: { marker, productionAccess: "DENY" } },
  ]).select("id");
  check("Open blocked completed task fixtures created", !taskInsert.error && (taskInsert.data || []).length === 3, taskInsert.error?.message || "");

  result = await activity("ARMINAI", "coding", "CODE_ACTIVITY", "Kontextus A", 2, "fejlesztés");
  check("ARMINAI coding activity created", result.response.status === 201 && result.payload?.ok === true, JSON.stringify(result.payload));
  result = await activity("ARMINAI", "test", "TEST_RESULT", "Kontextus A", 3, "teszt");
  check("ARMINAI test activity created", result.response.status === 201 && result.payload?.ok === true, JSON.stringify(result.payload));
  result = await activity("JAZMINAI", "build", "BUILD_EVENT", "Kontextus B", 5, "build");
  check("JAZMINAI build activity created", result.response.status === 201 && result.payload?.ok === true, JSON.stringify(result.payload));
  result = await activity("JAZMINAI", "error", "ERROR", "Kontextus B", 4, "hibaellenőrzés");
  check("JAZMINAI error activity created", result.response.status === 201 && result.payload?.ok === true, JSON.stringify(result.payload));

  result = await api(`/api/dev/console/weekly-summary?projectId=${encodeURIComponent(projectId)}`);
  const summary = result.payload?.summary;
  check("Weekly summary API returns isolated project", result.response.status === 200 && result.payload?.ok === true && summary?.projectId === projectId, JSON.stringify({ status: result.response.status, projectId: summary?.projectId }));
  check("Weekly period is Europe Budapest and contains now", summary?.period?.timezone === "Europe/Budapest" && Date.parse(summary.period.startAt) <= Date.now() && Date.parse(summary.period.endAt) > Date.now(), JSON.stringify(summary?.period || {}));
  const monday = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Budapest", weekday: "short" }).format(new Date(summary.period.startAt));
  check("Weekly period starts on Budapest Monday", monday === "Mon", monday);
  check("Weekly project has exact four fixture activities", summary?.stats?.activities === 4, JSON.stringify(summary?.stats || {}));
  check("Weekly task state counts are exact", summary?.stats?.openTasks === 2 && summary?.stats?.blockedTasks === 1 && summary?.stats?.completedTasks === 1, JSON.stringify(summary?.stats || {}));
  check("Weekly build test error counts are exact", summary?.stats?.builds === 1 && summary?.stats?.tests === 1 && summary?.stats?.errors === 1, JSON.stringify(summary?.stats || {}));
  check("Weekly summary contains ARMINAI and JAZMINAI", summary?.stats?.workers === 2 && summary?.workers?.some((item) => item.code === "ARMINAI" && item.latestStage === 3) && summary?.workers?.some((item) => item.code === "JAZMINAI" && item.latestStage === 4), JSON.stringify(summary?.workers || []));
  const contextA = summary?.contexts?.find((item) => item.workItem === "Kontextus A");
  const contextB = summary?.contexts?.find((item) => item.workItem === "Kontextus B");
  check("Weekly summary groups two shared development contexts", summary?.stats?.contexts === 2 && Boolean(contextA) && Boolean(contextB), JSON.stringify(summary?.contexts || []));
  check("Context A keeps project hierarchy stage counts and latest 6/3", contextA?.projectName === `${marker} projekt` && contextA?.mainModule === "BENJADMIN" && contextA?.moduleName === "Fejlesztői Konzol" && contextA?.submoduleName === "Heti fejlesztési összesítő" && contextA?.latestStage === 3 && contextA?.stageCounts?.["2"] === 1 && contextA?.stageCounts?.["3"] === 1, JSON.stringify(contextA || {}));
  check("Context B keeps JAZMINAI build/error history and latest 6/4", contextB?.workers?.includes("JAZMINAI") && contextB?.stageCounts?.["5"] === 1 && contextB?.stageCounts?.["4"] === 1 && contextB?.latestStage === 4, JSON.stringify(contextB || {}));
  check("Weekly summary remains complete and PROD denied", summary?.truncated === false && summary?.productionAccess === "DENY", JSON.stringify({ truncated: summary?.truncated, productionAccess: summary?.productionAccess }));

  browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"] });
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((adminKey, selectedProjectId) => {
    localStorage.setItem("dimproLicenseAdminKey", adminKey);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.setItem("benjadmin-developer-console-theme", "light");
    localStorage.setItem("benjadmin-developer-console-project", selectedProjectId);
  }, key, projectId);
  await page.setViewport({ width: 1536, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${uiBase}/dev-console`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="benjadmin-weekly-development-summary"][data-ready="true"]', { timeout: 30000 });
  const desktop = await page.evaluate((projectName) => {
    const panel = document.querySelector('[data-testid="benjadmin-weekly-development-summary"]');
    return {
      text: panel?.textContent || "",
      projectId: panel?.getAttribute("data-project-id") || "",
      expanded: panel?.getAttribute("data-expanded") || "",
      workers: [...(panel?.querySelectorAll('[data-worker-code]') || [])].map((node) => node.getAttribute("data-worker-code")),
      stages: [...(panel?.querySelectorAll('[data-work-stage]') || [])].map((node) => node.getAttribute("data-work-stage")),
      hasProject: (panel?.textContent || "").includes(projectName),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  }, `${marker} projekt`);
  check("Weekly panel renders selected project and two workers", desktop.projectId === projectId && desktop.hasProject && desktop.workers.includes("ARMINAI") && desktop.workers.includes("JAZMINAI"), JSON.stringify(desktop));
  check("Weekly panel renders latest 6/3 and 6/4 context stages", desktop.stages.includes("3") && desktop.stages.includes("4") && desktop.text.includes("Kontextus A") && desktop.text.includes("Kontextus B"), JSON.stringify(desktop));
  check("Weekly panel desktop overflow safe", desktop.overflow === false, JSON.stringify(desktop));

  await page.click('[data-testid="benjadmin-weekly-summary-toggle"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="benjadmin-weekly-development-summary"]')?.getAttribute("data-expanded") === "false", { timeout: 10000 });
  check("Weekly panel collapses", true);
  await page.click('[data-testid="benjadmin-weekly-summary-toggle"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="benjadmin-weekly-development-summary"]')?.getAttribute("data-expanded") === "true", { timeout: 10000 });
  check("Weekly panel expands again", true);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const mobile = await page.evaluate(() => ({
    visible: Boolean(document.querySelector('[data-testid="benjadmin-weekly-development-summary"]')),
    stats: Boolean(document.querySelector('[data-testid="benjadmin-weekly-summary-stats"]')),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  check("Weekly panel remains visible with stats on mobile", mobile.visible && mobile.stats, JSON.stringify(mobile));
  check("Weekly panel mobile overflow safe", mobile.overflow === false, JSON.stringify(mobile));

  console.log(JSON.stringify({ ok: true, passed, failed: 0, marker, projectId, productionAccess: "DENY" }, null, 2));
} finally {
  await cleanup();
}
