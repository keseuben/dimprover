import { NextResponse } from "next/server";
import { dropNoStoreHeaders } from "@/app/lib/drop/dropApi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, version: "DROP 1.2.11", online: true, checkedAt: new Date().toISOString() }, { headers: dropNoStoreHeaders() });
}
