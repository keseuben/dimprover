import { createHash } from "node:crypto";
import { getDimproIdentitySupabaseClient } from "@/app/lib/identity-core/repository";
import { DimproIdentityError } from "@/app/lib/identity-core/types";

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const MAX_ATTEMPTS = 5;

type DeliveryRow = {
  id: string;
  session_id: string;
  actor_user_id: string;
  idempotency_key_hash: string;
  payload_sha256: string;
  status: "SENDING" | "SENT" | "FAILED";
  attempt_count: number;
  recipient_count: number;
  profile_id: string;
  attachment_name: string;
  message_id: string | null;
  last_error_code: string | null;
  sent_at: string | null;
  last_error_at: string | null;
  created_at: string;
  updated_at: string;
};

function db() {
  return getDimproIdentitySupabaseClient();
}

function databaseError(message: string, error: { code?: string | null; message?: string | null } | null | undefined): never {
  throw new DimproIdentityError(message, error?.code || "FIELD_CAPTURE_REPORT_EMAIL_DELIVERY_DATABASE_ERROR", 500);
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeFieldCaptureReportEmailIdempotencyKey(value: string | null | undefined) {
  const key = String(value || "").trim();
  if (!IDEMPOTENCY_PATTERN.test(key)) {
    throw new DimproIdentityError(
      "Az e-mail küldéshez érvényes, legalább 16 karakteres idempotency kulcs szükséges.",
      "FIELD_CAPTURE_REPORT_EMAIL_IDEMPOTENCY_KEY_INVALID",
      400,
    );
  }
  return { key, keyHash: sha256(key) };
}

export async function getFieldCaptureReportEmailDeliveryReadiness() {
  const client = db();
  const [marker, table] = await Promise.all([
    client.from("field_capture_schema_meta")
      .select("component,schema_version,migration_count,bootstrap_id")
      .eq("component", "field-capture-report-email")
      .maybeSingle(),
    client.from("field_capture_report_email_deliveries").select("id", { head: true, count: "exact" }).limit(0),
  ]);
  const markerReady = !marker.error
    && marker.data?.schema_version === "0.1.0"
    && Number(marker.data?.migration_count) === 1
    && marker.data?.bootstrap_id === "field-capture-report-email-f6-v010-20260821";
  return { ready: markerReady && !table.error, markerReady, tableReady: !table.error, maxAttempts: MAX_ATTEMPTS };
}

async function getDelivery(sessionId: string, keyHash: string) {
  const result = await db().from("field_capture_report_email_deliveries")
    .select("*")
    .eq("session_id", sessionId)
    .eq("idempotency_key_hash", keyHash)
    .maybeSingle();
  if (result.error) databaseError("A terepi e-mail delivery állapot nem olvasható.", result.error);
  return (result.data || null) as DeliveryRow | null;
}

export async function claimFieldCaptureReportEmailDelivery(input: {
  sessionId: string;
  actorUserId: string;
  idempotencyKey: string;
  payloadSha256: string;
  recipientCount: number;
  attachmentName: string;
}) {
  const { keyHash } = normalizeFieldCaptureReportEmailIdempotencyKey(input.idempotencyKey);
  if (!/^[a-f0-9]{64}$/.test(input.payloadSha256)) {
    throw new DimproIdentityError("A riport e-mail payload lenyomata érvénytelen.", "FIELD_CAPTURE_REPORT_EMAIL_PAYLOAD_HASH_INVALID", 500);
  }
  const now = new Date().toISOString();
  const insert = await db().from("field_capture_report_email_deliveries").insert({
    session_id: input.sessionId,
    actor_user_id: input.actorUserId,
    idempotency_key_hash: keyHash,
    payload_sha256: input.payloadSha256,
    status: "SENDING",
    attempt_count: 1,
    recipient_count: input.recipientCount,
    profile_id: "drop",
    attachment_name: input.attachmentName,
    updated_at: now,
  }).select("*").maybeSingle();

  if (!insert.error && insert.data) {
    const row = insert.data as DeliveryRow;
    return { state: "CLAIMED" as const, deliveryId: row.id, attemptCount: row.attempt_count };
  }
  if (insert.error?.code !== "23505") {
    databaseError("A terepi e-mail delivery foglalása sikertelen.", insert.error);
  }

  const existing = await getDelivery(input.sessionId, keyHash);
  if (!existing) databaseError("A terepi e-mail idempotencia rekord ütközött, de nem olvasható.", insert.error);
  if (existing.payload_sha256 !== input.payloadSha256) {
    throw new DimproIdentityError(
      "Ez az idempotency kulcs már eltérő riportküldési tartalomhoz tartozik.",
      "FIELD_CAPTURE_REPORT_EMAIL_IDEMPOTENCY_PAYLOAD_MISMATCH",
      409,
    );
  }
  if (existing.status === "SENT") {
    return {
      state: "SENT" as const,
      deliveryId: existing.id,
      attemptCount: existing.attempt_count,
      messageId: existing.message_id || "",
      recipientCount: existing.recipient_count,
      attachmentName: existing.attachment_name,
      sentAt: existing.sent_at,
    };
  }
  if (existing.status === "SENDING") {
    throw new DimproIdentityError(
      "Ugyanez a Terepi összesítő e-mail már küldés alatt van. Új levél nem indult.",
      "FIELD_CAPTURE_REPORT_EMAIL_DELIVERY_IN_PROGRESS",
      409,
    );
  }
  if (existing.attempt_count >= MAX_ATTEMPTS) {
    throw new DimproIdentityError(
      "A Terepi összesítő e-mail elérte a biztonságos újrapróbálási korlátot.",
      "FIELD_CAPTURE_REPORT_EMAIL_RETRY_LIMIT",
      409,
    );
  }

  const retry = await db().from("field_capture_report_email_deliveries").update({
    status: "SENDING",
    attempt_count: existing.attempt_count + 1,
    last_error_code: null,
    last_error_at: null,
    updated_at: now,
  })
    .eq("id", existing.id)
    .eq("status", "FAILED")
    .eq("updated_at", existing.updated_at)
    .select("*")
    .maybeSingle();
  if (retry.error) databaseError("A terepi e-mail retry foglalása sikertelen.", retry.error);
  if (!retry.data) {
    throw new DimproIdentityError(
      "Ugyanez a Terepi összesítő e-mail közben másik kérésben újrapróbálásra került. Új levél nem indult.",
      "FIELD_CAPTURE_REPORT_EMAIL_DELIVERY_IN_PROGRESS",
      409,
    );
  }
  const row = retry.data as DeliveryRow;
  return { state: "CLAIMED" as const, deliveryId: row.id, attemptCount: row.attempt_count };
}

export async function markFieldCaptureReportEmailDeliverySent(input: { deliveryId: string; messageId: string }) {
  const now = new Date().toISOString();
  const result = await db().from("field_capture_report_email_deliveries").update({
    status: "SENT",
    message_id: input.messageId || null,
    sent_at: now,
    last_error_code: null,
    last_error_at: null,
    updated_at: now,
  }).eq("id", input.deliveryId).eq("status", "SENDING").select("id").maybeSingle();
  if (result.error || !result.data) databaseError("A terepi e-mail sikeres delivery állapota nem rögzíthető.", result.error);
}

export async function markFieldCaptureReportEmailDeliveryFailed(input: { deliveryId: string; errorCode: string }) {
  const now = new Date().toISOString();
  const result = await db().from("field_capture_report_email_deliveries").update({
    status: "FAILED",
    last_error_code: input.errorCode.slice(0, 160),
    last_error_at: now,
    updated_at: now,
  }).eq("id", input.deliveryId).eq("status", "SENDING").select("id").maybeSingle();
  if (result.error) databaseError("A terepi e-mail hibás delivery állapota nem rögzíthető.", result.error);
}
