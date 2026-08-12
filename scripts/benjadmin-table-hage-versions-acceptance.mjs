import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin/hage-verziok";
const checks = [];

function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}

function installSession(page) {
  return page.evaluateOnNewDocument((key) => {
    localStorage.setItem("dimproLicenseAdminKey", key);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.setItem("dimpro-admin-theme", "dark");
    localStorage.setItem("dimpro-benjadmin-board-pinned", "false");
  }, adminKey);
}

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"] });

try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await installSession(page);
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="benjadmin-hage-version-table"]', { timeout: 30000 });

  const desktop = await page.evaluate(() => {
    const table = document.querySelector('[data-testid="benjadmin-hage-version-table"]');
    const shell = document.querySelector(".benjadmin-data-table-shell");
    return {
      title: document.querySelector(".benjadmin-data-header h1")?.textContent || "",
      headers: Array.from(table?.querySelectorAll("thead th") || []).map((node) => (node.textContent || "").trim()),
      metrics: document.querySelectorAll(".benjadmin-data-metric").length,
      filters: document.querySelectorAll(".benjadmin-data-filter-group button").length,
      search: Boolean(document.querySelector(".benjadmin-data-search input")),
      pagination: Boolean(document.querySelector(".benjadmin-data-pagination")),
      sticky: table?.querySelector("thead") ? getComputedStyle(table.querySelector("thead")).position : "",
      uploadLink: Array.from(document.querySelectorAll("a")).some((node) => node.getAttribute("href") === "/admin/releases?project=HAGE_Munkater"),
      tableHeight: shell?.getBoundingClientRect().height || 0,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      theme: document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") || "",
    };
  });

  check("HAGE verziók táblázat-első munkatér", desktop.title === "HAGE-INVEST Munkatér verziók" && desktop.tableHeight >= 400, JSON.stringify({ title: desktop.title, tableHeight: desktop.tableHeight }));
  check("HAGE verziópár tábla tíz oszlopos", desktop.headers.length === 10 && ["Verzió", "DEV csomag", "DEV állapot", "RUN csomag", "RUN állapot", "DEV + RUN méret", "Letöltések", "Frissítve", "Pár állapota", "Művelet"].every((label) => desktop.headers.includes(label)), JSON.stringify(desktop.headers));
  check("Kompakt HAGE release KPI sor", desktop.metrics === 5, `metrics=${desktop.metrics}`);
  check("Keresés, öt párszűrő és lapozás elérhető", desktop.search && desktop.filters === 5 && desktop.pagination, JSON.stringify(desktop));
  check("HAGE verziótábla ragadós fejlécet használ", desktop.sticky === "sticky", `position=${desktop.sticky}`);
  check("HAGE release feltöltő hivatkozás megmaradt", desktop.uploadLink);
  check("Desktop egy viewportos munkatér", desktop.scrollHeight <= desktop.innerHeight + 1, JSON.stringify({ scrollHeight: desktop.scrollHeight, innerHeight: desktop.innerHeight }));
  check("Desktop nincs teljes oldali vízszintes túlcsordulás", desktop.scrollWidth <= desktop.clientWidth + 1, JSON.stringify({ scrollWidth: desktop.scrollWidth, clientWidth: desktop.clientWidth }));
  check("Sötét mód öröklődik", desktop.theme === "dark", `theme=${desktop.theme}`);

  // Írás nélküli böngészős fixture: a valódi HAGE API-t csak ebben a tesztoldalban elfogjuk,
  // így a DEV/RUN párosítás és a részletező működése valós adat módosítása nélkül ellenőrizhető.
  const fixturePage = await browser.newPage();
  await fixturePage.setBypassServiceWorker(true);
  await installSession(fixturePage);
  await fixturePage.setRequestInterception(true);
  fixturePage.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/releases/list?project=HAGE_Munkater")) {
      const now = new Date().toISOString();
      const baseRelease = {
        project: "HAGE_Munkater",
        sizeBytes: 10485760,
        sha256: "a".repeat(64),
        createdAt: now,
        expiresAt: null,
        downloadCount: 3,
        lastDownloadedAt: now,
        isActive: true,
        isCurrent: true,
        fileAvailable: true,
        downloadPageUrl: "/download/fixture",
        changes: ["Acceptance fixture változás"],
      };
      request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, releases: [
        { ...baseRelease, token: "fixture-dev", version: "HAGE_V123_DEV", fileName: "HAGE_MVP_V123_DEV.zip", title: "HAGE V123 DEV", description: "DEV acceptance fixture" },
        { ...baseRelease, token: "fixture-run", version: "HAGE_V123_RUN", fileName: "HAGE_MVP_V123_RUN.zip", title: "HAGE V123 RUN", description: "RUN acceptance fixture", sizeBytes: 12582912, downloadCount: 5 },
        { ...baseRelease, token: "fixture-incomplete", version: "HAGE_V124_DEV", fileName: "HAGE_MVP_V124_DEV.zip", title: "HAGE V124 DEV", description: "Hiányos pár acceptance fixture", isCurrent: false },
      ] }) });
      return;
    }
    request.continue();
  });
  await fixturePage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await fixturePage.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await fixturePage.waitForSelector('[data-testid="benjadmin-hage-version-table"] tbody .benjadmin-data-row-action', { timeout: 30000 });
  const fixtureState = await fixturePage.evaluate(() => ({
    rows: Array.from(document.querySelectorAll('[data-testid="benjadmin-hage-version-table"] tbody tr')).map((row) => (row.textContent || "").replace(/\s+/g, " ").trim()),
    metrics: Array.from(document.querySelectorAll(".benjadmin-data-metric")).map((node) => (node.textContent || "").replace(/\s+/g, " ").trim()),
  }));
  check("DEV és RUN kiadások azonos alapverzióba párosulnak", fixtureState.rows.some((row) => row.includes("v123") && row.includes("HAGE_MVP_V123_DEV.zip") && row.includes("HAGE_MVP_V123_RUN.zip") && row.includes("Teljes · aktív")), JSON.stringify(fixtureState.rows));
  check("Hiányos DEV/RUN pár külön figyelmeztetést kap", fixtureState.rows.some((row) => row.includes("v124") && row.includes("Hiányos DEV/RUN pár")), JSON.stringify(fixtureState.rows));
  check("HAGE KPI a párosított verziószámot mutatja", fixtureState.metrics.some((value) => value.includes("Verziópár") && value.includes("2")) && fixtureState.metrics.some((value) => value.includes("Teljes DEV + RUN") && value.includes("1")), JSON.stringify(fixtureState.metrics));

  await fixturePage.click(".benjadmin-data-row-action");
  await fixturePage.waitForSelector('[data-testid="benjadmin-hage-release-drawer"]', { timeout: 10000 });
  const detail = await fixturePage.$eval('[data-testid="benjadmin-hage-release-drawer"]', (node) => ({ text: node.textContent || "", links: Array.from(node.querySelectorAll("a")).map((a) => a.getAttribute("href")) }));
  check("HAGE párrészletező DEV és RUN blokkot, SHA256-ot és letöltési linket tartalmaz", ["DEV kiadás", "RUN kiadás", "SHA256", "Letöltések", "Fájl a szerveren"].every((value) => detail.text.includes(value)) && detail.links.some((href) => href === "/download/fixture"), detail.text.slice(0, 900));
  await fixturePage.close();

  await page.click('[data-testid="benjadmin-topbar-theme-toggle"]');
  await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") === "light", { timeout: 10000 });
  check("Világos mód a HAGE verzióoldalon működik", await page.$eval(".dimpro-admin-shell", (node) => node.getAttribute("data-theme")) === "light");

  for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "mobil", width: 390, height: 844 }]) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    const state = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, table: Boolean(document.querySelector('[data-testid="benjadmin-hage-version-table"]')), pagination: Boolean(document.querySelector(".benjadmin-data-pagination")) }));
    check(`${viewport.name} nincs teljes oldali vízszintes túlcsordulás`, state.scrollWidth <= state.clientWidth + 1, JSON.stringify(state));
    check(`${viewport.name} HAGE verziótábla és lapozás megmarad`, state.table && state.pagination, JSON.stringify(state));
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
