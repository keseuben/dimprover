import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { listLiveWorkspaces, LiveWorkspaceError } from "@/app/lib/dev-center/terminal-hub/live-workspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof LiveWorkspaceError) {
    return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({ ok: false, code: "LIVE_WORKSPACE_INTERNAL_ERROR", error: error instanceof Error ? error.message : "Live Workspace hiba." }, { status: 500, headers: { "cache-control": "no-store" } });
}

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, false))) {
    return NextResponse.json({ ok: false, error: "Nincs BENJADMIN jogosultság a Live Workspace-hez." }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, workspaces: await listLiveWorkspaces() }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
