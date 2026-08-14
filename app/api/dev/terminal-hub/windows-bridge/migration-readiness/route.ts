import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getWindowsBridgeMigrationReadiness } from "@/app/lib/dev-center/terminal-hub/windows-bridge-migration-readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, false))) {
    return NextResponse.json({ ok: false, error: "Nincs BENJADMIN jogosultság a Windows Bridge migration readiness nézethez." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, migration: getWindowsBridgeMigrationReadiness() }, { headers: { "cache-control": "no-store" } });
}
