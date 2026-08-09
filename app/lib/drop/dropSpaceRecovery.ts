import { sendDropSpaceRecoveryEmail } from "./dropSpaceEmail";
import { getDropSupabaseClient } from "./dropRepository";
import { createDropSpaceSessionToken } from "./dropSpaceSecurity";

function normalizeEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase().slice(0, 320) : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizeSpaceCode(value: unknown) {
  const code = typeof value === "string" ? value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40) : "";
  return /^DSP-\d{2}-[A-Z0-9]{8}$/.test(code) ? code : "";
}

function earliestIso(...values: Array<string | null | undefined>) {
  const valid = values
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, time: new Date(value).getTime() }))
    .filter((item) => Number.isFinite(item.time))
    .sort((a, b) => a.time - b.time);
  return valid[0]?.value || null;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestDropSpaceRecovery(input: { spaceCode: unknown; email: unknown }) {
  const startedAt = Date.now();
  const spaceCode = normalizeSpaceCode(input.spaceCode);
  const email = normalizeEmail(input.email);
  const generic = { accepted: true as const, delivered: false, rateLimited: false };
  if (!spaceCode || !email) {
    await wait(Math.max(0, 450 - (Date.now() - startedAt)));
    return generic;
  }

  const client = getDropSupabaseClient();
  const { data: space, error: spaceError } = await client
    .from("drop_spaces")
    .select("id,public_code,name,status,access_expiry_mode,access_ends_at,license_ends_at,project_ends_at")
    .eq("public_code", spaceCode)
    .in("status", ["active", "read_only"])
    .maybeSingle();
  if (spaceError) throw spaceError;
  if (!space) {
    await wait(Math.max(0, 450 - (Date.now() - startedAt)));
    return generic;
  }

  const { data: membership, error: membershipError } = await client
    .from("drop_space_memberships")
    .select("id,space_id,email,display_name,status,accepted_at,access_ends_at")
    .eq("space_id", space.id)
    .eq("email", email)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership?.accepted_at) {
    await wait(Math.max(0, 450 - (Date.now() - startedAt)));
    return generic;
  }

  const spaceEnd = space.access_expiry_mode === "fixed"
    ? earliestIso(space.access_ends_at, space.license_ends_at)
    : space.access_expiry_mode === "project"
      ? earliestIso(space.project_ends_at, space.license_ends_at)
      : earliestIso(space.license_ends_at, space.access_ends_at, space.project_ends_at);
  const effectiveEnd = earliestIso(membership.access_ends_at, spaceEnd);
  if (!effectiveEnd || new Date(effectiveEnd).getTime() <= Date.now()) {
    await wait(Math.max(0, 450 - (Date.now() - startedAt)));
    return generic;
  }

  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const emailType = `space_recovery:${space.id}`;
  const { count, error: rateError } = await client
    .from("drop_email_log")
    .select("id", { count: "exact", head: true })
    .eq("recipient_email", email)
    .eq("email_type", emailType)
    .gte("created_at", since);
  if (rateError) throw rateError;
  if ((count || 0) >= 1) {
    await wait(Math.max(0, 450 - (Date.now() - startedAt)));
    return { accepted: true as const, delivered: false, rateLimited: true };
  }

  const linkExpiresAt = new Date(Math.min(Date.now() + 15 * 60_000, new Date(effectiveEnd).getTime())).toISOString();
  const recoveryToken = createDropSpaceSessionToken({
    membershipId: membership.id,
    spaceId: space.id,
    email: membership.email,
    acceptedAt: membership.accepted_at,
    expiresAt: linkExpiresAt,
  });
  const base = (process.env.DROP_PUBLIC_BASE_URL || "https://drop.dimpro.hu").replace(/\/$/, "");
  const recoveryLink = `${base}/api/drop/spaces/recovery/consume?token=${encodeURIComponent(recoveryToken)}`;

  try {
    const sent = await sendDropSpaceRecoveryEmail({
      spaceName: space.name,
      spaceCode: space.public_code,
      recipientName: membership.display_name,
      recipientEmail: membership.email,
      accessEndsAt: effectiveEnd,
      recoveryLink,
      linkExpiresAt,
    });
    await client.from("drop_email_log").insert({
      package_id: null,
      recipient_email: membership.email,
      email_type: emailType,
      provider_message_id: sent.messageId,
      status: "sent",
      attempt_count: 1,
      sent_at: new Date().toISOString(),
    });
    return { accepted: true as const, delivered: true, rateLimited: false };
  } catch (error) {
    await client.from("drop_email_log").insert({
      package_id: null,
      recipient_email: membership.email,
      email_type: emailType,
      status: "failed",
      attempt_count: 1,
      last_error: error instanceof Error ? error.message.slice(0, 500) : "Ismeretlen e-mail hiba",
    });
    throw error;
  }
}
