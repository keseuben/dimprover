import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";

const BASE = process.env.TEREP_BROWSER_BASE?.trim() || "https://drop.dev.dimpro.hu";
const SOURCE_FIXTURE = process.env.TEREP_IMAGE_FIXTURE?.trim() || "public/drop-app-icon-v099-192.png";
const work = await mkdtemp(join(tmpdir(), "dimpro-f10-browser-"));
const image1 = join(work, "F10_photo_01.png");
const image2 = join(work, "F10_photo_02.png");
const planPath = join(work, "F10_helyszinrajz.pdf");
const downloadDir = join(work, "downloads");
await copyFile(SOURCE_FIXTURE, image1);
await copyFile(SOURCE_FIXTURE, image2);
await import("node:fs/promises").then(({ mkdir }) => mkdir(downloadDir));

const planDoc = await PDFDocument.create();
const planPage = planDoc.addPage([841.89, 595.28]);
planPage.drawText("DIMPRO F10 BROWSER HELYSZINRAJZ", { x: 40, y: 550, size: 18 });
planPage.drawRectangle({ x: 90, y: 100, width: 650, height: 380, borderWidth: 1 });
planPage.drawLine({ start: { x: 90, y: 100 }, end: { x: 740, y: 480 }, thickness: 0.8 });
await writeFile(planPath, await planDoc.save());

const checks = [];
const pass = (name, ok, detail = "") => {
  assert.ok(ok, `${name}${detail ? `: ${detail}` : ""}`);
  checks.push(name);
  console.log(`PASS ${checks.length}: ${name}`);
};

async function visibleButton(page, text) {
  for (const button of await page.$$("button")) {
    const state = await button.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return { text: (el.textContent || "").replace(/\s+/g, " ").trim(), visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" };
    });
    if (state.visible && state.text === text) return button;
  }
  return null;
}

async function clickPlanPercent(page, xPercent, yPercent) {
  const rect = await page.$eval("[data-gps-plan-overlay]", (el) => {
    const box = el.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height };
  });
  await page.mouse.click(rect.left + rect.width * xPercent / 100, rect.top + rect.height * yPercent / 100);
}

function gps(eastMeters, northMeters) {
  const R = 6_378_137;
  const referenceLatitude = 47.5;
  const referenceLongitude = 21.6;
  return {
    latitude: referenceLatitude + northMeters / R * 180 / Math.PI,
    longitude: referenceLongitude + eastMeters / (R * Math.cos(referenceLatitude * Math.PI / 180)) * 180 / Math.PI,
  };
}
function plan(east, north) {
  return { xPercent: 20 + 2.2 * east + 0.35 * north, yPercent: 70 + 0.25 * east - 1.8 * north };
}

const referenceLocals = [[0, 0], [10, 0], [0, 10], [8, 7]];
const references = referenceLocals.map(([east, north], index) => ({
  id: `f10-r${index + 1}`,
  label: `F10 referencia ${index + 1}`,
  type: index === 1 ? "SETTING_OUT" : index === 3 ? "CUSTOM_REFERENCE" : "CORNER",
  ...gps(east, north),
  accuracyMeters: 4 + index,
  capturedAt: `2026-08-21T19:0${index}:00.000Z`,
  sampleCount: 8,
  samplingDurationMs: 8000,
  note: `F10 R${index + 1}`,
}));
const photoCoordinates = [gps(1, 1), gps(2.92, 1)];

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--host-resolver-rules=MAP drop.dev.dimpro.hu 127.0.0.1", `--unsafely-treat-insecure-origin-as-secure=${BASE}`],
});

