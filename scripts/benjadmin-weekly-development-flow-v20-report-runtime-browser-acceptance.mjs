#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const runtimeRoot = process.env.BENJADMIN_RUNTIME_ROOT || process.cwd();
const apiBase = process.env.BENJADMIN_API_BASE || "http://127.0.0.1:3100";
const uiBase = process.env.BENJADMIN_UI_BASE || "http://admin.dev.dimpro.hu:3100/admin";
const host = process.env.BENJADMIN_HOST || "admin.dev.dimpro.hu";
const key = fs.readFileSync(path.join(runtimeRoot, ".dimprover/license/admin-key.txt"), "utf8").trim();
let passed = 0;
function check(label, condition, detail = "") {
  if (!condition) throw new Error(`FAIL ${label}${detail ? ` :: ${detail}` : ""}`);
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")} ${label}${detail ? ` :: ${detail}` : ""}`);
}

const endpoint = `${apiBase}/api/dev/console/weekly-report-export`;
const unauth = await fetch(`${endpoint}?format=json`, { headers: { host } });
check("Report export denies unauthenticated read", unauth.status === 401, `status=${unauth.status}`);

const headers = { host, "x-dimpro-license-admin-key": key };
const jsonResponse = await fetch(`${endpoint}?format=json`, { headers });
const jsonPayload = await jsonResponse.json();
check("JSON report export succeeds", jsonResponse.status === 200 && jsonResponse.headers.get("content-type")?.includes("application/json"), `status=${jsonResponse.status}`);
check("JSON report exposes V2.0 version", jsonPayload?.reportVersion === "BENJADMIN_WEEKLY_REPORT_V2_0", String(jsonPayload?.reportVersion || ""));
check("JSON report remains PROD denied", jsonPayload?.productionAccess === "DENY" && jsonPayload?.summary?.productionAccess === "DENY", JSON.stringify({ export: jsonPayload?.productionAccess, summary: jsonPayload?.summary?.productionAccess }));
check("JSON report carries management summary", Boolean(jsonPayload?.summary?.managementSummary) && Number.isFinite(jsonPayload.summary.managementSummary.score), JSON.stringify(jsonPayload?.summary?.managementSummary || {}));
check("JSON disposition is attachment", (jsonResponse.headers.get("content-disposition") || "").includes("attachment"));

const htmlResponse = await fetch(`${endpoint}?format=html`, { headers });
const html = await htmlResponse.text();
check("HTML report export succeeds", htmlResponse.status === 200 && htmlResponse.headers.get("content-type")?.includes("text/html"), `status=${htmlResponse.status}`);
check("HTML report contains DIMPROVER management report", html.includes("DIMPROVER") && html.includes("WEEKLY DEVELOPMENT FLOW") && html.includes("DEV ONLY · PROD DENY"));
check("HTML report is A4 print oriented", html.includes("@page { size: A4"));

const pdfResponse = await fetch(`${endpoint}?format=pdf`, { headers });
const pdf = Buffer.from(await pdfResponse.arrayBuffer());
check("PDF report export succeeds", pdfResponse.status === 200 && pdfResponse.headers.get("content-type")?.includes("application/pdf"), `status=${pdfResponse.status}`);
check("PDF report has PDF signature", pdf.subarray(0, 5).toString("ascii") === "%PDF-", `bytes=${pdf.length}`);
check("PDF report has nontrivial size", pdf.length > 5_000, `bytes=${pdf.length}`);
check("PDF report response remains PROD denied", pdfResponse.headers.get("x-dimpro-production-access") === "DENY");
check("PDF disposition is attachment", (pdfResponse.headers.get("content-disposition") || "").includes(".pdf"));

const invalid = await fetch(`${endpoint}?format=docx`, { headers });
check("Unsupported report format is rejected", invalid.status === 400, `status=${invalid.status}`);

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", `--host-resolver-rules=MAP admin.dev.dimpro.hu 127.0.0.1`] });
try {
  const page = await browser.newPage();
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((adminKey) => {
    localStorage.setItem("dimproLicenseAdminKey", adminKey);
    sessionStorage.setItem("dimproBenjadminSession", "active");
  }, key);
  await page.setViewport({ width: 1536, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${uiBase}/dev-console`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector('[data-testid="benjadmin-weekly-report-actions"]', { timeout: 30_000 });
  await page.waitForFunction(() => {
    const buttons = [...document.querySelectorAll('[data-testid="benjadmin-weekly-report-actions"] button')];
    return buttons.length === 4 && buttons.every((node) => !node.disabled);
  }, { timeout: 30_000 });
  const desktop = await page.evaluate(() => ({
    formats: [...document.querySelectorAll('[data-testid="benjadmin-weekly-report-actions"] [data-report-format]')].map((node) => node.getAttribute("data-report-format")),
    share: Boolean(document.querySelector('[data-testid="benjadmin-weekly-report-actions"] [data-report-action="share"]')),
    disabled: [...document.querySelectorAll('[data-testid="benjadmin-weekly-report-actions"] button')].filter((node) => node.disabled).length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  check("Report UI renders PDF HTML JSON actions", ["pdf", "html", "json"].every((format) => desktop.formats.includes(format)), JSON.stringify(desktop));
  check("Report UI renders share action", desktop.share === true, JSON.stringify(desktop));
  check("Report UI actions become enabled after summary load", desktop.disabled === 0, JSON.stringify(desktop));
  check("Report UI desktop overflow safe", desktop.overflow === false, JSON.stringify(desktop));

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const mobile = await page.evaluate(() => ({
    visible: Boolean(document.querySelector('[data-testid="benjadmin-weekly-report-actions"]')),
    buttons: document.querySelectorAll('[data-testid="benjadmin-weekly-report-actions"] button').length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  check("Report actions remain visible on mobile", mobile.visible && mobile.buttons === 4, JSON.stringify(mobile));
  check("Report actions mobile overflow safe", mobile.overflow === false, JSON.stringify(mobile));
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, passed, failed: 0, suite: "BENJADMIN Weekly Development Flow V2.0 report export", productionAccess: "DENY" }, null, 2));
