import { NextRequest, NextResponse } from "next/server";
import { getReleaseHistory } from "@/app/lib/downloads/releaseDownloads";
import {
  getLicenseAdminKeyFilePath,
  isLicenseAdminAuthorized,
} from "@/app/lib/license/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság a release lista lekéréséhez.",
      adminKeyHint: getLicenseAdminKeyFilePath(),
    },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  const project = request.nextUrl.searchParams.get("project") || "DIMPRO_Fajlmuhely";
  const limit = Number(request.nextUrl.searchParams.get("limit") || 50);
  const releases = await getReleaseHistory(project, Number.isFinite(limit) ? limit : 50);

  return NextResponse.json(
    {
      ok: true,
      project,
      releases,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
