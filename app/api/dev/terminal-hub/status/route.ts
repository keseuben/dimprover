import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getTerminalHubStatus } from "@/app/lib/dev-center/terminal-hub/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, false))) {
    return NextResponse.json({ ok: false, error: "Nincs BENJADMIN jogosultság a Terminal Hub állapotához." }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, status: await getTerminalHubStatus() }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A Terminal Hub állapota nem tölthető be." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
