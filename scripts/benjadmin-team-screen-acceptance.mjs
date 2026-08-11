import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin";
const checks = [];

const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";

function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}

async function waitClosed(page) {
  await page.waitForFunction(() => !document.querySelector('[data-testid="benjadmin-team-screen"]'), { timeout: 10000 });
}

async function waitOpen(page) {
  await page.waitForSelector('[data-testid="benjadmin-team-screen"]', { timeout: 10000 });
}

async function ctrlAltZero(page) {
  await page.keyboard.down("Control");
  await page.keyboard.down("Alt");
  await page.keyboard.press("0");
  await page.keyboard.up("Alt");
  await page.keyboard.up("Control");
}

const infrastructureResponse = await fetch(`${apiBase}/api/dev/engine/infrastructure-summary`, { headers: { host, "x-dimpro-license-admin-key": adminKey } });
const infrastructurePayload = await infrastructureResponse.json().catch(() => ({}));
check("Infrastruktúra összesítő API elérhető", infrastructureResponse.status === 200 && infrastructurePayload?.ok === true, `status=${infrastructureResponse.status}`);
check("PRODUCTION és DB szerver külön jelen van", ["PRODUCTION", "DATABASE"].every((code) => infrastructurePayload?.servers?.some((item) => item.code === code)), JSON.stringify(infrastructurePayload?.servers?.map((item) => item.code)));
check("PRODUCTION és DB RAM/lemez minta elérhető", infrastructurePayload?.servers?.filter((item) => ["PRODUCTION", "DATABASE"].includes(item.code)).every((item) => item.memory?.usagePercent != null && item.disk?.usePercent != null && item.sampledAt), JSON.stringify(infrastructurePayload?.servers?.map((item) => ({ code: item.code, memory: item.memory?.usagePercent, disk: item.disk?.usePercent, sampledAt: item.sampledAt }))));
check("Drive és Drop külső tárhely külön jelen van", ["DRIVE", "DROP"].every((code) => infrastructurePayload?.storages?.some((item) => item.code === code)), JSON.stringify(infrastructurePayload?.storages?.map((item) => item.code)));
check("Drive és Drop élő foglaltságot és kapacitásmezőt ad", infrastructurePayload?.storages?.every((item) => typeof item.usedBytes === "number" && Object.prototype.hasOwnProperty.call(item, "capacityBytes")), JSON.stringify(infrastructurePayload?.storages?.map((item) => ({ code: item.code, usedBytes: item.usedBytes, capacityBytes: item.capacityBytes }))));
const entitlementResponse = await fetch(`${apiBase}/api/dev/engine/entitlements`, { headers: { host, "x-dimpro-license-admin-key": adminKey } });
const entitlementPayload = await entitlementResponse.json().catch(() => ({}));
check("AI finanszírozási összesítő API mezői elérhetők", entitlementResponse.status === 200 && ["aiCostHufThisMonth", "aiMonthlyBudgetHuf", "aiTotalTokensThisMonth", "aiMonthlyTokenBudget"].every((key) => Object.prototype.hasOwnProperty.call(entitlementPayload?.entitlements?.summary || {}, key)), JSON.stringify(entitlementPayload?.entitlements?.summary || {}));

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
  await page.waitForSelector(".benjadmin-shell-topbar", { timeout: 30000 });

  check("Csapatképernyő gomb a takaróképernyő mellett elérhető", Boolean(await page.$('[data-testid="benjadmin-team-screen-button"]')));
  await page.click('[data-testid="benjadmin-team-screen-button"]');
  await waitOpen(page);
  await page.waitForFunction(() => {
    const p = document.querySelector(".benjadmin-team-screen__infra-card.is-primary > p");
    return Boolean(p && !(p.textContent || "").includes("Telemetria betöltése"));
  }, { timeout: 60000 }).catch(() => {});

  const desktop = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="benjadmin-team-screen"]');
    const text = root?.textContent || "";
    const names = Array.from(root?.querySelectorAll(".benjadmin-team-screen__member-title h2") || []).map((node) => (node.textContent || "").trim());
    const tooSmall = Array.from(root?.querySelectorAll(".benjadmin-team-screen__layout :is(p,span,small,strong,b,li,button)") || [])
      .filter((node) => node.textContent?.trim() && Number.parseFloat(getComputedStyle(node).fontSize || "0") < 12)
      .slice(0, 12)
      .map((node) => ({ text: node.textContent?.trim().slice(0, 38), size: getComputedStyle(node).fontSize }));
    return {
      text,
      names,
      wordmark: document.querySelector(".benjadmin-team-screen__brand .benjadmin-protective__wordmark")?.textContent || "",
      images: Array.from(root?.querySelectorAll(".benjadmin-team-screen__avatar img") || []).map((img) => ({ complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, objectFit: getComputedStyle(img).objectFit, alt: img.alt, renderedWidth: img.getBoundingClientRect().width, renderedHeight: img.getBoundingClientRect().height })) ,
      memberImageShares: Array.from(root?.querySelectorAll(".benjadmin-team-screen__member") || []).map((card) => {
        const avatar = card.querySelector(".benjadmin-team-screen__avatar");
        const cardRect = card.getBoundingClientRect();
        const avatarRect = avatar?.getBoundingClientRect();
        return { widthShare: avatarRect ? avatarRect.width / cardRect.width : 0, heightShare: avatarRect ? avatarRect.height / cardRect.height : 0 };
      }),
      infraCards: document.querySelectorAll(".benjadmin-team-screen__side--left .benjadmin-team-screen__infra-card").length,
      chartTitles: Array.from(document.querySelectorAll(".benjadmin-team-screen__side--right .benjadmin-team-screen__chart-card h3")).map((node) => node.textContent || ""),
      aiFinanceText: document.querySelector('[data-testid="benjadmin-ai-finance"]')?.textContent || "",
      teamCardHeights: Array.from(root?.querySelectorAll(".benjadmin-team-screen__member") || []).map((node) => node.getBoundingClientRect().height),
      financeHeight: document.querySelector('[data-testid="benjadmin-ai-finance"]')?.getBoundingClientRect().height || 0,
      leftTitle: document.querySelector(".benjadmin-team-screen__side--left")?.textContent || "",
      rightTitle: document.querySelector(".benjadmin-team-screen__side--right")?.textContent || "",
      activityLines: Array.from(document.querySelectorAll(".benjadmin-team-screen__side--right .benjadmin-team-screen__chart-card")).find((card) => (card.textContent || "").includes("Fejlesztési aktivitás"))?.querySelectorAll(".benjadmin-team-screen__chart-line").length || 0,
      systemChartFallback: (document.querySelector(".benjadmin-team-screen__side--right")?.textContent || "").includes("CPU / memória / lemez trend"),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      tooSmall,
    };
  });

  const expectedNames = ["Benjadmin", "Ben-AI", "Ármin-AI", "Jázmin-AI", "Outmin-AI"];
  check("Csapatnevek kanonikus formában jelennek meg", JSON.stringify(desktop.names) === JSON.stringify(expectedNames), JSON.stringify(desktop.names));
  check("DIMPRO BENJADMIN márkafelirat felül megmaradt", desktop.wordmark.includes("DIMPRO BENJADMIN"), desktop.wordmark.trim());
  check("Bal oldali szerver- és tárhelypanel látható", desktop.leftTitle.includes("Szerverek és tárhelyek") && desktop.leftTitle.includes("BENJADMIN DEV VPS") && desktop.leftTitle.includes("PRODUCTION / ÉLES VPS") && desktop.leftTitle.includes("DB VPS") && desktop.leftTitle.includes("DIMPRO Drive tárhely") && desktop.leftTitle.includes("DIMPRO Drop tárhely"));
  check("DEV / ÉLES / DB és a két S3 azonos infrastruktúra-kártyát használ", desktop.infraCards === 5, `infraCards=${desktop.infraCards}`);
  check("Bal oldalon RAM és lemezterhelés látható DEV/PROD/DB célokra", (desktop.leftTitle.match(/Memóriaterhelés/g) || []).length >= 3 && (desktop.leftTitle.match(/Lemezfoglaltság/g) || []).length >= 3, desktop.leftTitle.slice(0, 800));
  check("S3 tárhelyméret és foglaltság mezők láthatók", (desktop.leftTitle.match(/Tárhelyfoglaltság/g) || []).length === 2 && (desktop.leftTitle.match(/Teljes keret/g) || []).length === 2 && (desktop.leftTitle.match(/Foglalt:/g) || []).length === 2, desktop.leftTitle.slice(-900));
  check("Jobb oldali működési diagramok a három fő trendet mutatják", ["Rendszerterhelési trend", "Elérési válaszidő", "Fejlesztési aktivitás"].every((title) => desktop.chartTitles.includes(title)), JSON.stringify(desktop.chartTitles));
  check("Fejlesztési aktivitás valós adatsorból rajzol vonalat", desktop.activityLines >= 1, `lineCount=${desktop.activityLines}`);
  check("Valós monitoring hiányánál nincs kitalált rendszertrend", desktop.rightTitle.includes("valós monitoring minták") && (desktop.systemChartFallback || desktop.rightTitle.includes("Monitoring minta")));
  check("Mind az öt hexagon csapatembléma háttérdoboz nélkül betöltött", desktop.images.length === 5 && desktop.images.every((item) => item.complete && item.naturalWidth > 0 && item.naturalHeight > 0 && item.objectFit === "contain" && item.alt.includes("hexagon embléma")), JSON.stringify(desktop.images));
  check("A személyi kártyák kb. fele képi terület", desktop.memberImageShares.length === 5 && desktop.memberImageShares.slice(0, 2).every((item) => item.widthShare >= 0.40) && desktop.memberImageShares.slice(2).every((item) => item.heightShare >= 0.40), JSON.stringify(desktop.memberImageShares));
  check("AI finanszírozás és tokenkeret panel a középső alsó munkatérben látható", desktop.aiFinanceText.includes("AI FINANSZÍROZÁS ÉS TOKENKERET") && desktop.aiFinanceText.includes("AI költség / hó") && desktop.aiFinanceText.includes("Tokenforgalom / hó") && desktop.financeHeight >= 160, desktop.aiFinanceText.slice(0, 700));
  check("A csapatkártyák magassága helyet hagy az AI finanszírozási panelnek", desktop.teamCardHeights.length === 5 && Math.max(...desktop.teamCardHeights) < 330, JSON.stringify({ cards: desktop.teamCardHeights, financeHeight: desktop.financeHeight }));
  check("Csapatképernyő működési szöveg minimum 12 px", desktop.tooSmall.length === 0, JSON.stringify(desktop.tooSmall));
  check("Desktop nincs vízszintes túlcsordulás", desktop.scrollWidth <= desktop.clientWidth + 1, JSON.stringify({ scrollWidth: desktop.scrollWidth, clientWidth: desktop.clientWidth }));
  check("Desktop csapatképernyő egy viewportban marad", desktop.scrollHeight <= desktop.innerHeight + 1, JSON.stringify({ scrollHeight: desktop.scrollHeight, innerHeight: desktop.innerHeight }));

  await page.keyboard.press("d");
  await waitClosed(page);
  check("D billentyű bezárja a csapatképernyőt", true);

  await page.keyboard.press("d");
  await waitOpen(page);
  check("D billentyű megnyitja a csapatképernyőt", true);

  await ctrlAltZero(page);
  await waitClosed(page);
  check("Ctrl+Alt+0 bezárja a csapatképernyőt", true);

  await ctrlAltZero(page);
  await waitOpen(page);
  check("Ctrl+Alt+0 megnyitja a csapatképernyőt", true);

  await page.click('[data-testid="benjadmin-team-screen-d"]', { clickCount: 2, delay: 60 });
  await waitClosed(page);
  check("Dupla kattintás bezárja a csapatképernyőt", true);

  for (const viewport of [
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobil", width: 390, height: 844 },
  ]) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    await ctrlAltZero(page);
    await waitOpen(page);
    const state = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      names: Array.from(document.querySelectorAll(".benjadmin-team-screen__member-title h2")).map((node) => (node.textContent || "").trim()),
      left: Boolean(document.querySelector(".benjadmin-team-screen__side--left")),
      right: Boolean(document.querySelector(".benjadmin-team-screen__side--right")),
    }));
    check(`${viewport.name} nincs vízszintes túlcsordulás`, state.scrollWidth <= state.clientWidth + 1, JSON.stringify(state));
    check(`${viewport.name} csapat és két oldalsáv megmarad`, state.names.length === 5 && state.left && state.right, JSON.stringify(state.names));
    await ctrlAltZero(page);
    await waitClosed(page);
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0, checks }, null, 2));
