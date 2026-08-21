import { dimproIdentityErrorResponse, dimproIdentityJson } from "@/app/lib/identity-core/api";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import { assertFieldCaptureSessionOwner, recordFieldCaptureEvent } from "@/app/lib/field-capture/serverRepository";
import { authorizeFieldCaptureRequest } from "@/app/lib/field-capture/serverService";
import {
  FIELD_CAPTURE_REPORT_EMAIL_MAX_BYTES,
  getFieldCaptureReportEmailStatus,
  prepareFieldCaptureReportEmail,
  sendPreparedFieldCaptureReportEmail,
} from "@/app/lib/field-capture/reportEmail";
import {
  claimFieldCaptureReportEmailDelivery,
  getFieldCaptureReportEmailDeliveryReadiness,
  markFieldCaptureReportEmailDeliveryFailed,
  markFieldCaptureReportEmailDeliverySent,
  normalizeFieldCaptureReportEmailIdempotencyKey,
} from "@/app/lib/field-capture/reportEmailDelivery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateSessionId(sessionId: string) {
  if (!UUID_RE.test(sessionId)) {
    throw new DimproIdentityError("A terepi munkamenet-azonosító érvénytelen.", "FIELD_CAPTURE_REPORT_EMAIL_SESSION_ID_INVALID", 400);
  }
}

