import { sendDimproMail } from "@/app/lib/license/mail-profiles";
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

export async function sendDropPublicDeliveryEmails(input: {
  packageRow: DropPackageRecord;
  workflow: DropPackageWorkflowRecord;
  recipients: DropRecipientRecord[];
  allRecipients?: DropRecipientRecord[];
  files: DropPublicMailFile[];
  downloadUrl: string;
  downloadPin: string | null;
}) {
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
  for (const recipient of input.recipients) {
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
        subject: `DIMPRO Drop – ${input.workflow.subject}`,
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
  };
}
