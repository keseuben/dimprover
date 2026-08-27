import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { readGridState } from "@/app/lib/developer-grid/state-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) {
    return NextResponse.json({ ok: false, error: "Nincs jogosultság a Developer Grid state-hez." }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({ ok: true, state: await readGridState() }, { headers: { "cache-control": "no-store" } });
}
