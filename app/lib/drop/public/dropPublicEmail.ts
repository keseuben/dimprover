import { getMailProfilesSafeConfig, sendDimproMail } from "@/app/lib/license/mail-profiles";
import { getDropFeatureState } from "../dropFeatureFlags";
import type { DropPackageRecord, DropRecipientRecord } from "../dropTypes";
import type { DropPackageWorkflowRecord } from "./dropPublicTypes";
import {
  buildDropPublicEmailPreviews,
  type DropPublicEmailPreviewBundle,
} from "./dropPublicEmailPreview";
import {
  buildDropPublicDeliveryEmailContent,
  type DropPublicMailFile,
} from "./dropPublicEmailTemplate";

export type { DropPublicMailFile } from "./dropPublicEmailTemplate";

function emptyPreviewBundle(): DropPublicEmailPreviewBundle {
  return {
    previews: [],
    attachments: [],
    eligibleCount: 0,
    attemptedCount: 0,
    skippedCount: 0,
    errors: [],
    totalBytes: 0,
  };
}

export type DropPublicEmailAvailability = { enabled: boolean; reason: string | null; code: "ready" | "feature_disabled" | "profile_missing" };

function dropEmailRecipientAllowlist() {
  return new Set(
    String(process.env.DROP_EMAIL_RECIPIENT_ALLOWLIST || "")
      .split(/[;,\s]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function dropEmailSubjectPrefix() {
  return String(process.env.DROP_EMAIL_SUBJECT_PREFIX || "").trim().slice(0, 32);
}

export async function getDropPublicDeliveryEmailAvailability(): Promise<DropPublicEmailAvailability> {
  if (!getDropFeatureState().flags.emailNotificationsEnabled) {
    return { enabled: false, code: "feature_disabled", reason: "A DEV e-mail kézbesítés jelenleg nincs engedélyezve." };
  }
  const config = await getMailProfilesSafeConfig().catch(() => null);
  const profile = config?.profiles.find((item) => item.id === "drop");
  if (!profile?.enabled || !profile.smtpConfigured) {
    return { enabled: false, code: "profile_missing", reason: "A DIMPRO Drop e-mail profil nincs teljesen beállítva." };
  }
  return { enabled: true, code: "ready", reason: null };
}

export async function sendDropPublicDeliveryEmails(input: {
  packageRow: DropPackageRecord;
  workflow: DropPackageWorkflowRecord;
  recipients: DropRecipientRecord[];
  allRecipients?: DropRecipientRecord[];
  files: DropPublicMailFile[];
  downloadUrl: string;
  downloadPin: string | null;
}) {
  const availability = await getDropPublicDeliveryEmailAvailability();
  if (!availability.enabled) {
    return {
      results: [], sentCount: 0, failedCount: 0, attempted: 0,
      previewCount: 0, previewEligibleCount: 0, previewSkippedCount: 0,
      previewErrorCount: 0, previewTotalBytes: 0,
      deliveryEnabled: false, disabledReason: availability.reason,
    };
  }
  // Az előnézet kiegészítő kényelmi funkció. Bármely S3- vagy képfeldolgozási
  // hiba esetén az e-mail normál fájllistával továbbra is kiküldhető.
  const previewBundle = await buildDropPublicEmailPreviews({
    packageId: input.packageRow.id,
    files: input.files.map((file) => ({
      id: file.id,
      name: file.name,
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType,
      isImage: file.isImage,
      storageKey: file.storageKey,
      storageBucket: file.storageBucket,
    })),
  }).catch(() => emptyPreviewBundle());

  const results: Array<{ recipientId: string; email: string; sent: boolean; messageId?: string; error?: string }> = [];
  const recipientAllowlist = dropEmailRecipientAllowlist();
  const subjectPrefix = dropEmailSubjectPrefix();
  for (const recipient of input.recipients) {
    const normalizedRecipient = recipient.email.trim().toLowerCase();
    if (recipientAllowlist.size > 0 && !recipientAllowlist.has(normalizedRecipient)) {
      results.push({
        recipientId: recipient.id,
        email: recipient.email,
        sent: false,
        error: "DEV_EMAIL_RECIPIENT_NOT_ALLOWED: A címzett nincs a DEV e-mail engedélylistán.",
      });
      continue;
    }
    try {
      const content = buildDropPublicDeliveryEmailContent({
        recipientName: recipient.name,
        allRecipients: (input.allRecipients || input.recipients).map((item) => ({ name: item.name, email: item.email })),
        showRecipients: input.workflow.showRecipientsOnDownload !== false,
        uploaderName: input.packageRow.uploader_name,
        uploaderEmail: input.packageRow.uploader_email,
        subject: input.workflow.subject,
        senderMessage: input.workflow.senderMessage,
        packageNote: input.workflow.packageNote,
        expiresAt: input.packageRow.expires_at,
        files: input.files,
        downloadUrl: input.downloadUrl,
        downloadPin: input.downloadPin,
        previewBundle,
      });
      const sent = await sendDimproMail({
        profileId: "drop",
        to: [recipient.email],
        replyTo: input.packageRow.uploader_email,
        subject: `${subjectPrefix ? `${subjectPrefix} ` : ""}DIMPRO Drop – ${input.workflow.subject}`,
        text: content.text,
        html: content.html,
        attachments: previewBundle.attachments.length ? previewBundle.attachments : undefined,
      });
      results.push({ recipientId: recipient.id, email: recipient.email, sent: true, messageId: sent.messageId });
    } catch (error) {
      results.push({ recipientId: recipient.id, email: recipient.email, sent: false, error: error instanceof Error ? error.message : "Ismeretlen e-mail hiba" });
    }
  }
  const sentCount = results.filter((row) => row.sent).length;
  return {
    results,
    sentCount,
    failedCount: results.length - sentCount,
    attempted: results.length,
    previewCount: previewBundle.previews.length,
    previewEligibleCount: previewBundle.eligibleCount,
    previewSkippedCount: previewBundle.skippedCount,
    previewErrorCount: previewBundle.errors.length,
    previewTotalBytes: previewBundle.totalBytes,
    deliveryEnabled: true,
    disabledReason: null,
  };
}
