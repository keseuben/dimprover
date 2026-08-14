import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getTerminalCoreReadiness } from "@/app/lib/dev-center/terminal-hub/readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, false))) {
    return NextResponse.json({ ok: false, error: "Nincs BENJADMIN jogosultság a Terminal Core readinesshez." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, readiness: getTerminalCoreReadiness() }, { headers: { "cache-control": "no-store" } });
}
