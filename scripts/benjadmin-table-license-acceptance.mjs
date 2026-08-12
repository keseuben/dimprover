import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin/licenckozpont";
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
  await page.waitForSelector('[data-testid="benjadmin-license-table"]', { timeout: 30000 });

  const desktop = await page.evaluate(() => {
    const table = document.querySelector('[data-testid="benjadmin-license-table"]');
    const headers = Array.from(table?.querySelectorAll("thead th") || []).map((node) => (node.textContent || "").trim());
    const shell = document.querySelector(".benjadmin-data-table-shell");
    return {
      title: document.querySelector(".benjadmin-data-header h1")?.textContent || "",
      headers,
      rowCount: table?.querySelectorAll("tbody tr").length || 0,
      metrics: document.querySelectorAll(".benjadmin-data-metric").length,
      filters: document.querySelectorAll(".benjadmin-data-filter-group button").length,
      search: Boolean(document.querySelector(".benjadmin-data-search input")),
      pagination: Boolean(document.querySelector(".benjadmin-data-pagination")),
      sticky: table?.querySelector("thead") ? getComputedStyle(table.querySelector("thead")).position : "",
      tableHeight: shell?.getBoundingClientRect().height || 0,
      pageScrollWidth: document.documentElement.scrollWidth,
      pageClientWidth: document.documentElement.clientWidth,
      pageScrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      theme: document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") || "",
      editButtons: document.querySelectorAll(".benjadmin-data-row-action").length,
      newButton: Array.from(document.querySelectorAll("button")).some((node) => (node.textContent || "").includes("Új licenc")),
    };
  });

  check("Licencközpont táblázat-első munkatér", desktop.title.includes("Központi licencek") && desktop.tableHeight >= 400, JSON.stringify({ title: desktop.title, tableHeight: desktop.tableHeight }));
  check("Licenctábla tíz oszlopos", desktop.headers.length === 10 && ["Licenckód", "Tulajdonos", "Státusz", "Modulok", "Send-jog", "Művelet"].every((label) => desktop.headers.includes(label)), JSON.stringify(desktop.headers));
  check("Kompakt licenc KPI státuszsor", desktop.metrics === 5, `metrics=${desktop.metrics}`);
  check("Keresés, státuszszűrés és lapozás elérhető", desktop.search && desktop.filters >= 5 && desktop.pagination, JSON.stringify({ search: desktop.search, filters: desktop.filters, pagination: desktop.pagination }));
  check("Licenctábla ragadós fejlécet használ", desktop.sticky === "sticky", `position=${desktop.sticky}`);
  check("Új licenc művelet elérhető", desktop.newButton);
  check("Desktop egy viewportos munkatér", desktop.pageScrollHeight <= desktop.innerHeight + 1, JSON.stringify({ scrollHeight: desktop.pageScrollHeight, innerHeight: desktop.innerHeight }));
  check("Desktop nincs teljes oldali vízszintes túlcsordulás", desktop.pageScrollWidth <= desktop.pageClientWidth + 1, JSON.stringify({ scrollWidth: desktop.pageScrollWidth, clientWidth: desktop.pageClientWidth }));
  check("Sötét mód öröklődik", desktop.theme === "dark", `theme=${desktop.theme}`);

  const newButton = await page.$x?.("//button[contains(., 'Új licenc')]");
  if (newButton?.[0]) await newButton[0].click();
  else await page.evaluate(() => Array.from(document.querySelectorAll("button")).find((node) => (node.textContent || "").includes("Új licenc"))?.click());
  await page.waitForSelector('[data-testid="benjadmin-license-drawer"]', { timeout: 10000 });
  const newDrawer = await page.evaluate(() => {
    const drawer = document.querySelector('[data-testid="benjadmin-license-drawer"]');
    return {
      text: drawer?.textContent || "",
      inputs: drawer?.querySelectorAll("input,select").length || 0,
      width: drawer?.getBoundingClientRect().width || 0,
    };
  });
  check("Új licenc jobb oldali szerkesztőfiókban nyílik", newDrawer.text.includes("ÚJ KÖZPONTI LICENC") && newDrawer.text.includes("Licenc létrehozása") && newDrawer.inputs >= 8, JSON.stringify(newDrawer));
  await page.click('[data-testid="benjadmin-license-drawer"] header button');
  await page.waitForFunction(() => !document.querySelector('[data-testid="benjadmin-license-drawer"]'), { timeout: 10000 });

  if (desktop.editButtons > 0) {
    await page.click(".benjadmin-data-row-action");
    await page.waitForSelector('[data-testid="benjadmin-license-drawer"]', { timeout: 10000 });
    const editDrawer = await page.$eval('[data-testid="benjadmin-license-drawer"]', (drawer) => ({ text: drawer.textContent || "", controls: drawer.querySelectorAll("input,select,button").length }));
    check("Meglévő licenc szerkesztése ugyanebben a fiókban történik", editDrawer.text.includes("LICENC SZERKESZTÉSE") && editDrawer.text.includes("Moduljogosultságok") && editDrawer.controls >= 8, JSON.stringify(editDrawer));
    await page.click('[data-testid="benjadmin-license-drawer"] header button');
    await page.waitForFunction(() => !document.querySelector('[data-testid="benjadmin-license-drawer"]'), { timeout: 10000 });
  } else {
    check("Meglévő licenc szerkesztőfiók ellenőrizhető", true, "Nincs licencsor a DEV adatforrásban; írás nélkül kihagyva.");
  }

  await page.click('[data-testid="benjadmin-topbar-theme-toggle"]');
  await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") === "light", { timeout: 10000 });
  check("Világos mód a Licencközpontban is működik", await page.$eval(".dimpro-admin-shell", (node) => node.getAttribute("data-theme")) === "light");

  for (const viewport of [
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobil", width: 390, height: 844 },
  ]) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    const state = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      table: Boolean(document.querySelector('[data-testid="benjadmin-license-table"]')),
      pagination: Boolean(document.querySelector(".benjadmin-data-pagination")),
    }));
    check(`${viewport.name} nincs teljes oldali vízszintes túlcsordulás`, state.scrollWidth <= state.clientWidth + 1, JSON.stringify(state));
    check(`${viewport.name} licenctábla és lapozás megmarad`, state.table && state.pagination, JSON.stringify(state));
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
