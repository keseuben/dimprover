import { NextRequest, NextResponse } from "next/server";
import { getAuthDatabaseHealth } from "@/app/lib/dimpro-auth/repository";
import { resolveCentralDimproAuthEnvironmentFromHost } from "@/app/lib/dimpro-auth/client-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!resolveCentralDimproAuthEnvironmentFromHost(request.headers.get("host"))) {
    return NextResponse.json({ ok: false, error: "AUTH_HOST_NOT_ALLOWED" }, { status: 404, headers: { "cache-control": "no-store" } });
  }
  try {
    const db = await getAuthDatabaseHealth();
    const ready = db.database && db.migrationCount >= 4;
    return NextResponse.json(
      { ok: ready, service: "dimpro-auth", ready, database: db.database, migrationCount: db.migrationCount },
      { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, service: "dimpro-auth", ready: false, database: false, migrationCount: 0 },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