function requestedRecipients(value: FormDataEntryValue | null) {
  const raw = typeof value === "string" ? value : "";
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // A vessző/pontosvessző formátum is támogatott.
  }
  return raw.split(/[;,\n]+/g);
}

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params;
    validateSessionId(sessionId);
    const authorized = await authorizeFieldCaptureRequest(request);
    const session = await assertFieldCaptureSessionOwner({ sessionId, userId: authorized.context.user.id, entitlementId: authorized.context.entitlement.id });
    const [mailStatus, delivery] = await Promise.all([
      getFieldCaptureReportEmailStatus(authorized.context),
      getFieldCaptureReportEmailDeliveryReadiness(),
    ]);
    return dimproIdentityJson({
      ok: true,
      session: { id: session.id, status: session.status },
      status: { ...mailStatus, deliveryReady: delivery.ready, maxAttempts: delivery.maxAttempts },
    });
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  let audit: { sessionId: string; actorUserId: string } | null = null;
  let claimed: { deliveryId: string; attemptCount: number } | null = null;
  let smtpAccepted = false;
  try {
    const { sessionId } = await context.params;
    validateSessionId(sessionId);
    const idempotencyKey = normalizeFieldCaptureReportEmailIdempotencyKey(request.headers.get("idempotency-key")).key;
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > FIELD_CAPTURE_REPORT_EMAIL_MAX_BYTES + 256 * 1024) {
      throw new DimproIdentityError("Az e-mail küldési kérés túl nagy.", "FIELD_CAPTURE_REPORT_EMAIL_REQUEST_TOO_LARGE", 413);
    }
    const deliveryReadiness = await getFieldCaptureReportEmailDeliveryReadiness();
    if (!deliveryReadiness.ready) {
      throw new DimproIdentityError("A Terep e-mail idempotencia-tár még nincs aktiválva.", "FIELD_CAPTURE_REPORT_EMAIL_DELIVERY_NOT_READY", 503);
    }
    const authorized = await authorizeFieldCaptureRequest(request);
    const session = await assertFieldCaptureSessionOwner({ sessionId, userId: authorized.context.user.id, entitlementId: authorized.context.entitlement.id });
    audit = { sessionId: session.id, actorUserId: authorized.context.user.id };
    const contentType = request.headers.get("content-type")?.toLowerCase() || "";
    if (!contentType.includes("multipart/form-data")) {
      throw new DimproIdentityError("A Terepi összesítő e-mail küldése multipart űrlapot vár.", "FIELD_CAPTURE_REPORT_EMAIL_MULTIPART_REQUIRED", 415);
    }
    const form = await request.formData();
    const report = form.get("report");
    if (!(report instanceof File)) {
      throw new DimproIdentityError("A Terepi összesítő PDF csatolmány hiányzik.", "FIELD_CAPTURE_REPORT_EMAIL_PDF_REQUIRED", 400);
    }
    if (report.size > FIELD_CAPTURE_REPORT_EMAIL_MAX_BYTES) {
      throw new DimproIdentityError("A Terepi összesítő PDF meghaladja a 15 MB-os e-mail korlátot.", "FIELD_CAPTURE_REPORT_EMAIL_PDF_TOO_LARGE", 413);
    }
    const prepared = await prepareFieldCaptureReportEmail({
      context: authorized.context,
      requestedRecipients: requestedRecipients(form.get("recipients")),
      subject: String(form.get("subject") || ""),
      message: String(form.get("message") || ""),
      sessionLabel: session.clientSessionId,
      reportTitle: String(form.get("reportTitle") || ""),
      pdfFileName: report.name,
      pdfBytes: new Uint8Array(await report.arrayBuffer()),
    });
    const claim = await claimFieldCaptureReportEmailDelivery({
      sessionId: session.id,
      actorUserId: authorized.context.user.id,
      idempotencyKey,
      payloadSha256: prepared.payloadSha256,
      recipientCount: prepared.recipients.length,
      attachmentName: prepared.attachmentName,
    });
    if (claim.state === "SENT") {
      await recordFieldCaptureEvent({
        sessionId: session.id,
        actorUserId: authorized.context.user.id,
        eventType: "REPORT_EMAIL_DUPLICATE_SKIPPED",
        payload: { deliveryId: claim.deliveryId, attemptCount: claim.attemptCount, recipientCount: claim.recipientCount, attachmentName: claim.attachmentName },
      });
      return dimproIdentityJson({
        ok: true,
        result: {
          duplicate: true,
          deliveryId: claim.deliveryId,
          attemptCount: claim.attemptCount,
          messageId: claim.messageId || null,
          recipients: prepared.recipients,
          recipientCount: claim.recipientCount,
          attachmentName: claim.attachmentName,
          subject: prepared.subject,
          sentAt: claim.sentAt,
        },
      }, 200);
    }

    claimed = { deliveryId: claim.deliveryId, attemptCount: claim.attemptCount };
    const result = await sendPreparedFieldCaptureReportEmail(prepared);
    smtpAccepted = true;
    await markFieldCaptureReportEmailDeliverySent({ deliveryId: claim.deliveryId, messageId: result.messageId });
    await recordFieldCaptureEvent({
      sessionId: session.id,
      actorUserId: authorized.context.user.id,
      eventType: claim.attemptCount > 1 ? "REPORT_EMAIL_RETRY_SENT" : "REPORT_EMAIL_SENT",
      payload: { deliveryId: claim.deliveryId, attemptCount: claim.attemptCount, profileId: result.profileId, messageId: result.messageId, recipientCount: result.recipients.length, attachmentName: result.attachmentName, attachmentBytes: report.size },
    });
    return dimproIdentityJson({ ok: true, result: { ...result, duplicate: false, deliveryId: claim.deliveryId, attemptCount: claim.attemptCount, recipientCount: result.recipients.length, messageId: result.messageId || null } }, 200);
  } catch (error) {
    const code = error instanceof DimproIdentityError ? error.code : "FIELD_CAPTURE_REPORT_EMAIL_UNKNOWN";
    if (claimed && !smtpAccepted) {
      await markFieldCaptureReportEmailDeliveryFailed({ deliveryId: claimed.deliveryId, errorCode: code }).catch(() => undefined);
    }
    if (audit) {
      await recordFieldCaptureEvent({
        sessionId: audit.sessionId,
        actorUserId: audit.actorUserId,
        eventType: smtpAccepted ? "REPORT_EMAIL_DELIVERY_STATE_UNCERTAIN" : "REPORT_EMAIL_FAILED",
        payload: { code, deliveryId: claimed?.deliveryId || null, attemptCount: claimed?.attemptCount || null, smtpAccepted },
      }).catch(() => undefined);
    }
    return dimproIdentityErrorResponse(error);
  }
}
