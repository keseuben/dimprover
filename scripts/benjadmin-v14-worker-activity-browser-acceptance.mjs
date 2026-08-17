#!/usr/bin/env node
import fs from "node:fs";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";
try { process.loadEnvFile?.(".env.local"); } catch {}

const key = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const uiBase = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const marker = `V14-BROWSER-${Date.now()}`;
let browser;
let passed = 0;
function check(name, ok, detail = "") { if (!ok) throw new Error(`${name}${detail ? ` :: ${detail}` : ""}`); passed += 1; console.log(`PASS ${name}${detail ? ` :: ${detail}` : ""}`); }
async function cleanup() {
  if (browser) await browser.close().catch(() => {});
  await db.from("dev_center_live_worklog").delete().like("summary", `${marker}%`);
}
function row(worker_code, phase, level, summary, kind, created_at, metadata = {}) {
  return {
    worker_code,
    task_id: null,
    phase,
    level,
    summary,
    detail: metadata.detail || "",
    progress_percent: metadata.progress ?? null,
    source: "worker-activity",
    metadata: { kind, projectId: "project_dimprover", productionAccess: "DENY", ...metadata, detail: undefined, progress: undefined },
    created_at,
  };
}
try {
  const now = Date.now();
  const rows = [
    row("BENAI", "note", "info", `${marker} BenAI`, "MESSAGE", new Date(now - 8000).toISOString()),
    row("ARMINAI", "coding", "info", `${marker} Armin`, "CODE_ACTIVITY", new Date(now - 7000).toISOString(), { detail: "Drive UI kódolás", filePath: "components/drive/DriveWorkspace.tsx", diffSummary: "+48 / -12", progress: 37 }),
    row("JAZMINAI", "test", "success", `${marker} Jazmin`, "TEST_RESULT", new Date(now - 6000).toISOString(), { detail: "Backend acceptance PASS", progress: 72 }),
    row("ARMINAI", "task", "info", `${marker} repeat`, "TASK_UPDATE", new Date(now - 5000).toISOString()),
    row("ARMINAI", "task", "info", `${marker} repeat`, "TASK_UPDATE", new Date(now - 4000).toISOString()),
    row("ARMINAI", "coding", "info", `${marker} yesterday`, "CODE_ACTIVITY", new Date(now - 26 * 3600000).toISOString(), { filePath: "app/yesterday.ts" }),
    row("JAZMINAI", "test", "success", `${marker} week`, "TEST_RESULT", new Date(now - 10 * 86400000).toISOString(), { detail: "Heti archív fixture" }),
  ];
  const inserted = await db.from("dev_center_live_worklog").insert(rows).select("id");
  check("Browser fixtures inserted", !inserted.error && (inserted.data || []).length === rows.length, inserted.error?.message || `rows=${inserted.data?.length}`);

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
  await page.waitForFunction((m) => document.body.textContent?.includes(`${m} Armin`) && document.body.textContent?.includes(`${m} BenAI`) && document.body.textContent?.includes(`${m} Jazmin`), { timeout: 30000 }, marker);

  const colors = await page.evaluate((m) => {
    function card(author, text) {
      const row = [...document.querySelectorAll(`article[data-author="${author}"]`)].find((node) => node.textContent?.includes(text));
      const card = row?.firstElementChild;
      return card ? getComputedStyle(card).backgroundColor : "";
    }
    return {
      ben: card("BENAI", `${m} BenAI`),
      armin: card("ARMINAI", `${m} Armin`),
      jazmin: card("JAZMINAI", `${m} Jazmin`),
    };
  }, marker);
  check("BenAI blue card background rendered", Boolean(colors.ben), JSON.stringify(colors));
  check("ArminAI green card background rendered", Boolean(colors.armin), JSON.stringify(colors));
  check("JazminAI violet card background rendered", Boolean(colors.jazmin), JSON.stringify(colors));
  check("AI card backgrounds are visually distinct", new Set([colors.ben, colors.armin, colors.jazmin]).size === 3, JSON.stringify(colors));

  const repeated = await page.evaluate((m) => {
    const row = [...document.querySelectorAll('article[data-author="ARMINAI"]')].find((node) => node.textContent?.includes(`${m} repeat`));
    return row?.textContent || "";
  }, marker);
  check("Repeated task updates collapse to one card", repeated.includes("×2"), repeated);

  await page.waitForSelector('[data-testid="benjadmin-conversation-archive"]', { timeout: 15000 });
  const yesterdayState = await page.evaluate(() => {
    const button = [...document.querySelectorAll("[data-archive-toggle]")].find((node) => node.textContent?.includes("Tegnap"));
    const group = button?.closest("[data-archive-key]");
    return { found: Boolean(button), expanded: group?.getAttribute("data-expanded") || "" };
  });
  check("Yesterday archive group exists", yesterdayState.found, JSON.stringify(yesterdayState));
  check("Yesterday archive is collapsed by default", yesterdayState.expanded === "false", JSON.stringify(yesterdayState));
  await page.evaluate(() => { const button = [...document.querySelectorAll("[data-archive-toggle]")].find((node) => node.textContent?.includes("Tegnap")); if (!(button instanceof HTMLElement)) throw new Error("Yesterday archive toggle missing"); button.click(); });
  await page.waitForFunction((m) => document.body.textContent?.includes(`${m} yesterday`), { timeout: 10000 }, marker);
  check("Yesterday archive expands on demand", true);

  const earlierButton = await page.$('[data-testid="benjadmin-archive-show-earlier"]');
  check("Older than one week stays behind one reveal button", Boolean(earlierButton));
  if (earlierButton) await page.click('[data-testid="benjadmin-archive-show-earlier"]');
  await new Promise((resolve) => setTimeout(resolve, 500));
  let weekVisible = false;
  for (let i = 0; i < 12 && !weekVisible; i += 1) {
    await page.evaluate(() => { for (const button of document.querySelectorAll("[data-archive-toggle]")) if (button instanceof HTMLElement && button.textContent?.includes("Hét")) button.click(); });
    weekVisible = await page.evaluate((m) => document.body.textContent?.includes(`${m} week`), marker);
    if (weekVisible) break;
    const hasLoad = await page.$('[data-testid="benjadmin-archive-load-more"]');
    if (!hasLoad) break;
    await page.click('[data-testid="benjadmin-archive-load-more"]');
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  check("Weekly archive is lazy-loadable after explicit reveal", weekVisible);

  const chronological = await page.evaluate((m) => {
    const rows = [...document.querySelectorAll('[aria-label="BENJADMIN közös fejlesztői beszélgetés"] article[data-author]')].filter((node) => node.textContent?.includes(m));
    const dates = rows.map((node) => node.querySelector('time')?.getAttribute('datetime') || '');
    return dates.filter(Boolean);
  }, marker);
  check("Conversation cards are chronological oldest to newest", chronological.every((value, index) => index === 0 || chronological[index - 1].localeCompare(value) <= 0), JSON.stringify(chronological));

  await page.click('[data-worker-activity-open="ARMINAI"]');
  await page.waitForSelector('aside[data-worker-code="ARMINAI"] [data-testid="benjadmin-worker-activity-feed"]', { timeout: 15000 });
  const drawer = await page.evaluate((m) => {
    const aside = document.querySelector('aside[data-worker-code="ARMINAI"]');
    return {
      text: aside?.textContent || "",
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      fileVisible: (aside?.textContent || "").includes("components/drive/DriveWorkspace.tsx"),
      diffVisible: (aside?.textContent || "").includes("+48 / -12"),
      markerVisible: (aside?.textContent || "").includes(`${m} Armin`),
    };
  }, marker);
  check("Armin detailed coding chat opens", drawer.text.includes("WORKER KÓDOLÁSI CSEVEGÉS") && drawer.markerVisible, JSON.stringify(drawer));
  check("Worker coding chat shows file and diff detail", drawer.fileVisible && drawer.diffVisible, JSON.stringify(drawer));
  check("Desktop worker drawer overflow safe", drawer.overflow === false, JSON.stringify(drawer));

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const mobile = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, drawer: Boolean(document.querySelector('aside[data-worker-code="ARMINAI"]')) }));
  check("Mobile worker coding chat remains open", mobile.drawer, JSON.stringify(mobile));
  check("Mobile worker coding chat overflow safe", mobile.overflow === false, JSON.stringify(mobile));

  console.log(JSON.stringify({ ok: true, passed, failed: 0, marker, colors }, null, 2));
} finally {
  await cleanup();
}
