const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
require("./load-next-env.cjs");

const stamp = Date.now();
const workspaceMeetingId = `collab-workspace-${stamp}`;
const teamsMeetingId = `teams-context-${stamp}`;
const pairingCode = crypto.randomBytes(4).toString("hex").toUpperCase();
const pairingHash = crypto.createHash("sha256").update(pairingCode).digest("hex");
const dataRoot = path.join(process.cwd(), ".dimprover", "data", "meeting-assistant");
const pairingDir = path.join(dataRoot, "pairings");
const pairingFile = path.join(pairingDir, `${pairingHash}.json`);
const base = "http://127.0.0.1:3000";
let organizerToken = "";
let participantToken = "";
let attachmentId = "";

function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  console.log(`OK ${label}`);
}

function writePairingRecord() {
  fs.mkdirSync(pairingDir, { recursive: true });
  const now = new Date();
  fs.writeFileSync(pairingFile, `${JSON.stringify({
    version: 1,
    codeHash: pairingHash,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
    issuedBy: "collaboration-v017-smoke",
    status: "active",
    consumedAt: "",
    meetingId: "",
    sourceMeetingId: workspaceMeetingId,
    issuedTo: "",
  }, null, 2)}\n`);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { host: "app.dimpro.hu", ...(options.headers || {}) },
  });
  const contentType = String(response.headers.get("content-type") || "");
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  return { response, body };
}

async function postWorkspace(token, role, operation, payload = {}) {
  return request(`${base}/api/meeting-assistant/workspace`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ meetingId: workspaceMeetingId, role, operation, payload, accessToken: token }),
  });
}

async function getWorkspace(token) {
  return request(`${base}/api/meeting-assistant/workspace?meetingId=${encodeURIComponent(workspaceMeetingId)}&accessToken=${encodeURIComponent(token)}`);
}

