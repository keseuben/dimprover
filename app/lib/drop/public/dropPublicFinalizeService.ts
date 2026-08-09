import { generateDropPin, hashDropPin } from "../dropCrypto";
import {
  findDropPackageById,
  getDropSupabaseClient,
  listDropRecipientsForPackage,
  markDropInvitationSent,
  reissueDropAccessTokenAtomic,
  transitionDropPackageStatusAtomic,
  writeDropEvent,
} from "../dropRepository";
import {
  claimDropPackageFinalization,
  getDropPackageWorkflow,
  recordDropIdentityAccountingAtomic,
  resolveDropPublicSession,
  updateDropPackageWorkflow,
} from "./dropPublicRepository";
import { sendDropPublicDeliveryEmails, type DropPublicMailFile } from "./dropPublicEmail";
import { listDropPackageGroups } from "../dropGroupService";

function finalizeError(message: string, code: string, status: number, details?: Record<string, unknown>) {
  const error = new Error(message);
  Object.assign(error, { code, status, ...(details ? { details } : {}) });
  return error;
}
function persistedDeliverySummary(workflow: { recipientEmails?: string[]; notificationStatus?: string; notificationDetail?: string | null }) {
  const recipients = workflow.recipientEmails?.length || 0;
  const match = workflow.notificationDetail?.match(/(\d+)\s*\/\s*(\d+)/);
  const parsedSent = match ? Number(match[1]) : Number.NaN;
  const parsedTotal = match ? Number(match[2]) : Number.NaN;
  const total = Number.isFinite(parsedTotal) && parsedTotal >= 0 ? parsedTotal : recipients;
  const sent = Number.isFinite(parsedSent) && parsedSent >= 0
    ? Math.min(parsedSent, total)
    : workflow.notificationStatus === "sent" ? total : 0;
  return { attempted: 0, sent, failed: Math.max(0, total - sent), alreadySent: sent, emailPreviews: 0, emailPreviewSkipped: 0 };
}
function errorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
}

