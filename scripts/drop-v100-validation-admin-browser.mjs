#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import puppeteer from "puppeteer";
import process from "node:process";

const port = Number(process.env.DROP_CANDIDATE_PORT || 3120);
const adminKey = (await readFile(".dimprover/license/admin-key.txt", "utf8")).trim();
const scenarios = [
  { id: "desktop", width: 1440, height: 1000, isMobile: false },
  { id: "tablet", width: 900, height: 1180, isMobile: false },
  { id: "mobile", width: 390, height: 844, isMobile: true },
];
const results = [];
let browser;

try {
  browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--host-resolver-rules=MAP license.dimpro.hu 127.0.0.1,MAP drop.dimpro.hu 127.0.0.1",
    ],
  });

  for (const scenario of scenarios) {
    const page = await browser.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("ERR_ABORTED")) consoleErrors.push(message.text());
    });
    await page.setViewport({
      width: scenario.width,
      height: scenario.height,
      isMobile: scenario.isMobile,
      hasTouch: scenario.isMobile,
      deviceScaleFactor: 1,
    });
    await page.evaluateOnNewDocument((key) => {
      try {
        if (location.hostname === "license.dimpro.hu") localStorage.setItem("dimproLicenseAdminKey", key);
      } catch {
        // A sandboxolt e-mail előnézeti iframe szándékosan nem fér hozzá a localStorage-hoz.
      }
    }, adminKey);
    const response = await page.goto(`http://license.dimpro.hu:${port}/drive/drop/public-workflows?drop-v100-admin=1`, {
      waitUntil: "networkidle2",
      timeout: 120_000,
    });
    await page.waitForFunction(() => document.body.innerText.includes("Fizikai és végleges kiadási validáció"), { timeout: 60_000 });
    await new Promise((resolve) => setTimeout(resolve, 800));
    const state = await page.evaluate(() => ({
      title: document.title,
      heading: [...document.querySelectorAll("h2")].find((element) => element.textContent?.includes("Fizikai és végleges"))?.textContent?.trim() || "",
      releaseGate: [...document.querySelectorAll("p")].find((element) => element.textContent?.includes("VALIDÁCIÓ FOLYAMATBAN"))?.textContent?.trim() || "",
      categories: document.querySelectorAll("details").length,
      caseCards: [...document.querySelectorAll("article")].filter((element) => element.querySelector("select") && element.textContent?.includes("Kritikus")).length,
      automatedChecks: [...document.querySelectorAll("#drop-auto-preflight-title ~ div > div")].length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      ariaLive: document.querySelectorAll('[aria-live="polite"]').length,
      unnamedButtons: [...document.querySelectorAll("button")].filter((button) => {
        const rect = button.getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0 && getComputedStyle(button).display !== "none";
        const name = button.getAttribute("aria-label") || button.textContent?.trim() || button.getAttribute("title");
        return visible && !name;
      }).length,
    }));
    const screenshot = `.work_drop_v100_validation_${scenario.id}.png`;
    await page.screenshot({ path: screenshot, fullPage: true });
    const errors = [];
    if (response?.status() !== 200) errors.push(`HTTP ${response?.status() ?? "nincs"}`);
    if (!state.heading) errors.push("A validációs fejléc hiányzik");
    if (state.releaseGate !== "VALIDÁCIÓ FOLYAMATBAN") errors.push(`Váratlan release gate: ${state.releaseGate || "nincs"}`);
    if (state.categories !== 6) errors.push(`Kategóriák: ${state.categories}/6`);
    if (state.caseCards !== 44) errors.push(`Tételek: ${state.caseCards}/44`);
    if (state.overflow) errors.push(`Overflow: ${state.scrollWidth}/${state.width}`);
    if (state.ariaLive < 1) errors.push(`Hiányzó aria-live régió: ${state.ariaLive}`);
    if (state.unnamedButtons > 0) errors.push(`Névtelen gombok: ${state.unnamedButtons}`);
    if (pageErrors.length) errors.push(`Page error: ${pageErrors.length}`);
    if (consoleErrors.length) errors.push(`Console error: ${consoleErrors.length}`);
    results.push({ scenario: scenario.id, status: errors.length ? "failed" : "passed", errors, pageErrors, consoleErrors, state, screenshot });
    await page.close();
  }
} finally {
  if (browser) await browser.close();
}

const failed = results.filter((item) => item.status === "failed");
console.log(JSON.stringify({ ok: failed.length === 0, passed: results.length - failed.length, total: results.length, results }, null, 2));
if (failed.length) process.exitCode = 1;
