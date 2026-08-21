import { createHash } from "node:crypto";
import type { DimproSendEntitlement, DimproSendRecipient, DimproSendUser } from "@/app/lib/identity-core/types";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import { getMailProfilesSafeConfig, sendDimproMail } from "@/app/lib/license/mail-profiles";

const REPORT_MAIL_PROFILE = "drop" as const;
export const FIELD_CAPTURE_REPORT_EMAIL_MAX_BYTES = 15 * 1024 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RecipientPolicyContext = {
  user: DimproSendUser;
  entitlement: Pick<DimproSendEntitlement, "recipientMode" | "maxRecipients">;
  defaultRecipient: DimproSendRecipient | null;
  recipients: DimproSendRecipient[];
};

type SendMail = typeof sendDimproMail;

function cleanEmail(value: unknown) {
  const email = String(value ?? "").normalize("NFKC").trim().toLowerCase().slice(0, 254);
  return EMAIL_RE.test(email) ? email : "";
}

function uniqueEmails(values: unknown[]) {
  return [...new Set(values.map(cleanEmail).filter(Boolean))];
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeFileName(value: string) {
  const name = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 160);
  return name.toLowerCase().endsWith(".pdf") ? name : `${name || "DIMPRO_Terepi_osszesito"}.pdf`;
}

export function resolveFieldCaptureReportRecipients(requested: unknown[], context: RecipientPolicyContext) {
  const maxRecipients = Math.max(1, Math.min(50, Number(context.entitlement.maxRecipients) || 1));
  const requestedEmails = uniqueEmails(requested);
  const approved = new Set(uniqueEmails(context.recipients.map((item) => item.email)));
  const defaultEmail = cleanEmail(context.defaultRecipient?.email);

  let recipients: string[] = [];
  if (context.entitlement.recipientMode === "locked_default") {
    if (!defaultEmail) {
      throw new DimproIdentityError("A Terep e-mail küldéshez nincs beállított alapértelmezett címzett.", "FIELD_CAPTURE_REPORT_EMAIL_DEFAULT_RECIPIENT_MISSING", 409);
    }
    if (requestedEmails.length && (requestedEmails.length !== 1 || requestedEmails[0] !== defaultEmail)) {
      throw new DimproIdentityError("Ehhez a Send-jogosultsághoz csak a rögzített alapértelmezett címzett használható.", "FIELD_CAPTURE_REPORT_EMAIL_RECIPIENT_LOCKED", 403);
    }
    recipients = [defaultEmail];
  } else if (context.entitlement.recipientMode === "approved_list") {
    recipients = requestedEmails;
    if (!recipients.length && defaultEmail) recipients = [defaultEmail];
    if (recipients.some((email) => !approved.has(email))) {
      throw new DimproIdentityError("A megadott e-mail-cím nem szerepel az engedélyezett DIMPRO Send címzettek között.", "FIELD_CAPTURE_REPORT_EMAIL_RECIPIENT_NOT_APPROVED", 403);
    }
  } else if (context.entitlement.recipientMode === "free_entry") {
    recipients = requestedEmails;
    if (!recipients.length && defaultEmail) recipients = [defaultEmail];
  } else {
    throw new DimproIdentityError("A DIMPRO Send címzettmódja nem támogatott.", "FIELD_CAPTURE_REPORT_EMAIL_RECIPIENT_MODE_INVALID", 500);
  }

  if (!recipients.length) {
    throw new DimproIdentityError("Adj meg legalább egy érvényes e-mail-címet.", "FIELD_CAPTURE_REPORT_EMAIL_RECIPIENT_REQUIRED", 400);
  }
  if (recipients.length > maxRecipients) {
    throw new DimproIdentityError(`Legfeljebb ${maxRecipients} címzett adható meg.`, "FIELD_CAPTURE_REPORT_EMAIL_RECIPIENT_LIMIT", 400);
  }
  return recipients;
}

export async function getFieldCaptureReportEmailStatus(context: RecipientPolicyContext) {
  const config = await getMailProfilesSafeConfig();
  const profile = config.profiles.find((item) => item.id === REPORT_MAIL_PROFILE);
  const defaultEmail = cleanEmail(context.defaultRecipient?.email);
  const approved = uniqueEmails(context.recipients.map((item) => item.email));
  const suggestedRecipients = context.entitlement.recipientMode === "locked_default"
    ? (defaultEmail ? [defaultEmail] : [])
    : context.entitlement.recipientMode === "approved_list"
      ? (defaultEmail ? [defaultEmail, ...approved.filter((email) => email !== defaultEmail)] : approved)
      : (defaultEmail ? [defaultEmail] : [cleanEmail(context.user.email)].filter(Boolean));
  return {
    configured: Boolean(profile?.enabled && profile.smtpConfigured),
    from: profile?.address || "",
    profileId: REPORT_MAIL_PROFILE,
    recipientMode: context.entitlement.recipientMode,
    maxRecipients: Math.max(1, Math.min(50, Number(context.entitlement.maxRecipients) || 1)),
    suggestedRecipients,
  };
}

