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
const meetingId = `live-control-${stamp}`;
const dataRoot = path.join(process.cwd(), ".dimprover", "data", "meeting-assistant");
let passed = 0;
let browser = null;

function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  passed += 1;
  console.log(`OK ${String(passed).padStart(2, "0")} ${label}`);
}

function tokenFor(issuedTo, grantId = "") {
  if (secret.length < 32) throw new Error("MEETING_ASSISTANT_SIGNING_SECRET missing");
  const now = Math.floor(Date.now() / 1000);
  const payload = { v: 1, meetingId, issuedTo, iat: now, exp: now + 7200, grantId, subjectName: issuedTo === "teams-organizer-editor" ? "Teszt Szervező" : "Teszt Résztvevő", subjectEmail: "" };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { host, ...(options.headers || {}) } });
  const type = String(response.headers.get("content-type") || "");
  const body = type.includes("application/json") ? await response.json() : await response.text();
  return { response, body };
}

async function workspacePost(token, role, operation, payload = {}) {
  return request(`${base}/api/meeting-assistant/workspace`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ meetingId, accessToken: token, role, operation, payload }) });
}

async function controlPost(token, operation, payload = {}) {
  return request(`${base}/api/meeting-assistant/presentation-control`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ meetingId, accessToken: token, presentationToken: token, operation, ...payload }) });
}

