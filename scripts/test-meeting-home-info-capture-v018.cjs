const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
require("./load-next-env.cjs");

const base = process.env.DIMPRO_TEST_BASE_URL || "http://127.0.0.1:3000";
const browserBase = process.env.DIMPRO_BROWSER_BASE_URL || "https://app.dimpro.hu";
const host = process.env.DIMPRO_TEST_HOST || "app.dimpro.hu";
const secret = String(process.env.MEETING_ASSISTANT_SIGNING_SECRET || "");
const stamp = Date.now();
const meetingId = `help-capture-${stamp}`;
const projectId = `help-project-${stamp}`;
const projectCode = `HELP-${String(stamp).slice(-6)}`;
const dataRoot = path.join(process.cwd(), ".dimprover", "data", "meeting-assistant");
let browser = null;
let passed = 0;

function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  passed += 1;
  console.log(`OK ${String(passed).padStart(2, "0")} ${label}`);
}

function tokenFor(tokenMeetingId, issuedTo) {
  if (secret.length < 32) throw new Error("MEETING_ASSISTANT_SIGNING_SECRET missing");
  const now = Math.floor(Date.now() / 1000);
  const payload = { v: 1, meetingId: tokenMeetingId, issuedTo, iat: now, exp: now + 3600, grantId: "", subjectName: "Teszt Szervező", subjectEmail: "" };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { host, ...(options.headers || {}) } });
  const contentType = String(response.headers.get("content-type") || "");
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  return { response, body };
}

async function postWorkspace(token, operation, payload = {}) {
  return api(`${base}/api/meeting-assistant/workspace`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ meetingId, accessToken: token, role: "organizer", operation, payload }),
  });
}

async function textExists(page, text) {
  return page.evaluate((needle) => (document.body.innerText || "").toLocaleLowerCase("hu-HU").includes(needle.toLocaleLowerCase("hu-HU")), text);
}

async function waitForText(page, text, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await textExists(page, text)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const state = await page.evaluate(() => ({ url: location.href, body: (document.body.innerText || "").slice(0, 2200) }));
  throw new Error(`Text not found: ${text}; ${JSON.stringify(state)}`);
}

