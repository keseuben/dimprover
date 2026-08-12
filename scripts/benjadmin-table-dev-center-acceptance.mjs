import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin/dev";
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
  await page.waitForSelector('[data-testid="benjadmin-dev-versions-table"]', { timeout: 30000 });

  const desktop = await page.evaluate(() => {
    const table = document.querySelector('[data-testid="benjadmin-dev-versions-table"]');
    const shell = document.querySelector(".benjadmin-data-table-shell");
    return {
      title: document.querySelector(".benjadmin-data-header h1")?.textContent || "",
      headers: Array.from(table?.querySelectorAll("thead th") || []).map((node) => (node.textContent || "").trim()),
      metrics: document.querySelectorAll(".benjadmin-data-metric").length,
      filters: document.querySelectorAll(".benjadmin-data-filter-group button").length,
      search: Boolean(document.querySelector(".benjadmin-data-search input")),
      pagination: Boolean(document.querySelector(".benjadmin-data-pagination")),
      sticky: table?.querySelector("thead") ? getComputedStyle(table.querySelector("thead")).position : "",
      detailButtons: document.querySelectorAll(".benjadmin-data-row-action").length,
      engineButton: Array.from(document.querySelectorAll("button")).some((node) => (node.textContent || "").includes("Fejlesztési motor")),
      tableHeight: shell?.getBoundingClientRect().height || 0,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      theme: document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") || "",
    };
  });

  check("Fejlesztési Központ táblázat-első munkatér", desktop.title === "Fejlesztési Központ" && desktop.tableHeight >= 400, JSON.stringify({ title: desktop.title, tableHeight: desktop.tableHeight }));
  check("Verziótábla kilenc oszlopos", desktop.headers.length === 9 && ["Projekt", "Modul", "Verzió", "Fejlesztés", "Státusz", "Ráfordítás", "Aktív időkategória", "Frissítve", "Művelet"].every((label) => desktop.headers.includes(label)), JSON.stringify(desktop.headers));
  check("Kompakt fejlesztési KPI sor", desktop.metrics === 5, `metrics=${desktop.metrics}`);
  check("Keresés, nézetváltó, státuszszűrés és lapozás elérhető", desktop.search && desktop.filters >= 8 && desktop.pagination, JSON.stringify({ search: desktop.search, filters: desktop.filters, pagination: desktop.pagination }));
  check("Verziótábla ragadós fejlécet használ", desktop.sticky === "sticky", `position=${desktop.sticky}`);
  check("Fejlesztési motor külön panelen elérhető", desktop.engineButton);
  check("Desktop egy viewportos munkatér", desktop.scrollHeight <= desktop.innerHeight + 1, JSON.stringify({ scrollHeight: desktop.scrollHeight, innerHeight: desktop.innerHeight }));
  check("Desktop nincs teljes oldali vízszintes túlcsordulás", desktop.scrollWidth <= desktop.clientWidth + 1, JSON.stringify({ scrollWidth: desktop.scrollWidth, clientWidth: desktop.clientWidth }));
  check("Sötét mód öröklődik", desktop.theme === "dark", `theme=${desktop.theme}`);

  await page.evaluate(() => Array.from(document.querySelectorAll(".benjadmin-data-filter-group button")).find((node) => (node.textContent || "").trim() === "Munkamenetek")?.click());
  await page.waitForSelector('[data-testid="benjadmin-dev-sessions-table"]', { timeout: 10000 });
  const sessionHeaders = await page.$$eval('[data-testid="benjadmin-dev-sessions-table"] thead th', (nodes) => nodes.map((node) => (node.textContent || "").trim()));
  check("Munkamenetek külön kilenc oszlopos táblában jelennek meg", sessionHeaders.length === 9 && ["Projekt", "Modul", "Verzió", "Forrás", "Időkategória", "Kezdés", "Befejezés", "Időtartam", "Állapot"].every((label) => sessionHeaders.includes(label)), JSON.stringify(sessionHeaders));

  await page.evaluate(() => Array.from(document.querySelectorAll(".benjadmin-data-filter-group button")).find((node) => (node.textContent || "").trim() === "Projektek")?.click());
  await page.waitForSelector('[data-testid="benjadmin-dev-projects-table"]', { timeout: 10000 });
  const projectHeaders = await page.$$eval('[data-testid="benjadmin-dev-projects-table"] thead th', (nodes) => nodes.map((node) => (node.textContent || "").trim()));
  check("Projektek külön kilenc oszlopos táblában jelennek meg", projectHeaders.length === 9 && ["Projekt", "Slug", "Kategória", "Státusz", "Verziók", "Munkamenetek", "Indulás", "Frissítve", "Leírás"].every((label) => projectHeaders.includes(label)), JSON.stringify(projectHeaders));

  await page.evaluate(() => Array.from(document.querySelectorAll(".benjadmin-data-filter-group button")).find((node) => (node.textContent || "").trim() === "Verziók")?.click());
  await page.waitForSelector('[data-testid="benjadmin-dev-versions-table"]', { timeout: 10000 });

  if (desktop.detailButtons > 0) {
    await page.click(".benjadmin-data-row-action");
    await page.waitForSelector('[data-testid="benjadmin-dev-version-drawer"]', { timeout: 10000 });
    const detail = await page.$eval('[data-testid="benjadmin-dev-version-drawer"]', (drawer) => ({ text: drawer.textContent || "", startStopButtons: Array.from(drawer.querySelectorAll("button")).filter((button) => /Munkamenet (indítása|leállítása)/.test(button.textContent || "")).length }));
    check("Verzió részletei oldalsó panelen nyílnak", detail.text.includes("FEJLESZTÉSI VERZIÓ") && detail.text.includes("Ráfordított idő") && detail.startStopButtons === 1, JSON.stringify(detail));
    await page.click('[data-testid="benjadmin-dev-version-drawer"] header button');
    await page.waitForFunction(() => !document.querySelector('[data-testid="benjadmin-dev-version-drawer"]'), { timeout: 10000 });
  } else {
    check("Verzió részletező read-only ellenőrzés", true, "Nincs verziósor a DEV adatforrásban; írás nélkül kihagyva.");
  }

  await page.evaluate(() => Array.from(document.querySelectorAll("button")).find((node) => (node.textContent || "").includes("Fejlesztési motor"))?.click());
  await page.waitForSelector('[data-testid="benjadmin-dev-engine-drawer"]', { timeout: 10000 });
  const engine = await page.$eval('[data-testid="benjadmin-dev-engine-drawer"]', (drawer) => ({ text: drawer.textContent || "", width: drawer.getBoundingClientRect().width }));
  check("Fejlesztési motor külön oldalsó panelen nyílik", engine.text.includes("Fejlesztési motor") && engine.width >= 700, JSON.stringify({ width: engine.width, text: engine.text.slice(0, 180) }));
  await page.click('[data-testid="benjadmin-dev-engine-drawer"] header button');
  await page.waitForFunction(() => !document.querySelector('[data-testid="benjadmin-dev-engine-drawer"]'), { timeout: 10000 });

  await page.click('[data-testid="benjadmin-topbar-theme-toggle"]');
  await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") === "light", { timeout: 10000 });
  check("Világos mód a Fejlesztési Központban működik", await page.$eval(".dimpro-admin-shell", (node) => node.getAttribute("data-theme")) === "light");

  for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "mobil", width: 390, height: 844 }]) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    const state = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, table: Boolean(document.querySelector('[data-testid="benjadmin-dev-versions-table"]')), pagination: Boolean(document.querySelector(".benjadmin-data-pagination")) }));
    check(`${viewport.name} nincs teljes oldali vízszintes túlcsordulás`, state.scrollWidth <= state.clientWidth + 1, JSON.stringify(state));
    check(`${viewport.name} fejlesztési tábla és lapozás megmarad`, state.table && state.pagination, JSON.stringify(state));
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
