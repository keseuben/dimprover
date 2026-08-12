import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin/release-kozpont";
const checks = [];

function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"] });

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
  await page.waitForSelector('[data-testid="benjadmin-release-table"]', { timeout: 30000 });

  const state = await page.evaluate(() => {
    const table = document.querySelector('[data-testid="benjadmin-release-table"]');
    const shell = document.querySelector(".benjadmin-data-table-shell");
    return {
      title: document.querySelector(".benjadmin-data-header h1")?.textContent || "",
      headers: Array.from(table?.querySelectorAll("thead th") || []).map((node) => (node.textContent || "").trim()),
      metrics: document.querySelectorAll(".benjadmin-data-metric").length,
      filters: document.querySelectorAll(".benjadmin-data-filter-group button").length,
      search: Boolean(document.querySelector(".benjadmin-data-search input")),
      pagination: Boolean(document.querySelector(".benjadmin-data-pagination")),
      stageStrip: document.querySelectorAll(".benjadmin-data-stage-strip span").length,
      sticky: table?.querySelector("thead") ? getComputedStyle(table.querySelector("thead")).position : "",
      detailsButtons: document.querySelectorAll(".benjadmin-data-row-action").length,
      tableHeight: shell?.getBoundingClientRect().height || 0,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      theme: document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") || "",
      newButton: Array.from(document.querySelectorAll("button")).some((node) => (node.textContent || "").includes("Új release jelölt")),
    };
  });

  check("Release Központ táblázat-első munkatér", state.title.includes("Release Központ") && state.tableHeight >= 400, JSON.stringify({ title: state.title, tableHeight: state.tableHeight }));
  check("Release tábla tíz oszlopos", state.headers.length === 10 && ["Verzió", "Release cím", "Státusz", "Útvonal", "Checklist", "Build / smoke", "Művelet"].every((label) => state.headers.includes(label)), JSON.stringify(state.headers));
  check("Kompakt release KPI sor", state.metrics === 5, `metrics=${state.metrics}`);
  check("Keresés, státuszszűrés és lapozás elérhető", state.search && state.filters === 6 && state.pagination, JSON.stringify(state));
  check("Környezetek kompakt állapotsávja látható", state.stageStrip >= 1, `stages=${state.stageStrip}`);
  check("Release tábla ragadós fejlécet használ", state.sticky === "sticky", `position=${state.sticky}`);
  check("Desktop egy viewportos munkatér", state.scrollHeight <= state.innerHeight + 1, JSON.stringify({ scrollHeight: state.scrollHeight, innerHeight: state.innerHeight }));
  check("Desktop nincs teljes oldali vízszintes túlcsordulás", state.scrollWidth <= state.clientWidth + 1, JSON.stringify({ scrollWidth: state.scrollWidth, clientWidth: state.clientWidth }));
  check("Új release jelölt gomb elérhető", state.newButton);
  check("Sötét mód öröklődik", state.theme === "dark", `theme=${state.theme}`);

  await page.evaluate(() => Array.from(document.querySelectorAll("button")).find((node) => (node.textContent || "").includes("Új release jelölt"))?.click());
  await page.waitForSelector('[data-testid="benjadmin-release-drawer"]', { timeout: 10000 });
  const newDrawer = await page.$eval('[data-testid="benjadmin-release-drawer"]', (drawer) => ({ text: drawer.textContent || "", controls: drawer.querySelectorAll("input,select,textarea,button").length }));
  check("Új release jobb oldali szerkesztőfiókban nyílik", newDrawer.text.includes("ÚJ RELEASE JELÖLT") && newDrawer.text.includes("Biztonsági szabály") && newDrawer.text.includes("Automatikus PRODUCTION deploy nincs bekötve") && newDrawer.controls >= 12, JSON.stringify(newDrawer));
  await page.click('[data-testid="benjadmin-release-drawer"] header button');
  await page.waitForFunction(() => !document.querySelector('[data-testid="benjadmin-release-drawer"]'), { timeout: 10000 });

  if (state.detailsButtons > 0) {
    await page.click(".benjadmin-data-row-action");
    await page.waitForSelector('[data-testid="benjadmin-release-drawer"]', { timeout: 10000 });
    const existing = await page.$eval('[data-testid="benjadmin-release-drawer"]', (drawer) => ({ text: drawer.textContent || "", checkboxes: drawer.querySelectorAll('.benjadmin-release-checklist input[type="checkbox"]').length, statusActions: drawer.querySelectorAll(".benjadmin-release-status-actions button").length }));
    check("Meglévő release részletei szerkesztőfiókban nyílnak", existing.text.includes("RELEASE RÉSZLETEK") && existing.text.includes("Élesítési ellenőrzőlista") && existing.statusActions === 4, JSON.stringify(existing));
    await page.click('[data-testid="benjadmin-release-drawer"] header button');
    await page.waitForFunction(() => !document.querySelector('[data-testid="benjadmin-release-drawer"]'), { timeout: 10000 });
  } else {
    check("Meglévő release részletező ellenőrizhető", true, "Nincs release sor; írás nélkül kihagyva.");
  }

  await page.click('[data-testid="benjadmin-topbar-theme-toggle"]');
  await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") === "light", { timeout: 10000 });
  check("Világos mód a Release Központban működik", await page.$eval(".dimpro-admin-shell", (node) => node.getAttribute("data-theme")) === "light");

  for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "mobil", width: 390, height: 844 }]) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    const responsive = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, table: Boolean(document.querySelector('[data-testid="benjadmin-release-table"]')), pagination: Boolean(document.querySelector(".benjadmin-data-pagination")) }));
    check(`${viewport.name} nincs teljes oldali vízszintes túlcsordulás`, responsive.scrollWidth <= responsive.clientWidth + 1, JSON.stringify(responsive));
    check(`${viewport.name} release tábla és lapozás megmarad`, responsive.table && responsive.pagination, JSON.stringify(responsive));
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
