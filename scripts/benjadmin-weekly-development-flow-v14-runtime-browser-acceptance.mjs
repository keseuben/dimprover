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
const marker = `WEEKLY-FLOW-V14-${stamp}`;
const projectId = `project_weekly_flow_${stamp.toString(36)}`;
const projectSlug = `weekly-flow-${stamp.toString(36)}`;
const taskId = `dev-task-weekly-flow-${stamp.toString(36)}`;
let scheduleId = "";
let browser;
let workerSnapshot = [];
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
  if (scheduleId) {
    await db.from("dev_center_decision_memory").delete().eq("category", "development_scheduler_run").like("decision_key", `benjadmin:scheduler-run:${scheduleId}:%`);
    await db.from("dev_center_decision_memory").delete().eq("id", scheduleId).eq("category", "development_scheduler");
    await db.from("dev_center_audit_events").delete().eq("entity_id", scheduleId);
  }
  const sessions = await db.from("dev_center_worker_sessions").select("id").eq("task_id", taskId);
  for (const session of sessions.data || []) {
    await db.from("dev_center_scope_locks").delete().eq("session_id", session.id);
    await db.from("dev_center_worktree_leases").delete().eq("session_id", session.id);
    await db.from("dev_center_session_events").delete().eq("session_id", session.id);
    await db.from("dev_center_worker_sessions").delete().eq("id", session.id);
  }
  await db.from("dev_center_scope_locks").delete().eq("task_id", taskId);
  await db.from("dev_center_worktree_leases").delete().eq("task_id", taskId);
  await db.from("dev_center_task_dependencies").delete().eq("task_id", taskId);
  await db.from("dev_center_task_dependencies").delete().eq("depends_on_task_id", taskId);
  await db.from("dev_center_conflicts").delete().eq("task_id", taskId);
  await db.from("dev_center_live_worklog").delete().ilike("summary", `%${marker}%`);
  await db.from("dev_center_audit_events").delete().eq("project_id", projectId);
  await db.from("dev_center_tasks").delete().eq("id", taskId);
  await db.from("dev_center_projects").delete().eq("id", projectId);
  for (const worker of workerSnapshot) {
    await db.from("dev_center_workers").update({ status: worker.status, updated_at: new Date().toISOString() }).eq("id", worker.id);
  }
}
async function activity(workerCode, stage, kind, summary) {
  return api("/api/dev/console/activity", "POST", {
    workerCode,
    projectId,
    phase: stage >= 5 ? "build" : stage >= 3 ? "test" : "coding",
    kind,
    summary: `${marker} ${summary}`,
    detail: `${marker} weekly flow acceptance`,
    mainModule: "BENJADMIN",
    moduleName: "Fejlesztői Konzol",
    submoduleName: "Heti fejlesztési összesítő",
    workItem: "Weekly Flow acceptance",
    workStageIndex: stage,
    activityAction: summary,
    activityNarrative: `${summary} acceptance narrative`,
  });
}

