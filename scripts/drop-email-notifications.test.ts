import assert from "node:assert/strict";

process.env.DROP_RELEASE_GATE_ENABLED = "true";
process.env.DROP_EMAIL_NOTIFICATIONS_ENABLED = "true";

async function main() {
const { sendDropPackageInvitations, sendDropUploadCompleteNotifications } = await import("../app/lib/drop/dropEmail");

const packageRow = {
  id: "11111111-1111-4111-8111-111111111111",
  public_code: "DMP-2608-EMAIL",
  title: "E-mail tesztcsomag",
  project_name_snapshot: "Teszt projekt",
  uploader_name: "Teszt Szervező",
  uploader_email: "szervezo@example.hu",
  expires_at: "2026-08-08T12:00:00.000Z",
  notify_on_upload_complete: true,
};
const recipients = [
  {
    id: "21111111-1111-4111-8111-111111111111",
    package_id: packageRow.id,
    name: "Sikeres Címzett",
    email: "siker@example.hu",
    company: "Teszt Kft.",
    role: "invitee",
    receive_invitation: true,
    receive_activity_notifications: true,
    receive_final_report: true,
    invitation_sent_at: null,
    first_opened_at: null,
    last_opened_at: null,
    first_downloaded_at: null,
    last_downloaded_at: null,
    created_at: "2026-08-01T12:00:00.000Z",
    updated_at: "2026-08-01T12:00:00.000Z",
  },
  {
    id: "31111111-1111-4111-8111-111111111111",
    package_id: packageRow.id,
    name: "Hibás Címzett",
    email: "hiba@example.hu",
    company: null,
    role: "invitee",
    receive_invitation: true,
    receive_activity_notifications: true,
    receive_final_report: true,
    invitation_sent_at: null,
    first_opened_at: null,
    last_opened_at: null,
    first_downloaded_at: null,
    last_downloaded_at: null,
    created_at: "2026-08-01T12:00:00.000Z",
    updated_at: "2026-08-01T12:00:00.000Z",
  },
  {
    id: "41111111-1111-4111-8111-111111111111",
    package_id: packageRow.id,
    name: "Kihagyott Címzett",
    email: "kihagyva@example.hu",
    company: null,
    role: "invitee",
    receive_invitation: false,
    receive_activity_notifications: false,
    receive_final_report: true,
    invitation_sent_at: null,
    first_opened_at: null,
    last_opened_at: null,
    first_downloaded_at: null,
    last_downloaded_at: null,
    created_at: "2026-08-01T12:00:00.000Z",
    updated_at: "2026-08-01T12:00:00.000Z",
  },
] as const;

const sentMails: Array<{ to: string[]; subject: string; text: string; html: string }> = [];
const marked: string[] = [];
const events: Array<{ eventType: string; recipientId?: string | null }> = [];
const getMailConfig = async () => ({
  profiles: [{ id: "drive", enabled: true, smtpConfigured: true }],
}) as never;
const sendMail = async (input: { to: string[]; subject: string; text: string; html: string }) => {
  sentMails.push(input);
  if (input.to.includes("hiba@example.hu")) throw new Error("Szándékos SMTP teszthiba");
  return { messageId: `msg-${sentMails.length}`, profileId: "drive", from: "ertesites.drive@dimpro.hu" };
};
const writeEvent = async (input: { eventType: string; recipientId?: string | null }) => {
  events.push(input);
};

const created = {
  package: packageRow,
  pin: "123456",
  rawTokens: { upload: "up", view: "view", download: "down", report: "report" },
  links: {
    upload: "https://drop.dimpro.hu/u/up",
    view: "https://drop.dimpro.hu/p/view",
    download: "https://drop.dimpro.hu/d/down",
    report: "https://drop.dimpro.hu/report/report",
  },
};

const invitation = await sendDropPackageInvitations(created as never, {
  getMailConfig: getMailConfig as never,
  listRecipients: async () => [...recipients] as never,
  listMemberRecipients: async () => [] as never,
  sendMail: sendMail as never,
  markInvitationSent: async ({ recipientId }: { recipientId: string }) => {
    marked.push(recipientId);
    return { id: recipientId, invitation_sent_at: new Date().toISOString() } as never;
  },
  writeEvent: writeEvent as never,
});

assert.equal(invitation.enabled, true);
assert.equal(invitation.configured, true);
assert.equal(invitation.attempted, 2);
assert.equal(invitation.sent, 1);
assert.equal(invitation.failed, 1);
assert.equal(invitation.skipped, 1);
assert.deepEqual(marked, [recipients[0].id]);
assert.deepEqual(events.map((event) => event.eventType), ["email.invitation.sent", "email.invitation.failed"]);
assert.match(sentMails[0].text, /DMP-2608-EMAIL/);
assert.match(sentMails[0].text, /123-456/);
assert.match(sentMails[0].text, /https:\/\/drop\.dimpro\.hu\/p\/view/);

sentMails.length = 0;
events.length = 0;
const upload = await sendDropUploadCompleteNotifications({
  packageId: packageRow.id,
  uploadedByName: "Feltöltő Partner",
  uploadedByEmail: "siker@example.hu",
  files: [
    { id: "51111111-1111-4111-8111-111111111111", name: "terv_A01.pdf", sizeBytes: 2_500_000, mimeType: "application/pdf" },
    { id: "61111111-1111-4111-8111-111111111111", name: "helyszini_foto.jpg", sizeBytes: 1_250_000, mimeType: "image/jpeg" },
  ],
}, {
  getMailConfig: getMailConfig as never,
  findPackage: async () => packageRow as never,
  listRecipients: async () => [...recipients] as never,
  listMemberRecipients: async () => [] as never,
  sendMail: (async (input: { to: string[]; subject: string; text: string; html: string }) => {
    sentMails.push(input);
    return { messageId: `upload-${sentMails.length}`, profileId: "drive", from: "ertesites.drive@dimpro.hu" };
  }) as never,
  writeEvent: writeEvent as never,
});

assert.equal(upload.attempted, 2, "A feltöltő saját címe kimarad; a másik címzett és a csomaggazda kap levelet.");
assert.equal(upload.sent, 2);
assert.equal(upload.failed, 0);
assert.deepEqual(sentMails.map((mail) => mail.to[0]).sort(), ["hiba@example.hu", "szervezo@example.hu"]);
assert.ok(sentMails.every((mail) => mail.text.includes("terv_A01.pdf") && mail.text.includes("helyszini_foto.jpg")));
assert.equal(events.filter((event) => event.eventType === "email.upload_complete.sent").length, 2);

console.log(JSON.stringify({
  ok: true,
  invitation: {
    attempted: invitation.attempted,
    sent: invitation.sent,
    failed: invitation.failed,
    skipped: invitation.skipped,
  },
  upload: {
    attempted: upload.attempted,
    sent: upload.sent,
    failed: upload.failed,
  },
}, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
