import { getMailProfilesSafeConfig, sendDimproMail } from "@/app/lib/license/mail-profiles";
import { renderMeetingDocx } from "./docx-export";
import { renderMeetingHtml } from "./export";
import type { MeetingWorkspace } from "./types";

type MailAttachment = { filename: string; content: Buffer; contentType: string };

const MEETING_MAIL_PROFILE = "notifications" as const;

function safeName(value: string) {
  return String(value || "dimpro-dokumentum").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 140);
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function renderPdf(workspace: MeetingWorkspace) {
  const html = renderMeetingHtml(workspace, false);
  let browser: Awaited<ReturnType<(typeof import("puppeteer"))["default"]["launch"]>> | null = null;
  try {
    const { default: puppeteer } = await import("puppeteer");
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" } }));
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export async function meetingEmailStatus() {
  const config = await getMailProfilesSafeConfig();
  const profile = config.profiles.find((item) => item.id === MEETING_MAIL_PROFILE);
  return {
    configured: Boolean(profile?.enabled && profile.smtpConfigured),
    from: profile?.address || "",
    profileId: MEETING_MAIL_PROFILE,
  };
}

export async function sendMeetingSummaryEmail(input: {
  workspace: MeetingWorkspace;
  recipients: string[];
  subject: string;
  sentBy: string;
  includePdf: boolean;
  includeDocx: boolean;
}) {
  const smtpStatus = await meetingEmailStatus();
  if (!smtpStatus.configured) throw new Error("A DIMPRO Értesítések e-mail profil nincs teljesen beállítva. Ellenőrizd az admin e-mail beállításokat.");
  const recipients = [...new Set(input.recipients.map((item) => item.trim().toLowerCase()).filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)))];
  if (recipients.length === 0) throw new Error("Nincs érvényes e-mail-cím a címzettek között.");
  const summary = input.workspace.publishedSummaries.find((item) => item.id === input.workspace.activePublishedSummaryId && !item.revokedAt);
  if (!summary) throw new Error("Előbb közzé kell tenni az értekezleti összefoglalót.");

  const baseName = safeName(`${input.workspace.minuteNumber || input.workspace.title}-${input.workspace.documentLabel}`);
  const attachments: MailAttachment[] = [];
  if (input.includeDocx) attachments.push({ filename: `${baseName}.docx`, content: await renderMeetingDocx(input.workspace, false), contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  if (input.includePdf) attachments.push({ filename: `${baseName}.pdf`, content: await renderPdf(input.workspace), contentType: "application/pdf" });

  const result = await sendDimproMail({
    profileId: MEETING_MAIL_PROFILE,
    to: recipients,
    replyTo: "info@dimpro.hu",
    subject: input.subject,
    text: `${summary.closingTitle}\n\n${summary.closingMessage}\n\n${summary.emailNotice}\n\n${summary.body}`,
    html: `<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.55"><h2 style="color:#0f766e">${escapeHtml(summary.closingTitle)}</h2><p>${escapeHtml(summary.closingMessage)}</p><p style="background:#fff7d6;border-left:4px solid #d6a900;padding:10px">${escapeHtml(summary.emailNotice)}</p><h3>${escapeHtml(summary.title)}</h3><div style="white-space:pre-wrap">${escapeHtml(summary.body)}</div><hr><small>DIMPRO Értekezleti Asszisztens · Küldte: ${escapeHtml(input.sentBy)}</small></div>`,
    attachments,
  });
  return { messageId: result.messageId || "", recipients, attachments: attachments.map((item) => item.filename) };
}

export async function sendMeetingPresentationCodeEmail(input: {
  workspace: MeetingWorkspace;
  recipientEmail: string;
  recipientName: string;
  code: string;
  expiresAt: string;
  issuedBy: string;
  activationUrl: string;
}) {
  const smtpStatus = await meetingEmailStatus();
  if (!smtpStatus.configured) throw new Error("A DIMPRO Értesítések e-mail profil nincs beállítva, ezért a vezérlőkód nem küldhető el.");
  const recipient = input.recipientEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error("A vezérlőkód címzettjének e-mail-címe érvénytelen.");
  const formatted = input.code.replace(/\D/g, "").replace(/(\d{3})(\d{3})/, "$1-$2");
  const expires = new Date(input.expiresAt).toLocaleString("hu-HU");
  const subject = `DIMPRO Értekezleti Kísérő – közös nézet vezérlőkód – ${input.workspace.minuteNumber || input.workspace.title}`;
  const result = await sendDimproMail({
    profileId: MEETING_MAIL_PROFILE,
    to: [recipient],
    replyTo: "admin@dimpro.hu",
    subject,
    text: [
      `Kedves ${input.recipientName || "Résztvevő"}!`,
      "",
      `${input.issuedBy || "Az értekezlet szervezője"} ideiglenes közösnézet-vezérlési jogosultságot adott a DIMPRO Értekezleti Kísérőben.`,
      `Értekezlet: ${input.workspace.title}`,
      `Vezérlőkód: ${formatted}`,
      `Érvényes: ${expires}`,
      "",
      `Megnyitás: ${input.activationUrl}`,
      "",
      "A kód kizárólag a megosztott nézet navigációját vezérli. Jegyzőkönyv-szerkesztési vagy adminisztrátori jogosultságot nem ad.",
    ].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.55;max-width:680px;margin:auto"><h2 style="color:#0f766e">DIMPRO Értekezleti Kísérő</h2><p>Kedves <b>${escapeHtml(input.recipientName || "Résztvevő")}</b>!</p><p><b>${escapeHtml(input.issuedBy || "Az értekezlet szervezője")}</b> ideiglenes közösnézet-vezérlési jogosultságot adott.</p><div style="border:1px solid #99f6e4;background:#f0fdfa;border-radius:14px;padding:18px;margin:18px 0"><div style="font-size:12px;color:#475569">Értekezlet</div><div style="font-weight:700">${escapeHtml(input.workspace.title)}</div><div style="margin-top:14px;font-size:12px;color:#475569">Egyszer használatos vezérlőkód</div><div style="font-size:34px;font-weight:900;letter-spacing:6px;color:#0f766e">${escapeHtml(formatted)}</div><div style="margin-top:8px;font-size:12px;color:#475569">Érvényes: ${escapeHtml(expires)}</div></div><p><a href="${escapeHtml(input.activationUrl)}" style="display:inline-block;background:#0f766e;color:white;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">DIMPRO panel megnyitása</a></p><p style="font-size:12px;color:#64748b">A kód kizárólag a megosztott nézet navigációját vezérli. Jegyzőkönyv-szerkesztési vagy adminisztrátori jogosultságot nem ad.</p></div>`,
  });
  return { messageId: result.messageId || "", recipient, subject };
}
