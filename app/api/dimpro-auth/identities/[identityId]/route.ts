import { NextRequest, NextResponse } from "next/server";
import { resolveProjectCoreAuth } from "@/app/lib/project-core/auth";
import { recordAuthAuditEvent } from "@/app/lib/dimpro-auth/repository";
import { disableAuthUserIdentity } from "@/app/lib/dimpro-auth/user-identities";
import {
  getDimproAuthRequestIp,
  getDimproAuthUserAgent,
  newDimproAuthCorrelationId,
  validateSameOriginMutation,
} from "@/app/lib/dimpro-auth/security";
import { DimproAuthError } from "@/app/lib/dimpro-auth/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(request: NextRequest, context: { params: Promise<{ identityId: string }> }) {
  const correlationId = newDimproAuthCorrelationId(request.headers);
  if (!validateSameOriginMutation(request.headers)) {
    return NextResponse.json({ ok: false, error: "AUTH_ORIGIN_DENIED", correlationId }, { status: 403, headers: { "cache-control": "no-store" } });
  }
  const auth = await resolveProjectCoreAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error, correlationId }, { status: auth.status, headers: { "cache-control": "no-store" } });
  }
  const { identityId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identityId)) {
    return NextResponse.json({ ok: false, error: "AUTH_USER_IDENTITY_ID_INVALID", correlationId }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  try {
    const identity = await disableAuthUserIdentity({ userId: auth.actor.userId, identityId });
    await recordAuthAuditEvent({
      eventType: "USER_IDENTITY_DISABLED",
      userId: auth.actor.userId,
      email: identity.email,
      method: "SELF_SERVICE",
      result: "SUCCESS",
      ip: getDimproAuthRequestIp(request.headers),
      userAgent: getDimproAuthUserAgent(request.headers),
      correlationId,
      metadata: {
        identityId: identity.id,
        identityType: identity.identityType,
        organizationName: identity.organizationName,
        previousVerification: identity.verifiedAt,
      },
    });
    return NextResponse.json({
      ok: true,
      identity,
      message: identity.status === "DISABLED" ? "Az e-mail-identitás leválasztva a DIMPRO-fiókról." : "Az e-mail-identitás frissítve.",
      correlationId,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DimproAuthError) {
      return NextResponse.json({ ok: false, error: error.code, message: error.publicMessage, correlationId }, { status: error.status, headers: { "cache-control": "no-store" } });
    }
    console.error("DIMPRO identity disable hiba", correlationId, error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "AUTH_USER_IDENTITY_DISABLE_FAILED", message: "Az e-mail-identitás leválasztása nem sikerült.", correlationId }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
