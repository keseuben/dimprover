import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getProdReadOnlyConnectorReadiness } from "@/app/lib/dev-center/terminal-hub/prod-readonly-connector";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, false))) {
    return NextResponse.json({ ok: false, error: "Nincs BENJADMIN jogosultság a PROD connector readiness nézethez." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, connector: getProdReadOnlyConnectorReadiness() }, { headers: { "cache-control": "no-store" } });
}
