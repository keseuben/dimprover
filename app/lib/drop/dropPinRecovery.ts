import { generateDropPin, hashDropPin } from "./dropCrypto";
import { sendDropPinRecoveryEmail } from "./dropEmail";
import {
  findDropPackageByPublicCode,
  getDropSupabaseClient,
  listDropPackageMemberNotificationRecipients,
  listDropRecipientsForPackage,
  writeDropEvent,
} from "./dropRepository";
import { normalizeDropPublicCode } from "./dropValidation";

function normalizeEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase().slice(0, 320) : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type DropPinRecoveryOutcome =
  | "invalid_input"
  | "package_not_found"
  | "package_inactive"
  | "email_not_eligible"
  | "rate_limited"
  | "sent";

export type DropPinRecoveryResult = {
  accepted: true;
  delivered: boolean;
  rateLimited: boolean;
  outcome: DropPinRecoveryOutcome;
  packageId: string | null;
};

async function keepMinimumResponseTime(startedAt: number) {
  await wait(Math.max(0, 450 - (Date.now() - startedAt)));
}

async function auditRejectedRecovery(input: {
  packageId: string;
  requestId: string;
  email: string;
  reason: Exclude<DropPinRecoveryOutcome, "sent">;
}) {
  await writeDropEvent({
    packageId: input.packageId,
    eventType: "access.pin_recovery_rejected",
    severity: "warning",
    actorName: "PIN-helyreállítási kérés",
    actorEmail: input.email || null,
    payload: {
      requestId: input.requestId,
      reason: input.reason,
      delivered: false,
    },
  }).catch((error) => {
    console.error("DROP PIN recovery rejection audit failed:", error instanceof Error ? error.message : "unknown error");
  });
}

