import fs from "node:fs";
import puppeteer from "puppeteer";

const key = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin";
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

  async function selectView(label) {
    await page.$$eval(".operator-view-tabs button", (buttons, target) => {
      const button = buttons.find((item) => (item.textContent || "").trim() === target);
      if (!button) throw new Error(`view missing: ${target}`);
      button.click();
    }, label);
    await page.waitForFunction(() => Boolean(document.querySelector(".operator-v3-view-stack")), { timeout: 10000 });
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  await open(1440, 900);
  const expected = [
    ["Feladatok (taskok)", ["Feladatállapot (task status)", "Prioritási megoszlás", "Fejlesztői terhelés (worker load)"]],
    ["Csapat", ["Fejlesztői terhelés (worker load)", "Munkamenet-készenlét (session readiness)", "Fejlesztési aktivitás"]],
    ["Fejlesztők (worker-ek)", ["Aktív fejlesztői terhelés", "Munkamenet-készenlét (session readiness)", "Feladatállapot (task status)"]],
    ["Környezetek", ["Környezetállapot (environment health)", "Írási házirend (policy)", "Mentési állapot (backup health)"]],
  ];

  for (const [view, titles] of expected) {
    await selectView(view);
    const state = await page.evaluate(() => ({
      cards: document.querySelectorAll(".operator-v3-view-stack .benj-v3-chart-card").length,
      titles: Array.from(document.querySelectorAll(".operator-v3-view-stack .benj-v3-chart-card h3")).map((node) => node.textContent || ""),
      hasTable: Boolean(document.querySelector(".operator-v3-view-stack .operator-data-table")),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      tooSmall: Array.from(document.querySelectorAll(".operator-table-stage .operator-v3-view-stack :is(td,th,strong,small,span,p,label)"))
        .filter((node) => {
          const size = Number.parseFloat(getComputedStyle(node).fontSize || "0");
          return node.textContent?.trim() && size > 0 && size < 12;
        })
        .slice(0, 12)
        .map((node) => ({ text: node.textContent?.trim().slice(0, 40), size: getComputedStyle(node).fontSize })),
    }));
    check(`${view} V3 chart set`, state.cards === 3 && titles.every((title) => state.titles.includes(title)), JSON.stringify({ cards: state.cards, titles: state.titles }));
    check(`${view} detailed table preserved`, state.hasTable === true);
    check(`${view} desktop no horizontal overflow`, state.scrollWidth <= state.clientWidth + 1, JSON.stringify({ scrollWidth: state.scrollWidth, clientWidth: state.clientWidth }));
    check(`${view} desktop one viewport`, state.scrollHeight <= state.innerHeight + 1, JSON.stringify({ scrollHeight: state.scrollHeight, innerHeight: state.innerHeight }));
    check(`${view} workspace typography >=12px`, state.tooSmall.length === 0, JSON.stringify(state.tooSmall));
  }

  for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "phone", width: 390, height: 844 }]) {
    await open(viewport.width, viewport.height);
    for (const [view] of expected) {
      await selectView(view);
      const state = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        cards: document.querySelectorAll(".operator-v3-view-stack .benj-v3-chart-card").length,
        stackWidth: document.querySelector(".operator-v3-view-stack")?.getBoundingClientRect().width || 0,
      }));
      check(`${viewport.name} ${view} no horizontal overflow`, state.scrollWidth <= state.clientWidth + 1, JSON.stringify(state));
      check(`${viewport.name} ${view} chart set preserved`, state.cards === 3, `cards=${state.cards}`);
    }
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0, checks }, null, 2));
