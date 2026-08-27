import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { paginateEvents } from "@/app/lib/developer-grid/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) {
    return NextResponse.json({ ok: false, error: "Nincs jogosultság a Developer Grid eseményekhez." }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const cursor = request.nextUrl.searchParams.get("cursor");
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || 50);
  // V1 foundation: az event store adapter következő körben kapcsolódik rá.
  // Fontos: ez az endpoint explicit/paginált history contract, nem full-snapshot polling.
  return NextResponse.json(
    { ok: true, mode: "DELTA_EVENT", page: paginateEvents([], cursor, requestedLimit) },
    { headers: { "cache-control": "no-store" } },
  );
}
