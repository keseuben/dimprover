import fs from "node:fs";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";

try { process.loadEnvFile?.(".env.local"); } catch {}
const adminKey = fs.readFileSync(".dimprover/license/admin-key.txt", "utf8").trim();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const uiBase = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const marker = `V13-DATETIME-${Date.now()}`;
const headers = { host, "x-dimpro-license-admin-key": adminKey, "content-type": "application/json" };
let browser;
let passed = 0;
function check(name, ok, detail = "") { if (!ok) throw new Error(`${name}: ${detail}`); passed += 1; console.log(`PASS ${name}${detail ? ` :: ${detail}` : ""}`); }
async function api(path, method = "GET", body) {
  const response = await fetch(`${apiBase}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}
async function cleanup() {
  if (browser) await browser.close().catch(() => undefined);
  await db.from("dev_center_live_worklog").delete().eq("summary", marker);
}

try {
  const created = await api("/api/dev/console/messages", "POST", { text: marker, target: "BENAI", projectId: "project_dimprover", createTask: false, kind: "INSTRUCTION" });
  check("Timestamp fixture message created", created.response.status === 201 && created.payload?.ok === true, `status=${created.response.status}`);

  browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1"] });
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((key) => {
    localStorage.setItem("dimproLicenseAdminKey", key);
    sessionStorage.setItem("dimproBenjadminSession", "active");
    localStorage.setItem("benjadmin-developer-console-theme", "dark");
    localStorage.setItem("benjadmin-developer-console-project", "project_dimprover");
  }, adminKey);
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${uiBase}/dev-console`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="benjadmin-developer-console"]', { timeout: 30000 });
  await page.waitForFunction((m) => document.body.textContent?.includes(m), { timeout: 30000 }, marker);
  const desktop = await page.evaluate((m) => {
    const cards = Array.from(document.querySelectorAll('article[data-message-id]'));
    const card = cards.find((node) => node.textContent?.includes(m));
    const time = card?.querySelector("time");
    if (!card || !time) return null;
    const style = getComputedStyle(time);
    return { text: time.textContent || "", dateTime: time.getAttribute("datetime") || "", whiteSpace: style.whiteSpace, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth };
  }, marker);
  check("Central event shows full date and time", /^\d{4}\. \d{2}\. \d{2}\. \d{2}:\d{2}:\d{2}$/.test(desktop?.text || ""), JSON.stringify(desktop));
  check("Timestamp keeps semantic ISO datetime", Boolean(desktop?.dateTime && /T/.test(desktop.dateTime)), String(desktop?.dateTime || ""));
  check("Desktop timestamp does not wrap", desktop?.whiteSpace === "nowrap" && desktop?.scrollWidth <= desktop?.clientWidth, JSON.stringify(desktop));

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction((m) => document.body.textContent?.includes(m), { timeout: 30000 }, marker);
  const mobile = await page.evaluate((m) => {
    const cards = Array.from(document.querySelectorAll('article[data-message-id]'));
    const card = cards.find((node) => node.textContent?.includes(m));
    const time = card?.querySelector("time");
    return { text: time?.textContent || "", overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, cardWidth: card?.getBoundingClientRect().width || 0 };
  }, marker);
  check("Mobile keeps full date and time", /^\d{4}\. \d{2}\. \d{2}\. \d{2}:\d{2}:\d{2}$/.test(mobile.text), JSON.stringify(mobile));
  check("Mobile has no horizontal overflow", mobile.overflow === false && mobile.cardWidth > 0, JSON.stringify(mobile));

  console.log(JSON.stringify({ ok: true, passed, failed: 0, marker }, null, 2));
} finally {
  await cleanup();
}
