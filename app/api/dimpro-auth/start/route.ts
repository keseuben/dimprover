import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createPkceChallenge, createPkceVerifier, createSsoState, DIMPRO_SSO_FLOW_COOKIE, encodeSsoFlowCookie, transientSsoCookieOptions } from "@/app/lib/dimpro-auth/sso";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function resolveDriveConfig(host: string) {
  const normalized = host.toLowerCase().replace(/:\d+$/, "");
  if (normalized === "drive.dev.dimpro.hu") {
    return {
      clientId: "dimpro-drive-dev",
      authOrigin: "https://auth.dev.dimpro.hu",
      redirectUri: "https://drive.dev.dimpro.hu/api/dimpro-auth/callback",
    };
  }
  if (normalized === "localhost" || normalized === "127.0.0.1") {
    return {
      clientId: "dimpro-drive-dev",
      authOrigin: process.env.DIMPRO_AUTH_DEV_ORIGIN?.trim() || "https://auth.dev.dimpro.hu",
      redirectUri: process.env.DIMPRO_AUTH_DEV_DRIVE_REDIRECT_URI?.trim() || "https://drive.dev.dimpro.hu/api/dimpro-auth/callback",
    };
  }
  return null;
}

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.length > 500) return "/drive";
  return value;
}

export async function GET(request: NextRequest) {
  const config = resolveDriveConfig(request.headers.get("host") || "");
  if (!config) return NextResponse.json({ ok: false, error: "AUTH_SSO_HOST_NOT_ALLOWED" }, { status: 404 });

  const state = createSsoState();
  const verifier = createPkceVerifier();
  const challenge = createPkceChallenge(verifier);
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("return_to"));
  const cookieStore = await cookies();
  cookieStore.set(DIMPRO_SSO_FLOW_COOKIE, encodeSsoFlowCookie({
    version: 1,
    clientId: config.clientId,
    state,
    verifier,
    returnTo,
    createdAt: Date.now(),
  }), transientSsoCookieOptions());

  const target = new URL("/api/dimpro-auth/authorize", config.authOrigin);
  target.searchParams.set("client_id", config.clientId);
  target.searchParams.set("redirect_uri", config.redirectUri);
  target.searchParams.set("response_type", "code");
  target.searchParams.set("state", state);
  target.searchParams.set("code_challenge", challenge);
  target.searchParams.set("code_challenge_method", "S256");
  return NextResponse.redirect(target);
}
