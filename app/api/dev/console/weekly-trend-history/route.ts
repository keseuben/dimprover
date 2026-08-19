import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getDeveloperConsoleWeeklyTrendHistory } from "@/app/lib/dev-center/developer-console";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return NextResponse.json({ ok: false, error: "Nincs jogosultság a többhetes fejlesztési trendhez." }, { status: 401, headers: { "cache-control": "no-store" } });
  try {
    const projectId = request.nextUrl.searchParams.get("projectId")?.trim() || null;
    const week = request.nextUrl.searchParams.get("week")?.trim() || null;
    const weeks = Number(request.nextUrl.searchParams.get("weeks") || 8);
    const history = await getDeveloperConsoleWeeklyTrendHistory(projectId, week, weeks);
    return NextResponse.json({ ok: true, history }, { headers: { "cache-control": "private, no-store", "x-dimpro-production-access": "DENY" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A többhetes fejlesztési trend nem tölthető be." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
