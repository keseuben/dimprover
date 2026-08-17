#!/usr/bin/env node
import fs from "node:fs";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";
try { process.loadEnvFile?.(".env.local"); } catch {}

const key = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const uiBase = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const marker = `WORKER-CONTEXT-BROWSER-${Date.now()}`;
const taskId = `dev-task-context-ui-${Date.now().toString(36)}`;
let browser;
let passed = 0;
function check(name, ok, detail = "") { if (!ok) throw new Error(`${name}${detail ? ` :: ${detail}` : ""}`); passed += 1; console.log(`PASS ${String(passed).padStart(2, "0")} ${name}${detail ? ` :: ${detail}` : ""}`); }
async function cleanup() {
  if (browser) await browser.close().catch(() => {});
  await db.from("dev_center_live_worklog").delete().like("summary", `${marker}%`);
  await db.from("dev_center_tasks").delete().eq("id", taskId);
}

try {
  const taskInsert = await db.from("dev_center_tasks").insert({
    id: taskId,
    project_id: "project_dimprover",
    repository_id: "repo_dimprover",
    title: `${marker} BENJADMIN közös fejlesztői csevegés worker kártya`,
    description: "A kódmérnök kártyája mutassa meg részletesen, hogy a BENJADMIN Fejlesztői Konzol Közös fejlesztői csevegés funkciójának melyik munkarészén dolgozik.",
    status: "testing",
    priority: 50,
    requested_worker_id: "worker_arminai",
    assigned_worker_id: "worker_arminai",
    branch_name: "feature/context-card-browser",
    worktree_path: null,
    scope: [],
    acceptance: [],
    created_by: "BENJADMIN worker context browser acceptance",
    metadata: { origin: "WORKER_CONTEXT_BROWSER_ACCEPTANCE", productionAccess: "DENY" },
  }).select("id").single();
  check("Browser task fixture created", !taskInsert.error && taskInsert.data?.id === taskId, taskInsert.error?.message || taskId);

  const activityInsert = await db.from("dev_center_live_worklog").insert({
    worker_code: "ARMINAI",
    task_id: taskId,
    phase: "test",
    level: "success",
    summary: `${marker} ÁrminAI kártya`,
    detail: "",
    progress_percent: 61,
    source: "worker-activity",
    metadata: {
      kind: "TEST_RESULT",
      projectId: "project_dimprover",
      origin: "BENJADMIN_WORKER_ACTIVITY",
      productionAccess: "DENY",
      mainModule: "BENJADMIN",
      moduleName: "Fejlesztői Konzol",
      submoduleName: "Közös fejlesztői csevegés",
      workItem: "Kódmérnök-kártya modulhierarchia és részletes aktivitás",
      activityAction: "A kártya új kontextusmezőit és a 6-os állapotjelzőt teszteli.",
      activityNarrative: "A kódmérnök most a Közös fejlesztői csevegés kártyáinak részletes munkakontextusát ellenőrzi. Megnézi, hogy a főmodul, modul, almodul és munkarész együtt, jól olvashatóan jelenik-e meg. A 6/3 TESZTELÉS jelzésnek egyértelműen mutatnia kell az aktuális munkafázist.",
      workStageIndex: 3,
      workStageLabel: "TESZTELÉS",
      activityPhase: "test",
    },
  }).select("id").single();
  check("Browser activity fixture created", !activityInsert.error && Boolean(activityInsert.data?.id), activityInsert.error?.message || "");

  browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"] });
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((adminKey) => {
    localStorage.setItem("dimproLicenseAdminKey", adminKey);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.setItem("benjadmin-developer-console-theme", "light");
    localStorage.setItem("benjadmin-developer-console-project", "project_dimprover");
  }, key);
  await page.setViewport({ width: 1536, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${uiBase}/dev-console`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="benjadmin-developer-console"]', { timeout: 30000 });
  await page.waitForFunction((m) => document.body.textContent?.includes(`${m} ÁrminAI kártya`), { timeout: 30000 }, marker);

  const desktop = await page.evaluate((m) => {
    const row = [...document.querySelectorAll('article[data-author="ARMINAI"]')].find((node) => node.textContent?.includes(`${m} ÁrminAI kártya`));
    const context = row?.querySelector('[data-testid="benjadmin-message-work-context"]');
    const stage = row?.querySelector('[data-testid="benjadmin-work-stage"]');
    return {
      found: Boolean(row),
      context: Boolean(context),
      text: row?.textContent || "",
      stageText: stage?.textContent || "",
      stageAttr: context?.getAttribute("data-work-stage") || "",
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      contextGrid: context ? getComputedStyle(context.querySelector('[class*="messageContextPath"]')).gridTemplateColumns : "",
    };
  }, marker);
  check("Worker context card visible", desktop.found && desktop.context, JSON.stringify(desktop));
  check("Main module visible", desktop.text.includes("FŐMODUL") && desktop.text.includes("BENJADMIN"), desktop.text);
  check("Module visible", desktop.text.includes("MODUL") && desktop.text.includes("Fejlesztői Konzol"), desktop.text);
  check("Submodule visible", desktop.text.includes("ALMODUL / FUNKCIÓ") && desktop.text.includes("Közös fejlesztői csevegés"), desktop.text);
  check("Work item visible", desktop.text.includes("Munkarész:") && desktop.text.includes("Kódmérnök-kártya modulhierarchia"), desktop.text);
  check("Six-stage state is 6/3 testing", desktop.stageText.includes("6/3") && desktop.stageText.includes("TESZTELÉS") && desktop.stageAttr === "3", JSON.stringify(desktop));
  check("Current action visible", desktop.text.includes("A kártya új kontextusmezőit és a 6-os állapotjelzőt teszteli."), desktop.text);
  check("Detailed multi-sentence narrative visible", desktop.text.includes("A kódmérnök most") && desktop.text.includes("A 6/3 TESZTELÉS jelzésnek"), desktop.text);
  check("Desktop has no horizontal overflow", desktop.overflow === false, JSON.stringify(desktop));

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const mobile = await page.evaluate((m) => {
    const row = [...document.querySelectorAll('article[data-author="ARMINAI"]')].find((node) => node.textContent?.includes(`${m} ÁrminAI kártya`));
    const context = row?.querySelector('[data-testid="benjadmin-message-work-context"]');
    const path = context?.querySelector('[class*="messageContextPath"]');
    return {
      found: Boolean(row),
      stage: row?.querySelector('[data-testid="benjadmin-work-stage"]')?.textContent || "",
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      grid: path ? getComputedStyle(path).gridTemplateColumns : "",
      text: row?.textContent || "",
    };
  }, marker);
  check("Mobile context card remains visible", mobile.found && mobile.text.includes("FŐMODUL") && mobile.stage.includes("6/3"), JSON.stringify(mobile));
  check("Mobile hierarchy stacks to one column", mobile.grid.split(" ").length === 1, JSON.stringify(mobile));
  check("Mobile has no horizontal overflow", mobile.overflow === false, JSON.stringify(mobile));

  console.log(JSON.stringify({ ok: true, passed, failed: 0, taskId, marker }, null, 2));
} finally {
  await cleanup();
}
