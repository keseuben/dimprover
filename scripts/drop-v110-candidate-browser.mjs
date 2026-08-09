#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import puppeteer from "puppeteer";

const port = Number(process.env.DROP_CANDIDATE_PORT || 3120);
const base = `http://127.0.0.1:${port}`;
const publicBase = `http://drop.dimpro.hu:${port}`;
const adminKey = (await readFile(".dimprover/license/admin-key.txt", "utf8")).trim();
const licenseId = process.env.DROP_TEST_LICENSE_ID || "lic-hage-invest-mvp";
const runId = `${Date.now()}-${process.pid}`;
const packageIds = [];
let sendCodeId = "";
let rawCode = "";
let browser;
const results = [];
const errors = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function adminFetch(path, init = {}) {
  return fetch(`${base}${path}`, {
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
  for (const packageId of packageIds.reverse()) {
    for (const targetStatus of ["deleting", "deleted"]) {
      await adminFetch(`/api/drop/admin/packages/${encodeURIComponent(packageId)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ targetStatus, reason: `DROP 1.1.0 candidate E2E cleanup ${runId}` }),
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

async function createEntitlement() {
  const response = await adminFetch("/api/drop/admin/public/send-codes", {
    method: "POST",
    body: JSON.stringify({
      label: `DROP 1.1.0 candidate E2E ${runId}`,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      maxPackagesPerDay: 6,
      maxBytesPerDay: 1024 * 1024 * 1024,
      maxRecipients: 3,
      defaultRetentionDays: 1,
      licenseId,
      userFullName: "DIMPRO E2E Teszt Feladó",
      userEmail: `drop-v110-sender-${runId}@example.invalid`,
      organizationName: "HAGE-INVEST Kft.",
      phone: "+36 00 000 0000",
      recipientMode: "locked_default",
      defaultRecipient: {
        id: `recipient-${runId}`,
        name: "DIMPRO E2E Teszt Címzett",
        email: "drop-private-pilot@dimpro.hu",
        company: "DIMPRO",
        label: "Zárolt tesztcímzett",
      },
      approvedRecipients: [],
      canUseStandardSend: true,
      canUseQuickImageSend: true,
      canUseImageGroups: true,
      canUseFileComments: true,
      canUseProjectDrop: false,
    }),
  });
  const payload = await response.json();
  assert(response.ok, payload.error || `Send-jogosultság HTTP ${response.status}`);
  assert(payload?.created?.record?.id, "A Send-jogosultság rekordazonosítója hiányzik.");
  assert(payload?.created?.rawCode, "A nyers Send-kód hiányzik az egyszeri adminválaszból.");
  sendCodeId = payload.created.record.id;
  rawCode = payload.created.rawCode;
  assert(/^[A-Z]{4}[A-Z0-9]{6}$/.test(rawCode), `Váratlan nyers Send-kód: ${rawCode}`);
  assert(/^[A-Z]{4}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(payload.created.formattedCode), `Váratlan formázott Send-kód: ${payload.created.formattedCode}`);
  assert(payload.created.record.entitlement?.licenseId === licenseId, "A Send-jogosultság nem a kiválasztott licenchez kapcsolódik.");
  results.push({ id: "entitlement-create", status: "passed", formattedCode: payload.created.formattedCode, sendCodeId });
}

function browserArgs() {
  return [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--host-resolver-rules=MAP drop.dimpro.hu 127.0.0.1,MAP license.dimpro.hu 127.0.0.1",
  ];
}

async function newContextPage(viewport) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(viewport);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (!text.includes("ERR_ABORTED") && !text.includes("favicon.ico")) consoleErrors.push(text);
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  return { context, page, consoleErrors, pageErrors };
}

async function setSessionCookieFromResponse(page, response) {
  const setCookieHeader = response.headers()["set-cookie"] || "";
  const match = setCookieHeader.match(/dimpro_drop_public_v094=([^;]+)/);
  if (!match?.[1]) throw new Error("A Send munkamenet-cookie hiányzik a szerverválaszból.");
  const client = await page.createCDPSession();
  const result = await client.send("Network.setCookie", {
    name: "dimpro_drop_public_v094",
    value: match[1],
    domain: "drop.dimpro.hu",
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax",
  });
  await client.detach();
  if (!result.success) throw new Error("A candidate Send munkamenet-cookie nem állítható be.");
}

async function loginSend(page, scenario) {
  let sessionRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/drop/public/send/session")) sessionRequests += 1;
  });
  const response = await page.goto(`${publicBase}/send?drop-v110-${scenario}=1`, { waitUntil: "networkidle2", timeout: 120_000 });
  assert(response?.status() === 200, `Send oldal HTTP ${response?.status() ?? "nincs"}.`);
  await page.waitForSelector('input[placeholder="ABCD-123-456"]', { timeout: 60_000 });
  const sessionResponsePromise = page.waitForResponse(
    (item) => item.request().method() === "POST" && item.url().includes("/api/drop/public/send/session"),
    { timeout: 60_000 },
  );
  await page.type('input[placeholder="ABCD-123-456"]', rawCode.toLowerCase(), { delay: 35 });
  const sessionResponse = await sessionResponsePromise;
  const payload = await sessionResponse.json();
  assert(sessionResponse.ok(), payload.error || `Send session HTTP ${sessionResponse.status()}`);
  assert(payload.user?.fullName, `A Send session válaszában nincs azonosított feladó: ${JSON.stringify(payload)}`);
  await setSessionCookieFromResponse(page, sessionResponse);
  await page.waitForFunction(
    (senderName) => document.body.innerText.toLocaleLowerCase("hu-HU").includes("azonosított küldő")
      && document.body.innerText.includes(senderName),
    { timeout: 60_000 },
    payload.user.fullName,
  );
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert(sessionRequests === 1, `Az automatikus Send-kód ellenőrzés ${sessionRequests} kérést indított.`);
  assert(payload.user?.fullName === "DIMPRO E2E Teszt Feladó", "A hitelesített feladó neve hibás.");
  assert(payload.user?.organizationName === "HAGE-INVEST Kft.", "A hitelesített feladó szervezete hibás.");
  assert(payload.entitlement?.recipientMode === "locked_default", "A címzettmód nem locked_default.");
  assert(payload.entitlement?.canUseProjectDrop === false, "A projekt Drop idő előtt aktív lett.");
  return payload;
}

async function clickRules(page) {
  const labels = await page.$$("label");
  for (const label of labels) {
    const text = await label.evaluate((item) => item.textContent || "");
    if (!text.includes("Elfogadom a feltöltési és adatkezelési szabályokat")) continue;
    const checkbox = await label.$('input[type="checkbox"]');
    assert(checkbox, "A szabályelfogadó jelölőnégyzet hiányzik.");
    await checkbox.click();
    return;
  }
  throw new Error("A szabályelfogadó blokk nem található.");
}

async function fillField(page, labelText, value) {
  const labels = await page.$$("label");
  for (const label of labels) {
    const text = await label.evaluate((item) => item.textContent || "");
    if (!text.includes(labelText)) continue;
    const control = await label.$("input,textarea,select");
    if (!control) continue;
    const tag = await control.evaluate((item) => item.tagName.toLowerCase());
    if (tag === "select") await control.select(value);
    else {
      await control.click({ clickCount: 3 });
      await control.type(value, { delay: 15 });
    }
    return control;
  }
  throw new Error(`A(z) ${labelText} mező nem található.`);
}

async function clickButton(page, text) {
  const buttons = await page.$$("button");
  for (const button of buttons) {
    const content = await button.evaluate((item) => item.textContent || "");
    const disabled = await button.evaluate((item) => item.disabled);
    if (content.includes(text) && !disabled) {
      await button.evaluate((item) => item.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
      await new Promise((resolve) => setTimeout(resolve, 250));
      await button.click();
      return;
    }
  }
  throw new Error(`A(z) ${text} aktív gomb nem található.`);
}

async function testHome() {
  const { context, page, consoleErrors, pageErrors } = await newContextPage({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  try {
    const response = await page.goto(`${publicBase}/?drop-v110-home=1`, { waitUntil: "networkidle2", timeout: 120_000 });
    assert(response?.status() === 200, `Kezdőlap HTTP ${response?.status() ?? "nincs"}.`);
    const state = await page.evaluate(() => {
      const exact = (selector, text) => [...document.querySelectorAll(selector)].filter((item) => item.textContent?.trim() === text).length;
      const body = document.body.innerText;
      return {
        productTitles: ["DIMPRO CsomagDrop", "DIMPRO Beküldőkapu", "DIMPRO Send", "DIMPRO Drop Tér"].filter((title) => body.includes(title)),
        chooserCount: exact("p", "Mikor ezt válassza?"),
        accessCount: exact("p", "Hozzáférés"),
        adminEmail: body.includes("admin@dimpro.hu"),
        beta: [...document.querySelectorAll("p")].some((item) => item.textContent?.includes("Béta tesztüzem · korlátozott hozzáférés") && item.getBoundingClientRect().height > 0),
        launch: body.includes("Tervezett nyilvános indulás") && body.includes("2027. I. negyedév"),
        driveCopy: body.includes("DIMPRO Drive"),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      };
    });
    assert(state.productTitles.length === 4, `Csak ${state.productTitles.length}/4 termékkártya található.`);
    assert(state.chooserCount === 4, `A „Mikor ezt válassza?” blokkok száma ${state.chooserCount}/4.`);
    assert(state.accessCount === 4, `A „Hozzáférés” blokkok száma ${state.accessCount}/4.`);
    assert(state.adminEmail && state.beta && state.launch && state.driveCopy, `Hiányos kezdőlapi tájékoztatás: ${JSON.stringify(state)}`);
    assert(!state.overflow, "A Drop kezdőlapon vízszintes túlcsordulás van.");
    assert(consoleErrors.length === 0 && pageErrors.length === 0, `Kezdőlapi böngészőhiba: console=${consoleErrors.length}, page=${pageErrors.length}`);
    await page.screenshot({ path: ".work_drop_v110_home_desktop.png", fullPage: true });
    results.push({ id: "home-module-descriptions", status: "passed", state });
  } finally { await context.close(); }
}

async function createPackageFromPage(page, buttonText) {
  const responsePromise = page.waitForResponse(
    (item) => item.request().method() === "POST" && item.url().includes("/api/drop/public/packages") && !item.url().includes("/resume"),
    { timeout: 60_000 },
  );
  await clickButton(page, buttonText);
  const response = await responsePromise;
  const payload = await response.json();
  assert(response.ok(), payload.error || `Csomaglétrehozás HTTP ${response.status()}`);
  assert(payload?.created?.package?.id, "A létrehozott csomagazonosító hiányzik.");
  packageIds.push(payload.created.package.id);
  await page.waitForFunction(() => document.body.innerText.toLocaleLowerCase("hu-HU").includes("helyszínmappa / képcsoport"), { timeout: 60_000 });
  return payload.created;
}

async function createGroupThroughUi(page, groupName) {
  await page.waitForSelector('input[placeholder^="Új mappa neve"]', { timeout: 30_000 });
  await page.type('input[placeholder^="Új mappa neve"]', groupName, { delay: 25 });
  const responsePromise = page.waitForResponse(
    (item) => item.request().method() === "POST" && item.url().includes("/api/drop/access/groups"),
    { timeout: 60_000 },
  );
  await page.click('button[aria-label="Új képcsoport létrehozása"]');
  const response = await responsePromise;
  const payload = await response.json();
  assert(response.ok(), payload.error || `Képcsoport HTTP ${response.status()}`);
  await page.waitForFunction((name) => document.body.innerText.includes(`Aktív mappa: ${name}`), { timeout: 30_000 }, groupName);
  const state = await page.evaluate((name) => {
    const select = [...document.querySelectorAll("select")].find((item) => [...item.options].some((option) => option.textContent?.includes(name)));
    return {
      active: document.body.innerText.includes(`Aktív mappa: ${name}`),
      option: Boolean(select && [...select.options].some((option) => option.textContent?.includes(name))),
      selectedText: select?.selectedOptions?.[0]?.textContent || "",
    };
  }, groupName);
  assert(state.active && state.option && state.selectedText.includes(groupName), `A képcsoport nem lett aktív: ${JSON.stringify(state)}`);
  return { group: payload.group, state };
}

async function testStandardSend() {
  const { context, page, consoleErrors, pageErrors } = await newContextPage({ width: 1280, height: 950, deviceScaleFactor: 1 });
  try {
    await loginSend(page, "standard");
    const identity = await page.evaluate(() => ({
      sender: document.body.innerText.includes("DIMPRO E2E Teszt Feladó"),
      email: document.body.innerText.includes("@example.invalid"),
      organization: document.body.innerText.includes("HAGE-INVEST Kft."),
      lockedRecipient: document.body.innerText.toLocaleLowerCase("hu-HU").includes("zárolt címzett") && document.body.innerText.includes("DIMPRO E2E Teszt Címzett"),
      projectSoon: document.body.innerText.toLocaleLowerCase("hu-HU").includes("projektkapcsolat") && document.body.innerText.toLocaleLowerCase("hu-HU").includes("hamarosan"),
      projectCodeDisabled: [...document.querySelectorAll('input[placeholder="PRJ-26-K7M-4Q9"]')].every((item) => item.disabled),
      editableSenderFields: [...document.querySelectorAll("label")].filter((item) => ["Feladó neve", "Feladó e-mail-címe"].includes((item.querySelector("span")?.textContent || "").trim())).filter((item) => item.getBoundingClientRect().height > 0).length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    }));
    assert(identity.sender && identity.email && identity.organization && identity.lockedRecipient, `Hibás azonosított Send felület: ${JSON.stringify(identity)}`);
    assert(identity.projectSoon && identity.projectCodeDisabled && identity.editableSenderFields === 0 && !identity.overflow, `Hibás projekt/feladó védelem: ${JSON.stringify(identity)}`);
    await fillField(page, "Tárgy", `DROP 1.1.0 standard E2E ${runId}`);
    await clickRules(page);
    const created = await createPackageFromPage(page, "Tovább a fájlokhoz");
    assert(created.workflow.quickImageSend !== true, "A normál Send tévesen Gyors KépSendként jött létre.");
    assert(created.workflow.allowImageGroups === true, "A normál Send képcsoportjogosultsága hiányzik.");
    assert(created.workflow.allowFileComments === true, "A normál Send fájlmegjegyzés-jogosultsága hiányzik.");
    const groupResult = await createGroupThroughUi(page, "Szerkezetépítés");
    await page.screenshot({ path: ".work_drop_v110_send_standard.png", fullPage: true });
    assert(consoleErrors.length === 0 && pageErrors.length === 0, `Standard Send böngészőhiba: console=${consoleErrors.length}, page=${pageErrors.length}`);
    results.push({ id: "standard-send-locked-recipient", status: "passed", packageId: created.package.id, identity, group: groupResult.group });
  } finally { await context.close(); }
}

async function testQuickImageSend() {
  const { context, page, consoleErrors, pageErrors } = await newContextPage({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  try {
    await loginSend(page, "quick-image");
    await clickButton(page, "Gyors KépSend");
    await page.waitForFunction(() => document.body.innerText.toLocaleLowerCase("hu-HU").includes("zárolt képsend-címzett"), { timeout: 30_000 });
    const preState = await page.evaluate(() => ({
      locked: document.body.innerText.toLocaleLowerCase("hu-HU").includes("zárolt képsend-címzett") && document.body.innerText.includes("DIMPRO E2E Teszt Címzett"),
      projectSoon: document.body.innerText.toLocaleLowerCase("hu-HU").includes("projektkód · előkészítve") && document.body.innerText.toLocaleLowerCase("hu-HU").includes("hamarosan"),
      senderInputs: [...document.querySelectorAll("label")].filter((item) => ["Feladó neve", "Feladó e-mail-címe"].includes((item.querySelector("span")?.textContent || "").trim())).filter((item) => item.getBoundingClientRect().height > 0).length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    }));
    assert(preState.locked && preState.projectSoon && preState.senderInputs === 0 && !preState.overflow, `Hibás Gyors KépSend előkészítés: ${JSON.stringify(preState)}`);
    await clickRules(page);
    const created = await createPackageFromPage(page, "Tovább a Galéria / Kamera választáshoz");
    assert(created.package.mode === "image", `A Gyors KépSend csomagmódja ${created.package.mode}.`);
    assert(created.workflow.quickImageSend === true, "A quickImageSend jelző hiányzik.");
    assert(created.workflow.requireDownloadPin === false, "A Gyors KépSend tévesen letöltési PIN-t kér.");
    assert(created.workflow.allowImageGroups === true && created.workflow.allowFileComments === true, "A Gyors KépSend mappa/megjegyzés jogosultsága hiányzik.");
    const uploaderState = await page.evaluate(() => ({
      activeDefault: document.body.innerText.includes("Aktív mappa: Csoport nélkül"),
      smallRecommended: document.body.innerText.toLocaleLowerCase("hu-HU").includes("kicsi") && document.body.innerText.toLocaleLowerCase("hu-HU").includes("ajánlott"),
      cleanupReminder: document.body.innerText.includes("Törlési emlékeztető"),
      camera: document.body.innerText.includes("Kamera"),
      gallery: document.body.innerText.includes("Galéria"),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    }));
    assert(uploaderState.activeDefault && uploaderState.smallRecommended && uploaderState.cleanupReminder && uploaderState.camera && uploaderState.gallery && !uploaderState.overflow, `Hibás Gyors KépSend feltöltő: ${JSON.stringify(uploaderState)}`);
    const groupResult = await createGroupThroughUi(page, "Külső homlokzat");
    await page.screenshot({ path: ".work_drop_v110_quick_image_mobile.png", fullPage: true });
    assert(consoleErrors.length === 0 && pageErrors.length === 0, `Gyors KépSend böngészőhiba: console=${consoleErrors.length}, page=${pageErrors.length}`);
    results.push({ id: "quick-image-send-groups", status: "passed", packageId: created.package.id, preState, uploaderState, group: groupResult.group });
  } finally { await context.close(); }
}

try {
  await createEntitlement();
  browser = await puppeteer.launch({ headless: true, args: browserArgs() });
  await testHome();
  await testStandardSend();
  await testQuickImageSend();
} catch (error) {
  errors.push(error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) });
} finally {
  if (browser) await browser.close();
  await cleanup();
}

const report = {
  ok: errors.length === 0,
  version: "DROP 1.1.0",
  buildId: (await readFile(".next-v110-candidate/BUILD_ID", "utf8")).trim(),
  generatedAt: new Date().toISOString(),
  results,
  errors,
  cleanup: { sendCodeId, sendCodeRevoked: Boolean(sendCodeId), packageIds, packagesDeleted: packageIds.length },
};
await writeFile(".work_drop_v110_candidate_browser.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
