import fs from "node:fs";
import puppeteer from "puppeteer";

const key = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const base = "http://admin.dev.dimpro.hu:3100/admin/licenckozpont";
const checks = [];
function check(name, ok, details = "") { checks.push({ name, ok: Boolean(ok), details }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${details ? ` :: ${details}` : ""}`); if (!ok) throw new Error(`${name}: ${details}`); }
function install(page) { return page.evaluateOnNewDocument((adminKey) => { localStorage.setItem("dimproLicenseAdminKey", adminKey); sessionStorage.setItem("dimproBenjadminSession", "active"); localStorage.setItem("dimpro-admin-theme", "dark"); localStorage.setItem("dimpro-benjadmin-board-pinned", "false"); }, key); }
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"] });
try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true); await install(page); await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="benjadmin-license-table"]', { timeout: 30000 });
  const buttonExists = await page.evaluate(() => Array.from(document.querySelectorAll("button")).some((b) => (b.textContent || "").includes("Lejárati értesítések")));
  check("Lejárati értesítések a központi Licencközpontból elérhetők", buttonExists);
  await page.evaluate(() => Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").includes("Lejárati értesítések"))?.click());
  await page.waitForSelector('[data-testid="benjadmin-expiry-reminder-drawer"]', { timeout: 10000 });
  const liveDrawer = await page.$eval('[data-testid="benjadmin-expiry-reminder-drawer"]', (node) => ({ text: node.textContent || "", small: Array.from(node.querySelectorAll("p,span,b,td,th")).filter((el) => parseFloat(getComputedStyle(el).fontSize) < 12).length }));
  check("Lejárati panel jelzi a 30/7/1/0 napos szabályt és a kompatibilitási állapotot", ["30 / 7 / 1 nap és lejárat napja", "régi licencállományt", "Identity Core", "Előnézet küldés nélkül", "Értesítések futtatása", "Legutóbbi futások"].every((x) => liveDrawer.text.includes(x)), liveDrawer.text.slice(0, 900));
  check("Lejárati panel működési szövege legalább 12px", liveDrawer.small === 0, `tooSmall=${liveDrawer.small}`);
  await page.click('[data-testid="benjadmin-expiry-reminder-drawer"] header button');

  const fixture = await browser.newPage(); await fixture.setBypassServiceWorker(true); await install(fixture); await fixture.setRequestInterception(true);
  fixture.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/license/expiry-reminders?limit=10") && request.method() === "GET") {
      request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, thresholds: [30,7,1,0], timezone: "Europe/Budapest", latestRuns: [{ id:"r1", createdAt:new Date().toISOString(), source:"manual", dryRun:true, scannedLicenses:12, eligibleLicenses:4, stageCandidates:3, intendedEmails:5, sentEmails:0, alreadySentEmails:1, failedEmails:0 }] }) }); return;
    }
    if (url.endsWith("/api/license/expiry-reminders") && request.method() === "POST") {
      const body = request.postData() || "";
      if (!body.includes('"dryRun":true')) { request.abort(); return; }
      request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok:true, run:{ id:"r2", createdAt:new Date().toISOString(), source:"manual", dryRun:true, scannedLicenses:12, eligibleLicenses:4, stageCandidates:3, intendedEmails:5, sentEmails:5, alreadySentEmails:1, failedEmails:0 } }) }); return;
    }
    request.continue();
  });
  await fixture.setViewport({ width: 1440, height: 900, deviceScaleFactor:1 }); await fixture.goto(base,{waitUntil:"domcontentloaded",timeout:60000}); await fixture.waitForSelector('[data-testid="benjadmin-license-table"]',{timeout:30000});
  await fixture.evaluate(() => Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").includes("Lejárati értesítések"))?.click());
  await fixture.waitForSelector('[data-testid="benjadmin-expiry-reminder-drawer"]',{timeout:10000});
  await fixture.waitForFunction(() => document.querySelector('[data-testid="benjadmin-expiry-reminder-drawer"]')?.textContent?.includes("12"),{timeout:10000});
  const history = await fixture.$eval('[data-testid="benjadmin-expiry-reminder-drawer"]',(n)=>n.textContent||"");
  check("Lejárati futástörténet megjeleníti a read-only állapotot", history.includes("12") && history.includes("3") && history.includes("5") && history.includes("Előnézet"), history.slice(-600));
  await fixture.evaluate(() => Array.from(document.querySelectorAll('[data-testid="benjadmin-expiry-reminder-drawer"] button')).find((b) => (b.textContent || "").includes("Előnézet küldés nélkül"))?.click());
  await fixture.waitForFunction(() => document.querySelector(".benjadmin-expiry-reminder-summary")?.textContent?.includes("12 licenc ellenőrizve"),{timeout:10000});
  const summary = await fixture.$eval(".benjadmin-expiry-reminder-summary",(n)=>n.textContent||"");
  check("Előnézet dry-run összefoglaló működik e-mail küldés nélkül", summary.includes("Előnézet") && summary.includes("12 licenc") && summary.includes("5 címzett"), summary);
  await fixture.close();

  await page.click('[data-testid="benjadmin-topbar-theme-toggle"]'); await page.waitForFunction(() => document.querySelector(".dimpro-admin-shell")?.getAttribute("data-theme") === "light",{timeout:10000});
  check("Világos mód megmarad a Licencközpontban", await page.$eval(".dimpro-admin-shell",(n)=>n.getAttribute("data-theme")) === "light");
  for (const v of [{name:"tablet",width:768,height:1024},{name:"mobil",width:390,height:844}]) { await page.setViewport({width:v.width,height:v.height,deviceScaleFactor:1}); const s=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth})); check(`${v.name} nincs teljes oldali vízszintes túlcsordulás`,s.sw<=s.cw+1,JSON.stringify(s)); }
} finally { await browser.close(); }
console.log(JSON.stringify({ok:true,passed:checks.length,failed:0},null,2));
