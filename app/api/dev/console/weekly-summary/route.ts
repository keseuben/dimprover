import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getDeveloperConsoleWeeklySummary } from "@/app/lib/dev-center/developer-console";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return NextResponse.json({ ok: false, error: "Nincs jogosultság a heti fejlesztési összesítőhöz." }, { status: 401, headers: { "cache-control": "no-store" } });
  try {
    const projectId = request.nextUrl.searchParams.get("projectId")?.trim() || null;
    const week = request.nextUrl.searchParams.get("week")?.trim() || null;
    return NextResponse.json({ ok: true, summary: await getDeveloperConsoleWeeklySummary(projectId, week) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "A heti fejlesztési összesítő nem tölthető be." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