try {
  let result = await api(`/api/dev/console/weekly-summary?projectId=${encodeURIComponent(projectId)}`, "GET", undefined, false);
  check("Flow weekly API denies unauthenticated read", result.response.status === 401, `status=${result.response.status}`);

  const workers = await db.from("dev_center_workers").select("id,code,status").in("code", ["ARMINAI", "JAZMINAI"]);
  if (workers.error) throw workers.error;
  workerSnapshot = workers.data || [];
  for (const worker of workerSnapshot) await db.from("dev_center_workers").update({ status: "ready", updated_at: new Date().toISOString() }).eq("id", worker.id);
  check("Flow worker pool prepared", workerSnapshot.length >= 2, workerSnapshot.map((item) => item.code).join(","));

  const project = await db.from("dev_center_projects").insert({
    id: projectId, name: `${marker} projekt`, slug: projectSlug, category: "Acceptance",
    description: "Weekly Development Flow V1.3 acceptance", status: "active", accent: "cyan",
    metadata: { marker, productionAccess: "DENY" },
  });
  check("Flow isolated project created", !project.error, project.error?.message || projectId);

  const task = await db.from("dev_center_tasks").insert({
    id: taskId, project_id: projectId, title: `${marker} scheduler task`, description: "Weekly flow task",
    status: "ready", priority: 99, created_by: "BenjAdmin",
    metadata: { marker, mainModule: "BENJADMIN", moduleName: "Fejlesztői Konzol", submoduleName: "Heti fejlesztési összesítő", workItem: "Weekly Flow acceptance", productionAccess: "DENY" },
  });
  check("Flow scheduler task created", !task.error, task.error?.message || taskId);

  result = await activity("ARMINAI", 2, "CODE_ACTIVITY", "coding stage");
  check("Flow stage 6/2 activity created", result.response.status === 201 && result.payload?.ok === true, `status=${result.response.status}`);
  result = await activity("ARMINAI", 3, "TEST_RESULT", "test stage");
  check("Flow stage 6/3 activity created", result.response.status === 201 && result.payload?.ok === true, `status=${result.response.status}`);
  result = await activity("JAZMINAI", 5, "BUILD_EVENT", "build stage");
  check("Flow stage 6/5 activity created", result.response.status === 201 && result.payload?.ok === true, `status=${result.response.status}`);

  const baseMs = Date.now() - 60_000;
  const startAt = new Date(baseMs).toISOString();
  const endAt = new Date(baseMs + 2 * 60 * 60_000).toISOString();
  result = await api("/api/dev/console/scheduler", "POST", {
    action: "CREATE", projectId, title: `${marker} scheduler`,
    startAt, endAt, cadenceMinutes: 60, maxRuns: 2, timezone: "Europe/Budapest", missedRunPolicy: "catch_up_once",
  });
  scheduleId = String(result.payload?.schedule?.id || "");
  check("Flow uses real scheduler schedule creation", result.response.status === 201 && Boolean(scheduleId), scheduleId);

  result = await api("/api/dev/console/scheduler/tick", "POST", {
    source: "manual", scheduleId, now: new Date(baseMs + 60_000).toISOString(),
  });
  const outcome = result.payload?.outcomes?.[0];
  check("Flow uses real scheduler run ledger", result.response.status === 200 && outcome?.outcome === "ready_for_pull", JSON.stringify(outcome || {}));
  check("Flow scheduler tick remains PROD denied", result.payload?.productionAccess === "DENY", String(result.payload?.productionAccess || ""));

  const handoffNow = Date.now() - 10 * 60_000;
  const t1Detected = new Date(handoffNow - 12 * 60_000).toISOString();
  const t1Ended = new Date(handoffNow - 7 * 60_000).toISOString();
  const t2 = new Date(handoffNow).toISOString();
  const t2Ended = new Date(handoffNow + 4 * 60_000).toISOString();
  const t1 = t1Detected;
  const presenceRows = [
    {
      worker_code: "ARMINAI", task_id: taskId, phase: "coding", level: "info",
      summary: `${marker} presence ARMINAI`, detail: `${marker} handoff source`, source: "worker-presence-bridge", created_at: t1,
      metadata: { recordType: "WORKER_PRESENCE_V1", presenceState: "ENDED", presenceKey: `${marker}:ARMINAI`, detectedAt: t1Detected, lastSeenAt: t1Ended, endedAt: t1Ended, endReason: "ACCEPTANCE_FIXTURE", inferredBy: "acceptance-fixture", confidence: "explicit", projectId, mainModule: "BENJADMIN", moduleName: "Fejlesztői Konzol", submoduleName: "Heti fejlesztési összesítő", workItem: "Weekly Flow handoff", workStageIndex: 2, productionAccess: "DENY" },
    },
    {
      worker_code: "JAZMINAI", task_id: taskId, phase: "build", level: "info",
      summary: `${marker} presence JAZMINAI build wait`, detail: `${marker} handoff target`, source: "worker-presence-bridge", created_at: t2,
      metadata: { recordType: "WORKER_PRESENCE_V1", presenceState: "ENDED", presenceKey: `${marker}:JAZMINAI`, detectedAt: t2, lastSeenAt: t2Ended, endedAt: t2Ended, endReason: "ACCEPTANCE_FIXTURE", inferredBy: "acceptance-fixture", confidence: "explicit", projectId, mainModule: "BENJADMIN", moduleName: "Fejlesztői Konzol", submoduleName: "Heti fejlesztési összesítő", workItem: "Weekly Flow handoff", workStageIndex: 5, buildLockWaiting: false, buildLockWaitStartedAt: null, buildLockWaitTotalMs: 4 * 60_000, buildLockWaitObservationCount: 1, buildLockWaitLastEndedAt: t2Ended, nextStep: "Acceptance build lock felszabadulás", productionAccess: "DENY" },
    },
  ];
  const presence = await db.from("dev_center_live_worklog").insert(presenceRows);
  check("Flow presence handoff and build-lock fixtures created", !presence.error, presence.error?.message || "");

  const auditRows = [
    {
      id: `audit-weekly-flow-wait-${stamp}`, actor_type: "system", actor_id: "BenAI",
      action: "TASK_BENAI_WAITING_FOR_WORKER", entity_type: "task", entity_id: taskId, task_id: taskId, project_id: projectId,
      summary: `${marker} worker várakozás`, metadata: { marker, productionAccess: "DENY" }, created_at: new Date(Date.now() - 1500).toISOString(),
    },
    {
      id: `audit-weekly-flow-fail-${stamp}`, actor_type: "worker", actor_id: "JAZMINAI",
      action: "TASK_FAILED", entity_type: "task", entity_id: taskId, task_id: taskId, project_id: projectId,
      summary: `${marker} task hiba`, metadata: { marker, workerCode: "JAZMINAI", note: "Acceptance blocker reason", productionAccess: "DENY" }, created_at: new Date(Date.now() - 1000).toISOString(),
    },
  ];
  const audit = await db.from("dev_center_audit_events").insert(auditRows);
  check("Flow waiting and failed audit fixtures created", !audit.error, audit.error?.message || "");

  result = await api(`/api/dev/console/weekly-summary?projectId=${encodeURIComponent(projectId)}`);
  const flow = result.payload?.summary?.flowAnalytics;
  check("Flow weekly API returns analytics", result.response.status === 200 && result.payload?.ok === true && Boolean(flow), JSON.stringify(flow || {}));
  check("Flow counts real scheduler run", flow?.schedulerReady === true && flow?.schedulerRuns?.total === 1 && flow?.schedulerRuns?.readyForPull === 1, JSON.stringify(flow?.schedulerRuns || {}));
  check("Flow derives one ARMINAI to JAZMINAI handoff", flow?.handoffs === 1 && flow?.transitions?.some((item) => item.fromWorkerCode === "ARMINAI" && item.toWorkerCode === "JAZMINAI"), JSON.stringify(flow?.transitions || []));
  check("Flow counts one build-lock wait", flow?.buildLockWaits === 1, String(flow?.buildLockWaits));
  check("Flow counts one worker wait", flow?.waitingForWorker === 1, String(flow?.waitingForWorker));
  check("Flow counts one task failure", flow?.taskFailures === 1, String(flow?.taskFailures));
  check("Flow exposes stage 6/2 6/3 and 6/5 coverage", Number(flow?.stageCounts?.["2"] || 0) >= 1 && Number(flow?.stageCounts?.["3"] || 0) >= 1 && Number(flow?.stageCounts?.["5"] || 0) >= 1, JSON.stringify(flow?.stageCounts || {}));
  check("Flow exposes structured blocker kinds", ["BUILD_LOCK_WAIT", "WAITING_WORKER", "TASK_FAILED"].every((kind) => flow?.blockers?.some((item) => item.kind === kind)), JSON.stringify(flow?.blockers || []));
  check("Flow analytics remain PROD denied through summary", result.payload?.summary?.productionAccess === "DENY", String(result.payload?.summary?.productionAccess || ""));
  check("Flow V1.1 returns previous-week trend metrics", flow?.trend?.available === true && flow?.trend?.metrics?.length === 5 && Boolean(flow?.trend?.previousWeekKey), JSON.stringify(flow?.trend || {}));
  check("Flow V1.1 returns worker load analytics", Array.isArray(flow?.workerLoad) && flow.workerLoad.length >= 2 && flow.workerLoad.every((item) => typeof item.loadSharePercent === "number" && ["normal","watch","high"].includes(item.signal)), JSON.stringify(flow?.workerLoad || []));
  const loadShareTotal = (flow?.workerLoad || []).reduce((sum, item) => sum + Number(item.loadSharePercent || 0), 0);
  check("Flow V1.1 worker load share is normalized", loadShareTotal >= 98 && loadShareTotal <= 102, String(loadShareTotal));
  check("Flow V1.2 returns observed handoff timing", flow?.handoffTiming?.available === true && flow?.handoffTiming?.observedHandoffs === 1 && flow?.handoffTiming?.averageGapMinutes === 7 && flow?.handoffTiming?.medianGapMinutes === 7 && flow?.handoffTiming?.maxGapMinutes === 7, JSON.stringify(flow?.handoffTiming || {}));
  check("Flow V1.2 returns observed build-lock window", flow?.handoffTiming?.buildLockWaitEvents === 1 && flow?.handoffTiming?.buildLockWaitMinutes === 4, JSON.stringify(flow?.handoffTiming || {}));
  check("Flow V1.2 identifies handoff bottleneck", flow?.handoffTiming?.bottleneck?.kind === "HANDOFF_GAP" && flow?.handoffTiming?.bottleneck?.minutes === 7, JSON.stringify(flow?.handoffTiming?.bottleneck || {}));
  check("Flow V1.3 returns scheduler drill-down", Array.isArray(flow?.drillDown?.scheduler) && flow.drillDown.scheduler.some((item) => item.kind === "SCHEDULER_RUN" && item.status === "ready_for_pull"), JSON.stringify(flow?.drillDown?.scheduler || []));
  check("Flow V1.3 returns handoff drill-down", Array.isArray(flow?.drillDown?.handoff) && flow.drillDown.handoff.some((item) => item.kind === "TASK_HANDOFF" && item.fromWorkerCode === "ARMINAI" && item.toWorkerCode === "JAZMINAI"), JSON.stringify(flow?.drillDown?.handoff || []));
  check("Flow V1.3 returns waiting drill-down", ["BUILD_LOCK_WAIT","WAITING_WORKER"].every((kind) => flow?.drillDown?.waiting?.some((item) => item.kind === kind)), JSON.stringify(flow?.drillDown?.waiting || []));
  check("Flow V1.3 returns failure drill-down", flow?.drillDown?.failure?.some((item) => item.kind === "TASK_FAILED"), JSON.stringify(flow?.drillDown?.failure || []));
  const management = result.payload?.summary?.managementSummary;
  check("Flow V1.4 returns management summary", Boolean(management) && ["stable","watch","critical"].includes(management.status) && Number.isFinite(management.score), JSON.stringify(management || {}));
  check("Flow V1.4 fixture produces watch management state", management?.status === "watch" && management.score >= 0 && management.score < 85, JSON.stringify(management || {}));
  check("Flow V1.4 management indicators aggregate failures and waits", management?.indicators?.failures >= 1 && management?.indicators?.waiting === 2 && management?.indicators?.activeWorkers >= 2 && management?.indicators?.handoffGapMinutes === 7, JSON.stringify(management?.indicators || {}));
  check("Flow V1.4 management risks include failure waiting and load", ["failure","waiting","load"].every((kind) => management?.risks?.some((item) => item.kind === kind)), JSON.stringify(management?.risks || []));
  check("Flow V1.4 management exposes positives and next actions", management?.positives?.length >= 1 && management?.nextActions?.length >= 2, JSON.stringify({ positives: management?.positives || [], nextActions: management?.nextActions || [] }));

  browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"] });
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((adminKey, selectedProjectId) => {
    localStorage.setItem("dimproLicenseAdminKey", adminKey);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.setItem("benjadmin-developer-console-project", selectedProjectId);
  }, key, projectId);
  await page.setViewport({ width: 1536, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${uiBase}/dev-console`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction((expectedProjectId) => {
    const weekly = document.querySelector('[data-testid="benjadmin-weekly-development-summary"]');
    const flow = document.querySelector('[data-testid="benjadmin-weekly-flow-analytics"]');
    return weekly?.getAttribute("data-ready") === "true" && weekly?.getAttribute("data-project-id") === expectedProjectId && Boolean(flow);
  }, { timeout: 30000 }, projectId);

  const desktop = await page.evaluate(() => {
    const flow = document.querySelector('[data-testid="benjadmin-weekly-flow-analytics"]');
    const management = document.querySelector('[data-testid="benjadmin-weekly-management-summary"]');
    return {
      managementStatus: management?.getAttribute("data-status") || "",
      managementScore: Number(management?.getAttribute("data-score") || -1),
      managementText: management?.textContent || "",
      managementGroups: management?.querySelectorAll("[data-management-group]").length || 0,
      managementRiskKinds: [...(management?.querySelectorAll("[data-risk-kind]") || [])].map((node) => node.getAttribute("data-risk-kind")),
      managementProgress: Number(management?.querySelector("progress")?.getAttribute("value") || -1),
      text: flow?.textContent || "",
      schedulerReady: flow?.getAttribute("data-scheduler-ready"),
      kinds: [...(flow?.querySelectorAll("[data-flow-kind]") || [])].map((node) => node.getAttribute("data-flow-kind")),
      activeStages: [...(flow?.querySelectorAll('[data-testid="benjadmin-weekly-flow-stage"] [data-active="true"]') || [])].map((node) => node.getAttribute("data-flow-stage")),
      blockers: [...(flow?.querySelectorAll("[data-blocker-kind]") || [])].map((node) => node.getAttribute("data-blocker-kind")),
      hasTransition: Boolean(flow?.querySelector('[data-testid="benjadmin-weekly-flow-transitions"]')),
      hasTrend: Boolean(flow?.querySelector("[data-testid=\"benjadmin-weekly-flow-trend\"]")),
      workerLoadCards: flow?.querySelectorAll("[data-testid=\"benjadmin-weekly-worker-load\"] [data-worker-load]").length || 0,
      handoffTiming: Boolean(flow?.querySelector("[data-testid=\"benjadmin-weekly-handoff-timing\"]")),
      timingCards: flow?.querySelectorAll("[data-testid=\"benjadmin-weekly-handoff-timing\"] [data-handoff-timing]").length || 0,
      bottleneck: flow?.querySelector("[data-testid=\"benjadmin-weekly-handoff-timing\"] [data-bottleneck-kind]")?.getAttribute("data-bottleneck-kind") || "",
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  check("Flow UI renders four metric cards", desktop.kinds.length === 4 && ["scheduler","handoff","waiting","failure"].every((kind) => desktop.kinds.includes(kind)), JSON.stringify(desktop));
  check("Flow UI renders scheduler ready and handoff", desktop.schedulerReady === "true" && desktop.hasTransition && desktop.text.includes("ARMINAI") && desktop.text.includes("JAZMINAI"), JSON.stringify(desktop));
  check("Flow UI renders active 6/x stages", ["2","3","5"].every((stage) => desktop.activeStages.includes(stage)), JSON.stringify(desktop));
  check("Flow UI renders blocker kinds", ["BUILD_LOCK_WAIT","WAITING_WORKER","TASK_FAILED"].every((kind) => desktop.blockers.includes(kind)), JSON.stringify(desktop));
  check("Flow V1.1 UI renders weekly trend", desktop.hasTrend === true && desktop.text.includes("Előző héthez képest"), JSON.stringify(desktop));
  check("Flow V1.1 UI renders worker load cards", desktop.workerLoadCards >= 2 && desktop.text.includes("Worker terhelés"), JSON.stringify(desktop));
  check("Flow V1.2 UI renders lead-time cards", desktop.handoffTiming === true && desktop.timingCards === 4 && desktop.text.includes("Átadási idő / lead time"), JSON.stringify(desktop));
  check("Flow V1.2 UI renders bottleneck", desktop.bottleneck === "HANDOFF_GAP", JSON.stringify(desktop));
  check("Flow V1.4 UI renders management watch status", desktop.managementStatus === "watch" && desktop.managementScore >= 0 && desktop.managementScore < 85 && desktop.managementProgress === desktop.managementScore, JSON.stringify(desktop));
  check("Flow V1.4 UI renders management groups and risks", desktop.managementGroups === 3 && ["failure","waiting","load"].every((kind) => desktop.managementRiskKinds.includes(kind)) && desktop.managementText.includes("VEZETŐI HETI ÖSSZEFOGLALÓ"), JSON.stringify(desktop));
  check("Flow UI desktop overflow safe", desktop.overflow === false, JSON.stringify(desktop));

  await page.click('[data-flow-kind="waiting"]');
  await page.waitForSelector('[data-testid="benjadmin-weekly-flow-drilldown"][data-detail-kind="waiting"]');
  const waitingDetail = await page.evaluate(() => ({
    selected: document.querySelector('[data-flow-kind="waiting"]')?.getAttribute("data-selected"),
    kinds: [...document.querySelectorAll('[data-testid="benjadmin-weekly-flow-drilldown"] [data-drilldown-event]')].map((node) => node.getAttribute("data-drilldown-event")),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  check("Flow V1.3 waiting card opens waiting drill-down", waitingDetail.selected === "true" && ["BUILD_LOCK_WAIT","WAITING_WORKER"].every((kind) => waitingDetail.kinds.includes(kind)), JSON.stringify(waitingDetail));

  await page.click('[data-flow-kind="handoff"]');
  await page.waitForSelector('[data-testid="benjadmin-weekly-flow-drilldown"][data-detail-kind="handoff"]');
  const handoffDetail = await page.evaluate(() => ({
    kinds: [...document.querySelectorAll('[data-testid="benjadmin-weekly-flow-drilldown"] [data-drilldown-event]')].map((node) => node.getAttribute("data-drilldown-event")),
    text: document.querySelector('[data-testid="benjadmin-weekly-flow-drilldown"]')?.textContent || "",
  }));
  check("Flow V1.3 handoff card switches drill-down", handoffDetail.kinds.includes("TASK_HANDOFF") && handoffDetail.text.includes("ARMINAI") && handoffDetail.text.includes("JAZMINAI"), JSON.stringify(handoffDetail));

  await page.click('[data-flow-kind="scheduler"]');
  await page.waitForSelector('[data-testid="benjadmin-weekly-flow-drilldown"][data-detail-kind="scheduler"]');
  const schedulerDetail = await page.evaluate(() => ({
    kinds: [...document.querySelectorAll('[data-testid="benjadmin-weekly-flow-drilldown"] [data-drilldown-event]')].map((node) => node.getAttribute("data-drilldown-event")),
    text: document.querySelector('[data-testid="benjadmin-weekly-flow-drilldown"]')?.textContent || "",
  }));
  check("Flow V1.3 scheduler card switches drill-down", schedulerDetail.kinds.includes("SCHEDULER_RUN") && schedulerDetail.text.includes("ready_for_pull"), JSON.stringify(schedulerDetail));

  await page.click('[data-flow-kind="failure"]');
  await page.waitForSelector('[data-testid="benjadmin-weekly-flow-drilldown"][data-detail-kind="failure"]');
  const failureDetail = await page.evaluate(() => [...document.querySelectorAll('[data-testid="benjadmin-weekly-flow-drilldown"] [data-drilldown-event]')].map((node) => node.getAttribute("data-drilldown-event")));
  check("Flow V1.3 failure card switches drill-down", failureDetail.includes("TASK_FAILED"), JSON.stringify(failureDetail));

  await page.click('[data-flow-kind="failure"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="benjadmin-weekly-flow-drilldown"]'));
  check("Flow V1.3 selected metric toggles drill-down closed", await page.$('[data-testid="benjadmin-weekly-flow-drilldown"]') === null);

  await page.click('[data-flow-kind="waiting"]');
  await page.waitForSelector('[data-testid="benjadmin-weekly-flow-drilldown"][data-detail-kind="waiting"]');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const mobile = await page.evaluate(() => ({
    visible: Boolean(document.querySelector('[data-testid="benjadmin-weekly-flow-analytics"]')),
    managementVisible: Boolean(document.querySelector('[data-testid="benjadmin-weekly-management-summary"]')),
    managementStatus: document.querySelector('[data-testid="benjadmin-weekly-management-summary"]')?.getAttribute("data-status") || "",
    managementGroups: document.querySelectorAll('[data-testid="benjadmin-weekly-management-summary"] [data-management-group]').length,
    metrics: document.querySelectorAll('[data-testid="benjadmin-weekly-flow-analytics"] [data-flow-kind]').length,
    trend: Boolean(document.querySelector("[data-testid=\"benjadmin-weekly-flow-trend\"]")),
    workerLoad: document.querySelectorAll("[data-testid=\"benjadmin-weekly-worker-load\"] [data-worker-load]").length,
    handoffTiming: Boolean(document.querySelector("[data-testid=\"benjadmin-weekly-handoff-timing\"]")),
    timingCards: document.querySelectorAll("[data-testid=\"benjadmin-weekly-handoff-timing\"] [data-handoff-timing]").length,
    drillDown: document.querySelector('[data-testid="benjadmin-weekly-flow-drilldown"]')?.getAttribute("data-detail-kind") || "",
    drillDownEvents: document.querySelectorAll('[data-testid="benjadmin-weekly-flow-drilldown"] [data-drilldown-event]').length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  check("Flow UI remains visible on mobile", mobile.visible && mobile.metrics === 4, JSON.stringify(mobile));
  check("Flow V1.1 trend and worker load remain visible on mobile", mobile.trend === true && mobile.workerLoad >= 2, JSON.stringify(mobile));
  check("Flow V1.2 lead-time remains visible on mobile", mobile.handoffTiming === true && mobile.timingCards === 4, JSON.stringify(mobile));
  check("Flow V1.3 drill-down remains visible on mobile", mobile.drillDown === "waiting" && mobile.drillDownEvents >= 2, JSON.stringify(mobile));
  check("Flow V1.4 management summary remains visible on mobile", mobile.managementVisible === true && mobile.managementStatus === "watch" && mobile.managementGroups === 3, JSON.stringify(mobile));
  check("Flow UI mobile overflow safe", mobile.overflow === false, JSON.stringify(mobile));

  console.log(JSON.stringify({ ok: true, passed, failed: 0, marker, projectId, taskId, scheduleId, productionAccess: "DENY" }, null, 2));
} finally {
  await cleanup();
}
