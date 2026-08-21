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

async function driveToggleState(page, title) {
  return page.evaluate((needle) => {
    const label = [...document.querySelectorAll("label")].find((el) => (el.textContent || "").includes(needle));
    const input = label?.querySelector('input[type="checkbox"]');
    return {
      found: Boolean(label),
      checked: input instanceof HTMLInputElement ? input.checked : null,
      disabled: input instanceof HTMLInputElement ? input.disabled : null,
      text: (label?.textContent || "").replace(/\s+/g, " ").trim(),
    };
  }, title);
}

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP drop.dev.dimpro.hu 127.0.0.1"],
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
          user: { fullName: "P8 UI Teszt", email: "p8-ui@example.invalid", publicCode: "USR-P8UI" },
          entitlement: { id: "11111111-1111-4111-8111-111111111111", canUseStandardSend: true, canUseQuickImageSend: true },
          projects: [],
          sendSession: { token: "dss1.test.payload", expiresAt: new Date(Date.now() + 900000).toISOString(), entitlementId: "11111111-1111-4111-8111-111111111111" },
        }),
      });
      return;
    }
    void request.continue();
  });

  async function authenticate() {
    if (await page.evaluate(() => (document.body.textContent || "").includes("P8 UI Teszt"))) return;
    const code = await page.$('input[placeholder="ABCD-123-456"]');
    assert.ok(code, "Send-kód mező hiányzik");
    await code.type("TEST123456", { delay: 2 });
    const open = await visibleButton(page, "Terepi Gyorsrögzítő megnyitása");
    assert.ok(open, "Terep megnyitás gomb hiányzik");
    await open.click();
    await page.waitForFunction(() => (document.body.textContent || "").includes("P8 UI Teszt"), { timeout: 10000 });
  }

  const response = await page.goto(`${BASE}/terep`, { waitUntil: "networkidle2", timeout: 60000 });
  pass("Terep route HTTP 200", response?.status() === 200, String(response?.status()));
  await authenticate();
  pass("F3 kliensverzió 0.4.1-dev", await page.evaluate(() => (document.body.textContent || "").includes("V0.4.1-dev")));

  const newPhoto = await visibleButton(page, "Új terepi kép");
  assert.ok(newPhoto); await newPhoto.click();
  await page.waitForFunction(() => (document.body.textContent || "").includes("Mit rögzítsen ehhez a képhez?"), { timeout: 5000 });

  const userBefore = await driveToggleState(page, "Saját DIMPRO Drive");
  pass("Saját DIMPRO Drive kapcsoló látható", userBefore.found);
  pass("Saját DIMPRO Drive alapból KI", userBefore.checked === false, JSON.stringify(userBefore));
  pass("Saját DIMPRO Drive P8 kapcsoló aktív", userBefore.disabled === false && userBefore.text.includes("P8 aktív"), JSON.stringify(userBefore));

  const project = await driveToggleState(page, "Projektkapu Drive");
  pass("Projektkapu Drive P9 továbbra is tiltva", project.found && project.disabled === true && project.text.includes("P9"), JSON.stringify(project));

  const userLabel = await page.evaluateHandle(() => [...document.querySelectorAll("label")].find((el) => (el.textContent || "").includes("Saját DIMPRO Drive")) || null);
  const userCheckbox = await userLabel.asElement()?.$('input[type="checkbox"]');
  assert.ok(userCheckbox, "Saját DIMPRO Drive checkbox hiányzik");
  await userCheckbox.click();
  const userAfter = await driveToggleState(page, "Saját DIMPRO Drive");
  pass("Saját DIMPRO Drive explicit bekapcsolható", userAfter.checked === true, JSON.stringify(userAfter));

  const gallery = await visibleButton(page, "Galéria");
  assert.ok(gallery);
  const chooserPromise = page.waitForFileChooser({ timeout: 10000 });
  await gallery.click();
  const chooser = await chooserPromise;
  await chooser.accept([FIXTURE]);
  await page.waitForFunction(() => document.querySelectorAll("[data-field-capture-item]").length === 1, { timeout: 60000 });

  const toReview = await visibleButton(page, "Tovább az ellenőrzéshez");
  assert.ok(toReview); await toReview.click();
  const toSave = await visibleButton(page, "Tovább a mentéshez");
  assert.ok(toSave); await toSave.click();
  await page.waitForFunction(() => (document.body.textContent || "").includes("3. Mentés és megosztás"), { timeout: 5000 });
  pass("Mentés képernyő felismeri a kért Saját Drive célt", await page.evaluate(() => {
    const body = document.body.textContent || "";
    return body.includes("Saját DIMPRO Drive") && body.includes("kért cél") && body.includes("0/1");
  }));
  pass("Saját Drive kérés lezárás előtt várakozó", await page.evaluate(() => (document.body.textContent || "").includes("még szerveres vagy Drive-mentésre vár")));

  await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
  await authenticate();
  await page.waitForFunction(() => document.querySelectorAll("[data-field-capture-item]").length === 1, { timeout: 10000 });
  const saveStep = [...await page.$$("button")];
  let saveButton = null;
  for (const button of saveStep) {
    const text = await button.evaluate((el) => (el.textContent || "").replace(/\s+/g, " ").trim());
    if (text.includes("Mentés és megosztás")) { saveButton = button; break; }
  }
  assert.ok(saveButton); await saveButton.click();
  await page.waitForFunction(() => (document.body.textContent || "").includes("3. Mentés és megosztás"), { timeout: 5000 });
  pass("Saját Drive opció IndexedDB reload után megmarad", await page.evaluate(() => {
    const body = document.body.textContent || "";
    return body.includes("Saját DIMPRO Drive") && body.includes("0/1") && body.includes("kért cél");
  }));

  pass("Mobil UI nem lóg ki", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  pass("Browser pageerror 0", pageErrors.length === 0, pageErrors.join(" | "));
  pass("Browser console error 0", consoleErrors.length === 0, consoleErrors.join(" | "));

  console.log(JSON.stringify({ ok: true, checks: checks.length, names: checks, base: BASE }, null, 2));
} finally {
  await browser.close();
}
