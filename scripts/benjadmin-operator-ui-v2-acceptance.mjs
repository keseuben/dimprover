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
    localStorage.setItem("dimpro-benjadmin-board-pinned", "false");
  }, key);

  async function openAt(width, height) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".operator-console.operator-compact", { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll(".operator-compact-stats > div").length === 6, { timeout: 30000 });
    await page.waitForSelector(".operator-data-table", { timeout: 30000 });
  }

  async function clickTab(label) {
    await page.$$eval(".operator-view-tabs button", (buttons, target) => {
      const button = buttons.find((item) => (item.textContent || "").trim().includes(String(target)));
      if (!button) throw new Error(`Tab not found: ${target}`);
      button.click();
    }, label);
    await page.waitForFunction((target) => Array.from(document.querySelectorAll(".operator-view-tabs button")).some((item) => item.classList.contains("is-active") && (item.textContent || "").includes(String(target))), {}, label);
  }

  await openAt(1440, 900);
  check("desktop compact operator visible", await page.$(".operator-console.operator-compact") !== null);
  check("six compact status cells", await page.$$eval(".operator-compact-stats > div", (items) => items.length) === 6);
  check("table stage visible", await page.$(".operator-table-stage") !== null);
  check("dark mode active", await page.$eval(".dimpro-admin-shell", (el) => el.classList.contains("admin-theme-dark")));

  const desktopScroll = await page.evaluate(() => ({ scrollHeight: document.documentElement.scrollHeight, innerHeight: window.innerHeight }));
  check("desktop main page avoids vertical scrolling", desktopScroll.scrollHeight <= desktopScroll.innerHeight + 2, JSON.stringify(desktopScroll));

  const beforeFloat = await page.$eval(".benjadmin-workspace", (el) => ({ width: el.getBoundingClientRect().width, left: el.getBoundingClientRect().left }));
  await page.click(".benjadmin-rail__top .benjadmin-rail__button");
  await page.waitForFunction(() => { const el = document.querySelector(".benjadmin-floating-board"); return Boolean(el?.classList.contains("is-open") && getComputedStyle(el).visibility === "visible" && Number(getComputedStyle(el).opacity) > 0.9); });
  check("Explorer floating mode opens", await page.$eval(".benjadmin-floating-board", (el) => getComputedStyle(el).visibility === "visible"));
  check("Explorer has Fa Modulok Fájlok Változások views", await page.$$eval(".benjadmin-explorer-switcher button", (items) => items.map((item) => (item.textContent || "").trim()).join("|") === "Fa|Modulok|Fájlok|Változások"));
  const afterFloat = await page.$eval(".benjadmin-workspace", (el) => ({ width: el.getBoundingClientRect().width, left: el.getBoundingClientRect().left }));
  check("floating Explorer does not resize workspace", Math.abs(beforeFloat.width - afterFloat.width) < 1 && Math.abs(beforeFloat.left - afterFloat.left) < 1, `before=${JSON.stringify(beforeFloat)} after=${JSON.stringify(afterFloat)}`);

  await page.$$eval(".benjadmin-explorer-switcher button", (buttons) => buttons.find((item) => (item.textContent || "").includes("Fájlok"))?.click());
  await page.waitForSelector(".benjadmin-file-view");
  check("file-manager view renders", await page.$$eval(".benjadmin-file-row", (items) => items.length) >= 8);
  await page.$$eval(".benjadmin-explorer-switcher button", (buttons) => buttons.find((item) => (item.textContent || "").includes("Változások"))?.click());
  await page.waitForSelector(".benjadmin-change-view");
  check("changes view renders", await page.$$eval(".benjadmin-change-view .benjadmin-file-row", (items) => items.length) >= 3);
  await page.$$eval(".benjadmin-explorer-switcher button", (buttons) => buttons.find((item) => (item.textContent || "").includes("Fa"))?.click());
  await page.waitForSelector(".benjadmin-tree-view");
  check("tree view renders", await page.$$eval(".benjadmin-tree-row", (items) => items.length) >= 6);

  await page.click(".benjadmin-board-pin");
  await page.waitForFunction(() => document.querySelector(".benjadmin-shell")?.classList.contains("is-board-pinned"));
  await page.waitForFunction(() => document.querySelector(".benjadmin-workspace")?.getBoundingClientRect().left > 300);
  const pinned = await page.$eval(".benjadmin-workspace", (el) => ({ width: el.getBoundingClientRect().width, left: el.getBoundingClientRect().left }));
  check("pinned Explorer docks beside rail", pinned.left > beforeFloat.left + 250 && pinned.width < beforeFloat.width - 250, `before=${JSON.stringify(beforeFloat)} pinned=${JSON.stringify(pinned)}`);
  check("pinned state persisted", await page.evaluate(() => localStorage.getItem("dimpro-benjadmin-board-pinned") === "true"));

  await page.click(".benjadmin-board-close");
  await page.waitForFunction(() => !document.querySelector(".benjadmin-floating-board")?.classList.contains("is-open"));
  await page.waitForFunction(() => { const rect = document.querySelector(".benjadmin-workspace")?.getBoundingClientRect(); return Boolean(rect && rect.left < 73 && rect.width > 1367); });
  const hidden = await page.$eval(".benjadmin-workspace", (el) => ({ width: el.getBoundingClientRect().width, left: el.getBoundingClientRect().left }));
  check("Explorer can be hidden even when pin preference exists", Math.abs(hidden.width - beforeFloat.width) < 1 && Math.abs(hidden.left - beforeFloat.left) < 1);

  const themeButton = ".benjadmin-rail__bottom .benjadmin-rail__button:last-child";
  await page.click(themeButton);
  await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.classList.contains("admin-theme-light"));
  check("light mode works", await page.$eval(".dimpro-admin-shell", (el) => el.classList.contains("admin-theme-light")));
  check("table remains visible in light mode", await page.$(".operator-data-table") !== null);
  await page.click(themeButton);
  await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.classList.contains("admin-theme-dark"));
  check("dark mode restores", await page.$eval(".dimpro-admin-shell", (el) => el.classList.contains("admin-theme-dark")));

  await clickTab("Csapat");
  await page.waitForFunction(() => (document.querySelector(".operator-table-title")?.textContent || "").includes("BENJADMIN CSAPAT"));
  const teamText = await page.$eval(".operator-table-card", (el) => el.textContent || "");
  check("B3 five-member team visible", ["Benjadmin", "Ben-AI", "Ármin-AI", "Jázmin-AI", "Outmin-AI"].every((name) => teamText.includes(name)));
  check("three coding slots stated", teamText.includes("3 kódolói slot"));
  check("OutminAI external role visible", teamText.includes("KÜLSŐ KÓDMÉRNÖK"));
  check("team portraits loaded", await page.$$eval(".operator-worker-identity .operator-worker-avatar", (items) => items.length >= 5 && items.every((item) => item instanceof HTMLImageElement && item.complete && item.naturalWidth > 0)));

  await clickTab("Feladatok (taskok)");
  const firstTaskPage = await page.$eval(".operator-pagination", (el) => el.textContent || "");
  check("task table is paginated", firstTaskPage.includes("15 rekord") && firstTaskPage.includes("1/2. oldal"), firstTaskPage.trim());
  await page.$$eval(".operator-pagination button", (buttons) => buttons.find((item) => (item.textContent || "").includes("Következő"))?.click());
  await page.waitForFunction(() => (document.querySelector(".operator-pagination")?.textContent || "").includes("2/2. oldal"));
  const secondPageRows = await page.$$eval(".operator-data-table tbody tr", (rows) => rows.length);
  check("task pagination second page row count", secondPageRows === 7, "rows=" + secondPageRows);

  await clickTab("Környezetek");
  check("DEV STAGING PROD table visible", await page.evaluate(() => ["DEV", "STAGING", "PRODUCTION"].every((value) => (document.body.textContent || "").includes(value))));
  check("main operator text stays at least 12px while compact nav/sidebar may use 10px", await page.evaluate(() => {
    const root = document.querySelector(".operator-console");
    if (!root) return false;
    const nodes = Array.from(root.querySelectorAll("span,small,strong,td,th,code,button,input,a,p,label"));
    return nodes.filter((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }).every((node) => {
      const size = Number.parseFloat(getComputedStyle(node).fontSize);
      const compact = Boolean(node.closest(".operator-view-tabs, .operator-overview-side, .operator-compact-header__right"));
      return size >= (compact ? 9.99 : 11.99);
    });
  }));

  const liveBefore = await page.evaluate(() => ({
    view: Array.from(document.querySelectorAll(".operator-view-tabs button")).find((item) => item.classList.contains("is-active"))?.textContent || "",
    navCount: performance.getEntriesByType("navigation").length,
  }));
  await new Promise((resolve) => setTimeout(resolve, 5500));
  const liveAfter = await page.evaluate(() => ({
    view: Array.from(document.querySelectorAll(".operator-view-tabs button")).find((item) => item.classList.contains("is-active"))?.textContent || "",
    navCount: performance.getEntriesByType("navigation").length,
  }));
  check("silent refresh preserves active view without page reload", liveBefore.view === liveAfter.view && liveBefore.navCount === liveAfter.navCount, `before=${JSON.stringify(liveBefore)} after=${JSON.stringify(liveAfter)}`);

  await page.evaluate(() => localStorage.setItem("dimpro-benjadmin-board-pinned", "false"));
  await openAt(768, 1024);
  const mobileRail = await page.$eval(".benjadmin-rail", (el) => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, bottom: getComputedStyle(el).bottom }));
  check("tablet rail becomes bottom bar", mobileRail.width > 700 && mobileRail.height <= 70 && mobileRail.bottom === "0px", JSON.stringify(mobileRail));
  check("tablet no horizontal page overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));

  await openAt(390, 844);
  const phoneOverflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, offenders: Array.from(document.querySelectorAll("body *")).map((el) => ({ tag: el.tagName, cls: el.className, left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, width: el.getBoundingClientRect().width })).filter((item) => item.right > document.documentElement.clientWidth + 1 || item.left < -1).sort((a, b) => b.right - a.right).slice(0, 8) }));
  check("phone no horizontal page overflow", phoneOverflow.scrollWidth <= phoneOverflow.clientWidth + 1, JSON.stringify(phoneOverflow));
  check("phone stats use two columns", await page.$eval(".operator-compact-stats", (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length === 2));

  const failed = checks.filter((item) => !item.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
} finally {
  await browser.close();
}
