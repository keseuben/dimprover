import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { listLiveWorkspaceTree, LiveWorkspaceError } from "@/app/lib/dev-center/terminal-hub/live-workspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, false))) {
    return NextResponse.json({ ok: false, error: "Nincs BENJADMIN jogosultság a Live Workspace fájlfához." }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId") || "";
    const relativePath = url.searchParams.get("path") || "";
    const tree = await listLiveWorkspaceTree(workspaceId, relativePath);
    return NextResponse.json({ ok: true, tree }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof LiveWorkspaceError) {
      return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ ok: false, code: "LIVE_WORKSPACE_TREE_ERROR", error: error instanceof Error ? error.message : "A Live Workspace fájlfa nem tölthető be." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
