import { NextRequest, NextResponse } from "next/server";
import { getAppSessionByToken, getAuthSessionByToken } from "@/app/lib/dimpro-auth/repository";
import { readDimproAuthSessionToken } from "@/app/lib/dimpro-auth/http";
import { DIMPRO_APP_SESSION_COOKIE } from "@/app/lib/dimpro-auth/sso";
import { resolveCentralDimproAuthEnvironmentFromHost, resolveDriveSsoConfig } from "@/app/lib/dimpro-auth/client-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const host = request.headers.get("host");
    const driveConfig = resolveDriveSsoConfig(host);
    const centralEnvironment = resolveCentralDimproAuthEnvironmentFromHost(host);
    if (!driveConfig && !centralEnvironment) {
      return NextResponse.json({ ok: false, error: "AUTH_HOST_NOT_ALLOWED" }, { status: 404, headers: { "cache-control": "no-store" } });
    }
    const session = driveConfig
      ? await getAppSessionByToken(request.cookies.get(DIMPRO_APP_SESSION_COOKIE)?.value?.trim() || "", driveConfig.clientId, true)
      : await getAuthSessionByToken(readDimproAuthSessionToken(request), true);
    if (!session) return NextResponse.json({ ok: true, authenticated: false }, { headers: { "cache-control": "no-store" } });
    return NextResponse.json({ ok: true, authenticated: true, session }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("DIMPRO AUTH session hiba", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, authenticated: false, error: "A session ellenőrzése jelenleg nem érhető el." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
