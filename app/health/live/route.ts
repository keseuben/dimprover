import { NextRequest, NextResponse } from "next/server";
import { resolveCentralDimproAuthEnvironmentFromHost } from "@/app/lib/dimpro-auth/client-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!resolveCentralDimproAuthEnvironmentFromHost(request.headers.get("host"))) {
    return NextResponse.json({ ok: false, error: "AUTH_HOST_NOT_ALLOWED" }, { status: 404, headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json(
    { ok: true, service: "dimpro-auth", live: true },
    { headers: { "cache-control": "no-store" } },
  );
}
