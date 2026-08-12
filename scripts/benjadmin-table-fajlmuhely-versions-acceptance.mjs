import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin/fajlmuhely-verziok";
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
  await page.waitForSelector('[data-testid="benjadmin-fajlmuhely-version-table"]', { timeout: 30000 });

  const desktop = await page.evaluate(() => {
    const table = document.querySelector('[data-testid="benjadmin-fajlmuhely-version-table"]');
    const shell = document.querySelector(".benjadmin-data-table-shell");
    return {
      title: document.querySelector(".benjadmin-data-header h1")?.textContent || "",
      headers: Array.from(table?.querySelectorAll("thead th") || []).map((node) => (node.textContent || "").trim()),
      metrics: document.querySelectorAll(".benjadmin-data-metric").length,
      filters: document.querySelectorAll(".benjadmin-data-filter-group button").length,
      search: Boolean(document.querySelector(".benjadmin-data-search input")),
      branch: Boolean(document.querySelector(".benjadmin-data-toolbar-single-select")),
      pagination: Boolean(document.querySelector(".benjadmin-data-pagination")),
      sticky: table?.querySelector("thead") ? getComputedStyle(table.querySelector("thead")).position : "",
      details: document.querySelectorAll(".benjadmin-data-row-action").length,
      uploadLink: Array.from(document.querySelectorAll("a")).some((node) => node.getAttribute("href") === "/admin/releases"),
      tableHeight: shell?.getBoundingClientRect().height || 0,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      theme: document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") || "",
    };
  });

  check("Fájlműhely verziók táblázat-első munkatér", desktop.title === "DIMPRO Fájlműhely verziók" && desktop.tableHeight >= 400, JSON.stringify({ title: desktop.title, tableHeight: desktop.tableHeight }));
  check("Fájlműhely verziótábla tíz oszlopos", desktop.headers.length === 10 && ["Verzió", "Fejlesztési ág", "Fájl", "Státusz", "Méret", "Kiadás", "Lejárat", "Letöltések", "Utolsó letöltés", "Művelet"].every((label) => desktop.headers.includes(label)), JSON.stringify(desktop.headers));
  check("Kompakt Fájlműhely release KPI sor", desktop.metrics === 5, `metrics=${desktop.metrics}`);
  check("Keresés, öt státuszszűrő, ág-szűrő és lapozás elérhető", desktop.search && desktop.filters === 5 && desktop.branch && desktop.pagination, JSON.stringify(desktop));
  check("Verziótábla ragadós fejlécet használ", desktop.sticky === "sticky", `position=${desktop.sticky}`);
  check("Release feltöltő hivatkozás megmaradt", desktop.uploadLink);
  check("Desktop egy viewportos munkatér", desktop.scrollHeight <= desktop.innerHeight + 1, JSON.stringify({ scrollHeight: desktop.scrollHeight, innerHeight: desktop.innerHeight }));
  check("Desktop nincs teljes oldali vízszintes túlcsordulás", desktop.scrollWidth <= desktop.clientWidth + 1, JSON.stringify({ scrollWidth: desktop.scrollWidth, clientWidth: desktop.clientWidth }));
  check("Sötét mód öröklődik", desktop.theme === "dark", `theme=${desktop.theme}`);

  if (desktop.details > 0) {
    await page.click(".benjadmin-data-row-action");
    await page.waitForSelector('[data-testid="benjadmin-fajlmuhely-release-drawer"]', { timeout: 10000 });
    const detail = await page.$eval('[data-testid="benjadmin-fajlmuhely-release-drawer"]', (node) => ({ text: node.textContent || "", links: Array.from(node.querySelectorAll("a")).map((a) => a.getAttribute("href")) }));
    check("Fájlműhely release részletező megőrzi a verzióadatokat", ["Fejlesztési ág", "Méret", "Kiadás", "Lejárat", "Letöltések", "Utolsó letöltés", "SHA256"].every((value) => detail.text.includes(value)), detail.text.slice(0, 700));
    await page.click('[data-testid="benjadmin-fajlmuhely-release-drawer"] header button');
  } else {
    check("Fájlműhely release részletező read-only ellenőrzés", true, "Nincs DEV release rekord; írás nélkül kihagyva.");
  }

  await page.click('[data-testid="benjadmin-topbar-theme-toggle"]');
  await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") === "light", { timeout: 10000 });
  check("Világos mód a Fájlműhely verzióoldalon működik", await page.$eval(".dimpro-admin-shell", (node) => node.getAttribute("data-theme")) === "light");

  for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "mobil", width: 390, height: 844 }]) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    const state = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, table: Boolean(document.querySelector('[data-testid="benjadmin-fajlmuhely-version-table"]')), pagination: Boolean(document.querySelector(".benjadmin-data-pagination")) }));
    check(`${viewport.name} nincs teljes oldali vízszintes túlcsordulás`, state.scrollWidth <= state.clientWidth + 1, JSON.stringify(state));
    check(`${viewport.name} Fájlműhely verziótábla és lapozás megmarad`, state.table && state.pagination, JSON.stringify(state));
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
