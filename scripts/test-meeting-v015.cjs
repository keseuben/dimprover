const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const stamp = Date.now();
const meetingId = `v015-smoke-${stamp}`;
const projectId = `v015-project-${stamp}`;
const projectCode = `V015-${String(stamp).slice(-6)}`;
const pairingCode = crypto.randomBytes(4).toString("hex").toUpperCase();
const pairingHash = crypto.createHash("sha256").update(pairingCode).digest("hex");
const dataRoot = path.join(process.cwd(), ".dimprover", "data", "meeting-assistant");
const pairingDir = path.join(dataRoot, "pairings");
const pairingFile = path.join(pairingDir, `${pairingHash}.json`);
const base = "http://127.0.0.1:3000";
let organizerToken = "";
let participantToken = "";
let agendaId = "";
let topicId = "";

function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  console.log(`OK ${label}`);
}

function createPairingRecord() {
  fs.mkdirSync(pairingDir, { recursive: true });
  const now = new Date();
  fs.writeFileSync(pairingFile, `${JSON.stringify({
    version: 1,
    codeHash: pairingHash,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
    issuedBy: "automated-v015-smoke",
    status: "active",
    consumedAt: "",
    meetingId: "",
    issuedTo: "",
  }, null, 2)}\n`);
}

async function consumePairing() {
  const response = await fetch(`${base}/api/meeting-assistant/pairing`, {
    method: "POST",
    headers: { host: "app.dimpro.hu", "content-type": "application/json" },
    body: JSON.stringify({ operation: "consume", meetingId, pairingCode }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`PAIR ${response.status} ${JSON.stringify(body)}`);
  organizerToken = body.organizerAccessToken || "";
  participantToken = body.participantAccessToken || "";
}

async function getWorkspace(token) {
  const response = await fetch(`${base}/api/meeting-assistant/workspace?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(token)}`, { headers: { host: "app.dimpro.hu" } });
  return { status: response.status, body: await response.json() };
}

async function postWorkspace(token, role, operation, payload = {}) {
  const response = await fetch(`${base}/api/meeting-assistant/workspace`, {
    method: "POST",
    headers: { host: "app.dimpro.hu", "content-type": "application/json" },
    body: JSON.stringify({ meetingId, role, operation, payload, accessToken: token }),
  });
  return { status: response.status, body: await response.json() };
}

async function projectApi(action, body = {}) {
  const response = await fetch(`${base}/api/meeting-assistant/project-profiles`, {
    method: "POST",
    headers: { host: "app.dimpro.hu", "content-type": "application/json" },
    body: JSON.stringify({ meetingId, accessToken: organizerToken, action, ...body }),
  });
  return { status: response.status, body: await response.json() };
}

function cleanup() {
  const paths = [
    path.join(dataRoot, "workspaces", `${meetingId}.json`),
    pairingFile,
    path.join(dataRoot, "project-profiles", `${projectId}.json`),
  ];
  for (const file of paths) if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  for (const dir of [path.join(dataRoot, "snapshots", meetingId), path.join(dataRoot, "uploads", meetingId)]) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
  const counterDir = path.join(dataRoot, "counters");
  if (fs.existsSync(counterDir)) {
    for (const name of fs.readdirSync(counterDir)) {
      if (name.startsWith(projectCode)) fs.rmSync(path.join(counterDir, name), { force: true });
    }
  }
}

(async () => {
  try {
    createPairingRecord();
    await consumePairing();
    ok(Boolean(organizerToken) && Boolean(participantToken) && organizerToken !== participantToken, "01 separate organizer and participant tokens");

    let result = await getWorkspace(organizerToken);
    ok(result.status === 200 && result.body.workspace.version === 8 && result.body.workspace.documentKind === "reminder", "02 default v8 workspace and reminder document kind");

    result = await projectApi("upsert_project", { project: { projectId, code: projectCode, name: "V015 tesztprojekt", location: "Teszt helyszín", clientName: "Teszt Megrendelő", projectManager: "Teszt Projektvezető" } });
    ok(result.status === 200 && result.body.profile.projectId === projectId, "03 project profile created");

    result = await projectApi("upsert_member", { projectId, member: { name: "Projekt Anna", organization: "Teszt Kft.", functionTitle: "Műszaki ellenőr", email: "anna@example.invalid", phone: "+36 1 000 0000", defaultInvite: true, active: true } });
    const memberId = result.body.profile.members[0].id;
    ok(result.status === 200 && Boolean(memberId), "04 permanent project member created");

    result = await postWorkspace(organizerToken, "organizer", "update_meta", {
      title: "V015 általános egyeztetés",
      projectId,
      projectCode,
      projectName: "V015 tesztprojekt",
      meetingType: "Általános egyeztetés",
      meetingTypeCode: "ÁLT",
      documentKind: "reminder",
      meetingLocation: "Teams és tárgyaló",
      chairpersonName: "Teszt Értekezletvezető",
      minuteTakerName: "Teszt Jegyzőkönyvvezető",
      approverName: "Teszt Jóváhagyó",
      scheduledStart: new Date().toISOString(),
      reserveNumber: true,
    });
    ok(result.status === 200 && result.body.workspace.minuteNumber.includes(`/${"ÁLT"}/`) && result.body.workspace.documentLabel === "Egyeztetési emlékeztető", "05 ALT category numbering and separate document form");

    result = await postWorkspace(organizerToken, "organizer", "import_project_members", { projectId, memberIds: [memberId] });
    ok(result.status === 200 && result.body.workspace.attendees.some((item) => item.projectMemberId === memberId), "06 project member imported into attendance snapshot");

    result = await postWorkspace(organizerToken, "organizer", "apply_agenda_template", { templateKey: "quick_general" });
    agendaId = result.body.workspace.agenda[0].id;
    ok(result.status === 200 && result.body.workspace.agendaTemplateKey === "quick_general" && result.body.workspace.agenda.length === 1 && result.body.workspace.agenda[0].isJoker, "07 quick general template creates one Joker agenda item");

    result = await postWorkspace(organizerToken, "organizer", "upsert_topic_block", {
      agendaItemId: agendaId,
      title: "Homlokzati színminta",
      background: "A korábbi minta túl sötét volt.",
      discussion: "A résztvevők világosabb árnyalatot egyeztettek.",
      decision: "Új mintafelület készül.",
      openQuestions: "A pontos színkód még jóváhagyásra vár.",
      clientOpinion: "A megrendelő a világosabb árnyalatot támogatja.",
      owner: "Kivitelező",
      dueDate: "2026-07-31",
      privateNotes: "Belső tesztmegjegyzés",
      shared: true,
    });
    topicId = result.body.workspace.agenda[0].topicBlocks[0].id;
    ok(result.status === 200 && result.body.workspace.agenda[0].topicBlocks[0].clientOpinion.includes("megrendelő"), "08 structured Joker topic block saved");

    result = await postWorkspace(organizerToken, "organizer", "add_action_item", { agendaItemId: agendaId, topicBlockId: topicId, type: "task", title: "Új mintafelület készítése", owner: "Kivitelező", dueDate: "2026-07-31", shared: true });
    ok(result.status === 200 && result.body.workspace.actionItems.at(-1).topicBlockId === topicId, "09 task linked to Joker topic");

    const nextStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    result = await postWorkspace(organizerToken, "organizer", "update_next_meeting", { status: "planned", startsAt: nextStart, location: "Microsoft Teams", note: "Várható időpont" });
    ok(result.status === 200 && result.body.workspace.nextMeeting.startsAt === nextStart, "10 next meeting date saved");

    result = await postWorkspace(organizerToken, "organizer", "update_notes", { privateNotes: "Titkos szervezői jegyzet", sharedNote: "Megosztott értekezleti jegyzet" });
    ok(result.status === 200 && result.body.workspace.privateNotes.includes("Titkos"), "11 private and shared notes saved");

    result = await postWorkspace(organizerToken, "organizer", "publish_summary", {
      source: "rules",
      body: "Az értekezleten a homlokzati színmintáról egyeztettek. Új mintafelület készül.",
      title: "V015 értekezleti összefoglaló",
      closingTitle: "Köszönjük a közös munkát!",
      closingMessage: "Köszönöm a közös munkát! A feladatokat és döntéseket az összefoglaló tartalmazza.",
      emailNotice: "A szervező az értekezleti emlékeztetőt hamarosan e-mailben is megküldi a résztvevőknek.",
      emailDocumentType: "reminder",
      emailDeliveryMode: "organizer",
      createdBy: "Teszt Jegyzőkönyvvezető",
    });
    ok(result.status === 200 && result.body.workspace.publishedSummaries.length === 1 && result.body.workspace.activePublishedSummaryId, "12 participant summary published");

    result = await postWorkspace(organizerToken, "organizer", "close_meeting", { mode: "publish", closedBy: "Teszt Jegyzőkönyvvezető", endedAt: new Date().toISOString() });
    ok(result.status === 200 && result.body.workspace.status === "published" && result.body.workspace.closure.snapshotVersion === 1, "13 meeting closed and snapshotted");

    result = await getWorkspace(participantToken);
    const participantWorkspace = result.body.workspace;
    ok(result.status === 200 && result.body.accessRole === "participant" && participantWorkspace.publishedSummaries.length === 1, "14 participant receives published closing summary");
    ok(participantWorkspace.privateNotes === "" && participantWorkspace.emailLog.length === 0 && participantWorkspace.agenda[0].topicBlocks[0].privateNotes === "", "15 participant view hides private topic, contact and email log data");

    result = await postWorkspace(participantToken, "participant", "submit_feedback", { participantName: "Résztvevő Béla", type: "acknowledged" });
    ok(result.status === 200 && result.body.workspace.feedback.length === 0, "16 participant acknowledgement accepted while private feedback list stays hidden");

    result = await postWorkspace(participantToken, "participant", "submit_feedback", { participantName: "Résztvevő Béla", type: "comment", agendaItemId: agendaId, comment: "A színkód jóváhagyási határideje pontosítandó." });
    ok(result.status === 200, "17 participant comment accepted");

    result = await getWorkspace(organizerToken);
    ok(result.body.workspace.feedback.length === 2 && result.body.workspace.feedback.some((item) => item.type === "comment"), "18 organizer sees participant feedback and acknowledgement");

    const feedbackId = result.body.workspace.feedback.find((item) => item.type === "comment").id;
    result = await postWorkspace(organizerToken, "organizer", "review_feedback", { feedbackId, status: "accepted", reviewedBy: "Teszt Jegyzőkönyvvezető" });
    ok(result.status === 200 && result.body.workspace.feedback.find((item) => item.id === feedbackId).status === "accepted", "19 organizer reviews participant suggestion");

    const archiveList = await fetch(`${base}/api/meeting-assistant/archive?currentMeetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(organizerToken)}`, { headers: { host: "app.dimpro.hu" } });
    const archiveListBody = await archiveList.json();
    ok(archiveList.ok && archiveListBody.meetings.some((item) => item.meetingId === meetingId && item.documentLabel === "Egyeztetési emlékeztető"), "20 prior-document archive lists selected document form");

    const archiveDetail = await fetch(`${base}/api/meeting-assistant/archive?currentMeetingId=${encodeURIComponent(meetingId)}&selectedMeetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(organizerToken)}`, { headers: { host: "app.dimpro.hu" } });
    const archiveDetailBody = await archiveDetail.json();
    ok(archiveDetail.ok && archiveDetailBody.continuousText.includes("Homlokzati színminta") && archiveDetailBody.continuousText.includes("Megrendelői vélemény"), "21 continuous archive preview contains Joker content");

    const participantExport = await fetch(`${base}/api/meeting-assistant/export?meetingId=${encodeURIComponent(meetingId)}&format=json&includePrivate=1&accessToken=${encodeURIComponent(participantToken)}`, { headers: { host: "app.dimpro.hu" } });
    const participantData = await participantExport.json();
    ok(participantExport.ok && participantData.privateNotes === "" && participantData.emailLog.length === 0 && participantData.feedback.length === 0, "22 participant export excludes private data and feedback");

    const docxResponse = await fetch(`${base}/api/meeting-assistant/export?meetingId=${encodeURIComponent(meetingId)}&format=docx&includePrivate=1&accessToken=${encodeURIComponent(organizerToken)}`, { headers: { host: "app.dimpro.hu" } });
    const docxBuffer = Buffer.from(await docxResponse.arrayBuffer());
    ok(docxResponse.ok && docxBuffer.length > 2000 && docxBuffer.subarray(0, 2).toString() === "PK", "23 editable DOCX generated");

    const pdfResponse = await fetch(`${base}/api/meeting-assistant/export?meetingId=${encodeURIComponent(meetingId)}&format=pdf&includePrivate=1&accessToken=${encodeURIComponent(organizerToken)}`, { headers: { host: "app.dimpro.hu" } });
    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
    ok(pdfResponse.ok && pdfBuffer.length > 2000 && pdfBuffer.subarray(0, 4).toString() === "%PDF", "24 PDF generated");

    const emailStatus = await fetch(`${base}/api/meeting-assistant/email?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(organizerToken)}`, { headers: { host: "app.dimpro.hu" } });
    const emailStatusBody = await emailStatus.json();
    ok(emailStatus.ok && typeof emailStatusBody.status.configured === "boolean" && Array.isArray(emailStatusBody.suggestedRecipients), "25 email configuration and suggested recipients available without sending mail");

    result = await postWorkspace(participantToken, "organizer", "update_meta", { title: "Tiltott" });
    ok(result.status === 403, "26 participant cannot claim organizer editing rights");
  } finally {
    cleanup();
  }
})().catch((error) => {
  cleanup();
  console.error(error);
  process.exitCode = 1;
});
