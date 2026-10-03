import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDimproAuthConfig } from "@/app/lib/dimpro-auth/config";
import { appSessionCookieOptions, decodeSsoFlowCookie, DIMPRO_APP_SESSION_COOKIE, DIMPRO_SSO_FLOW_COOKIE, transientSsoCookieOptions } from "@/app/lib/dimpro-auth/sso";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function resolveConfig(host: string) {
  const normalized = host.toLowerCase().replace(/:\d+$/, "");
  if (normalized === "drive.dev.dimpro.hu") {
    return {
      clientId: "dimpro-drive-dev",
      authOrigin: "https://auth.dev.dimpro.hu",
      redirectUri: "https://drive.dev.dimpro.hu/api/dimpro-auth/callback",
    };
  }
  return null;
}

export async function GET(request: NextRequest) {
  const config = resolveConfig(request.headers.get("host") || "");
  if (!config) return NextResponse.json({ ok: false, error: "AUTH_SSO_HOST_NOT_ALLOWED" }, { status: 404 });
  const cookieStore = await cookies();
  const flow = decodeSsoFlowCookie(cookieStore.get(DIMPRO_SSO_FLOW_COOKIE)?.value || "");
  const code = request.nextUrl.searchParams.get("code")?.trim() || "";
  const state = request.nextUrl.searchParams.get("state")?.trim() || "";
  if (!flow || flow.clientId !== config.clientId || flow.state !== state || !code) {
    cookieStore.set(DIMPRO_SSO_FLOW_COOKIE, "", transientSsoCookieOptions(0));
    return NextResponse.json({ ok: false, error: "AUTH_SSO_STATE_INVALID" }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  const tokenResponse = await fetch(new URL("/api/dimpro-auth/token", config.authOrigin), {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": request.headers.get("user-agent") || "DIMPRO Drive SSO" },
    body: JSON.stringify({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      code,
      code_verifier: flow.verifier,
    }),
    cache: "no-store",
  });
  const payload = await tokenResponse.json().catch(() => null) as { ok?: boolean; app_session_token?: string; error?: string } | null;
  if (!tokenResponse.ok || !payload?.ok || !payload.app_session_token) {
    cookieStore.set(DIMPRO_SSO_FLOW_COOKIE, "", transientSsoCookieOptions(0));
    return NextResponse.json({ ok: false, error: payload?.error || "AUTH_SSO_EXCHANGE_FAILED" }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  cookieStore.set(DIMPRO_APP_SESSION_COOKIE, payload.app_session_token, appSessionCookieOptions(getDimproAuthConfig().sessionAbsoluteSeconds));
  cookieStore.set(DIMPRO_SSO_FLOW_COOKIE, "", transientSsoCookieOptions(0));
  const target = request.nextUrl.clone();
  target.pathname = flow.returnTo;
  target.search = "";
  return NextResponse.redirect(target);
}
