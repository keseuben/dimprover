const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
require("./load-next-env.cjs");

const meetingId = `preview-token-${Date.now()}`;
const base = "http://127.0.0.1:3000";
const secret = String(process.env.MEETING_ASSISTANT_SIGNING_SECRET || "");
const workspaceFile = path.join(process.cwd(), ".dimprover", "data", "meeting-assistant", "workspaces", `${meetingId}.json`);

function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  console.log(`OK ${label}`);
}

function createToken(issuedTo) {
  if (secret.length < 32) throw new Error("MEETING_ASSISTANT_SIGNING_SECRET missing");
  const now = Math.floor(Date.now() / 1000);
  const payload = { v: 1, meetingId, issuedTo, iat: now, exp: now + 3600, grantId: "", subjectName: "", subjectEmail: "" };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { host: "app.dimpro.hu", ...(options.headers || {}) } });
  return { status: response.status, body: await response.json() };
}

(async () => {
  try {
    const organizerToken = createToken("dimpro-web-preview");
    const participantToken = createToken("dimpro-web-participant-preview");
    ok(organizerToken !== participantToken, "01 organizer and participant preview tokens are separate");

    let result = await request(`${base}/api/meeting-assistant/workspace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        meetingId,
        accessToken: organizerToken,
        role: "organizer",
        operation: "update_notes",
        payload: { privateNotes: "PREVIEW PRIVATE SECRET", sharedNote: "Preview shared note" },
      }),
    });
    ok(result.status === 200 && result.body.workspace.privateNotes.includes("PRIVATE"), "02 organizer preview can save private data");

    result = await request(`${base}/api/meeting-assistant/workspace?meetingId=${encodeURIComponent(meetingId)}&accessToken=${encodeURIComponent(participantToken)}`);
    ok(result.status === 200 && result.body.accessRole === "participant", "03 participant preview token resolves only to participant role");
    ok(result.body.workspace.privateNotes === "" && result.body.workspace.auditLog.length === 0, "04 participant preview response excludes private workspace data");

    result = await request(`${base}/api/meeting-assistant/workspace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ meetingId, accessToken: participantToken, role: "organizer", operation: "update_notes", payload: { privateNotes: "FORBIDDEN" } }),
    });
    ok(result.status === 403, "05 participant preview token cannot claim organizer role");
  } finally {
    if (fs.existsSync(workspaceFile)) fs.rmSync(workspaceFile, { force: true });
  }
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
