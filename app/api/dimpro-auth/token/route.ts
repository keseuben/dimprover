import { NextRequest, NextResponse } from "next/server";
import { exchangeAuthorizationCode } from "@/app/lib/dimpro-auth/repository";
import { getDimproAuthRequestIp, getDimproAuthUserAgent, newDimproAuthCorrelationId } from "@/app/lib/dimpro-auth/security";
import { DimproAuthError } from "@/app/lib/dimpro-auth/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isCentralAuthHost(hostValue: string | null) {
  const host = (hostValue || "").toLowerCase().replace(/:\d+$/, "");
  return host === "auth.dev.dimpro.hu" || host === "auth.dimpro.hu" || host === "localhost" || host === "127.0.0.1";
}

export async function POST(request: NextRequest) {
  const correlationId = newDimproAuthCorrelationId(request.headers);
  if (!isCentralAuthHost(request.headers.get("host"))) {
    return NextResponse.json({ ok: false, error: "AUTH_HOST_NOT_ALLOWED", correlationId }, { status: 404, headers: { "cache-control": "no-store" } });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const clientId = typeof body?.client_id === "string" ? body.client_id.trim() : "";
  const redirectUri = typeof body?.redirect_uri === "string" ? body.redirect_uri.trim() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const verifier = typeof body?.code_verifier === "string" ? body.code_verifier.trim() : "";
  if (!clientId || !redirectUri || !/^[A-Za-z0-9_-]{32,200}$/.test(code) || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) {
    return NextResponse.json({ ok: false, error: "AUTH_SSO_CODE_INVALID", correlationId }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  try {
    const result = await exchangeAuthorizationCode({
      clientId,
      redirectUri,
      rawCode: code,
      codeVerifier: verifier,
      ip: getDimproAuthRequestIp(request.headers),
      userAgent: getDimproAuthUserAgent(request.headers),
      correlationId,
    });
    return NextResponse.json({
      ok: true,
      token_type: "dimpro_app_session",
      app_session_token: result.appSessionToken,
      absolute_expires_at: result.absoluteExpiresAt.toISOString(),
      user: { id: result.user.id, email: result.user.email, displayName: result.user.displayName, securityLevel: result.user.securityLevel },
      correlationId,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof DimproAuthError ? error.status : 503;
    const message = error instanceof DimproAuthError ? error.code : "AUTH_SSO_UNAVAILABLE";
    return NextResponse.json({ ok: false, error: message, correlationId }, { status, headers: { "cache-control": "no-store" } });
  }
}
