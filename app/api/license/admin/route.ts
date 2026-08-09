import { NextRequest, NextResponse } from "next/server";
import {
  getLicenseAdminKeyFilePath,
  isLicenseAdminAuthorized,
} from "@/app/lib/license/admin-auth";
import {
  applyLicenseAdminAction,
  getLicenseAdminStore,
} from "@/app/lib/license/admin-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json(
    {
      ok: false,
      error: "Nincs jogosultság a licenckezelő admin API használatához.",
      adminKeyHint: getLicenseAdminKeyFilePath(),
    },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  return NextResponse.json(
    {
      ok: true,
      store: await getLicenseAdminStore(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (!(await isLicenseAdminAuthorized(request.headers))) return unauthorized();

  const result = await applyLicenseAdminAction(
    await request.json().catch(() => null),
  );

  return NextResponse.json(result, {
    status: result.ok ? 200 : 400,
    headers: { "cache-control": "no-store" },
  });
}
