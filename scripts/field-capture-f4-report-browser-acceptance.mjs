import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import puppeteer from "puppeteer";

const BASE = process.env.TEREP_BROWSER_BASE?.trim() || "https://drop.dev.dimpro.hu";
const FIXTURE = process.env.TEREP_IMAGE_FIXTURE?.trim() || "public/drop-app-icon-v099-192.png";
await access(FIXTURE);

const checks = [];
const pass = (name, ok, detail = "") => {
  assert.ok(ok, `${name}${detail ? `: ${detail}` : ""}`);
  checks.push(name);
};

async function visibleButton(page, text) {
  for (const button of await page.$$("button")) {
    const state = await button.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        text: (el.textContent || "").replace(/\s+/g, " ").trim(),
        visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden",
      };
    });
    if (state.visible && state.text === text) return button;
  }
  return null;
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
    if (request.url().includes("/api/dimpro-identity/send/verify")) {
      void request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          user: { fullName: "F4 UI Teszt", email: "f4-ui@example.invalid", publicCode: "USR-F4UI", organizationName: "DIMPRO DEV" },
          entitlement: { id: "44444444-4444-4444-8444-444444444444", canUseStandardSend: true, canUseQuickImageSend: true },
          projects: [],
          sendSession: { token: "dss1.test.payload", expiresAt: new Date(Date.now() + 900000).toISOString(), entitlementId: "44444444-4444-4444-8444-444444444444" },
        }),
      });
      return;
    }
    void request.continue();
  });

  async function authenticate() {
    if (await page.evaluate(() => (document.body.textContent || "").includes("F4 UI Teszt"))) return;
    const code = await page.$('input[placeholder="ABCD-123-456"]');
    assert.ok(code, "Send-kód mező hiányzik");
    await code.type("TEST123456", { delay: 2 });
    const open = await visibleButton(page, "Terepi Gyorsrögzítő megnyitása");
    assert.ok(open, "Terep megnyitás gomb hiányzik");
    await open.click();
    await page.waitForFunction(() => (document.body.textContent || "").includes("F4 UI Teszt"), { timeout: 10000 });
  }

  const response = await page.goto(`${BASE}/terep`, { waitUntil: "networkidle2", timeout: 60000 });
  pass("Terep route HTTP 200", response?.status() === 200, String(response?.status()));
  await authenticate();
  pass("F4 kliensverzió 0.4.2-dev", await page.evaluate(() => (document.body.textContent || "").includes("V0.4.2-dev")));

  const newPhoto = await visibleButton(page, "Új terepi kép");
  assert.ok(newPhoto); await newPhoto.click();
  const gallery = await visibleButton(page, "Galéria");
  assert.ok(gallery, "Galéria gomb hiányzik");
  const chooserPromise = page.waitForFileChooser({ timeout: 10000 });
  await gallery.click();
  const chooser = await chooserPromise;
  await chooser.accept([FIXTURE]);
  await page.waitForFunction(() => document.querySelectorAll("[data-field-capture-item]").length === 1, { timeout: 60000 });

  const review = await visibleButton(page, "Tovább az ellenőrzéshez");
  assert.ok(review); await review.click();
  const save = await visibleButton(page, "Tovább a mentéshez");
  assert.ok(save); await save.click();
  await page.waitForSelector('[data-terep-summary-report="true"]', { timeout: 10000 });

  pass("F4 riportpanel látható a 3. lépésben", await page.$('[data-terep-summary-report="true"]') !== null);
  pass("Rögzítés jellege választó látható", await page.$("[data-terep-report-survey-nature]") !== null);
  pass("Felmérési lefedettség csúszka látható", await page.$("[data-terep-report-coverage]") !== null);
  pass("PDF export gomb látható", await page.$("[data-terep-summary-pdf-export]") !== null);
  pass("Teljesprojekt-készültségi figyelmeztetés látható", await page.evaluate(() => (document.body.textContent || "").includes("nem minősülnek a teljes projekt készültségi fokának")));

  await page.select("[data-terep-report-survey-nature]", "Célzott munkaterületi ellenőrzés");
  await page.$eval("[data-terep-report-coverage]", (el) => {
    const input = el;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Range native value setter hiányzik.");
    setter.call(input, "45");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.$eval("[data-terep-report-title]", (el) => {
    const input = el;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Text input native value setter hiányzik.");
    setter.call(input, "F4 browser terepi riport");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  pass("Rögzítés jellege módosítható", await page.$eval("[data-terep-report-survey-nature]", (el) => el.value === "Célzott munkaterületi ellenőrzés"));
  pass("Lefedettség 45%-ra módosítható", await page.$eval("[data-terep-report-coverage]", (el) => el.value === "45"));

  const exportButton = await page.$("[data-terep-summary-pdf-export]");
  assert.ok(exportButton); await exportButton.click();
  await page.waitForFunction(() => (document.body.textContent || "").includes("PDF elkészült"), { timeout: 30000 });
  pass("Browserből a Terepi összesítő PDF elkészül", true);

  await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
  await authenticate();
  await page.waitForFunction(() => document.querySelectorAll("[data-field-capture-item]").length === 1, { timeout: 10000 });
  const stepButtons = await page.$$("button");
  let saveStep = null;
  for (const button of stepButtons) {
    const text = await button.evaluate((el) => (el.textContent || "").replace(/\s+/g, " ").trim());
    if (text.includes("Mentés és megosztás")) { saveStep = button; break; }
  }
  assert.ok(saveStep); await saveStep.click();
  await page.waitForSelector('[data-terep-summary-report="true"]', { timeout: 10000 });

  pass("Riport címe reload után megmarad", await page.$eval("[data-terep-report-title]", (el) => el.value === "F4 browser terepi riport"));
  pass("Rögzítés jellege reload után megmarad", await page.$eval("[data-terep-report-survey-nature]", (el) => el.value === "Célzott munkaterületi ellenőrzés"));
  pass("Lefedettség reload után megmarad", await page.$eval("[data-terep-report-coverage]", (el) => el.value === "45"));
  pass("Mobil UI nem lóg ki", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  pass("Browser pageerror 0", pageErrors.length === 0, pageErrors.join(" | "));
  pass("Browser console error 0", consoleErrors.length === 0, consoleErrors.join(" | "));

  console.log(JSON.stringify({ ok: true, checks: checks.length, names: checks, base: BASE }, null, 2));
} finally {
  await browser.close();
}
