const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
require("./load-next-env.cjs");

const baseUrl = process.env.DIMPRO_TEST_BASE_URL || "http://127.0.0.1:3000";
const browserBaseUrl = process.env.DIMPRO_BROWSER_BASE_URL || "https://app.dimpro.hu";
const host = process.env.DIMPRO_TEST_HOST || "app.dimpro.hu";
const meetingId = `collab-ui-${Date.now()}`;
const pairingCode = crypto.randomBytes(4).toString("hex").toUpperCase();
const pairingHash = crypto.createHash("sha256").update(pairingCode).digest("hex");
const dataRoot = path.join(process.cwd(), ".dimprover", "data", "meeting-assistant");
const pairingFile = path.join(dataRoot, "pairings", `${pairingHash}.json`);
let organizerToken = "";
let participantToken = "";
let attachmentId = "";
let browser = null;
let passed = 0;

function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  passed += 1;
  console.log(`OK ${String(passed).padStart(2, "0")} ${label}`);
}

function createPairingRecord() {
  fs.mkdirSync(path.dirname(pairingFile), { recursive: true });
  const now = new Date();
  fs.writeFileSync(pairingFile, `${JSON.stringify({
    version: 1,
    codeHash: pairingHash,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
    issuedBy: "collaboration-ui-v017",
    status: "active",
    consumedAt: "",
    meetingId: "",
    sourceMeetingId: meetingId,
    issuedTo: "",
  }, null, 2)}\n`);
}

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { host, ...(options.headers || {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`API ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function seedWorkspace() {
  createPairingRecord();
  const pairing = await api(`${baseUrl}/api/meeting-assistant/pairing`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operation: "consume", meetingId, pairingCode }),
  });
  organizerToken = pairing.organizerAccessToken;
  participantToken = pairing.participantAccessToken;

  const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=", "base64");
  const form = new FormData();
  form.append("files", new Blob([tinyPng], { type: "image/png" }), "kozos_helyszini_kep.png");
  const upload = await api(`${baseUrl}/api/meeting-assistant/upload?meetingId=${encodeURIComponent(meetingId)}&role=participant&actorName=${encodeURIComponent("Résztvevő Anna")}&accessToken=${encodeURIComponent(participantToken)}`, { method: "POST", body: form });
  attachmentId = upload.attachments[0].id;

  const post = (operation, payload) => api(`${baseUrl}/api/meeting-assistant/workspace`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ meetingId, role: "organizer", operation, payload, accessToken: organizerToken }),
  });
  await post("update_attachment", {
    fileId: attachmentId,
    title: "Közös helyszíni kép",
    description: "A képen a közösen egyeztetett helyszíni állapot látható.",
    caption: "A képen a közösen egyeztetett helyszíni állapot látható.",
    includeInAi: true,
    agendaItemId: "design",
    actorName: "Szervező",
  });
  await post("set_attachment_status", { fileId: attachmentId, status: "shared" });
  await post("submit_shared_message", { text: "Közösen megjelenített értekezleti szöveg.", actorName: "Szervező" });
}

async function waitForText(page, text, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await page.evaluate((needle) => (document.body.innerText || "").toLocaleLowerCase("hu-HU").includes(needle.toLocaleLowerCase("hu-HU")), text);
    if (found) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const state = await page.evaluate(() => ({ url: location.href, body: (document.body.innerText || "").slice(0, 2500) }));
  throw new Error(`Text not found: ${text}; ${JSON.stringify(state)}`);
}

async function clickByText(page, text) {
  const clicked = await page.evaluate((needle) => {
    const normalized = needle.toLocaleLowerCase("hu-HU");
    const target = [...document.querySelectorAll("button,a")].find((element) => (element.textContent || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("hu-HU").includes(normalized));
    if (!(target instanceof HTMLElement)) return false;
    target.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Clickable text not found: ${text}`);
}

async function openSection(page, label) {
  await clickByText(page, label);
  await new Promise((resolve) => setTimeout(resolve, 400));
}

function cleanup() {
  if (browser) browser.close().catch(() => undefined);
  for (const file of [pairingFile, path.join(dataRoot, "workspaces", `${meetingId}.json`)]) {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
  for (const dir of [path.join(dataRoot, "snapshots", meetingId), path.join(dataRoot, "uploads", meetingId)]) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
}

(async () => {
  try {
    await seedWorkspace();
    ok(Boolean(organizerToken) && Boolean(participantToken), "organizer and participant UI tokens created");

    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    const failures = [];
    page.on("pageerror", (error) => failures.push(`pageerror:${error.message}`));
    page.on("requestfailed", (request) => failures.push(`requestfailed:${request.url()}:${request.failure()?.errorText || "unknown"}`));

    await page.setViewport({ width: 360, height: 900, deviceScaleFactor: 1 });
    let response = await page.goto(`${browserBaseUrl}/teams/meeting-assistant?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(participantToken)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForText(page, "Képek és mellékletek");
    ok(response?.status() === 200, "narrow participant Teams panel returns HTTP 200");
    ok(await page.evaluate(() => document.querySelector('[data-meeting-panel-role="participant"]') !== null), "participant token renders participant role");
    await openSection(page, "Képek és mellékletek");
    await waitForText(page, "Közös helyszíni kép");
    ok(await page.evaluate(() => (document.body.innerText || "").includes("A képen a közösen egyeztetett")), "shared image caption is visible in narrow panel");
    await clickByText(page, "Közös helyszíni kép");
    await waitForText(page, "Kép alatti közös szöveg");
    ok(Boolean(await page.$('textarea[placeholder*="közösen látni"]')), "participant has collaborative caption editor");
    await clickByText(page, "Közös szerkesztő megnyitása");
    await waitForText(page, "DIMPRO Értekezleti Mellékletszerkesztő");
    ok(await page.evaluate(() => [...document.querySelectorAll('button[title*="csak a szervező"]')].length >= 8), "participant sees disabled drawing toolbar with organizer-only tooltips");
    ok(await page.evaluate(() => [...document.querySelectorAll('button[title*="csak a szervező"]')].every((item) => item.disabled)), "all participant drawing tools are disabled");
    ok(await page.evaluate(() => Boolean([...document.querySelectorAll("button")].find((item) => item.title.includes("Képmetsző")))), "image crop tool is visibly present in compact editor");
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), "compact attachment editor has no page-level horizontal overflow");
    ok(await page.evaluate(() => Boolean([...document.querySelectorAll("button")].find((item) => item.textContent.includes("Közös szöveg mentése")))), "participant editor offers caption-only save");
    await clickByText(page, "Bezárás").catch(() => page.evaluate(() => document.querySelector('button[title="Bezárás"]')?.click()));

    ok(Boolean(await page.$('input[placeholder*="Szöveges javaslat"]')), "participant fixed footer contains text suggestion input");
    ok((await page.$$('a[href="mailto:info@dimpro.hu"]')).length === 1 && (await page.$$('a[href="mailto:admin@dimpro.hu"]')).length === 1, "support and technical contact links are visible");
    const panelShareButtonMetrics = await page.evaluate(() => {
      const button = document.querySelector("button[data-meeting-share-button]");
      if (!(button instanceof HTMLButtonElement)) return null;
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height, disabled: button.disabled };
    });
    ok(Boolean(panelShareButtonMetrics) && Math.abs(panelShareButtonMetrics.width - panelShareButtonMetrics.height) <= 2, "custom Teams share button is square in the side panel");
    ok(panelShareButtonMetrics?.disabled === true, "share button is safely disabled outside real Teams context");

    await page.setViewport({ width: 1360, height: 920, deviceScaleFactor: 1 });
    response = await page.goto(`${browserBaseUrl}/teams/meeting-assistant/stage?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(organizerToken)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForText(page, "Képek és mellékletek");
    ok(response?.status() === 200, "organizer full-stage preview returns HTTP 200");
    ok(await page.evaluate(() => document.querySelector('[data-meeting-panel-role="organizer"]') !== null), "organizer token renders organizer role in browser fallback");
    await openSection(page, "Képek és mellékletek");
    await clickByText(page, "Közös helyszíni kép");
    await clickByText(page, "Megnyitás és rajzolás");
    await waitForText(page, "DIMPRO Értekezleti Mellékletszerkesztő");
    ok(await page.evaluate(() => [...document.querySelectorAll('button[title="Képmetsző"]')].some((item) => !item.disabled)), "organizer image crop tool is enabled");
    ok(await page.evaluate(() => [...document.querySelectorAll('button[title="Szöveg"]')].some((item) => !item.disabled)), "organizer image text tool is enabled");
    await page.evaluate(() => [...document.querySelectorAll('button[title="Szöveg"]')].find((item) => !item.disabled)?.click());
    await page.waitForSelector('input[placeholder="Ráírandó rövid szöveg"]', { timeout: 30000 });
    ok(Boolean(await page.$('input[placeholder="Ráírandó rövid szöveg"]')), "organizer can enter text written directly onto image");
    await page.evaluate(() => document.querySelector('button[title="Bezárás"]')?.click());

    ok(failures.length === 0, "browser UI has no runtime or failed-request errors");

    console.log(`Meeting collaboration UI v0.1.7 completed successfully: ${passed} checks.`);
    await browser.close();
    browser = null;
  } finally {
    cleanup();
  }
})().catch((error) => {
  cleanup();
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
