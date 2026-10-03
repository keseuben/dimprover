import { NextResponse } from "next/server";
import { getAuthClient, getAuthDatabaseHealth } from "@/app/lib/dimpro-auth/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const [db, driveClient] = await Promise.all([
      getAuthDatabaseHealth(),
      getAuthClient("dimpro-drive-dev", "https://drive.dev.dimpro.hu/api/dimpro-auth/callback"),
    ]);
    const sessionRepository = db.database && db.migrationCount >= 4;
    const internalSso = Boolean(driveClient);
    const ready = sessionRepository && internalSso;
    return NextResponse.json(
      {
        ok: ready,
        service: "dimpro-auth",
        sessionRepository,
        internalSso,
        passkey: "NOT_ENABLED_V01",
      },
      { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, service: "dimpro-auth", sessionRepository: false, internalSso: false, passkey: "NOT_ENABLED_V01" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
