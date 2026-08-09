import { NextRequest, NextResponse } from "next/server";
import { listDriveUploadSessions } from "@/app/lib/drive/driveApi";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság a DIMPRO Drive upload session lista lekéréséhez.",
      authHint: "x-dimpro-license-admin-key header szükséges.",
    },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  const projectId = request.nextUrl.searchParams.get("projectId") || undefined;
  const sessions = await listDriveUploadSessions(projectId);

  return NextResponse.json(
    {
      ok: true,
      mode: "upload-session-debug-list",
      projectId: projectId || "all",
      count: sessions.length,
      sessions,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
