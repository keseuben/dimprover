import fs from "node:fs";
import puppeteer from "puppeteer";

const key = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3501/admin";
const checks = [];

function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}

const browser = await puppeteer.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1",
  ],
});

try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((adminKey) => {
    localStorage.setItem("dimproLicenseAdminKey", adminKey);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.setItem("dimpro-admin-theme", "dark");
  }, key);

  async function openAt(width, height) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".operator-console", { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll(".operator-pulse-card").length >= 6, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll(".operator-worker-card").length >= 3, { timeout: 30000 });
  }

  await openAt(1440, 900);
  check("desktop operator console visible", await page.$(".operator-console") !== null);
  check("desktop title rendered", (await page.$eval(".operator-command-header h1", (el) => el.textContent || "")).includes("parancsnoki"));
  check("six pulse cards rendered", await page.$$eval(".operator-pulse-card", (items) => items.length) === 6);
  check("three worker cards rendered", await page.$$eval(".operator-worker-card", (items) => items.length) >= 3);
  check("environment cards rendered", await page.$$eval(".operator-environment-card", (items) => items.length) >= 3);
  check("quick tools rendered", await page.$$eval(".operator-quick-grid > *", (items) => items.length) >= 6);
  check("dark operator theme active", await page.$eval(".dimpro-admin-shell", (el) => el.classList.contains("admin-theme-dark")));

  const before = await page.$eval(".benjadmin-workspace", (el) => ({ width: el.getBoundingClientRect().width, left: el.getBoundingClientRect().left }));
  await page.click(".benjadmin-rail__top .benjadmin-rail__button");
  await page.waitForFunction(() => document.querySelector(".benjadmin-floating-board")?.classList.contains("is-open"));
  const boardVisible = await page.$eval(".benjadmin-floating-board", (el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.visibility === "visible" && rect.width > 300;
  });
  check("floating board opens", boardVisible);
  const after = await page.$eval(".benjadmin-workspace", (el) => ({ width: el.getBoundingClientRect().width, left: el.getBoundingClientRect().left }));
  check("floating board does not resize workspace", Math.abs(before.width - after.width) < 1 && Math.abs(before.left - after.left) < 1, `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  await page.click(".benjadmin-board-backdrop");

  await openAt(1024, 768);
  const tabletLayout = await page.evaluate(() => ({
    mainColumns: getComputedStyle(document.querySelector(".operator-layout-main")).gridTemplateColumns,
    pulseColumns: getComputedStyle(document.querySelector(".operator-pulse-grid")).gridTemplateColumns.split(" ").length,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  check("tablet main layout collapses", tabletLayout.mainColumns.split(" ").length === 1, tabletLayout.mainColumns);
  check("tablet has no horizontal overflow", tabletLayout.overflow <= 1, `overflow=${tabletLayout.overflow}`);

  await openAt(768, 1024);
  const mobileRail = await page.$eval(".benjadmin-rail", (el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height, bottom: style.bottom, top: style.top };
  });
  check("mobile/tablet rail becomes bottom bar", mobileRail.width > 700 && mobileRail.height <= 70, JSON.stringify(mobileRail));
  const mobileWorkspace = await page.$eval(".benjadmin-workspace", (el) => ({ marginLeft: getComputedStyle(el).marginLeft, width: el.getBoundingClientRect().width }));
  check("mobile workspace no left rail offset", mobileWorkspace.marginLeft === "0px", JSON.stringify(mobileWorkspace));
  check("mobile has no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));

  await openAt(390, 844);
  check("phone pulse cards single column", await page.$eval(".operator-pulse-grid", (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length === 1));
  check("phone quick tools single column", await page.$eval(".operator-quick-grid", (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length === 1));
  check("phone has no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));

  const text = await page.$eval(".operator-console", (el) => el.textContent || "");
  check("BenAI hierarchy visible", text.includes("BenAI") && text.includes("ÁrminAI") && text.includes("JázminAI") && text.includes("OutminAI"));
  check("task queue visible", text.includes("TASK QUEUE"));
  check("worktree protection visible", text.includes("WORKTREE / SCOPE"));
  check("environment section visible", text.includes("KÖRNYEZETEK"));

  const failed = checks.filter((item) => !item.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
} finally {
  await browser.close();
}
