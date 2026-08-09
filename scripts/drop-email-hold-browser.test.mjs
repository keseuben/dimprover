import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";

const baseUrl = process.env.DROP_BROWSER_BASE_URL || "http://license.dimpro.hu:3223";
const adminKey = (await readFile(".dimprover/license/admin-key.txt", "utf8")).trim();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
assert.ok(adminKey.length >= 20);
assert.ok(supabaseUrl && serviceKey);

const client = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const title = `Hold + e-mail UI teszt ${Date.now().toString(36)}`;
let packageId = null;
const consoleErrors = [];
const pageErrors = [];
let confirmCalls = 0;

const browser = await puppeteer.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--host-resolver-rules=MAP license.dimpro.hu 127.0.0.1,MAP drop.dimpro.hu 127.0.0.1",
  ],
});

async function findButton(page, text) {
  const handle = await page.evaluateHandle((needle) => {
    const buttons = [...document.querySelectorAll("button")];
    return buttons.find((button) => (button.textContent || "").includes(needle)) || null;
  }, text);
  const element = handle.asElement();
  if (!element) {
    await handle.dispose();
    throw new Error(`Nem található gomb: ${text}`);
  }
  return element;
}

async function holdButton(page, text, durationMs) {
  const button = await findButton(page, text);
  const disabled = await button.evaluate((node) => node.disabled);
  assert.equal(disabled, false, `A gomb letiltott: ${text}`);
  await button.evaluate((node) => {
    node.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerId: 77,
      pointerType: "mouse",
      isPrimary: true,
      buttons: 1,
    }));
  });

  const fullHold = durationMs >= 2000;
  const progressWait = fullHold ? 1850 : durationMs;
  await new Promise((resolve) => setTimeout(resolve, progressWait));
  const progress = await button.evaluate((node) => Number(node.getAttribute("data-hold-progress") || "0"));
  if (fullHold) await new Promise((resolve) => setTimeout(resolve, durationMs - progressWait));

  try {
    await button.evaluate((node) => {
      if (!node.isConnected) return;
      node.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        pointerId: 77,
        pointerType: "mouse",
        isPrimary: true,
        buttons: 0,
      }));
    });
  } catch {
    // A sikeres művelet bezárhatja az űrlapot és eltávolíthatja a gombot.
  }
  await button.dispose().catch(() => undefined);
  return progress;
}

async function fillLabel(page, labelText, value) {
  const ok = await page.evaluate(({ labelText: needle, value: nextValue }) => {
    const label = [...document.querySelectorAll("label")].find((item) => (item.textContent || "").includes(needle));
    const field = label?.querySelector("input, textarea, select");
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) return false;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
    setter?.call(field, nextValue);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, { labelText, value });
  assert.equal(ok, true, `Nem található mező: ${labelText}`);
}

