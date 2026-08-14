import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getLiveWorkspaceGitContext } from "@/app/lib/dev-center/terminal-hub/live-workspace-git";
import { LiveWorkspaceError } from "@/app/lib/dev-center/terminal-hub/live-workspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, false))) {
    return NextResponse.json({ ok: false, error: "Nincs BENJADMIN jogosultság a Live Workspace Git/Monaco nézethez." }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId") || "";
    const relativePath = url.searchParams.get("path") || "";
    const commit = url.searchParams.get("commit") || "";
    if (!relativePath) return NextResponse.json({ ok: false, code: "LIVE_WORKSPACE_GIT_PATH_REQUIRED", error: "A fájl relatív útvonala kötelező." }, { status: 400 });
    const context = await getLiveWorkspaceGitContext(workspaceId, relativePath, commit);
    return NextResponse.json({ ok: true, context }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof LiveWorkspaceError) {
      return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ ok: false, code: "LIVE_WORKSPACE_GIT_CONTEXT_ERROR", error: error instanceof Error ? error.message : "A Live Workspace Git context nem tölthető be." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
