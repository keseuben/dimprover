#!/usr/bin/env node

import { randomInt } from "node:crypto";
import { readFile } from "node:fs/promises";
import puppeteer from "puppeteer";
import process from "node:process";

const port = Number(process.env.DROP_CANDIDATE_PORT || 3120);
const adminKey = (await readFile(".dimprover/license/admin-key.txt", "utf8")).trim();
const adminBase = `http://127.0.0.1:${port}`;
const rawCode = String(randomInt(100000, 999999));
let sendCodeId = "";
let packageId = "";
let browser;
const results = [];

async function adminFetch(path, init = {}) {
  return fetch(`${adminBase}${path}`, {
    ...init,
    headers: {
      host: "license.dimpro.hu",
      "x-dimpro-license-admin-key": adminKey,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function cleanup() {
  if (packageId) {
    for (const targetStatus of ["deleting", "deleted"]) {
      await adminFetch(`/api/drop/admin/packages/${encodeURIComponent(packageId)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ targetStatus, reason: "DROP 1.0.0 automated quick image E2E cleanup" }),
      }).catch(() => undefined);
    }
  }
  if (sendCodeId) {
    await adminFetch("/api/drop/admin/public/send-codes", {
      method: "PATCH",
      body: JSON.stringify({ id: sendCodeId, status: "revoked" }),
    }).catch(() => undefined);
  }
}

try {
  const createdResponse = await adminFetch("/api/drop/admin/public/send-codes", {
    method: "POST",
    body: JSON.stringify({
      label: `DROP 1.0.0 E2E ${new Date().toISOString()}`,
      code: rawCode,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      maxPackagesPerDay: 3,
      maxBytesPerDay: 1024 * 1024 * 1024,
      maxRecipients: 2,
      defaultRetentionDays: 1,
    }),
  });
  const createdPayload = await createdResponse.json();
  if (!createdResponse.ok || !createdPayload?.created?.record?.id) throw new Error(createdPayload?.error || "A teszt Send-kód nem hozható létre.");
  sendCodeId = createdPayload.created.record.id;

  browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--host-resolver-rules=MAP drop.dimpro.hu 127.0.0.1,MAP license.dimpro.hu 127.0.0.1",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const consoleErrors = [];
  const pageErrors = [];
  let sendSessionRequests = 0;
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("ERR_ABORTED")) consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/drop/public/send/session")) sendSessionRequests += 1;
  });

  const sendResponse = await page.goto(`http://drop.dimpro.hu:${port}/send?drop-v100-quick-e2e=1`, { waitUntil: "networkidle2", timeout: 120_000 });
  if (sendResponse?.status() !== 200) throw new Error(`Send oldal HTTP ${sendResponse?.status() ?? "nincs"}.`);
  await page.waitForSelector("#drop-send-code", { timeout: 60_000 });
  const codeInputs = await page.$$eval('input[inputmode="numeric"]', (items) => items.filter((item) => item.offsetWidth > 0 && item.offsetHeight > 0).length);
  if (codeInputs !== 1) throw new Error(`A Send oldalon ${codeInputs} látható numerikus kódmező van egy helyett.`);
  const sendSessionResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/api/drop/public/send/session"), { timeout: 60_000 });
  await page.type("#drop-send-code", rawCode, { delay: 45 });
  const sendSessionResponse = await sendSessionResponsePromise;
  const setCookieHeader = sendSessionResponse.headers()["set-cookie"] || "";
  const sessionCookieMatch = setCookieHeader.match(/dimpro_drop_public_v094=([^;]+)/);
  if (sessionCookieMatch?.[1]) {
    await page.setCookie({
      name: "dimpro_drop_public_v094",
      value: sessionCookieMatch[1],
      url: `http://drop.dimpro.hu:${port}/`,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    });
  }
  await page.waitForFunction(() => document.body.innerText.includes("Gyors KépSend"), { timeout: 60_000 });
  await new Promise((resolve) => setTimeout(resolve, 700));
  if (sendSessionRequests !== 1) throw new Error(`Az automatikus Send-kód ellenőrzés ${sendSessionRequests} kérést indított egy helyett.`);

  const modeState = await page.evaluate(() => ({
    standard: document.body.innerText.includes("Normál Send"),
    quick: document.body.innerText.includes("Gyors KépSend"),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  }));
  if (!modeState.standard || !modeState.quick || modeState.overflow) throw new Error(`Send módválasztó hibás: ${JSON.stringify(modeState)}.`);

  const quickButton = await page.$$('button');
  let clicked = false;
  for (const button of quickButton) {
    const text = await button.evaluate((element) => element.textContent || "");
    if (text.includes("Gyors KépSend")) { await button.click(); clicked = true; break; }
  }
  if (!clicked) throw new Error("A Gyors KépSend választógomb nem található.");
  await page.waitForSelector('input[placeholder="nev@ceg.hu"]', { timeout: 30_000 });
  const quickFormState = await page.evaluate(() => ({
    targetEmail: document.body.innerText.toLocaleLowerCase("hu-HU").includes("cél e-mail-cím"),
    senderNameVisible: [...document.querySelectorAll("span")].some((item) => item.textContent?.trim() === "Feladó neve" && item.getBoundingClientRect().height > 0),
    subjectVisible: [...document.querySelectorAll("span")].some((item) => item.textContent?.trim() === "Tárgy" && item.getBoundingClientRect().height > 0),
    smallCopy: document.body.innerText.includes("Kicsi képméret az ajánlott alap"),
  }));
  if (!quickFormState.targetEmail || quickFormState.senderNameVisible || quickFormState.subjectVisible || !quickFormState.smallCopy) {
    throw new Error(`A Gyors KépSend nem csak a cél e-mailt kéri: ${JSON.stringify(quickFormState)}.`);
  }
  await page.type('input[placeholder="nev@ceg.hu"]', "drop-private-pilot@dimpro.hu");
  const rulesCheckbox = await page.$('input[type="checkbox"]');
  if (!rulesCheckbox) throw new Error("A feltöltési szabályok jelölőnégyzete hiányzik.");
  await rulesCheckbox.click();

  const sessionCookies = await page.cookies(`http://drop.dimpro.hu:${port}/`);
  if (!sessionCookies.some((cookie) => cookie.name === "dimpro_drop_public_v094")) throw new Error("A candidate publikus munkamenet-cookie nem állítható vissza a böngészőtesztben.");

  const packageResponsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/api/drop/public/packages"), { timeout: 60_000 });
  const continueButtons = await page.$$('button');
  let continued = false;
  for (const button of continueButtons) {
    const text = await button.evaluate((element) => element.textContent || "");
    if (text.includes("Tovább a Galéria / Kamera választáshoz")) { await button.click(); continued = true; break; }
  }
  if (!continued) throw new Error("A Gyors KépSend tovább gombja nem található.");
  const packageResponse = await packageResponsePromise;
  const packagePayload = await packageResponse.json();
  if (!packageResponse.ok() || !packagePayload?.created?.package?.id) throw new Error(packagePayload?.error || `Gyors KépSend csomag HTTP ${packageResponse.status()}.`);
  packageId = packagePayload.created.package.id;
  if (packagePayload.created.package.mode !== "image" || packagePayload.created.workflow.quickImageSend !== true || packagePayload.created.workflow.requireDownloadPin !== false) {
    throw new Error(`Hibás Gyors KépSend backend-válasz: ${JSON.stringify(packagePayload.created)}.`);
  }

  await page.waitForFunction(() => document.body.innerText.includes("Képek küldése"), { timeout: 60_000 });
  const uploaderState = await page.evaluate(() => {
    const labels = [...document.querySelectorAll("label")].map((item) => item.textContent?.replace(/\s+/g, " ").trim() || "");
    const small = labels.find((item) => item.startsWith("Kicsi")) || "";
    const originalRadio = document.querySelector('input[name="drop-image-size-preset"][value="original"]');
    const preserveRadio = document.querySelector('input[name="drop-image-metadata-policy"][value="preserve"]');
    return {
      sizeLabels: labels.filter((item) => /^(Nagy|Közepes|Kicsi|Eredeti felbontás)/.test(item)),
      smallRecommended: small.includes("Ajánlott"),
      gpsDelete: document.body.innerText.includes("GPS-adatok törlése"),
      gpsPreserve: document.body.innerText.includes("GPS-adatok megőrzése"),
      cleanupReminder: document.body.innerText.includes("Törlési emlékeztető"),
      nativeDeleteDisabled: document.body.innerText.includes("Automatikus galériatörlés") && document.body.innerText.includes("natív mobilapp"),
      originalChecked: originalRadio instanceof HTMLInputElement ? originalRadio.checked : false,
      preserveAvailable: preserveRadio instanceof HTMLInputElement,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    };
  });
  if (uploaderState.sizeLabels.length < 4 || !uploaderState.smallRecommended || !uploaderState.gpsDelete || !uploaderState.gpsPreserve || !uploaderState.cleanupReminder || !uploaderState.nativeDeleteDisabled || uploaderState.overflow) {
    throw new Error(`A Gyors KépSend feltöltőbeállításai hibásak: ${JSON.stringify(uploaderState)}.`);
  }
  await page.$eval('input[name="drop-image-metadata-policy"][value="preserve"]', (element) => element.click());
  await new Promise((resolve) => setTimeout(resolve, 500));
  const preserveState = await page.evaluate(() => ({
    originalChecked: (document.querySelector('input[name="drop-image-size-preset"][value="original"]'))?.checked || false,
    reducedDisabled: [...document.querySelectorAll('input[name="drop-image-size-preset"]')].filter((item) => item.value !== "original").every((item) => item.disabled),
  }));
  if (!preserveState.originalChecked || !preserveState.reducedDisabled) throw new Error(`A GPS-megőrzési védelem hibás: ${JSON.stringify(preserveState)}.`);

  await page.screenshot({ path: ".work_drop_v100_quick_image_mobile.png", fullPage: true });
  results.push({ id: "quick-image-send", status: "passed", sendSessionRequests, quickFormState, uploaderState, preserveState, packageId });
  await page.close();

  const openPage = await browser.newPage();
  await openPage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  let openRequests = 0;
  openPage.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/drop/access/open")) openRequests += 1;
  });
  await openPage.goto(`http://drop.dimpro.hu:${port}/open?drop-v100-code-e2e=1`, { waitUntil: "networkidle2", timeout: 120_000 });
  await openPage.waitForSelector("#drop-open-pin", { timeout: 60_000 });
  await openPage.type('input[placeholder="DMP-2608-ABC234"]', "DMP-TEST-NOTFOUND");
  const checkboxes = await openPage.$$('input[type="checkbox"]');
  const mainAccepted = checkboxes.at(-1);
  if (!mainAccepted) throw new Error("A csomagmegnyitási feltételek jelölőnégyzete hiányzik.");
  await mainAccepted.click();
  await openPage.type("#drop-open-pin", "123456", { delay: 45 });
  await openPage.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/api/drop/access/open"), { timeout: 60_000 });
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (openRequests !== 1) throw new Error(`A csomagmegnyitási automatikus PIN ${openRequests} kérést indított egy helyett.`);
  const openInputCount = await openPage.$$eval('input[inputmode="numeric"]', (items) => items.filter((item) => item.offsetWidth > 0 && item.offsetHeight > 0).length);
  if (openInputCount !== 1) throw new Error(`A csomagmegnyitásnál ${openInputCount} látható PIN-mező van egy helyett.`);
  results.push({ id: "open-auto-pin", status: "passed", openRequests, openInputCount });
  await openPage.close();

  if (consoleErrors.length || pageErrors.length) throw new Error(`Böngészőhibák: console=${consoleErrors.length}, page=${pageErrors.length}.`);
} finally {
  if (browser) await browser.close();
  await cleanup();
}

console.log(JSON.stringify({ ok: true, passed: results.length, total: results.length, results, cleanup: { sendCodeId, packageId, sendCodeRevoked: Boolean(sendCodeId), packageDeleted: Boolean(packageId) } }, null, 2));
