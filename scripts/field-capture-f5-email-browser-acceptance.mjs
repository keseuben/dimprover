import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import puppeteer from "puppeteer";

const BASE = process.env.TEREP_BROWSER_BASE?.trim() || "https://drop.dev.dimpro.hu";
const FIXTURE = process.env.TEREP_IMAGE_FIXTURE?.trim() || "public/drop-app-icon-v099-192.png";
const SERVER_SESSION_ID = "55555555-5555-4555-8555-555555555555";
await access(FIXTURE);

const checks = [];
const emailRequests = [];
const pass = (name, ok, detail = "") => {
  assert.ok(ok, `${name}${detail ? `: ${detail}` : ""}`);
  checks.push(name);
};

async function visibleButton(page, text) {
  for (const button of await page.$$("button")) {
    const state = await button.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return { text: (el.textContent || "").replace(/\s+/g, " ").trim(), visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" };
    });
    if (state.visible && state.text.includes(text)) return button;
  }
  return null;
}

async function setInput(page, selector, value) {
  await page.$eval(selector, (el, next) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (!setter) throw new Error("Native input setter hiányzik.");
    setter.call(el, next);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

const browser = await puppeteer.launch({
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--host-resolver-rules=MAP drop.dev.dimpro.hu 127.0.0.1",
    `--unsafely-treat-insecure-origin-as-secure=${BASE}`,
  ],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/dimpro-identity/send/verify")) {
      void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({
        ok: true,
        user: { fullName: "F5 UI Teszt", email: "f5-ui@example.invalid", publicCode: "USR-F5UI", organizationName: "DIMPRO DEV" },
        entitlement: { id: "55555555-5555-4555-8555-555555555554", canUseStandardSend: true, canUseQuickImageSend: true },
        projects: [],
        sendSession: { token: "dss1.f5.test.payload", expiresAt: new Date(Date.now() + 900000).toISOString(), entitlementId: "55555555-5555-4555-8555-555555555554" },
      }) });
      return;
    }
    if (url.includes(`/api/field-capture/sessions/${SERVER_SESSION_ID}/report-email`)) {
      emailRequests.push({ method: request.method(), headers: request.headers(), postData: request.postData() || "" });
      if (request.method() === "GET") {
        void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({
          ok: true,
          session: { id: SERVER_SESSION_ID, status: "ACTIVE" },
          status: { configured: true, deliveryReady: true, maxAttempts: 5, from: "ertesites.drop@dimpro.hu", profileId: "drop", recipientMode: "free_entry", maxRecipients: 3, suggestedRecipients: ["terep-ui-test@example.com"] },
        }) });
        return;
      }
      if (request.method() === "POST") {
        void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({
          ok: true,
          result: { messageId: "f5-browser-test-message", recipients: ["terep-ui-test@example.com"], recipientCount: 1, attachmentName: "DIMPRO_Terepi_osszesito_F5.pdf", subject: "F5 browser riport", duplicate: false, attemptCount: 1, deliveryId: "f5-browser-delivery" },
        }) });
        return;
      }
    }
    void request.continue();
  });

  async function authenticate() {
    if (await page.evaluate(() => (document.body.textContent || "").includes("F5 UI Teszt"))) return;
    const code = await page.$('input[placeholder="ABCD-123-456"]');
    assert.ok(code, "Send-kód mező hiányzik");
    await code.type("TEST123456", { delay: 2 });
    const open = await visibleButton(page, "Terepi Gyorsrögzítő megnyitása");
    assert.ok(open, "Terep megnyitás gomb hiányzik");
    await open.click();
    await page.waitForFunction(() => (document.body.textContent || "").includes("F5 UI Teszt"), { timeout: 10000 });
  }

  const response = await page.goto(`${BASE}/terep`, { waitUntil: "networkidle2", timeout: 60000 });
  pass("Terep route HTTP 200", response?.status() === 200, String(response?.status()));
  await authenticate();
  pass("F10.1 kliensverzió 0.4.7-dev", await page.evaluate(() => (document.body.textContent || "").includes("V0.4.7-dev")));

  const newPhoto = await visibleButton(page, "Új terepi kép");
  assert.ok(newPhoto); await newPhoto.click();
  const gallery = await visibleButton(page, "Galéria");
  assert.ok(gallery);
  const galleryInput = await page.$("[data-field-capture-gallery-input]");
  assert.ok(galleryInput, "Galéria input hiányzik");
  await galleryInput.uploadFile(FIXTURE);
  await page.waitForFunction(() => document.querySelectorAll("[data-field-capture-item]").length === 1, { timeout: 60000 });

  await page.evaluate((serverSessionId) => {
    const key = "dimpro.fieldCapture.activeSession.v1";
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (!value?.id) throw new Error("Terep local session hiányzik.");
    value.serverSessionId = serverSessionId;
    localStorage.setItem(key, JSON.stringify(value));
  }, SERVER_SESSION_ID);
  await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
  await authenticate();
  await page.waitForFunction(() => document.querySelectorAll("[data-field-capture-item]").length === 1, { timeout: 10000 });

  const review = await visibleButton(page, "Tovább az ellenőrzéshez");
  assert.ok(review); await review.click();
  const save = await visibleButton(page, "Tovább a mentéshez");
  assert.ok(save); await save.click();
  await page.waitForSelector('[data-terep-summary-report="true"]', { timeout: 10000 });

  pass("F5 e-mail kapcsoló látható", await page.$("[data-terep-report-email-toggle]") !== null);
  const toggle = await page.$("[data-terep-report-email-toggle]");
  assert.ok(toggle); await toggle.click();
  await page.waitForSelector("[data-terep-report-email-panel]", { timeout: 10000 });
  await page.waitForFunction(() => (document.body.textContent || "").includes("ertesites.drop@dimpro.hu"), { timeout: 10000 });
  pass("Kézi, nem automatikus küldés egyértelmű", await page.evaluate(() => (document.body.textContent || "").includes("Nem automatikus")));
  pass("Központi DIMPRO Drop feladó megjelenik", await page.evaluate(() => (document.body.textContent || "").includes("ertesites.drop@dimpro.hu")));
  pass("Címzettmező látható", await page.$("[data-terep-report-email-recipients]") !== null);
  pass("Tárgymező látható", await page.$("[data-terep-report-email-subject]") !== null);
  pass("Kísérőszöveg mező látható", await page.$("[data-terep-report-email-body]") !== null);

  await setInput(page, "[data-terep-report-email-recipients]", "terep-ui-test@example.com");
  await setInput(page, "[data-terep-report-email-subject]", "F5 browser riport");
  await setInput(page, "[data-terep-report-email-body]", "F5 böngészős acceptance kísérőszöveg.");
  const sendButton = await page.$("[data-terep-report-email-send]");
  assert.ok(sendButton);
  pass("Külön e-mail küldés gomb aktív", await sendButton.evaluate((el) => !el.disabled));
  await sendButton.click();
  await page.waitForFunction(() => (document.body.textContent || "").includes("E-mail elküldve"), { timeout: 30000 });
  pass("PDF-generálás után e-mail sikerállapot megjelenik", true);

  const getRequest = emailRequests.find((item) => item.method === "GET");
  const postRequest = emailRequests.find((item) => item.method === "POST");
  pass("E-mail státusz GET Bearer tokennel megy", Boolean(getRequest?.headers?.authorization?.startsWith("Bearer dss1.f5.test")));
  pass("E-mail POST Bearer tokennel megy", Boolean(postRequest?.headers?.authorization?.startsWith("Bearer dss1.f5.test")));
  pass("E-mail POST multipart PDF-kérés", Boolean(postRequest?.headers?.["content-type"]?.includes("multipart/form-data")));
  pass("SMTP titok nem kerül a kliens POST-ba", !/smtp|password|DIMPRO_SMTP_PASS/i.test(postRequest?.postData || ""));
  pass("Mobil UI nem lóg ki", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  pass("Browser pageerror 0", pageErrors.length === 0, pageErrors.join(" | "));
  pass("Browser console error 0", consoleErrors.length === 0, consoleErrors.join(" | "));

  console.log(JSON.stringify({ ok: true, checks: checks.length, names: checks, emailRequestCount: emailRequests.length, base: BASE }, null, 2));
} finally {
  await browser.close();
}
