import fs from "node:fs";
import puppeteer from "puppeteer";

const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const root = "http://admin.dev.dimpro.hu:3100";
const checks = [];
function check(name, ok, details = "") {
  checks.push({ name, ok: Boolean(ok), details });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`);
  if (!ok) throw new Error(`${name}: ${details}`);
}
function install(page) {
  return page.evaluateOnNewDocument((key) => {
    localStorage.setItem("dimproLicenseAdminKey", key);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.setItem("dimpro-admin-theme", "dark");
    localStorage.setItem("dimpro-benjadmin-board-pinned", "false");
  }, adminKey);
}
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"] });
try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await install(page);
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${root}/admin`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => document.body.textContent?.includes("BENJADMIN"), { timeout: 30000 });
  await page.waitForSelector(".operator-compact-footer", { timeout: 30000 });
  const home = await page.evaluate(() => ({
    text: document.body.textContent || "",
    licenseLinks: Array.from(document.querySelectorAll(".operator-compact-footer a")).map((a) => ({ text: (a.textContent || "").trim(), href: a.getAttribute("href") })),
    legacyDashboard: (document.body.textContent || "").includes("Licenc-dashboard"),
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  check("BENJADMIN indítópult a központi Licencközpontra vezet", home.licenseLinks.some((item) => item.text.includes("Licencközpont") && item.href === "/admin/licenckozpont"), JSON.stringify(home.licenseLinks));
  check("Normál /admin nézet nem nyitja meg a régi licenc-dashboardot", !home.legacyDashboard);
  check("Indítópult desktop nincs vízszintes túlcsordulás", home.scrollWidth <= home.clientWidth + 1, JSON.stringify({ scrollWidth: home.scrollWidth, clientWidth: home.clientWidth }));

  await page.goto(`${root}/admin/licenckozpont`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="benjadmin-license-table"]', { timeout: 30000 });
  const center = await page.evaluate(() => ({
    text: document.body.textContent || "",
    compatibility: Array.from(document.querySelectorAll("a")).find((a) => (a.textContent || "").includes("Régi licencadmin"))?.getAttribute("href") || "",
    title: document.querySelector(".benjadmin-data-header h1")?.textContent || "",
  }));
  check("Központi Licencközpont marad az elsődleges licenckezelő", center.title === "Központi licencek és jogosultságok", center.title);
  check("Régi licencadmin kompatibilitási útvonal explicit módon megmaradt", center.compatibility === "/admin?legacyLicense=1", center.compatibility);

  await page.goto(`${root}/admin?legacyLicense=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => document.body.textContent?.includes("Licenc-dashboard"), { timeout: 30000 });
  const legacy = await page.evaluate(() => ({
    text: document.body.textContent || "",
    hasExpiry: (document.body.textContent || "").includes("Automatikus lejárati értesítések"),
    hasAi: (document.body.textContent || "").includes("AI"),
    hasCreate: (document.body.textContent || "").includes("Új licenc létrehozása"),
  }));
  check("Régi licencadmin funkciói kompatibilitási útvonalon elérhetők", legacy.hasExpiry && legacy.hasAi && legacy.hasCreate, legacy.text.slice(0, 850));

  await page.goto(`${root}/admin`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="benjadmin-topbar-theme-toggle"]', { timeout: 30000 });
  await page.click('[data-testid="benjadmin-topbar-theme-toggle"]');
  await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") === "light", { timeout: 10000 });
  check("Világos mód az indítópulton továbbra is működik", await page.$eval(".dimpro-admin-shell", (node) => node.getAttribute("data-theme")) === "light");
} finally {
  await browser.close();
}
console.log(JSON.stringify({ ok: true, passed: checks.length, failed: 0 }, null, 2));
