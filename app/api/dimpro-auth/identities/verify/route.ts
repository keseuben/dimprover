import { NextRequest, NextResponse } from "next/server";
import { resolveProjectCoreAuth } from "@/app/lib/project-core/auth";
import { recordAuthAuditEvent } from "@/app/lib/dimpro-auth/repository";
import { getDimproAuthRequestIp, getDimproAuthUserAgent, newDimproAuthCorrelationId, validateSameOriginMutation } from "@/app/lib/dimpro-auth/security";
import { DimproAuthError } from "@/app/lib/dimpro-auth/types";
import { verifyAuthUserIdentity } from "@/app/lib/dimpro-auth/user-identities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const correlationId = newDimproAuthCorrelationId(request.headers);
  if (!validateSameOriginMutation(request.headers)) return NextResponse.json({ ok: false, error: "AUTH_ORIGIN_DENIED", correlationId }, { status: 403, headers: { "cache-control": "no-store" } });
  const auth = await resolveProjectCoreAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error, correlationId }, { status: auth.status, headers: { "cache-control": "no-store" } });
  const body = await request.json().catch(() => null) as { identityId?: unknown; code?: unknown } | null;
  const identityId = typeof body?.identityId === "string" ? body.identityId.trim() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(identityId) || !/^\d{6}$/.test(code)) return NextResponse.json({ ok: false, error: "AUTH_USER_IDENTITY_VERIFY_INPUT_INVALID", correlationId }, { status: 400, headers: { "cache-control": "no-store" } });
  try {
    const identity = await verifyAuthUserIdentity({ userId: auth.actor.userId, identityId, code });
    await recordAuthAuditEvent({ eventType: "USER_IDENTITY_VERIFIED", userId: auth.actor.userId, email: identity.email, method: "EMAIL_OTP", result: "SUCCESS", ip: getDimproAuthRequestIp(request.headers), userAgent: getDimproAuthUserAgent(request.headers), correlationId, metadata: { identityId: identity.id, identityType: identity.identityType, organizationName: identity.organizationName } });
    return NextResponse.json({ ok: true, identity, message: "Az e-mail-cím hitelesítve és a DIMPRO-fiókodhoz kapcsolva.", correlationId }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DimproAuthError) return NextResponse.json({ ok: false, error: error.code, message: error.publicMessage, correlationId }, { status: error.status, headers: { "cache-control": "no-store" } });
    console.error("DIMPRO identity verify hiba", correlationId, error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "AUTH_USER_IDENTITY_VERIFY_FAILED", message: "Az e-mail-cím hitelesítése nem sikerült.", correlationId }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
