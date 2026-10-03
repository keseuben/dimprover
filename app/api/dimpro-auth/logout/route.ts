import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readDimproAuthSessionToken } from "@/app/lib/dimpro-auth/http";
import { revokeAppSession, revokeAuthSession } from "@/app/lib/dimpro-auth/repository";
import { DIMPRO_AUTH_SESSION_COOKIE, newDimproAuthCorrelationId, sessionCookieOptions, validateSameOriginMutation } from "@/app/lib/dimpro-auth/security";
import { appSessionCookieOptions, DIMPRO_APP_SESSION_COOKIE } from "@/app/lib/dimpro-auth/sso";
import { resolveCentralDimproAuthEnvironmentFromHost, resolveDriveSsoConfig } from "@/app/lib/dimpro-auth/client-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const correlationId = newDimproAuthCorrelationId(request.headers);
  if (!validateSameOriginMutation(request.headers)) {
    return NextResponse.json({ ok: false, error: "A kérés eredete nem engedélyezett.", correlationId }, { status: 403 });
  }
  const driveConfig = resolveDriveSsoConfig(request.headers.get("host"));
  const centralEnvironment = resolveCentralDimproAuthEnvironmentFromHost(request.headers.get("host"));
  if (!driveConfig && !centralEnvironment) {
    return NextResponse.json({ ok: false, error: "AUTH_HOST_NOT_ALLOWED", correlationId }, { status: 404, headers: { "cache-control": "no-store" } });
  }
  const cookieStore = await cookies();

  if (driveConfig) {
    const appToken = request.cookies.get(DIMPRO_APP_SESSION_COOKIE)?.value?.trim() || "";
    if (appToken) await revokeAppSession(appToken, driveConfig.clientId, "USER_LOGOUT", correlationId, true).catch(() => undefined);
    cookieStore.set(DIMPRO_APP_SESSION_COOKIE, "", appSessionCookieOptions(0));
  } else {
    const token = readDimproAuthSessionToken(request);
    if (token) await revokeAuthSession(token, "USER_LOGOUT", correlationId).catch(() => undefined);
    cookieStore.set(DIMPRO_AUTH_SESSION_COOKIE, "", sessionCookieOptions(0));
  }

  return NextResponse.json({ ok: true, correlationId }, { headers: { "cache-control": "no-store" } });
}
