import {
  getMailProfilesSafeConfig,
  sendDimproMail,
} from "@/app/lib/license/mail-profiles";
import { getDropFeatureState } from "./dropFeatureFlags";
import {
  findDropPackageById,
  listDropPackageMemberNotificationRecipients,
  listDropRecipientsForPackage,
  markDropInvitationSent,
  writeDropEvent,
} from "./dropRepository";
import type {
  DropCreatedPackage,
  DropPackageRecord,
  DropRecipientRecord,
} from "./dropTypes";

export type DropEmailDeliveryKind = "invitation" | "upload_complete";
export type DropEmailDeliveryStatus = "sent" | "failed";

export type DropEmailDeliveryItem = {
  recipientId: string | null;
  name: string;
  email: string;
  status: DropEmailDeliveryStatus;
  messageId?: string;
  auditPersisted: boolean;
  error?: string;
};

export type DropEmailDeliverySummary = {
  enabled: boolean;
  configured: boolean;
  kind: DropEmailDeliveryKind;
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  recipients: DropEmailDeliveryItem[];
  generatedAt: string;
  note: string;
};

export type DropUploadNotificationFile = {
  id?: string | null;
  name: string;
  sizeBytes: number;
  mimeType?: string;
};

type MailSender = typeof sendDimproMail;
type DropEmailDependencies = {
  sendMail?: MailSender;
  getMailConfig?: typeof getMailProfilesSafeConfig;
  findPackage?: typeof findDropPackageById;
  listRecipients?: typeof listDropRecipientsForPackage;
  listMemberRecipients?: typeof listDropPackageMemberNotificationRecipients;
  markInvitationSent?: typeof markDropInvitationSent;
  writeEvent?: typeof writeDropEvent;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isEmail(value: string | null | undefined) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("hu-HU", { timeZone: "Europe/Budapest" });
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${new Intl.NumberFormat("hu-HU", { maximumFractionDigits: unitIndex > 1 ? 1 : 0 }).format(size)} ${units[unitIndex]}`;
}

function disabledSummary(kind: DropEmailDeliveryKind, note: string, configured = false): DropEmailDeliverySummary {
  return {
    enabled: false,
    configured,
    kind,
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    recipients: [],
    generatedAt: new Date().toISOString(),
    note,
  };
}

async function isDropMailConfigured(getMailConfig: typeof getMailProfilesSafeConfig) {
  const config = await getMailConfig();
  const drop = config.profiles.find((profile) => profile.id === "drop");
  return Boolean(drop?.enabled && drop.smtpConfigured);
}

async function safeWriteEvent(
  writeEvent: typeof writeDropEvent,
  input: Parameters<typeof writeDropEvent>[0],
) {
  try {
    await writeEvent(input);
    return true;
  } catch {
    return false;
  }
}

function invitationMessage(input: {
  packageRow: DropCreatedPackage["package"];
  recipient: DropRecipientRecord;
  pin: string;
  links: DropCreatedPackage["links"];
}) {
  const accessPortal = process.env.DROP_PUBLIC_OPEN_URL || "https://drop.dimpro.hu/open";
  const publicCode = input.packageRow.public_code;
  const title = input.packageRow.title;
  const project = input.packageRow.project_name_snapshot?.trim();
  const greeting = input.recipient.name.trim() || "Címzett";
  const formattedPin = input.pin.replace(/(\d{3})(\d{3})/, "$1-$2");
  const subject = `DIMPRO Drop – PIN ${formattedPin} – ${title}`;
  const text = [
    `Tisztelt ${greeting}!`,
    "",
    "Meghívást kapott egy DIMPRO Drop hozzáféréshez.",
    "",
    `Csomag: ${title}`,
    ...(project ? [`Projekt: ${project}`] : []),
    `Csomagkód: ${publicCode}`,
    `PIN: ${formattedPin}`,
    `Lejárat: ${formatDate(input.packageRow.expires_at)}`,
    "",
    `PIN-es belépés: ${accessPortal}`,
    `Közvetlen megtekintés: ${input.links.view}`,
    "",
    "A csomagkódot és a PIN-t bizalmasan kezelje. A közvetlen link továbbadása hozzáférést adhat a csomaghoz.",
    "",
    "Üdvözlettel:",
    "DIMPRO Drop",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:720px;margin:auto">
      <div style="border:1px solid #99f6e4;background:#f0fdfa;border-radius:18px;padding:24px">
        <p style="margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0f766e">DIMPRO Drop meghívó</p>
        <h1 style="margin:0;color:#0f172a;font-size:26px">${escapeHtml(title)}</h1>
        <p>Tisztelt ${escapeHtml(greeting)}!</p>
        <p>Meghívást kapott egy DIMPRO Drop hozzáféréshez.</p>
        <div style="margin:18px 0;border:1px solid #ccfbf1;background:#ffffff;border-radius:14px;padding:16px">
          ${project ? `<p style="margin:0 0 8px"><strong>Projekt:</strong> ${escapeHtml(project)}</p>` : ""}
          <p style="margin:0 0 8px"><strong>Csomagkód:</strong> ${escapeHtml(publicCode)}</p>
          <p style="margin:0 0 8px"><strong>PIN:</strong></p>
          <div style="margin:10px 0 14px;border:2px solid #5eead4;background:#f0fdfa;border-radius:14px;padding:18px;text-align:center;font-size:34px;font-weight:900;letter-spacing:.18em;color:#0f766e">${escapeHtml(formattedPin)}</div>
          <p style="margin:0"><strong>Lejárat:</strong> ${escapeHtml(formatDate(input.packageRow.expires_at))}</p>
        </div>
        <p><a href="${escapeHtml(accessPortal)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:10px">PIN-es belépés</a></p>
        <p><a href="${escapeHtml(input.links.view)}" style="color:#0e7490;font-weight:700">Közvetlen megtekintési link megnyitása</a></p>
        <p style="font-size:13px;color:#475569">A csomagkódot és a PIN-t bizalmasan kezelje. A közvetlen link továbbadása hozzáférést adhat a csomaghoz.</p>
      </div>
      <p style="font-size:12px;color:#64748b">Automatikus DIMPRO Drop rendszerüzenet.</p>
    </div>
  `;
  return { subject, text, html };
}

