import { NextRequest, NextResponse } from "next/server";
import { buildDriveUploadCleanupPlan } from "@/app/lib/drive/driveApi";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság a DIMPRO Drive upload cleanup terv lekéréséhez.",
      authHint: "x-dimpro-license-admin-key header szükséges.",
    },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  const projectId = request.nextUrl.searchParams.get("projectId") || undefined;
  const olderThanHours = Number(request.nextUrl.searchParams.get("olderThanHours") || 24);
  const plan = await buildDriveUploadCleanupPlan({
    projectId,
    olderThanHours: Number.isFinite(olderThanHours) ? olderThanHours : 24,
  });

  return NextResponse.json(plan, { headers: { "cache-control": "no-store" } });
}
