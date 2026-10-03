import { NextRequest, NextResponse } from "next/server";
import { getAuthSessionByToken, listAuthPermissions } from "@/app/lib/dimpro-auth/repository";
import { readDimproAuthSessionToken } from "@/app/lib/dimpro-auth/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getAuthSessionByToken(readDimproAuthSessionToken(request), true).catch(() => null);
  if (!session) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401, headers: { "cache-control": "no-store" } });
  const permissions = await listAuthPermissions(session.user.id);
  return NextResponse.json({ ok: true, permissions }, { headers: { "cache-control": "no-store" } });
}