export async function finalizeDropPublicPackageById(input: {
  packageId: string;
  source?: "browser" | "worker" | "admin";
}) {
  const source = input.source || "worker";
  const claimed = await claimDropPackageFinalization(input.packageId);
  if (claimed.state === "finalized") return {
    finalized: true,
    idempotent: true,
    workflow: claimed.workflow,
    delivery: persistedDeliverySummary(claimed.workflow),
  };
  const client = getDropSupabaseClient();
  try {
    const packageRow = await findDropPackageById(input.packageId);
    if (!packageRow) throw finalizeError("A küldemény nem található.", "DROP_PACKAGE_NOT_FOUND", 404);
    if (!["active", "upload_closed"].includes(packageRow.status)) {
      throw finalizeError("A küldemény jelenlegi állapotában nem kézbesíthető.", "DROP_PUBLIC_PACKAGE_NOT_FINALIZABLE", 409);
    }
    const [{ data: files, error: filesError }, { data: comments, error: commentsError }] = await Promise.all([
      client.from("drop_files")
        .select("id,display_name,size_stored_bytes,mime_type,detected_mime_type,is_image,storage_provider,storage_bucket,storage_key,upload_status,processing_status,virus_scan_status,security_status,deleted_at,group_id")
        .eq("package_id", input.packageId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      client.from("drop_comments")
        .select("id,file_id,comment_text,status")
        .eq("package_id", input.packageId)
        .neq("status", "deleted")
        .order("created_at", { ascending: true }),
    ]);
    if (filesError) throw filesError;
    if (commentsError) throw commentsError;
    if (!files?.length) throw finalizeError("A küldeményhez még nem tartozik fájl.", "DROP_PUBLIC_PACKAGE_EMPTY", 409);
    const pending = files.filter((file) =>
      file.upload_status !== "ready"
      || file.processing_status !== "ready"
      || file.virus_scan_status !== "clean"
      || file.security_status !== "clean"
    );
    if (pending.length) {
      await updateDropPackageWorkflow(input.packageId, {
        notificationStatus: "not_requested",
        notificationDetail: `${pending.length} fájl vírusellenőrzése vagy feldolgozása még folyamatban van.`,
      });
      throw finalizeError(
        "A fájlok vírusellenőrzése még folyamatban van. A rendszer rövidesen újra próbálkozhat.",
        "DROP_PUBLIC_FILES_NOT_READY",
        425,
        {
          stage: "virus_scan",
          totalCount: files.length,
          readyCount: files.length - pending.length,
          pendingCount: pending.length,
        },
      );
    }

    const workflow = await getDropPackageWorkflow(input.packageId);
    if (!workflow) throw finalizeError("A küldemény workflow-adata hiányzik.", "DROP_PUBLIC_WORKFLOW_NOT_FOUND", 404);

    // A központi havi keret/projektjogosultság ellenőrzése a kézbesítés előtt,
    // ugyanabban a PostgreSQL tranzakcióban, csomagonként idempotensen történik.
    // Így párhuzamos Sendek nem tudják megkerülni a központi keretet, és e-mail
    // hiba miatti worker-újrapróbálás sem számolja kétszer ugyanazt a csomagot.
    if (workflow.dimproSendEntitlementId && !workflow.identityAccountedAt) {
      const accounting = await recordDropIdentityAccountingAtomic(input.packageId, {
        workflowType: workflow.workflowType,
        finalizationSource: source,
      });
      await writeDropEvent({
        packageId: input.packageId,
        eventType: "identity.send_accounted",
        actorName: packageRow.uploader_name,
        actorEmail: packageRow.uploader_email,
        payload: {
          entitlementId: workflow.dimproSendEntitlementId,
          projectPublicCode: workflow.projectPublicCode || null,
          idempotent: accounting.idempotent === true,
        },
      });
    }

    const recipientsBeforeToken = await listDropRecipientsForPackage(input.packageId);
    const previouslyDelivered = recipientsBeforeToken.filter((recipient) => Boolean(recipient.invitation_sent_at));
    if (previouslyDelivered.length > 0 && !workflow.finalizedAt) {
      throw finalizeError(
        "A kézbesítés korábban részlegesen megtörtént. Automatikus újraküldés helyett adminellenőrzés szükséges, hogy a már kiküldött linkek ne váljanak érvénytelenné.",
        "DROP_PUBLIC_PARTIAL_DELIVERY_REVIEW_REQUIRED",
        409,
      );
    }
    let pin: string | null = null;
    if (workflow.requireDownloadPin) {
      pin = generateDropPin();
      const hashed = hashDropPin(pin);
      const { error } = await client.from("drop_packages").update({
        pin_hash: hashed.hash,
        pin_salt: hashed.salt,
        access_policy: "token_pin",
        updated_at: new Date().toISOString(),
      }).eq("id", input.packageId);
      if (error) throw error;
    } else {
      const { error } = await client.from("drop_packages").update({
        access_policy: "token_only",
        updated_at: new Date().toISOString(),
      }).eq("id", input.packageId);
      if (error) throw error;
    }

    const token = await reissueDropAccessTokenAtomic({
      packageId: input.packageId,
      purpose: "download",
      expiresAt: packageRow.expires_at,
      eventPayload: { source: `public_workflow_finalize_${source}`, workflowType: workflow.workflowType },
    });
    const base = (process.env.DROP_PUBLIC_BASE_URL || "https://drop.dimpro.hu").replace(/\/$/, "");
    const downloadUrl = `${base}/d/${encodeURIComponent(token.capability.rawToken)}`;
    const groups = await listDropPackageGroups(input.packageId);
    const groupById = new Map(groups.map((group) => [group.id, group]));
    const byFile = new Map<string, string[]>();
    for (const comment of comments || []) {
      if (!comment.file_id) continue;
      const list = byFile.get(String(comment.file_id)) || [];
      list.push(String(comment.comment_text));
      byFile.set(String(comment.file_id), list);
    }
    const mailFiles: DropPublicMailFile[] = files.map((file) => ({
      id: String(file.id),
      name: String(file.display_name),
      sizeBytes: Number(file.size_stored_bytes || 0),
      comments: byFile.get(String(file.id)) || [],
      mimeType: String(file.detected_mime_type || file.mime_type || "application/octet-stream"),
      isImage: Boolean(file.is_image),
      storageKey: String(file.storage_key || ""),
      storageBucket: file.storage_bucket ? String(file.storage_bucket) : null,
      groupId: file.group_id ? String(file.group_id) : null,
      groupName: file.group_id ? groupById.get(String(file.group_id))?.name || null : null,
      groupSortOrder: file.group_id ? groupById.get(String(file.group_id))?.sortOrder ?? Number.MAX_SAFE_INTEGER - 1 : Number.MAX_SAFE_INTEGER,
      directUrl: workflow.requireDownloadPin
        ? downloadUrl
        : `${base}/api/drop/downloads/file/${encodeURIComponent(String(file.id))}?token=${encodeURIComponent(token.capability.rawToken)}&inline=1`,
    }));
    const recipients = await listDropRecipientsForPackage(input.packageId);
    if (!recipients.length) throw finalizeError("A küldeményhez nincs címzett rendelve.", "DROP_PUBLIC_RECIPIENTS_EMPTY", 409);
    const alreadySent = recipients.filter((recipient) => Boolean(recipient.invitation_sent_at));
    const pendingRecipients = recipients.filter((recipient) => !recipient.invitation_sent_at);
    const mail = pendingRecipients.length
      ? await sendDropPublicDeliveryEmails({ packageRow, workflow, recipients: pendingRecipients, allRecipients: recipients, files: mailFiles, downloadUrl, downloadPin: pin })
      : {
          results: [], sentCount: 0, failedCount: 0, attempted: 0,
          previewCount: 0, previewEligibleCount: 0, previewSkippedCount: 0,
          previewErrorCount: 0, previewTotalBytes: 0,
        };
    for (const result of mail.results.filter((row) => row.sent)) {
      await markDropInvitationSent({ packageId: input.packageId, recipientId: result.recipientId }).catch(() => undefined);
    }
    if (pendingRecipients.length > 0 && mail.sentCount === 0) {
      await updateDropPackageWorkflow(input.packageId, {
        notificationStatus: "failed",
        notificationDetail: `${alreadySent.length}/${recipients.length} címzett korábban értesítve; az újrapróbálás során 0/${mail.attempted} e-mail ment ki.`,
      });
      await writeDropEvent({
        packageId: input.packageId,
        eventType: "public.delivery.failed",
        severity: "error",
        actorName: packageRow.uploader_name,
        actorEmail: packageRow.uploader_email,
        payload: { source, workflowType: workflow.workflowType, attempted: mail.attempted, failedCount: mail.failedCount },
      });
      throw finalizeError(
        "A címzettek e-mailes értesítése sikertelen. A küldemény nem lett lezárva; a worker újrapróbálja.",
        "DROP_PUBLIC_DELIVERY_EMAIL_FAILED",
        502,
      );
    }

    if (packageRow.status === "active") {
      await transitionDropPackageStatusAtomic({
        packageId: input.packageId,
        expectedStatus: "active",
        targetStatus: "upload_closed",
        patch: { status: "upload_closed", updated_at: new Date().toISOString(), closed_at: new Date().toISOString() },
        eventPayload: { source: `public_workflow_finalize_${source}`, workflowType: workflow.workflowType },
      });
    }
    const totalSent = alreadySent.length + mail.sentCount;
    const totalFailed = recipients.length - totalSent;
    const notificationStatus = totalFailed === 0 ? "sent" : totalSent > 0 ? "partial" : "failed";
    const updated = await updateDropPackageWorkflow(input.packageId, {
      finalizedAt: new Date().toISOString(),
      notificationStatus,
      notificationDetail: `${totalSent}/${recipients.length} címzett e-mailje elküldve.`,
      downloadLinkHint: `…${token.capability.rawToken.slice(-8)}`,
    });
    await writeDropEvent({
      packageId: input.packageId,
      eventType: "public.delivery.finalized",
      severity: totalFailed ? "warning" : "info",
      actorName: packageRow.uploader_name,
      actorEmail: packageRow.uploader_email,
      payload: {
        source,
        workflowType: workflow.workflowType,
        fileCount: files.length,
        recipientCount: recipients.length,
        sentCount: totalSent,
        failedCount: totalFailed,
        requireDownloadPin: workflow.requireDownloadPin,
        emailPreviewCount: mail.previewCount,
        emailPreviewEligibleCount: mail.previewEligibleCount,
        emailPreviewSkippedCount: mail.previewSkippedCount,
        emailPreviewErrorCount: mail.previewErrorCount,
        emailPreviewTotalBytes: mail.previewTotalBytes,
        originalFilesAttachedToEmail: false,
      },
    });
    return {
      finalized: true,
      idempotent: false,
      workflow: updated,
      delivery: {
        attempted: mail.attempted,
        sent: totalSent,
        failed: totalFailed,
        alreadySent: alreadySent.length,
        emailPreviews: mail.previewCount,
        emailPreviewSkipped: mail.previewSkippedCount,
      },
      files: files.length,
    };
  } catch (error) {
    const code = errorCode(error);
    if (code !== "DROP_PUBLIC_FILES_NOT_READY" && code !== "DROP_PUBLIC_FINALIZE_IN_PROGRESS") {
      await updateDropPackageWorkflow(input.packageId, {
        notificationStatus: "failed",
        notificationDetail: error instanceof Error ? error.message : "A véglegesítés sikertelen.",
      }).catch(() => undefined);
    }
    throw error;
  }
}

export async function finalizeDropPublicPackage(input: { rawSession: string; headers: Headers; packageId: string }) {
  const session = await resolveDropPublicSession(input.rawSession, input.headers);
  if (session.packageId !== input.packageId) {
    throw finalizeError("A küldemény nem ehhez a publikus munkamenethez tartozik.", "DROP_PUBLIC_PACKAGE_SESSION_MISMATCH", 403);
  }
  return finalizeDropPublicPackageById({ packageId: input.packageId, source: "browser" });
}

export async function listDropPublicFinalizationCandidates(limit = 20) {
  const client = getDropSupabaseClient();
  const { data, error } = await client.from("drop_public_package_workflows")
    .select("package_id,notification_status,updated_at")
    .is("finalized_at", null)
    .in("notification_status", ["not_requested", "pending"])
    .order("updated_at", { ascending: true })
    .limit(Math.max(1, Math.min(100, limit)));
  if (error) throw error;
  return (data || []).map((row) => ({
    packageId: String(row.package_id),
    notificationStatus: String(row.notification_status),
    updatedAt: String(row.updated_at),
  }));
}

export async function processDropPublicFinalizationCandidates(limit = 20) {
  const candidates = await listDropPublicFinalizationCandidates(limit);
  const results: Array<Record<string, unknown>> = [];
  for (const candidate of candidates) {
    if (candidate.notificationStatus === "pending" && Date.parse(candidate.updatedAt) > Date.now() - 5 * 60_000) {
      results.push({ packageId: candidate.packageId, status: "in-progress" });
      continue;
    }
    try {
      const finalized = await finalizeDropPublicPackageById({ packageId: candidate.packageId, source: "worker" });
      results.push({ packageId: candidate.packageId, status: "finalized", idempotent: finalized.idempotent });
    } catch (error) {
      const code = errorCode(error);
      results.push({
        packageId: candidate.packageId,
        status: code === "DROP_PUBLIC_FILES_NOT_READY" ? "files-not-ready" : code === "DROP_PUBLIC_FINALIZE_IN_PROGRESS" ? "in-progress" : "error",
        code,
        error: error instanceof Error ? error.message.slice(0, 500) : "Ismeretlen véglegesítési hiba.",
      });
    }
  }
  return { candidates: candidates.length, results };
}
