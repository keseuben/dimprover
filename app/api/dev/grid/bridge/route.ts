import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getDeveloperConsoleGridBridge } from "@/app/lib/developer-grid/console-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) {
    return NextResponse.json({ ok: false, error: "Nincs jogosultság a Developer Console bridge-hez." }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const bridge = await getDeveloperConsoleGridBridge();
  return NextResponse.json({ ok: bridge.connected, bridge }, { status: bridge.connected ? 200 : 503, headers: { "cache-control": "no-store" } });
}
