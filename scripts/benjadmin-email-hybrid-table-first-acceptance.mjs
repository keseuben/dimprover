import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin/email";
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
  await page.waitForSelector('[data-testid="benjadmin-email-profile-table"]', { timeout: 30000 });

  const desktop = await page.evaluate(() => {
    const table = document.querySelector('[data-testid="benjadmin-email-profile-table"]');
    const shell = document.querySelector(".benjadmin-data-table-shell");
    return {
      title: document.querySelector(".benjadmin-data-header h1")?.textContent || "",
      headers: Array.from(table?.querySelectorAll("thead th") || []).map((node) => (node.textContent || "").trim()),
      metrics: document.querySelectorAll(".benjadmin-data-metric").length,
      filterGroups: document.querySelectorAll(".benjadmin-data-filter-group").length,
      viewButtons: Array.from(document.querySelectorAll('.benjadmin-data-filter-group[aria-label="E-mail munkatér nézet"] button')).map((node) => (node.textContent || "").trim()),
      profileFilters: document.querySelectorAll('.benjadmin-data-filter-group[aria-label="E-mail profil státusz szűrő"] button').length,
      search: Boolean(document.querySelector(".benjadmin-data-search input")),
      pagination: Boolean(document.querySelector(".benjadmin-data-pagination")),
      sticky: table?.querySelector("thead") ? getComputedStyle(table.querySelector("thead")).position : "",
      settingsButton: Array.from(document.querySelectorAll("button")).some((button) => (button.textContent || "").includes("SMTP beállítások")),
      testAllButton: Array.from(document.querySelectorAll("button")).some((button) => (button.textContent || "").includes("Összes profil tesztelése")),
      tableHeight: shell?.getBoundingClientRect().height || 0,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      theme: document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") || "",
    };
  });

  check("E-mail központ hibrid táblázat-első munkatér", desktop.title === "E-mail profilok és tesztnapló" && desktop.tableHeight >= 400, JSON.stringify({ title: desktop.title, tableHeight: desktop.tableHeight }));
  check("Feladóprofil tábla kilenc oszlopos", desktop.headers.length === 9 && ["Profil", "E-mail cím", "Feladat / cél", "Engedélyezve", "SMTP", "Jelszó", "Utolsó teszt", "Teszt eredmény", "Művelet"].every((label) => desktop.headers.includes(label)), JSON.stringify(desktop.headers));
  check("E-mail központ KPI sor ötelemű", desktop.metrics === 5, `metrics=${desktop.metrics}`);
  check("Profil- és tesztnapló nézetváltó megmaradt", desktop.viewButtons.includes("Feladóprofilok") && desktop.viewButtons.includes("Teszt napló"), JSON.stringify(desktop.viewButtons));
  check("Keresés, öt profilszűrő és lapozás elérhető", desktop.search && desktop.profileFilters === 5 && desktop.pagination, JSON.stringify(desktop));
  check("Profil tábla ragadós fejlécet használ", desktop.sticky === "sticky", `position=${desktop.sticky}`);
  check("SMTP beállítások és összes profil teszt külön műveletként elérhető", desktop.settingsButton && desktop.testAllButton);
  check("Desktop egy viewportos munkatér", desktop.scrollHeight <= desktop.innerHeight + 1, JSON.stringify({ scrollHeight: desktop.scrollHeight, innerHeight: desktop.innerHeight }));
  check("Desktop nincs teljes oldali vízszintes túlcsordulás", desktop.scrollWidth <= desktop.clientWidth + 1, JSON.stringify({ scrollWidth: desktop.scrollWidth, clientWidth: desktop.clientWidth }));
  check("Sötét mód öröklődik", desktop.theme === "dark", `theme=${desktop.theme}`);

  await page.evaluate(() => Array.from(document.querySelectorAll("button")).find((button) => (button.textContent || "").includes("SMTP beállítások"))?.click());
  await page.waitForSelector('[data-testid="benjadmin-email-settings-drawer"]', { timeout: 10000 });
  const settings = await page.$eval('[data-testid="benjadmin-email-settings-drawer"]', (node) => ({
    text: node.textContent || "",
    passwordType: node.querySelector('input[type="password"]')?.getAttribute("type") || "",
    controls: node.querySelectorAll("input,select,button").length,
  }));
  check("SMTP konfiguráció külön jobb oldali panelen maradt", ["SMTP host", "SMTP port", "Közös SMTP jelszó", "SSL/TLS használata", "Teszt címzettek", "Licencaktiválási rendszerüzenet címzettjei", "Licenclevelek válaszcíme"].every((value) => settings.text.includes(value)), settings.text.slice(0, 900));
  check("SMTP jelszó maszkolt mező maradt", settings.passwordType === "password", JSON.stringify(settings));
  await page.click('[data-testid="benjadmin-email-settings-drawer"] header button');

  const fixturePage = await browser.newPage();
  await fixturePage.setBypassServiceWorker(true);
  await installSession(fixturePage);
  await fixturePage.setRequestInterception(true);
  fixturePage.on("request", (request) => {
    if (request.url().includes("/api/license/mail-settings") && request.method() === "GET") {
      const now = new Date().toISOString();
      request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          storageExists: true,
          smtpHost: "smtp.fixture.local",
          smtpPort: 465,
          smtpSecure: true,
          testRecipients: ["test@example.hu"],
          licenseActivationRecipients: ["admin@example.hu"],
          licenseReplyTo: "info@example.hu",
          profileCount: 3,
          enabledProfileCount: 2,
          profiles: [
            { id: "system", label: "DIMPRO System", address: "system@example.hu", displayName: "DIMPRO System", purpose: "Rendszerüzenetek", enabled: true, smtpHost: "smtp.fixture.local", smtpPort: 465, smtpSecure: true, hasPassword: true, smtpConfigured: true },
            { id: "drop", label: "DIMPRO Drop Értesítések", address: "drop@example.hu", displayName: "DIMPRO Drop", purpose: "Drop értesítések", enabled: true, smtpHost: "smtp.fixture.local", smtpPort: 465, smtpSecure: true, hasPassword: true, smtpConfigured: true },
            { id: "info", label: "DIMPRO Info", address: "info@example.hu", displayName: "DIMPRO Info", purpose: "Kézi ügyfélkapcsolat", enabled: false, smtpHost: "smtp.fixture.local", smtpPort: 465, smtpSecure: true, hasPassword: false, smtpConfigured: false },
          ],
          tests: [
            { id: "test-ok", profileId: "drop", profileAddress: "drop@example.hu", createdAt: now, attempted: true, sent: true, reason: "Elküldve", to: ["test@example.hu"], smtpConfigured: true },
            { id: "test-fail", profileId: "info", profileAddress: "info@example.hu", createdAt: now, attempted: false, sent: false, reason: "SMTP hiányos", friendlyError: "A profil SMTP beállítása hiányos.", to: ["test@example.hu"], smtpConfigured: false },
          ],
        }),
      });
      return;
    }
    request.continue();
  });

  await fixturePage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await fixturePage.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await fixturePage.waitForSelector('[data-testid="benjadmin-email-profile-table"] tbody .benjadmin-data-row-action', { timeout: 30000 });
  const fixtureProfiles = await fixturePage.evaluate(() => ({
    rows: Array.from(document.querySelectorAll('[data-testid="benjadmin-email-profile-table"] tbody tr')).map((row) => (row.textContent || "").replace(/\s+/g, " ").trim()),
    metrics: Array.from(document.querySelectorAll(".benjadmin-data-metric")).map((node) => (node.textContent || "").replace(/\s+/g, " ").trim()),
  }));
  check("Drop feladóprofil külön, támogatott profilként jelenik meg", fixtureProfiles.rows.some((row) => row.includes("Drop") && row.includes("drop@example.hu") && row.includes("SMTP kész")), JSON.stringify(fixtureProfiles.rows));
  check("Aktív, SMTP-kész és teszteredmény KPI-k valós adatokból számolódnak", fixtureProfiles.metrics.some((value) => value.includes("Feladóprofil3")) && fixtureProfiles.metrics.some((value) => value.includes("Engedélyezett2")) && fixtureProfiles.metrics.some((value) => value.includes("SMTP kész2")) && fixtureProfiles.metrics.some((value) => value.includes("Sikeres teszt1")) && fixtureProfiles.metrics.some((value) => value.includes("Sikertelen teszt1")), JSON.stringify(fixtureProfiles.metrics));

  const dropRowButton = await fixturePage.evaluateHandle(() => {
    const rows = Array.from(document.querySelectorAll('[data-testid="benjadmin-email-profile-table"] tbody tr'));
    return rows.find((row) => (row.textContent || "").includes("drop@example.hu"))?.querySelector("button") || null;
  });
  const element = dropRowButton.asElement();
  if (element) await element.click();
  await fixturePage.waitForSelector('[data-testid="benjadmin-email-profile-drawer"]', { timeout: 10000 });
  const profileDetail = await fixturePage.$eval('[data-testid="benjadmin-email-profile-drawer"]', (node) => ({
    text: node.textContent || "",
    testButtonDisabled: Array.from(node.querySelectorAll("button")).find((button) => (button.textContent || "").includes("Teszt e-mail"))?.hasAttribute("disabled"),
    saveButton: Array.from(node.querySelectorAll("button")).some((button) => (button.textContent || "").includes("Profil mentése")),
  }));
  check("Feladóprofil részletező megőrzi szerkesztést és tesztműveletet", ["E-mail cím", "Megjelenő név", "Automatikus küldés engedélyezve", "SMTP host", "Jelszó", "Utolsó teszt eredménye"].every((value) => profileDetail.text.includes(value)) && profileDetail.saveButton, profileDetail.text.slice(0, 800));
  check("SMTP-kész profil tesztgombja elérhető, de acceptance nem indít küldést", profileDetail.testButtonDisabled === false);
  await fixturePage.click('[data-testid="benjadmin-email-profile-drawer"] header button');

  await fixturePage.evaluate(() => Array.from(document.querySelectorAll('.benjadmin-data-filter-group[aria-label="E-mail munkatér nézet"] button')).find((button) => (button.textContent || "").includes("Teszt napló"))?.click());
  await fixturePage.waitForSelector('[data-testid="benjadmin-email-test-table"]', { timeout: 10000 });
  const testState = await fixturePage.evaluate(() => ({
    headers: Array.from(document.querySelectorAll('[data-testid="benjadmin-email-test-table"] thead th')).map((node) => (node.textContent || "").trim()),
    rows: Array.from(document.querySelectorAll('[data-testid="benjadmin-email-test-table"] tbody tr')).map((row) => (row.textContent || "").replace(/\s+/g, " ").trim()),
    filters: document.querySelectorAll('.benjadmin-data-filter-group[aria-label="Teszt eredmény szűrő"] button').length,
  }));
  check("Teszt napló nyolc részletes oszloppal jelenik meg", testState.headers.length === 8 && ["Időpont", "Profil", "Feladó", "Eredmény", "Címzett", "SMTP", "Kísérlet", "Részlet"].every((value) => testState.headers.includes(value)), JSON.stringify(testState.headers));
  check("Sikeres és sikertelen teszt külön sorban és státusszal látszik", testState.rows.some((row) => row.includes("Drop") && row.includes("Sikeres")) && testState.rows.some((row) => row.includes("Info") && row.includes("Sikertelen") && row.includes("SMTP beállítása hiányos")), JSON.stringify(testState.rows));
  check("Tesztnapló három eredményszűrőt kapott", testState.filters === 3, `filters=${testState.filters}`);
  await fixturePage.close();

  await page.click('[data-testid="benjadmin-topbar-theme-toggle"]');
  await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") === "light", { timeout: 10000 });
  check("Világos mód az e-mail központban működik", await page.$eval(".dimpro-admin-shell", (node) => node.getAttribute("data-theme")) === "light");

  for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "mobil", width: 390, height: 844 }]) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    const state = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      table: Boolean(document.querySelector('[data-testid="benjadmin-email-profile-table"]')),
      pagination: Boolean(document.querySelector(".benjadmin-data-pagination")),
    }));
    check(`${viewport.name} e-mail központ no-page-overflow`, state.scrollWidth <= state.clientWidth + 1, JSON.stringify(state));
    check(`${viewport.name} profil tábla és lapozás megmarad`, state.table && state.pagination, JSON.stringify(state));
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
