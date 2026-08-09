import { type NextRequest, NextResponse } from "next/server";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import { processDropObjectCleanup } from "@/app/lib/drop/storage/dropUploadService";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) {
    return NextResponse.json(
      { ok: false, error: "Nincs jogosultság a DROP objektumtakarításhoz.", code: "DROP_ADMIN_UNAUTHORIZED" },
      { status: 401, headers: dropNoStoreHeaders() },
    );
  }
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const limit = Math.max(1, Math.min(200, Number(body.limit || 50)));
    const result = await processDropObjectCleanup(limit);
    return NextResponse.json(
      { ok: true, version: "DROP 0.4.0", result },
      { status: 200, headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}