export async function requestDropPinRecovery(input: {
  publicCode: unknown;
  email: unknown;
  requestId?: string;
}): Promise<DropPinRecoveryResult> {
  const startedAt = Date.now();
  const publicCode = normalizeDropPublicCode(input.publicCode);
  const email = normalizeEmail(input.email);
  const requestId = typeof input.requestId === "string" ? input.requestId.slice(0, 80) : "pin-recovery-untracked";

  if (!publicCode || !email) {
    await keepMinimumResponseTime(startedAt);
    return { accepted: true, delivered: false, rateLimited: false, outcome: "invalid_input", packageId: null };
  }

  const packageRow = await findDropPackageByPublicCode(publicCode).catch(() => null);
  if (!packageRow) {
    await keepMinimumResponseTime(startedAt);
    return { accepted: true, delivered: false, rateLimited: false, outcome: "package_not_found", packageId: null };
  }
  if (!["active", "upload_closed"].includes(packageRow.status) || new Date(packageRow.expires_at).getTime() <= Date.now()) {
    await auditRejectedRecovery({ packageId: packageRow.id, requestId, email, reason: "package_inactive" });
    await keepMinimumResponseTime(startedAt);
    return { accepted: true, delivered: false, rateLimited: false, outcome: "package_inactive", packageId: packageRow.id };
  }

  const [recipientRows, memberRows] = await Promise.all([
    listDropRecipientsForPackage(packageRow.id).catch(() => []),
    listDropPackageMemberNotificationRecipients(packageRow.id).catch(() => []),
  ]);
  const eligible = new Map<string, { name: string; email: string }>();
  for (const recipient of recipientRows) {
    eligible.set(recipient.email.trim().toLowerCase(), { name: recipient.name || "Címzett", email: recipient.email });
  }
  for (const member of memberRows) {
    eligible.set(member.email.trim().toLowerCase(), { name: member.name || "Tértag", email: member.email });
  }
  if (packageRow.uploader_email) {
    eligible.set(packageRow.uploader_email.trim().toLowerCase(), {
      name: packageRow.uploader_name || "Csomag létrehozója",
      email: packageRow.uploader_email,
    });
  }
  const recipient = eligible.get(email);
  if (!recipient) {
    await auditRejectedRecovery({ packageId: packageRow.id, requestId, email, reason: "email_not_eligible" });
    await keepMinimumResponseTime(startedAt);
    return { accepted: true, delivered: false, rateLimited: false, outcome: "email_not_eligible", packageId: packageRow.id };
  }

  const client = getDropSupabaseClient();
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count, error: rateError } = await client
    .from("drop_email_log")
    .select("id", { count: "exact", head: true })
    .eq("package_id", packageRow.id)
    .eq("recipient_email", email)
    .eq("email_type", "pin_recovery")
    .eq("status", "sent")
    .gte("created_at", since);
  if (rateError) throw rateError;
  if ((count || 0) >= 1) {
    await auditRejectedRecovery({ packageId: packageRow.id, requestId, email, reason: "rate_limited" });
    await keepMinimumResponseTime(startedAt);
    return { accepted: true, delivered: false, rateLimited: true, outcome: "rate_limited", packageId: packageRow.id };
  }

  const oldHash = packageRow.pin_hash;
  const oldSalt = packageRow.pin_salt;
  const newPin = generateDropPin();
  const { hash: newHash, salt: newSalt } = hashDropPin(newPin);
  const updatedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await client
    .from("drop_packages")
    .update({ pin_hash: newHash, pin_salt: newSalt, updated_at: updatedAt })
    .eq("id", packageRow.id)
    .eq("status", packageRow.status)
    .select("id")
    .maybeSingle();
  if (updateError || !updated) throw updateError || new Error("A PIN nem módosítható.");

  let sent: Awaited<ReturnType<typeof sendDropPinRecoveryEmail>>;
  try {
    sent = await sendDropPinRecoveryEmail({
      recipientName: recipient.name,
      recipientEmail: recipient.email,
      packageTitle: packageRow.title,
      packageCode: packageRow.public_code,
      projectName: packageRow.project_name_snapshot,
      pin: newPin,
      expiresAt: packageRow.expires_at,
    });
  } catch (error) {
    const rollback = await client
      .from("drop_packages")
      .update({ pin_hash: oldHash, pin_salt: oldSalt, updated_at: new Date().toISOString() })
      .eq("id", packageRow.id)
      .eq("pin_hash", newHash)
      .eq("pin_salt", newSalt);
    if (rollback.error) {
      console.error("DROP PIN recovery rollback failed:", rollback.error.message);
    }
    const failedLog = await client.from("drop_email_log").insert({
      package_id: packageRow.id,
      recipient_email: recipient.email,
      email_type: "pin_recovery",
      status: "failed",
      attempt_count: 1,
      last_error: error instanceof Error ? error.message.slice(0, 500) : "Ismeretlen e-mail hiba",
    });
    if (failedLog.error) console.error("DROP PIN recovery failed-email log failed:", failedLog.error.message);
    await writeDropEvent({
      packageId: packageRow.id,
      eventType: "access.pin_recovery_failed",
      severity: "error",
      actorName: recipient.name,
      actorEmail: recipient.email,
      payload: { requestId, recipientEmail: recipient.email, pinRolledBack: true },
    }).catch((auditError) => {
      console.error("DROP PIN recovery failure audit failed:", auditError instanceof Error ? auditError.message : "unknown error");
    });
    throw error;
  }

  const sentLog = await client.from("drop_email_log").insert({
    package_id: packageRow.id,
    recipient_email: recipient.email,
    email_type: "pin_recovery",
    provider_message_id: sent.messageId,
    status: "sent",
    attempt_count: 1,
    sent_at: new Date().toISOString(),
  });
  if (sentLog.error) {
    console.error("DROP PIN recovery sent-email log failed:", sentLog.error.message);
  }
  await writeDropEvent({
    packageId: packageRow.id,
    eventType: "access.pin_recovery_sent",
    actorName: recipient.name,
    actorEmail: recipient.email,
    payload: { requestId, recipientEmail: recipient.email, previousPinInvalidated: true },
  }).catch((auditError) => {
    console.error("DROP PIN recovery success audit failed:", auditError instanceof Error ? auditError.message : "unknown error");
  });
  return { accepted: true, delivered: true, rateLimited: false, outcome: "sent", packageId: packageRow.id };
}
