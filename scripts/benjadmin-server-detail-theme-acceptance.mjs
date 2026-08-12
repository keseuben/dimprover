import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin/szerver/reszletes";
const checks = [];
function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"] });
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
  await page.waitForSelector(".benjadmin-server-detail", { timeout: 30000 });
  const initial = await page.evaluate(() => {
    const root = document.querySelector(".benjadmin-server-detail");
    const header = document.querySelector(".benjadmin-server-detail__header");
    const controls = document.querySelector(".benjadmin-server-detail__controls");
    const grid = document.querySelector(".benjadmin-server-detail__grid");
    const h1 = header?.querySelector("h1");
    return {
      text: document.body.textContent || "",
      theme: document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme"),
      rootBg: root ? getComputedStyle(root).backgroundColor : "",
      headerHeight: header?.getBoundingClientRect().height || 0,
      controlsHeight: controls?.getBoundingClientRect().height || 0,
      gridDisplay: grid ? getComputedStyle(grid).display : "",
      titleSize: h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  check("Részletes szerverdiagnosztika BENJADMIN témába integrálva", initial.text.includes("Szerver állapotfigyelő") && initial.text.includes("Részletes VPS-diagnosztika") && initial.text.includes("swap") && initial.text.includes("PM2"), initial.text.slice(0, 420));
  check("Dekoratív gamer rácsháttér eltávolítva", initial.gridDisplay === "none", `display=${initial.gridDisplay}`);
  check("Fejléc kompakt fejlesztőközpont méretű", initial.headerHeight > 0 && initial.headerHeight <= 180 && initial.titleSize <= 36, JSON.stringify({ headerHeight: initial.headerHeight, titleSize: initial.titleSize }));
  check("Vezérlősáv kompakt", initial.controlsHeight > 0 && initial.controlsHeight <= 150, `height=${initial.controlsHeight}`);
  check("Desktop nincs teljes oldali vízszintes túlcsordulás", initial.scrollWidth <= initial.clientWidth + 1, JSON.stringify({ scrollWidth: initial.scrollWidth, clientWidth: initial.clientWidth }));
  check("Sötét mód öröklődik", initial.theme === "dark", `theme=${initial.theme}`);

  const refreshButton = await page.evaluateHandle(() => Array.from(document.querySelectorAll("button")).find((button) => (button.textContent || "").includes("Állapot frissítése")) || null);
  const refreshElement = refreshButton.asElement();
  if (refreshElement) await refreshElement.click();
  await page.waitForFunction(() => document.body.textContent?.includes("PM2 folyamatok") && document.body.textContent?.includes("Swap"), { timeout: 60000 });
  const loaded = await page.evaluate(() => ({
    tabs: Array.from(document.querySelectorAll(".benjadmin-server-detail__tabs button")).map((node) => (node.textContent || "").trim()),
    text: document.body.textContent || "",
    statCount: document.querySelectorAll(".benjadmin-server-detail [class*='grid'] .rounded-3xl").length,
    tabsBg: document.querySelector(".benjadmin-server-detail__tabs") ? getComputedStyle(document.querySelector(".benjadmin-server-detail__tabs")).backgroundColor : "",
  }));
  check("Hét részletes diagnosztikai nézet megmaradt", ["Áttekintés", "Tárhely", "Folyamatok", "Üzemeltetés", "Warningok", "Szerverőr", "Részletes listák"].every((label) => loaded.tabs.includes(label)), JSON.stringify(loaded.tabs));
  check("Swap és erőforrásadatok betöltődnek", loaded.text.includes("Effektív memóriahasználat") && loaded.text.includes("Swap") && loaded.text.includes("Tárhely"), loaded.text.slice(0, 600));

  await page.click('[data-testid="benjadmin-topbar-theme-toggle"]');
  await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") === "light", { timeout: 10000 });
  const light = await page.evaluate(() => {
    const root = document.querySelector(".benjadmin-server-detail");
    const header = document.querySelector(".benjadmin-server-detail__header");
    const controls = document.querySelector(".benjadmin-server-detail__controls");
    const textNode = header?.querySelector("h1");
    return {
      theme: document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme"),
      rootBg: root ? getComputedStyle(root).backgroundColor : "",
      headerBg: header ? getComputedStyle(header).backgroundColor : "",
      controlsBg: controls ? getComputedStyle(controls).backgroundColor : "",
      titleColor: textNode ? getComputedStyle(textNode).color : "",
    };
  });
  check("Világos mód a részletes szerverdiagnosztikában működik", light.theme === "light" && light.headerBg !== "rgb(7, 19, 33)" && light.controlsBg !== "rgb(7, 19, 33)", JSON.stringify(light));

  for (const viewport of [{ name: "tablet", width: 768, height: 1024 }, { name: "mobil", width: 390, height: 844 }]) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    const state = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      mobileNav: Boolean(document.querySelector(".benjadmin-server-detail__mobile-nav")),
      title: document.querySelector(".benjadmin-server-detail__header h1")?.textContent || "",
    }));
    check(`${viewport.name} nincs teljes oldali vízszintes túlcsordulás`, state.scrollWidth <= state.clientWidth + 1, JSON.stringify(state));
    check(`${viewport.name} részletes szervernavigáció megmarad`, state.mobileNav && state.title.includes("Szerver állapotfigyelő"), JSON.stringify(state));
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
