import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getLiveWorkspaceActivity } from "@/app/lib/dev-center/terminal-hub/live-workspace-activity";
import { LiveWorkspaceError } from "@/app/lib/dev-center/terminal-hub/live-workspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, false))) {
    return NextResponse.json({ ok: false, error: "Nincs BENJADMIN jogosultság a Live Workspace worker activity nézethez." }, { status: 401 });
  }
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId") || "";
    const activity = await getLiveWorkspaceActivity(workspaceId);
    return NextResponse.json({ ok: true, activity }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof LiveWorkspaceError) {
      return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ ok: false, code: "LIVE_WORKSPACE_ACTIVITY_ERROR", error: error instanceof Error ? error.message : "A worker activity nézet nem tölthető be." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
