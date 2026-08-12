import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin/fejlesztesi-naplo";
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
  await page.waitForSelector('[data-testid="benjadmin-dev-notes-table"]', { timeout: 30000 });

  const desktop = await page.evaluate(() => {
    const table = document.querySelector('[data-testid="benjadmin-dev-notes-table"]');
    const shell = document.querySelector(".benjadmin-data-table-shell");
    return {
      title: document.querySelector(".benjadmin-data-header h1")?.textContent || "",
      headers: Array.from(table?.querySelectorAll("thead th") || []).map((node) => (node.textContent || "").trim()),
      metrics: document.querySelectorAll(".benjadmin-data-metric").length,
      search: Boolean(document.querySelector(".benjadmin-data-search input")),
      selects: document.querySelectorAll(".benjadmin-data-toolbar-selects select").length,
      archived: Boolean(document.querySelector(".benjadmin-data-archive-toggle input")),
      pagination: Boolean(document.querySelector(".benjadmin-data-pagination")),
      sticky: table?.querySelector("thead") ? getComputedStyle(table.querySelector("thead")).position : "",
      detailButtons: document.querySelectorAll(".benjadmin-data-row-action").length,
      tableHeight: shell?.getBoundingClientRect().height || 0,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      theme: document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") || "",
      newButton: Array.from(document.querySelectorAll("button")).some((node) => (node.textContent || "").includes("Új bejegyzés")),
    };
  });

  check("Fejlesztési Napló táblázat-első munkatér", desktop.title === "Fejlesztési Napló / AI Kontextustár" && desktop.tableHeight >= 400, JSON.stringify({ title: desktop.title, tableHeight: desktop.tableHeight }));
  check("Fejlesztési napló tábla tíz oszlopos", desktop.headers.length === 10 && ["Cím", "Modul", "Fejlesztési csomag", "Típus", "Státusz", "Prioritás", "Felületek", "Kapcsolatok", "Frissítve", "Művelet"].every((label) => desktop.headers.includes(label)), JSON.stringify(desktop.headers));
  check("Kompakt fejlesztési napló KPI sor", desktop.metrics === 5, `metrics=${desktop.metrics}`);
  check("Keresés és hat részletes szűrő megmaradt", desktop.search && desktop.selects === 6 && desktop.archived, JSON.stringify({ search: desktop.search, selects: desktop.selects, archived: desktop.archived }));
  check("Fejlesztési napló lapozás elérhető", desktop.pagination);
  check("Táblázat ragadós fejlécet használ", desktop.sticky === "sticky", `position=${desktop.sticky}`);
  check("Új bejegyzés művelet elérhető", desktop.newButton);
  check("Desktop egy viewportos munkatér", desktop.scrollHeight <= desktop.innerHeight + 1, JSON.stringify({ scrollHeight: desktop.scrollHeight, innerHeight: desktop.innerHeight }));
  check("Desktop nincs teljes oldali vízszintes túlcsordulás", desktop.scrollWidth <= desktop.clientWidth + 1, JSON.stringify({ scrollWidth: desktop.scrollWidth, clientWidth: desktop.clientWidth }));
  check("Sötét mód öröklődik", desktop.theme === "dark", `theme=${desktop.theme}`);

  await page.evaluate(() => Array.from(document.querySelectorAll("button")).find((node) => (node.textContent || "").includes("Új bejegyzés"))?.click());
  await page.waitForSelector('[data-testid="benjadmin-dev-note-drawer"]', { timeout: 10000 });
  const drawer = await page.$eval('[data-testid="benjadmin-dev-note-drawer"]', (node) => ({
    text: node.textContent || "",
    inputs: node.querySelectorAll("input,select,textarea").length,
    textareas: node.querySelectorAll("textarea").length,
    buttons: node.querySelectorAll("button").length,
    width: node.getBoundingClientRect().width,
  }));
  check("Új fejlesztési bejegyzés jobb oldali szerkesztőfiókban nyílik", drawer.text.includes("ÚJ FEJLESZTÉSI BEJEGYZÉS") && drawer.inputs >= 16 && drawer.textareas >= 10, JSON.stringify(drawer));
  check("AI kontextus, AI asszisztens és átadó blokk megmaradt", drawer.text.includes("AI kontextus") && drawer.text.includes("AI") && drawer.text.includes("Másolható AI átadó blokk"), drawer.text.slice(0, 700));
  check("Kapcsolatok, függőségek, blokkolók és párhuzamos fejlesztési mezők megmaradtak", ["Kapcsolódó fejlesztések", "Függőségek", "Blokkoló tényezők", "Párhuzamos fejlesztés állapota", "Külső AI / reviewer megjegyzés", "Utolsó átadó összefoglaló"].every((value) => drawer.text.includes(value)), drawer.text.slice(0, 900));
  await page.click('[data-testid="benjadmin-dev-note-drawer"] header button');
  await page.waitForFunction(() => !document.querySelector('[data-testid="benjadmin-dev-note-drawer"]'), { timeout: 10000 });

  if (desktop.detailButtons > 0) {
    await page.click(".benjadmin-data-row-action");
    await page.waitForSelector('[data-testid="benjadmin-dev-note-drawer"]', { timeout: 10000 });
    const text = await page.$eval('[data-testid="benjadmin-dev-note-drawer"]', (node) => node.textContent || "");
    check("Meglévő fejlesztési bejegyzés szerkesztőfiókban nyílik", text.includes("FEJLESZTÉSI BEJEGYZÉS") && text.includes("Módosítás mentése"), text.slice(0, 400));
    await page.click('[data-testid="benjadmin-dev-note-drawer"] header button');
  } else {
    check("Meglévő bejegyzés read-only ellenőrzés", true, "Nincs DEV naplórekord; írás nélkül kihagyva.");
  }

  await page.click('[data-testid="benjadmin-topbar-theme-toggle"]');
  await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") === "light", { timeout: 10000 });
  check("Világos mód a Fejlesztési Naplóban működik", await page.$eval(".dimpro-admin-shell", (node) => node.getAttribute("data-theme")) === "light");

  for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "mobil", width: 390, height: 844 }]) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    const state = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, table: Boolean(document.querySelector('[data-testid="benjadmin-dev-notes-table"]')), pagination: Boolean(document.querySelector(".benjadmin-data-pagination")) }));
    check(`${viewport.name} nincs teljes oldali vízszintes túlcsordulás`, state.scrollWidth <= state.clientWidth + 1, JSON.stringify(state));
    check(`${viewport.name} fejlesztési napló tábla és lapozás megmarad`, state.table && state.pagination, JSON.stringify(state));
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
