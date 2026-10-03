import { NextRequest, NextResponse } from "next/server";
import { getAuthSessionByToken, listAuthPermissions } from "@/app/lib/dimpro-auth/repository";
import { readDimproAuthSessionToken } from "@/app/lib/dimpro-auth/http";
import { resolveCentralDimproAuthEnvironmentFromHost } from "@/app/lib/dimpro-auth/client-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!resolveCentralDimproAuthEnvironmentFromHost(request.headers.get("host"))) {
    return NextResponse.json({ ok: false, error: "AUTH_HOST_NOT_ALLOWED" }, { status: 404, headers: { "cache-control": "no-store" } });
  }
  const session = await getAuthSessionByToken(readDimproAuthSessionToken(request), true).catch(() => null);
  if (!session) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401, headers: { "cache-control": "no-store" } });
  const permissions = await listAuthPermissions(session.user.id);
  return NextResponse.json({ ok: true, permissions }, { headers: { "cache-control": "no-store" } });
}