function cleanup() {
  if (browser) browser.close().catch(() => undefined);
  for (const file of [path.join(dataRoot, "workspaces", `${meetingId}.json`), path.join(dataRoot, "presentation-pairings", `${meetingId}.json`)]) if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  for (const dir of [path.join(dataRoot, "uploads", meetingId), path.join(dataRoot, "snapshots", meetingId)]) if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

async function waitForText(page, text, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await page.evaluate((needle) => (document.body.innerText || "").toLocaleLowerCase("hu-HU").includes(needle.toLocaleLowerCase("hu-HU")), text)) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Text not found: ${text}`);
}

async function clickTitle(page, title) {
  const found = await page.evaluate((value) => {
    const element = document.querySelector(`[title="${CSS.escape(value)}"]`);
    if (!(element instanceof HTMLElement)) return false;
    element.click();
    return true;
  }, title);
  if (!found) throw new Error(`Title not found: ${title}`);
}

(async () => {
  try {
    const organizerToken = tokenFor("teams-organizer-editor");
    const participantToken = tokenFor("teams-participant-readonly");
    let result = await workspacePost(organizerToken, "organizer", "update_meta", { title: "Élő vezérlés teszt", projectId: "live-project", projectCode: "LIVE", projectName: "Élő projekt", organizerName: "Teszt Szervező", chairpersonName: "Teszt Szervező", minuteTakerName: "Teszt Szerkesztő", meetingType: "Műszaki egyeztetés", meetingTypeCode: "MŰSZ", documentKind: "reminder", documentLabel: "Egyeztetési emlékeztető", reserveNumber: true });
    ok(result.response.status === 200 && result.body.workspace?.title === "Élő vezérlés teszt", "test meeting created");
    result = await workspacePost(organizerToken, "organizer", "apply_agenda_template", { templateKey: "quick_general" });
    const agendaId = result.body.workspace?.agenda?.[0]?.id;
    ok(result.response.status === 200 && Boolean(agendaId), "agenda created");

    result = await workspacePost(participantToken, "participant", "submit_shared_message", { text: "Név nélküli próba", actorName: "Résztvevő", agendaItemId: agendaId, includeInDocument: true });
    ok(result.response.status === 400, "generic participant name is rejected");
    result = await workspacePost(participantToken, "participant", "submit_shared_message", { text: "A módosított gépészeti terv péntekre elkészül.", actorName: "Nagy István", actorEmail: "nagy.istvan@example.com", agendaItemId: agendaId, includeInDocument: true });
    ok(result.response.status === 200, "named agenda-linked text entry accepted");
    const organizerWorkspace = await request(`${base}/api/meeting-assistant/workspace?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(organizerToken)}`, { headers: { host } });
    const messageId = organizerWorkspace.body.workspace?.sharedMessages?.find((item) => item.text === "A módosított gépészeti terv péntekre elkészül.")?.id;
    ok(Boolean(messageId), "organizer receives pending text entry with internal identifier");
    result = await workspacePost(organizerToken, "organizer", "review_shared_message", { messageId, status: "shared", agendaItemId: agendaId, includeInDocument: true });
    ok(result.response.status === 200 && result.body.workspace?.sharedMessages?.find((item) => item.id === messageId)?.status === "shared", "organizer approves text entry");
    result = await workspacePost(organizerToken, "organizer", "update_shared_message", { messageId, submittedBy: "Nagy István", text: "A módosított gépészeti terv péntekre elkészül.", agendaItemId: agendaId, includeInDocument: false });
    ok(result.response.status === 200 && result.body.workspace?.sharedMessages?.find((item) => item.id === messageId)?.includeInDocument === false, "document inclusion checkbox can exclude entry");
    await workspacePost(organizerToken, "organizer", "update_shared_message", { messageId, submittedBy: "Nagy István", text: "A módosított gépészeti terv péntekre elkészül.", agendaItemId: agendaId, includeInDocument: true });

    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2l3sAAAAASUVORK5CYII=", "base64");
    const uploadForm = new FormData();
    uploadForm.append("files", new Blob([png], { type: "image/png" }), "teszt-kep.png");
    result = await request(`${base}/api/meeting-assistant/upload?meetingId=${encodeURIComponent(meetingId)}&role=participant&actorName=${encodeURIComponent("Nagy István")}&accessToken=${encodeURIComponent(participantToken)}`, { method: "POST", body: uploadForm });
    const attachmentId = result.body.attachments?.[0]?.id;
    ok(result.response.status === 200 && Boolean(attachmentId), "participant photo uploaded");
    await workspacePost(organizerToken, "organizer", "update_attachment", { fileId: attachmentId, title: "Gépészeti tervrészlet", description: "A módosítandó áttörés helye.", caption: "A módosítandó áttörés helye.", agendaItemId: agendaId, includeInAi: true, actorName: "Teszt Szervező" });
    result = await workspacePost(organizerToken, "organizer", "set_attachment_status", { fileId: attachmentId, status: "shared" });
    ok(result.response.status === 200, "photo approved and shared");

    result = await controlPost(organizerToken, "create", { actorName: "Teszt Szervező", recipientName: "Kiss Anna", recipientEmail: "" });
    const code = result.body.pairing?.code;
    ok(result.response.status === 200 && /^\d{6}$/.test(code || ""), "six digit presentation code created");
    result = await controlPost(participantToken, "consume", { code, controllerName: "Kiss Anna", controllerEmail: "" });
    const presentationToken = result.body.presentationToken;
    ok(result.response.status === 200 && Boolean(presentationToken), "presentation-only token activated");
    result = await controlPost(presentationToken, "update_state", { actorName: "Kiss Anna", enabled: true, mode: "follow", activeSectionId: "meeting-text-entries", activeAgendaItemId: agendaId, activeAttachmentId: attachmentId, scrollTop: 210 });
    ok(result.response.status === 200 && result.body.presentation?.controllerName === "Kiss Anna", "presentation controller updates shared view state");
    result = await request(`${base}/api/meeting-assistant/presentation-control?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(participantToken)}`, { headers: { host } });
    ok(result.response.status === 200 && result.body.presentationControl?.grantId === "" && result.body.presentationControl?.controllerEmail === "", "participant presentation state hides secret grant data");
    result = await controlPost(organizerToken, "update_state", { actorName: "Teszt Szervező", enabled: true, mode: "follow", activeSectionId: "meeting-agenda" });
    ok(result.response.status === 409, "organizer navigation cannot accidentally overwrite delegated control");
    result = await controlPost(organizerToken, "reclaim", { actorName: "Teszt Szervező" });
    ok(result.response.status === 200 && result.body.presentation?.controllerRole === "organizer", "organizer instantly reclaims control");
    result = await controlPost(presentationToken, "update_state", { actorName: "Kiss Anna", enabled: true, mode: "follow", activeSectionId: "meeting-agenda" });
    ok([401, 403, 409].includes(result.response.status), "revoked presentation token cannot control view");
    result = await workspacePost(presentationToken, "participant", "update_notes", { sharedNote: "tiltott" });
    ok(result.response.status === 403, "presentation token grants no document editing rights");

    const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<v Kovács Péter>Megnyitom az értekezletet.\n\n00:00:05.000 --> 00:00:09.000\n<v Nagy István>A terv péntekre elkészül.`;
    const transcriptForm = new FormData();
    transcriptForm.set("meetingId", meetingId);
    transcriptForm.set("accessToken", organizerToken);
    transcriptForm.set("mode", "append");
    transcriptForm.set("file", new Blob([vtt], { type: "text/vtt" }), "teams-atirat.vtt");
    result = await request(`${base}/api/meeting-assistant/transcript-import`, { method: "POST", body: transcriptForm });
    ok(result.response.status === 200 && result.body.importedNow === 2 && result.body.speakerCount === 2, "manual VTT transcript import preserves speakers");

    result = await request(`${base}/api/meeting-assistant/attendance`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ meetingId, accessToken: organizerToken, operation: "configure", organizerUserId: "00000000-0000-0000-0000-000000000001", graphOnlineMeetingId: "test-online-meeting", graphCalendarEventId: "test-calendar-event" }) });
    ok(result.response.status === 200 && result.body.integration?.graphCalendarEventId === "test-calendar-event", "Teams attendance connection can be configured");

    result = await workspacePost(organizerToken, "organizer", "safe_close_session", { actorName: "Teszt Szervező", autoTranscriptWatch: true });
    ok(result.response.status === 200 && result.body.workspace?.sessionState?.autoTranscriptWatch === true && result.body.workspace?.presentation?.enabled === false, "safe close saves state and enables transcript watch");

    // Re-enable presentation for browser stage tests.
    result = await controlPost(organizerToken, "update_state", { actorName: "Teszt Szervező", enabled: true, mode: "follow", activeSectionId: "meeting-text-entries", activeAgendaItemId: agendaId, activeAttachmentId: attachmentId, scrollTop: 0 });
    ok(result.response.status === 200, "organizer starts live follow for browser test");

    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const panel = await browser.newPage();
    await panel.setViewport({ width: 390, height: 920, deviceScaleFactor: 1 });
    await panel.goto(`${browserBase}/teams/meeting-assistant?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(organizerToken)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForText(panel, "Élő projekt");
    ok((await panel.$$('button[title="Teljes képernyős élő dokumentum"]')).length >= 1, "bottom board contains fullscreen live document button");
    ok((await panel.$$('button[title*="Élő követés"]')).length >= 1, "bottom board contains live follow button");
    ok((await panel.$$('button[title="Közös nézet vezérlőkód és vezérléskezelés"]')).length === 1, "bottom board contains presentation control button");
    ok((await panel.$$('button[title="Minden mentése és munkamenet biztonságos bezárása"]')).length === 1, "bottom board contains safe close button");
    await panel.click("button[data-meeting-text-button]");
    await waitForText(panel, "Szöveges gyorsrögzítés");
    ok(Boolean(await panel.$('input[placeholder="Bejegyző neve *"]')) && Boolean(await panel.$('select')), "quick entry popover contains required name and optional agenda selector");
    await panel.click('button[title="Bezárás"]');
    await clickTitle(panel, "Szöveges bejegyzések – megnyitás a panel tetején");
    await waitForText(panel, "A módosított gépészeti terv péntekre elkészül.");
    ok(await panel.evaluate(() => Boolean(document.querySelector('#meeting-text-entries input[type="checkbox"]'))), "text entries module provides inclusion checkbox");
    await clickTitle(panel, "Teljes képernyős élő dokumentum");
    await waitForText(panel, "Élő, összefüggő értekezleti dokumentum");
    ok(await panel.evaluate(() => (document.body.innerText || "").includes("A módosított gépészeti terv péntekre elkészül.") && (document.body.innerText || "").includes("Gépészeti tervrészlet")), "fullscreen live document includes approved text and photo metadata");
    await panel.click('button[title="Teljes képernyős dokumentum bezárása"]');

    const stage = await browser.newPage();
    await stage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await stage.goto(`${browserBase}/teams/meeting-assistant/stage?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(participantToken)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForText(stage, "Megosztott DIMPRO tartalom");
    await waitForText(stage, "A módosított gépészeti terv péntekre elkészül.");
    ok(await stage.evaluate(() => Boolean(document.querySelector('[data-meeting-stage-sharing-overlay]'))), "stage keeps red shared-content frame");
    ok(await stage.evaluate(() => Boolean(document.querySelector('#meeting-text-entries'))), "stage follows active text entry module");
    ok(await stage.evaluate(() => Boolean(document.querySelector('button[title="Élő követés szüneteltetése saját olvasáshoz"]'))), "stage offers own-reading pause control");

    result = await controlPost(organizerToken, "update_state", { actorName: "Teszt Szervező", enabled: true, mode: "document", activeSectionId: "meeting-live-minutes", activeAgendaItemId: agendaId });
    ok(result.response.status === 200, "presentation switched to live document mode");
    await stage.waitForSelector('[data-live-document-view]', { timeout: 15000 });
    ok(await stage.evaluate(() => Boolean(document.querySelector('[data-live-document-view]'))), "stage dynamically switches to fullscreen live document");
    ok(await stage.evaluate(() => (document.body.innerText || "").includes("Gépészeti tervrészlet")), "stage live document includes shared photo");

    console.log(`Meeting live control v0.1.9 completed successfully: ${passed} checks.`);
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