try {
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (request.url().includes("/api/dimpro-identity/send/verify")) {
      void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({
        ok: true,
        user: { fullName: "F10 UI Teszt", email: "f10-ui@example.invalid", publicCode: "USR-F10UI", organizationName: "DIMPRO DEV" },
        entitlement: { id: "10101010-1010-4010-8010-101010101010", canUseStandardSend: true, canUseQuickImageSend: true },
        projects: [],
        sendSession: { token: "dss1.f10.test.payload", expiresAt: new Date(Date.now() + 900000).toISOString(), entitlementId: "10101010-1010-4010-8010-101010101010" },
      }) });
      return;
    }
    void request.continue();
  });

  async function authenticate() {
    if (await page.evaluate(() => (document.body.textContent || "").includes("F10 UI Teszt"))) return;
    const code = await page.$('input[placeholder="ABCD-123-456"]');
    assert.ok(code, "Send-kód mező hiányzik");
    await code.type("TEST123456", { delay: 1 });
    const open = await visibleButton(page, "Terepi Gyorsrögzítő megnyitása");
    assert.ok(open, "Terep megnyitás gomb hiányzik");
    await open.click();
    await page.waitForFunction(() => (document.body.textContent || "").includes("F10 UI Teszt"), { timeout: 15000 });
  }

  const response = await page.goto(`${BASE}/terep`, { waitUntil: "networkidle2", timeout: 60000 });
  pass("Terep route HTTP 200", response?.status() === 200, String(response?.status()));
  await authenticate();
  pass("F10.1 verzió 0.4.7-dev", await page.evaluate(() => (document.body.textContent || "").includes("V0.4.7-dev")));

  const newPhoto = await visibleButton(page, "Új terepi kép");
  assert.ok(newPhoto); await newPhoto.click();
  await page.waitForSelector("[data-field-capture-gallery-input]", { timeout: 10000 });
  const galleryInput = await page.$("[data-field-capture-gallery-input]");
  assert.ok(galleryInput);
  await galleryInput.uploadFile(image1, image2);
  await page.waitForFunction(() => document.querySelectorAll("[data-field-capture-item]").length === 2, { timeout: 60000 });
  pass("Két tesztfotó bekerül a helyi Terep sorba", true);

  const sessionId = await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem("dimpro.fieldCapture.activeSession.v1") || "null");
    return session?.id || "";
  });
  assert.ok(sessionId, "Aktív Terep session hiányzik");

  await page.evaluate(async ({ sessionId, photoCoordinates, references }) => {
    localStorage.setItem(`dimpro.fieldCapture.gpsCalibration.v1.${sessionId}`, JSON.stringify(references));
    const request = indexedDB.open("dimpro-field-capture-v1", 1);
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction("captureItems", "readonly");
      const req = tx.objectStore("captureItems").index("sessionId").getAll(sessionId);
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("captureItems", "readwrite");
      const store = tx.objectStore("captureItems");
      rows.sort((a, b) => a.sequence - b.sequence).forEach((row, index) => {
        const coordinate = photoCoordinates[index];
        row.options = { ...row.options, gpsEnabled: true, orientationEnabled: true };
        row.locationStatus = "READY";
        row.orientationStatus = "READY";
        row.location = { enabled: true, ...coordinate, accuracyMeters: 4, capturedAt: "2026-08-21T19:20:00.000Z", source: "browser-geolocation", status: "READY", detail: "F10 controlled GPS" };
        row.orientation = { enabled: true, headingDegrees: index === 0 ? 0 : 90, headingAccuracyDegrees: 5, directionLabel: index === 0 ? "É" : "K", capturedAt: "2026-08-21T19:20:00.000Z", source: "device-orientation", status: "READY", detail: "F10 controlled heading" };
        store.put(row);
      });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { sessionId, photoCoordinates, references });

  await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
  await authenticate();
  await page.waitForFunction(() => document.querySelectorAll("[data-field-capture-item]").length === 2, { timeout: 15000 });
  const saveStep = await (async () => {
    for (const button of await page.$$("nav[aria-label=\"Terep munkafolyamat\"] button")) {
      const state = await button.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return { text: (el.textContent || "").replace(/\s+/g, " ").trim(), visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" };
      });
      if (state.visible && state.text.includes("Mentés és megosztás")) return button;
    }
    return null;
  })();
  assert.ok(saveStep, "Mentés és megosztás step hiányzik");
  await saveStep.click();
  await page.waitForSelector('[data-terep-gps-photo-map="true"]', { timeout: 15000 });
  await page.waitForSelector('[data-gps-plan-calibration="true"]', { timeout: 15000 });
  pass("F10 tervlap-kalibráció panel megjelenik GPS-fotóknál", true);

  const planInput = await page.$("[data-gps-plan-upload]");
  assert.ok(planInput, "PDF tervlap feltöltő hiányzik");
  await planInput.uploadFile(planPath);
  await page.waitForSelector("[data-gps-plan-overlay]", { timeout: 30000 });
  pass("PDF tervlap ténylegesen renderelődik", await page.$eval("[data-gps-plan-stage] canvas", (el) => el.width > 0 && el.height > 0));

  for (let index = 0; index < references.length; index += 1) {
    const button = await page.$(`[data-gps-plan-reference="${references[index].id}"]`);
    assert.ok(button, `R${index + 1} referencia gomb hiányzik`);
    await button.click();
    await page.waitForFunction((id) => {
      const el = document.querySelector(`[data-gps-plan-reference="${id}"]`);
      return Boolean(el && String(el.className).includes("border-indigo-500"));
    }, { timeout: 10000 }, references[index].id);
    await page.waitForSelector("[data-gps-plan-overlay]", { timeout: 30000 });
    const [east, north] = referenceLocals[index];
    const position = plan(east, north);
    await clickPlanPercent(page, position.xPercent, position.yPercent);
    await page.waitForFunction((id) => document.querySelector(`[data-gps-plan-anchor="${id}"]`), { timeout: 30000 }, references[index].id);
  }
  pass("Négy R referencia-pont ugyanazon tervlapon rögzíthető", await page.$$eval("[data-gps-plan-anchor]", (els) => els.length === 4));
  pass("4 referencia-pont után ellenőrzött illesztés látható", await page.evaluate(() => (document.body.textContent || "").includes("Illesztés: jó") && (document.body.textContent || "").includes("Átlagos eltérés")));
  pass("Két GPS-fotópont automatikusan tervre vetül", await page.$$eval("[data-gps-plan-photo]", (els) => els.length === 2));
  pass("Kamerairányok a tervlapi fotópontokon megjelennek", await page.$$eval("[data-gps-plan-photo] line", (els) => els.length >= 2));
  pass("Szaggatott távolságvonal 1,92 m felirattal megjelenik", await page.$('[data-gps-plan-distance="1,92 m"]') !== null);

  const exportButton = await page.$("[data-terep-summary-pdf-export]");
  assert.ok(exportButton, "Összesítő PDF export gomb hiányzik");
  await exportButton.click();
  await page.waitForFunction(() => (document.body.textContent || "").includes("kalibrált tervlap"), { timeout: 30000 });
  pass("Browserből a kalibrált tervlapos összesítő PDF elkészül", true);

  let downloaded = "";
  const deadline = Date.now() + 20000;
  while (!downloaded && Date.now() < deadline) {
    const files = await readdir(downloadDir);
    downloaded = files.find((name) => name.endsWith(".pdf") && !name.endsWith(".crdownload")) || "";
    if (!downloaded) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(downloaded, "A böngészőből letöltött összesítő PDF nem található");
  const parsed = await PDFDocument.load(await readFile(join(downloadDir, downloaded)));
  const landscapePages = parsed.getPages().filter((pdfPage) => pdfPage.getWidth() > pdfPage.getHeight());
  pass("A letöltött összesítő tartalmaz kalibrált landscape tervlapoldalt", landscapePages.length === 1, `landscape=${landscapePages.length}`);
  pass("Mobil UI nem lóg ki", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  pass("Browser pageerror 0", pageErrors.length === 0, pageErrors.join(" | "));
  pass("Browser console error 0", consoleErrors.length === 0, consoleErrors.join(" | "));

  console.log(JSON.stringify({ ok: true, checks: checks.length, names: checks, base: BASE, downloaded, pdfPages: parsed.getPageCount(), landscapePages: landscapePages.length }, null, 2));
} finally {
  await browser.close();
  await rm(work, { recursive: true, force: true });
}
