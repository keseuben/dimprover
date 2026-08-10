import fs from "node:fs";
import puppeteer from "puppeteer";

const key = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((adminKey) => {
    localStorage.setItem("dimproLicenseAdminKey", adminKey);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.setItem("dimpro-admin-theme", "dark");
    localStorage.setItem("dimpro-benjadmin-board-pinned", "false");
  }, key);
  await page.goto("http://admin.dev.dimpro.hu:3100/admin", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".operator-console.operator-compact", { timeout: 30000 });
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll(".operator-view-tabs button")).find((item) => (item.textContent || "").includes("Áttekintés"));
    if (button instanceof HTMLButtonElement) button.click();
  });
  await page.waitForSelector(".operator-overview-side", { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll(".operator-overview-side .operator-worker-line").length >= 3, { timeout: 30000 });
  const overview = await page.evaluate(() => {
    const size = (selector) => {
      const el = document.querySelector(selector);
      return el ? getComputedStyle(el).fontSize : null;
    };
    return {
      nav: size(".operator-view-tabs button"),
      rightWorkerName: size(".operator-overview-side .operator-worker-line strong"),
      rightWorkerMeta: size(".operator-overview-side .operator-worker-line small"),
      rightEnvironment: size(".operator-overview-side .operator-environment-line strong"),
      livePill: size(".operator-compact-header__right .operator-live-pill"),
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    };
  });
  await page.$$eval(".operator-view-tabs button", (buttons) => {
    const button = buttons.find((item) => (item.textContent || "").includes("Licenc / AI"));
    if (!button) throw new Error("Licenc / AI tab missing");
    button.click();
  });
  await page.waitForSelector(".operator-entitlement-panel", { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll(".operator-entitlement-summary > div").length === 6, { timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const entitlement = await page.evaluate(() => ({
    summaryCards: document.querySelectorAll(".operator-entitlement-summary > div").length,
    tableRows: document.querySelectorAll(".operator-entitlement-panel .operator-data-table tbody tr").length,
    text: (document.querySelector(".operator-entitlement-panel")?.textContent || "").slice(0, 800),
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  console.log(JSON.stringify({ overview, entitlement }, null, 2));
} finally {
  await browser.close();
}
