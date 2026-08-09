import { NextRequest, NextResponse } from "next/server";
import { getDriveStorageConfigPlan } from "@/app/lib/drive/storageRuntime";
import { isLicenseAdminAuthorized } from "@/app/lib/license/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság a DIMPRO Drive Storage konfigurációs tervhez.",
      authHint: "x-dimpro-license-admin-key header szükséges.",
    },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  return NextResponse.json(getDriveStorageConfigPlan(), {
    headers: { "cache-control": "no-store" },
  });
}
