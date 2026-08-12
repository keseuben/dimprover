import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin/releases";
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
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await install(page);
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="benjadmin-release-upload-table"]', { timeout: 30000 });
  const desktop = await page.evaluate(() => {
    const table = document.querySelector('[data-testid="benjadmin-release-upload-table"]');
    const shell = document.querySelector(".benjadmin-data-table-shell");
    return {
      title: document.querySelector(".benjadmin-data-header h1")?.textContent || "",
      headers: Array.from(table?.querySelectorAll("thead th") || []).map((n) => (n.textContent || "").trim()),
      metrics: document.querySelectorAll(".benjadmin-data-metric").length,
      filters: document.querySelectorAll(".benjadmin-data-filter-group button").length,
      projectSelect: Boolean(document.querySelector('select[aria-label="Release projekt"]')),
      search: Boolean(document.querySelector(".benjadmin-data-search input")),
      pagination: Boolean(document.querySelector(".benjadmin-data-pagination")),
      sticky: table?.querySelector("thead") ? getComputedStyle(table.querySelector("thead")).position : "",
      newUpload: Array.from(document.querySelectorAll("button")).some((n) => (n.textContent || "").includes("Új release feltöltés")),
      tableHeight: shell?.getBoundingClientRect().height || 0,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      theme: document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") || "",
    };
  });
  check("Release feltöltő hibrid táblázat-első munkatér", desktop.title === "Védett release feltöltő és kiadási lista" && desktop.tableHeight >= 400, JSON.stringify({ title: desktop.title, tableHeight: desktop.tableHeight }));
  check("Release lista tíz oszlopos", desktop.headers.length === 10 && ["Verzió", "Fájl", "Státusz", "Méret", "Kiadás", "Lejárat", "Letöltések", "Utolsó letöltés", "SHA256", "Művelet"].every((x) => desktop.headers.includes(x)), JSON.stringify(desktop.headers));
  check("Kompakt release tár KPI sor", desktop.metrics === 5, `metrics=${desktop.metrics}`);
  check("Projektválasztó, keresés, öt státuszszűrő és lapozás elérhető", desktop.projectSelect && desktop.search && desktop.filters === 5 && desktop.pagination, JSON.stringify(desktop));
  check("Release lista ragadós fejlécet használ", desktop.sticky === "sticky", `position=${desktop.sticky}`);
  check("Új release feltöltés külön műveletként elérhető", desktop.newUpload);
  check("Desktop egy viewportos munkatér", desktop.scrollHeight <= desktop.innerHeight + 1, JSON.stringify({ scrollHeight: desktop.scrollHeight, innerHeight: desktop.innerHeight }));
  check("Desktop nincs teljes oldali vízszintes túlcsordulás", desktop.scrollWidth <= desktop.clientWidth + 1, JSON.stringify({ scrollWidth: desktop.scrollWidth, clientWidth: desktop.clientWidth }));
  check("Sötét mód öröklődik", desktop.theme === "dark", `theme=${desktop.theme}`);

  await page.evaluate(() => Array.from(document.querySelectorAll("button")).find((n) => (n.textContent || "").includes("Új release feltöltés"))?.click());
  await page.waitForSelector('[data-testid="benjadmin-release-upload-drawer"]', { timeout: 10000 });
  const upload = await page.$eval('[data-testid="benjadmin-release-upload-drawer"]', (node) => ({ text: node.textContent || "", file: Boolean(node.querySelector('input[type="file"]')), inputs: node.querySelectorAll("input,select,textarea").length, submitDisabled: node.querySelector('button[type="submit"]')?.hasAttribute("disabled") }));
  check("Feltöltő űrlap külön jobb oldali műveleti panelen nyílik", upload.text.includes("VÉDETT RELEASE FELTÖLTÉS") && upload.file && upload.inputs >= 7, JSON.stringify(upload));
  check("Fájl nélkül a feltöltés nem indítható", upload.submitDisabled === true, JSON.stringify(upload));
  check("Privát tárhely, lejárat, leírás és változáslista mezők megmaradtak", ["Privát release tárhely", "Lejárat", "Verzió leírás", "Változáslista", "Feltöltő"].every((x) => upload.text.includes(x)), upload.text.slice(0, 600));
  await page.click('[data-testid="benjadmin-release-upload-drawer"] header button');

  // Read-only fixture a részletező és státuszlogika vizsgálatához. Upload/delete végpontot nem hívunk.
  const fixturePage = await browser.newPage();
  await fixturePage.setBypassServiceWorker(true);
  await install(fixturePage);
  await fixturePage.setRequestInterception(true);
  fixturePage.on("request", (request) => {
    if (request.url().includes("/api/releases/list?project=DIMPRO_Fajlmuhely")) {
      const now = new Date().toISOString();
      request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, releases: [
        { token: "fixture-a", project: "DIMPRO_Fajlmuhely", version: "v9_99", fileName: "DIMPRO_fixture.zip", sizeBytes: 15728640, sha256: "b".repeat(64), createdAt: now, expiresAt: null, downloadCount: 4, lastDownloadedAt: now, description: "Acceptance fixture", isActive: true, isCurrent: true, fileAvailable: true, downloadPageUrl: "/download/fixture-a" },
        { token: "fixture-b", project: "DIMPRO_Fajlmuhely", version: "v9_98", fileName: "DIMPRO_old.zip", sizeBytes: 1048576, sha256: "c".repeat(64), createdAt: now, expiresAt: now, downloadCount: 1, lastDownloadedAt: null, description: "Törölt fixture", isActive: false, isCurrent: false, fileAvailable: false, downloadPageUrl: "/download/fixture-b" },
      ] }) });
      return;
    }
    request.continue();
  });
  await fixturePage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await fixturePage.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await fixturePage.waitForSelector('[data-testid="benjadmin-release-upload-table"] .benjadmin-data-row-action', { timeout: 30000 });
  const rows = await fixturePage.$$eval('[data-testid="benjadmin-release-upload-table"] tbody tr', (nodes) => nodes.map((n) => (n.textContent || "").replace(/\s+/g, " ").trim()));
  check("Release státuszok megkülönböztetik az aktív és törölt történeti rekordot", rows.some((x) => x.includes("Legfrissebb · aktív")) && rows.some((x) => x.includes("Fájl törölve")), JSON.stringify(rows));
  await fixturePage.click(".benjadmin-data-row-action");
  await fixturePage.waitForSelector('[data-testid="benjadmin-release-detail-drawer"]', { timeout: 10000 });
  const detail = await fixturePage.$eval('[data-testid="benjadmin-release-detail-drawer"]', (node) => ({ text: node.textContent || "", links: Array.from(node.querySelectorAll("a")).map((a) => a.getAttribute("href")), danger: Array.from(node.querySelectorAll("button")).some((b) => (b.textContent || "").includes("Szerverfájl törlése")) }));
  check("Release részletező megőrzi SHA256, letöltési és fájlállapot adatokat", ["SHA256", "Letöltések", "Fájl a szerveren", "Aktív link", "Törlési szabály"].every((x) => detail.text.includes(x)) && detail.links.includes("/download/fixture-a"), detail.text.slice(0, 700));
  check("Törlés csak külön részletező műveletként látható", detail.danger === true);
  await fixturePage.close();

  await page.click('[data-testid="benjadmin-topbar-theme-toggle"]');
  await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") === "light", { timeout: 10000 });
  check("Világos mód a release feltöltőben működik", await page.$eval(".dimpro-admin-shell", (n) => n.getAttribute("data-theme")) === "light");
  for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "mobil", width: 390, height: 844 }]) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    const state = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, table: Boolean(document.querySelector('[data-testid="benjadmin-release-upload-table"]')), pagination: Boolean(document.querySelector(".benjadmin-data-pagination")) }));
    check(`${viewport.name} nincs teljes oldali vízszintes túlcsordulás`, state.scrollWidth <= state.clientWidth + 1, JSON.stringify(state));
    check(`${viewport.name} release lista és lapozás megmarad`, state.table && state.pagination, JSON.stringify(state));
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
