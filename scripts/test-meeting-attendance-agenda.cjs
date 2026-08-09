const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const meetingId = `attendance-agenda-smoke-${Date.now()}`;
const pairingCode = crypto.randomBytes(4).toString("hex").toUpperCase();
const pairingHash = crypto.createHash("sha256").update(pairingCode).digest("hex");
const dataRoot = path.join(process.cwd(), ".dimprover", "data", "meeting-assistant");
const pairingDir = path.join(dataRoot, "pairings");
const pairingFile = path.join(pairingDir, `${pairingHash}.json`);
const base = "http://127.0.0.1:3000";
let token = "";

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
    issuedBy: "automated-attendance-agenda-smoke",
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
    body: JSON.stringify({
      operation: "consume",
      meetingId,
      pairingCode,
      issuedTo: "dimpro-fajlmuhely-desktop",
    }),
  });
  const body = await response.json();
  if (!response.ok || !body.accessToken) throw new Error(`PAIR ${response.status} ${JSON.stringify(body)}`);
  token = body.organizerAccessToken || body.accessToken;
}

async function getWorkspace() {
  const response = await fetch(`${base}/api/meeting-assistant/workspace?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(token)}`, {
    headers: { host: "app.dimpro.hu" },
  });
  const body = await response.json();
  if (!response.ok || !body.workspace) throw new Error(`GET ${response.status} ${JSON.stringify(body)}`);
  return body.workspace;
}

