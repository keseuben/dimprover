import fs from "node:fs";
import puppeteer from "puppeteer";

const key = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin";
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const checks = [];

function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}

async function api(path) {
  const response = await fetch(`${apiBase}${path}`, { headers: { host, "x-dimpro-license-admin-key": key } });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

const controlApi = await api("/api/dev/engine/control-plane");
check("Control API available", controlApi.status === 200 && Boolean(controlApi.payload?.controlPlane), `status=${controlApi.status}`);
const partnerApi = await api("/api/dev/engine/partner-projects");
check("Partner API available", partnerApi.status === 200 && Boolean(partnerApi.payload?.health), `status=${partnerApi.status}`);
check("Partner schema/runtime READY", partnerApi.payload?.health?.ready === true && partnerApi.payload?.runtimeIsolation?.ready === true, JSON.stringify({ schema: partnerApi.payload?.health?.actualSchemaVersion, runtime: partnerApi.payload?.runtimeIsolation?.stage }));

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"] });
try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((adminKey) => {
    localStorage.setItem("dimproLicenseAdminKey", adminKey);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.setItem("dimpro-admin-theme", "dark");
    localStorage.setItem("dimpro-benjadmin-board-pinned", "false");
  }, key);

  async function open(width, height) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".operator-console.operator-compact", { timeout: 30000 });
  }

  async function select(label, selector) {
    await page.$$eval(".operator-view-tabs button", (buttons, target) => {
      const button = buttons.find((item) => (item.textContent || "").trim() === target);
      if (!button) throw new Error(`view missing: ${target}`);
      button.click();
    }, label);
    await page.waitForSelector(selector, { timeout: 15000 });
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  await open(1440, 900);
  await select("Vezérlés (Control)", ".operator-control-plane-panel");
  const control = await page.evaluate(() => ({
    titles: Array.from(document.querySelectorAll(".operator-control-analytics h3")).map((node) => node.textContent || ""),
    cards: document.querySelectorAll(".operator-control-analytics .benj-v3-chart-card").length,
    worklog: Boolean(document.querySelector(".operator-control-plane-grid .operator-data-table")),
    prodReadOnly: (document.querySelector(".operator-control-plane-panel")?.textContent || "").includes("PRODUCTION: CSAK OLVASHATÓ (READ_ONLY)") && (document.querySelector(".operator-control-plane-panel")?.textContent || "").includes("PROD START"),
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    tooSmall: Array.from(document.querySelectorAll(".operator-control-plane-panel :is(p,span,small,strong,td,th,code,label)"))
      .filter((node) => node.textContent?.trim() && Number.parseFloat(getComputedStyle(node).fontSize || "0") < 12)
      .slice(0, 10)
      .map((node) => ({ text: node.textContent?.trim().slice(0, 40), size: getComputedStyle(node).fontSize })),
  }));
  check("Control V3 analytics present", control.cards === 3 && ["Parancsvárólista (command queue)", "Jóváhagyási életciklus (approval lifecycle)", "Felügyeleti állapot (monitoring health)"].every((title) => control.titles.includes(title)), JSON.stringify(control.titles));
  check("Control live worklog table preserved", control.worklog === true);
  check("Control PROD READ_ONLY contract preserved", control.prodReadOnly === true);
  check("Control body typography >=12px", control.tooSmall.length === 0, JSON.stringify(control.tooSmall));
  check("Control desktop one viewport", control.scrollWidth <= control.clientWidth + 1 && control.scrollHeight <= control.innerHeight + 1, JSON.stringify(control));

  await select("Partner fejlesztések", "[data-testid=partner-development-panel]");
  const partner = await page.evaluate(() => ({
    titles: Array.from(document.querySelectorAll(".operator-partner-analytics h3")).map((node) => node.textContent || ""),
    cards: document.querySelectorAll(".operator-partner-analytics .benj-v3-chart-card").length,
    table: Boolean(document.querySelector("[data-testid=partner-project-table]")),
    runtime: document.querySelector("[data-testid=partner-runtime-status]")?.textContent || "",
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    tooSmall: Array.from(document.querySelectorAll(".operator-partner-panel :is(p,span,small,strong,td,th,code,label)"))
      .filter((node) => node.textContent?.trim() && Number.parseFloat(getComputedStyle(node).fontSize || "0") < 12)
      .slice(0, 10)
      .map((node) => ({ text: node.textContent?.trim().slice(0, 40), size: getComputedStyle(node).fontSize })),
  }));
  check("Partner V3 analytics present", partner.cards === 3 && ["Kiépítési életciklus (provision lifecycle)", "Átadási modell (delivery model)", "Partnerkörnyezet állapota (environment health)"].every((title) => partner.titles.includes(title)), JSON.stringify(partner.titles));
  check("Partner registry table preserved", partner.table === true);
  check("Partner P2 runtime READY visible", partner.runtime.includes("P2 FUTÁSI KÖRNYEZET READY"), partner.runtime.trim());
  check("Partner body typography >=12px", partner.tooSmall.length === 0, JSON.stringify(partner.tooSmall));
  check("Partner desktop one viewport", partner.scrollWidth <= partner.clientWidth + 1 && partner.scrollHeight <= partner.innerHeight + 1, JSON.stringify(partner));

  for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "phone", width: 390, height: 844 }]) {
    await open(viewport.width, viewport.height);
    for (const [label, selector, analyticsClass] of [
      ["Vezérlés (Control)", ".operator-control-plane-panel", ".operator-control-analytics"],
      ["Partner fejlesztések", "[data-testid=partner-development-panel]", ".operator-partner-analytics"],
    ]) {
      await select(label, selector);
      const state = await page.evaluate((className) => ({
        cards: document.querySelectorAll(`${className} .benj-v3-chart-card`).length,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }), analyticsClass);
      check(`${viewport.name} ${label} no horizontal overflow`, state.scrollWidth <= state.clientWidth + 1, JSON.stringify(state));
      check(`${viewport.name} ${label} chart set preserved`, state.cards === 3, `cards=${state.cards}`);
    }
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0, checks }, null, 2));
