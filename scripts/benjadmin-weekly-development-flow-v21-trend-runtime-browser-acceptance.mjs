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
  if (!condition) throw new Error(`FAIL ${label}${detail ? ` :: ${detail}` : ""}`);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")} ${label}${detail ? ` :: ${detail}` : ""}`);
}

const endpoint = `${apiBase}/api/dev/console/weekly-trend-history?weeks=8`;
const unauth = await fetch(endpoint, { headers: { host } });
check("Trend history denies unauthenticated read", unauth.status === 401, `status=${unauth.status}`);
const response = await fetch(endpoint, { headers: { host, "x-dimpro-license-admin-key": key } });
const payload = await response.json();
const history = payload?.history;
check("Trend history API succeeds", response.status === 200 && payload?.ok === true, `status=${response.status}`);
check("Trend history returns exactly eight weeks", history?.weeks === 8 && history?.points?.length === 8, JSON.stringify({ weeks: history?.weeks, points: history?.points?.length }));
check("Trend history remains PROD denied", history?.productionAccess === "DENY" && response.headers.get("x-dimpro-production-access") === "DENY");
check("Trend history points are chronological", history.points.every((point, index, points) => index === 0 || points[index - 1].weekKey < point.weekKey), history.points.map((point) => point.weekKey).join(","));
check("Trend history scores are bounded", history.points.every((point) => Number.isFinite(point.score) && point.score >= 0 && point.score <= 100));
check("Trend history exposes required numeric metrics", history.points.every((point) => ["activities","completed","handoffs","waiting","errors","workers","tests","builds"].every((key) => Number.isFinite(point[key]))));
check("Trend history anchor matches last point", history.anchorWeekKey === history.points.at(-1)?.weekKey, `${history.anchorWeekKey} / ${history.points.at(-1)?.weekKey}`);

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"] });
try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((adminKey) => {
    localStorage.setItem("dimproLicenseAdminKey", adminKey);
    sessionStorage.setItem("dimproBenjadminSession", "active");
  }, key);
  await page.setViewport({ width: 1536, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${uiBase}/dev-console`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="benjadmin-weekly-trend-history"]')?.getAttribute("data-ready") === "true", { timeout: 60_000 });
  const desktop = await page.evaluate(() => {
    const trend = document.querySelector('[data-testid="benjadmin-weekly-trend-history"]');
    return {
      weeks: trend?.getAttribute("data-weeks"),
      metric: trend?.getAttribute("data-metric"),
      anchor: trend?.getAttribute("data-anchor-week"),
      metricButtons: [...(trend?.querySelectorAll("[data-trend-metric]") || [])].map((node) => node.getAttribute("data-trend-metric")),
      svgPoints: trend?.querySelectorAll("svg [data-week-point]").length || 0,
      currentPoints: trend?.querySelectorAll('svg [data-week-point][data-current="true"]').length || 0,
      hasLine: Boolean(trend?.querySelector('[data-trend-line="true"]')),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  check("Trend UI renders eight-week score chart", desktop.weeks === "8" && desktop.metric === "score" && desktop.svgPoints === 8 && desktop.hasLine, JSON.stringify(desktop));
  check("Trend UI exposes five metric buttons", ["score","activities","completed","waiting","errors"].every((metric) => desktop.metricButtons.includes(metric)), JSON.stringify(desktop.metricButtons));
  check("Trend UI marks current week", desktop.currentPoints === 1, JSON.stringify(desktop));
  check("Trend UI anchor matches API anchor", desktop.anchor === history.anchorWeekKey, `${desktop.anchor} / ${history.anchorWeekKey}`);
  check("Trend UI desktop overflow safe", desktop.overflow === false, JSON.stringify(desktop));

  await page.click('[data-trend-metric="errors"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="benjadmin-weekly-trend-history"]')?.getAttribute("data-metric") === "errors");
  const errorsMetric = await page.evaluate(() => ({
    metric: document.querySelector('[data-testid="benjadmin-weekly-trend-history"]')?.getAttribute("data-metric"),
    active: document.querySelector('[data-trend-metric="errors"]')?.getAttribute("data-active"),
    pressed: document.querySelector('[data-trend-metric="errors"]')?.getAttribute("aria-pressed"),
  }));
  check("Trend metric selector switches to errors", errorsMetric.metric === "errors" && errorsMetric.active === "true" && errorsMetric.pressed === "true", JSON.stringify(errorsMetric));

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const mobile = await page.evaluate(() => {
    const trend = document.querySelector('[data-testid="benjadmin-weekly-trend-history"]');
    const wrap = trend?.querySelector('[class*="weeklyTrendChartWrap"]');
    return {
      visible: Boolean(trend),
      points: trend?.querySelectorAll("svg [data-week-point]").length || 0,
      internalScroll: wrap ? wrap.scrollWidth >= wrap.clientWidth : false,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  check("Trend chart remains visible on mobile", mobile.visible && mobile.points === 8, JSON.stringify(mobile));
  check("Trend chart uses internal mobile scrolling", mobile.internalScroll === true, JSON.stringify(mobile));
  check("Trend chart mobile page overflow safe", mobile.overflow === false, JSON.stringify(mobile));
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed, failed: 0, suite: "BENJADMIN Weekly Development Flow V2.1 multi-week trend", productionAccess: "DENY" }, null, 2));
