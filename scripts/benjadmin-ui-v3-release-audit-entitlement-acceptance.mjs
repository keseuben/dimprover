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

const entitlementResponse = await fetch(`${apiBase}/api/dev/engine/entitlements`, { headers: { host, "x-dimpro-license-admin-key": key } });
const entitlementPayload = await entitlementResponse.json().catch(() => ({}));
check("Entitlements API available", entitlementResponse.status === 200 && Boolean(entitlementPayload?.entitlements), `status=${entitlementResponse.status}`);

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
    await new Promise((resolve) => setTimeout(resolve, 160));
  }

  const views = [
    { label: "Release", selector: ".operator-v3-view-stack", titles: ["Release státusz", "Modul aktivitás", "Release aktivitás"], table: ".operator-data-table" },
    { label: "Audit", selector: ".operator-v3-view-stack", titles: ["Idő kategóriánként", "Munkamenet forrás", "Munkaidő trend"], table: ".operator-data-table" },
    { label: "Licenc / AI", selector: ".operator-entitlement-panel", titles: ["Licenc health", "Send entitlement", "AI budget health"], table: ".operator-data-table" },
  ];

  await open(1440, 900);
  for (const view of views) {
    await select(view.label, view.selector);
    const state = await page.evaluate(({ selector, titles }) => {
      const root = document.querySelector(selector);
      const chartTitles = Array.from(root?.querySelectorAll(".benj-v3-chart-card h3") || []).map((node) => node.textContent || "");
      const tooSmall = Array.from(root?.querySelectorAll(":is(td,th,strong,small,span,p,label,button,a)") || [])
        .filter((node) => node.textContent?.trim() && Number.parseFloat(getComputedStyle(node).fontSize || "0") < 12)
        .slice(0, 10)
        .map((node) => ({ text: node.textContent?.trim().slice(0, 40), size: getComputedStyle(node).fontSize }));
      return {
        cards: root?.querySelectorAll(".benj-v3-chart-card").length || 0,
        chartTitles,
        hasExpectedTitles: titles.every((title) => chartTitles.includes(title)),
        hasTable: Boolean(root?.querySelector(".operator-data-table")),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        tooSmall,
      };
    }, { selector: view.selector, titles: view.titles });
    check(`${view.label} V3 chart set`, state.cards === 3 && state.hasExpectedTitles, JSON.stringify(state.chartTitles));
    check(`${view.label} detailed table preserved`, state.hasTable === true);
    check(`${view.label} desktop no horizontal overflow`, state.scrollWidth <= state.clientWidth + 1, JSON.stringify({ scrollWidth: state.scrollWidth, clientWidth: state.clientWidth }));
    check(`${view.label} desktop one viewport`, state.scrollHeight <= state.innerHeight + 1, JSON.stringify({ scrollHeight: state.scrollHeight, innerHeight: state.innerHeight }));
    check(`${view.label} workspace typography >=12px`, state.tooSmall.length === 0, JSON.stringify(state.tooSmall));
  }

  for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "phone", width: 390, height: 844 }]) {
    await open(viewport.width, viewport.height);
    for (const view of views) {
      await select(view.label, view.selector);
      const state = await page.evaluate((selector) => {
        const root = document.querySelector(selector);
        return {
          cards: root?.querySelectorAll(".benj-v3-chart-card").length || 0,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      }, view.selector);
      check(`${viewport.name} ${view.label} no horizontal overflow`, state.scrollWidth <= state.clientWidth + 1, JSON.stringify(state));
      check(`${viewport.name} ${view.label} chart set preserved`, state.cards === 3, `cards=${state.cards}`);
    }
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0, checks }, null, 2));
