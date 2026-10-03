import { NextResponse } from "next/server";
import { getAuthDatabaseHealth } from "@/app/lib/dimpro-auth/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const db = await getAuthDatabaseHealth();
    const ready = db.database && db.migrationCount >= 3;
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
