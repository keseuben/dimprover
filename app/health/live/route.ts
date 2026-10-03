import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { ok: true, service: "dimpro-auth", live: true },
    { headers: { "cache-control": "no-store" } },
  );
}
