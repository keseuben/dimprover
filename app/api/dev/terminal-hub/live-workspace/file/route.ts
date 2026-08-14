import { NextRequest, NextResponse } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { readLiveWorkspaceFile, LiveWorkspaceError } from "@/app/lib/dev-center/terminal-hub/live-workspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, false))) {
    return NextResponse.json({ ok: false, error: "Nincs BENJADMIN jogosultság a Live Workspace fájl-előnézethez." }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId") || "";
    const relativePath = url.searchParams.get("path") || "";
    if (!relativePath) return NextResponse.json({ ok: false, code: "LIVE_WORKSPACE_FILE_REQUIRED", error: "A fájl relatív útvonala kötelező." }, { status: 400 });
    const file = await readLiveWorkspaceFile(workspaceId, relativePath);
    return NextResponse.json({ ok: true, file }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof LiveWorkspaceError) {
      return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ ok: false, code: "LIVE_WORKSPACE_FILE_ERROR", error: error instanceof Error ? error.message : "A Live Workspace fájl nem tölthető be." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
