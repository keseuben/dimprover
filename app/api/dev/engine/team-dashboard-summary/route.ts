import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getTeamDashboardMetrics } from "@/app/lib/dev-center/team-dashboard-metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) {
    return NextResponse.json({ ok: false, error: "Nincs jogosultság a BENJADMIN vezetői mérőszámokhoz." }, { status: 401 });
  }
  try {
    return NextResponse.json(await getTeamDashboardMetrics(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A vezetői mérőszámok nem tölthetők be." }, { status: 500 });
  }
}
