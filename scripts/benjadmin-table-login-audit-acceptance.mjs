import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin/dimpro-belepesek";
const checks = [];

function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"],
});

try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((key) => {
    localStorage.setItem("dimproLicenseAdminKey", key);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.setItem("dimpro-admin-theme", "dark");
    localStorage.setItem("dimpro-benjadmin-board-pinned", "false");
  }, adminKey);

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="benjadmin-audit-table"]', { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector(".benjadmin-data-primary-action")?.textContent?.includes("Frissítés…"), { timeout: 30000 }).catch(() => {});

  const desktop = await page.evaluate(() => {
    const table = document.querySelector('[data-testid="benjadmin-audit-table"]');
    const workspace = document.querySelector(".benjadmin-data-workspace");
    const tableShell = document.querySelector(".benjadmin-data-table-shell");
    const metrics = document.querySelectorAll(".benjadmin-data-metric");
    const headers = Array.from(table?.querySelectorAll("thead th") || []).map((node) => (node.textContent || "").trim());
    const tooSmall = Array.from(document.querySelectorAll(".benjadmin-data-workspace :is(p,span,small,strong,b,td,button,input,label,select)")).filter((node) => {
      const text = node.textContent?.trim() || (node instanceof HTMLInputElement ? node.placeholder : "");
      return text && Number.parseFloat(getComputedStyle(node).fontSize || "0") < 10;
    }).slice(0, 12).map((node) => ({ text: node.textContent?.trim().slice(0, 35), size: getComputedStyle(node).fontSize }));
    return {
      title: document.querySelector(".benjadmin-data-header h1")?.textContent || "",
      metrics: metrics.length,
      headers,
      sticky: table?.querySelector("thead") ? getComputedStyle(table.querySelector("thead")).position : "",
      pagination: Boolean(document.querySelector(".benjadmin-data-pagination")),
      search: Boolean(document.querySelector(".benjadmin-data-search input")),
      filters: document.querySelectorAll(".benjadmin-data-filter-group button").length,
      workspaceHeight: workspace?.getBoundingClientRect().height || 0,
      tableHeight: tableShell?.getBoundingClientRect().height || 0,
      pageScrollWidth: document.documentElement.scrollWidth,
      pageClientWidth: document.documentElement.clientWidth,
      pageScrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      theme: document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") || "",
      tooSmall,
    };
  });

  check("Audit oldal táblázat-első munkatér", desktop.title.includes("DIMPRO belépési audit") && desktop.tableHeight >= 400, JSON.stringify({ title: desktop.title, tableHeight: desktop.tableHeight }));
  check("Kompakt KPI státuszsor megmarad", desktop.metrics === 5, `metrics=${desktop.metrics}`);
  check("Audit tábla nyolc részletes oszlopot tartalmaz", desktop.headers.length === 8 && ["Időpont", "E-mail", "Eredmény", "IP-cím", "Domain"].every((label) => desktop.headers.includes(label)), JSON.stringify(desktop.headers));
  check("Táblázat fejléc ragadós", desktop.sticky === "sticky", `position=${desktop.sticky}`);
  check("Keresés, szűrés és lapozás elérhető", desktop.search && desktop.filters === 3 && desktop.pagination, JSON.stringify(desktop));
  check("Desktop teljes oldal nem vízszintesen scrollozik", desktop.pageScrollWidth <= desktop.pageClientWidth + 1, JSON.stringify({ scrollWidth: desktop.pageScrollWidth, clientWidth: desktop.pageClientWidth }));
  check("Desktop egy viewportos munkatér", desktop.pageScrollHeight <= desktop.innerHeight + 1, JSON.stringify({ scrollHeight: desktop.pageScrollHeight, innerHeight: desktop.innerHeight }));
  check("Sötét mód öröklődik", desktop.theme === "dark", `theme=${desktop.theme}`);
  check("Működési szöveg legalább 10px", desktop.tooSmall.length === 0, JSON.stringify(desktop.tooSmall));

  await page.click('[data-testid="benjadmin-topbar-theme-toggle"]');
  await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") === "light", { timeout: 10000 });
  check("Világos mód ugyanazon audit munkatérre vált", await page.$eval(".dimpro-admin-shell", (node) => node.getAttribute("data-theme")) === "light");

  for (const viewport of [
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobil", width: 390, height: 844 },
  ]) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    const state = await page.evaluate(() => ({
      pageScrollWidth: document.documentElement.scrollWidth,
      pageClientWidth: document.documentElement.clientWidth,
      table: Boolean(document.querySelector('[data-testid="benjadmin-audit-table"]')),
      pagination: Boolean(document.querySelector(".benjadmin-data-pagination")),
    }));
    check(`${viewport.name} nincs teljes oldali vízszintes túlcsordulás`, state.pageScrollWidth <= state.pageClientWidth + 1, JSON.stringify(state));
    check(`${viewport.name} táblázat és lapozás megmarad`, state.table && state.pagination, JSON.stringify(state));
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
