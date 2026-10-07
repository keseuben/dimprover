import { NextRequest, NextResponse, after } from "next/server";
import { resolveProjectCoreAuth } from "@/app/lib/project-core/auth";
import { getDimproAuthConfig } from "@/app/lib/dimpro-auth/config";
import { sendDimproUserIdentityOtpEmail } from "@/app/lib/dimpro-auth/email";
import { recordAuthAuditEvent } from "@/app/lib/dimpro-auth/repository";
import {
  createDimproAuthOtpCode,
  getDimproAuthRequestIp,
  getDimproAuthUserAgent,
  isValidDimproAuthEmail,
  newDimproAuthCorrelationId,
  normalizeDimproAuthEmail,
  validateSameOriginMutation,
} from "@/app/lib/dimpro-auth/security";
import { DimproAuthError } from "@/app/lib/dimpro-auth/types";
import { beginAuthUserIdentityVerification, listAuthUserIdentities, type AuthUserIdentityType } from "@/app/lib/dimpro-auth/user-identities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await resolveProjectCoreAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status, headers: { "cache-control": "no-store" } });
  try {
    const identities = await listAuthUserIdentities(auth.actor.userId);
    return NextResponse.json({ ok: true, identities }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("DIMPRO identity list hiba", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "AUTH_USER_IDENTITIES_UNAVAILABLE", message: "Az e-mail-identitások jelenleg nem tölthetők be." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  const correlationId = newDimproAuthCorrelationId(request.headers);
  if (!validateSameOriginMutation(request.headers)) return NextResponse.json({ ok: false, error: "AUTH_ORIGIN_DENIED", correlationId }, { status: 403, headers: { "cache-control": "no-store" } });
  const auth = await resolveProjectCoreAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error, correlationId }, { status: auth.status, headers: { "cache-control": "no-store" } });
  const body = await request.json().catch(() => null) as { email?: unknown; displayName?: unknown; organizationName?: unknown; identityType?: unknown } | null;
  const email = normalizeDimproAuthEmail(body?.email);
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim().slice(0, 160) : auth.actor.displayName.trim().slice(0, 160);
  const organizationName = typeof body?.organizationName === "string" ? body.organizationName.trim().slice(0, 160) : "";
  const identityType: AuthUserIdentityType = body?.identityType === "WORK" ? "WORK" : "PERSONAL";
  if (!isValidDimproAuthEmail(email) || displayName.length < 2 || (identityType === "WORK" && organizationName.length < 2)) {
    return NextResponse.json({ ok: false, error: "AUTH_USER_IDENTITY_INPUT_INVALID", message: identityType === "WORK" ? "Érvényes e-mail-cím, név és szervezet szükséges." : "Érvényes e-mail-cím és név szükséges.", correlationId }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  try {
    const code = createDimproAuthOtpCode();
    const result = await beginAuthUserIdentityVerification({
      userId: auth.actor.userId,
      email,
      displayName,
      organizationName,
      identityType,
      code,
      ip: getDimproAuthRequestIp(request.headers),
      userAgent: getDimproAuthUserAgent(request.headers),
      correlationId,
    });
    const delivery = { email, displayName, organizationName, code, expiresMinutes: Math.ceil(getDimproAuthConfig().otpTtlSeconds / 60) };
    after(async () => {
      try {
        await sendDimproUserIdentityOtpEmail(delivery);
        await recordAuthAuditEvent({ eventType: "USER_IDENTITY_OTP_DELIVERY", userId: auth.actor.userId, email, method: "EMAIL_OTP", result: "SUCCESS", correlationId, metadata: { identityId: result.identity.id, identityType } }).catch(() => undefined);
      } catch (error) {
        await recordAuthAuditEvent({ eventType: "USER_IDENTITY_OTP_DELIVERY", userId: auth.actor.userId, email, method: "EMAIL_OTP", result: "FAILURE", correlationId, metadata: { identityId: result.identity.id, errorClass: error instanceof Error ? error.name : "UnknownError" } }).catch(() => undefined);
      }
    });
    await recordAuthAuditEvent({ eventType: "USER_IDENTITY_ADD_REQUEST", userId: auth.actor.userId, email, method: "SELF_SERVICE", result: "PENDING_EMAIL", correlationId, metadata: { identityId: result.identity.id, identityType, organizationName: organizationName || null } });
    return NextResponse.json({ ok: true, identity: result.identity, message: "A hitelesítő kódot elküldtük az új e-mail-címre.", correlationId }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DimproAuthError) return NextResponse.json({ ok: false, error: error.code, message: error.publicMessage, correlationId }, { status: error.status, headers: { "cache-control": "no-store" } });
    console.error("DIMPRO identity request hiba", correlationId, error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "AUTH_USER_IDENTITY_REQUEST_FAILED", message: "Az e-mail-identitás hozzáadása jelenleg nem indítható." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
