import { NextResponse } from "next/server";
import { getAuthDatabaseHealth } from "@/app/lib/dimpro-auth/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const health = await getAuthDatabaseHealth();
    return NextResponse.json({ ok: true, service: "dimpro-auth", ...health }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, service: "dimpro-auth", database: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
