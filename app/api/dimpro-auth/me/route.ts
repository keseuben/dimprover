import { NextRequest, NextResponse } from "next/server";
import { getAuthSessionByToken } from "@/app/lib/dimpro-auth/repository";
import { readDimproAuthSessionToken } from "@/app/lib/dimpro-auth/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getAuthSessionByToken(readDimproAuthSessionToken(request), true).catch(() => null);
  if (!session) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401, headers: { "cache-control": "no-store" } });
  return NextResponse.json({ ok: true, user: session.user, session: { id: session.id, absoluteExpiresAt: session.absoluteExpiresAt, inactivityExpiresAt: session.inactivityExpiresAt } }, { headers: { "cache-control": "no-store" } });
}