try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.evaluateOnNewDocument((key) => {
    localStorage.setItem("dimproLicenseAdminKey", key);
    const originalConfirm = window.confirm.bind(window);
    window.confirm = (...args) => {
      window.__dropConfirmCalls = (window.__dropConfirmCalls || 0) + 1;
      return originalConfirm(...args);
    };
  }, adminKey);

  await page.goto(`${baseUrl}/drive/drop`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => document.body.innerText.includes("DIMPRO Drop kezelőközpont"), { timeout: 30_000 });
  await page.waitForFunction(() => {
    const text = document.body.innerText.toLocaleLowerCase("hu-HU");
    return text.includes("e-mail értesítés") && text.includes("aktív");
  }, { timeout: 30_000 });

  const newPackageButton = await findButton(page, "Új csomagterv");
  await newPackageButton.click();
  await newPackageButton.dispose();
  await page.waitForFunction(() => document.body.innerText.includes("Új fájl nélküli csomag"), { timeout: 10_000 });

  await fillLabel(page, "Csomag címe", title);
  await fillLabel(page, "Feltöltő neve", "DIMPRO böngészőteszt");
  await fillLabel(page, "Feltöltő e-mail-címe", "info@dimpro.hu");

  let createResponses = 0;
  page.on("response", (response) => {
    if (response.request().method() === "POST" && response.url().includes("/api/drop/admin/packages")) createResponses += 1;
  });

  const shortProgress = await holdButton(page, "Csomag létrehozása · 2 mp", 700);
  assert.ok(shortProgress > 0 && shortProgress < 100, `A rövid nyomás progressze hibás: ${shortProgress}`);
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.equal(createResponses, 0, "A rövid nyomás nem hozhat létre csomagot.");
  assert.ok((await page.content()).includes("Új fájl nélküli csomag"));

  const createResponsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/api/drop/admin/packages") && response.status() === 201,
    { timeout: 30_000 },
  );
  const fullProgress = await holdButton(page, "Csomag létrehozása · 2 mp", 2250);
  assert.ok(fullProgress >= 85, `A teljes nyomás progressze hibás: ${fullProgress}`);
  const createResponse = await createResponsePromise;
  const createPayload = await createResponse.json();
  packageId = createPayload.created?.package?.id || null;
  assert.ok(packageId);
  assert.equal(createPayload.emailNotification?.attempted, 0);
  assert.equal(createPayload.emailNotification?.sent, 0);
  assert.match(createPayload.emailNotification?.note || "", /Nincs e-mailes meghívásra kijelölt címzett/);

  await page.waitForFunction(() => document.body.innerText.includes("Meghívó e-mail értesítés"), { timeout: 20_000 });
  await page.waitForFunction(() => document.body.innerText.includes("Nincs e-mailes meghívásra kijelölt címzett"), { timeout: 20_000 });

  await page.waitForFunction((packageTitle) => document.body.innerText.includes(packageTitle), { timeout: 20_000 }, title);
  let reissueResponses = 0;
  page.on("response", (response) => {
    if (response.request().method() === "POST" && response.url().includes("/tokens/view/reissue")) reissueResponses += 1;
  });

  const reissueShortProgress = await holdButton(page, "Új view link · 2 mp", 650);
  assert.ok(reissueShortProgress > 0 && reissueShortProgress < 100);
  await new Promise((resolve) => setTimeout(resolve, 650));
  assert.equal(reissueResponses, 0, "A rövid nyomás nem adhat ki új linket.");

  const reissueResponsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/tokens/view/reissue") && response.status() === 201,
    { timeout: 30_000 },
  );
  const reissueFullProgress = await holdButton(page, "Új view link · 2 mp", 2250);
  assert.ok(reissueFullProgress >= 85);
  const reissueResponse = await reissueResponsePromise;
  const reissuePayload = await reissueResponse.json();
  assert.equal(reissuePayload.ok, true);
  assert.match(reissuePayload.issued?.link || "", /^https:\/\/drop\.dimpro\.hu\/p\//);
  await page.waitForFunction(() => document.body.innerText.toLocaleLowerCase("hu-HU").includes("egyszeri új hozzáférési link"), { timeout: 20_000 });

  confirmCalls = await page.evaluate(() => window.__dropConfirmCalls || 0);
  assert.equal(confirmCalls, 0, "A Drop műveletek nem nyithatnak window.confirm ablakot.");
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(layout.scrollWidth <= layout.clientWidth + 2, `Vízszintes túlcsordulás: ${layout.scrollWidth}/${layout.clientWidth}`);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors.filter((item) => !item.includes("favicon")), []);

  console.log(JSON.stringify({
    ok: true,
    emailStatusCard: true,
    shortHoldBlockedCreate: true,
    fullHoldCreatedPackage: true,
    emailResultCardRendered: true,
    shortHoldBlockedReissue: true,
    fullHoldReissuedViewLink: true,
    windowConfirmCalls: confirmCalls,
    browserErrors: pageErrors.length,
    consoleErrors: consoleErrors.length,
    horizontalOverflow: false,
  }, null, 2));
} finally {
  await browser.close();
  if (packageId) {
    const { error } = await client.from("drop_packages").delete().eq("id", packageId);
    if (error) throw new Error(`Böngészőteszt takarítási hiba: ${error.message}`);
    const { data, error: verifyError } = await client.from("drop_packages").select("id").eq("id", packageId).maybeSingle();
    if (verifyError) throw new Error(`Böngészőteszt takarítás ellenőrzési hiba: ${verifyError.message}`);
    assert.equal(data, null);
  }
  console.log(JSON.stringify({ cleanupCompleted: Boolean(packageId), testPackageRetained: false }, null, 2));
}