export function validateFieldCaptureReportPdf(bytes: Uint8Array, fileName: string) {
  if (!bytes.length || bytes.length > FIELD_CAPTURE_REPORT_EMAIL_MAX_BYTES) {
    throw new DimproIdentityError("A Terepi összesítő PDF üres vagy meghaladja a 15 MB-os e-mail korlátot.", "FIELD_CAPTURE_REPORT_EMAIL_PDF_SIZE_INVALID", 413);
  }
  const header = new TextDecoder("ascii").decode(bytes.slice(0, 5));
  if (header !== "%PDF-") {
    throw new DimproIdentityError("A csatolmány nem érvényes PDF dokumentum.", "FIELD_CAPTURE_REPORT_EMAIL_PDF_INVALID", 400);
  }
  return safeFileName(fileName);
}

export type PreparedFieldCaptureReportEmail = {
  recipients: string[];
  attachmentName: string;
  subject: string;
  message: string;
  reportTitle: string;
  sessionLabel: string;
  sender: string;
  pdfBytes: Uint8Array;
  payloadSha256: string;
  context: RecipientPolicyContext;
};

function digestHex(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

export async function prepareFieldCaptureReportEmail(input: {
  context: RecipientPolicyContext;
  requestedRecipients: unknown[];
  subject: string;
  message: string;
  sessionLabel: string;
  reportTitle: string;
  pdfFileName: string;
  pdfBytes: Uint8Array;
}): Promise<PreparedFieldCaptureReportEmail> {
  const status = await getFieldCaptureReportEmailStatus(input.context);
  if (!status.configured) {
    throw new DimproIdentityError("A DIMPRO Drop e-mail profil nincs teljesen beállítva.", "FIELD_CAPTURE_REPORT_EMAIL_SMTP_NOT_CONFIGURED", 503);
  }
  const recipients = resolveFieldCaptureReportRecipients(input.requestedRecipients, input.context);
  const attachmentName = validateFieldCaptureReportPdf(input.pdfBytes, input.pdfFileName);
  const subject = input.subject.normalize("NFKC").replace(/[\r\n]+/g, " ").trim().slice(0, 300)
    || `DIMPRO Terepi összesítő – ${input.reportTitle || input.sessionLabel}`;
  const message = input.message.normalize("NFKC").trim().slice(0, 5000)
    || "Csatoltan küldöm a DIMPRO Terepi Gyorsrögzítő összesítő riportját.";
  const reportTitle = input.reportTitle.normalize("NFKC").trim().slice(0, 200) || "Terepi összesítő";
  const sender = input.context.user.fullName || input.context.user.email;
  const pdfSha256 = digestHex(input.pdfBytes);
  const payloadSha256 = digestHex(JSON.stringify({
    profileId: REPORT_MAIL_PROFILE,
    recipients: [...recipients].sort(),
    subject,
    message,
    reportTitle,
    sessionLabel: input.sessionLabel,
    attachmentName,
    pdfSha256,
  }));
  return { recipients, attachmentName, subject, message, reportTitle, sessionLabel: input.sessionLabel, sender, pdfBytes: input.pdfBytes, payloadSha256, context: input.context };
}

export async function sendPreparedFieldCaptureReportEmail(prepared: PreparedFieldCaptureReportEmail, sendMail: SendMail = sendDimproMail) {
  try {
    const result = await sendMail({
      profileId: REPORT_MAIL_PROFILE,
      to: prepared.recipients,
      replyTo: prepared.context.user.email,
      subject: prepared.subject,
      text: [prepared.message, "", `Riport: ${prepared.reportTitle}`, `Munkamenet: ${prepared.sessionLabel}`, `Küldte: ${prepared.sender}`, "", "A PDF a rögzített terepi munkamenet összesítője; önmagában nem igazolja a teljes projekt készültségi fokát."].join("\n"),
      html: `<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.55;max-width:720px;margin:auto"><h2 style="color:#0e7490">DIMPRO Terepi Gyorsrögzítő</h2><p>${escapeHtml(prepared.message)}</p><div style="border:1px solid #bae6fd;background:#f0f9ff;border-radius:14px;padding:14px"><strong>${escapeHtml(prepared.reportTitle)}</strong><br><span style="color:#475569">Munkamenet: ${escapeHtml(prepared.sessionLabel)}</span></div><p style="font-size:12px;color:#64748b">A csatolt PDF csak a rögzített és megtekintett munkaterületekre vonatkozik; nem minősül a teljes projekt készültségi igazolásának.</p><hr><small>DIMPRO · Küldte: ${escapeHtml(prepared.sender)}</small></div>`,
      attachments: [{ filename: prepared.attachmentName, content: Buffer.from(prepared.pdfBytes), contentType: "application/pdf", contentDisposition: "attachment" }],
    });
    return { messageId: result.messageId || "", profileId: result.profileId, from: result.from, recipients: prepared.recipients, attachmentName: prepared.attachmentName, subject: prepared.subject };
  } catch (error) {
    if (error instanceof DimproIdentityError) throw error;
    throw new DimproIdentityError("A Terepi összesítő e-mail küldése sikertelen. A változatlan kérés biztonságosan újrapróbálható.", "FIELD_CAPTURE_REPORT_EMAIL_SEND_FAILED", 502);
  }
}

export async function sendFieldCaptureReportEmail(input: {
  context: RecipientPolicyContext;
  requestedRecipients: unknown[];
  subject: string;
  message: string;
  sessionLabel: string;
  reportTitle: string;
  pdfFileName: string;
  pdfBytes: Uint8Array;
  sendMail?: SendMail;
}) {
  const prepared = await prepareFieldCaptureReportEmail(input);
  return sendPreparedFieldCaptureReportEmail(prepared, input.sendMail || sendDimproMail);
}
