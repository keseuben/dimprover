import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDimproAuthConfig } from "@/app/lib/dimpro-auth/config";
import { appSessionCookieOptions, decodeSsoFlowCookie, DIMPRO_APP_SESSION_COOKIE, DIMPRO_SSO_FLOW_COOKIE, transientSsoCookieOptions } from "@/app/lib/dimpro-auth/sso";
import { resolveDriveSsoConfig } from "@/app/lib/dimpro-auth/client-config";
import { listAuthorizedExternalProjectIds } from "@/app/lib/dimpro-auth/repository";
import { activateProjectMembership } from "@/app/lib/project-core/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noLeak(response: NextResponse) {
  response.headers.set("cache-control", "no-store, max-age=0");
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("x-content-type-options", "nosniff");
  return response;
}

export async function GET(request: NextRequest) {
  const config = resolveDriveSsoConfig(request.headers.get("host"));
  if (!config) return noLeak(NextResponse.json({ ok: false, error: "AUTH_SSO_HOST_NOT_ALLOWED" }, { status: 404 }));
  const cookieStore = await cookies();
  const flow = decodeSsoFlowCookie(cookieStore.get(DIMPRO_SSO_FLOW_COOKIE)?.value || "");
  const code = request.nextUrl.searchParams.get("code")?.trim() || "";
  const state = request.nextUrl.searchParams.get("state")?.trim() || "";
  if (!flow || flow.clientId !== config.clientId || flow.state !== state || !code) {
    cookieStore.set(DIMPRO_SSO_FLOW_COOKIE, "", transientSsoCookieOptions(0));
    return noLeak(NextResponse.json({ ok: false, error: "AUTH_SSO_STATE_INVALID" }, { status: 400 }));
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
  const payload = await tokenResponse.json().catch(() => null) as { ok?: boolean; app_session_token?: string; error?: string; user?: { id?: string; email?: string; displayName?: string | null } } | null;
  if (!tokenResponse.ok || !payload?.ok || !payload.app_session_token) {
    cookieStore.set(DIMPRO_SSO_FLOW_COOKIE, "", transientSsoCookieOptions(0));
    return noLeak(NextResponse.json({ ok: false, error: payload?.error || "AUTH_SSO_EXCHANGE_FAILED" }, { status: 400 }));
  }

  cookieStore.set(DIMPRO_APP_SESSION_COOKIE, payload.app_session_token, appSessionCookieOptions(getDimproAuthConfig().sessionAbsoluteSeconds));
  cookieStore.set(DIMPRO_SSO_FLOW_COOKIE, "", transientSsoCookieOptions(0));

  const userId = payload.user?.id?.trim() || "";
  const email = payload.user?.email?.trim().toLowerCase() || "";
  if (userId && email) {
    try {
      const projectIds = await listAuthorizedExternalProjectIds(userId, "DRIVE");
      await Promise.all(projectIds.map((projectId) => activateProjectMembership(projectId, email, userId)));
    } catch (error) {
      console.warn("DIMPRO project membership SSO sync hiba:", error instanceof Error ? error.message : "Ismeretlen sync hiba");
    }
  }
  const target = request.nextUrl.clone();
  const destination = new URL(flow.returnTo, request.nextUrl.origin);
  target.pathname = destination.pathname;
  target.search = destination.search;
  target.hash = "";
  return noLeak(NextResponse.redirect(target));
}
