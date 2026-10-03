import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDimproAuthConfig } from "@/app/lib/dimpro-auth/config";
import { verifyLoginOtp } from "@/app/lib/dimpro-auth/repository";
import {
  DIMPRO_AUTH_SESSION_COOKIE,
  getDimproAuthRequestIp,
  getDimproAuthUserAgent,
  isValidDimproAuthEmail,
  newDimproAuthCorrelationId,
  normalizeDimproAuthEmail,
  sessionCookieOptions,
  validateSameOriginMutation,
} from "@/app/lib/dimpro-auth/security";
import { DimproAuthError } from "@/app/lib/dimpro-auth/types";
import { resolveCentralDimproAuthEnvironmentFromHost } from "@/app/lib/dimpro-auth/client-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!resolveCentralDimproAuthEnvironmentFromHost(request.headers.get("host"))) {
    return NextResponse.json({ ok: false, error: "AUTH_HOST_NOT_ALLOWED" }, { status: 404, headers: { "cache-control": "no-store" } });
  }
  const correlationId = newDimproAuthCorrelationId(request.headers);
  if (!validateSameOriginMutation(request.headers)) {
    return NextResponse.json({ ok: false, error: "A kérés eredete nem engedélyezett.", correlationId }, { status: 403, headers: { "cache-control": "no-store" } });
  }
  const body = await request.json().catch(() => null);
  const email = normalizeDimproAuthEmail(body && typeof body === "object" ? (body as { email?: unknown }).email : "");
  const rawToken = body && typeof body === "object" && typeof (body as { token?: unknown }).token === "string"
    ? String((body as { token: string }).token).trim()
    : "";
  const token = /^\d{6}$/.test(rawToken) ? rawToken : "";
  if (!isValidDimproAuthEmail(email) || token.length !== 6) {
    return NextResponse.json({ ok: false, error: "A belépési kód hibás vagy lejárt.", correlationId }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  try {
    const result = await verifyLoginOtp({
      email,
      code: token,
      ip: getDimproAuthRequestIp(request.headers),
      userAgent: getDimproAuthUserAgent(request.headers),
      correlationId,
    });
    const cookieStore = await cookies();
    cookieStore.set(DIMPRO_AUTH_SESSION_COOKIE, result.token, sessionCookieOptions(getDimproAuthConfig().sessionAbsoluteSeconds));
    return NextResponse.json({
      ok: true,
      email: result.user.email,
      user: { id: result.user.id, displayName: result.user.displayName, securityLevel: result.user.securityLevel },
      absoluteExpiresAt: result.absoluteExpiresAt.toISOString(),
      correlationId,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DimproAuthError) {
      return NextResponse.json({ ok: false, error: error.publicMessage, code: error.code, correlationId }, { status: error.status, headers: { "cache-control": "no-store" } });
    }
    console.error("DIMPRO AUTH verify-otp hiba", correlationId, error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "A kódellenőrzés jelenleg nem érhető el.", correlationId }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
