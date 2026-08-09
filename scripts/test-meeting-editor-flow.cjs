const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const stamp = Date.now();
const meetingId = `editor-flow-${stamp}`;
const pairingCode = crypto.randomBytes(4).toString("hex").toUpperCase();
const pairingHash = crypto.createHash("sha256").update(pairingCode).digest("hex");
const dataRoot = path.join(process.cwd(), ".dimprover", "data", "meeting-assistant");
const legacyPairingFile = path.join(dataRoot, "pairings", `${pairingHash}.json`);
const editorPairingFile = path.join(dataRoot, "editor-pairings", `${meetingId}.json`);
const workspaceFile = path.join(dataRoot, "workspaces", `${meetingId}.json`);
const base = "http://127.0.0.1:3000";
let organizerToken = "";
let participantToken = "";
let editorToken = "";
let agendaId = "";

function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  console.log(`OK ${label}`);
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { host: "app.dimpro.hu", ...(options.headers || {}) },
  });
  let body = {};
  try { body = await response.json(); } catch { body = {}; }
  return { status: response.status, body };
}

function createLegacyPairing() {
  fs.mkdirSync(path.dirname(legacyPairingFile), { recursive: true });
  const now = new Date();
  fs.writeFileSync(legacyPairingFile, `${JSON.stringify({
    version: 1,
    codeHash: pairingHash,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
    issuedBy: "editor-flow-test",
    status: "active",
    consumedAt: "",
    meetingId: "",
    issuedTo: "",
  }, null, 2)}\n`);
}

async function createBaseTokens() {
  const result = await jsonRequest(`${base}/api/meeting-assistant/pairing`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operation: "consume", meetingId, pairingCode }),
  });
  if (result.status !== 200) throw new Error(`PAIR ${result.status} ${JSON.stringify(result.body)}`);
  organizerToken = result.body.organizerAccessToken || "";
  participantToken = result.body.participantAccessToken || "";
}

async function getWorkspace(token) {
  return jsonRequest(`${base}/api/meeting-assistant/workspace?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(token)}`);
}

async function postWorkspace(token, role, operation, payload = {}) {
  return jsonRequest(`${base}/api/meeting-assistant/workspace`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ meetingId, accessToken: token, role, operation, payload }),
  });
}

async function editorAccess(token, operation, extra = {}) {
  return jsonRequest(`${base}/api/meeting-assistant/editor-access`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ meetingId, accessToken: token, operation, ...extra }),
  });
}

function cleanup() {
  for (const file of [legacyPairingFile, editorPairingFile, workspaceFile]) {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
  for (const dir of [path.join(dataRoot, "snapshots", meetingId), path.join(dataRoot, "uploads", meetingId)]) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
}

(async () => {
  try {
    createLegacyPairing();
    await createBaseTokens();
    ok(Boolean(organizerToken) && Boolean(participantToken), "01 organizer and participant base tokens created");

    let result = await getWorkspace(organizerToken);
    agendaId = result.body.workspace?.agenda?.[0]?.id || "";
    ok(result.status === 200 && agendaId, "02 meeting workspace available");

    result = await postWorkspace(organizerToken, "organizer", "update_notes", {
      privateNotes: "SZERVEZŐI TITKOS JEGYZET",
      sharedNote: "Kezdeti megosztott jegyzet",
    });
    ok(result.status === 200 && result.body.workspace.privateNotes.includes("TITKOS"), "03 organizer private note saved");

    result = await editorAccess(organizerToken, "create", {
      actorName: "Teszt Szervező",
      recipientName: "Teszt Editor",
      recipientEmail: "editor@example.invalid",
    });
    const code = String(result.body.pairing?.code || "");
    ok(result.status === 200 && /^\d{6}$/.test(code) && result.body.editorAccess.status === "pending", "04 one-time six-digit editor code created");

    result = await editorAccess(participantToken, "consume", {
      code,
      editorName: "Teszt Editor",
      editorEmail: "",
    });
    ok(result.status === 400 && String(result.body.error || "").includes("e-mail"), "05 email-bound code rejects activation without designated email");

    result = await editorAccess(participantToken, "consume", {
      code,
      editorName: "Teszt Editor",
      editorEmail: "editor@example.invalid",
    });
    editorToken = result.body.editorAccessToken || "";
    ok(result.status === 200 && result.body.role === "editor" && Boolean(editorToken), "06 participant activated editor mode");

    result = await getWorkspace(editorToken);
    ok(result.status === 200 && result.body.accessRole === "editor", "07 editor token resolves to editor role");
    ok(result.body.workspace.privateNotes === "" && result.body.workspace.auditLog.length === 0 && result.body.workspace.editorAccess.grantId === "" && result.body.workspace.editorAccess.editorEmail === "", "08 editor view hides private and grant data");

    result = await postWorkspace(editorToken, "editor", "update_notes", {
      privateNotes: "TILTOTT FELÜLÍRÁS",
      sharedNote: "Editor által módosított közös jegyzet",
    });
    ok(result.status === 200 && result.body.workspace.sharedNote.includes("Editor által"), "09 editor updated shared note");

    result = await postWorkspace(editorToken, "editor", "update_agenda_content", {
      agendaItemId: agendaId,
      description: "Editor leírás",
      discussionNotes: "Editor egyeztetési tartalom",
      decisionSummary: "Editor döntési javaslat",
      openQuestions: "Editor nyitott kérdés",
      privateNotes: "TILTOTT NAPIRENDI TITOK",
    });
    ok(result.status === 200 && result.body.workspace.agenda[0].discussionNotes.includes("Editor"), "10 editor updated shared agenda content");

    result = await postWorkspace(editorToken, "editor", "add_action_item", {
      agendaItemId: agendaId,
      type: "task",
      title: "Editor által rögzített feladat",
      owner: "Teszt felelős",
      dueDate: "2026-08-01",
      shared: false,
    });
    ok(result.status === 200 && result.body.workspace.actionItems.some((item) => item.title.includes("Editor által") && item.shared), "11 editor-created action is forced shared");

    result = await getWorkspace(organizerToken);
    ok(result.body.workspace.privateNotes === "SZERVEZŐI TITKOS JEGYZET" && result.body.workspace.agenda[0].privateNotes !== "TILTOTT NAPIRENDI TITOK", "12 editor could not overwrite organizer private data");

    result = await postWorkspace(editorToken, "editor", "close_meeting", { mode: "publish" });
    ok(result.status === 403, "13 editor cannot close or publish meeting");

    result = await postWorkspace(editorToken, "editor", "move_agenda_item", { agendaItemId: agendaId, direction: "down" });
    ok(result.status === 403, "14 editor cannot reorder mixed private/shared agenda");

    result = await editorAccess(organizerToken, "revoke", { actorName: "Teszt Szervező" });
    ok(result.status === 200 && result.body.editorAccess.status === "revoked", "15 organizer revoked editor access");

    result = await postWorkspace(editorToken, "editor", "update_notes", { sharedNote: "Visszavonás utáni tiltott módosítás" });
    ok(result.status === 403, "16 revoked editor token is immediately rejected");

    result = await getWorkspace(organizerToken);
    const auditTypes = new Set((result.body.workspace.auditLog || []).map((item) => item.type));
    ok(auditTypes.has("editor_pairing_created") && auditTypes.has("editor_access_activated") && auditTypes.has("editor_content_changed") && auditTypes.has("editor_access_revoked"), "17 editor delegation and editing events audited");
  } finally {
    cleanup();
  }
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