function cleanup() {
  for (const meetingId of [workspaceMeetingId, teamsMeetingId]) {
    const workspaceFile = path.join(dataRoot, "workspaces", `${meetingId}.json`);
    if (fs.existsSync(workspaceFile)) fs.rmSync(workspaceFile, { force: true });
    for (const dir of [path.join(dataRoot, "snapshots", meetingId), path.join(dataRoot, "uploads", meetingId)]) {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  if (fs.existsSync(pairingFile)) fs.rmSync(pairingFile, { force: true });
}

(async () => {
  try {
    writePairingRecord();
    let result = await request(`${base}/api/meeting-assistant/pairing`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "consume", meetingId: teamsMeetingId, pairingCode }),
    });
    ok(result.response.status === 200 && result.body.ok, "01 pairing consumed by actual Teams meeting");
    ok(result.body.teamsMeetingId === teamsMeetingId && result.body.workspaceMeetingId === workspaceMeetingId, "02 Teams context maps to original DIMPRO workspace");
    organizerToken = result.body.organizerAccessToken || "";
    participantToken = result.body.participantAccessToken || "";
    ok(Boolean(organizerToken) && Boolean(participantToken), "03 separate organizer and participant tokens created for shared workspace");

    const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=", "base64");
    const uploadForm = new FormData();
    uploadForm.append("files", new Blob([tinyPng], { type: "image/png" }), "participant_photo.png");
    result = await request(`${base}/api/meeting-assistant/upload?meetingId=${encodeURIComponent(workspaceMeetingId)}&role=participant&actorName=${encodeURIComponent("Résztvevő Anna")}&accessToken=${encodeURIComponent(participantToken)}`, {
      method: "POST",
      body: uploadForm,
    });
    ok(result.response.status === 200 && result.body.ok && result.body.message.includes("szervező megkapta"), "04 participant receives explicit organizer-received confirmation");
    attachmentId = result.body.attachments?.[0]?.id || "";
    ok(Boolean(attachmentId) && result.body.attachments[0].status === "pending", "05 participant upload enters pending approval state");

    result = await getWorkspace(participantToken);
    ok(result.response.status === 200 && !result.body.workspace.attachments.some((item) => item.id === attachmentId), "06 pending attachment is not yet visible in participant shared view");

    result = await getWorkspace(organizerToken);
    ok(result.response.status === 200 && result.body.workspace.attachments.some((item) => item.id === attachmentId && item.status === "pending"), "07 organizer sees pending participant upload");

    result = await postWorkspace(organizerToken, "organizer", "update_attachment", {
      fileId: attachmentId,
      title: "Közös helyszíni kép",
      description: "Szervezői első képaláírás.",
      caption: "Szervezői első képaláírás.",
      includeInAi: true,
      agendaItemId: "design",
      actorName: "Szervező",
    });
    ok(result.response.status === 200, "08 organizer prepares title, caption and agenda metadata");

    result = await postWorkspace(organizerToken, "organizer", "set_attachment_status", { fileId: attachmentId, status: "shared" });
    ok(result.response.status === 200 && result.body.workspace.attachments.find((item) => item.id === attachmentId)?.status === "shared", "09 organizer approval and sharing completes in one operation");

    result = await getWorkspace(participantToken);
    let sharedAttachment = result.body.workspace.attachments.find((item) => item.id === attachmentId);
    ok(result.response.status === 200 && sharedAttachment?.status === "shared", "10 approved image appears in participant interface");
    ok(sharedAttachment?.description === "Szervezői első képaláírás.", "11 image caption is visible under shared image");

    result = await postWorkspace(participantToken, "participant", "update_attachment", {
      fileId: attachmentId,
      title: "Tiltott címátírás",
      description: "Résztvevő által pontosított közös képaláírás.",
      caption: "Résztvevő által pontosított közös képaláírás.",
      includeInAi: false,
      agendaItemId: "attendance",
      actorName: "Résztvevő Anna",
    });
    ok(result.response.status === 200, "12 participant may collaboratively edit shared image caption");

    result = await getWorkspace(organizerToken);
    sharedAttachment = result.body.workspace.attachments.find((item) => item.id === attachmentId);
    ok(sharedAttachment?.description.includes("Résztvevő által"), "13 collaborative caption change reaches organizer workspace");
    ok(sharedAttachment?.title === "Közös helyszíni kép" && sharedAttachment?.includeInAi === true && sharedAttachment?.agendaItemId === "design", "14 participant cannot alter protected title, AI flag or agenda link");

    const editedForm = new FormData();
    editedForm.append("file", new Blob([tinyPng], { type: "image/png" }), "participant_draw_attempt.png");
    editedForm.append("parentFileId", attachmentId);
    editedForm.append("originalName", "participant_photo.png");
    editedForm.append("title", "Tiltott rajz");
    editedForm.append("description", "Résztvevői rajzpróba");
    editedForm.append("markupData", JSON.stringify({ version: 1, items: [{ type: "pen" }] }));
    result = await request(`${base}/api/meeting-assistant/attachments/edited?meetingId=${encodeURIComponent(workspaceMeetingId)}&role=participant&actorName=${encodeURIComponent("Résztvevő Anna")}&accessToken=${encodeURIComponent(participantToken)}`, {
      method: "POST",
      body: editedForm,
    });
    ok(result.response.status === 403 && String(result.body.error || "").includes("kizárólag"), "15 participant drawing and image variant save are blocked server-side");

    result = await postWorkspace(participantToken, "participant", "submit_shared_message", {
      text: "Ezt a műszaki megjegyzést jelenítsük meg az értekezletben.",
      actorName: "Résztvevő Anna",
    });
    ok(result.response.status === 200 && result.body.workspace.sharedMessages.length === 0, "16 participant text suggestion is accepted but remains private pending review");

    result = await getWorkspace(organizerToken);
    const pendingMessage = result.body.workspace.sharedMessages.find((item) => item.status === "pending");
    ok(Boolean(pendingMessage) && pendingMessage.submittedBy === "Résztvevő Anna", "17 organizer receives pending text suggestion");

    result = await postWorkspace(organizerToken, "organizer", "review_shared_message", { messageId: pendingMessage.id, status: "shared" });
    ok(result.response.status === 200 && result.body.workspace.sharedMessages.find((item) => item.id === pendingMessage.id)?.status === "shared", "18 organizer approves text for live meeting display");

    result = await getWorkspace(participantToken);
    ok(result.response.status === 200 && result.body.workspace.sharedMessages.some((item) => item.id === pendingMessage.id && item.status === "shared"), "19 approved text becomes visible to all participants");

    const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "teams-package", "dimpro-meeting-assistant", "manifest.json"), "utf8"));
    ok(manifest.version === "0.1.7" && manifest.name.short === "DIMPRO Értekezleti Kísérő", "20 Teams package has requested full short display name");
    ok(manifest.configurableTabs[0].context.includes("meetingStage") && manifest.meetingExtensionDefinition?.supportsCustomShareToStage === true, "21 custom square share-to-stage configuration is present");
    const permissions = manifest.authorization?.permissions?.resourceSpecific || [];
    ok(permissions.some((item) => item.name === "MeetingStage.Write.Chat"), "22 meeting-stage RSC permission is present");

    console.log("Meeting collaboration v0.1.7 integration smoke completed successfully.");
  } finally {
    cleanup();
  }
})().catch((error) => {
  cleanup();
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
