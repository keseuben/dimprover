import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readDimproAuthSessionToken } from "@/app/lib/dimpro-auth/http";
import { revokeAuthSession } from "@/app/lib/dimpro-auth/repository";
import { DIMPRO_AUTH_SESSION_COOKIE, newDimproAuthCorrelationId, sessionCookieOptions, validateSameOriginMutation } from "@/app/lib/dimpro-auth/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const correlationId = newDimproAuthCorrelationId(request.headers);
  if (!validateSameOriginMutation(request.headers)) {
    return NextResponse.json({ ok: false, error: "A kérés eredete nem engedélyezett.", correlationId }, { status: 403 });
  }
  const token = readDimproAuthSessionToken(request);
  if (token) await revokeAuthSession(token, "USER_LOGOUT", correlationId).catch(() => undefined);
  const cookieStore = await cookies();
  cookieStore.set(DIMPRO_AUTH_SESSION_COOKIE, "", sessionCookieOptions(0));
  return NextResponse.json({ ok: true, correlationId }, { headers: { "cache-control": "no-store" } });
}