function uploadMessage(input: {
  packageRow: DropPackageRecord;
  recipientName: string;
  uploadedByName: string;
  uploadedByEmail?: string;
  files: DropUploadNotificationFile[];
}) {
  const title = input.packageRow.title;
  const project = input.packageRow.project_name_snapshot?.trim();
  const viewUrl = `${process.env.DROP_PUBLIC_OPEN_URL || "https://drop.dimpro.hu/open"}`;
  const fileLines = input.files.map((file) => `- ${file.name} (${formatBytes(file.sizeBytes)})`);
  const totalBytes = input.files.reduce((sum, file) => sum + Math.max(0, file.sizeBytes), 0);
  const subject = `DIMPRO Drop – új feltöltés: ${title}`;
  const text = [
    `Tisztelt ${input.recipientName || "Címzett"}!`,
    "",
    `${input.uploadedByName}${input.uploadedByEmail ? ` (${input.uploadedByEmail})` : ""} új fájlokat töltött fel.`,
    "",
    `Csomag: ${title}`,
    ...(project ? [`Projekt: ${project}`] : []),
    `Csomagkód: ${input.packageRow.public_code}`,
    `Fájlok: ${input.files.length} db, összesen ${formatBytes(totalBytes)}`,
    ...fileLines,
    "",
    `PIN-es belépés: ${viewUrl}`,
    "",
    "Üdvözlettel:",
    "DIMPRO Drop",
  ].join("\n");
  const fileHtml = input.files
    .map((file) => `<li style="margin:6px 0"><strong>${escapeHtml(file.name)}</strong> · ${escapeHtml(formatBytes(file.sizeBytes))}</li>`)
    .join("");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:720px;margin:auto">
      <div style="border:1px solid #bae6fd;background:#f0f9ff;border-radius:18px;padding:24px">
        <p style="margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0369a1">DIMPRO Drop feltöltési értesítés</p>
        <h1 style="margin:0;color:#0f172a;font-size:24px">${escapeHtml(title)}</h1>
        <p>Tisztelt ${escapeHtml(input.recipientName || "Címzett")}!</p>
        <p><strong>${escapeHtml(input.uploadedByName)}</strong>${input.uploadedByEmail ? ` (${escapeHtml(input.uploadedByEmail)})` : ""} új fájlokat töltött fel.</p>
        ${project ? `<p><strong>Projekt:</strong> ${escapeHtml(project)}</p>` : ""}
        <p><strong>Csomagkód:</strong> ${escapeHtml(input.packageRow.public_code)} · <strong>Fájlok:</strong> ${input.files.length} db · ${escapeHtml(formatBytes(totalBytes))}</p>
        <ul style="padding-left:20px">${fileHtml}</ul>
        <p><a href="${escapeHtml(viewUrl)}" style="display:inline-block;background:#0369a1;color:#fff;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:10px">DIMPRO Drop megnyitása</a></p>
      </div>
      <p style="font-size:12px;color:#64748b">Automatikus DIMPRO Drop rendszerüzenet.</p>
    </div>
  `;
  return { subject, text, html };
}

export async function sendDropPackageInvitations(
  created: DropCreatedPackage,
  dependencies: DropEmailDependencies = {},
): Promise<DropEmailDeliverySummary> {
  const featureEnabled = getDropFeatureState().flags.emailNotificationsEnabled;
  if (!featureEnabled) return disabledSummary("invitation", "A Drop e-mail értesítési feature flag ki van kapcsolva.");

  const getMailConfig = dependencies.getMailConfig || getMailProfilesSafeConfig;
  const sendMail = dependencies.sendMail || sendDimproMail;
  const listRecipients = dependencies.listRecipients || listDropRecipientsForPackage;
  const markInvitation = dependencies.markInvitationSent || markDropInvitationSent;
  const writeEvent = dependencies.writeEvent || writeDropEvent;
  const configured = await isDropMailConfigured(getMailConfig).catch(() => false);
  if (!configured) return disabledSummary("invitation", "A DIMPRO Drop SMTP-profil nincs teljesen beállítva.", false);

  const allRecipients = await listRecipients(created.package.id);
  const recipients = allRecipients.filter((recipient) => recipient.receive_invitation && isEmail(recipient.email));
  const skipped = allRecipients.length - recipients.length;
  const results: DropEmailDeliveryItem[] = [];

  for (const recipient of recipients) {
    const message = invitationMessage({
      packageRow: created.package,
      recipient,
      pin: created.pin,
      links: created.links,
    });
    try {
      const sent = await sendMail({
        profileId: "drop",
        to: [recipient.email],
        replyTo: created.package.uploader_email || "info@dimpro.hu",
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      await markInvitation({ packageId: created.package.id, recipientId: recipient.id });
      const auditPersisted = await safeWriteEvent(writeEvent, {
        packageId: created.package.id,
        recipientId: recipient.id,
        eventType: "email.invitation.sent",
        actorName: created.package.uploader_name || "DIMPRO licencadmin",
        actorEmail: created.package.uploader_email || null,
        payload: {
          recipientEmail: recipient.email,
          profileId: sent.profileId,
          messageId: sent.messageId,
        },
      });
      results.push({
        recipientId: recipient.id,
        name: recipient.name,
        email: recipient.email,
        status: "sent",
        messageId: sent.messageId,
        auditPersisted,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Ismeretlen e-mail küldési hiba.";
      const auditPersisted = await safeWriteEvent(writeEvent, {
        packageId: created.package.id,
        recipientId: recipient.id,
        eventType: "email.invitation.failed",
        severity: "error",
        actorName: created.package.uploader_name || "DIMPRO licencadmin",
        actorEmail: created.package.uploader_email || null,
        payload: { recipientEmail: recipient.email, error: errorMessage },
      });
      results.push({
        recipientId: recipient.id,
        name: recipient.name,
        email: recipient.email,
        status: "failed",
        auditPersisted,
        error: errorMessage,
      });
    }
  }

  const sent = results.filter((item) => item.status === "sent").length;
  const failed = results.length - sent;
  return {
    enabled: true,
    configured: true,
    kind: "invitation",
    attempted: results.length,
    sent,
    failed,
    skipped,
    recipients: results,
    generatedAt: new Date().toISOString(),
    note: results.length
      ? `${sent} meghívó elküldve, ${failed} sikertelen, ${skipped} kihagyva.`
      : "Nincs e-mailes meghívásra kijelölt címzett.",
  };
}

export async function sendDropUploadCompleteNotifications(
  input: {
    packageId: string;
    uploadedByName: string;
    uploadedByEmail?: string;
    files: DropUploadNotificationFile[];
  },
  dependencies: DropEmailDependencies = {},
): Promise<DropEmailDeliverySummary> {
  const featureEnabled = getDropFeatureState().flags.emailNotificationsEnabled;
  if (!featureEnabled) return disabledSummary("upload_complete", "A Drop e-mail értesítési feature flag ki van kapcsolva.");
  if (!input.files.length) return disabledSummary("upload_complete", "Nem történt fájlfeltöltés, ezért nem indult értesítés.", true);

  const getMailConfig = dependencies.getMailConfig || getMailProfilesSafeConfig;
  const sendMail = dependencies.sendMail || sendDimproMail;
  const findPackage = dependencies.findPackage || findDropPackageById;
  const listRecipients = dependencies.listRecipients || listDropRecipientsForPackage;
  const listMemberRecipients = dependencies.listMemberRecipients || listDropPackageMemberNotificationRecipients;
  const writeEvent = dependencies.writeEvent || writeDropEvent;
  const configured = await isDropMailConfigured(getMailConfig).catch(() => false);
  if (!configured) return disabledSummary("upload_complete", "A DIMPRO Drop SMTP-profil nincs teljesen beállítva.", false);

  const packageRow = await findPackage(input.packageId);
  if (!packageRow) throw new Error("A Drop csomag nem található a feltöltési értesítéshez.");
  if (packageRow.notify_on_upload_complete === false) {
    return disabledSummary("upload_complete", "A csomagnál a feltöltési értesítés ki van kapcsolva.", true);
  }

  const [recipientRows, memberRows] = await Promise.all([
    listRecipients(input.packageId),
    listMemberRecipients(input.packageId),
  ]);
  const recipientMap = new Map<string, { recipientId: string | null; name: string; email: string }>();
  for (const recipient of recipientRows) {
    if (!recipient.receive_activity_notifications || !isEmail(recipient.email)) continue;
    recipientMap.set(recipient.email.toLowerCase(), {
      recipientId: recipient.id,
      name: recipient.name,
      email: recipient.email,
    });
  }
  for (const member of memberRows) {
    if (!isEmail(member.email)) continue;
    recipientMap.set(member.email.toLowerCase(), {
      recipientId: null,
      name: member.name,
      email: member.email,
    });
  }
  if (isEmail(packageRow.uploader_email)) {
    recipientMap.set(packageRow.uploader_email.toLowerCase(), {
      recipientId: null,
      name: packageRow.uploader_name || "Feltöltő",
      email: packageRow.uploader_email,
    });
  }
  if (isEmail(input.uploadedByEmail)) recipientMap.delete(input.uploadedByEmail!.trim().toLowerCase());

  const recipients = [...recipientMap.values()];
  const results: DropEmailDeliveryItem[] = [];
  for (const recipient of recipients) {
    const message = uploadMessage({
      packageRow,
      recipientName: recipient.name,
      uploadedByName: input.uploadedByName,
      uploadedByEmail: input.uploadedByEmail,
      files: input.files,
    });
    try {
      const sent = await sendMail({
        profileId: "drop",
        to: [recipient.email],
        replyTo: packageRow.uploader_email || "info@dimpro.hu",
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      const auditPersisted = await safeWriteEvent(writeEvent, {
        packageId: packageRow.id,
        recipientId: recipient.recipientId,
        eventType: "email.upload_complete.sent",
        actorName: input.uploadedByName,
        actorEmail: input.uploadedByEmail || null,
        payload: {
          recipientEmail: recipient.email,
          fileCount: input.files.length,
          fileIds: input.files.map((file) => file.id).filter(Boolean),
          profileId: sent.profileId,
          messageId: sent.messageId,
        },
      });
      results.push({
        recipientId: recipient.recipientId,
        name: recipient.name,
        email: recipient.email,
        status: "sent",
        messageId: sent.messageId,
        auditPersisted,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Ismeretlen e-mail küldési hiba.";
      const auditPersisted = await safeWriteEvent(writeEvent, {
        packageId: packageRow.id,
        recipientId: recipient.recipientId,
        eventType: "email.upload_complete.failed",
        severity: "error",
        actorName: input.uploadedByName,
        actorEmail: input.uploadedByEmail || null,
        payload: {
          recipientEmail: recipient.email,
          fileCount: input.files.length,
          error: errorMessage,
        },
      });
      results.push({
        recipientId: recipient.recipientId,
        name: recipient.name,
        email: recipient.email,
        status: "failed",
        auditPersisted,
        error: errorMessage,
      });
    }
  }

  const sent = results.filter((item) => item.status === "sent").length;
  const failed = results.length - sent;
  return {
    enabled: true,
    configured: true,
    kind: "upload_complete",
    attempted: results.length,
    sent,
    failed,
    skipped: recipientRows.length - recipients.filter((item) => item.recipientId).length,
    recipients: results,
    generatedAt: new Date().toISOString(),
    note: results.length
      ? `${sent} feltöltési értesítés elküldve, ${failed} sikertelen.`
      : "Nincs aktivitási értesítésre jogosult címzett.",
  };
}

export async function sendDropPinRecoveryEmail(input: {
  recipientName: string;
  recipientEmail: string;
  packageTitle: string;
  packageCode: string;
  projectName?: string | null;
  pin: string;
  expiresAt: string;
}) {
  const config = await getMailProfilesSafeConfig();
  const dropProfile = config.profiles.find((profile) => profile.id === "drop");
  if (!dropProfile?.enabled || !dropProfile.smtpConfigured) {
    throw new Error("A DIMPRO Drop SMTP-profil nincs teljesen beállítva.");
  }
  const formattedPin = input.pin.replace(/(\d{3})(\d{3})/, "$1-$2");
  const accessPortal = process.env.DROP_PUBLIC_OPEN_URL || "https://drop.dimpro.hu/open";
  const subject = `DIMPRO Drop – ÚJ PIN ${formattedPin} – ${input.packageTitle}`;
  const text = [
    `Tisztelt ${input.recipientName}!`,
    "",
    "Új belépési PIN készült a DIMPRO Drop csomaghoz.",
    "A korábbi PIN már nem használható.",
    "",
    `Csomag: ${input.packageTitle}`,
    ...(input.projectName ? [`Projekt: ${input.projectName}`] : []),
    `Csomagkód: ${input.packageCode}`,
    `Új PIN: ${formattedPin}`,
    `Lejárat: ${formatDate(input.expiresAt)}`,
    "",
    `Belépés: ${accessPortal}`,
    "",
    "Ha nem Ön kérte a PIN-cserét, jelezze a térgazdának.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:720px;margin:auto">
      <div style="border:1px solid #fcd34d;background:#fffbeb;border-radius:20px;padding:26px">
        <p style="margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#b45309">DIMPRO Drop PIN-helyreállítás</p>
        <h1 style="margin:0;font-size:26px">${escapeHtml(input.packageTitle)}</h1>
        <p>Tisztelt ${escapeHtml(input.recipientName)}!</p>
        <p>Új belépési PIN készült. <strong>A korábbi PIN már nem használható.</strong></p>
        <div style="margin:18px 0;border:1px solid #fde68a;background:#fff;border-radius:14px;padding:16px">
          ${input.projectName ? `<p style="margin:0 0 8px"><strong>Projekt:</strong> ${escapeHtml(input.projectName)}</p>` : ""}
          <p style="margin:0 0 8px"><strong>Csomagkód:</strong> ${escapeHtml(input.packageCode)}</p>
          <div style="margin:12px 0;border:2px solid #f59e0b;background:#fffbeb;border-radius:14px;padding:20px;text-align:center;font-size:36px;font-weight:900;letter-spacing:.18em;color:#b45309">${escapeHtml(formattedPin)}</div>
          <p style="margin:0"><strong>Lejárat:</strong> ${escapeHtml(formatDate(input.expiresAt))}</p>
        </div>
        <p><a href="${escapeHtml(accessPortal)}" style="display:inline-block;background:#b45309;color:#fff;text-decoration:none;font-weight:800;padding:13px 19px;border-radius:11px">Csomag megnyitása</a></p>
        <p style="font-size:13px;color:#475569">Ha nem Ön kérte a PIN-cserét, jelezze a térgazdának.</p>
      </div>
    </div>
  `;
  return sendDimproMail({ profileId: "drop", to: [input.recipientEmail], subject, text, html });
}
