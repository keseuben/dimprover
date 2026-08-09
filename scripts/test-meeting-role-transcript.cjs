const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const meetingId = `role-transcript-smoke-${Date.now()}`;
const pairingCode = crypto.randomBytes(4).toString("hex").toUpperCase();
const pairingHash = crypto.createHash("sha256").update(pairingCode).digest("hex");
const dataRoot = path.join(process.cwd(), ".dimprover", "data", "meeting-assistant");
const pairingDir = path.join(dataRoot, "pairings");
const pairingFile = path.join(pairingDir, `${pairingHash}.json`);
const base = "http://127.0.0.1:3000";
let organizerToken = "";
let participantToken = "";

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
    issuedBy: "automated-role-transcript-smoke",
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
  const response = await fetch(`${base}/api/meeting-assistant/workspace?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(token)}`, {
    headers: { host: "app.dimpro.hu" },
  });
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

async function postTranscript(token, operation, payload = {}) {
  const response = await fetch(`${base}/api/meeting-assistant/transcript`, {
    method: "POST",
    headers: { host: "app.dimpro.hu", "content-type": "application/json" },
    body: JSON.stringify({ meetingId, operation, accessToken: token, ...payload }),
  });
  return { status: response.status, body: await response.json() };
}

function cleanup() {
  const workspaceFile = path.join(dataRoot, "workspaces", `${meetingId}.json`);
  const snapshotDir = path.join(dataRoot, "snapshots", meetingId);
  const uploadDir = path.join(dataRoot, "uploads", meetingId);
  if (fs.existsSync(workspaceFile)) fs.rmSync(workspaceFile, { force: true });
  if (fs.existsSync(snapshotDir)) fs.rmSync(snapshotDir, { recursive: true, force: true });
  if (fs.existsSync(uploadDir)) fs.rmSync(uploadDir, { recursive: true, force: true });
  if (fs.existsSync(pairingFile)) fs.rmSync(pairingFile, { force: true });
}

(async () => {
  try {
    createPairingRecord();
    await consumePairing();
    ok(Boolean(organizerToken) && Boolean(participantToken) && organizerToken !== participantToken, "01 separate organizer and participant tokens");

    let result = await getWorkspace(organizerToken);
    ok(result.status === 200 && result.body.accessRole === "organizer" && result.body.workspace.version === 8, "02 organizer receives full v8 workspace");

    result = await postWorkspace(organizerToken, "organizer", "update_meta", {
      title: "DIMPRO integrációs értekezlet",
      projectId: "DIMPRO_DEMO",
      projectCode: "DP-DEMO",
      projectName: "DIMPRO Demo projekt",
      meetingLocation: "Teams és tárgyaló",
      meetingType: "Heti kooperáció",
      minuteNumber: "KOOP-2026-TEST",
      documentId: "DOC-TEST-001",
      organizerName: "Teszt Szervező",
    });
    ok(result.status === 200 && result.body.workspace.projectId === "DIMPRO_DEMO" && result.body.workspace.minuteNumber === "KOOP-2026-TEST", "03 meeting metadata and project link saved");

    result = await postWorkspace(organizerToken, "organizer", "update_notes", {
      privateNotes: "Titkos szervezői megjegyzés",
      sharedNote: "Közös megjegyzés",
    });
    ok(result.status === 200 && result.body.workspace.privateNotes.includes("Titkos"), "04 organizer can edit private content");

    result = await postWorkspace(organizerToken, "organizer", "toggle_agenda_shared", {
      agendaItemId: result.body.workspace.agenda[0].id,
      shared: false,
    });
    ok(result.status === 200 && result.body.workspace.agenda[0].shared === false, "05 organizer can make agenda item private");

    result = await getWorkspace(participantToken);
    ok(result.status === 200 && result.body.accessRole === "participant", "06 participant access role is read-only");
    ok(result.body.workspace.privateNotes === "" && !result.body.workspace.agenda.some((item) => item.shared === false), "07 participant workspace hides private data");

    result = await postWorkspace(participantToken, "organizer", "update_notes", { privateNotes: "Támadás" });
    ok(result.status === 403, "08 participant token cannot claim organizer role");

    result = await postWorkspace(participantToken, "participant", "add_action_item", { type: "task", title: "Tiltott feladat" });
    ok(result.status === 403 && String(result.body.error).includes("szervező"), "09 participant cannot create action items");

    const organizerWorkspace = await getWorkspace(organizerToken);
    const agendaId = organizerWorkspace.body.workspace.agenda.find((item) => item.shared)?.id || organizerWorkspace.body.workspace.agenda[0].id;
    result = await postWorkspace(organizerToken, "organizer", "add_action_item", {
      type: "task",
      title: "Napirendhez kötött tesztfeladat",
      owner: "Teszt Felelős",
      dueDate: "2026-07-31",
      agendaItemId: agendaId,
      shared: true,
    });
    ok(result.status === 200 && result.body.workspace.actionItems.at(-1).agendaItemId === agendaId, "10 action item linked to agenda");

    const projectResponse = await fetch(`${base}/api/meeting-assistant/projects?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(organizerToken)}`, { headers: { host: "app.dimpro.hu" } });
    const projectBody = await projectResponse.json();
    ok(projectResponse.ok && Array.isArray(projectBody.projects) && projectBody.projects.length > 0, "11 organizer can load DIMPRO projects");

    result = await postTranscript(participantToken, "configure", {
      organizerUserId: "11111111-1111-1111-1111-111111111111",
      graphOnlineMeetingId: "MS-test",
    });
    ok(result.status === 403, "12 participant cannot configure transcript integration");

    result = await postTranscript(organizerToken, "configure", {
      organizerUserId: "11111111-1111-1111-1111-111111111111",
      graphOnlineMeetingId: "MS-test",
    });
    ok(result.status === 200 && result.body.integration.status === "ready", "13 organizer can configure transcript integration");

    result = await postTranscript(organizerToken, "sync");
    ok([400, 503].includes(result.status) && result.body.integration, "14 transcript sync returns controlled setup or Graph error");

    const participantExport = await fetch(`${base}/api/meeting-assistant/export?meetingId=${encodeURIComponent(meetingId)}&format=json&includePrivate=1&accessToken=${encodeURIComponent(participantToken)}`, {
      headers: { host: "app.dimpro.hu" },
    });
    const participantData = await participantExport.json();
    ok(participantExport.ok && participantData.privateNotes === "" && !participantData.agenda.some((item) => item.shared === false), "15 participant export excludes private content");

    const docxResponse = await fetch(`${base}/api/meeting-assistant/export?meetingId=${encodeURIComponent(meetingId)}&format=docx&includePrivate=1&accessToken=${encodeURIComponent(organizerToken)}`, { headers: { host: "app.dimpro.hu" } });
    const docxBuffer = Buffer.from(await docxResponse.arrayBuffer());
    ok(docxResponse.ok && docxBuffer.length > 1500 && docxBuffer.subarray(0, 2).toString() === "PK", "16 editable DOCX generated");

    const pdfResponse = await fetch(`${base}/api/meeting-assistant/export?meetingId=${encodeURIComponent(meetingId)}&format=pdf&includePrivate=1&accessToken=${encodeURIComponent(organizerToken)}`, { headers: { host: "app.dimpro.hu" } });
    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
    ok(pdfResponse.ok && pdfBuffer.length > 1500 && pdfBuffer.subarray(0, 4).toString() === "%PDF", "17 PDF generated");
  } finally {
    cleanup();
  }
})().catch((error) => {
  cleanup();
  console.error(error);
  process.exitCode = 1;
});
