import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin/drive";
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

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"],
});

try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await installSession(page);
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="benjadmin-drive-session-table"]', { timeout: 30000 });

  const desktop = await page.evaluate(() => {
    const table = document.querySelector('[data-testid="benjadmin-drive-session-table"]');
    const shell = document.querySelector(".benjadmin-data-table-shell");
    return {
      title: document.querySelector(".benjadmin-data-header h1")?.textContent || "",
      headers: Array.from(table?.querySelectorAll("thead th") || []).map((node) => (node.textContent || "").trim()),
      metrics: document.querySelectorAll(".benjadmin-data-metric").length,
      filters: document.querySelectorAll(".benjadmin-data-filter-group button").length,
      search: Boolean(document.querySelector(".benjadmin-data-search input")),
      pagination: Boolean(document.querySelector(".benjadmin-data-pagination")),
      projectField: Boolean(document.querySelector(".benjadmin-drive-toolbar-field input")),
      sticky: table?.querySelector("thead") ? getComputedStyle(table.querySelector("thead")).position : "",
      diagnostics: Array.from(document.querySelectorAll("button")).some((button) => (button.textContent || "").includes("Drive diagnosztika")),
      tableHeight: shell?.getBoundingClientRect().height || 0,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      theme: document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") || "",
    };
  });

  check("Drive admin táblázat-első session munkatér", desktop.title === "DIMPRO Drive upload sessionök" && desktop.tableHeight >= 400, JSON.stringify({ title: desktop.title, tableHeight: desktop.tableHeight }));
  check("Drive session tábla tíz oszlopos", desktop.headers.length === 10 && ["Session", "Fájl / útvonal", "Projekt", "Státusz", "Chunk", "Fogadott / méret", "Készültség", "Életkor", "Frissítve", "Művelet"].every((label) => desktop.headers.includes(label)), JSON.stringify(desktop.headers));
  check("Drive admin KPI sor ötelemű", desktop.metrics === 5, `metrics=${desktop.metrics}`);
  check("Keresés, négy session szűrő, projektmező és lapozás elérhető", desktop.search && desktop.filters === 4 && desktop.projectField && desktop.pagination, JSON.stringify(desktop));
  check("Drive session tábla ragadós fejlécet használ", desktop.sticky === "sticky", `position=${desktop.sticky}`);
  check("Drive diagnosztika külön műveletként elérhető", desktop.diagnostics);
  check("Desktop egy viewportos munkatér", desktop.scrollHeight <= desktop.innerHeight + 1, JSON.stringify({ scrollHeight: desktop.scrollHeight, innerHeight: desktop.innerHeight }));
  check("Desktop nincs teljes oldali vízszintes túlcsordulás", desktop.scrollWidth <= desktop.clientWidth + 1, JSON.stringify({ scrollWidth: desktop.scrollWidth, clientWidth: desktop.clientWidth }));
  check("Sötét mód öröklődik", desktop.theme === "dark", `theme=${desktop.theme}`);

  await page.evaluate(() => Array.from(document.querySelectorAll("button")).find((button) => (button.textContent || "").includes("Drive diagnosztika"))?.click());
  await page.waitForSelector('[data-testid="benjadmin-drive-diagnostics-drawer"]', { timeout: 10000 });
  const diagnostics = await page.$eval('[data-testid="benjadmin-drive-diagnostics-drawer"]', (node) => ({
    text: node.textContent || "",
    buttons: Array.from(node.querySelectorAll("button")).map((button) => (button.textContent || "").trim()),
  }));
  check("Diagnosztika megőrzi token, cleanup, storage és signed upload funkciókat", ["Fejlesztői token", "Cleanup terv", "Object Storage", "Storage env / provider", "Signed upload előkészítés", "Kézi session törlés"].every((value) => diagnostics.text.includes(value)), diagnostics.text.slice(0, 900));
  check("Signed upload csak külön admin műveletre érhető el", diagnostics.buttons.some((value) => value.includes("Signed upload terv")));
  await page.click('[data-testid="benjadmin-drive-diagnostics-drawer"] header button');

  const fixturePage = await browser.newPage();
  await fixturePage.setBypassServiceWorker(true);
  await installSession(fixturePage);
  await fixturePage.setRequestInterception(true);
  fixturePage.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/drive/uploads/sessions?")) {
      const now = new Date().toISOString();
      request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          mode: "dev",
          projectId: "DIMPRO_DEMO",
          count: 2,
          sessions: [
            { uploadId: "upl-active-001", projectId: "DIMPRO_DEMO", fileName: "terv-A.pdf", relativePath: "01_TERVEK/terv-A.pdf", status: "uploading", createdAt: now, updatedAt: now, chunkCount: 3, receivedBytes: 5242880, fileSizeBytes: 10485760, uploadPath: "/tmp/upl-active-001", ageHours: 2.5 },
            { uploadId: "upl-completed-002", projectId: "DIMPRO_DEMO", fileName: "jegyzokonyv.pdf", relativePath: "02_JEGYZOKONYV/jegyzokonyv.pdf", status: "completed", createdAt: now, updatedAt: now, chunkCount: 5, receivedBytes: 8388608, fileSizeBytes: 8388608, uploadPath: "/tmp/upl-completed-002", ageHours: 30.2 },
          ],
        }),
      });
      return;
    }
    if (url.includes("/api/drive/uploads/cleanup-plan?")) {
      const now = new Date().toISOString();
      request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          mode: "plan-only",
          olderThanHours: 24,
          generatedAt: now,
          totalSessions: 2,
          candidateCount: 1,
          note: "Fixture cleanup terv; automatikus törlés nincs.",
          candidates: [
            { uploadId: "upl-completed-002", projectId: "DIMPRO_DEMO", fileName: "jegyzokonyv.pdf", relativePath: "02_JEGYZOKONYV/jegyzokonyv.pdf", status: "completed", createdAt: now, updatedAt: now, chunkCount: 5, receivedBytes: 8388608, fileSizeBytes: 8388608, uploadPath: "/tmp/upl-completed-002", ageHours: 30.2 },
          ],
        }),
      });
      return;
    }
    if (url.includes("/api/drive/dev-token")) {
      request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, token: "fixture-token-1234567890-abcdef", tokenFile: ".dimprover/fixture-token", headerName: "x-dimpro-drive-dev-token", apiRoot: "/api/drive", warning: "Fixture token; csak acceptance." }) });
      return;
    }
    request.continue();
  });

  await fixturePage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await fixturePage.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await fixturePage.waitForSelector('[data-testid="benjadmin-drive-session-table"] tbody .benjadmin-data-row-action', { timeout: 30000 });
  const fixtureState = await fixturePage.evaluate(() => ({
    rows: Array.from(document.querySelectorAll('[data-testid="benjadmin-drive-session-table"] tbody tr')).map((row) => (row.textContent || "").replace(/\s+/g, " ").trim()),
    metrics: Array.from(document.querySelectorAll(".benjadmin-data-metric")).map((node) => (node.textContent || "").replace(/\s+/g, " ").trim()),
  }));
  check("Aktív és completed session külön státusszal jelenik meg", fixtureState.rows.some((row) => row.includes("upl-active-001") && row.includes("uploading") && row.includes("50%")) && fixtureState.rows.some((row) => row.includes("upl-completed-002") && row.includes("completed") && row.includes("100%")), JSON.stringify(fixtureState.rows));
  check("Cleanup jelölt a táblában és KPI-ban is megjelenik", fixtureState.rows.some((row) => row.includes("upl-completed-002") && row.includes("cleanup jelölt")) && fixtureState.metrics.some((value) => value.includes("Cleanup jelölt1")), JSON.stringify({ rows: fixtureState.rows, metrics: fixtureState.metrics }));

  await fixturePage.click(".benjadmin-data-row-action");
  await fixturePage.waitForSelector('[data-testid="benjadmin-drive-session-drawer"]', { timeout: 10000 });
  const detail = await fixturePage.$eval('[data-testid="benjadmin-drive-session-drawer"]', (node) => ({
    text: node.textContent || "",
    danger: Array.from(node.querySelectorAll("button")).some((button) => (button.textContent || "").includes("Ideiglenes session törlése")),
  }));
  check("Session részletező megőrzi projekt, chunk, méret, készültség és útvonal adatokat", ["Projekt", "Chunk", "Fogadott", "Fájlméret", "Készültség", "Ideiglenes upload útvonal"].every((value) => detail.text.includes(value)), detail.text.slice(0, 800));
  check("Session törlés csak külön veszélyes részletező műveletként látható", detail.danger === true);
  await fixturePage.close();

  await page.click('[data-testid="benjadmin-topbar-theme-toggle"]');
  await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") === "light", { timeout: 10000 });
  check("Világos mód a Drive adminban működik", await page.$eval(".dimpro-admin-shell", (node) => node.getAttribute("data-theme")) === "light");

  for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "mobil", width: 390, height: 844 }]) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    const state = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      table: Boolean(document.querySelector('[data-testid="benjadmin-drive-session-table"]')),
      pagination: Boolean(document.querySelector(".benjadmin-data-pagination")),
    }));
    check(`${viewport.name} Drive admin no-page-overflow`, state.scrollWidth <= state.clientWidth + 1, JSON.stringify(state));
    check(`${viewport.name} session tábla és lapozás megmarad`, state.table && state.pagination, JSON.stringify(state));
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
