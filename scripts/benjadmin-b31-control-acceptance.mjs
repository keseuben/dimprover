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

  async function openAt(width, height) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".operator-console.operator-compact", { timeout: 30000 });
    await page.$$eval(".operator-view-tabs button", (buttons) => {
      const button = buttons.find((item) => (item.textContent || "").trim() === "Vezérlés (Control)");
      if (!button) throw new Error("Control tab missing");
      button.click();
    });
    await page.waitForSelector(".operator-control-plane-panel", { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll(".operator-start-card").length === 3, { timeout: 30000 });
  }

  await openAt(1440, 900);
  check("Control tab visible", await page.$$eval(".operator-view-tabs button", (buttons) => buttons.some((item) => (item.textContent || "").trim() === "Vezérlés (Control)")));
  check("three START context cards visible", await page.$$eval(".operator-start-card", (items) => items.length) === 3);
  const controlText = await page.$eval(".operator-control-plane-panel", (el) => el.textContent || "");
  check("START DEV START PROD START visible", ["START", "DEV START", "PROD START"].every((value) => controlText.includes(value)));
  check("PROD START is read only", controlText.includes("READ ONLY") && controlText.includes("PROD START"));
  check("target Control VPS visible", controlText.includes("Vezérlő VPS (Control VPS)"));
  check("staged schema shown as pending", controlText.includes("PGRST205") || controlText.includes("PENDING"));
  check("live worklog rendered", await page.$$eval(".operator-control-plane-grid .operator-data-table tbody tr", (rows) => rows.length) > 0);

  const before = await page.evaluate(() => ({
    active: Array.from(document.querySelectorAll(".operator-view-tabs button")).find((item) => item.classList.contains("is-active"))?.textContent || "",
    navCount: performance.getEntriesByType("navigation").length,
  }));
  await new Promise((resolve) => setTimeout(resolve, 5500));
  const after = await page.evaluate(() => ({
    active: Array.from(document.querySelectorAll(".operator-view-tabs button")).find((item) => item.classList.contains("is-active"))?.textContent || "",
    navCount: performance.getEntriesByType("navigation").length,
  }));
  check("Control silent refresh preserves view", before.active === after.active && before.navCount === after.navCount, `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);

  const desktop = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    navSize: getComputedStyle(document.querySelector(".operator-view-tabs button")).fontSize,
  }));
  check("desktop Control no horizontal overflow", desktop.scrollWidth <= desktop.clientWidth + 1, JSON.stringify(desktop));
  check("desktop Control fits one viewport", desktop.scrollHeight <= desktop.innerHeight + 1, JSON.stringify(desktop));
  check("compact nav remains 11px", desktop.navSize === "11px", desktop.navSize);

  await openAt(768, 1024);
  const tablet = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  check("tablet Control no horizontal overflow", tablet.scrollWidth <= tablet.clientWidth + 1, JSON.stringify(tablet));

  await openAt(390, 844);
  const phone = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  check("phone Control no horizontal overflow", phone.scrollWidth <= phone.clientWidth + 1, JSON.stringify(phone));

  console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0, checks }, null, 2));
} finally {
  await browser.close();
}
