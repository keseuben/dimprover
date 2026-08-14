import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getWindowsBridgeReadiness } from "@/app/lib/dev-center/terminal-hub/windows-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, false))) {
    return NextResponse.json({ ok: false, error: "Nincs BENJADMIN jogosultság a Windows Bridge readiness nézethez." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, readiness: getWindowsBridgeReadiness() }, { headers: { "cache-control": "no-store" } });
}
