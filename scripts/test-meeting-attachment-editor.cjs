const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const stamp = Date.now();
const meetingId = `attachment-editor-smoke-${stamp}`;
const pairingCode = crypto.randomBytes(4).toString("hex").toUpperCase();
const pairingHash = crypto.createHash("sha256").update(pairingCode).digest("hex");
const dataRoot = path.join(process.cwd(), ".dimprover", "data", "meeting-assistant");
const pairingDir = path.join(dataRoot, "pairings");
const pairingFile = path.join(pairingDir, `${pairingHash}.json`);
const base = "http://127.0.0.1:3000";
let organizerToken = "";
let savedAttachmentId = "";

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
    issuedBy: "automated-attachment-editor-smoke",
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
}

function cleanup() {
  const files = [
    path.join(dataRoot, "workspaces", `${meetingId}.json`),
    pairingFile,
  ];
  for (const file of files) {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
  for (const dir of [
    path.join(dataRoot, "snapshots", meetingId),
    path.join(dataRoot, "uploads", meetingId),
  ]) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
}

(async () => {
  try {
    createPairingRecord();
    await consumePairing();
    ok(Boolean(organizerToken), "01 organizer token created");

    const tinyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
      "base64",
    );
    const markupData = {
      version: 1,
      sourceFileId: null,
      sourceName: "screen_capture.png",
      sourcePage: null,
      canvas: { width: 1, height: 1 },
      items: [{
        id: "markup-smoke-1",
        type: "number",
        color: "#dc2626",
        lineWidth: 6,
        x: 0.5,
        y: 0.5,
        number: 1,
      }],
      savedAt: new Date().toISOString(),
      savedBy: "Attachment Smoke Organizer",
    };

    const form = new FormData();
    form.append("file", new Blob([tinyPng], { type: "image/png" }), "screen_capture_szerkesztett.png");
    form.append("parentFileId", "");
    form.append("originalName", "screen_capture.png");
    form.append("title", "Gépészeti áttörés jelölése");
    form.append("description", "A piros jelölő az egyeztetett áttörési helyet mutatja.");
    form.append("agendaItemId", "");
    form.append("includeInAi", "1");
    form.append("sourceType", "screen_capture");
    form.append("sourcePage", "");
    form.append("markupData", JSON.stringify(markupData));

    let response = await fetch(
      `${base}/api/meeting-assistant/attachments/edited?meetingId=${encodeURIComponent(meetingId)}&role=organizer&actorName=${encodeURIComponent("Attachment Smoke Organizer")}&accessToken=${encodeURIComponent(organizerToken)}`,
      { method: "POST", headers: { host: "app.dimpro.hu" }, body: form },
    );
    let body = await response.json();
    ok(response.status === 200 && body.ok === true, "02 edited attachment API accepts image and metadata");
    savedAttachmentId = body.attachment?.id || "";
    ok(Boolean(savedAttachmentId) && body.attachment.title === "Gépészeti áttörés jelölése", "03 title and attachment ID saved");
    ok(body.attachment.includeInAi === true && body.attachment.sourceType === "screen_capture", "04 AI flag and source type saved");
    ok(Boolean(body.attachment.markupStoredName) && body.attachment.editorVersion === "meeting-attachment-editor-v0.1.0", "05 markup sidecar and editor version saved");
    ok(body.workspace.attachments.some((item) => item.id === savedAttachmentId), "06 workspace contains edited attachment");
    ok(body.workspace.auditLog.some((item) => item.operation === "save_edited_attachment"), "07 audit log contains editor save event");

    response = await fetch(
      `${base}/api/meeting-assistant/files/${encodeURIComponent(savedAttachmentId)}?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(organizerToken)}`,
      { headers: { host: "app.dimpro.hu" } },
    );
    const image = Buffer.from(await response.arrayBuffer());
    ok(response.status === 200 && image.length > 50 && String(response.headers.get("content-type") || "").startsWith("image/"), "08 rendered image can be downloaded");

    const markupFile = path.join(dataRoot, "uploads", meetingId, body.attachment.markupStoredName);
    ok(fs.existsSync(markupFile), "09 markup JSON sidecar exists");
    const parsedMarkup = JSON.parse(fs.readFileSync(markupFile, "utf8"));
    ok(parsedMarkup.items?.[0]?.type === "number" && parsedMarkup.savedBy === "Attachment Smoke Organizer", "10 markup JSON is valid and preserves drawing data");

    response = await fetch(
      `${base}/api/meeting-assistant/workspace?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(organizerToken)}`,
      { headers: { host: "app.dimpro.hu" } },
    );
    body = await response.json();
    const stored = body.workspace.attachments.find((item) => item.id === savedAttachmentId);
    ok(response.status === 200 && stored?.description.includes("áttörési helyet"), "11 saved metadata reloads from workspace store");

    console.log("Attachment editor integration smoke completed successfully.");
  } finally {
    cleanup();
  }
})().catch((error) => {
  cleanup();
  console.error(error);
  process.exitCode = 1;
});
