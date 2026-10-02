import { NextRequest, NextResponse } from "next/server";
import { getAuthSessionByToken } from "@/app/lib/dimpro-auth/repository";
import { readDimproAuthSessionToken } from "@/app/lib/dimpro-auth/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSessionByToken(readDimproAuthSessionToken(request), true);
    if (!session) return NextResponse.json({ ok: true, authenticated: false }, { headers: { "cache-control": "no-store" } });
    return NextResponse.json({ ok: true, authenticated: true, session }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("DIMPRO AUTH session hiba", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, authenticated: false, error: "A session ellenőrzése jelenleg nem érhető el." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
