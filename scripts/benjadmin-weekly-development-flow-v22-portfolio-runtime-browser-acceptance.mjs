#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const runtimeRoot = process.env.BENJADMIN_RUNTIME_ROOT || process.cwd();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const uiBase = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const key = fs.readFileSync(path.join(runtimeRoot, ".dimprover/license/admin-key.txt"), "utf8").trim();
let passed = 0;
function check(label, condition, detail = "") {
  if (!condition) throw new Error("FAIL " + label + (detail ? " :: " + detail : ""));
  passed += 1;
  console.log("PASS " + String(passed).padStart(2, "0") + " " + label + (detail ? " :: " + detail : ""));
}

const endpoint = apiBase + "/api/dev/console/weekly-portfolio";
const unauth = await fetch(endpoint, { headers: { host } });
check("Portfolio denies unauthenticated read", unauth.status === 401, "status=" + unauth.status);
const started = Date.now();
const response = await fetch(endpoint, { headers: { host, "x-dimpro-license-admin-key": key } });
const elapsedMs = Date.now() - started;
const payload = await response.json();
const portfolio = payload?.portfolio;
check("Portfolio API succeeds", response.status === 200 && payload?.ok === true, "status=" + response.status + " time=" + elapsedMs + "ms");
check("Portfolio remains PROD denied", portfolio?.productionAccess === "DENY" && response.headers.get("x-dimpro-production-access") === "DENY");
check("Portfolio returns active project rows", Array.isArray(portfolio?.projects) && portfolio.projects.length >= 1 && portfolio.projects.every((row) => row.projectStatus === "active"), "projects=" + (portfolio?.projects?.length || 0));
check("Portfolio ranks all projects sequentially", portfolio.projects.every((row, index) => row.rank === index + 1));
check("Portfolio scores are bounded", portfolio.projects.every((row) => Number.isFinite(row.score) && row.score >= 0 && row.score <= 100));
const severity = { critical: 0, watch: 1, stable: 2 };
check("Portfolio severity ordering is monotonic", portfolio.projects.every((row, index, rows) => index === 0 || severity[rows[index - 1].managementStatus] <= severity[row.managementStatus]));
check("Portfolio score ordering is monotonic inside severity", portfolio.projects.every((row, index, rows) => index === 0 || rows[index - 1].managementStatus !== row.managementStatus || rows[index - 1].score <= row.score));
check("Portfolio totals match project count", portfolio.totals.projects === portfolio.projects.length && portfolio.totals.stable + portfolio.totals.watch + portfolio.totals.critical === portfolio.projects.length, JSON.stringify(portfolio.totals));
check("Portfolio average score matches rows", portfolio.totals.averageScore === Math.round(portfolio.projects.reduce((sum, row) => sum + row.score, 0) / portfolio.projects.length));
check("Portfolio row metrics are nonnegative", portfolio.projects.every((row) => [row.activities,row.completed,row.blocked,row.waiting,row.errors,row.workers,row.handoffs].every((value) => Number.isFinite(value) && value >= 0)));

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"] });
try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((adminKey) => {
    localStorage.setItem("dimproLicenseAdminKey", adminKey);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.removeItem("benjadmin-developer-console-project");
  }, key);
  await page.setViewport({ width: 1536, height: 950, deviceScaleFactor: 1 });
  await page.goto(uiBase + "/dev-console", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="benjadmin-weekly-portfolio"]')?.getAttribute("data-ready") === "true", { timeout: 60_000 });
  const desktop = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="benjadmin-weekly-portfolio"]');
    const rows = [...(panel?.querySelectorAll("[data-portfolio-project]") || [])];
    return {
      count: Number(panel?.getAttribute("data-project-count") || 0),
      week: panel?.getAttribute("data-week-key"),
      rows: rows.map((row) => ({ id: row.getAttribute("data-portfolio-project"), rank: row.getAttribute("data-rank"), status: row.getAttribute("data-status"), selected: row.getAttribute("data-selected") })),
      totals: panel?.querySelectorAll('div[class*="weeklyPortfolioTotals"] article').length || 0,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  check("Portfolio UI renders all API projects", desktop.count === portfolio.projects.length && desktop.rows.length === portfolio.projects.length, JSON.stringify(desktop));
  check("Portfolio UI renders five KPI cards", desktop.totals === 5, JSON.stringify(desktop));
  check("Portfolio UI keeps API ranking and statuses", desktop.rows.every((row, index) => row.id === portfolio.projects[index].projectId && Number(row.rank) === portfolio.projects[index].rank && row.status === portfolio.projects[index].managementStatus));
  check("Portfolio UI desktop overflow safe", desktop.overflow === false, JSON.stringify(desktop));

  const targetProjectId = portfolio.projects[0].projectId;
  await page.click('[data-portfolio-project="' + targetProjectId + '"]');
  await page.waitForFunction((projectId) => document.querySelector('[data-testid="benjadmin-weekly-development-summary"]')?.getAttribute("data-project-id") === projectId, { timeout: 60_000 }, targetProjectId);
  const selection = await page.evaluate((projectId) => ({
    summaryProject: document.querySelector('[data-testid="benjadmin-weekly-development-summary"]')?.getAttribute("data-project-id"),
    selected: document.querySelector('[data-portfolio-project="' + projectId + '"]')?.getAttribute("data-selected"),
    stored: localStorage.getItem("benjadmin-developer-console-project"),
  }), targetProjectId);
  check("Portfolio row click switches weekly project", selection.summaryProject === targetProjectId && selection.selected === "true", JSON.stringify(selection));
  check("Portfolio row click persists canonical project selection", selection.stored === targetProjectId, JSON.stringify(selection));

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const mobile = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="benjadmin-weekly-portfolio"]');
    return {
      visible: Boolean(panel),
      rows: panel?.querySelectorAll("[data-portfolio-project]").length || 0,
      selected: panel?.querySelectorAll('[data-portfolio-project][data-selected="true"]').length || 0,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  check("Portfolio remains visible on mobile", mobile.visible && mobile.rows === portfolio.projects.length, JSON.stringify(mobile));
  check("Portfolio keeps selected project on mobile", mobile.selected === 1, JSON.stringify(mobile));
  check("Portfolio mobile page overflow safe", mobile.overflow === false, JSON.stringify(mobile));
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed, failed: 0, suite: "BENJADMIN Weekly Development Flow V2.2 portfolio", apiElapsedMs: elapsedMs, productionAccess: "DENY" }, null, 2));
