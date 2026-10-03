import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthSessionByToken, revokeAllUserSessions } from "@/app/lib/dimpro-auth/repository";
import { readDimproAuthSessionToken } from "@/app/lib/dimpro-auth/http";
import { DIMPRO_AUTH_SESSION_COOKIE, newDimproAuthCorrelationId, sessionCookieOptions, validateSameOriginMutation } from "@/app/lib/dimpro-auth/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const correlationId = newDimproAuthCorrelationId(request.headers);
  if (!validateSameOriginMutation(request.headers)) {
    return NextResponse.json({ ok: false, error: "ORIGIN_DENIED", correlationId }, { status: 403, headers: { "cache-control": "no-store" } });
  }
  const token = readDimproAuthSessionToken(request);
  const session = token ? await getAuthSessionByToken(token, false).catch(() => null) : null;
  if (!session) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED", correlationId }, { status: 401, headers: { "cache-control": "no-store" } });
  const revoked = await revokeAllUserSessions(session.user.id, correlationId);
  const cookieStore = await cookies();
  cookieStore.set(DIMPRO_AUTH_SESSION_COOKIE, "", sessionCookieOptions(0));
  return NextResponse.json({ ok: true, revoked, correlationId }, { headers: { "cache-control": "no-store" } });
}
