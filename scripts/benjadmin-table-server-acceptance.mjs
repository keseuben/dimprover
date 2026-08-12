import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin/szerver";
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
  await page.waitForSelector('[data-testid="benjadmin-infrastructure-table"]', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="benjadmin-infrastructure-table"] tbody tr').length >= 5, { timeout: 60000 }).catch(() => {});

  const desktop = await page.evaluate(() => {
    const table = document.querySelector('[data-testid="benjadmin-infrastructure-table"]');
    const shell = document.querySelector(".benjadmin-data-table-shell");
    const rows = Array.from(table?.querySelectorAll("tbody tr") || []).map((row) => (row.textContent || "").replace(/\s+/g, " ").trim());
    return {
      title: document.querySelector(".benjadmin-data-header h1")?.textContent || "",
      headers: Array.from(table?.querySelectorAll("thead th") || []).map((node) => (node.textContent || "").trim()),
      rows,
      metrics: document.querySelectorAll(".benjadmin-data-metric").length,
      filters: document.querySelectorAll(".benjadmin-data-filter-group button").length,
      search: Boolean(document.querySelector(".benjadmin-data-search input")),
      sticky: table?.querySelector("thead") ? getComputedStyle(table.querySelector("thead")).position : "",
      detailButtons: document.querySelectorAll(".benjadmin-data-row-action").length,
      tableHeight: shell?.getBoundingClientRect().height || 0,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      theme: document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") || "",
      detailLink: Array.from(document.querySelectorAll("a")).some((node) => node.getAttribute("href") === "/admin/szerver/reszletes"),
    };
  });

  check("Szerverfigyelő táblázat-első munkatér", desktop.title === "Szerver- és tárhelyállapot" && desktop.tableHeight >= 400, JSON.stringify({ title: desktop.title, tableHeight: desktop.tableHeight }));
  check("Infrastruktúra tábla tizenegy oszlopos", desktop.headers.length === 11 && ["Rendszer", "Típus", "Állapot", "CPU", "Memória", "Swap", "Lemez / tárhely", "Foglalt / kapacitás", "Load / válaszidő", "Adatminta", "Művelet"].every((label) => desktop.headers.includes(label)), JSON.stringify(desktop.headers));
  check("DEV / ÉLES / DB / Drive / Drop egy táblában van", ["BENJADMIN DEV VPS", "PRODUCTION / ÉLES VPS", "DB VPS", "DIMPRO Drive tárhely", "DIMPRO Drop tárhely"].every((label) => desktop.rows.some((row) => row.includes(label))), JSON.stringify(desktop.rows));
  check("Swap oszlop minden infrastruktúra-célon megmarad", desktop.headers.includes("Swap") && desktop.rows.some((row) => row.includes("BENJADMIN DEV VPS") && /\d+%/.test(row)), desktop.rows[0] || "");
  check("S3 foglaltság és kapacitás megjelenik", desktop.rows.filter((row) => row.includes("tárhely")).every((row) => row.includes("keret nincs beállítva") || /GB|TB|MB/.test(row)), JSON.stringify(desktop.rows.filter((row) => row.includes("tárhely"))));
  check("Kompakt infrastruktúra KPI sor", desktop.metrics === 5, `metrics=${desktop.metrics}`);
  check("Keresés és infrastruktúra szűrők elérhetők", desktop.search && desktop.filters === 4, JSON.stringify({ search: desktop.search, filters: desktop.filters }));
  check("Infrastruktúra tábla ragadós fejlécet használ", desktop.sticky === "sticky", `position=${desktop.sticky}`);
  check("Részletes DEV diagnosztika külön útvonalon megmaradt", desktop.detailLink);
  check("Desktop egy viewportos munkatér", desktop.scrollHeight <= desktop.innerHeight + 1, JSON.stringify({ scrollHeight: desktop.scrollHeight, innerHeight: desktop.innerHeight }));
  check("Desktop nincs teljes oldali vízszintes túlcsordulás", desktop.scrollWidth <= desktop.clientWidth + 1, JSON.stringify({ scrollWidth: desktop.scrollWidth, clientWidth: desktop.clientWidth }));
  check("Sötét mód öröklődik", desktop.theme === "dark", `theme=${desktop.theme}`);

  await page.click(".benjadmin-data-row-action");
  await page.waitForSelector('[data-testid="benjadmin-infrastructure-drawer"]', { timeout: 10000 });
  const devDrawer = await page.$eval('[data-testid="benjadmin-infrastructure-drawer"]', (drawer) => ({ text: drawer.textContent || "", links: Array.from(drawer.querySelectorAll("a")).map((node) => node.getAttribute("href")) }));
  check("DEV szerver részletező panel CPU/RAM/swap/lemez adatot tartalmaz", ["CPU", "Memória", "Swap", "Lemez / tárhely", "DEV szolgáltatások", "B3.1 monitorozási minták"].every((value) => devDrawer.text.includes(value)), devDrawer.text.slice(0, 500));
  check("DEV részletezőből elérhető a részletes diagnosztika", devDrawer.links.includes("/admin/szerver/reszletes"), JSON.stringify(devDrawer.links));
  await page.click('[data-testid="benjadmin-infrastructure-drawer"] header button');
  await page.waitForFunction(() => !document.querySelector('[data-testid="benjadmin-infrastructure-drawer"]'), { timeout: 10000 });

  const driveRowIndex = await page.$$eval('[data-testid="benjadmin-infrastructure-table"] tbody tr', (rows) => rows.findIndex((row) => (row.textContent || "").includes("DIMPRO Drive tárhely")));
  if (driveRowIndex >= 0) {
    const buttons = await page.$$('[data-testid="benjadmin-infrastructure-table"] tbody tr .benjadmin-data-row-action');
    await buttons[driveRowIndex].click();
    await page.waitForSelector('[data-testid="benjadmin-infrastructure-drawer"]', { timeout: 10000 });
    const storageText = await page.$eval('[data-testid="benjadmin-infrastructure-drawer"]', (drawer) => drawer.textContent || "");
    check("Drive S3 részletező bucket, objektumszám és DIMPRO keret adatot mutat", storageText.includes("Objektumtárhely") && storageText.includes("Bucket") && storageText.includes("Objektumok") && storageText.includes("DIMPRO tárhelykeret"), storageText.slice(0, 500));
    await page.click('[data-testid="benjadmin-infrastructure-drawer"] header button');
  } else {
    check("Drive S3 részletező ellenőrizhető", false, "Drive sor hiányzik");
  }

  const detailPage = await browser.newPage();
  await detailPage.evaluateOnNewDocument((key) => {
    localStorage.setItem("dimproLicenseAdminKey", key);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.setItem("dimpro-admin-theme", "dark");
  }, adminKey);
  await detailPage.goto("http://admin.dev.dimpro.hu:3100/admin/szerver/reszletes", { waitUntil: "domcontentloaded", timeout: 60000 });
  await detailPage.waitForFunction(() => document.body.textContent?.includes("Szerver állapotfigyelő"), { timeout: 30000 });
  const detailText = await detailPage.evaluate(() => document.body.textContent || "");
  check("Korábbi részletes DEV diagnosztika funkciói megmaradtak", detailText.includes("Részletes VPS-diagnosztika") && detailText.includes("swap") && detailText.includes("PM2"), detailText.slice(0, 400));
  await detailPage.close();

  await page.click('[data-testid="benjadmin-topbar-theme-toggle"]');
  await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") === "light", { timeout: 10000 });
  check("Világos mód a Szerverfigyelőben működik", await page.$eval(".dimpro-admin-shell", (node) => node.getAttribute("data-theme")) === "light");

  for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "mobil", width: 390, height: 844 }]) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    const state = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, table: Boolean(document.querySelector('[data-testid="benjadmin-infrastructure-table"]')) }));
    check(`${viewport.name} nincs teljes oldali vízszintes túlcsordulás`, state.scrollWidth <= state.clientWidth + 1, JSON.stringify(state));
    check(`${viewport.name} infrastruktúra tábla megmarad`, state.table, JSON.stringify(state));
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