async function clickByText(page, text) {
  const clicked = await page.evaluate((needle) => {
    const normalized = needle.toLocaleLowerCase("hu-HU");
    const element = [...document.querySelectorAll("button,a")].find((item) => (item.textContent || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("hu-HU").includes(normalized));
    if (!(element instanceof HTMLElement)) return false;
    element.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Clickable text not found: ${text}`);
}

function cleanup() {
  if (browser) browser.close().catch(() => undefined);
  const files = [
    path.join(dataRoot, "workspaces", `${meetingId}.json`),
    path.join(dataRoot, "project-profiles", `${projectId}.json`),
  ];
  for (const file of files) if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  for (const dir of [path.join(dataRoot, "snapshots", meetingId), path.join(dataRoot, "uploads", meetingId)]) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
}

(async () => {
  try {
    const homeToken = tokenFor("meeting-assistant-home", "dimpro-web-preview");
    const organizerToken = tokenFor(meetingId, "teams-organizer-editor");
    const participantToken = tokenFor(meetingId, "teams-participant-readonly");

    let result = await api(`${base}/api/meeting-assistant/project-profiles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        meetingId: "meeting-assistant-home",
        accessToken: homeToken,
        action: "upsert_project",
        project: { projectId, code: projectCode, name: "Új projekt UI teszt", location: "Budapest", clientName: "Teszt Megrendelő", projectManager: "Teszt Projektvezető", status: "active", defaultMeetingType: "Tervezői egyeztetés" },
      }),
    });
    ok(result.response.status === 200 && result.body.profile?.projectId === projectId, "new project profile can be created from meeting home workflow");

    result = await postWorkspace(organizerToken, "update_meta", {
      title: "Új projekten belüli értekezlet",
      projectId,
      projectCode,
      projectName: "Új projekt UI teszt",
      meetingLocation: "Microsoft Teams",
      meetingType: "Tervezői egyeztetés",
      meetingTypeCode: "TERV",
      documentKind: "minutes",
      documentLabel: "Értekezleti jegyzőkönyv",
      chairpersonName: "Teszt Projektvezető",
      minuteTakerName: "Teszt Szerkesztő",
      organizerName: "Teszt Projektvezető",
      scheduledStart: new Date(Date.now() + 3600000).toISOString(),
      reserveNumber: true,
    });
    ok(result.response.status === 200 && result.body.workspace?.projectId === projectId, "new meeting can be created inside selected project");
    ok(result.body.workspace?.meetingTypeCode === "TERV" && result.body.workspace?.documentKind === "minutes", "meeting type and document form are saved");

    result = await postWorkspace(organizerToken, "apply_agenda_template", { templateKey: "design_coordination" });
    ok(result.response.status === 200 && result.body.workspace?.agendaTemplateKey === "design_coordination" && result.body.workspace?.agenda?.length > 0, "selected agenda template is applied to new meeting");

    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 920, deviceScaleFactor: 1 });
    const failures = [];
    page.on("pageerror", (error) => failures.push(`pageerror:${error.message}`));
    page.on("requestfailed", (request) => failures.push(`requestfailed:${request.url()}:${request.failure()?.errorText || "unknown"}`));

    let response = await page.goto(`${browserBase}/teams/meeting-assistant?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(organizerToken)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForText(page, "Új projekt UI teszt");
    ok(response?.status() === 200, "organizer side panel returns HTTP 200");

    const infoButton = await page.waitForSelector('button[aria-label="Információ és útmutató"]', { timeout: 15000 });
    ok(Boolean(infoButton), "information button is present at the end of top toolbar");
    await infoButton.click();
    await waitForText(page, "útmutató és információ");
    ok(await textExists(page, "Felhasználói útmutató") && await textExists(page, "Szerkesztői útmutató") && await textExists(page, "Kapcsolat és információ"), "help workspace contains all three requested tabs");
    const helpFont = await page.evaluate(() => {
      const heading = [...document.querySelectorAll("h2")].find((item) => item.textContent?.includes("útmutató és információ"));
      return heading ? Number.parseFloat(getComputedStyle(heading).fontSize) : 0;
    });
    ok(helpFont >= 20, "help workspace uses a large readable heading size");
    await clickByText(page, "Résztvevői feltöltés jóváhagyása");
    await waitForText(page, "Ki használhatja?");
    ok(await textExists(page, "Mikor használd?") && await textExists(page, "Mi történik utána?") && await textExists(page, "Használati lépések"), "guide is split into detailed button-by-button instructions");

    await clickByText(page, "Kapcsolat és információ");
    await waitForText(page, "info@dimpro.hu");
    const contactLinks = await page.evaluate(() => [...document.querySelectorAll('a[href^="mailto:"]')].map((item) => item.getAttribute("href") || ""));
    ok(contactLinks.length === 2, "contact tab contains exactly the two requested email buttons");
    const infoHref = contactLinks.find((href) => href.startsWith("mailto:info@dimpro.hu")) || "";
    const adminHref = contactLinks.find((href) => href.startsWith("mailto:admin@dimpro.hu")) || "";
    ok(decodeURIComponent(infoHref).includes("DIMPRO Értekezleti Kísérő – használati kérdés vagy funkciójavaslat") && decodeURIComponent(infoHref).includes(meetingId.slice(0, 32)), "info email subject is prefilled with product name and meeting ID");
    ok(decodeURIComponent(adminHref).includes("DIMPRO Értekezleti Kísérő – technikai hiba, jogosultság vagy párosítás") && decodeURIComponent(adminHref).includes(meetingId.slice(0, 32)), "admin email subject is prefilled with product name and meeting ID");
    await page.evaluate(() => {
      const modal = document.querySelector('[aria-label="DIMPRO Értekezleti Kísérő útmutató"]');
      const close = modal?.querySelector('button[title="Bezárás"]');
      if (close instanceof HTMLElement) close.click();
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    ok((await page.$$('a[href^="mailto:"]')).length === 0, "email information was removed from the permanent panel footer");

    const dockMetrics = await page.evaluate(() => {
      const textButton = document.querySelector("button[data-meeting-text-button]");
      const shareButton = document.querySelector("button[data-meeting-share-button]");
      if (!(textButton instanceof HTMLButtonElement) || !(shareButton instanceof HTMLButtonElement)) return null;
      const a = textButton.getBoundingClientRect();
      const b = shareButton.getBoundingClientRect();
      return { text: { x: a.x, y: a.y, width: a.width, height: a.height }, share: { x: b.x, y: b.y, width: b.width, height: b.height } };
    });
    ok(Boolean(dockMetrics) && Math.abs(dockMetrics.text.y - dockMetrics.share.y) <= 1 && dockMetrics.text.height <= 40 && dockMetrics.share.height <= 40, "status, text and share controls use one minimal fixed bottom row");
    await page.click("button[data-meeting-text-button]");
    await waitForText(page, "Szöveges gyorsrögzítés");
    ok(Boolean(await page.$('textarea[placeholder*="szöveges bejegyzést"]')), "text input opens in a separate popover card");
    ok(await textExists(page, "Bejegyzés rögzítése az értekezletbe"), "organizer text popover has an explicit action button");
    await page.click('button[title="Bezárás"]');

    await clickByText(page, "Képek és mellékletek");
    await waitForText(page, "Képernyő vagy alkalmazásablak rögzítése és szerkesztése");
    const popupPromise = new Promise((resolve) => browser.once("targetcreated", async (target) => resolve(await target.page())));
    await clickByText(page, "Képernyő vagy alkalmazásablak rögzítése és szerkesztése");
    const popup = await Promise.race([popupPromise, new Promise((_, reject) => setTimeout(() => reject(new Error("Capture popup did not open")), 15000))]);
    await popup.waitForSelector("body", { timeout: 30000 });
    await waitForText(popup, "Képernyőrögzítő és mellékletszerkesztő");
    ok(popup.url().includes("/teams/meeting-assistant/capture"), "capture button opens the dedicated large capture workspace");
    ok(await textExists(popup, "Képernyő vagy alkalmazásablak kiválasztása"), "capture workspace requires a second explicit user click before permission request");
    await popup.close();

    const stagePage = await browser.newPage();
    await stagePage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    response = await stagePage.goto(`${browserBase}/teams/meeting-assistant/stage?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(participantToken)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForText(stagePage, "Megosztott DIMPRO tartalom");
    ok(response?.status() === 200, "shared meeting stage returns HTTP 200");
    const stageOverlay = await stagePage.evaluate(() => {
      const overlay = document.querySelector("[data-meeting-stage-sharing-overlay]");
      const stopButton = document.querySelector("button[data-stop-stage-sharing]");
      if (!(overlay instanceof HTMLElement) || !(stopButton instanceof HTMLButtonElement)) return null;
      const overlayStyle = getComputedStyle(overlay);
      const buttonRect = stopButton.getBoundingClientRect();
      return {
        borderTopWidth: Number.parseFloat(overlayStyle.borderTopWidth),
        borderTopColor: overlayStyle.borderTopColor,
        buttonRight: window.innerWidth - buttonRect.right,
        buttonTop: buttonRect.top,
        buttonWidth: buttonRect.width,
        buttonHeight: buttonRect.height,
        label: overlay.textContent || "",
        ariaLabel: stopButton.getAttribute("aria-label") || "",
      };
    });
    ok(Boolean(stageOverlay) && stageOverlay.borderTopWidth >= 4 && stageOverlay.borderTopColor.includes("220, 38, 38"), "shared stage has a clearly visible red border");
    ok(Boolean(stageOverlay) && stageOverlay.label.includes("Megosztott DIMPRO tartalom"), "shared stage displays the centered red sharing label");
    ok(Boolean(stageOverlay) && stageOverlay.ariaLabel === "Megosztás leállítása" && stageOverlay.buttonRight <= 16 && stageOverlay.buttonTop <= 16, "shared stage has a red stop-sharing X in the top-right corner");
    ok(Boolean(stageOverlay) && Math.abs(stageOverlay.buttonWidth - stageOverlay.buttonHeight) <= 1 && stageOverlay.buttonWidth >= 40, "stop-sharing X button is square and easy to click");
    await stagePage.close();

    const participantCapture = await browser.newPage();
    response = await participantCapture.goto(`${browserBase}/teams/meeting-assistant/capture?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(participantToken)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForText(participantCapture, "csak a szervező számára érhető el");
    ok(response?.status() === 200 && await textExists(participantCapture, "csak a szervező számára érhető el"), "capture workspace is server-side protected against participant tokens");
    await participantCapture.close();

    const participantPage = await browser.newPage();
    await participantPage.setViewport({ width: 390, height: 920, deviceScaleFactor: 1 });
    await participantPage.goto(`${browserBase}/teams/meeting-assistant?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(participantToken)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForText(participantPage, "Új projekt UI teszt");
    await participantPage.click("button[data-meeting-text-button]");
    await waitForText(participantPage, "Küldés a szervezőnek vagy szerkesztőnek");
    ok(await textExists(participantPage, "Küldés a szervezőnek vagy szerkesztőnek"), "participant popover uses the requested send-to-organizer/editor button label");
    ok((await participantPage.$$('button:has(svg)')).length > 0, "participant interface remains interactive after footer redesign");
    await participantPage.close();

    ok(failures.length === 0, "browser test has no runtime or failed-request errors");
    console.log(`Meeting home/info/capture v0.1.8 completed successfully: ${passed} checks.`);
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