async function post(operation, data = {}, role = "organizer") {
  const response = await fetch(`${base}/api/meeting-assistant/workspace`, {
    method: "POST",
    headers: { host: "app.dimpro.hu", "content-type": "application/json" },
    body: JSON.stringify({ meetingId, role, operation, payload: data, accessToken: token }),
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
    ok(Boolean(token), "00 pairing token issued by live API");

    let workspace = await getWorkspace();
    ok(workspace.version === 8 && Array.isArray(workspace.attendees), "01 default v8 attendance, agenda and Joker workspace");

    let result = await post("upsert_attendee", {
      name: "Teszt Anna",
      organization: "DIMPRO Kft.",
      functionTitle: "Projektvezető",
      email: "anna@example.test",
      status: "present",
      participationMode: "online",
      arrivalTime: "09:00",
      external: false,
    });
    ok(result.status === 200 && result.body.workspace.attendees.length === 1, "02 first attendee saved");
    const annaId = result.body.workspace.attendees[0].id;

    result = await post("upsert_attendee", {
      name: "Teszt Béla",
      organization: "Partner Kft.",
      functionTitle: "Kivitelező",
      status: "late",
      participationMode: "in_person",
      arrivalTime: "09:15",
      external: true,
    });
    ok(result.status === 200 && result.body.workspace.attendees.length === 2 && result.body.workspace.participants.length === 2, "03 second attendee and legacy participant names saved");
    const belaId = result.body.workspace.attendees.find((item) => item.name === "Teszt Béla").id;

    result = await post("upsert_attendee", {
      id: annaId,
      name: "Teszt Anna",
      organization: "DIMPRO Kft.",
      functionTitle: "Projektvezető",
      email: "anna@example.test",
      status: "left_early",
      participationMode: "online",
      arrivalTime: "09:00",
      departureTime: "10:20",
      external: false,
    });
    ok(result.status === 200 && result.body.workspace.attendees.find((item) => item.id === annaId).status === "left_early", "04 attendee edited");

    result = await post("upsert_attendee", { name: "Tiltott Résztvevő" }, "participant");
    ok(result.status === 403 && String(result.body.error).includes("szervező"), "05 participant cannot edit attendance");

    result = await post("remove_attendee", { id: belaId });
    ok(result.status === 200 && result.body.workspace.attendees.length === 1 && result.body.workspace.participants[0] === "Teszt Anna", "06 attendee removed and names synchronized");

    result = await post("apply_agenda_template", { templateKey: "weekly_coordination" });
    ok(result.status === 200 && result.body.workspace.agendaTemplateKey === "weekly_coordination" && result.body.workspace.agenda.length === 10, "07 weekly template with Joker applied");

    result = await post("add_agenda_item", { title: "Egyedi tesztpont", shared: true });
    ok(result.status === 200 && result.body.workspace.agenda.length === 11, "08 custom agenda item added");
    const custom = result.body.workspace.agenda.find((item) => item.title === "Egyedi tesztpont");

    result = await post("update_agenda_item", { agendaItemId: custom.id, title: "Módosított egyedi pont" });
    ok(result.status === 200 && result.body.workspace.agenda.some((item) => item.title === "Módosított egyedi pont"), "09 agenda item edited");

    result = await post("update_agenda_content", {
      agendaItemId: custom.id,
      description: "Az egyedi tesztpont előkészítő leírása.",
      discussionNotes: "Részletes egyeztetési tartalom a teszthez.",
      decisionSummary: "A tesztdöntés elfogadva.",
      openQuestions: "Teszt nyitott kérdés.",
      privateNotes: "Csak szervezőnek látható tesztmegjegyzés.",
      updatedBy: "Teszt Szervező",
    });
    ok(result.status === 200 && result.body.workspace.agenda.find((item) => item.id === custom.id).decisionSummary.includes("tesztdöntés"), "10 agenda detailed content saved");

    const customOrderBeforeMove = result.body.workspace.agenda.find((item) => item.id === custom.id).order;
    result = await post("update_agenda_content", { agendaItemId: custom.id, discussionNotes: "Tiltott" }, "participant");
    ok(result.status === 403 && String(result.body.error).includes("szervező"), "11 participant cannot edit agenda content");

    result = await post("move_agenda_item", { agendaItemId: custom.id, direction: "up" });
    ok(result.status === 200 && result.body.workspace.agenda.find((item) => item.id === custom.id).order === customOrderBeforeMove - 1, "12 agenda item moved exactly one position up");

    result = await post("toggle_agenda_shared", { agendaItemId: custom.id, shared: false });
    ok(result.status === 200 && result.body.workspace.agenda.find((item) => item.id === custom.id).shared === false, "13 agenda visibility changed");

    result = await post("toggle_agenda", { agendaItemId: result.body.workspace.agenda[0].id, completed: true });
    ok(result.status === 200 && result.body.workspace.agenda[0].completed === true, "14 agenda completion saved");

    result = await post("toggle_agenda_shared", { agendaItemId: custom.id, shared: true });
    ok(result.status === 200 && result.body.workspace.agenda.find((item) => item.id === custom.id).shared === true, "15 agenda shared again for participant export");

    workspace = await getWorkspace();
    ok(workspace.attendees.length === 1 && workspace.agenda.length === 11 && workspace.version === 8, "16 persisted v8 workspace retrieved");

    const exportResponse = await fetch(`${base}/api/meeting-assistant/export?meetingId=${encodeURIComponent(meetingId)}&format=html&includePrivate=1&accessToken=${encodeURIComponent(token)}`, {
      headers: { host: "app.dimpro.hu" },
    });
    const html = await exportResponse.text();
    ok(exportResponse.ok && html.includes("Jelenléti ív") && html.includes("Teszt Anna") && html.includes("Részletes egyeztetési tartalom a teszthez") && html.includes("Csak szervezőnek látható tesztmegjegyzés"), "17 private HTML export contains detailed agenda content");

    const participantExportResponse = await fetch(`${base}/api/meeting-assistant/export?meetingId=${encodeURIComponent(meetingId)}&format=html&includePrivate=0&accessToken=${encodeURIComponent(token)}`, {
      headers: { host: "app.dimpro.hu" },
    });
    const participantHtml = await participantExportResponse.text();
    ok(participantExportResponse.ok && participantHtml.includes("Részletes egyeztetési tartalom a teszthez") && !participantHtml.includes("Csak szervezőnek látható tesztmegjegyzés"), "18 participant export hides private agenda notes");

    result = await post("remove_agenda_item", { agendaItemId: custom.id });
    ok(result.status === 200 && result.body.workspace.agenda.length === 10, "19 custom agenda item removed");
  } finally {
    cleanup();
  }
})().catch((error) => {
  cleanup();
  console.error(error);
  process.exitCode = 1;
});
