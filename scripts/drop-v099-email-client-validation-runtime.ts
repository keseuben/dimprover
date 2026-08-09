import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DimproMailAttachment, MailProfileId } from "../app/lib/license/mail-profiles";

type MailInput = {
  profileId: MailProfileId;
  to: string[];
  subject: string;
  text: string;
  html: string;
  attachments?: DimproMailAttachment[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectCode(action: () => Promise<unknown>, code: string) {
  try {
    await action();
    throw new Error(`A várt ${code} hiba nem történt meg.`);
  } catch (error) {
    assert(Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === code), `Eltérő hibakód; várt: ${code}`);
  }
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "drop-v099-validation-"));
  process.env.DIMPRO_PROJECT_ROOT = tempRoot;
  try {
    const service = await import("../app/lib/drop/validation/dropEmailClientValidation");
    const sentMessages: MailInput[] = [];
    const sendMail = async (input: MailInput) => {
      sentMessages.push(input);
      return { messageId: `mock-${sentMessages.length}`, profileId: input.profileId, from: "ertesites.drive@dimpro.hu" };
    };
    const checks: string[] = [];
    const check = (name: string, condition: unknown) => { assert(condition, name); checks.push(name); };

    const preview = await service.buildDropEmailValidationPreview("thunderbird");
    check("preview-client", preview.client.id === "thunderbird");
    check("preview-count-3", preview.previewCount === 3);
    check("file-count-5", preview.files.length === 5);
    check("cid-html-count", (preview.html.match(/src="cid:/g) || []).length === 3);
    check("browser-data-image-count", (preview.browserHtml.match(/data:image\/jpeg;base64,/g) || []).length === 3);
    check("browser-no-cid", !preview.browserHtml.includes('src="cid:'));
    check("attachments-3", preview.attachments.length === 3);
    check("attachments-inline", preview.attachments.every((item) => item.contentDisposition === "inline" && item.cid));
    check("attachments-only-thumbnails", preview.attachments.every((item) => item.filename.startsWith("dimpro-drop-validation-")));
    check("subject-test-marked", preview.subject.startsWith("[TESZT – NEM VALÓDI KÜLDEMÉNY]"));
    check("html-test-banner", preview.html.includes("TESZTÜZENET – NEM VALÓDI FÁJLKÜLDEMÉNY"));
    check("html-production-layout", preview.html.includes('<table role="presentation"'));
    check("plain-text-fallback", preview.text.includes("Vizsgált levelezőkliens: Mozilla Thunderbird"));
    check("zip-download-notice", preview.text.includes("egyetlen ZIP-csomagban"));

    const safety = service.getDropEmailValidationSafety();
    check("safety-admin-only", safety.adminOnly === true);
    check("safety-manual-recipient", safety.explicitRecipientRequired === true);
    check("safety-confirmation", safety.confirmationPhrase === "TESZT");
    check("safety-cooldown", safety.sameRecipientCooldownSeconds === 60);
    check("safety-daily-limit", safety.maximumDailyTestEmails === 20);
    check("safety-production-template", safety.usesProductionTemplate === true);
    check("safety-no-original-files", safety.originalFilesAttached === false);
    check("safety-no-real-package", safety.realPackageAccessGranted === false);
    check("safety-not-public", safety.publicEndpoint === false);

    check("initial-history-empty", (await service.listDropEmailValidationHistory()).length === 0);
    await expectCode(() => service.sendDropEmailValidationTest({ recipientEmail: "hibas", clientId: "gmail_web", confirmation: "TESZT" }, { sendMail }), "DROP_EMAIL_VALIDATION_RECIPIENT_INVALID");
    await expectCode(() => service.sendDropEmailValidationTest({ recipientEmail: "test@example.hu", clientId: "unknown", confirmation: "TESZT" }, { sendMail }), "DROP_EMAIL_VALIDATION_CLIENT_INVALID");
    await expectCode(() => service.sendDropEmailValidationTest({ recipientEmail: "test@example.hu", clientId: "gmail_web", confirmation: "NEM" }, { sendMail }), "DROP_EMAIL_VALIDATION_CONFIRMATION_REQUIRED");
    check("invalid-input-no-send", sentMessages.length === 0);

    const sent = await service.sendDropEmailValidationTest({
      recipientEmail: "teszt@example.hu",
      clientId: "gmail_mobile",
      notes: "Mobil Gmail világos mód",
      confirmation: "TESZT",
    }, { sendMail });
    check("mock-send-called-once", sentMessages.length === 1);
    check("sent-record", sent.sent === true && sent.messageId === "mock-1");
    check("sent-client", sent.clientId === "gmail_mobile");
    check("sent-pending-review", sent.reviewStatus === "pending");
    const message = sentMessages[0];
    check("mail-profile-drive", message.profileId === "drive");
    check("mail-recipient-exact", message.to.length === 1 && message.to[0] === "teszt@example.hu");
    check("mail-subject-test", message.subject.startsWith("[TESZT – NEM VALÓDI KÜLDEMÉNY]"));
    check("mail-inline-attachments", message.attachments?.length === 3 && message.attachments.every((item) => item.contentDisposition === "inline"));
    check("mail-no-original-file-attachments", Boolean(message.attachments?.every((item) => !["helyszini-foto.jpg", "tervreszlet.png", "iphone-foto.heic", "muszaki-tervcsomag.pdf", "dokumentumcsomag.zip"].includes(item.filename))));
    await expectCode(() => service.sendDropEmailValidationTest({ recipientEmail: "teszt@example.hu", clientId: "gmail_mobile", confirmation: "TESZT" }, { sendMail }), "DROP_EMAIL_VALIDATION_RATE_LIMIT");
    check("rate-limit-no-second-send", sentMessages.length === 1);

    let history = await service.listDropEmailValidationHistory();
    check("history-one-record", history.length === 1 && history[0].id === sent.id);
    const reviewed = await service.reviewDropEmailValidation({ id: sent.id, reviewStatus: "passed", reviewNotes: "Képek és gomb rendben." });
    check("review-passed", reviewed.reviewStatus === "passed");
    check("review-note", reviewed.reviewNotes === "Képek és gomb rendben.");
    check("review-time", typeof reviewed.reviewedAt === "string");
    history = await service.listDropEmailValidationHistory();
    check("history-review-persisted", history[0].reviewStatus === "passed");
    await expectCode(() => service.reviewDropEmailValidation({ id: "missing", reviewStatus: "failed" }), "DROP_EMAIL_VALIDATION_NOT_FOUND");

    const statePath = path.join(tempRoot, ".dimprover", "mail", "drop-email-client-validation.json");
    check("state-exists", fs.existsSync(statePath));
    check("state-mode-0600", (fs.statSync(statePath).mode & 0o777) === 0o600);
    const rawState = fs.readFileSync(statePath, "utf8");
    check("state-no-confirmation", !rawState.includes('"confirmation"'));
    check("state-no-inline-image-bytes", !rawState.includes("base64"));
    check("state-no-drop-token", !rawState.includes("downloadToken") && !rawState.includes("uploadCapability"));

    const failingSend = async () => { throw new Error("Mock SMTP hiba"); };
    await expectCode(() => service.sendDropEmailValidationTest({ recipientEmail: "hiba@example.hu", clientId: "outlook_desktop", notes: "SMTP hiba teszt", confirmation: "TESZT" }, { sendMail: failingSend }), "DROP_EMAIL_VALIDATION_SEND_FAILED");
    history = await service.listDropEmailValidationHistory();
    check("failed-attempt-audited", history.some((item) => item.recipientEmail === "hiba@example.hu" && item.sent === false && item.sendError === "Mock SMTP hiba"));

    console.log(JSON.stringify({ ok: true, passed: checks.length, total: checks.length, sentMessages: sentMessages.length, stateMode: (fs.statSync(statePath).mode & 0o777).toString(8), checks }, null, 2));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
