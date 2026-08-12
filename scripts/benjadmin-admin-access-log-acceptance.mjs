import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = "http://admin.dev.dimpro.hu:3100";
const checks = [];
function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}
function install(page) {
  return page.evaluateOnNewDocument((key) => {
    localStorage.setItem("dimproLicenseAdminKey", key);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.setItem("dimpro-admin-theme", "dark");
    localStorage.setItem("dimpro-benjadmin-board-pinned", "false");
  }, adminKey);
}
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"] });
try {
  for (const route of ["/admin/belepesek", "/adminlog"]) {
    const page = await browser.newPage();
    await page.setBypassServiceWorker(true);
    await install(page);
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('[data-testid="benjadmin-admin-access-table"]', { timeout: 30000 });
    const state = await page.evaluate(() => {
      const table = document.querySelector('[data-testid="benjadmin-admin-access-table"]');
      const shell = document.querySelector(".benjadmin-data-table-shell");
      return {
        title: document.querySelector(".benjadmin-data-header h1")?.textContent || "",
        headers: Array.from(table?.querySelectorAll("thead th") || []).map((n) => (n.textContent || "").trim()),
        metrics: document.querySelectorAll(".benjadmin-data-metric").length,
        filters: document.querySelectorAll(".benjadmin-data-filter-group button").length,
        search: Boolean(document.querySelector(".benjadmin-data-search input")),
        pagination: Boolean(document.querySelector(".benjadmin-data-pagination")),
        sticky: table?.querySelector("thead") ? getComputedStyle(table.querySelector("thead")).position : "",
        dimproLink: Array.from(document.querySelectorAll("a")).some((a) => a.getAttribute("href") === "/admin/dimpro-belepesek"),
        tableHeight: shell?.getBoundingClientRect().height || 0,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        theme: document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") || "",
      };
    });
    check(`${route} közös táblázat-első admin belépési munkatér`, state.title === "Admin belépési próbálkozások" && state.tableHeight >= 400, JSON.stringify({ route, title: state.title, tableHeight: state.tableHeight }));
    check(`${route} négyoszlopos biztonsági tábla`, state.headers.length === 4 && ["Időpont", "E-mail cím", "Eredmény", "Művelet"].every((x) => state.headers.includes(x)), JSON.stringify(state.headers));
    check(`${route} keresés, három eredményszűrő és lapozás`, state.search && state.filters === 3 && state.pagination, JSON.stringify(state));
    check(`${route} kompakt ötelemű KPI sor`, state.metrics === 5, `metrics=${state.metrics}`);
    check(`${route} ragadós fejléc`, state.sticky === "sticky", `position=${state.sticky}`);
    check(`${route} DIMPRO belépési audit hivatkozás megmaradt`, state.dimproLink);
    check(`${route} desktop egy viewport és nincs vízszintes túlcsordulás`, state.scrollHeight <= state.innerHeight + 1 && state.scrollWidth <= state.clientWidth + 1, JSON.stringify({ scrollHeight: state.scrollHeight, innerHeight: state.innerHeight, scrollWidth: state.scrollWidth, clientWidth: state.clientWidth }));
    check(`${route} sötét mód öröklődik`, state.theme === "dark", `theme=${state.theme}`);
    await page.close();
  }

  const fixturePage = await browser.newPage();
  await fixturePage.setBypassServiceWorker(true);
  await install(fixturePage);
  await fixturePage.setRequestInterception(true);
  fixturePage.on("request", (request) => {
    if (request.url().includes("/api/license/admin-access-log")) {
      const now = new Date().toISOString();
      request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, entries: [
        { timestamp: now, email: "allowed@example.hu", allowed: true, action: "OTP kérés" },
        { timestamp: now, email: "denied@example.hu", allowed: false, action: "Ismeretlen e-mail" },
      ] }) });
      return;
    }
    request.continue();
  });
  await fixturePage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await fixturePage.goto(base + "/admin/belepesek", { waitUntil: "domcontentloaded", timeout: 60000 });
  await fixturePage.waitForFunction(() => document.querySelectorAll('[data-testid="benjadmin-admin-access-table"] tbody tr').length === 2, { timeout: 30000 });
  const rows = await fixturePage.$$eval('[data-testid="benjadmin-admin-access-table"] tbody tr', (nodes) => nodes.map((n) => (n.textContent || "").replace(/\s+/g, " ").trim()));
  check("Engedélyezett és tiltott admin belépés külön státuszként jelenik meg", rows.some((x) => x.includes("Engedélyezett")) && rows.some((x) => x.includes("Tiltott próbálkozás")), JSON.stringify(rows));
  const filterButtons = await fixturePage.$$(".benjadmin-data-filter-group button");
  await filterButtons[2].click();
  await fixturePage.waitForFunction(() => document.querySelectorAll('[data-testid="benjadmin-admin-access-table"] tbody tr').length === 1, { timeout: 10000 });
  const deniedRows = await fixturePage.$$eval('[data-testid="benjadmin-admin-access-table"] tbody tr', (nodes) => nodes.map((n) => n.textContent || ""));
  check("Tiltott szűrő csak a tiltott próbálkozást hagyja meg", deniedRows.length === 1 && deniedRows[0].includes("denied@example.hu"), JSON.stringify(deniedRows));

  await fixturePage.click('[data-testid="benjadmin-topbar-theme-toggle"]');
  await fixturePage.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") === "light", { timeout: 10000 });
  check("Világos mód az admin belépési naplóban működik", await fixturePage.$eval(".dimpro-admin-shell", (n) => n.getAttribute("data-theme")) === "light");
  for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "mobil", width: 390, height: 844 }]) {
    await fixturePage.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    const state = await fixturePage.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, table: Boolean(document.querySelector('[data-testid="benjadmin-admin-access-table"]')), pagination: Boolean(document.querySelector(".benjadmin-data-pagination")) }));
    check(`${viewport.name} admin belépési napló no-page-overflow`, state.scrollWidth <= state.clientWidth + 1 && state.table && state.pagination, JSON.stringify(state));
  }
  await fixturePage.close();
} finally {
  await browser.close();
}
console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
